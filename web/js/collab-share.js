// Share Project…'s live sharing (#3181; a copy or live: web/js/share-how.js, #3698): the owner shares the open project
// live, read only, through the relay of Silinx's server (server/collab-relay.js). Its files go into a Yjs document (core/collab-doc.js), kept as the project changes: what
// the page saves, renames, deletes, the project's settings, and what another process changes on disk (#2843); the
// editor in front and its cursor go into the owner's awareness. The link (core/collab-link.js) carries the room and
// its key, so the relay sees nothing of the project. The followers are shown in the toolbar (collab-presence.js),
// their coming and going in the console; Stop Sharing closes the room for them all. Opening another project stops
// sharing too. The browser edition, which has no relay, hosts the room in the owner's page (#3227, collab-host.js):
// each follower finds it at the public meeting point (collab-meet.js: the link carries the owner's key), or connects
// with codes exchanged by hand (Add a User…, #3996). Editors (#3182, phase 2): its editors' link (a link of its own, #3996) signs
// their changes; the page's open text editors are bound live to the document (collab-bind.js), and what an editor
// changes in a text file is written to the disk, anything else undone from it (the disk is the owner's); through the
// import gate, the project untrusted from an editor's first change (#3355). Its drawings edited live (#3183): each one a
// structure of its own in the document (core/collab-model.js), its open editor bound to it (collab-drawing.js); what an
// editor changes in one is written to the disk (through the gate too) and its HDL generated again, as the page's own
// changes are. Its connection to the relay lost (#3835), the room is resumed on its own: "Reconnecting…" in the toolbar
// meanwhile, the loss and the return in the console; its followers keep it as it was, and get what changed once back.
// How it reaches each follower (#4643, core/collab-paths.js): its mode (via the Cloudflare relay, peer to peer, via a
// Silinx server's relay) and each follower's path (P2P or Relay), in the presence (the Collaboration tab shows them),
// drawn again when a path changes; never a console line for it (many followers would flood it).
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { S, app } from './app.js';
import { writeClip } from './clipboard.js';
import { prefKey } from './prefs.js';
import { collab } from './collab-state.js';
import { renderPresence, setPresenceCommands, setPresenceRoles } from './collab-presence.js';
import { projectDoc, publishProject, putFile, putProject, sharedPath, watchDoc, editablePath, gateEdit } from '/core/collab-doc.js';
import { applyEdits, editQueue } from '/core/collab-files.js';
import { isTrusted, markEditedByEditor, untrustedNotice } from '/core/trust.js';
import { trustAction } from './console.js';
import { selectionOfDoc } from './collab-select-draw.js';
import { keepBound, unbindAll } from './collab-bind.js';
import { keepDrawingsBound, unbindDrawings, editorOf, modelOf } from './collab-drawing.js';
import { liveDrawing, drawingKind, drawingText, sameDrawing, drawingModel, drawingPathsOf, pruneDrawing, syncDrawing, revertDrawing, withView } from '/core/collab-model.js';
import { shareRoom, colorOf } from '/core/collab-client.js';
import { followLink, relayUrl, relayAddress, withTop, workersRelay } from '/core/collab-link.js';
import { shareMode, hostedPaths, withPaths } from '/core/collab-paths.js';
import { newHostKey } from '/core/collab-meet.js';
import { linkField } from './link-field.js';
import { SHARE_WIDTH, howRow, shareTitle } from './share-how.js';
import { hdlWarning } from './design-only.js';
import { ownerActivity } from './collab-activity.js';
import { TRACK_MS, soon, trackOnEvents } from '/core/collab-pace.js';
import { collabLog } from './collab-log.js';

export const NAME_KEY = prefKey('silinx.collab.name');
const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const keepName = n => { try { localStorage.setItem(NAME_KEY, n); } catch { /* this page only */ } };
// the browser edition's relay (#3227): another Silinx's, that lets this site in, among the site's (its address, its key),
// this browser's (web/js/relay-setting.js)
/** The relays this Silinx's pages may share and follow through (their Content-Security-Policy's too): the site's, set
 *  when it is built, or config.json's relay.relays. */
