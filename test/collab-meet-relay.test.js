// A relay as the meeting point of a room the owner's page hosts (#4542): the relay's side alone
// (core/collab-meeting.js: one host per topic, its key, a peer's messages to the host only, marked, the limits,
// asleep and awake); then rooms hosted in an owner's page (core/collab-loop.js) met at Silinx's relay and at the
// Cloudflare relay (core/collab-meet-relay.js, on a WebRTC of the tests', test/fake-rtc.js): the project arriving at
// two followers, peer to peer, the relay carrying only the signalling; a network with no direct path, and node's
// participants that have no WebRTC, through the relay; one follower of each; the room's checks the owner's page's (a
// follower's edit refused, an awareness for its sender only); the owner's proof. And the frames a relay carries for a
// three-person session, through the relay's room and peer to peer.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { collabMeetings, MEET_PROTOCOL, NO_HOST, HOST_THERE, NOT_MEETING, PEER_DROPPED, TOPIC_RE, ID_BYTES } from '../core/collab-meeting.js';
import { relayMeeting, meetUrl } from '../core/collab-meet-relay.js';
import { meetAsHost, meetOwner, newHostKey, meetTopic } from '../core/collab-meet.js';
import { hostedRooms, FOLLOWER_JOIN } from '../core/collab-loop.js';
import { shareRoom, followRoom, KIND, SUBPROTOCOL } from '../core/collab-client.js';
import { projectDoc, publishProject, putFile, docFile } from '../core/collab-doc.js';
import { relayUrl } from '../core/collab-link.js';
import { b64url } from '../core/collab-crypto.js';
import { attachRelay } from '../server/collab-relay.js';
import { fakeRtc } from './fake-rtc.js';
import { serveWorker } from './workers-shim.js';
import worker, { RelayRoom, NEEDS_KEY } from '../packages/silinx-relay-cloudflare/src/worker.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 4000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(5); } };
const PROJECT = { name: 'traffic', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], device: { part: 'xc3s250e' } };
const owned = () => { const doc = projectDoc(); publishProject(doc, { project: { ...PROJECT, fileTree: ['src/top.vhd'] }, files: { 'src/top.vhd': 'entity top is end;\n' }, owner: 'Ana' }); return doc; };
const errorsOf = list => e => { if (e.type === 'error') list.push(e.message); };
const live = [];
const keep = p => { live.push(p); return p; };
// (what a test that failed left open: closed, each in a second at most)
const within = p => Promise.race([Promise.resolve(p).catch(() => {}), sleep(1000)]);
after(async () => { await Promise.all(live.map(p => within(p.closed?.() ? null : p.close?.()).then(() => within(p.leave?.())))); });

// (a socket of the hub alone: what it was sent)
function socket() {
  const s = { readyState: 1, got: [], closed: null };
  s.send = (data, { binary } = {}) => s.got.push(binary ? [...data] : JSON.parse(data));
  s.close = (code, reason) => { s.readyState = 3; s.closed = [code, reason]; };
  return s;
}
const hello = JSON.stringify({ type: 'hello', v: MEET_PROTOCOL });
const T = 'T'.repeat(32);
const idBytes = id => [...Uint8Array.from(atob(id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))];

test('the relay\'s side: one host per topic; a peer only where there is one; a peer\'s messages to the host, marked; the host\'s to the peer it names', () => {
  assert.ok(TOPIC_RE.test(T));
  const m = collabMeetings();
  const lone = socket(), pl = m.welcome(lone, 'peer', T);
  pl.message(hello, false);
  assert.deepEqual([lone.got, lone.closed], [[{ type: 'error', message: NO_HOST }], [1008, 'refused']]);
  const host = socket(), h = m.welcome(host, 'host', T);
  h.message(hello, false);
  const hid = host.got[0].self;
  assert.deepEqual(host.got, [{ type: 'welcome', self: hid, host: hid }]);
  const second = socket();
  m.welcome(second, 'host', T).message(hello, false);
  assert.deepEqual(second.got, [{ type: 'error', message: HOST_THERE }]);
  const a = socket(), pa = m.welcome(a, 'peer', T), b = socket(), pb = m.welcome(b, 'peer', T);
  pa.message(hello, false); pb.message(hello, false);
  const [aid, bid] = [a.got[0].self, b.got[0].self];
  assert.deepEqual(a.got, [{ type: 'welcome', self: aid, host: hid }]);
  assert.deepEqual(host.got.slice(1), [{ type: 'peer', id: aid }, { type: 'peer', id: bid }]);
  host.got.length = a.got.length = b.got.length = 0;
  // (a peer that names another peer: to the host still, marked with its own id)
  pa.message(Uint8Array.from([...idBytes(bid), 7, 7]), true);
  assert.deepEqual([host.got, b.got], [[[...idBytes(aid), 7, 7]], []]);
  h.message(Uint8Array.from([...idBytes(bid), 9]), true);
  assert.deepEqual([a.got, b.got], [[], [[...idBytes(hid), 9]]]);
  // (a peer leaves: the host told; the host leaves: the others told, closed, the topic gone)
  pa.close();
  assert.deepEqual(host.got.at(-1), { type: 'leave', id: aid });
  h.close();
  assert.deepEqual([b.got.at(-1), b.closed, m.topics.size], [{ type: 'leave', id: hid }, [1000, 'closed'], 0]);
  // (not a hello of this version: refused)
  for (const first of [JSON.stringify({ type: 'hello', v: 0 }), '{', JSON.stringify({ type: 'join', v: MEET_PROTOCOL })]) {
    const s = socket();
    m.welcome(s, 'host', T).message(first, false);
    assert.deepEqual(s.got, [{ type: 'error', message: NOT_MEETING }]);
  }
});

