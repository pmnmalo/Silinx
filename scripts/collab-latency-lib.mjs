// The latency of a shared project, from its owner's action to a follower's seeing it (#4647): Silinx's own participants
// (core/collab-client.js shareRoom, followRoom), in one Node process, over each path a follower may take:
// - p2p: the room in the owner's page (core/collab-loop.js hostedRooms), the follower on a data channel of the
//   benchmark's own (a WebRTC channel's messages: frames split in parts and joined again, core/collab-frag.js);
// - node: Silinx's relay (server/collab-relay.js) on a local HTTP server, over real WebSockets;
// - cloudflare: the Cloudflare relay's Worker and Durable Object (packages/silinx-relay-cloudflare) on the Workers shim
//   of the tests (test/workers-shim.js), over real WebSockets;
// each with `rtt` ms added between a participant and the relay (or between the two pages, p2p): half of it each way.
// The cases (CASES): a keystroke, a drawing's edit, the owner's cursor moved (presence, with the page's own pace: how
// often it looks at itself, how often it sends a view), an editor's keystroke back to the owner, the owner's activity
// (a simulation's time), a large paste and a large file added. Each sample is timed from the owner's action to the
// follower's document (or awareness, or activity) having it; `stages()` times what each one costs on its own (the Yjs
// update, sealing and opening it, signing and checking an editor's, splitting it in parts, applying it).
//   measure({ path, rtt, cases, n, pace }) -> { [case]: { n, median, p95, max } }      stages() -> { [case]: {…} }
import http from 'node:http';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { shareRoom, followRoom } from '../core/collab-client.js';
import { projectDoc, publishProject, putFile, docFile } from '../core/collab-doc.js';
import { putDrawing, drawingModel, drawingMap } from '../core/collab-model.js';
import { newFsm } from '../core/fsm.js';
import { relayUrl } from '../core/collab-link.js';
import { hostedRooms, FOLLOWER_JOIN } from '../core/collab-loop.js';
import { splitFrame, frameJoiner } from '../core/collab-frag.js';
import { newKey, seal, unseal } from '../core/collab-crypto.js';
import { newSigner, verifierOf, signFrame, verifyFrame } from '../core/collab-sign.js';
import { KIND } from '../core/collab-wire.js';
import { attachRelay } from '../server/collab-relay.js';
import { serveWorker } from '../test/workers-shim.js';
import worker, { RelayRoom, RELAY_LIMITS } from '../packages/silinx-relay-cloudflare/src/worker.js';
import { TRACK_MS, SOON_MS, VIEW_MS, OWNER_VIEW_MS } from '../core/collab-pace.js';

export const PATHS = Object.freeze(['p2p', 'node', 'cloudflare']);
export const CASES = Object.freeze(['keystroke', 'drawing', 'cursor', 'editor', 'activity', 'paste', 'file']);
/** The page's pace: now (#4647: an event looked at a frame later; the owner's view every OWNER_VIEW_MS, a follower's
 *  every VIEW_MS) and as it was (a look every 300 ms, a view every 250 ms). */
export const PACES = Object.freeze({ now: { track: TRACK_MS, soon: SOON_MS, owner: OWNER_VIEW_MS, view: VIEW_MS }, before: { track: 300, soon: null, owner: 250, view: 250 } });
const PROJECT = { name: 'latency', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], device: { part: 'xc3s250e' } };
const TEXT = 'src/top.vhd', BIG = 'src/big.vhd', FSM = 'src/m.fsm.json';
const PASTE = 256 << 10, FILE = 512 << 10, MOVE_MS = 100;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => performance.now();

/** Sorted samples as { n, median, p95, max } (ms, 0.1 ms). */
export function summary(xs, digits = 1) {
  const s = [...xs].sort((a, b) => a - b);
  const at = q => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
  const r = x => Math.round(x * 10 ** digits) / 10 ** digits;
  return { n: s.length, median: r(at(0.5)), p95: r(at(0.95)), max: r(s[s.length - 1]) };
}