const relaysHere = async () => { try { return (await api.collabRelays?.()) || []; } catch { return []; } };
/** A relay this page may use (#4543): one of this Silinx's, or, on the site, any Cloudflare Worker's (its CSP's). */
export const relayOk = async r => (api.standalone && workersRelay(r)) || (await relaysHere()).includes(r);
/** Why a relay is refused here. */
export const notHere = r => `the relay at ${new URL(r).host} is not among this Silinx's relays (${api.standalone ? 'the site\'s, set when it is built, or a Cloudflare Worker\'s, https://….workers.dev' : 'config.json\'s relay.relays'})`;
/** The name of a participant, as the others see it (trimmed, at most 40 characters). */
export const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);

let share = null;   // { name, session, doc, link, editLink, restore, orig, timer, known: Map<client, name>, view, hosted (a room of the page's), bound, unwatch,
                    //   bases (a drawing's text last put into its structure, #3183), drawn (its drawings bound), drawing (their writes, one after the other) }

/** Share Project…'s window, live (#3996): one window, the name on it (filled with the last one, the cursor in it; once
 *  shared, shown, not a field: #4073), Start Sharing, then the viewers' and the editors' links in the same window, each
 *  made by its Generate (#4073; kept for the share's later windows; Generate View-Only, Generate Edit Link, #4576, #4613), hidden
 *  (link-field.js: Generate, Copy, Show, Show QR Code, in a row below a box as tall as the link); Stop Sharing, Close (Add a User…: the toolbar's Sharing menu's). Share Module… (`module`, #3631): the
 *  same, that module's source opened (the followers follow it), the links opening on it (`view`: its copy's, the way
 *  switched, #3698). Resolves to the viewers' link once closed (null: not shared). */
