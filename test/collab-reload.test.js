// A live share and a follow that survive their page loaded again (#4850): core/collab-resume.js's records (kept in the
// tab's sessionStorage, checked when read back), core/collab-client.js's snapshot() and `resumed`, core/collab-room.js's
// word to the followers that the owner is away and back, core/collab-loop.js's hosted room opened again with its id.
// Over the rooms a page hosts (core/collab-loop.js, sockets in the page, no network), given a grace as the relay's: a
// page's reload is its socket closed with no word (its old session ended there, reconnect: false), then a new session
// from its snapshot. The owner's: the same room, its key and editors' key, its followers kept, told 'away' then 'back',
// its changes since reaching them, nothing twice, who is in on both sides again (its awareness's clock past the old
// one). A follower's, an editor: the same client id, its change that never left (sent into a connection lost) reaching
// the owner once, its earlier ones not twice. A hosted room (peer to peer) opened again with the same id and keys,
// its follower back through its transport. A room no longer kept: NOT_SHARED.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { socketPair, hostedRooms, HOST_LIMITS } from '../core/collab-loop.js';
import { shareRoom, followRoom, NOT_SHARED } from '../core/collab-client.js';
import { projectDoc, publishProject, putFile, docFile, editFile } from '../core/collab-doc.js';
import { ownerRecord, followerRecord, readRecord, restoredDoc, toB64, fromB64, RECORD_MAX_AGE, RECORD_VERSION } from '../core/collab-resume.js';
import { newHostKey, hostKeyOf } from '../core/collab-meet.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(5); } };
const PROJECT = { name: 'traffic', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }, { path: 'src/tb.vhd', lang: 'vhdl' }], device: { part: 'xc3s250e' } };
const FILES = { 'src/top.vhd': 'entity top is end;\n', 'src/tb.vhd': '-- the test bench\n' };
const owned = () => { const doc = projectDoc(); publishProject(doc, { project: { ...PROJECT, fileTree: Object.keys(FILES) }, files: FILES, owner: 'Ana' }); return doc; };
const FAST = { delays: [5, 10, 20], for: 2000 };
const live = [];
after(async () => { for (const p of live) await p.close().catch(() => {}); });
const keep = p => { live.push(p); return p; };
const types = ev => ev.map(e => e.type).filter(t => t !== 'peers');
// (a record through the tab's storage: JSON text, read back)
const through = text => readRecord(text);

// the room (a grace as the relay's, but short), the owner's sockets and the follower's kept: the last ones their
// connections now
async function setup({ grace = 2000, editors = true } = {}) {
  const h = hostedRooms({ limits: { ...HOST_LIMITS, grace } });
  const owners = [], follows = [];
  const OwnerSocket = function OwnerSocket(...a) { const s = new h.owner(...a); owners.push(s); return s; };
  const FollowerSocket = function FollowerSocket() { const { client, room } = socketPair(); h.follower(room); follows.push(client); return client; };
  const doc = owned();
  const ownerEv = [];
  // (a page's sessions: no reconnect of their own, as a page that is gone)
  const owner = keep(await shareRoom({ url: 'silinx-host:', doc, user: { name: 'Ana' }, editors, WebSocket: OwnerSocket, onEvent: e => ownerEv.push(e), reconnect: false }));
  const ev = [];
  const f = keep(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, owner: owner.ownerKey, sign: editors ? owner.editKey : null, user: { name: 'Rui' }, WebSocket: FollowerSocket, onEvent: e => ev.push(e), reconnect: FAST }));
  await f.ready;
  await until(() => owner.peers().length === 1 && f.owner(), 'both see each other');
  return { h, owners, follows, OwnerSocket, FollowerSocket, doc, owner, ownerEv, f, ev };
}