// ---- the delay: a WebSocket whose messages go and come `ms` later (their order kept), the open and the end too
export function delayed(WS, ms) {
  if (!ms) return WS;
  return function DelayedSocket(url, protocols) {
    const ws = new WS(url, protocols);
    const out = new EventTarget();
    const later = f => setTimeout(f, ms);
    const fire = (type, props = {}) => later(() => out.dispatchEvent(Object.assign(new Event(type), props)));
    let state = 0;
    ws.addEventListener('open', () => later(() => { state = 1; out.dispatchEvent(new Event('open')); }));
    ws.addEventListener('message', e => fire('message', { data: e.data }));
    ws.addEventListener('close', e => later(() => { state = 3; out.dispatchEvent(Object.assign(new Event('close'), { code: e.code, reason: e.reason })); }));
    ws.addEventListener('error', () => fire('error'));
    Object.defineProperty(out, 'readyState', { get: () => (ws.readyState >= 2 ? ws.readyState : state) });
    Object.defineProperty(out, 'binaryType', { get: () => ws.binaryType, set: v => { ws.binaryType = v; } });
    Object.defineProperty(out, 'protocol', { get: () => ws.protocol });
    out.send = d => { const c = typeof d === 'string' ? d : d.slice(); later(() => { if (ws.readyState === 1) ws.send(c); }); };
    out.close = (code, reason) => later(() => ws.close(code, reason));
    return out;
  };
}

// ---- p2p: a data channel's two ends, `ms` one way: the follower's (as a WebSocket) and the room's (a room's socket)
function channelPair(ms) {
  const ws = new EventTarget(), end = { readyState: 1, onmessage: () => {}, onclose: () => {} };
  let open = 0, closed = false;
  const later = ms ? f => setTimeout(f, ms) : f => setImmediate(f);   // (no delay: the next turn, as a channel's message)
  const toRoom = frameJoiner(FOLLOWER_JOIN), toFollower = frameJoiner(16 << 20);
  const parts = d => splitFrame(d).map(p => p.slice());   // (a message per part, as a data channel's)
  Object.defineProperty(ws, 'readyState', { get: () => (closed ? 3 : open) });
  Object.assign(ws, {
    binaryType: 'arraybuffer', protocol: '',
    send(d) {
      if (typeof d === 'string') { later(() => end.onmessage(d, false)); return; }
      for (const p of parts(d)) later(() => { const f = toRoom.push(p); if (f) end.onmessage(f, true); });
    },
    close() { if (closed) return; closed = true; end.readyState = 3; later(() => { end.onclose(); ws.dispatchEvent(Object.assign(new Event('close'), { code: 1000 })); }); },
  });
  end.send = d => {
    if (closed) return;
    const msg = f => ws.dispatchEvent(Object.assign(new Event('message'), { data: typeof f === 'string' ? f : f.slice().buffer }));
    if (typeof d === 'string') { later(() => msg(d)); return; }
    for (const p of parts(d)) later(() => { const f = toFollower.push(p); if (f) msg(f); });
  };
  end.close = () => ws.close();
  later(() => { open = 1; ws.dispatchEvent(new Event('open')); });
  return { ws, end };
}

// ---- the paths: { owner: shareRoom's options, follower: followRoom's, close() }
async function pathOf(path, rtt) {
  const half = rtt / 2;
  if (path === 'p2p') {
    const h = hostedRooms();
    const Follower = function ChannelSocket() { const { ws, end } = channelPair(half); h.follower(end); return ws; };
    return { owner: { url: 'silinx-host:', WebSocket: h.owner }, follower: { url: 'silinx-host:', WebSocket: Follower, reconnect: false }, close: async () => {} };
  }
  if (path === 'node') {
    const s = http.createServer();
    const relay = attachRelay(s);
    await new Promise(r => s.listen(0, '127.0.0.1', r));
    const at = role => `ws://127.0.0.1:${s.address().port}/api/collab/${role}`;
    return { owner: { url: at('share'), WebSocket: delayed(WebSocket, half) }, follower: { url: at('follow'), WebSocket: delayed(WebSocket, half) }, close: async () => { relay.close(); await new Promise(r => s.close(r)); } };
  }
  if (path === 'cloudflare') {
    const KEY = 'a-benchmark-key-of-24-characters-or-more';
    const relay = await serveWorker({ worker, env: { RELAY_KEY: KEY, ORIGINS: '' }, objects: { ROOMS: ctx => new RelayRoom(ctx, {}, { limits: RELAY_LIMITS }) } });
    return { owner: { url: relayUrl(relay.url, 'share'), token: KEY, WebSocket: delayed(WebSocket, half) }, follower: { url: relayUrl(relay.url, 'follow'), WebSocket: delayed(WebSocket, half) }, close: () => relay.close() };
  }
  throw new Error(`no such path: ${path} (${PATHS.join(', ')})`);
}