export async function shareProjectDialog({ module = null, view = null, via = undefined, shown = null } = {}) {
  if (!S.project) return null;
  const action = shareTitle(module);
  // (a page opened from a file has no address the followers could open: the site's has, #3227)
  if (!share && location.protocol === 'file:') { collabLog(`ERROR: ${action}: a Silinx opened from a file has no address that others can open; open Silinx from its site to share a project.`, 'err'); return null; }
  if (share && module) await (await import('./link-open.js')).showModule(module, true);
  const input = h('input', { type: 'text', value: share?.name || savedName(), 'data-field': 'name', maxlength: 40, style: { width: '100%' } });
  const nameShown = h('div', { class: 'collab-name', 'data-no-i18n': '' });
  const nameBox = h('div', { class: 'collab-name-box' }, input, nameShown);
  const nameErr = h('div', { class: 'wiz-error collab-name-error' });
  // (the browser edition: this page hosts the room, its followers met at the Cloudflare relay set up in the
  // Collaboration tab, #4543, #4574, or peer to peer, no relay, at the public meeting point or by codes, #3227: two
  // of the Share: row's choices, the one chosen explained below it, #4634)
  const ways = api.collab ? null : (await import('./share-via.js')).viaPart({ ...(via ? { via } : {}), changed: () => draw() });
  // the links, hidden: the viewers' and the editors', each made by its Generate (#3996, #4073: different links, the
  // editors' with the room's signing key)
  const linkOf = role => (share ? (module ? withTop(role === 'edit' ? share.editLink : share.link, module) : role === 'edit' ? share.editLink : share.link) : null);
  const made = role => { if (!share) return null; share.made[role] = true; return linkOf(role); };
  // (their buttons in a row below boxes as tall as the links, before Generate as tall as the links it makes, #4576)
  const viewer = linkField({ field: 'link', label: 'Generate View-Only', row: true, expected: () => linkOf('view')?.length, onCopy: l => copyLink(l), generate: async () => made('view') });
  const editor = linkField({ field: 'edit-link', label: 'Generate Edit Link', row: true, expected: () => linkOf('edit')?.length, onCopy: l => copyEditorLink(l), generate: async () => made('edit') });
  const about = h('p', { class: 'collab-about' });
  const hostedNote = h('p', { class: 'collab-hosted' }, 'This page hosts it: its followers find it when they open the link, or send you a code, which Add a User… takes.');
  // (three parts, a rule before each link's sentence, #4668: the name, the view-only link, the editors' link)
  const links = h('div', { class: 'collab-links' },
    h('hr', { class: 'collab-rule' }), about, viewer.el,
    h('hr', { class: 'collab-rule' }), h('p', { class: 'collab-edit-about' }, 'Anyone with the editors\' link edits its text files and drawings with you, live.'), editor.el,
    hostedNote);
  // (a copy, or live: the window's Share: row, #3698)
  let closeIt = null, btns = null;
  const way = howRow('live', { module, view, close: () => closeIt?.(), via: ways?.via(), onVia: v => { ways.setVia(v); draw(); } });
  const draw = () => {
    const on = !!share;
    input.hidden = on;
    nameShown.hidden = !on;
    nameShown.textContent = on ? share.name : '';
    if (ways) ways.el.hidden = on;
    way.lock(on);
    links.hidden = !on;
    viewer.set(on && share.made.view ? linkOf('view') : null);
    editor.set(on && share.made.edit ? linkOf('edit') : null);
    about.textContent = !on ? '' : module ? `Anyone with this link follows "${share.project}" live, read only, opening it on ${module}, as long as you share it.` : `Anyone with this link follows "${share.project}" live, read only, as long as you share it.`;
    hostedNote.hidden = !share?.hosted;
    // (Start Sharing the window's first button before, Close once shared: what Enter presses)
    if (btns?.[0].el) {
      const [st, stop, close] = btns;
      st.el.disabled = on || (ways ? !ways.ready() : false); stop.el.disabled = !on;
      st.primary = !on; close.primary = on;
      st.el.classList.toggle('primary', !on); close.el.classList.toggle('primary', on);
    }
  };
  const start = async () => {
    nameErr.textContent = '';
    const name = cleanName(input.value);
    if (!name) { nameErr.textContent = 'Your name first: the others see it.'; input.focus(); return false; }
    keepName(name);
    if (ways && !ways.ready()) return false;   // (Start Sharing disabled then: no relay set up yet)
    ways?.kept();
    try { await startSharing(name, ways?.via() === 'relay' ? { via: 'host', relay: ways.relay() } : {}); } catch (e) { collabLog(`ERROR: ${action}: ${e.message}.`, 'err'); return false; }
    if (module) await (await import('./link-open.js')).showModule(module, true);
    draw();
    return false;   // (the window kept open: its links now)
  };
  btns = [
    { label: 'Start Sharing', primary: true, validate: start },
    { label: 'Stop Sharing', validate: async () => { await stopSharing(); draw(); return false; } },
    { label: 'Close', value: null },
  ];
  await dialog({
    title: action, width: SHARE_WIDTH, className: 'share-dlg',   // (a copy's size: switching keeps the window as it is, #4617)
    onOpen: ({ close }) => { closeIt = () => close(null); draw(); shown?.(); setTimeout(() => { if (!share) { input.focus(); input.select(); } }, 0); },
    body: h('div', { class: 'collab-dlg' },
      way.el,   // (the Share: row first, the way's sentence below it, #4712)
      h('label', {}, 'Your name, as they see it:'), nameBox, nameErr,
      ways?.el ?? null, links),   // (the relay set below the name, #4714)
    buttons: btns,
  });
  ways?.off();
  if (way.wanted) return way.switched();
  return share ? (module ? withTop(share.link, module) : share.link) : null;
}

