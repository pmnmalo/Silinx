// Silinx HTTP server: static web UI, shared core modules and the REST API.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as P from './projects.js';
import { withPlaces } from './project-places.js';
import { orderExamples } from '../core/examples.js';
import { offeredExamples } from '../core/project-kind.js';
import { importMapPackages } from './import-map.js';
import { contentSecurityPolicy, inlineScriptHashes, relaySources } from './csp.js';
import { configDir, relayConfig } from './toolchain.js';
import { createProjectWatcher } from './project-watch.js';
import { startAutoVersions } from './versions.js';
import { listJobs } from './jobs.js';
import { createOpenCodes, tokenProof } from './open-code.js';
import { launchTarget } from './open-page.js';
import { tightenConfigFolder, tightenedMessage } from './config-folder.js';
import { attachRelay } from './collab-relay.js';
import { partsScope } from './parts-scope.js';
import { sendError } from './http-errors.js';
import { channelScript } from './build-channel.js';
import { VERSION } from '../core/version.js';
import { ISOLATION_HEADERS } from '../core/cross-origin.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// (an error with no status that is the system's or Node's own, whose message names the server's paths: "internal server
// error", as the final handler answers, #3537; the envelope every router answers with, its hint and details, #4753)
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).then(
  out => { if (out !== undefined && !res.headersSent) res.json(out); },
  err => sendError(res, err),
);

const cspCache = new Map();
/** The Content-Security-Policy of a page of web/ (null if it is not one): its inline scripts by hash. */
export function pageCsp(file) {
  if (!file.startsWith(path.join(ROOT, 'web') + path.sep)) return null;
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  // (the other relays config.json lets its pages use, #3227: connected to by these only)
  const relays = relayConfig().relays;
  const hit = cspCache.get(file);
  if (hit && hit.mtime === st.mtimeMs && hit.relays === relays.join(' ')) return hit.csp;
  const csp = contentSecurityPolicy({ hashes: inlineScriptHashes(fs.readFileSync(file, 'utf8')), connect: relaySources(relays) });
  cspCache.set(file, { mtime: st.mtimeMs, relays: relays.join(' '), csp });
  return csp;
}

/** The CSP of every file but the scripts served from outside web/ (#4172): nothing runs in it as a page, nothing loads. */
export const ASSET_CSP = "default-src 'none'; sandbox";
// (a document a browser would show: not one of the app's assets)
const ASSET_DOCUMENT = /\.(x?html?|svg|xml|xsl|pdf)$/i;
const decodedPath = req => { try { return decodeURIComponent(req.path); } catch { return req.path; } };

/** A loopback address (the server only reachable from this machine). */
const isLoopback = host => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(host).toLowerCase()) || /^127\./.test(String(host)) || /^::ffff:127\./.test(String(host));