function ownedDoc() {
  const doc = projectDoc();
  publishProject(doc, { project: { ...PROJECT, fileTree: [TEXT, BIG, FSM] }, files: { [TEXT]: 'entity top is end;\n', [BIG]: '-- big\n' }, owner: 'Ana' });
  putDrawing(doc, FSM, newFsm('det'));
  return doc;
}

// a value awaited: `check()` true, looked at at each of `on`'s events (and at once)
function arrival(subscribe, check) {
  return new Promise(resolve => {
    if (check()) { resolve(now()); return; }
    const off = subscribe(() => { if (check()) { off(); resolve(now()); } });
  });
}
const onDoc = doc => fn => { doc.on('afterTransaction', fn); return () => doc.off('afterTransaction', fn); };

// ---- the cases: each sample, its latency (ms)
const CASE = {
  // a character typed into the owner's text (as y-codemirror.next's binding does: one transaction)
  async keystroke({ owner, fol }, i) {
    const yt = owner.doc.getMap('files').get(TEXT), len = yt.length + 1;
    const t0 = now();
    yt.insert(yt.length, String.fromCharCode(97 + (i % 26)));
    return (await arrival(onDoc(fol.doc), () => fol.doc.getMap('files').get(TEXT)?.length === len)) - t0;
  },
  // a state of the owner's state diagram moved (as its editor's push does), the follower's model read again
  async drawing({ owner, fol }, i) {
    const m = structuredClone(drawingModel(owner.doc, FSM).model);
    const x = m.states[0].x + 1 + (i % 5);
    m.states[0].x = x;
    const t0 = now();
    putDrawing(owner.doc, FSM, m, { base: drawingModel(owner.doc, FSM).model, client: owner.doc.clientID });
    return (await arrival(onDoc(fol.doc), () => drawingMap(fol.doc, FSM) && drawingModel(fol.doc, FSM)?.model.states[0].x === x)) - t0;
  },
  // an editor's character, back to the owner (signed, checked)
  async editor({ owner, ed }, i) {
    const yt = ed.doc.getMap('files').get(TEXT), len = yt.length + 1;
    const t0 = now();
    yt.insert(0, String.fromCharCode(65 + (i % 26)));
    return (await arrival(onDoc(owner.doc), () => owner.doc.getMap('files').get(TEXT)?.length === len)) - t0;
  },
  // a large paste into the owner's text, in pieces of 8192 characters (collab-bind.js, editFile)
  async paste({ owner, fol }, i) {
    const yt = owner.doc.getMap('files').get(BIG), len = yt.length + PASTE;
    const text = String.fromCharCode(97 + (i % 26)).repeat(PASTE);
    const t0 = now();
    for (let k = 0; k < text.length; k += 8192) owner.doc.transact(() => yt.insert(yt.length, text.slice(k, k + 8192)));
    return (await arrival(onDoc(fol.doc), () => fol.doc.getMap('files').get(BIG)?.length === len)) - t0;
  },
  // a file added (its whole text: one update)
  async file({ owner, fol }, i) {
    const path = `src/added${i}.vhd`, text = `-- ${i}\n`.padEnd(FILE, 'x');
    const t0 = now();
    putFile(owner.doc, path, text);
    return (await arrival(onDoc(fol.doc), () => docFile(fol.doc, path)?.length === FILE)) - t0;
  },
};

