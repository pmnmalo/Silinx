// Thin REST client for the Silinx server.

import { prefKey } from './prefs.js';
import { mergeDescription } from '../../core/project-desc-merge.js';
import { VERSION } from '../../core/version.js';
import { toBase64 } from '../../core/base64.js';

// The server answers only with its token, made at every start (#2564) and given in the address it
// prints (…/#token=…); the address a launcher opens has a one-time code instead (…/#code=…, #2955: not the token,
// on the opener's command line), which the page exchanges for the token. The token is kept for this browser
// (another tab opened at the plain address has it too, until the server restarts), sent with every request.
// Only an address whose hash is the token alone, or the code alone, sets it: a link with other options (#2826) does
// not (#2829); and an address's token replaces the one kept only if the server accepts it (#2955).
const TOKEN_KEY = prefKey('silinx-token');
const store = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: t => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* not kept: this page only */ } },
};
let TOKEN = store.get();
// the capture's body as the server takes it (server/http-errors.js's CAPTURE_BODY, #4753): its own options only, not
// the core's spec, probes, top and clock the page gives the browser edition's capture (web/js/api-local.js, #5128)
export const captureBody = ({ arm, timeoutS, device } = {}) => ({ arm, timeoutS, device });
const READY = (async () => {
  let m;
  try { m = /^#(token|code)=([\w-]+)$/.exec(location.hash); } catch { return; }
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  const token = await tokenOf(m[1], m[2], fetch);
  if (token) { TOKEN = token; store.set(token); }
})();
// this page (a tab, until it is closed or reloaded): its own writes are not told back to it, but to the project's
// other pages (#3972)
const CLIENT = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const auth = (headers = {}) => ({ ...headers, 'X-Silinx-Client': CLIENT, 'X-Silinx-Version': VERSION, ...(TOKEN ? { 'X-Silinx-Token': TOKEN } : {}) });
const authed = async (headers = {}) => { await READY; return auth(headers); };

// a server of another version (#4754): it says its own (X-Silinx-Version) to a page that sent another; the page left
// open across an upgrade told once, a 'silinx-stale' event ({ page, server }) the app offers a reload on
let staleTold = false;
export function staleCheck(r) {
  const server = r?.headers?.get?.('X-Silinx-Version');
  if (server && server !== VERSION && !staleTold) {
    staleTold = true;
    globalThis.dispatchEvent?.(new CustomEvent('silinx-stale', { detail: { page: VERSION, server } }));
  }
  return r;
}
const call = async (url, opts) => staleCheck(await fetch(url, opts));

/** A zip (a Blob or bytes) in base64, for a JSON body. */
async function base64Of(zip) {
  return toBase64(zip instanceof Uint8Array ? zip : new Uint8Array(await new Response(zip).arrayBuffer()));
}

/** The token an address gives (null when refused or the server is not reached): a one-time code exchanged for it
 *  (POST /api/token), or a token the server accepts (GET /api/workspace with it). */
export async function tokenOf(kind, value, f = fetch) {
  try {
    if (kind === 'code') {
      const r = await f('/api/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: value }) });
      const j = r.ok ? await r.json() : null;
      return typeof j?.token === 'string' ? j.token : null;
    }
    const r = await f('/api/workspace', { headers: { 'X-Silinx-Token': value } });
    return r.ok ? value : null;
  } catch { return null; }
}

// a zip posted as the body (the import's, the merge's), JSON back
async function zipPost(url, zip, headers = {}) {
  const r = await call(url, { method: 'POST', headers: await authed({ 'Content-Type': 'application/zip', ...headers }), body: zip });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status });
  return j;
}
// (tagged: the answer with its revision, { body, etag }, #4726)
async function req(method, url, body, { text = false, bytes = false, headers = {}, tagged = false } = {}) {
  const opts = { method, headers: await authed(headers) };
  if (body !== undefined) {
    if (typeof body === 'string') { opts.body = body; opts.headers['Content-Type'] = 'text/plain'; }
    else { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  }
  let r;
  try { r = await call(url, opts); }
  catch { throw Object.assign(new Error('the Silinx server is not running (start it with: node bin/silinx.js serve)'), { offline: true }); }
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`, more = {};
    // (git's failures carry a hint for the console, and a conflict its files: #3195)
    try { const j = await r.json(); if (j.error) msg = j.error; if (j.hint) more.hint = j.hint; if (j.files) more.files = j.files; if (j.drawings) more.drawings = j.drawings; if (j.texts) more.texts = j.texts; if (j.resolvable !== undefined) more.resolvable = j.resolvable; if (j.existing) more.existing = j.existing; if (j.project && j.etag) Object.assign(more, { project: j.project, etag: j.etag }); } catch { /* not json */ }
    throw Object.assign(new Error(msg), { status: r.status }, more);
  }
  if (text) return r.text();
  if (bytes) return new Uint8Array(await r.arrayBuffer());
  const ct = r.headers.get('content-type') || '';
  const out = await (ct.includes('json') ? r.json() : r.text());
  return tagged ? { body: out, etag: r.headers.get('ETag') } : out;
}

// a project's description as the page read or wrote it last, and its revision (#4726): written back over that revision
// only (If-Match); refused (412: changed meanwhile by the MCP server or another tab), the page's change is merged into
// the current one (core/project-desc-merge.js) and written again, and the description the caller sent becomes it
const bases = new Map();
const baseKey = name => String(name).toLowerCase();
const keepBase = (name, etag, pj) => { if (etag && pj && typeof pj === 'object') bases.set(baseKey(name), { etag, pj: structuredClone(pj) }); };
// (the caller's object made the one written: a caller that keeps its own S.project keeps the others' changes too)
function becomes(pj, saved) {
  for (const k of Object.keys(pj)) if (k !== 'fileTree' && !(k in saved)) delete pj[k];
  Object.assign(pj, saved);
}
async function readProject(name) {
  const { body, etag } = await req('GET', `/api/projects/${enc(name)}`, undefined, { tagged: true });
  keepBase(name, etag, body);
  return body;
}
async function saveProject(name, pj) {
  let body = pj;
  for (let k = 0; ; k++) {
    const base = bases.get(baseKey(name));
    try {
      const { body: saved, etag } = await req('PUT', `/api/projects/${enc(name)}`, body, { tagged: true, headers: base ? { 'If-Match': base.etag } : {} });
      keepBase(name, etag, saved);
      if (body !== pj) becomes(pj, saved);
      return saved;
    } catch (e) {
      if (e.status !== 412 || !e.project || !base || k >= 4) throw e;
      body = mergeDescription(base.pj, body, e.project);
      keepBase(name, e.etag, e.project);
    }
  }
}

const enc = encodeURIComponent;

export const api = {
  // shared projects (#3181): this server's relay (server/collab-relay.js) opens a room with the token
  collab: true,
  collabToken: async () => { await READY; return TOKEN; },
  // (the other relays its pages may use: config.json's relay.relays, #3227)
  collabRelays: async () => (await req('GET', '/api/collab/relays')).relays,
  projects: () => req('GET', '/api/projects'),
  workspace: () => req('GET', '/api/workspace'),
  templates: () => req('GET', '/api/templates'),
  exampleFiles: name => req('GET', `/api/templates/${enc(name)}/files`),
  createProject: p => req('POST', '/api/projects', p),
  project: readProject,
  saveProject,
  trustProject: name => req('POST', `/api/projects/${enc(name)}/trust`),
  deleteProject: name => req('DELETE', `/api/projects/${enc(name)}`),
  renameProject: (name, to) => req('POST', `/api/projects/${enc(name)}/rename-project`, { to }),   // (Rename Project…, #4641)
  readFile: (name, path) => req('GET', `/api/projects/${enc(name)}/file?path=${enc(path)}`, undefined, { text: true }),
  // a file's bytes (a firmware's .elf, #5198): a Uint8Array
  readFileBytes: (name, path) => req('GET', `/api/projects/${enc(name)}/file?path=${enc(path)}&bytes=1`, undefined, { bytes: true }),
  writeFile: (name, path, text) => req('PUT', `/api/projects/${enc(name)}/file?path=${enc(path)}`, text),
  renameFile: (name, from, to) => req('POST', `/api/projects/${enc(name)}/rename`, { from, to }),
  // (trash: the user's Delete File / Delete Folder, into the workspace's .trash -> { trashed }, #3364)
  deleteFile: (name, path, { trash = false } = {}) => req('DELETE', `/api/projects/${enc(name)}/file?path=${enc(path)}${trash ? '&trash=1' : ''}`),
  sources: name => req('GET', `/api/projects/${enc(name)}/sources`),
  // KiCad's libraries, fetched by the server (#4285: a browser cannot, no CORS)
  kicadLibraries: (refresh = false) => req('GET', `/api/kicad/libraries${refresh ? '?refresh=1' : ''}`),
  kicadLibrary: id => req('GET', `/api/kicad/libraries/${enc(id)}`),
  kicadImport: (name, body) => req('POST', `/api/projects/${enc(name)}/kicad/import`, body),
  kicadCataloguePart: (name, body) => req('POST', `/api/projects/${enc(name)}/kicad/catalogue`, body),
  // a synthesis test of the project's exercise, graded on the server (#3216, server/grade-routes.js): { result }
  ngspice: (netlist) => req('POST', '/api/ngspice', { netlist }),   // (#5386, server/ngspice-routes.js)
  gradeSynthesis: (name, exercise, test) => req('POST', `/api/projects/${enc(name)}/grade/synthesis`, { exercise, test }),
  // a short link's gist (#3223): made by the server with its GitHub token
  gistAvailable: () => req('GET', '/api/gist').then(r => !!r.available, () => false),
  gistAccount: (name = null) => req('GET', `/api/gist/account${name ? `?project=${enc(name)}` : ''}`),   // (#3995: where a short link is made)
  gistList: () => req('GET', '/api/gists'),   // (#3635: the short links of the server's token)
  gistDelete: ({ ids = [], expired = false } = {}) => req('POST', '/api/gists/delete', { ids, expired }).then(r => r.deleted),
  gistSave: (design, days = 0) => req('POST', '/api/gist', { design, ...(days ? { expiresDays: days } : {}) }),
  // Open in VS Code (#4017, the server edition: server/open-editor.js): whether a page here can, and a file opened
  editorInfo: () => req('GET', '/api/editor'),
  openInEditor: (name, path = null, line = null) => req('POST', `/api/projects/${enc(name)}/editor/open`, { ...(path ? { path } : {}), ...(line ? { line } : {}) }),
  // git (#3195, the server editions: server/git-routes.js)
  gitEnabled: () => req('GET', '/api/git'),
  // (opts: ifExists, discardChanges: a project of the name opened, replaced or both kept, #4618)
  gitRepositories: () => req('GET', '/api/git/repositories'),   // (#4653)
  gitClone: (url, name = null, opts = {}) => req('POST', '/api/git/clone', { url, ...(name ? { name } : {}), ...opts }),
  gitStatus: name => req('GET', `/api/projects/${enc(name)}/git/status`),
  gitInit: (name, remote = null) => req('POST', `/api/projects/${enc(name)}/git/init`, remote ? { remote } : {}),
  gitCommit: (name, message) => req('POST', `/api/projects/${enc(name)}/git/commit`, { message }),
  gitPush: name => req('POST', `/api/projects/${enc(name)}/git/push`, {}),
  gitPull: (name, { resolve = null } = {}) => req('POST', `/api/projects/${enc(name)}/git/pull`, resolve ? { resolve } : {}),
  gitLog: (name, limit = 100) => req('GET', `/api/projects/${enc(name)}/git/log?limit=${limit}`),
  gitChecks: name => req('GET', `/api/projects/${enc(name)}/git/checks`),   // (#3194)
  gitBranches: name => req('GET', `/api/projects/${enc(name)}/git/branches`),   // (#4213)
  gitNewBranch: (name, branch) => req('POST', `/api/projects/${enc(name)}/git/branch`, { branch }),
  gitSwitch: (name, branch) => req('POST', `/api/projects/${enc(name)}/git/switch`, { branch }),
  gitMerge: (name, branch, { resolve = null } = {}) => req('POST', `/api/projects/${enc(name)}/git/merge`, { branch, ...(resolve ? { resolve } : {}) }),
  gitShow: (name, commit, path) => req('GET', `/api/projects/${enc(name)}/git/show?commit=${enc(commit)}&path=${enc(path)}`),
  devices: () => req('GET', '/api/devices'),
  toolchain: (project = null) => req('GET', `/api/toolchain${project ? `?project=${enc(project)}` : ''}`),
  saveToolchain: (cfg, project = null) => req('PUT', `/api/toolchain${project ? `?project=${enc(project)}` : ''}`, cfg),
  openStatus: name => req('GET', `/api/projects/${enc(name)}/open-status`),
  implement: (name, body) => req('POST', `/api/projects/${enc(name)}/implement`, body),
  firmware: (name, node) => req('POST', `/api/projects/${enc(name)}/firmware`, { node }),   // (an Arduino node's, #5503)
  buildPlan: name => req('GET', `/api/projects/${enc(name)}/build-plan`),   // (a System's, #5489)
  connectedBoards: name => req('GET', `/api/projects/${enc(name)}/boards`),   // (a System's nodes and their boards, #5489)
  programPlan: (name, node) => req('GET', `/api/projects/${enc(name)}/program-plan?node=${enc(node)}`),   // (a System's, #5489)
  programSystem: (name, node, chosen = {}) => req('POST', `/api/projects/${enc(name)}/program-system`, { node, chosen }),
  buildSystem: (name, node) => req('POST', `/api/projects/${enc(name)}/build`, { node }),
  // the logic analyzer's capture on the board (#3176): { job }, its result { capture, file }
  capture: (name, opts) => req('POST', `/api/projects/${enc(name)}/capture`, captureBody(opts)),
  reports: name => req('GET', `/api/projects/${enc(name)}/reports`),
  fpgaView: name => req('GET', `/api/projects/${enc(name)}/fpga-view`),
  bitinfo: name => req('GET', `/api/projects/${enc(name)}/bitinfo`),
  // (the project in the address, as every project's route, #4754)
  program: ({ project, ...body }) => (project ? req('POST', `/api/projects/${enc(project)}/program`, body) : req('POST', '/api/program', body)),
  scan: body => req('POST', '/api/jtag/scan', body),
  prom: ({ project, ...body }) => (project ? req('POST', `/api/projects/${enc(project)}/prom`, body) : req('POST', '/api/prom', body)),
  job: (id, since = 0) => req('GET', `/api/jobs/${enc(id)}?since=${since}`),
  cancelJob: id => req('POST', `/api/jobs/${enc(id)}/cancel`),
  importXise: body => req('POST', '/api/import-xise', body),
  // whole project as a zip (.xise + silinx.json + all files)
  // (backup: Export Project (.zip)…'s, a Silinx project's recorded as its back-up, #4971)
  exportZip: async (name, kind = 'xilinx', { copy = false, backup = false } = {}) => {
    const r = await call(`/api/projects/${enc(name)}/export.zip?kind=${enc(kind)}${copy ? '&copy=1' : ''}${backup ? '&backup=1' : ''}`, { headers: await authed() });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    let warnings = [];
    try { warnings = JSON.parse(decodeURIComponent(r.headers.get('X-Silinx-Warnings') || '[]')); } catch { /* none */ }
    return { blob: await r.blob(), filename: kind === 'silinx' ? `${name}-silinx.zip` : `${name}.zip`, warnings };
  },
  importZip: async (name, file) => {
    const r = await call(`/api/import-zip?name=${enc(name)}`, { method: 'POST', headers: await authed({ 'Content-Type': 'application/zip' }), body: file });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  },
  syncXise: (name, direction) => req('POST', `/api/projects/${enc(name)}/sync-xise`, { direction }),
  // Merge Contribution… (#4206): a contribution's zip (Blob) compared with the project, merged (resolve: the choices),
  // the last merge undone
  mergePreview: (name, zip) => zipPost(`/api/projects/${enc(name)}/merge-preview`, zip),
  // (the choices in the body, with the zip, not in a header: no limit of a header's size, #4754)
  mergeContribution: async (name, zip, resolve = {}, label = '') => req('POST', `/api/projects/${enc(name)}/merge`, { zip: await base64Of(zip), resolve, label }),
  undoMerge: name => req('POST', `/api/projects/${enc(name)}/undo-merge`),
  // what another process changes in the project (#2843): onEvent({ project, changes: [{ path, kind }] }) for each,
  // until the stream ends or `signal` aborts (server-sent events read through fetch: the token in a header, not in the URL)
  events: async (name, onEvent, signal) => {
    const r = await call(`/api/projects/${enc(name)}/events`, { headers: await authed(), signal });
    if (!r.ok || !r.body) throw Object.assign(new Error(`${r.status} ${r.statusText}`), { status: r.status });
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buf += dec.decode(value, { stream: true });
      let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const data = buf.slice(0, k).split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
        buf = buf.slice(k + 2);
        if (data) { try { onEvent(JSON.parse(data)); } catch { /* not an event */ } }
      }
    }
  },
};

// Poll a server job until it finishes, streaming log lines.
export async function followJob(id, onLine, { signal } = {}) {
  let since = 0, cancelled = false;
  for (;;) {
    const j = await api.job(id, since);
    for (const l of j.lines || []) onLine(l);
    since = j.next ?? since + (j.lines?.length || 0);
    if (j.status !== 'running') return j;
    // (once: the job is told to stop, then followed to its end)
    if (signal?.aborted && !cancelled) { cancelled = true; await api.cancelJob(id).catch(() => {}); }
    await new Promise(r => setTimeout(r, 350));
  }
}
