// The Cloudflare relay (#4541, packages/silinx-relay-cloudflare): its Worker and its Durable Objects, on a shim of the
// Workers runtime (test/workers-shim.js), with the participants of Silinx (core/collab-client.js) over real
// WebSockets: what Silinx's relay does (test/collab.test.js), the same: a project shared and followed, an edit, the
// presence, read only, an editor's signed edits, a follower's frame too large, the owner's connection lost and its room
// resumed or ended; its own checks (its key, the origins, the paths, the room's id in the address); and its rooms asleep
// (the Hibernation API: their memory lost, their sockets kept) made again from their sockets. Its room's logic is
// core/'s, copied as it is.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { readFileSync } from 'node:fs';
import { serveWorker } from './workers-shim.js';
import worker, { RelayRoom, RELAY_LIMITS, NEEDS_KEY, NO_KEY, originsOf } from '../packages/silinx-relay-cloudflare/src/worker.js';
import { RELAY_LIMITS as NODE_LIMITS } from '../server/collab-relay.js';
import { staleCopies, RELAY_CORE } from '../scripts/sync-relay-cloudflare.mjs';
import { projectDoc, publishProject, putFile, docFile, docProject } from '../core/collab-doc.js';
import { shareRoom, followRoom, KIND, PROTOCOL, SUBPROTOCOL, NOT_SHARED } from '../core/collab-client.js';
import { relayUrl, ROOM_RE } from '../core/collab-link.js';
import { roomUrl } from '../core/collab-wire.js';
import { OWNER_LOST } from '../core/collab-room.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(10); } };
const KEY = 'a-relay-key-of-24-characters-or-more';
const PROJECT = { name: 'traffic', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], device: { part: 'xc3s250e' } };
const FILES = { 'src/top.vhd': 'entity top is end;\n', 'src/top.ucf': 'NET "clk" LOC = "B8";\n' };
const owned = () => { const doc = projectDoc(); publishProject(doc, { project: { ...PROJECT, fileTree: Object.keys(FILES) }, files: FILES, owner: 'Ana' }); return doc; };
const errorsOf = list => e => { if (e.type === 'error') list.push(e.message); };

// a relay: limits of the test's (its Durable Objects made with them)
const relayWith = (limits = RELAY_LIMITS, env = {}) => serveWorker({ worker, env: { RELAY_KEY: KEY, ORIGINS: 'https://pmnmalo.github.io', ...env }, objects: { ROOMS: ctx => new RelayRoom(ctx, {}, { limits }) } });
let relay;
before(async () => { relay = await relayWith(); });
after(async () => { await relay.close(); });
const share = (r = relay) => relayUrl(r.url, 'share'), follow = (r = relay) => relayUrl(r.url, 'follow');
// (the room's state in its Durable Object)
const roomOf = (r, room) => r.namespaces.ROOMS.objects.get(room).obj.host.rooms.get(room);

test('its room\'s logic is core/\'s, copied as it is (node scripts/sync-relay-cloudflare.mjs); its limits Silinx\'s relay\'s, one room an object', () => {
  assert.deepEqual(staleCopies(), []);
  assert.deepEqual(RELAY_CORE, ['collab-room.js', 'collab-meeting.js', 'collab-wire.js', 'collab-crypto.js', 'collab-sign.js']);
  // (the server's ping, and its cap on the connections waiting for their first message, #4736: an object holds one room)
  const { ping, waiting, ...node } = NODE_LIMITS;
  assert.deepEqual([ping, waiting], [30_000, 256]);
  assert.deepEqual({ ...RELAY_LIMITS, rooms: node.rooms }, node);
  assert.equal(RELAY_LIMITS.rooms, 1);
  assert.deepEqual(originsOf(' https://a.example/, http://127.0.0.1:8642  https://b.example'), ['https://a.example', 'http://127.0.0.1:8642', 'https://b.example']);
  assert.equal(roomUrl('wss://r.example/api/collab/follow', 'R'.repeat(22)), `wss://r.example/api/collab/follow?room=${'R'.repeat(22)}`);
  assert.equal(roomUrl('silinx-host:', 'R'.repeat(22)), 'silinx-host:');
});