export async function createApp({ host = '127.0.0.1', token = null, codes = createOpenCodes(), relay = relayConfig() } = {}) {
  const app = express();
  app.use(partsScope);   // (each request its own project parts, #4294)
  // The API changes files and runs the ISE flow: only the Silinx page itself may call it.
  // A request from another web origin (a malicious page in the same browser) is refused, and when
  // bound to localhost the Host header must be local too (DNS rebinding). With a token (`serve` makes one
  // at every start, on every address, #2564), the API answers only the requests that carry it
  // (X-Silinx-Token; printed in the URL at start-up): another user of this computer, another machine, or a
  // page rebinding its name to this one, has none. Never in a query string (#3045: an address stays in the
  // browser's history, in a shell's and in proxies' logs; the page downloads an export with the header).
  // Without a token (tests, an app embedding the server) only loopback is allowed.
  // Two requests need no token (#2955): the page a launcher opened exchanges its one-time code for the token
  // (POST /api/token, from the page itself: its Origin required), and a second launch asks for the proof that
  // this server holds the token of its file (GET /api/proof, an HMAC of the launcher's nonce).
  const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  const exposed = !isLoopback(host);
  if (exposed && !token) throw new Error('a server on a non-loopback address needs a token');
  const digest = s => crypto.createHash('sha256').update(s).digest();
  const tokenOk = t => typeof t === 'string' && crypto.timingSafeEqual(digest(t), digest(token));
  app.locals.openCode = () => codes.issue();
  const tokenless = req => (req.method === 'POST' && req.path === '/token') || (req.method === 'GET' && req.path === '/proof');
  app.use('/api', (req, res, next) => {
    // never cached (#1434): a project's text would stay in the browser's disk cache after the project is deleted
    res.set('Cache-Control', 'no-store');
    // (a page of another version, X-Silinx-Version its own: told the server's, before its token is checked, so that a
    // page left open across an upgrade offers a reload rather than a refusal, #4754; to a client that names no version,
    // no word of the server's software, #1236)
    const pageVersion = req.get('X-Silinx-Version');
    if (pageVersion && pageVersion !== VERSION) res.set('X-Silinx-Version', VERSION);
    const hostName = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    if (!exposed && hostName && !LOCAL.has(hostName) && hostName !== String(host).toLowerCase()) return res.status(403).json({ error: 'forbidden host' });
    if (token && !tokenless(req) && !tokenOk(req.headers['x-silinx-token']))
      return res.status(403).json({ error: 'this Silinx server needs its token: open the URL it printed at start-up' });
    // a request another site's page made (an <img>, a link, a form: the browser says so in
    // Sec-Fetch-Site) is refused, a GET too: some GETs write a file or start a process; a page of the same site on
    // another port or subdomain ('same-site') is another origin too (#4739)
    if (['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) return res.status(403).json({ error: 'cross-site request refused' });
    if (tokenless(req) && req.method === 'POST' && !req.headers.origin) return res.status(403).json({ error: 'cross-origin request refused' });
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin) {
      let oh = '';
      try { oh = new URL(req.headers.origin).host.toLowerCase(); } catch { /* invalid origin */ }
      if (oh !== String(req.headers.host || '').toLowerCase()) return res.status(403).json({ error: 'cross-origin request refused' });
    }
    next();
  });
  // the relay of shared projects (#3181, server/collab-relay.js): on the server that app.listen makes, behind the same
  // checks of the host and the origin; a room opened with the token only (a follower joins one with its link). With
  // config.json's relay (#3227): the pages of its origins let in on the relay's endpoints too (never the API's), and its
  // key opening a room as the token does
  const relayKeyOk = t => !!relay.key && typeof t === 'string' && crypto.timingSafeEqual(digest(t), digest(relay.key));
  const listen = app.listen.bind(app);
  app.listen = (...a) => app.locals.serveOn(listen(...a));
  // (an HTTPS server made by startServer, #4739, has the relay too)
  app.locals.serveOn = srv => {
    app.locals.relay = attachRelay(srv, {
      allowed: req => {
        const hostName = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
        if (!exposed && hostName && !LOCAL.has(hostName) && hostName !== String(host).toLowerCase()) return 'forbidden host';
        if (req.headers.origin) {
          let oh = '';
          try { oh = new URL(req.headers.origin).host.toLowerCase(); } catch { /* invalid origin */ }
          if (oh !== String(req.headers.host || '').toLowerCase() && !relay.origins.includes(req.headers.origin)) return 'cross-origin request refused';
        }
        return null;
      },
      tokenOk: t => !token || tokenOk(t) || relayKeyOk(t),
    });
    return srv;
  };
  // the open projects watched (#2843): what another process changes in them is told to the page; this server's
  // own changes are not (a request that may write holds its project while it runs, and a run of its own too)
  const watcher = createProjectWatcher({
    dirOf: P.projectDir,
    busy: name => listJobs().some(j => j.status === 'running' && String(j.meta?.project || '').toLowerCase() === name.toLowerCase()),
  });
  app.locals.watcher = watcher;
  // (export.xise writes nothing since #1432, #4753; a Silinx zip given out, export.zip?copy=1, writes the project's id the
  // first time, a copy's origin, #4205: its own, not told to the page as a change made outside Silinx, #5252)
  const WRITING_GET = /^\/projects\/[^/]+\/(?:fpga-view|export\.zip)$/;
  // (a pull writes what GitHub had, not what the page sent: told to the page, its open documents read again, #3195)
  // (a version restored too, #5740)
  const TOLD = /^\/projects\/[^/]+\/(?:git\/pull|versions\/[^/]+\/restore)$/;
  // (the requests whose writes are all recorded, server/own-writes.js: another process's changes meanwhile told, #4726)
  const KNOWN = /^(PUT \/projects\/[^/]+(\/file)?|DELETE \/projects\/[^/]+\/file|POST \/projects\/[^/]+\/(rename|trust)|GET \/projects\/[^/]+\/export\.zip)$/;
  // (an import's project is the one it makes, ?name=, never a project named import-zip, #4754; import-xise's name is in its
  // body: no lock, as a new project's)
  const IMPORT = /^\/(?:projects\/)?import-(?:zip|xise)$/;
  app.use('/api', (req, res, next) => {
    const m = IMPORT.test(req.path) ? (typeof req.query.name === 'string' && req.query.name ? [null, encodeURIComponent(req.query.name)] : null) : /^\/projects\/([^/]+)/.exec(req.path);
    if (m && !TOLD.test(req.path) && (!['GET', 'HEAD'].includes(req.method) || WRITING_GET.test(req.path))) {
      let name = '';
      try { name = decodeURIComponent(m[1]); } catch { /* a bad name: refused by its route */ }
      // (the page that asked: told to the others, and its request after another page's on the project, #3972)
      let ended = false;
      res.once('close', () => { ended = true; });
      return watcher.acquire(name, req.get('X-Silinx-Client'), { known: KNOWN.test(`${req.method} ${req.path}`) }).then(release => {
        res.once('finish', release);
        res.once('close', release);
        if (ended) release();   // (the page gone while it waited)
        next();
      }, next);
    }
    next();
  });
  // (a merge's JSON carries its zip, in base64: read by its route, server/merge-routes.js, up to the zip's own limit, #4754)
  const jsonBody = express.json({ limit: '20mb' }), OWN_JSON = /^\/projects\/[^/]+\/merge$/;
  app.use('/api', (req, res, next) => (OWN_JSON.test(req.path) ? next() : jsonBody(req, res, next)));
  app.use('/api', express.text({ type: 'text/*', limit: '20mb' }));

  // Content-Security-Policy of the pages: scripts only from the server itself (and the pages' own
  // inline scripts, by their hashes), no plug-ins, no framing; so a script injected into a page
  // cannot run and reach the API above
  // every response (#1236): served as the type it says (a project's text is never taken for a script), no
  // address sent to another site, and no word of the server's software; the page cross-origin isolated (#5648: COOP and
  // COEP, core/cross-origin.js), its workers given SharedArrayBuffer and Atomics.wait
  app.disable('x-powered-by');
  app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...ISOLATION_HEADERS }); next(); });
  // (on the file served, so however the URL spells it)
  const setHeaders = (res, file) => { if (/\.html$/i.test(file)) { const csp = pageCsp(file); if (csp) res.set('Content-Security-Policy', csp); } };
  // the build's channel for the page (#5202: web/build-channel.js, the server's own)
  app.get('/build-channel.js', (req, res) => res.type('text/javascript').set('Cache-Control', 'no-store').send(channelScript()));
  app.use('/', express.static(path.join(ROOT, 'web'), { setHeaders }));
  // the folders outside web/ (the code and the packages it loads, which ship files of their own: a test page, a README)
  // on the page's origin, which holds the token (#4172): what the app loads from them, scripts, WebAssembly and data;
  // no document nor a folder's index, and a CSP that runs nothing on every response but a script's (a worker's script, as
  // ELK's, runs under its response's CSP; a script is never shown as a page: nosniff)
  const asset = dir => [(req, res, next) => (ASSET_DOCUMENT.test(decodedPath(req)) ? res.status(404).end() : next()),
    express.static(dir, { index: false, redirect: false, setHeaders: (res, file) => { if (!/\.m?js$/i.test(file)) res.set('Content-Security-Policy', ASSET_CSP); } })];
  app.use('/core', asset(path.join(ROOT, 'core')));
  // the toolchain's package (silinx-fpga, #1677): its code, which core/'s re-exports import
  app.use('/packages/silinx-fpga/src', asset(path.join(ROOT, 'packages/silinx-fpga/src')));
  // the HDL front end's package (silinx-hdl, #1710): its code, which core/'s re-exports import
  app.use('/packages/silinx-hdl/src', asset(path.join(ROOT, 'packages/silinx-hdl/src')));
  // the PIC24 emulator's package (silinx-pic24, #5480): its code, which a System's PIC24 node imports (#5484)
  // (its .js files only: what the page imports, nothing else of the folder)
  app.use('/packages/silinx-pic24/src', (req, res, next) => (/^(?!.*\.\.)\/[\w./-]+\.js$/.test(decodedPath(req)) ? next() : res.status(404).end()), asset(path.join(ROOT, 'packages/silinx-pic24/src')));
  app.use('/vendor/elk', asset(path.join(ROOT, 'node_modules/elkjs/lib')));
  // the editor's ES modules (CodeMirror 6): the packages the import map of web/index.html names, only
  // (avr8js's ES modules import each other with no extension, './cpu/cpu', '..': resolved as a bundler does, the Systems
  // System's AVR, #4701)
  app.use('/vendor/npm/avr8js/dist/esm', (req, res, next) => {
    const p = decodedPath(req);
    if (!/\.\w+$/.test(p)) req.url = p.endsWith('/') ? `${p}index.js` : `${p}.js`;
    next();
  });
  for (const pkg of importMapPackages()) {
    app.use(`/vendor/npm/${pkg}`, asset(path.join(ROOT, 'node_modules', pkg)));
  }
  // a Pico's firmware (#5494): MicroPython's .uf2 and the RP2040's bootrom, downloaded once by the local server
  // (server/rp2040-firmware.js), not shipped
  app.get('/vendor/rp2040/:file', async (req, res) => {
    const { rp2040Path } = await import('./rp2040-firmware.js');
    try { res.sendFile(await rp2040Path(req.params.file)); } catch (e) { res.status(/^no RP2040 firmware file/.test(e.message) ? 404 : 502).type('text/plain').send(e.message); }
  });
  // Silinx's MicroPython build for an ESP32 node's JSPI back end (#5658, server/micropython-jspi.js): downloaded once,
  // not shipped
  app.get('/vendor/micropython-jspi/:file', async (req, res) => {
    const { micropythonJspiPath } = await import('./micropython-jspi.js');
    try { res.sendFile(await micropythonJspiPath(req.params.file)); } catch (e) { res.status(/^no file /.test(e.message) ? 404 : 502).type('text/plain').send(e.message); }
  });
  // MicroPython's WebAssembly port (#5495): an ESP32 node's engine, its settrace build, in its Worker (web/js/esp32-worker.js)
  app.use('/vendor/micropython-wasm', asset(path.join(ROOT, 'node_modules/@micropython/micropython-webassembly-pyscript')));
  // Yosys compiled to WebAssembly (YoWASP): the open synthesis runs in the browser (web/js/yosys-worker.js)
  app.use('/vendor/yowasp-yosys', asset(path.join(ROOT, 'node_modules/@yowasp/yosys')));
  // nextpnr in WebAssembly, its chip databases beside its bundle (the browser edition's nextpnr engine, #2136)
  app.use('/vendor/nextpnr-spartan', asset(path.join(ROOT, 'node_modules/@silinx/nextpnr-himbaechel-spartan3e')));
  // (the Spartan-6's, #2288)
  app.use('/vendor/nextpnr-spartan6', asset(path.join(ROOT, 'node_modules/@silinx/nextpnr-himbaechel-spartan6')));
  app.use('/vendor/nextpnr-xc7', asset(path.join(ROOT, 'node_modules/@silinx/nextpnr-himbaechel-xc7')));   // (the 7-series', #3143)
  // (the iCE40's nextpnr and icepack, when installed: not in the release zip, #2295)
  app.use('/vendor/nextpnr-ice40', asset(path.join(ROOT, 'node_modules/@yowasp/nextpnr-ice40')));
  app.use('/vendor/nextpnr-ecp5', asset(path.join(ROOT, 'node_modules/@yowasp/nextpnr-ecp5')));   // (the ECP5's, #2302)
  app.use('/vendor/nextpnr-himbaechel-gowin', asset(path.join(ROOT, 'node_modules/@yowasp/nextpnr-himbaechel-gowin')));   // (the Gowin's, #2303)
  app.use('/vendor/nextpnr-himbaechel-gatemate', asset(path.join(ROOT, 'node_modules/@yowasp/nextpnr-himbaechel-gatemate')));   // (the GateMate's, #2431)

  const api = express.Router();
  // the token for a one-time code of a launcher's address (#2955); a code for the address a second launch opens
  const noToken = () => Object.assign(new Error('this Silinx server has no token'), { status: 404 });
  api.post('/token', wrap(req => {
    if (!token) throw noToken();
    if (!codes.redeem(req.body?.code)) throw Object.assign(new Error('this address has expired: open the URL Silinx printed at start-up'), { status: 403 });
    return { token };
  }));
  api.post('/open-code', wrap(() => { if (!token) throw noToken(); return { code: codes.issue() }; }));
  api.get('/proof', wrap(req => {
    if (!token) throw noToken();
    const nonce = String(req.query.nonce || '');
    if (!/^[\w-]{16,128}$/.test(nonce)) throw Object.assign(new Error('a nonce is required'), { status: 400 });
    return { proof: tokenProof(token, nonce) };
  }));
  api.get('/projects', wrap(async () => withPlaces(await P.listProjects())));   // (with where each is kept, #4314)
  // where the projects are kept: the Start page says it (#1297)
  api.get('/workspace', wrap(() => ({ folder: P.workspaceDir() })));
  // the other relays this server's pages may share and follow through (config.json's relay.relays, #3227)
  api.get('/collab/relays', wrap(() => ({ relays: relayConfig().relays })));
  api.post('/projects', wrap(req => P.createProject(req.body || {})));
  // (its revision, ETag: a PUT with If-Match writes over that one only, else a 412 with the current one, #4726)
  api.get('/projects/:p', wrap(async (req, res) => {
    const pj = await P.readProject(req.params.p);
    res.set({ ETag: P.etagOf(pj), 'Cache-Control': 'no-store' });
    return { ...pj, fileTree: await P.fileTree(req.params.p) };
  }));
  api.put('/projects/:p', wrap(async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw Object.assign(new Error('expected a JSON project object'), { status: 400 });
    try {
      const pj = await P.writeProject(req.params.p, req.body, { ifMatch: req.get('If-Match') || null });
      res.set('ETag', P.etagOf(pj));
      return pj;
    } catch (e) {
      if (e.status !== 412) throw e;
      res.status(412).set('ETag', e.etag).json({ error: e.message, project: e.project, etag: e.etag });
    }
  }));
  // the user trusts a project from outside (#2830, core/trust.js): the interface's Trust Project, no MCP tool
  api.post('/projects/:p/trust', wrap(req => P.trustProject(req.params.p)));
  api.delete('/projects/:p', wrap(async req => { await P.deleteProject(req.params.p); return { ok: true }; }));
  // Rename Project… (#4641, the MCP's rename_project)
  api.post('/projects/:p/rename-project', wrap(async req => (await import('./project-rename.js')).renameProjectChecked(req.params.p, req.body?.to)));
  api.get('/projects/:p/file', wrap(async (req, res) => {
    // (bytes=1: its bytes, a firmware's .elf, #5198)
    if (req.query.bytes === '1') { const b = await P.readFileBytes(req.params.p, req.query.path); return res.type('application/octet-stream').send(Buffer.from(b.buffer, b.byteOffset, b.byteLength)); }
    const text = await P.readFile(req.params.p, req.query.path);   // read first: an error must go out as JSON, not text/plain
    res.type('text/plain').send(text);
  }));
  api.put('/projects/:p/file', wrap(async req => {
    // a text body, or JSON's text; anything else (no content type, octet-stream, JSON without text) is P.writeFile's
    // 400, never an empty file (#4727)
    const body = typeof req.body === 'string' ? req.body : req.body?.text;
    await P.writeFile(req.params.p, req.query.path, body);
    return { ok: true };
  }));
  api.post('/projects/:p/rename', wrap(async req => {
    const { from, to } = req.body || {};
    if (!from || !to) throw Object.assign(new Error('from and to are required'), { status: 400 });
    return P.renameFile(req.params.p, String(from), String(to));
  }));
  // (trash=1: the user's Delete File / Delete Folder, into the workspace's .trash, #3364)
  api.delete('/projects/:p/file', wrap(async req => {
    const { trashed } = await P.deleteFile(req.params.p, req.query.path, { trash: req.query.trash === '1', mustExist: true });
    return { ok: true, ...(trashed ? { trashed } : {}) };
  }));
  // what changes in the project's folder made by another process (#2843): server-sent events, one { project,
  // changes: [{ path, kind }] } each (a comment now and then keeps the stream open through proxies)
  api.get('/projects/:p/events', wrap(async (req, res) => {
    await P.readProject(req.params.p);   // (a project that does not exist: its error, as JSON)
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    res.write(': watching\n\n');
    const off = watcher.subscribe(req.params.p, ev => res.write(`data: ${JSON.stringify(ev)}\n\n`), { client: req.get('X-Silinx-Client') });
    const beat = setInterval(() => res.write(': \n\n'), 25_000);
    beat.unref?.();
    res.on('close', () => { clearInterval(beat); off(); });
  }));
  api.get('/projects/:p/sources', wrap(req => P.readSources(req.params.p)));
  // the examples, in the order the interface lists them (gates first: core/examples.js)
  // (the System example only where Systems are on, #5202)
  api.get('/templates', wrap(() => offeredExamples(orderExamples(fs.readdirSync(P.EXAMPLES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(P.EXAMPLES_DIR, d.name, 'silinx.json')))
    .map(d => d.name)))));
  // an example's files (#2826: a link to it opens the project of that name as it is when it has the same files)
  api.get('/templates/:name/files', wrap(req => P.exampleFiles(req.params.name)));

  // Implementation (ISE) + programming routes live in impl-routes.js.
  const { registerImplRoutes } = await import('./impl-routes.js');
  registerImplRoutes(api, { wrap, projects: P });
  // git (#3195): a project in a GitHub repository
  const { registerGitRoutes } = await import('./git-routes.js');
  registerGitRoutes(api);
  // automatic grading's synthesis tests (#3216)
  const { registerGradeRoutes } = await import('./grade-routes.js');
  registerGradeRoutes(api, { wrap, projects: P });
  // ngspice (#5386): a circuit's analog side, its Try it's run again
  const { registerNgspiceRoutes } = await import('./ngspice-routes.js');
  registerNgspiceRoutes(api, { wrap, projects: P });
  // Open in VS Code (#4017): a project's file in the user's editor, on this computer only
  const { registerEditorRoutes } = await import('./open-editor.js');
  registerEditorRoutes(api, { wrap });

  app.use('/api', api);
  // an error no route answered (a bad body, a bad address): its message, never a stack trace with the server's paths
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: status < 500 ? err.message : 'internal server error' });
  });
  return app;
}