test('the relay\'s side: the limits (peers, a peer\'s message, its rate); asleep and awake (restore), its messages still marked', () => {
  let t = 0;
  const m = collabMeetings({ limits: { peers: 1, peerFrame: 40, peerRate: 1, peerBurst: 2 }, now: () => t });
  const host = socket(), h = m.welcome(host, 'host', T);
  h.message(hello, false);
  const a = socket(), pa = m.welcome(a, 'peer', T), b = socket();
  pa.message(hello, false);
  m.welcome(b, 'peer', T).message(hello, false);
  assert.deepEqual(b.got, [{ type: 'error', message: 'this shared project has 1 followers already' }]);
  host.got.length = 0;
  pa.message(new Uint8Array(41), true);
  assert.equal(host.got.length, 0, 'too large: dropped');
  for (let k = 0; k < 3; k++) pa.message(new Uint8Array(20), true);
  assert.equal(host.got.length, 2);
  assert.deepEqual(a.got.at(-1), { type: 'error', message: PEER_DROPPED });
  t = 1000;
  pa.message(new Uint8Array(20), true);
  assert.equal(host.got.length, 3);
  // (its memory lost: made again from what each socket is)
  const kept = new Map();
  const m1 = collabMeetings({ keep: (s, st) => kept.set(s, st) });
  const host1 = socket(), a1 = socket();
  m1.welcome(host1, 'host', T).message(hello, false);
  m1.welcome(a1, 'peer', T).message(hello, false);
  const m2 = collabMeetings();
  const ends = m2.restore([...kept]);
  host1.got.length = 0;
  ends.get(a1).message(Uint8Array.from([...new Uint8Array(ID_BYTES), 5]), true);
  assert.deepEqual(host1.got, [[...idBytes(kept.get(a1).id), 5]]);
  // (a peer whose host is not among them: told, closed)
  const lost = socket();
  collabMeetings().restore([[lost, { role: 'peer', topic: T, id: kept.get(a1).id }]]);
  assert.deepEqual([lost.got, lost.closed], [[{ type: 'leave', id: null }], [1000, 'closed']]);
});