// the owner's page, as web/js/collab-share.js's track(): what it shows (`state.value`) read at each look and given to
// `give` (setView, publish); a look every pace.track, and pace.soon after each event (none: before #4647)
function pagePace(pace, give) {
  const state = { value: null };
  const look = () => give(state.value);
  const timer = setInterval(look, pace.track);
  let t = null;
  const poke = () => { if (pace.soon === null || t) return; t = setTimeout(() => { t = null; look(); }, pace.soon); };
  return { set(v) { state.value = v; poke(); }, stop() { clearInterval(timer); clearTimeout(t); } };
}
// a value moved every MOVE_MS (a cursor while typing, a simulation's time), n times; the latency of each move: until
// the follower has it or a later one (`seen()`: the latest index it has)
async function moving(n, set, subscribe, seen) {
  const at = [], out = [];
  let next = 0;
  const off = subscribe(() => { const k = seen(); const t = now(); while (next < at.length && next <= k) out.push(t - at[next++]); });
  for (let i = 0; i < n; i++) { at.push(now()); set(i); await sleep(MOVE_MS * (0.5 + Math.random())); }
  const t0 = now();
  while (out.length < n && now() - t0 < 5000) await sleep(5);
  off();
  return out;
}
const PACED = {
  cursor: async ({ owner, fol }, n, pace) => {
    const page = pagePace(pace, v => owner.setView(v));
    const subscribe = fn => { fol.awareness.on('change', fn); return () => fol.awareness.off('change', fn); };
    try { return await moving(n, i => page.set({ path: TEXT, line: i, ch: 0 }), subscribe, () => fol.owner()?.view?.line ?? -1); } finally { page.stop(); }
  },
  activity: async ({ owner, fol }, n, pace, events) => {
    const page = pagePace(pace, v => { if (v) owner.publish('sim', v); });
    const subscribe = fn => { events.add(fn); return () => events.delete(fn); };
    try { return await moving(n, i => page.set({ t: i }), subscribe, () => fol.activity('sim')?.t ?? -1); } finally { page.stop(); }
  },
};

/** The latency of each case on `path` with `rtt` ms added: { [case]: summary }. `pace`: PACES' (the page's). */
export async function measure({ path = 'node', rtt = 0, cases = CASES, n = 30, pace = PACES.now } = {}) {
  const p = await pathOf(path, rtt);
  const events = new Set();
  const owner = await shareRoom({ ...p.owner, doc: ownedDoc(), user: { name: 'Ana' }, editors: true, viewMs: pace.owner });
  const fol = await followRoom({ ...p.follower, room: owner.room, key: owner.key, user: { name: 'Rui' }, viewMs: pace.view, onEvent: e => { if (e.type === 'activity') for (const f of events) f(); } });
  await fol.ready;
  const ed = cases.includes('editor') ? await followRoom({ ...p.follower, room: owner.room, key: owner.key, sign: owner.editKey, user: { name: 'Eva' }, viewMs: pace.view }) : null;
  if (ed) await ed.ready;
  const ctx = { owner, fol, ed };
  const out = {};
  try {
    for (const c of cases) {
      if (PACED[c]) { out[c] = summary(await PACED[c](ctx, n, pace, events)); continue; }
      const k = ['paste', 'file'].includes(c) ? Math.max(3, Math.round(n / 5)) : n;
      const xs = [];
      for (let i = 0; i < k; i++) { xs.push(await CASE[c](ctx, i)); await sleep(5); }
      out[c] = summary(xs);
    }
  } finally {
    await ed?.close();
    await fol.close();
    await owner.close();
    await p.close();
  }
  return out;
}

// ---- the stages, each on its own: { [case]: { bytes, update, seal, open, sign, check, split, apply } } (ms, median)
async function timeOf(fn, n) {
  const xs = [];
  for (let i = 0; i < n; i++) { const t0 = now(); await fn(i); xs.push(now() - t0); }
  return summary(xs, 4).median;
}
/** What each case's update costs on its own: making it (the Yjs transaction), sealing and opening it, signing and
 *  checking it (an editor's), splitting it in a data channel's parts and joining them, applying it. */