test('#4850 the owner\'s page reloaded: the same room and links, its follower told away then back, its changes since there once, who is in again', async () => {
  const { h, owners, OwnerSocket, doc, owner, ownerEv, f, ev } = await setup();
  putFile(doc, 'src/top.vhd', 'entity top is port (a : in bit); end;\n');
  await until(() => docFile(f.doc, 'src/top.vhd') === 'entity top is port (a : in bit); end;\n', 'a change before');
  const rec = through(ownerRecord({ project: 'traffic', name: 'Ana', via: 'relay', session: owner.snapshot(), known: [[f.doc.clientID, 'Rui']], made: { view: true } }));
  assert.equal(rec.session.room, owner.room);
  owners.at(-1).close();   // (the page gone: no word to the room)
  await until(() => owner.closed(), 'the old page\'s session ended');
  await until(() => types(ev).includes('away'), 'the follower told the owner is away');
  assert.deepEqual(ev.find(e => e.type === 'away'), { type: 'away', grace: 2000 });
  assert.equal(f.away(), true);
  assert.equal(f.connected(), true);
  assert.equal(f.owner(), null);   // (its state forgotten while away)
  assert.equal(h.rooms.size, 1);
  // the page again: its document as it was, the disk's change since put into it
  const doc2 = restoredDoc(rec.session);
  assert.equal(doc2.clientID, doc.clientID);
  putFile(doc2, 'src/tb.vhd', '-- changed while the page reloaded\n');
  const ev2 = [];
  const owner2 = keep(await shareRoom({ url: 'silinx-host:', doc: doc2, user: { name: 'Ana' }, editors: true, WebSocket: OwnerSocket, onEvent: e => ev2.push(e), reconnect: false, resumed: rec.session }));
  assert.equal(owner2.room, owner.room);
  assert.equal(owner2.key, owner.key);
  assert.equal(owner2.editKey, owner.editKey);
  await until(() => types(ev).includes('back'), 'the follower told it is back');
  assert.equal(f.away(), false);
  await until(() => docFile(f.doc, 'src/tb.vhd') === '-- changed while the page reloaded\n', 'the change since');
  assert.equal(docFile(f.doc, 'src/top.vhd'), 'entity top is port (a : in bit); end;\n');   // (once, not twice)
  await until(() => owner2.peers().map(p => `${p.name}:${p.role}`).join() === 'Rui:editor' && f.owner()?.name === 'Ana', 'who is in, both sides');
  // (the follower, an editor still: its change reaches the owner's new page)
  editFile(f.doc, 'src/top.vhd', '-- Rui\nentity top is port (a : in bit); end;\n');
  await until(() => docFile(doc2, 'src/top.vhd') === '-- Rui\nentity top is port (a : in bit); end;\n', 'the editor\'s change');
  assert.deepEqual(types(ev), ['away', 'back']);   // (no loss of its own, no error)
  assert.deepEqual(types(ownerEv), ['closed']);
  assert.deepEqual(types(ev2), []);
  await owner2.close();
  await until(() => f.closed(), 'Stop Sharing ends it for the follower, as before');
  assert.equal(ev.at(-1).reason, 'the owner stopped sharing');
});

test('#4850 the owner away past the grace: its follower told the share ended; its page then refused (NOT_SHARED)', async () => {
  const { owners, OwnerSocket, owner, f, ev } = await setup({ grace: 100 });
  const rec = through(ownerRecord({ project: 'traffic', name: 'Ana', via: 'relay', session: owner.snapshot() }));
  owners.at(-1).close();
  await until(() => f.closed(), 'the follower told it ended');
  assert.deepEqual(types(ev), ['away', 'closed']);
  assert.equal(ev.at(-1).reason, 'the owner\'s connection was lost');
  await assert.rejects(shareRoom({ url: 'silinx-host:', doc: restoredDoc(rec.session), user: { name: 'Ana' }, editors: true, WebSocket: OwnerSocket, reconnect: false, resumed: rec.session }), { message: NOT_SHARED });
});

test('#4850 a follower joining while the owner is away is told so; the project comes once it is back', async () => {
  const { owners, OwnerSocket, FollowerSocket, owner } = await setup();
  const rec = through(ownerRecord({ project: 'traffic', name: 'Ana', via: 'relay', session: owner.snapshot() }));
  owners.at(-1).close();
  await until(() => owner.closed(), 'gone');
  const ev = [];
  const g = keep(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, owner: owner.ownerKey, user: { name: 'Eva' }, WebSocket: FollowerSocket, onEvent: e => ev.push(e) }));
  await until(() => g.away(), 'told the owner is away');
  const owner2 = keep(await shareRoom({ url: 'silinx-host:', doc: restoredDoc(rec.session), user: { name: 'Ana' }, editors: true, WebSocket: OwnerSocket, reconnect: false, resumed: rec.session }));
  await g.ready;
  assert.equal(docFile(g.doc, 'src/top.vhd'), FILES['src/top.vhd']);
  assert.deepEqual(types(ev), ['away', 'back']);
  await owner2.close();
});