/** The file that holds the token of the server on `port` while it runs: a second `serve` (the launcher
 *  double-clicked twice) opens the running server with it; readable by its owner only. */
export const tokenFile = port => path.join(configDir(), `server-${port}.token`);

/** Why a server on `host` cannot start as asked (#4739): on another computer's reach over plain HTTP, its token would
 *  cross the network in clear (a classroom's Wi-Fi), unless TLS is given or the user says so; null when it can. */
export function exposedRefusal(host, { tls = null, insecureHttp = false } = {}) {
  if (isLoopback(host) || tls || insecureHttp) return null;
  return `serve --host ${host}: other computers would reach this server over plain HTTP, and its token, which gives the whole server, `
    + 'would cross the network unencrypted. Give a certificate (--tls-cert <file.pem> --tls-key <file.pem>), '
    + 'or add --insecure-http to accept it (a network you trust)';
}

// (#4759: a promise rejected that nothing handles, in a route, a relay's room or a watcher, said on the console; the
// server, and every share it runs, goes on rather than end with it, as Node does by default)
let strayKept = false;
const keepOnStray = () => {
  if (strayKept) return;
  strayKept = true;
  process.on('unhandledRejection', e => console.error(`ERROR: an unexpected failure (the server goes on): ${e?.stack || e}`));
};