// the project as the API gives it, and its files' texts: { project, files }
async function readAll(name) {
  const pj = await api.project(name);
  const files = {};
  for (const p of pj.fileTree || []) {
    if (!sharedPath(p)) continue;
    try { files[p] = await api.readFile(name, p); } catch { /* unreadable: left out */ }
  }
  return { project: pj, files };
}

/** Shares the open project as `name` (the link: share.link); via: 'relay' (the server's: a server edition's default;
 *  with `relay`, { address, key }, another Silinx's, that lets this site in, #3227) or 'host' (this page hosts the room:
 *  the browser edition's default; with `relay`, its followers met at that relay, #4543, else at the public meeting point). */
export async function startSharing(name, { via = api.collab ? 'relay' : 'host', relay = null } = {}) {
  const other = relay ? relayAddress(relay.address) : null;
  if (relay && !other) throw new Error(`the relay's address is not an http(s) address: '${relay.address}'`);
  if (other && !await relayOk(other)) throw new Error(notHere(other));
  if (via === 'relay' && !other && !api.collab) throw new Error('the browser edition shares through a relay of its settings, or its own page');
  const project = S.project.name;
  const doc = projectDoc(), bases = new Map();
  publishProject(doc, { ...await readAll(project), owner: name, bases });
  const host = via === 'host' ? (await import('./collab-host.js')).hostRoom() : null;
  const hostKey = host ? await newHostKey() : null;
  const session = host
    ? await shareRoom({ url: 'silinx-host:', WebSocket: host.WebSocket, doc, user: { name }, editors: true, onEvent: ev => onEvent(ev) })
    : await shareRoom({ url: relayUrl(other || location.href, 'share'), token: other ? relay.key || null : await api.collabToken(), doc, user: { name }, editors: true, onEvent: ev => onEvent(ev) });
  const base = location.origin + location.pathname, pub = hostKey?.pub ?? null;
  // (#4643: the way chosen; a relay of the browser edition's is the Cloudflare one: hosted, Live's choice, or a Worker's)
  const mode = shareMode({ hosted: !!host, relay: other, cloudflare: !!other && (!!host || workersRelay(other)) });
  share = { name, project, session, doc, made: {}, base, via, mode, other, pub, meetAt: host && other ? { address: other, key: relay.key || '' } : null, link: followLink(base, session.room, session.key, via, null, other, pub), editLink: followLink(base, session.room, session.key, via, session.editKey, other, pub), known: new Map(), view: null, hosted: host?.hosted || null, bound: new Map(), bases, drawn: new Map(), drawing: Promise.resolve() };
  Object.assign(collab, { role: 'owner', owner: name, project, session });
  ({ restore: share.restore, orig: share.orig } = hookApi(project, doc, share));
  const s0 = share;
  share.queue = editQueue(ev => onEdits(s0, ev), fresh => publishDisk(s0, fresh));   // (#4110, #4418)
  const offFiles = watchDoc(doc, ev => s0.queue.push(ev)), offDrawings = watchDrawings(s0);
  share.unwatch = () => { offFiles(); offDrawings(); };
  share.activity = ownerActivity(session);   // (#4002)
  share.timer = setInterval(track, TRACK_MS);
  // (#4647: a key, a click, a selection: looked at a frame later, not at the next look; the followers' views too)
  share.soon = soon(track);
  share.unevents = trackOnEvents(document, share.soon.poke);
  share.soon.poke();
  addEventListener('silinx:disk-changes', onDisk);
  setPresenceCommands(commands);
  setPresenceRoles({ set: (peer, role) => setRole(peer, role), editors: () => !!share?.session.editKey });   // (#4646)
  draw();
  collabLog(`Sharing project "${project}": anyone with its link follows it live, read only (Share Project… shows the link; Stop Sharing ends it).`, 'ok');
  if (other && !host) collabLog(`Shared through the relay at ${new URL(other).host}: it sees no file, only who is in.`, 'info');
  if (host && other) {
    collabLog(`This page hosts the shared project: its followers meet it at the relay at ${new URL(other).host}, then connect to it directly when they can, through the relay otherwise; it sees no file. It lasts while this page is open.`, 'info');
    share.meet = (await import('./collab-meet.js')).meetFollowers(share, hostKey.key);
  } else if (host) {
    collabLog('This page hosts the shared project: its followers find it at the meeting point when they open the link, or send you a code (Add a User…, in the toolbar, takes it); it lasts while this page is open.', 'info');
    const s = share;
    s.meet = (await import('./collab-meet.js')).meetFollowers(s, hostKey.key);
  }
  // (a hosted room's meeting: its followers' paths, drawn again as they change, #4643)
  if (host) { const s = share; s.onVia = () => { if (share === s) draw(); }; s.meet.then(m => { s.met = m; s.onVia(); }).catch(() => {}); }
  return share.link;
}