test('#4630 its wrangler.toml says workers_dev and preview_urls, so that a deploy (Deploy to Cloudflare\'s build) warns of neither', () => {
  const toml = readFileSync(new URL('../packages/silinx-relay-cloudflare/wrangler.toml', import.meta.url), 'utf8');
  const top = toml.split(/^\[/m)[0];   // (the top-level keys, before the first table)
  assert.match(top, /^workers_dev = true$/m);
  assert.match(top, /^preview_urls = false$/m);
  assert.match(top, /^name = "silinx-relay"$/m);
});

test('a project shared and followed through it: the project arrives, an edit, the presence both ways, a leave, the end', async () => {
  const doc = owned(), errors = [];
  const owner = await shareRoom({ url: share(), token: KEY, doc, user: { name: 'Ana' }, onEvent: errorsOf(errors) });
  assert.match(owner.room, ROOM_RE);
  assert.ok(relay.namespaces.ROOMS.objects.has(owner.room), 'the room\'s Durable Object is named by its id');
  owner.setView({ path: 'src/top.vhd', line: 0, ch: 7 });
  const fol = await followRoom({ url: follow(), room: owner.room, key: owner.key, user: { name: 'Rui' }, onEvent: errorsOf(errors) });
  await fol.ready;
  assert.deepEqual(docProject(fol.doc).fileTree, ['src/top.ucf', 'src/top.vhd']);
  putFile(doc, 'src/top.vhd', 'entity top is end entity;\n');
  await until(() => docFile(fol.doc, 'src/top.vhd') === 'entity top is end entity;\n', 'the edit');
  await until(() => fol.owner()?.view?.path === 'src/top.vhd', 'the owner\'s view');
  fol.setView({ path: 'src/top.ucf', line: 0, ch: 0 });
  await until(() => owner.peers()[0]?.view?.path === 'src/top.ucf', 'the follower\'s view');
  const fol2 = await followRoom({ url: follow(), room: owner.room, key: owner.key, user: { name: 'Eva' }, onEvent: errorsOf(errors) });
  await fol2.ready;
  await until(() => fol2.peers().length === 2, 'Eva sees both');
  assert.deepEqual(fol2.peers().map(p => [p.name, p.role]), [['Ana', 'owner'], ['Rui', 'viewer']]);
  await fol2.close();
  await until(() => owner.peers().length === 1 && fol.peers().length === 1, 'Eva gone');
  await owner.close();
  await until(() => fol.closed(), 'the follower closed');
  assert.deepEqual(errors, []);
});

test('read only: a follower\'s update refused, said; an editor\'s signed edit reaches everyone', async () => {
  const doc = owned(), errors = [], ferrors = [];
  const owner = await shareRoom({ url: share(), token: KEY, doc, user: { name: 'Ana' }, editors: true, onEvent: errorsOf(errors) });
  const viewer = await followRoom({ url: follow(), room: owner.room, key: owner.key, user: { name: 'Rui' }, onEvent: errorsOf(ferrors) });
  await viewer.ready;
  viewer.send(KIND.update, new Uint8Array([0, 0]));
  await until(() => ferrors.length, 'the refusal');
  assert.deepEqual(ferrors, ['read only: a follower cannot change the shared project']);
  const editor = await followRoom({ url: follow(), room: owner.room, key: owner.key, sign: owner.editKey, user: { name: 'Eva' }, onEvent: errorsOf(errors) });
  await editor.ready;
  editor.doc.getMap('files').get('src/top.vhd').insert(0, '-- Eva\n');
  await until(() => docFile(doc, 'src/top.vhd')?.startsWith('-- Eva') && docFile(viewer.doc, 'src/top.vhd')?.startsWith('-- Eva'), 'the editor\'s edit, at the owner\'s and the viewer\'s');
  await owner.close();
  await until(() => viewer.closed() && editor.closed(), 'the followers closed');
  assert.deepEqual(errors, []);
  assert.deepEqual(ferrors, ['read only: a follower cannot change the shared project']);
});

test('asleep (the Hibernation API): the room made again from its sockets; edits, the presence, an editor\'s edit, a join, a leave and the end go on', async () => {
  const doc = owned(), errors = [];
  const owner = await shareRoom({ url: share(), token: KEY, doc, user: { name: 'Ana' }, editors: true, onEvent: errorsOf(errors) });
  const fol = await followRoom({ url: follow(), room: owner.room, key: owner.key, user: { name: 'Rui' }, onEvent: errorsOf(errors) });
  const editor = await followRoom({ url: follow(), room: owner.room, key: owner.key, sign: owner.editKey, user: { name: 'Eva' }, onEvent: errorsOf(errors) });
  await fol.ready; await editor.ready;
  await until(() => owner.peers().length === 2, 'both in');
  const before = relay.namespaces.ROOMS.objects.get(owner.room).obj;
  relay.hibernate();
  const after = relay.namespaces.ROOMS.objects.get(owner.room).obj;
  assert.notEqual(after, before, 'a new object');
  assert.deepEqual([...roomOf(relay, owner.room).followers.values()].sort(), [fol.doc.clientID, editor.doc.clientID].sort());
  putFile(doc, 'src/top.vhd', 'entity top is end; -- asleep\n');
  await until(() => docFile(fol.doc, 'src/top.vhd') === 'entity top is end; -- asleep\n', 'the owner\'s edit');
  editor.doc.getMap('files').get('src/top.vhd').insert(0, '-- Eva\n');
  await until(() => docFile(doc, 'src/top.vhd')?.startsWith('-- Eva'), 'the editor\'s edit (the room\'s key made again)');
  fol.setView({ path: 'src/top.ucf', line: 1, ch: 0 });
  await until(() => owner.peers().find(p => p.name === 'Rui')?.view?.path === 'src/top.ucf', 'the follower\'s view');
  relay.hibernate();
  const late = await followRoom({ url: follow(), room: owner.room, key: owner.key, user: { name: 'Leo' }, onEvent: errorsOf(errors) });
  await late.ready;
  assert.match(docFile(late.doc, 'src/top.vhd'), /^-- Eva\n/);
  relay.hibernate();
  await editor.close();
  await until(() => owner.peers().length === 2 && fol.peers().length === 2, 'Eva gone');
  relay.hibernate();
  await owner.close();
  await until(() => fol.closed() && late.closed(), 'the followers closed');
  assert.deepEqual(errors, []);
});

test('its key: an owner without it, or with another, refused, said; a relay with no key opens no room; a follower needs none', async () => {
  await assert.rejects(shareRoom({ url: share(), token: 'wrong', doc: owned(), user: { name: 'x' } }), new RegExp(`^Error: ${NEEDS_KEY}$`));
  await assert.rejects(shareRoom({ url: share(), token: null, doc: owned(), user: { name: 'x' } }), new RegExp(`^Error: ${NEEDS_KEY}$`));
  for (const RELAY_KEY of [undefined, '', 'short-key']) {
    const r = await relayWith(RELAY_LIMITS, { RELAY_KEY });
    await assert.rejects(shareRoom({ url: share(r), token: RELAY_KEY || null, doc: owned(), user: { name: 'x' } }), new RegExp(`^Error: ${NO_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    await r.close();
  }
  // (the raw refusal: the reason, then closed 1008)
  const ws = new WebSocket(share(), [SUBPROTOCOL, 'token.wrong']);
  const got = [];
  ws.on('message', d => got.push(JSON.parse(String(d))));
  assert.equal(await new Promise(r => ws.on('close', c => r(c))), 1008);
  assert.deepEqual(got, [{ type: 'error', message: NEEDS_KEY }]);
});

test('its checks before a room: the origins, the paths, a WebSocket, the subprotocol, the room\'s id in the address (#4736: never a meeting point\'s)', async () => {
  const upgrade = (path, headers = {}, protocols = [SUBPROTOCOL]) => new Promise(resolve => {
    const ws = new WebSocket(`${relay.url.replace(/^http/, 'ws')}${path}`, protocols, { headers });
    ws.on('open', () => { ws.close(); resolve('open'); });
    ws.on('unexpected-response', (_, res) => resolve(res.statusCode));
    ws.on('error', () => resolve('error'));
  });
  const room = 'R'.repeat(22);
  assert.equal(await upgrade(`/api/collab/follow?room=${room}`), 'open');
  assert.equal(await upgrade(`/api/collab/follow?room=${room}`, { Origin: 'https://pmnmalo.github.io' }), 'open');
  assert.equal(await upgrade(`/api/collab/follow?room=${room}`, { Origin: 'https://evil.example' }), 403);
  assert.equal(await upgrade('/api/collab/share', { Origin: 'https://evil.example' }, [SUBPROTOCOL, `token.${KEY}`]), 403);
  assert.equal(await upgrade(`/api/collab/follow?room=${room}`, {}, ['other']), 400);
  for (const p of ['/api/collab', '/api/other', '/api/projects', '/x']) assert.equal(await upgrade(p), 404);
  const res = await fetch(`${relay.url}/api/collab/follow`);
  assert.equal(res.status, 426);
  assert.match(await (await fetch(`${relay.url}/`)).text(), /^A relay of Silinx's shared projects/);
  // (no room in the address, an id that is not one, a room never opened: no longer shared, as Silinx's relay says)
  // (#4736: nor a meeting point's object, which only its host and peers reach)
  for (const q of ['', '?room=x', `?room=${room}`, '?room=meet.anything', `?room=meet.${'T'.repeat(32)}`]) {
    const ws = new WebSocket(`${follow()}${q}`, [SUBPROTOCOL]);
    const got = [];
    ws.on('message', d => got.push(JSON.parse(String(d))));
    await new Promise(r => ws.on('open', r));
    ws.send(JSON.stringify({ type: 'join', v: PROTOCOL, room, client: 7 }));
    assert.equal(await new Promise(r => ws.on('close', c => r(c))), 1008);
    assert.deepEqual(got, [{ type: 'error', message: NOT_SHARED }]);
  }
  // (a join that names another room than its address's: that object has no such room)
  const owner = await shareRoom({ url: share(), token: KEY, doc: owned(), user: { name: 'Ana' } });
  const ws = new WebSocket(roomUrl(follow(), room), [SUBPROTOCOL]);
  const got = [];
  ws.on('message', d => got.push(JSON.parse(String(d))));
  await new Promise(r => ws.on('open', r));
  ws.send(JSON.stringify({ type: 'join', v: PROTOCOL, room: owner.room, client: 7 }));
  await new Promise(r => ws.on('close', r));
  assert.deepEqual(got, [{ type: 'error', message: NOT_SHARED }]);
  await owner.close();
});

test('the limits: a follower\'s frame too large closes it (1009), the room and the others kept; followers per room', async () => {
  const r = await relayWith({ ...RELAY_LIMITS, followerFrame: 100, followers: 2 });
  const owner = await shareRoom({ url: share(r), token: KEY, doc: owned(), user: { name: 'Ana' } });
  const errors = [];
  const fol = await followRoom({ url: follow(r), room: owner.room, key: owner.key, user: { name: 'Rui' }, onEvent: errorsOf(errors) });
  await fol.ready;
  const big = new WebSocket(roomUrl(follow(r), owner.room), [SUBPROTOCOL]);
  await new Promise(x => big.on('open', x));
  big.send(JSON.stringify({ type: 'join', v: PROTOCOL, room: owner.room, client: 9 }));
  await until(() => roomOf(r, owner.room).followers.size === 2, 'the second follower in');
  await assert.rejects(followRoom({ url: follow(r), room: owner.room, key: owner.key, user: { name: 'Eva' } }), /has 2 followers already/);
  big.send(new Uint8Array(200));
  assert.equal(await new Promise(x => big.on('close', c => x(c))), 1009);
  await until(() => roomOf(r, owner.room).followers.size === 1, 'the large one gone');
  owner.doc.getMap('files').get('src/top.vhd').insert(0, '-- kept\n');
  await until(() => docFile(fol.doc, 'src/top.vhd')?.startsWith('-- kept'), 'the edit after it');
  assert.deepEqual(errors, []);
  await owner.close();
  await until(() => fol.closed(), 'the follower closed');
  await r.close();
});

test('#3835 the owner\'s connection lost: its room resumed through the relay (the room in its address); not resumed, ended after the grace, the followers told', async () => {
  const r = await relayWith({ ...RELAY_LIMITS, grace: 1500 });   // (past the owner's first try again, 1 s)
  const owner = await shareRoom({ url: share(r), token: KEY, doc: owned(), user: { name: 'Ana' } });
  const fol = await followRoom({ url: follow(r), room: owner.room, key: owner.key, user: { name: 'Rui' } });
  await fol.ready;
  r.sockets()[0].terminate();   // (the owner's: the first)
  await until(() => !owner.connected(), 'the owner\'s loss');
  await until(() => owner.connected(), 'the room resumed', 5000);
  owner.doc.getMap('files').get('src/top.vhd').insert(0, '-- resumed\n');
  await until(() => docFile(fol.doc, 'src/top.vhd')?.startsWith('-- resumed'), 'the edit after the resume');
  await owner.close();
  await until(() => fol.closed(), 'the follower closed');
  // (not resumed: the followers told why, once the grace has passed)
  const owner2 = await shareRoom({ url: share(r), token: KEY, doc: owned(), user: { name: 'Ana' }, reconnect: false });
  let why = null;
  const fol2 = await followRoom({ url: follow(r), room: owner2.room, key: owner2.key, user: { name: 'Rui' }, onEvent: e => { if (e.type === 'closed') why = e.reason; } });
  await fol2.ready;
  const t0 = Date.now();
  r.sockets()[0].terminate();
  await until(() => owner2.closed(), 'the owner\'s session ended');
  await until(() => fol2.closed(), 'the follower closed', 5000);
  assert.ok(Date.now() - t0 >= 1400, `closed after ${Date.now() - t0} ms`);
  assert.equal(why, OWNER_LOST);
  await r.close();
});
