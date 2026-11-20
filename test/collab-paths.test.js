// How a live share reaches each follower (#4643, core/collab-paths.js): the share's mode from the way chosen; each
// follower's path, from the rooms its owner's page hosts and the relay's meeting (core/collab-meet-relay.js `onVia`);
// then a room met at Silinx's relay on a WebRTC of the tests' (test/fake-rtc.js): a follower through the relay at
// first, direct once its channel opens (told once), through the relay again when the path is lost (told once); one with
// no WebRTC through the relay all along (never told); a follower that leaves, gone from the paths.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { shareMode, hostedPaths, withPaths, MODES, PATHS, MODE_WORDS } from '../core/collab-paths.js';
import { relayMeeting } from '../core/collab-meet-relay.js';
import { meetAsHost, meetOwner, newHostKey } from '../core/collab-meet.js';
import { hostedRooms, FOLLOWER_JOIN } from '../core/collab-loop.js';
import { shareRoom, followRoom } from '../core/collab-client.js';
import { projectDoc, publishProject } from '../core/collab-doc.js';
import { attachRelay } from '../server/collab-relay.js';
import { fakeRtc } from './fake-rtc.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 4000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(5); } };
const live = [];
const keep = p => { live.push(p); return p; };
after(async () => { for (const p of live) { await Promise.race([Promise.resolve(p.closed?.() ? null : p.close?.()).catch(() => {}), sleep(1000)]); await Promise.race([Promise.resolve(p.leave?.()).catch(() => {}), sleep(1000)]); } });

test('#4643 the share\'s mode: hosted peer to peer, at the Cloudflare relay, at a Silinx server\'s relay; its words', () => {
  assert.deepEqual(MODES, ['cloudflare', 'p2p', 'server']);
  assert.deepEqual(PATHS, ['p2p', 'relay']);
  assert.equal(shareMode({ hosted: true }), 'p2p');
  assert.equal(shareMode({ hosted: true, relay: 'https://r.example.workers.dev', cloudflare: true }), 'cloudflare');
  assert.equal(shareMode({ hosted: true, relay: 'http://127.0.0.1:8642' }), 'server');
  assert.equal(shareMode({ relay: 'https://r.example.workers.dev', cloudflare: true }), 'cloudflare');
  assert.equal(shareMode({ relay: 'http://127.0.0.1:8642' }), 'server');
  assert.equal(shareMode(), 'server');
  assert.deepEqual(Object.keys(MODE_WORDS).sort(), [...MODES]);
});

test('#4643 the paths: a hosted room\'s followers peer to peer, those at a relay\'s meeting as it says; a relay\'s room\'s through it; the owner none', () => {
  const [a, b, c] = [{}, {}, {}];
  const rooms = new Map([['R', { followers: new Map([[a, 11], [b, 12], [c, 13]]) }]]);
  // (no meeting, or one with no via: the public meeting point's, the codes': peer to peer)
  assert.deepEqual([...hostedPaths(rooms)], [[11, 'p2p'], [12, 'p2p'], [13, 'p2p']]);
  // (a relay's meeting: its ends as via says; c's socket not among them, a code's: peer to peer)
  const via = id => ({ x: 'direct', y: 'relay' })[id] ?? null;
  assert.deepEqual([...hostedPaths(rooms, new Map([['x', a], ['y', b]]), via)], [[11, 'p2p'], [12, 'relay'], [13, 'p2p']]);
  // (an end the meeting has forgotten (via null): through the relay, as it was until it went)
  assert.deepEqual([...hostedPaths(rooms, new Map([['z', a]]), via)].slice(0, 1), [[11, 'relay']]);
  // (an end that is no follower of the room: nothing)
  assert.deepEqual([...hostedPaths(rooms, new Map([['x', {}]]), via)], [[11, 'p2p'], [12, 'p2p'], [13, 'p2p']]);
  assert.deepEqual([...hostedPaths(new Map())], []);
  assert.deepEqual([...hostedPaths(null)], []);
  const peers = [{ client: 1, name: 'Ana', role: 'owner' }, { client: 11, name: 'Rui', role: 'viewer' }, { client: 99, name: 'Eva', role: 'editor' }];
  assert.deepEqual(withPaths(peers, new Map([[11, 'p2p']])), [{ client: 1, name: 'Ana', role: 'owner' }, { client: 11, name: 'Rui', role: 'viewer', path: 'p2p' }, { client: 99, name: 'Eva', role: 'editor', path: 'relay' }]);
  assert.deepEqual(withPaths(peers).map(p => p.path), [undefined, 'relay', 'relay']);
  assert.deepEqual(peers[1], { client: 11, name: 'Rui', role: 'viewer' }, 'the peers given not changed');
});