/** Stops sharing: the followers are told, and see the project no longer. */
export async function stopSharing(why = null) {
  if (!share) return;
  const s = share;
  share = null;
  s.hosted = null;
  clearInterval(s.timer);
  s.soon.cancel();
  s.unevents();
  s.activity.stop();
  removeEventListener('silinx:disk-changes', onDisk);
  s.unwatch();
  unbindAll(s.bound);
  unbindDrawings(s.drawn);
  s.restore();
  for (const o of S.docs) o.editor?.setPeers?.([]);
  Object.assign(collab, { role: null, owner: '', project: null, session: null });
  setPresenceRoles(null);
  await s.session.close().catch(() => {});
  s.meet?.then(m => m?.leave()).catch(() => {});   // (once the followers were told)
  draw();
  collabLog(why || `Stopped sharing "${s.project}": its followers no longer see it.`, why ? 'warn' : 'info');
}
export const sharedLink = () => share?.link || null;
export const editorsLink = () => share?.editLink || null;

// a link copied, said in the console
const copyLink = (link = share.link) => { writeClip('text', link); collabLog('Shared project\'s link copied: whoever opens it follows it live, read only.', 'ok'); };
const copyEditorLink = (editLink = share.editLink) => { writeClip('text', editLink); collabLog('Shared project\'s editors\' link copied: whoever opens it edits its text files and drawings with you.', 'ok'); };
const addUser = (module = null) => { const s = share; if (s) import('./collab-users.js').then(m => m.addUserDialog(s, module)); };
// a participant made an editor or a viewer (#3997): the editors' key given to them, or renewed (the link with it)
async function setRole(peer, role) {
  const s = share;
  if (!s) return;
  try {
    if (role === 'editor') await s.session.promote(peer.client);
    else { await s.session.demote(peer.client); s.editLink = followLink(s.base, s.session.room, s.session.key, s.via, s.session.editKey, s.other, s.pub); }
  } catch (e) { collabLog(`ERROR: Sharing: ${e.message}.`, 'err'); return; }
  collabLog(role === 'editor' ? `${peer.name} is an editor now: they edit the project's text files and drawings with you.` : `${peer.name} is a viewer now: the editors' link was renewed (the old one only follows); your other editors keep editing.`, 'ok');
}
// (a participant's role: the Collaboration tab's Viewer | Editor on their row, #4646, setPresenceRoles)
const commands = () => [
  { label: 'Copy View Link', action: () => copyLink() },
  { label: 'Copy Editor Link', action: () => copyEditorLink() },
  { label: 'Add a User…', action: () => addUser() },
  { label: 'Stop Sharing', action: () => stopSharing() },
];

function draw() {
  if (!share) { renderPresence(); return; }
  // (each follower's path, #4643: a hosted room's as its meeting says, a relay's room's through the relay)
  const paths = share.hosted ? hostedPaths(share.hosted.rooms, share.met?.ends, share.met?.meeting.via) : null;
  const peers = withPaths(share.session.peers(), paths);
  const label = share.session.connected?.() === false ? 'Reconnecting…' : peers.length ? `Sharing (${peers.length})` : 'Sharing';
  renderPresence({ label, me: { name: share.name, role: 'owner', color: colorOf(share.doc.clientID), me: true }, peers, mode: share.mode });
}