// tls: { cert, key } (PEM) for HTTPS; insecureHttp: plain HTTP on a non-loopback address accepted (#4739)
export async function startServer({ port = 8642, host = '127.0.0.1', tls = null, insecureHttp = false } = {}) {
  const refusal = exposedRefusal(host, { tls, insecureHttp });
  if (refusal) throw Object.assign(new Error(refusal), { code: 'SILINX_EXPOSED_HTTP' });
  keepOnStray();
  // a token for the API, made anew at every start, on loopback too (#2564): another user of this
  // computer reaches 127.0.0.1 as well
  const token = crypto.randomBytes(18).toString('base64url');
  const app = await createApp({ host, token });
  P.emptyTrash().catch(() => {});   // (the .trash's old entries, at every start too, #4758)
  const scheme = tls ? 'https' : 'http';
  const https = tls && await import('node:https');
  return new Promise((resolve, reject) => {
    // Express 5 calls the listen callback with the error too (a port in use): not "running"
    const onListening = err => {
      if (err) return reject(err);
      const real = srv.address().port;
      const file = tokenFile(real);
      // (the configuration folder its owner's only, one made before #2564 too, #3410)
      const tightened = tightenedMessage(tightenConfigFolder());
      if (tightened) console.log(tightened);
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        fs.rmSync(file, { force: true });   // written anew, so the mode below holds
        fs.writeFileSync(file, token, { mode: 0o600 });
        srv.on('close', () => fs.rmSync(file, { force: true }));
      } catch { /* no configuration folder: a second launch only says it is running */ }
      const shown = ['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host;
      srv.silinxUrl = `${scheme}://${shown}:${real}/#token=${token}`;
      // the address to open in the browser: a one-time code, not the token, on the opener's command line (#2955)
      srv.silinxOpenUrl = () => `${scheme}://${shown}:${real}/#code=${app.locals.openCode()}`;
      console.log(`Silinx running at ${scheme}://${host}:${port}  (workspace: ${P.workspaceDir()})`);
      if (!isLoopback(host)) {
        console.log(`WARNING: listening on ${host}, not only on this machine. Other computers that can reach this port need the address below (with its token);`);
        console.log('         anyone who has it can change your projects and run the toolchain. Use the default (127.0.0.1) unless you need this.');
        if (!tls) console.log('         Over plain HTTP (--insecure-http): the token crosses the network unencrypted.');
        console.log(`         ${scheme}://${['0.0.0.0', '::'].includes(host) ? '<this computer>' : host}:${real}/#token=${token}`);
      } else console.log(`Open it at ${srv.silinxUrl}`);
      srv.silinxToken = token;
      resolve(srv);
    };
    const srv = tls ? app.locals.serveOn(https.createServer({ cert: tls.cert, key: tls.key }, app)).listen(port, host, () => onListening())
      : app.listen(port, host, onListening);
    srv.on('error', reject);
    // (the projects' automatic versions, #5740)
    srv.on('close', startAutoVersions(P));
  });
}

/** The opener's command for `url`: [cmd, args]; an address with its one-time code (or a token) as the path of a page
 *  of the configuration folder that leads to it, readable by its owner only, never on the command line (#3409). */
export function openerCommand(url, { platform = process.platform, target = launchTarget } = {}) {
  let to = url;
  try { to = target(url); } catch { /* no configuration folder: the address as it is */ }
  // Windows: url.dll's handler takes the page as one argument; cmd's start re-read `&`, `^` and `%` in it (#4743)
  return platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', to]]
    : platform === 'darwin' ? ['open', [to]] : ['xdg-open', [to]];
}

/** Open a URL in the default browser (best effort). */
export async function openBrowser(url) {
  // SILINX_NO_BROWSER=1: only print the URL (tests run the launchers this way; also for a server)
  if (process.env.SILINX_NO_BROWSER) return;
  const { spawn } = await import('node:child_process');
  const [cmd, args] = openerCommand(url);
  try {
    // no opener installed (headless Linux without xdg-open): spawn reports ENOENT as an 'error' event,
    // which would crash the process without a listener
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => { /* no browser: the URL is printed */ });
    child.unref();
  } catch { /* no browser: the URL is printed */ }
}
