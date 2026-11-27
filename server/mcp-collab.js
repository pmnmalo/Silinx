// The MCP server's tools of a shared project (#3181, server/mcp.js, #2674), as the interface's Share Project… and the
// opening of a link to follow: share_project shares a project of the workspace live through the relay of
// a running Silinx server (server/collab-relay.js; its token read as a second launch reads it, server/server.js
// tokenFile), its files published from the disk and kept as they change (the project watcher, #2843);
// follow_project follows a link, read only, and gives the project's files, who is in it, the owner's view and a file's
// text. Both through core/collab-*.js, the page's own modules: the document, the encryption, the protocol. With editors
// (#3182): share_project gives an editor's link too, and writes what an editor changes in a text file to the disk
// (through the import gate, the project untrusted, #3355; anything else an editor changes undone: the project published
// again from the disk); follow_project with an editor's
// link writes a file's text, merged as one participant's edit. The drawings edited live (#3183, every drawing: state diagrams, truth tables, ASM charts, Petri nets, schematics):
// share_project writes what an editor changes in one to the disk (the gate, the project untrusted) and its HDL made again
// from it; follow_project reads one as merged (and its Check), and writes one as this participant's edit, merged per
// object and per field with the others' (core/collab-model.js). A follow's connection lost is made again (#3835): its
// result says so meanwhile (connected: false), a write merged then and sent once it is back; a share's, its room resumed
// on the relay (its status: connected: false meanwhile). follow_project gives the owner's activity too (#4002): where its
// page is (its open documents, the one in front, its Design view, its task) and its Design pane's selection, the
// processes it runs (their marks, the end of the run's log), its simulations (their time, view and forces), its Board Emulators (their inputs, run, rate); a project share_project shares sends the runs run_process
// makes of it (sharedRun).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT } from './mcp-util.js';
import { projectDoc, publishProject, sharedPath, docProject, docFile, gatedDocFile, watchDoc, editFile, gateEdit } from '../core/collab-doc.js';
import { isTrusted, markEditedByEditor } from '../core/trust.js';
import { applyEdits, sourceChange, setDescription, editQueue } from '../core/collab-files.js';
import { relayConfig } from './toolchain.js';
import { liveRelay } from './mcp-relay.js';
import { SITE_URL } from '../core/design-link.js';
import { liveDrawing, drawingText, sameDrawing, drawingModel, drawingPathsOf, putDrawing, pruneDrawing, revertDrawing, withView, viewFields, drawingKind } from '../core/collab-model.js';
import { wireStyleOf } from '../core/wire-style.js';
import { checkDrawing } from './mcp-check.js';
import { shareRoom, followRoom } from '../core/collab-client.js';
import { followLink, parseFollowLink, relayUrl, withTop } from '../core/collab-link.js';
import { relayMeeting } from '../core/collab-meet-relay.js';
import { meetOwner } from '../core/collab-meet.js';
import { shareMode, withPaths, MODE_WORDS } from '../core/collab-paths.js';
import { MODULE_RE, viewProblem } from '../core/design-link.js';
import { qrSvg } from '../core/qr.js';
import { followedUi, followedDesign, activityLines } from '../core/collab-channels.js';
import { selectionWords } from '../core/collab-select.js';
import { followedCopy, copyName } from '../core/collab-keep.js';
import { runsActivity, followedRuns, runLines, runMessages, redact, redactAll } from '../core/collab-runs.js';
import { ownerSecrets } from './owner-secrets.js';
import { followedSim, simLines } from '../core/collab-sim.js';
import { followedEmu, emuLines } from '../core/collab-emu.js';
import { followedTry, tryLines } from '../core/collab-try.js';
import { severityOf } from '../core/log-severity.js';
import { ownerVersions, followVersion } from './mcp-collab-versions.js';

const DEFAULT_SERVER = 'http://127.0.0.1:8642';
const ARRIVE_MS = 15_000;
const shares = new Map();    // project -> { session, link, server, mode, off }
/** Whether this MCP server shares the project `name` live (#4641: rename_project refuses it then). */
export const sharedHere = name => [...shares].some(([n, c]) => n.toLowerCase() === String(name).toLowerCase() && !c.session.closed());
const follows = new Map();   // room:role (an editor's: its key too) -> { session, link }

const WebSocketImpl = async () => globalThis.WebSocket || (await import('ws')).WebSocket;
const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);