function onEvent(ev) {
  if (!share) return;
  if (ev.type === 'peers') {
    const now = new Map(share.session.peers().map(p => [p.client, p.name]));
    const role = new Map(share.session.peers().map(p => [p.client, p.role]));
    for (const [c, n] of now) if (!share.known.has(c)) collabLog(role.get(c) === 'editor' ? `${n} edits your project "${share.project}" with you.` : `${n} follows your project "${share.project}".`, 'info');
    for (const [c, n] of share.known) if (!now.has(c)) collabLog(`${n} no longer follows your project.`, 'info');
    share.known = now;
    draw();
    share.soon.poke();   // (their cursors in this page's editors, #4647)
  } else if (ev.type === 'offline') { collabLog(`WARNING: Sharing "${share.project}": the connection to the relay was lost: reconnecting (your followers see the project as it was until it is back).`, 'warn'); draw(); }
  else if (ev.type === 'online') { collabLog(`Sharing "${share.project}": reconnected to the relay: your followers see your changes made meanwhile.`, 'info'); draw(); }
  else if (ev.type === 'closed') stopSharing(`Sharing "${share.project}" ended: ${ev.reason}.`);
  else if (ev.type === 'error') collabLog(`WARNING: Share Project: ${ev.message}.`, 'warn');
}

// the editor in front and its cursor, and the owner's activity (#4002), for the followers; another project opened:
// sharing stops
function track() {
  if (!share) return;
  if (S.project?.name !== share.project) { stopSharing(`Stopped sharing "${share.project}": another project was opened.`); return; }
  keepBound(share.bound, S.docs, share.doc.getMap('files'), editableHere, { mine: true });   // (its text editors, live, #3182)
  keepDrawingsBound(share.drawn, S.docs, share.doc, drawingHere, { mine: true, say: sayLine });   // (its drawings, #3183)
  const d = S.active, path = d?.path || (/^(sch|asm|tt|fsm|pn):/.test(String(d?.id || '')) ? String(d.id).replace(/^[a-z]+:/, '') : null);
  const c = path && d.editor?.getCursor ? d.editor.getCursor() : null;
  share.session.setView(path ? { path, line: c?.line ?? null, ch: c?.ch ?? null, sel: selectionOfDoc(d) } : null);   // (its selection, #4192)
  share.activity.publish();   // (#4002: where it is, its Design pane, its runs)
  // (the followers' cursors, in the text editors they look at)
  const peers = share.session.peers();
  for (const o of S.docs) o.editor?.setPeers?.(peers.filter(x => x.view?.path === o.path && x.view.line !== null).map(x => ({ name: x.name, color: x.color, line: x.view.line, ch: x.view.ch ?? 0 })));
}

// what changes on disk outside the page (#2843): read again into the document
async function onDisk(ev) {
  if (!share || ev.detail?.project !== share.project) return;
  await resync();
}
// (in the editors' queue, #4418: after the changes waiting, and one read of the disk at a time, an older one never
// published after a newer one, nor over an editor's change that arrived during it, #4480)
async function resync() {
  const s = share;
  if (!s) return;
  if (s.queue) return s.queue.again();
  return publishDisk(s);
}
async function publishDisk(s, fresh = () => true) {
  try { const all = await readAll(s.project); if (share === s && fresh()) publishProject(s.doc, { ...all, owner: s.name, bases: s.bases }); } catch { /* the next change reads it */ }
}