test('#4643 at a relay\'s meeting: through the relay first, direct once the channel opens, through the relay again when the path is lost, each told once; no WebRTC: the relay all along; a follower that leaves, gone', async () => {
  const s = http.createServer();
  const relay = attachRelay(s, { tokenOk: t => t === 'tok' });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  const rtc = fakeRtc();
  const told = [];
  const h = hostedRooms();
  const doc = projectDoc();
  publishProject(doc, { project: { name: 'p', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], fileTree: ['src/top.vhd'] }, files: { 'src/top.vhd': 'entity top is end;\n' }, owner: 'Ana' });
  const session = keep(await shareRoom({ url: 'silinx-host:', doc, user: { name: 'Ana' }, WebSocket: h.owner }));
  const hk = await newHostKey();
  const at = keep(await meetAsHost({ meeting: relayMeeting({ url: base, token: 'tok', WebSocket, RTC: rtc.RTC }), room: session.room, key: session.key, hostKey: hk.key, maxReceive: FOLLOWER_JOIN, attach: end => h.follower(end), onVia: (id, via) => told.push([id, via]) }));
  const paths = () => new Map(withPaths(session.peers(), hostedPaths(h.rooms, at.ends, at.meeting.via)).map(p => [p.name, p.path]));
  const follow = async (name, RTC) => {
    const WS = await meetOwner({ meeting: relayMeeting({ url: base, WebSocket, RTC }), room: session.room, key: session.key, host: hk.pub, ms: 4000, maxReceive: 16 << 20 });
    const f = keep(await followRoom({ url: 'silinx-host:', room: session.room, key: session.key, owner: session.ownerKey, user: { name }, WebSocket: WS }));
    await f.ready;
    return f;
  };
  // Rui: through the relay as he joins, then direct
  const rui = await follow('Rui', rtc.RTC);
  const ruiId = [...at.ends.keys()][0];
  await until(() => at.meeting.via(ruiId) === 'direct', 'Rui direct');
  assert.deepEqual(told, [[ruiId, 'direct']]);
  await until(() => paths().get('Rui') === 'p2p', 'Rui P2P in the paths');
  // Eva: no WebRTC, through the relay all along, never told
  const eva = await follow('Eva', null);
  await until(() => paths().get('Eva') === 'relay' && at.ends.size === 2, 'Eva through the relay');
  await sleep(50);
  assert.deepEqual(Object.fromEntries(paths()), { Rui: 'p2p', Eva: 'relay' });
  assert.deepEqual(told, [[ruiId, 'direct']]);
  // the direct path lost: Rui through the relay again, told once
  rtc.cut();
  await until(() => paths().get('Rui') === 'relay', 'Rui through the relay again');
  await sleep(50);
  assert.deepEqual(told, [[ruiId, 'direct'], [ruiId, 'relay']]);
  // Eva leaves: gone from the paths, nothing told
  await eva.close();
  await until(() => !paths().has('Eva'), 'Eva gone');
  assert.deepEqual(Object.fromEntries(paths()), { Rui: 'relay' });
  assert.equal(told.length, 2);
  await rui.close();
  await session.close();
  await at.leave();
  relay.close();
  await new Promise(r => s.close(r));
});