// a Silinx address (http(s), its origin only): this computer's (loopback), or a relay the user's settings name
// (relay.relays in config.json, #3363: never a host an assistant chose alone, a network's or another site's)
function serverOf(server = DEFAULT_SERVER, what = 'server', own = null) {
  let u;
  try { u = new URL(server); } catch { throw toolError(`server: '${server}' is not an address`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw toolError(`server: '${server}' is not an http(s) address`);
  if (!LOOPBACK.has(u.hostname.toLowerCase()) && !relayConfig().relays.includes(u.origin) && u.origin !== own) {
    throw toolError(`${what}: ${u.origin} is neither a Silinx server on this computer nor a relay the user's settings name (relay.relays in config.json): the MCP server shares and follows through those only`);
  }
  return u.origin;
}
// the token of the Silinx server on this computer at that port (none: a server started without one, as the tests'),
// sent only to that server: a loopback address (127.0.0.1, [::1], localhost), and the server there proving that it holds
// the token (server/open-code.js holdsToken, the token never sent for it); any other host: its relay's key (key)
const LOOPBACK = new Set(['127.0.0.1', '[::1]', 'localhost']);
async function tokenOf(origin) {
  const u = new URL(origin);
  if (!LOOPBACK.has(u.hostname.toLowerCase())) throw toolError(`server: ${origin} is not a Silinx server on this computer: sharing through another computer's relay needs that relay's key (key); this computer's server token is sent only to its own server`);
  const { tokenFile } = await import('./server.js');
  const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  let token;
  try { token = fs.readFileSync(tokenFile(port), 'utf8').trim(); } catch { return null; }
  const { holdsToken } = await import('./open-code.js');
  if (!await holdsToken(origin, token)) throw toolError(`server: the server at ${origin} is not the Silinx server whose token this computer keeps for port ${port} (another program, or one started since): not shared; start Silinx again (silinx serve)`);
  return token;
}

// the project from the disk: { project (silinx.json, as the API gives it), files: { path: text } }
async function readAll(name) {
  const project = await P.readProject(name);
  const files = {};
  for (const rel of await P.fileTree(name)) {
    if (!sharedPath(rel)) continue;
    try { files[rel] = await fsp.readFile(P.safeJoin(P.projectDir(name), rel), 'utf8'); } catch { /* unreadable: left out */ }
  }
  return { project, files };
}

// the HDL files the project's drawings generate (never an editor's to change: the drawing's)
function generated(doc) {
  const out = new Set();
  for (const [path, yt] of doc.getMap('files')) {
    if (!/\.json$/.test(path)) continue;
    try { const g = JSON.parse(yt.toString())?.generatedFile; if (typeof g === 'string') out.add(g); } catch { /* not a drawing */ }
  }
  return out;
}
// an editor's changes, at the owner's (#3182, core/collab-files.js applyEdits): a text file's, written to the disk; a
// file created, deleted or renamed and the project's description (#4418), written too (a deleted file into the
// workspace's .trash); anything else, undone (the project published again from the disk, the owner's). The text passes
// the import gate first, as any file from outside, and the project is untrusted before it is written (#3355): an
// editor's link reaches no ISE nor board until the user trusts it again; what the gate refuses is not written (undone
// too), its reason among the share's warnings (`warn`).
function ownerWrites(name, doc, owner, warn, bases) {
  const offDrawings = drawingWrites(name, doc, owner, warn, bases);
  const store = {
    read: async () => ({ json: await P.readProject(name), fileTree: await P.fileTree(name) }),
    write: (path, text) => P.writeAtomic(P.safeJoin(P.projectDir(name), path), text),   // (#3183: a reader never sees it half-written)
    remove: path => P.deleteFile(name, path, { trash: true }),
    saveJson: json => P.writeProject(name, json),
    untrust: async () => { if (isTrusted(await P.readProject(name))) await P.updateProject(name, markEditedByEditor); },
  };
  // (#4110: one change written after the other, each file's text as the document has it then; #4418: the project
  // published again from the disk once none waits, the watcher's publishing too)
  const apply = async ev => {
    const r = await applyEdits(doc, ev, store, { generated: generated(doc), warn });
    const texts = ev.changes.filter(c => c.kind === 'changed' && r.written.includes(c.path)).length;
    return !!(r.undone.length || r.refused || r.project || r.removed.length || r.written.length > texts);
  };
  const queue = editQueue(apply, async fresh => { try { const all = await readAll(name); if (fresh()) publishProject(doc, { ...all, owner, bases }); } catch { /* the next change */ } });
  const offFiles = watchDoc(doc, ev => queue.push(ev));
  return { off: () => { offFiles(); offDrawings(); }, queue };
}
// an editor's changes of the drawings edited live (#3183): each one's merged model written to the disk (the gate, the
// project untrusted, as a text file's), its HDL made again from it (server/drawing-sync.js), one write after the other;
// a structure an editor may not change (no drawing of the project's): published again from the disk
function drawingWrites(name, doc, owner, warn, bases) {
  let chain = Promise.resolve();
  const write = async paths => {
    let undo = false;
    for (const path of paths) {
      const file = P.safeJoin(P.projectDir(name), path);
      const r = liveDrawing(path) && fs.existsSync(file) ? drawingModel(doc, path) : null;
      if (!r) { undo = true; continue; }
      if (r.dropped.length) pruneDrawing(doc, path);
      const text = drawingText(path, withView(path, r.model, bases.get(path)));   // (the owner's own wires' style kept, #4239)
      if (sameDrawing(text, bases.get(path))) continue;
      let gated;
      try { gated = gateEdit(path, text); } catch (e) { warn(`${path}: an editor's change not written: ${e.reason || e.message}`); revertDrawing(doc, path, bases); continue; }
      if (isTrusted(await P.readProject(name))) await P.updateProject(name, markEditedByEditor);
      await P.writeAtomic(file, gated);
      bases.set(path, gated);
      const { syncDrawing } = await import('./drawing-sync.js');
      const s = await syncDrawing(P, name, path).catch(e => ({ messages: [`WARNING: HDL not synchronized: ${e.message}`] }));
      for (const m of s?.messages || []) if (/^WARNING: /.test(m)) warn(m.replace(/^WARNING: /, ''));
    }
    if (undo) publishProject(doc, { ...await readAll(name), owner, bases });
  };
  const fn = tr => {
    if (tr.local) return;
    const paths = drawingPathsOf(tr);
    if (paths.length) chain = chain.then(() => write(paths)).catch(() => { /* the next change */ });
  };
  doc.on('afterTransaction', fn);
  return () => doc.off('afterTransaction', fn);
}

// (its selection too, #4192: the text selected, a drawing's objects)
const peerLines = peers => (peers.length ? peers.map(p => `${p.name} (${p.role}${p.path ? `, ${p.path === 'p2p' ? 'peer to peer' : 'through the relay'}` : ''})${p.view ? `: ${p.view.path}${p.view.line !== null ? ` line ${p.view.line + 1}` : ''}${p.view.sel ? `, selected: ${selectionWords(p.view.sel)}` : ''}` : ''}`).join('\n') : 'nobody');

const ACTIONS = ['start', 'status', 'promote', 'demote', 'renew', 'stop'];
// a participant made an editor (promote) or a viewer (demote), as the Sharing menu does (#3997): the editors' key given
// to them, or renewed, the share's editors' link with it
async function setRole(name, cur, action, user) {
  if (!cur || cur.session.closed()) throw toolError(`'${name}' is not shared`);
  if (!cur.editLink) throw toolError(`'${name}' is shared with no editors (share_project start editors: true)`);
  if (!user) throw toolError('user: the name of a participant (share_project status lists them)');
  const peers = cur.session.peers().filter(p => p.role !== 'owner');
  const them = peers.filter(p => p.name === user);
  if (!them.length) throw toolError(`user: no participant named '${user}' (${peers.map(p => p.name).join(', ') || 'nobody'})`);
  if (them.length > 1) throw toolError(`user: ${them.length} participants are named '${user}'`);
  const [p] = them;
  if (action === 'promote' && p.role === 'editor') throw toolError(`user: '${user}' is an editor already`);
  if (action === 'demote' && p.role !== 'editor') throw toolError(`user: '${user}' is a viewer already`);
  try { await cur.session[action](p.client); } catch (e) { throw toolError(e.message); }
  if (action === 'promote') return { text: `'${user}' is an editor of '${name}' now: they edit its text files and drawings.`, data: { project: name, user, role: 'editor' }, untrusted: 'the participant\'s name' };
  cur.editLink = followLink(`${cur.server}/`, cur.session.room, cur.session.key, 'relay', cur.session.editKey, null, null, cur.session.ownerKey);
  return { text: `'${user}' is a viewer of '${name}' now. The editors' link was renewed (the old one only follows); the other editors keep editing:\n${cur.editLink}`, data: { project: name, user, role: 'viewer', editLink: cur.editLink }, untrusted: 'the participant\'s name' };
}

// the editors' link renewed, the editors away out of the list, as the Sharing menu's Renew Editor Link does (#4745)
async function renewLink(name, cur) {
  if (!cur || cur.session.closed()) throw toolError(`'${name}' is not shared`);
  if (!cur.editLink) throw toolError(`'${name}' is shared with no editors (share_project start editors: true)`);
  let r;
  try { r = await cur.session.renew(); } catch (e) { throw toolError(e.message); }
  cur.editLink = followLink(`${cur.server}/`, cur.session.room, cur.session.key, 'relay', r.editKey, null, null, cur.session.ownerKey);
  return { text: `The editors' link of '${name}' was renewed: the old one no longer lets anyone edit; the editors in it now keep editing${r.removed ? ` (${r.removed} away no longer edit${r.removed === 1 ? 's' : ''})` : ''}:\n${cur.editLink}`, data: { project: name, editLink: cur.editLink, removed: r.removed } };
}

export const COLLAB_TOOLS = [
  {
    name: 'share_project', title: 'Share a project live',
    description: 'Share a project live, as Share Project… with Live chosen (Share Module… with top). start: the follow link, read only (in Silinx or follow_project), its files and drawings as they change on disk; with editors: true an editor\'s link too (default none, promote then refused). status: who follows (viewer or editor, p2p or relay), what they look at, the share\'s mode. promote / demote (user), renew: as the Sharing menu; a demotion renews the editors\' link. stop ends it. Through a Silinx server\'s relay (another computer\'s only when config.json\'s relay.relays names it), end-to-end encrypted. build/ is not shared. A lost connection resumes on its own.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT,
      action: { type: 'string', enum: ['start', 'status', 'promote', 'demote', 'renew', 'stop'], description: 'start (default), status, promote, demote, renew or stop. renew: a new editors\' link, as Renew Editor Link; the editors not in the share edit no more, those in it keep editing.' },
      user: STR('promote, demote: the participant, by the name status lists (a share with editors only).'),
      name: STR('The name the followers see (default: "MCP agent").'),
      server: STR(`The address of the Silinx server whose relay shares it (default ${DEFAULT_SERVER}).`),
      editors: { type: 'boolean', description: 'start: editors may change its text files and drawings too (an editor\'s link besides the follower\'s); written through the import gate, the project untrusted from their first change.' },
      qr: { type: 'boolean', description: 'start, status: the follow link\'s QR code too (qr, an SVG); with editors, the editors\' link\'s too (editQr).' },
      key: STR('start: the key of a relay on another computer (its config.json\'s relay.key), instead of the token of a Silinx server on this one.'),
      via: { type: 'string', enum: ['cloudflare', 'server'], description: 'start: as Share Project… ▸ Live\'s choice: cloudflare, through the Cloudflare relay set with live_relay, the links opening on the Silinx site; server (default), a Silinx server\'s relay (server, key). Peer to peer is a browser page\'s only.' },
      relay: { type: 'boolean', description: 'start: the same as via: cloudflare (its older name).' },
      top: STR('start: a module the links open on, as Share Module… (…&top=<module>); the whole project shared.'),
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run({ project: name, action = 'start', name: who, server, editors = false, key, top, qr = false, user, relay = false, via }) {
      // (the follow link's QR code, #3637)
      const withQr = link => (qr ? { qr: qrSvg(link) } : {});
      // (the editors' link's QR code too, as Share Project… shows it, #3996)
      const withEditQr = link => (qr && link ? { editQr: qrSvg(link) } : {});
      if (!ACTIONS.includes(action)) throw toolError('action: start, status, promote, demote, renew or stop');
      if (user !== undefined && action !== 'promote' && action !== 'demote') throw toolError('user: with action promote or demote only');
      if (top !== undefined && action !== 'start') throw toolError('top: with action start only');
      if (relay && action !== 'start') throw toolError('relay: with action start only');
      // (Share Project… ▸ Live's choice, #4634: the Cloudflare relay or a Silinx server's; peer to peer is a page's, not
      // in its enum: this server has no WebRTC)
      if (via !== undefined && action !== 'start') throw toolError('via: with action start only');
      if (relay && via === 'server') throw toolError('relay: true is via: cloudflare, not server');
      const cloud = relay || via === 'cloudflare';
      if (top !== undefined && !MODULE_RE.test(top)) throw toolError(`top: '${String(top).slice(0, 64)}' is not a module name`);
      const cur = shares.get(name);
      if (action === 'stop') {
        if (!cur) throw toolError(`'${name}' is not shared`);
        shares.delete(name);
        cur.off();
        await cur.session.close();
        return { text: `Stopped sharing '${name}': its followers no longer see it.`, data: { project: name, shared: false } };
      }
      if (action === 'promote' || action === 'demote') return setRole(name, cur, action, user);
      if (action === 'renew') return renewLink(name, cur);
      if (action === 'status') {
        if (!cur || cur.session.closed()) { if (cur) { shares.delete(name); cur.off(); } return { text: `'${name}' is not shared.`, data: { project: name, shared: false } }; }
        const peers = withPaths(cur.session.peers());   // (#4643: each follower's path: a relay's room's, through it)
        const warns = cur.warnings.map(w => `\nWARNING: ${w}`).join('');
        // (#3835: its connection to the relay lost, being made again: said)
        const lost = cur.session.connected() ? '' : '\nThe connection to the relay was lost: reconnecting (its followers see the project as it was until it is back).';
        // (#4850: its room resumed, its connection lost or its page reloaded: the same links)
        const n = cur.session.resumes();
        const again = n ? `\nIts room was resumed ${n === 1 ? 'once' : `${n} times`} (its connection lost): the same links, its followers reconnected.` : '';
        return { text: `'${name}' is shared ${MODE_WORDS[cur.mode]}: ${cur.link}${lost}${again}\nFollowers:\n${peerLines(peers)}${warns}`, data: { project: name, shared: true, mode: cur.mode, connected: cur.session.connected(), resumed: n, link: cur.link, ...withQr(cur.link), followers: peers, warnings: [...cur.warnings] }, untrusted: peers.length || cur.warnings.length ? [...(peers.length ? ['the followers\' names and views'] : []), ...(cur.warnings.length ? ['the warnings, which name the shared project\'s files'] : [])].join(', ') : undefined };
      }
      await readProject(name);
      // (a module's links, Share Module…: one of the design's modules, #3631)
      const all = await readAll(name);
      const problem = top === undefined ? null : viewProblem(all.project, all.files, { top });
      if (problem) throw toolError(`top: ${problem}`);
      const on = l => (l && top !== undefined ? withTop(l, top) : l);
      const at = top !== undefined ? `, opening on ${top}` : '';
      if (cur && !cur.session.closed()) return { text: `'${name}' is shared already ${MODE_WORDS[cur.mode]}${at}: ${on(cur.link)}`, data: { project: name, shared: true, mode: cur.mode, link: on(cur.link), ...withQr(on(cur.link)), ...(cur.editLink ? { editLink: on(cur.editLink), ...withEditQr(on(cur.editLink)) } : {}), ...(top !== undefined ? { top } : {}), followers: withPaths(cur.session.peers()) } };
      // (the Cloudflare relay set, #4574: its key; the links the Silinx site's, naming the relay)
      const own = cloud ? await liveRelay() : null;
      if (cloud && !own) throw toolError(`${relay ? 'relay' : 'via'}: no Cloudflare relay is set (live_relay)`);
      if (own && (server !== undefined || key !== undefined)) throw toolError(`${relay ? 'relay' : 'via'}: without server or key (the relay set has its own)`);
      const origin = own ? own.address : serverOf(server);
      const owner = cleanName(who) || 'MCP agent';
      const doc = projectDoc(), bases = new Map();
      publishProject(doc, { ...all, owner, bases });
      const token = own ? own.key : key ? String(key) : await tokenOf(origin);
      let session;
      // (an editor's change the owner refused among them too, #3527)
      const warnings = [];
      const onEvent = ev => { if (ev.type === 'error' && ev.message) warnings.push(ev.message); };
      try {
        session = await shareRoom({ url: relayUrl(origin, 'share'), token, doc, user: { name: owner }, editors: !!editors, WebSocket: await WebSocketImpl(), onEvent });
      } catch (e) { throw toolError(`cannot share through ${origin}: ${e.message} (is Silinx running there? silinx serve)`); }
      // (what changes on disk, published again; the relay's end, the share's)
      const { createProjectWatcher } = await import('./project-watch.js');
      const watcher = createProjectWatcher({ dirOf: P.projectDir });
      const writes = session.editKey ? ownerWrites(name, doc, owner, w => warnings.push(w), bases) : null;
      // (its versions, its editors' requests of one, #5742: an answer's line among the warnings)
      const versions = ownerVersions(name, doc, line => warnings.push(line));
      const unsub = watcher.subscribe(name, async () => {
        versions.published();
        if (writes) { writes.queue.again(); return; }   // (after the editors' changes waiting, #4418)
        try { publishProject(doc, { ...await readAll(name), owner, bases }); } catch { /* the next change */ }
      });
      const off = () => { unsub(); writes?.off(); versions.off(); watcher.close?.(); };
      const base = own ? SITE_URL : `${origin}/`, meetAt = own ? own.address : null;
      const link = followLink(base, session.room, session.key, 'relay', null, meetAt, null, session.ownerKey);
      const editLink = session.editKey ? followLink(base, session.room, session.key, 'relay', session.editKey, meetAt, null, session.ownerKey) : null;
      // (#4643: the Cloudflare relay's or a Silinx server's room: every follower through the relay)
      const mode = shareMode({ relay: origin, cloudflare: !!own });
      shares.set(name, { session, link, editLink, server: origin, mode, off, warnings });
      return {
        text: `Sharing '${name}' live ${MODE_WORDS[mode]}${editLink ? '' : ', read only,'} as ${owner}${at}. Anyone with this link follows it (until share_project stop)${qr ? '; its QR code: qr, an SVG' : ''}:\n${on(link)}${editLink ? `\nAnyone with this one edits its text files and drawings too${qr ? ' (its QR code: editQr)' : ''}:\n${on(editLink)}` : ''}`,
        data: { project: name, shared: true, link: on(link), ...withQr(on(link)), ...(editLink ? { editLink: on(editLink), ...withEditQr(on(editLink)) } : {}), ...(top !== undefined ? { top } : {}), mode, followers: [] },
      };
    },
  },
  {
    name: 'follow_project', title: 'Follow a shared project (read only)',
    description: 'Follow a project someone shares (a link …/#view=… of Share Project… or share_project; …&relay=… through that relay; an older …/#follow=…), read only, as the interface opened at that link; an editor\'s link (…/#edit=…) can write, source and settings. Gives its files, who is in it, the owner\'s open file, cursor and selection (ownerView), and their activity (ownerActivity: documents, processes and logs, simulations, Board Emulators, Try it). path: that file\'s text now (a drawing as merged, with its Check). version: the owner\'s versions; an editor saves, restores. stop: leave; keep: a copy in the workspace, untrusted, as Keep a Copy. Reconnects on its own (connected; ownerAway, ownerResumed).',
    inputSchema: { type: 'object', properties: {
      link: STR('The link to follow (the whole address).'),
      path: STR('A file of the project: its text as it is now.'),
      name: STR('The name the owner sees (default: "MCP agent").'),
      write: { type: 'object', description: 'Editor\'s link only: a file\'s new text, merged as this participant\'s edit: a text file (HDL, constraints, C / C++, notes) or a .fsm, .bool, .asm, .pn or .sch .json drawing, merged per object and field (with its Check, but a table\'s and a schematic\'s).', properties: { path: STR('The file.'), text: STR('Its new text.') }, required: ['path', 'text'], additionalProperties: false },
      source: { type: 'object', description: 'Editor\'s link only: as New Source…, Remove from Project, Delete File…, Rename…: add (path, text; no text: a file of the folder), remove (file kept), delete (into the owner\'s .trash), rename (to). Through the import gate, the project untrusted.', properties: { action: { type: 'string', enum: ['add', 'remove', 'delete', 'rename'] }, path: STR('The file\'s path in the project.'), to: STR('rename: its new path.'), text: STR('add: the new file\'s text.') }, required: ['action', 'path'], additionalProperties: false },
      settings: { type: 'object', description: 'Editor\'s link only: fields of silinx.json set, as Set as Top Module, Design Properties…, Process Properties… (top, simTop, device, board, impl, …); its id, name, origin and trust stay the owner\'s.' },
      version: { type: 'object', description: 'The owner\'s versions (list), as Versions… shows them on a follower\'s page; an editor\'s link asks the owner to keep one (save, its name) or to restore one (restore: id, and path for one file), with this participant\'s name as its author.', properties: { action: { type: 'string', enum: ['list', 'save', 'restore'] }, id: STR('restore: the version\'s number.'), path: STR('restore: one file only.'), name: STR('save: the version\'s name.') }, required: ['action'], additionalProperties: false },
      stop: { type: 'boolean', description: 'Stop following it.' },
      keep: { type: 'boolean', description: 'With stop, or once following ended: keep a copy of the project as the room has it, under a free name in the workspace, imported and untrusted, as Keep a Copy; then leave.' },
    }, required: ['link'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run({ link, path, name: who, write, source, settings, version, stop = false, keep = false }) {
      let l;
      try { l = parseFollowLink(link); } catch (e) { throw toolError(e.message); }
      if (!l || !l.base) throw toolError('link: a link to follow (http(s)://…/#view=…)');
      // (a room the owner's page hosts, #3227: reached over WebRTC, which this server has not; met at a relay, #4543: through
      // that relay's meeting point, its messages through the relay, core/collab-meet-relay.js)
      if (l.via === 'host' && !(l.relay && l.host)) throw toolError('link: a project its owner\'s page hosts (…#view=….host) with no relay is followed in a browser, over WebRTC: open the link in Silinx');
      // (through the relay the link names, #3227, else the link's own Silinx)
      const origin = serverOf(l.relay || l.base, 'link', (await liveRelay())?.address);   // (the Cloudflare relay set too, #4574)
      // (a room followed and edited: two participants; an editors' link renewed, #3997: another one, its key its own)
      const slot = `${l.room}:${l.sign ? `edit.${l.sign}` : 'follow'}`;
      let cur = follows.get(slot);
      // (following ended, #4198: its project kept until a copy is kept or it is left)
      if (keep) {
        if (!cur) throw toolError('keep: this link is not followed');
        if (!cur.session.closed() && !stop) throw toolError('keep: with stop (a copy is kept once following ends)');
        follows.delete(slot);
        if (!cur.session.closed()) await cur.session.close();
        return keptCopy(cur.session.doc);
      }
      if (cur?.session.closed() && !stop && path === undefined && write === undefined && source === undefined && settings === undefined) {
        const { project, owner } = docProject(cur.session.doc);
        return { text: `Following ${owner}'s project '${project?.name}' ended: it is saved nowhere. follow_project keep: true keeps a copy of it in the workspace (untrusted); stop: true leaves it.`, data: { following: false, ended: true, owner, project: project?.name ?? null }, untrusted: 'the shared project\'s name' };
      }
      if (cur?.session.closed()) { follows.delete(slot); cur = null; }
      if (stop) {
        if (!cur) throw toolError('this link is not followed');
        follows.delete(slot);
        await cur.session.close();
        return { text: 'Stopped following.', data: { following: false } };
      }
      if (!cur) {
        let session;
        try {
          const user = { name: cleanName(who) || 'MCP agent' };
          if (l.via === 'host') {
            const meeting = relayMeeting({ url: origin, WebSocket: await WebSocketImpl(), RTC: null });
            const owner = () => meetOwner({ meeting, room: l.room, key: l.key, host: l.host, ms: ARRIVE_MS, maxReceive: 16 << 20 });
            session = await followRoom({ url: 'silinx-host:', room: l.room, key: l.key, sign: l.sign, owner: l.owner ?? null, user, WebSocket: await owner(), transport: owner });
          } else session = await followRoom({ url: relayUrl(origin, 'follow'), room: l.room, key: l.key, sign: l.sign, owner: l.owner ?? null, user, WebSocket: await WebSocketImpl() });
          await Promise.race([session.ready, new Promise((_, no) => setTimeout(() => no(new Error('the project did not arrive (is its owner still sharing it?)')), ARRIVE_MS))]);
        } catch (e) { session?.close(); throw toolError(`cannot follow: ${e.message}`); }
        // (who is in it comes right after the project: the owner awaited a little)
        for (let t = 0; t < 40 && !session.owner(); t++) await new Promise(r => setTimeout(r, 25));
        follows.set(slot, cur = { session, link, name: cleanName(who) || 'MCP agent' });
      }
      let wrote = null;
      if (write !== undefined) {
        if (!cur.session.editor) throw toolError('write: this link follows only (an editor\'s link, …#edit=…, writes)');
        try { wrote = writeShared(cur.session.doc, String(write.path), String(write.text)); } catch (e) { throw toolError(`write: ${e.message}`); }
        await cur.session.flush();
      }
      // (#4418: a source added, removed, deleted or renamed; the description's settings)
      const changed = [];
      if (source !== undefined || settings !== undefined) {
        if (!cur.session.editor) throw toolError(`${source !== undefined ? 'source' : 'settings'}: this link follows only (an editor's link, …#edit=…, changes the project)`);
        if (source !== undefined) {
          try { changed.push(sourceChange(cur.session.doc, { action: String(source.action), path: String(source.path), to: source.to === undefined ? undefined : String(source.to), text: source.text })); } catch (e) { throw toolError(`source: ${e.message}`); }
        }
        if (settings !== undefined) {
          if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw toolError('settings: an object of silinx.json\'s fields');
          const pj = docProject(cur.session.doc).project;
          if (!pj) throw toolError('settings: the shared project has not arrived yet');
          setDescription(cur.session.doc, { ...pj, ...settings });
          changed.push(`Set ${Object.keys(settings).join(', ') || 'nothing'} in the project's description.`);
        }
        await cur.session.flush();
      }
      // (#5742: the owner's versions; with an editor's link, one saved or restored, done by the owner)
      if (version !== undefined) {
        let r;
        try { r = await followVersion(cur.session, version, { by: cur.name || 'MCP agent', editor: cur.session.editor }); } catch (e) { throw toolError(`version: ${e.message}`); }
        return { text: r.text, data: { project: docProject(cur.session.doc).project?.name ?? null, ...r.data }, untrusted: 'the owner\'s versions\' names and authors, the files\' paths and the owner\'s answer' };
      }
      const { project, owner, fileTree } = docProject(cur.session.doc);
      const peers = cur.session.peers();
      const view = cur.session.owner()?.view || null;
      let text = null, check = null;
      if (path !== undefined) {
        // (through the import gate, as the interface's follower reads it, #3361; a drawing edited live: as merged, #3183)
        const live = liveDrawing(String(path)) ? drawingModel(cur.session.doc, String(path)) : null;
        const g = live ? gatedText(String(path), drawingText(String(path), withView(String(path), live.model, docFile(cur.session.doc, String(path))))) : gatedDocFile(cur.session.doc, String(path));
        if (g.reason) throw toolError(`${path}: not shown: ${g.reason}`);
        text = g.text;
        if (text === null) throw toolError(`'${path}' is not a file of the shared project (${fileTree.join(', ')})`);
        if (live) check = await checkDrawing(String(path), live.model);
      }
      const lines = [
        `Following ${owner}'s project '${project?.name}' (${cur.session.editor ? 'an editor: its text files and drawings' : 'read only'})${l.top ? `, its link opening on ${l.top}` : ''}.`,
        `Files: ${fileTree.join(', ')}`,
        `In it:\n${peerLines(peers)}`,
        // (its connection lost, being made again, #3835: what it shows as it was then; a write sent once it is back)
        ...(cur.session.connected() ? [] : ['The connection to the relay was lost: reconnecting (what this shows is as it was then).']),
        // (#4850: the owner away, its page reloading or its connection lost: the relay keeps the share for it a while)
        ...(cur.session.away() ? [`${owner}'s connection was lost: reconnecting, waiting for them to come back (the relay keeps the share for 2 minutes; what this shows is as it was then).`] : []),
        ...(cur.session.resumes() && !cur.session.away() ? [`${owner} came back ${cur.session.resumes() === 1 ? 'once' : `${cur.session.resumes()} times`} after their connection was lost: the project as it is now.`] : []),
        ...activityLines(ch => cur.session.activity(ch)),
        ...runLines(cur.session.activity('runs')),
        ...simLines(cur.session.activity('sim')),
        ...emuLines(cur.session.activity('emu')),
        ...tryLines(cur.session.activity('try')),
        ...changed.map(t => `${t.replace(/\.$/, '')} (merged as this participant's edit${cur.session.connected() ? '' : ', sent once the connection is back'}).`),
        ...(write !== undefined ? [`Wrote ${write.path} (merged as this participant's edit${cur.session.connected() ? '' : ', sent once the connection is back'}).`, ...(wrote ? [wrote] : [])] : []),
        ...(text !== null ? [`${path}:`, text] : []),
        ...(check ? check.lines : []),
      ];
      return { text: lines.join('\n'), data: { following: true, connected: cur.session.connected(), ownerAway: cur.session.away(), ownerResumed: cur.session.resumes(), editor: cur.session.editor, owner, project: project?.name ?? null, files: fileTree, participants: peers, ownerView: view, ownerActivity: ownerActivity(cur.session, fileTree), ...(l.top ? { top: l.top } : {}), ...(text !== null ? { path, text } : {}), ...(check ? { check: { errors: check.errors, warnings: check.warnings } } : {}) }, untrusted: text !== null ? `the shared project's files, names and the file ${path}` : 'the shared project\'s files and names' };
    },
  },
];

// a copy of a project followed kept (#4198, core/collab-keep.js): a project of the workspace under a free name, through
// the import gate and the zip import's own function (server/project-zip.js), untrusted
async function keptCopy(doc) {
  const copy = followedCopy(doc);
  const name = copyName(copy.name, (await P.listProjects()).map(p => p.name));
  const { gateEntries } = await import('../core/import-gate.js');
  const { importProjectEntries } = await import('./project-zip.js');
  let r;
  try { r = await importProjectEntries(P, name, gateEntries(copy.entries), toolError); } catch (e) { if (e.toolError) throw e; throw toolError(`keep: ${e.message}`); }
  const warns = r.warnings?.length ? `\nWarnings:\n${r.warnings.join('\n')}` : '';
  return { text: `Kept a copy of ${copy.owner}'s project '${copy.name}' as the project '${name}' of the workspace (untrusted, as any project from someone else); stopped following.${warns}`, data: { following: false, kept: name, project: copy.name, files: copy.entries.map(e => e.path), warnings: r.warnings || [] }, untrusted: 'the shared project\'s names and files' };
}

// the owner's activity (#4002), as a follower's page takes it: { view: { open, active, split, page, view }, layout: {
// task, … } | null, design: { sel, open } | null } (null: none yet, an owner of no interface: share_project's)
// (the runs: { id, status, from, lines, summary }, the run's last lines only, its log's end)
// (the runs' lines as messages too, #4749: as the follower's console makes them, their sources the owner's, their
// locations the shared project's files)
function ownerActivity(session, paths = []) {
  const ui = followedUi(session.activity('ui')), design = followedDesign(session.activity('design')), r = followedRuns(session.activity('runs'));
  const runs = r && { ...r, messages: runMessages(r, paths) };
  const sim = followedSim(session.activity('sim')), emu = followedEmu(session.activity('emu'));
  // (its Try it, #4244: each document's, as it shows it: its state, steps, inputs and outputs)
  const t = followedTry(session.activity('try')), tries = t ? Object.fromEntries(Object.entries(t.docs).map(([id, d]) => [id, { kind: d.kind, ...d.sum }])) : null;
  if (!ui && !design && !runs && !sim && !emu && !tries) return null;
  return { view: ui?.view ?? null, layout: ui?.layout ?? null, design, runs, sim, emu, try: tries };
}

/** A project this MCP server shares, as project_info gives it (#4643): { mode, connected, followers (each with its
 *  path) }, or null. */
function shareInfo(name) {
  const cur = shares.get(name);
  if (!cur || cur.session.closed()) return null;
  return { mode: cur.mode, connected: cur.session.connected(), followers: withPaths(cur.session.peers()).map(p => ({ name: p.name, role: p.role, path: p.path })) };
}
/** A tool's result about a project (project_info's) with its live share's (#4643): data.sharing, a line of its text,
 *  its followers' names among what is untrusted. */
export function withSharing(name, r) {
  const sharing = shareInfo(name);
  if (!sharing) return r;
  const who = sharing.followers.map(p => `${p.name} (${p.role}, ${p.path === 'p2p' ? 'peer to peer' : 'through the relay'})`).join(', ');
  return { ...r, text: `${r.text}\n  shared live ${MODE_WORDS[sharing.mode]}: ${who || 'no follower yet'}`, data: { ...r.data, sharing },
    untrusted: sharing.followers.length ? [r.untrusted, 'its followers\' names'].filter(Boolean).join(', ') : r.untrusted };
}

/** A run of run_process on a project this MCP server shares (#4002): sent to its followers as a page sends its runs
 *  (core/collab-runs.js), its steps' marks (the last one's: warn with warnings; every one's: err when it failed), its
 *  log's end, its Design Summary. Nothing when the project is not shared. */
export async function sharedRun(name, { steps, ok, warnings = [], lines = [] }) {
  const s = shares.get(name);
  if (!s || s.session.closed()) return false;
  s.runs = (s.runs || 0) + 1;
  const status = {};
  for (const id of steps) status[id] = ok ? 'ok' : 'err';
  if (ok && warnings.length) status[steps[steps.length - 1]] = 'warn';
  if (steps.includes('translate') && steps.includes('par')) status.impl = ok ? 'ok' : 'err';
  // (this computer's names left out, as the page's: its folders, the home folder, the ISE host; server/owner-secrets.js)
  const secrets = await ownerSecrets();
  let summary = null;
  try { const r = await (await import('./impl-routes.js')).projectReports(name); summary = r?.available === false ? null : redactAll(r, secrets); } catch { /* none */ }
  return s.session.publish('runs', runsActivity({ id: s.runs, status, lines: lines.map(l => [redact(l, secrets), { error: 'err', warning: 'warn' }[severityOf(l)] || '', 'impl']), summary }));
}

// an editor's write (#3182, #3183): a text file's text (core/collab-doc.js editFile), or a drawing's JSON merged
// into its structure as this participant's edit (its new objects' ids its own), what it leaves dangling pruned; a note
// of what it left out (its view settings, #4239), or null
function writeShared(doc, path, text) {
  if (!liveDrawing(path)) { editFile(doc, path, text); return null; }
  if (!drawingModel(doc, path)) throw new Error(`${path}: not a drawing of the project that an editor can change`);
  let m;
  try { m = JSON.parse(text); } catch { throw new Error(`${path}: not a drawing's JSON`); }
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error(`${path}: not a drawing's JSON`);
  gateEdit(path, text);
  putDrawing(doc, path, m, { client: doc.clientID });
  pruneDrawing(doc, path);
  // (how it is seen, the wires' style, #4239: each participant's own, never sent; said when it differs from the file's)
  const dflt = drawingKind(path) === 'circ' ? 'direct' : undefined;
  const file = wireStyleOf(withView(path, {}, docFile(doc, path)), dflt);
  if (!viewFields(path).includes('wireStyle') || !('wireStyle' in m) || wireStyleOf(m, dflt) === file) return null;
  return `${path}: its wires' style (${m.wireStyle}) left out: how each participant sees the drawing, not shared (the owner's file keeps ${file}).`;
}
// a text through the import gate, as gatedDocFile gives it
function gatedText(path, text) {
  try { return { text: gateEdit(path, text) }; } catch (e) { return { reason: e.reason || e.message }; }
}

/** The shares and follows of this MCP server, ended (its client gone). */
export async function endCollab() {
  for (const s of shares.values()) { s.off(); await s.session.close().catch(() => {}); }
  for (const f of follows.values()) await f.session.close().catch(() => {});
  shares.clear();
  follows.clear();
}