// the page's own changes of the project, into the document as they are made (the functions of api.js wrapped while
// the project is shared; restored after)
// (a drawing edited live, #3183: what the page changed in it since its last text put into its structure, what a bound
// one's editor pushed already left as it is)
function hookApi(project, doc, s) {
  const orig = { writeFile: api.writeFile, renameFile: api.renameFile, deleteFile: api.deleteFile, saveProject: api.saveProject };
  const mine = name => name === project;
  const drawn = path => [...s.drawn.keys()].some(d => d.path === path);
  api.writeFile = async (name, path, text) => {
    const r = await orig.writeFile(name, path, text);
    if (mine(name)) {
      putFile(doc, path, text);
      // (a bound drawing's save may have been made before the others' last change: the merge written after it)
      if (liveDrawing(path)) syncDrawing(doc, path, text, s.bases);
      if (liveDrawing(path) && drawn(path)) s.drawing = s.drawing.then(() => writeMerged(s, path)).catch(() => {});
      if (!doc.getMap('files').has(path)) resync();
    }
    return r;
  };
  api.saveProject = async (name, pj) => { const r = await orig.saveProject(name, pj); if (mine(name)) { putProject(doc, pj); resync(); } return r; };
  api.renameFile = async (name, from, to) => { const r = await orig.renameFile(name, from, to); if (mine(name)) resync(); return r; };
  api.deleteFile = async (name, path, opts) => { const r = await orig.deleteFile(name, path, opts); if (mine(name)) resync(); return r; };
  return { restore: () => Object.assign(api, orig), orig };
}

// the files an editor may change here: a text file of the project's that no drawing generates; a drawing edited live
const editableHere = p => editablePath(p) && !S.hdlToSch?.[p] && S.fileTree?.includes(p);
const drawingHere = p => liveDrawing(p) && !!S.fileTree?.includes(p);
const sayLine = text => collabLog(text, /^WARNING/.test(text) ? 'warn' : 'info');

// what the editors change (the document's remote transactions, core/collab-files.js applyEdits): a text file's, written
// to the disk (its open editor, bound, shows it already); a file created, deleted or renamed and the project's
// description (#4418: New Source…, Remove from Project, Delete File…, Rename…, Set as Top Module…), written too, the
// page's project reloaded; anything else (a file of the folder that is not shared, a generated HDL file's text),
// undone (the project published again from the disk), said in the console (#3355: the text through the import gate
// first, as any file from outside, what it refuses not written but undone; the project untrusted before the first
// change is written: an editor's link reaches no ISE nor board until the user trusts it again)
async function onEdits(s, ev) {
  if (share !== s) return false;
  const trash = !api.standalone || api.keepsTrash;
  const store = {
    read: async () => { const { fileTree, ...json } = await api.project(s.project); return { json, fileTree }; },
    write: async (path, text) => {
      await s.orig.writeFile(s.project, path, text);
      for (const d of S.docs) if (d.path === path && d.editor?.getValue() === text) { d.editor.markClean?.(); app.setDirty(d, false); }
    },
    remove: path => s.orig.deleteFile(s.project, path, { trash }),
    saveJson: json => s.orig.saveProject(s.project, json),
    untrust: () => untrustEdited(s),
  };
  const r = await applyEdits(s.doc, ev, store, { generated: new Set(Object.keys(S.hdlToSch || {})), warn: text => collabLog(`WARNING: ${text}.`, 'warn') });
  if (share !== s) return false;
  if (r.undone.length) collabLog(`WARNING: An editor's change undone (a file of the project folder that is not shared, or the text of a file an editor does not change as text): ${r.undone.join(', ')}.`, 'warn');
  // (the page's project as the disk has it now: its Design pane, its open documents; said as an owner's change is; the
  // document from the disk again: a new drawing's structure made, the description as the owner took it)
  const changed = [...ev.changes.filter(c => c.kind !== 'changed' && (r.written.includes(c.path) || r.removed.includes(c.path))),
    ...(r.project ? [{ path: 'silinx.json', kind: 'changed' }] : [])];
  if (changed.length && S.project?.name === s.project) await (await import('./project-watch.js')).applyChanges({ project: s.project, changes: changed, by: 'an editor' });
  return !!(r.undone.length || r.refused || changed.length);   // (published again once no change waits: editQueue)
}