// Silinx's relay on a server of the test's (its token: 'tok'), each client's WebSocket counted
async function nodeRelay() {
  const s = http.createServer();
  const relay = attachRelay(s, { tokenOk: t => t === 'tok' });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${s.address().port}`, relay, close: async () => { relay.close(); await new Promise(r => s.close(r)); } };
}
// (the frames a relay carries: what its participants send it and what it sends them)
function counted() {
  const n = { frames: 0 };
  class Counted extends WebSocket {
    constructor(...a) { super(...a); this.on('message', () => { n.frames++; }); }
    send(d, ...r) { n.frames++; return super.send(d, ...r); }
  }
  return { n, WebSocket: Counted };
}

// the owner's page: its room, its participant, at the relay's meeting point
async function hostAt(meeting, onEvent = () => {}) {
  const h = hostedRooms();
  const session = keep(await shareRoom({ url: 'silinx-host:', doc: owned(), user: { name: 'Ana' }, WebSocket: h.owner, editors: true, onEvent }));
  const hk = await newHostKey();
  const at = keep(await meetAsHost({ meeting, room: session.room, key: session.key, hostKey: hk.key, maxReceive: FOLLOWER_JOIN, attach: end => h.follower(end) }));
  return { session, hk, at, h };
}
const followAt = async (meeting, o, name, more = {}) => {
  const WS = await meetOwner({ meeting, room: o.session.room, key: o.session.key, host: o.hk.pub, ms: 4000, maxReceive: 16 << 20 });
  const f = keep(await followRoom({ url: 'silinx-host:', room: o.session.room, key: o.session.key, owner: o.session.ownerKey, user: { name }, WebSocket: WS, ...more }));
  await f.ready;
  return f;
};

test('peer to peer: two followers meet the owner\'s page at Silinx\'s relay, their path direct; the project, an edit, the presence; the relay carries the signalling only; the paths lost, through the relay again', async () => {
  const r = await nodeRelay(), c = counted(), rtc = fakeRtc();
  const point = token => relayMeeting({ url: r.base, token, WebSocket: c.WebSocket, RTC: rtc.RTC });
  const errors = [];
  const o = await hostAt(point('tok'), errorsOf(errors));
  const rui = await followAt(point(), o, 'Rui', { onEvent: errorsOf(errors) });
  const eva = await followAt(point(), o, 'Eva', { onEvent: errorsOf(errors) });
  await until(() => [...o.at.ends.keys()].every(id => o.at.meeting.via(id) === 'direct') && o.at.ends.size === 2, 'both direct');
  assert.equal(rtc.net.connections, 2);
  const before = c.n.frames;
  putFile(o.session.doc, 'src/top.vhd', 'entity top is end; -- 1\n');
  await until(() => docFile(rui.doc, 'src/top.vhd') === 'entity top is end; -- 1\n' && docFile(eva.doc, 'src/top.vhd') === 'entity top is end; -- 1\n', 'the edit at both');
  rui.setView({ path: 'src/top.vhd', line: 0, ch: 3 });
  await until(() => eva.peers().find(p => p.name === 'Rui')?.view?.ch === 3, 'Rui\'s view at Eva\'s (through the owner\'s page)');
  assert.equal(c.n.frames, before, 'nothing more through the relay');
  // (the direct paths lost: through the relay again, on their own)
  rtc.cut();
  await until(() => [...o.at.ends.keys()].every(id => o.at.meeting.via(id) === 'relay'), 'both through the relay');
  putFile(o.session.doc, 'src/top.vhd', 'entity top is end; -- cut\n');
  await until(() => docFile(rui.doc, 'src/top.vhd') === 'entity top is end; -- cut\n' && docFile(eva.doc, 'src/top.vhd') === 'entity top is end; -- cut\n', 'the edit after the cut');
  rui.setView({ path: 'src/top.vhd', line: 0, ch: 4 });
  await until(() => eva.peers().find(p => p.name === 'Rui')?.view?.ch === 4, 'Rui\'s view after the cut');
  assert.ok(c.n.frames > before);
  assert.deepEqual(errors, []);
  for (const f of [rui, eva]) await f.close();
  await o.session.close();
  await o.at.leave();
  await r.close();
});

test('no direct path (a network with no UDP, or node with no WebRTC): through the relay, the same project, the same checks; one follower of each', async () => {
  const r = await nodeRelay(), c = counted();
  const rtc = fakeRtc({ blocked: () => true });
  const errors = [], ferrors = [];
  const o = await hostAt(relayMeeting({ url: r.base, token: 'tok', WebSocket: c.WebSocket, RTC: rtc.RTC }), errorsOf(errors));
  const rui = await followAt(relayMeeting({ url: r.base, WebSocket: c.WebSocket, RTC: rtc.RTC }), o, 'Rui', { onEvent: errorsOf(ferrors) });
  const eva = await followAt(relayMeeting({ url: r.base, WebSocket: c.WebSocket, RTC: null }), o, 'Eva', { onEvent: errorsOf(errors) });
  await until(() => [...o.at.ends.keys()].every(id => o.at.meeting.via(id) === 'relay') && o.at.ends.size === 2, 'both through the relay');
  putFile(o.session.doc, 'src/top.vhd', 'entity top is end; -- 2\n');
  await until(() => docFile(rui.doc, 'src/top.vhd') === 'entity top is end; -- 2\n' && docFile(eva.doc, 'src/top.vhd') === 'entity top is end; -- 2\n', 'the edit at both');
  // (the room's checks, the owner's page's: a follower's update refused, its awareness for its sender only)
  const other = projectDoc();
  Y.applyUpdate(other, Y.encodeStateAsUpdate(rui.doc));
  const sv = Y.encodeStateVector(other);
  putFile(other, 'src/top.vhd', 'hacked');
  rui.send(KIND.update, Y.encodeStateAsUpdate(other, sv));
  await until(() => ferrors.length, 'the refusal');
  assert.deepEqual(ferrors, ['read only: a follower cannot change the shared project']);
  rui.awareness.setLocalStateField('role', 'owner');
  await sleep(100);
  assert.equal(docFile(o.session.doc, 'src/top.vhd'), 'entity top is end; -- 2\n');
  assert.deepEqual(o.session.peers().map(p => p.role).sort(), ['viewer', 'viewer']);
  assert.deepEqual(errors, []);
  for (const f of [rui, eva]) await f.close();
  await o.session.close();
  await o.at.leave();
  await r.close();
});

test('mixed: one follower direct, the other through the relay; an editor\'s edit from each reaches the others', async () => {
  const r = await nodeRelay();
  let n = 0;
  const rtc = fakeRtc({ blocked: () => ++n > 1 });   // (the first connection made, the second refused)
  const errors = [];
  const o = await hostAt(relayMeeting({ url: r.base, token: 'tok', WebSocket, RTC: rtc.RTC }), errorsOf(errors));
  const rui = await followAt(relayMeeting({ url: r.base, WebSocket, RTC: rtc.RTC }), o, 'Rui', { sign: o.session.editKey, onEvent: errorsOf(errors) });
  await until(() => o.at.meeting.via([...o.at.ends.keys()][0]) === 'direct', 'Rui direct');
  const eva = await followAt(relayMeeting({ url: r.base, WebSocket, RTC: rtc.RTC }), o, 'Eva', { sign: o.session.editKey, onEvent: errorsOf(errors) });
  await until(() => o.at.meeting.via([...o.at.ends.keys()][1]) === 'relay', 'Eva through the relay');
  rui.doc.getMap('files').get('src/top.vhd').insert(0, '-- Rui\n');
  await until(() => docFile(eva.doc, 'src/top.vhd')?.startsWith('-- Rui'), 'Rui\'s edit at Eva\'s');
  eva.doc.getMap('files').get('src/top.vhd').insert(0, '-- Eva\n');
  await until(() => docFile(rui.doc, 'src/top.vhd')?.startsWith('-- Eva') && docFile(o.session.doc, 'src/top.vhd')?.startsWith('-- Eva'), 'Eva\'s edit at Rui\'s and the owner\'s');
  assert.deepEqual(errors, []);
  for (const f of [rui, eva]) await f.close();
  await o.session.close();
  await o.at.leave();
  await r.close();
});

test('the relay\'s meeting point refuses: a host without the token, a follower where no owner is; the address', async () => {
  const r = await nodeRelay();
  const topic = await meetTopic('R'.repeat(22));
  assert.equal(meetUrl('https://relay.example/x', 'peer', topic), `wss://relay.example/api/collab/meet/peer?topic=${topic}`);
  await assert.rejects(relayMeeting({ url: r.base, token: 'wrong', WebSocket }).join({ topic, password: 'k'.repeat(43) }), /^Error: sharing a project needs this Silinx server's token$/);
  await assert.rejects(relayMeeting({ url: r.base, WebSocket }).join({ topic, password: 'k'.repeat(43), answers: false }), new RegExp(`^Error: ${NO_HOST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  // (a topic that is not one: not found)
  const code = await new Promise(res => { const ws = new WebSocket(`${r.base.replace('http', 'ws')}/api/collab/meet/peer?topic=x`, [SUBPROTOCOL]); ws.on('unexpected-response', (_, x) => res(x.statusCode)); ws.on('open', () => res('open')); });
  assert.equal(code, 404);
  await r.close();
});

test('at the Cloudflare relay: its key for the host; two followers met, direct; asleep in the middle, the session goes on', async () => {
  const KEY = 'a-relay-key-of-24-characters-or-more';
  const w = await serveWorker({ worker, env: { RELAY_KEY: KEY, ORIGINS: '' }, objects: { ROOMS: ctx => new RelayRoom(ctx, {}) } });
  const rtc = fakeRtc();
  const topic = await meetTopic('R'.repeat(22));
  await assert.rejects(relayMeeting({ url: w.url, token: 'wrong', WebSocket }).join({ topic, password: 'k'.repeat(43) }), new RegExp(`^Error: ${NEEDS_KEY}$`));
  const errors = [];
  const o = await hostAt(relayMeeting({ url: w.url, token: KEY, WebSocket, RTC: rtc.RTC }), errorsOf(errors));
  const rui = await followAt(relayMeeting({ url: w.url, WebSocket, RTC: null }), o, 'Rui', { onEvent: errorsOf(errors) });
  w.hibernate();
  const eva = await followAt(relayMeeting({ url: w.url, WebSocket, RTC: rtc.RTC }), o, 'Eva', { onEvent: errorsOf(errors) });
  w.hibernate();
  putFile(o.session.doc, 'src/top.vhd', 'entity top is end; -- 3\n');
  await until(() => docFile(rui.doc, 'src/top.vhd') === 'entity top is end; -- 3\n' && docFile(eva.doc, 'src/top.vhd') === 'entity top is end; -- 3\n', 'the edit at both');
  assert.deepEqual([...o.at.ends.keys()].map(id => o.at.meeting.via(id)), ['relay', 'direct']);
  assert.deepEqual(errors, []);
  for (const f of [rui, eva]) await f.close();
  await o.session.close();
  await o.at.leave();
  await w.close();
});

// a scripted session of three: the owner edits, everyone moves their cursor
async function script(owner, followers) {
  for (let k = 0; k < 20; k++) {
    putFile(owner.doc, 'src/top.vhd', `entity top is end; -- ${k}\n`);
    owner.setView({ path: 'src/top.vhd', line: 0, ch: k });
    for (const [i, f] of followers.entries()) f.setView({ path: 'src/top.vhd', line: i + 1, ch: k });
    await sleep(260);   // (a view at most every 250 ms: collab-select.js's pacer)
  }
  await until(() => followers.every(f => docFile(f.doc, 'src/top.vhd') === 'entity top is end; -- 19\n'), 'the last edit', 15000);
  await sleep(300);
}

test('the frames a relay carries for a session of three (20 edits, 60 moves): through the relay\'s room, and peer to peer through its meeting point', async t => {
  const r = await nodeRelay();
  // (through the relay's room: every frame)
  const a = counted();
  const owner = keep(await shareRoom({ url: relayUrl(r.base, 'share'), token: 'tok', doc: owned(), user: { name: 'Ana' }, WebSocket: a.WebSocket }));
  const fs = [];
  for (const name of ['Rui', 'Eva']) { const f = keep(await followRoom({ url: relayUrl(r.base, 'follow'), room: owner.room, key: owner.key, owner: owner.ownerKey, user: { name }, WebSocket: a.WebSocket })); await f.ready; fs.push(f); }
  const a0 = a.n.frames;
  await script(owner, fs);
  const viaRoom = a.n.frames - a0;
  for (const f of fs) await f.close();
  await owner.close();
  // (peer to peer: the signalling only)
  const b = counted(), rtc = fakeRtc();
  const o = await hostAt(relayMeeting({ url: r.base, token: 'tok', WebSocket: b.WebSocket, RTC: rtc.RTC }));
  const gs = [];
  for (const name of ['Rui', 'Eva']) gs.push(await followAt(relayMeeting({ url: r.base, WebSocket: b.WebSocket, RTC: rtc.RTC }), o, name));
  await until(() => o.at.ends.size === 2 && [...o.at.ends.keys()].every(id => o.at.meeting.via(id) === 'direct'), 'both direct');
  // (the switches, the last messages through the relay, delivered: its count still for 300 ms)
  for (let last = -1; last !== b.n.frames;) { last = b.n.frames; await sleep(300); }
  const setup = b.n.frames;
  await script(o.session, gs);
  const viaP2P = b.n.frames - setup;
  t.diagnostic(`the relay carried ${viaRoom} frames through its room, ${viaP2P} peer to peer (${setup} to meet and connect); the channels carried ${rtc.net.sent}`);
  assert.ok(viaRoom > 150, `through the room: ${viaRoom}`);
  assert.equal(viaP2P, 0);
  // (#4660: to meet, the signalling, always the same: 3 hellos, 3 welcomes and the host's 2 notices of a peer (JSON), each
  // follower's offer and the host's answer, and each side's switch (sealed), these 8 counted where sent and where
  // received: 24; then the room's own frames that went through the relay before a follower's channel opened, which the
  // timing decides (3 to 8 messages measured, each counted twice): at most what the opening and the joins take through
  // a relay's room (a0, measured above: about 20), and the owner's proof to each follower)
  const SIGNALLING = 24;
  assert.ok(setup >= SIGNALLING && setup <= SIGNALLING + a0 + 4, `to meet: ${setup} (the signalling ${SIGNALLING}, the room's frames at its joins ${a0})`);
  for (const f of gs) await f.close();
  await o.session.close();
  await o.at.leave();
  await r.close();
});