test('#4850 an editor\'s page reloaded: its client id the same, its change that never left reaching the owner once, its earlier ones not twice; seen again on both sides', async () => {
  const { follows, FollowerSocket, doc, owner, f } = await setup();
  editFile(f.doc, 'src/tb.vhd', '-- the test bench\n-- one\n');
  await until(() => docFile(doc, 'src/tb.vhd') === '-- the test bench\n-- one\n', 'its first change');
  const sock = follows.at(-1);
  sock.send = () => {};   // (sent into a connection that is about to end: never arrives)
  editFile(f.doc, 'src/tb.vhd', '-- the test bench\n-- one\n-- two\n');
  const rec = through(followerRecord({ hash: '#edit=x', name: 'Rui', session: f.snapshot() }));
  assert.equal(rec.session.sign, owner.editKey);
  assert.ok(rec.session.mine);
  sock.close();   // (the page gone)
  await f.close();   // (#4745: and its session with it, which would otherwise join again with its client id first)
  await until(() => owner.peers().length === 0, 'the owner sees it leave');
  assert.equal(docFile(doc, 'src/tb.vhd'), '-- the test bench\n-- one\n');
  const ev = [];
  const f2 = keep(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, owner: owner.ownerKey, sign: rec.session.sign, user: { name: 'Rui' }, WebSocket: FollowerSocket, onEvent: e => ev.push(e), resumed: { ...rec.session, doc: restoredDoc(rec.session) } }));
  await f2.ready;
  assert.equal(f2.doc.clientID, f.doc.clientID);
  await until(() => docFile(doc, 'src/tb.vhd') === '-- the test bench\n-- one\n-- two\n', 'the change that never left, once');
  await sleep(50);
  assert.equal(docFile(doc, 'src/tb.vhd'), '-- the test bench\n-- one\n-- two\n');
  assert.equal(docFile(f2.doc, 'src/tb.vhd'), '-- the test bench\n-- one\n-- two\n');
  await until(() => owner.peers().map(p => `${p.name}:${p.role}`).join() === 'Rui:editor' && f2.owner()?.name === 'Ana', 'seen again, both sides (its awareness\'s clock past the old one)');
  // (and its changes after)
  editFile(f2.doc, 'src/top.vhd', '-- three\n');
  await until(() => docFile(doc, 'src/top.vhd') === '-- three\n', 'a later change');
  assert.deepEqual(types(ev), []);
});

test('#4850 a room the owner\'s page hosts (peer to peer), opened again with its id and keys: its follower back through its transport', async () => {
  let h = hostedRooms();
  const doc = owned();
  const hk = await newHostKey();
  const owner = keep(await shareRoom({ url: 'silinx-host:', doc, user: { name: 'Ana' }, editors: true, WebSocket: function S(...a) { return new h.owner(...a); }, reconnect: false }));
  // (the follower's socket to whichever room the owner's page hosts now)
  const ends = [];
  const FollowerSocket = function FollowerSocket() { const { client, room } = socketPair(); ends.push(room); h.follower(room); return client; };
  const ev = [];
  const f = keep(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, owner: owner.ownerKey, sign: owner.editKey, user: { name: 'Rui' }, WebSocket: FollowerSocket, transport: async () => FollowerSocket, onEvent: e => ev.push(e), reconnect: FAST }));
  await f.ready;
  await until(() => f.listed, 'the editor listed (#4745: its record, as a page\'s at its pagehide, after it)');
  const rec = through(ownerRecord({ project: 'traffic', name: 'Ana', via: 'host', host: { key: hk.text, pub: hk.pub }, session: owner.snapshot() }));
  assert.deepEqual(rec.host, { key: hk.text, pub: hk.pub });
  assert.equal((await hostKeyOf(rec.host.key)).pub, hk.pub);
  // the page gone, its room with it: its data channels end with no word (no room while it loads: a follower's try fails)
  h = { follower: end => end.close() };
  ends.at(-1).close();
  await until(() => types(ev).includes('offline'), 'the follower\'s connection lost');
  h = hostedRooms({ room: rec.session.room });
  const doc2 = restoredDoc(rec.session);
  putFile(doc2, 'src/top.vhd', '-- since\n');
  const owner2 = keep(await shareRoom({ url: 'silinx-host:', doc: doc2, user: { name: 'Ana' }, editors: true, WebSocket: function S(...a) { return new h.owner(...a); }, reconnect: false, resumed: { ...rec.session, resume: null } }));
  assert.equal(owner2.room, owner.room);
  assert.equal(owner2.editKey, owner.editKey);
  await until(() => f.connected(), 'the follower back');
  await until(() => docFile(f.doc, 'src/top.vhd') === '-- since\n', 'the change since');
  editFile(f.doc, 'src/tb.vhd', '-- Rui\n');
  await until(() => docFile(doc2, 'src/tb.vhd') === '-- Rui\n', 'the editor still edits');
  assert.deepEqual(types(ev), ['offline', 'online']);
});