// the shared project, untrusted by an editor's change (#3355): its description saved so (madeBy 'editor'), said in the
// console with the Trust Project button, as an imported project's when it opens
async function untrustEdited(s) {
  if (S.project?.name === s.project && !isTrusted(S.project)) return;
  const { fileTree, ...pj } = await api.project(s.project);   // eslint-disable-line no-unused-vars
  if (!isTrusted(pj)) return;
  const next = markEditedByEditor(pj);
  await s.orig.saveProject(s.project, next);
  if (S.project?.name === s.project) Object.assign(S.project, { trusted: false, madeBy: next.madeBy });
  collabLog(`WARNING: ${untrustedNotice(s.project, next)}`, 'warn', { action: trustAction(s.project) });
}

// what the editors change in the drawings (#3183): the document's remote transactions, each drawing's merged model
// written to the disk, one write after the other (the newest model each time), its HDL generated again from it
function watchDrawings(s) {
  const fn = tr => {
    if (tr.local || share !== s) return;
    const paths = drawingPathsOf(tr);
    if (paths.length) s.drawing = s.drawing.then(() => onDrawingEdits(s, paths)).catch(e => collabLog(`WARNING: an editor's change of a drawing not written: ${e.message}.`, 'warn'));
  };
  s.doc.on('afterTransaction', fn);
  return () => s.doc.off('afterTransaction', fn);
}
async function onDrawingEdits(s, paths) {
  let undo = false;
  for (const path of paths) {
    if (share !== s) return;
    if (!drawingHere(path) || !drawingModel(s.doc, path)) { undo = true; continue; }
    if (!await writeMerged(s, path, { edited: true })) revertDrawing(s.doc, path, s.bases);
  }
  if (undo) {
    collabLog(`WARNING: An editor's change undone (an editor changes the project's text files and drawings only): ${paths.filter(p => !drawingHere(p)).join(', ') || paths.join(', ')}.`, 'warn');
    await resync();
  }
}
// a drawing's merged model written to the disk when it is not what the disk has (its last text put, bases), through
// the import gate (an editor's change: the project untrusted first), its open editor clean, its HDL generated again;
// false: the gate refused it (said)
async function writeMerged(s, path, { edited = false } = {}) {
  const r = drawingModel(s.doc, path);
  if (!r || share !== s) return true;
  if (r.dropped.length) pruneDrawing(s.doc, path);
  const text = drawingText(path, withView(path, r.model, s.bases.get(path)));   // (the owner's own wires' style kept, #4239)
  if (sameDrawing(text, s.bases.get(path))) return true;
  let gated;
  try { gated = gateEdit(path, text); } catch (e) { collabLog(`WARNING: ${path}: an editor's change not written: ${e.reason || e.message}.`, 'warn'); return false; }
  if (edited) await untrustEdited(s);
  await s.orig.writeFile(s.project, path, gated);
  s.bases.set(path, gated);
  putFile(s.doc, path, gated);
  const d = S.docs.find(x => x.path === path && editorOf(x));
  if (d && sameDrawing(drawingText(path, modelOf(editorOf(d))), gated)) app.setDirty(d, false);
  const m = await import('./drawings.js');
  const petri = async (p, x) => { if (x.generatedFile && S.fileTree.includes(x.generatedFile)) await m.syncHdlFromPetri(p, x); };   // (as its save does)
  const circ = async (p, x) => { if (x.generatedFile && S.fileTree.includes(x.generatedFile)) await m.syncHdlFromCircuit(p, x); };   // (as its save does, #4203)
  const sync = { fsm: m.syncHdlFromFsm, tt: m.syncHdlFromTt, asm: m.syncHdlFromAsm, pn: petri, sch: m.syncHdlFromSchematic, circ }[drawingKind(path)];
  await sync(path, r.model).catch(e => collabLog(hdlWarning(`WARNING: HDL not synchronized: ${e.message}`, path, e.message), 'warn'));
  return true;
}