export async function stages(n = 50) {
  const { key } = await newKey();
  const signer = await newSigner(), verifier = await verifierOf(signer.pub);
  const room = 'AAAAAAAAAAAAAAAAAAAAAA';
  const make = {
    keystroke: d => { const yt = d.getMap('files').get(TEXT); yt.insert(yt.length, 'a'); },
    drawing: d => { const m = structuredClone(drawingModel(d, FSM).model); m.states[0].x += 1; putDrawing(d, FSM, m, { base: drawingModel(d, FSM).model, client: d.clientID }); },
    paste: d => { const yt = d.getMap('files').get(BIG); yt.insert(yt.length, 'p'.repeat(8192)); },
    file: (d, i) => putFile(d, `src/f${i}.vhd`, 'x'.repeat(FILE)),
  };
  const out = {};
  for (const [c, fn] of Object.entries(make)) {
    const updates = [];
    const doc = ownedDoc();
    doc.on('update', u => updates.push(u));
    const update = await timeOf(i => fn(doc, i), n);
    const u = updates[updates.length - 1];
    const frame = await seal(key, room, KIND.update, u);
    const signed = await signFrame(signer.key, room, frame);
    const join = frameJoiner(16 << 20);
    const base = Y.encodeStateAsUpdate(ownedDoc());
    out[c] = {
      bytes: u.length, update,
      seal: await timeOf(() => seal(key, room, KIND.update, u), n),
      open: await timeOf(() => unseal(key, room, frame), n),
      sign: await timeOf(() => signFrame(signer.key, room, frame), n),
      check: await timeOf(() => verifyFrame(verifier, room, signed), n),
      split: await timeOf(() => { let f = null; for (const p of splitFrame(frame)) f = join.push(p); return f; }, n),
    };
    // (apply: the follower's own, measured inside: a new document each time)
    const xs = [];
    for (let i = 0; i < n; i++) { const d = new Y.Doc(); Y.applyUpdate(d, base); const t0 = now(); Y.applyUpdate(d, u); if (c === 'drawing') drawingModel(d, FSM); xs.push(now() - t0); }
    out[c].apply = summary(xs, 4).median;
    out[c].parts = splitFrame(frame).length;
  }
  return out;
}

// ---- a real WebRTC data channel (Playwright's Firefox or WebKit, `npx playwright install firefox webkit`): two peer
// connections of one page over 127.0.0.1, a message sent and sent back `n` times; its one-way time (ms) by size (a
// keystroke's frame, 1 kB, a part of 16 kB): what the p2p path's own channel adds to it. (The page's clock is coarse:
// the mean of many round trips.)
export async function webrtcProbe({ browsers = ['firefox', 'webkit'], sizes = [32, 1024, 16 << 10], n = 300 } = {}) {
  const pw = await import('playwright');
  const prefs = { firefoxUserPrefs: { 'media.peerconnection.ice.obfuscate_host_addresses': false, 'media.peerconnection.ice.loopback': true } };
  const out = {};
  for (const name of browsers) {
    let b;
    try { b = await pw[name].launch(name === 'firefox' ? prefs : {}); } catch (e) { out[name] = { error: e.message.split('\n')[0] }; continue; }
    try {
      const page = await b.newPage();
      out[name] = await page.evaluate(async ({ sizes, n }) => {
        const a = new RTCPeerConnection(), c = new RTCPeerConnection();
        a.onicecandidate = e => e.candidate && c.addIceCandidate(e.candidate);
        c.onicecandidate = e => e.candidate && a.addIceCandidate(e.candidate);
        const da = a.createDataChannel('silinx-collab');
        const dc = await new Promise(async res => {
          c.ondatachannel = e => res(e.channel);
          await a.setLocalDescription(); await c.setRemoteDescription(a.localDescription);
          await c.setLocalDescription(); await a.setRemoteDescription(c.localDescription);
        });
        await new Promise(res => { if (da.readyState === 'open') res(); else da.onopen = res; });
        da.binaryType = dc.binaryType = 'arraybuffer';
        dc.onmessage = e => dc.send(e.data);
        const r = {};
        for (const size of sizes) {
          const t0 = performance.now();
          for (let i = 0; i < n; i++) await new Promise(res => { da.onmessage = res; da.send(new Uint8Array(size)); });
          r[size] = Math.round((performance.now() - t0) / n / 2 * 1000) / 1000;
        }
        return r;
      }, { sizes, n });
    } catch (e) { out[name] = { error: e.message.split('\n')[0] }; } finally { await b.close(); }
  }
  return out;
}