test('#4850 records: kept as JSON and read back; a broken, altered, too old or other version\'s one, or one too large, not resumed', async () => {
  const doc = owned();
  const owner = { client: doc.clientID, doc: Y.encodeStateAsUpdate(doc), key: 'k'.repeat(43), sign: 's'.repeat(129), room: 'r'.repeat(22), resume: 'secret', clock: 7 };
  const at = Date.now();
  const text = ownerRecord({ project: 'traffic', name: 'Ana', via: 'relay', relay: { address: 'https://relay.example', key: '' }, session: owner, bases: new Map([['a.fsm', '{}']]), known: new Map([[5, 'Rui']]), made: { view: true }, at });
  const r = readRecord(text, at + 1000);
  assert.equal(r.role, 'owner');
  assert.deepEqual([r.project, r.name, r.via, r.session.room, r.session.resume, r.session.clock, r.session.client], ['traffic', 'Ana', 'relay', 'r'.repeat(22), 'secret', 7, doc.clientID]);
  assert.deepEqual(r.session.doc, owner.doc);
  assert.deepEqual([...r.bases], [['a.fsm', '{}']]);
  assert.deepEqual([...r.known], [[5, 'Rui']]);
  assert.deepEqual(r.made, { view: true, edit: false });
  const fr = readRecord(followerRecord({ hash: '#view=a.b', name: 'Rui', session: { client: 9, doc: owner.doc, mine: new Uint8Array([1, 2, 3]), clock: 2, sign: null }, following: false, at }), at);
  assert.deepEqual([fr.role, fr.hash, fr.name, fr.following, fr.session.client, fr.session.sign], ['follower', '#view=a.b', 'Rui', false, 9, null]);
  assert.deepEqual([...fr.session.mine], [1, 2, 3]);
  // not resumed
  const alter = f => { const j = JSON.parse(text); f(j); return readRecord(JSON.stringify(j), at); };
  assert.equal(readRecord('{not json', at), null);
  assert.equal(readRecord(null, at), null);
  assert.equal(readRecord(text, at + RECORD_MAX_AGE + 1), null);
  assert.equal(alter(j => { j.v = RECORD_VERSION + 1; }), null);
  assert.equal(alter(j => { j.role = 'admin'; }), null);
  assert.equal(alter(j => { j.session.key = 'short'; }), null);
  assert.equal(alter(j => { j.session.room = '../x'; }), null);
  assert.equal(alter(j => { j.session.client = -1; }), null);
  assert.equal(alter(j => { j.session.sign = 'x'; }), null);
  assert.equal(alter(j => { j.session.doc = '%%%'; }), null);
  assert.equal(alter(j => { j.via = 'mail'; }), null);
  assert.equal(alter(j => { j.host = { key: 'x', pub: 'y' }; }), null);
  assert.equal(alter(j => { j.known = [['x', 'Rui']]; }), null);
  // too large to keep: no record
  assert.equal(ownerRecord({ project: 'p', name: 'Ana', via: 'relay', session: { ...owner, doc: new Uint8Array(1_600_000) } }), null);
});

test('#4850 restoredDoc: the document as it was, its client id the same, its next changes after its own (nothing taken as another page\'s)', () => {
  const doc = owned();
  putFile(doc, 'src/top.vhd', 'entity top is end; -- 1\n');
  const before = Y.encodeStateVector(doc);
  const again = restoredDoc({ client: doc.clientID, doc: Y.encodeStateAsUpdate(doc) });
  assert.equal(again.clientID, doc.clientID);
  assert.deepEqual(Y.encodeStateVector(again), before);
  putFile(again, 'src/top.vhd', 'entity top is end; -- 2\n');
  assert.equal(again.clientID, doc.clientID);   // (not changed: no conflict seen)
  // (the old document takes the new one's changes as its own continued: one text, not two)
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(again, before));
  assert.equal(docFile(doc, 'src/top.vhd'), 'entity top is end; -- 2\n');
  assert.deepEqual(fromB64(toB64(new Uint8Array(70_000).fill(200))), new Uint8Array(70_000).fill(200));
});
