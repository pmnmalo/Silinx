// A shared project's room against floods and replays (#4736, core/collab-room.js, core/collab-sign.js), alone, on sockets
// of the test's own: an editor's edits limited by a token bucket (past it, closed 1008), the edits waiting for their
// signature's check capped, the signatures not the room's counted (past `editsBad`, closed); a follower's frames in a
// room without editors dropped at once, told once; an editor's frame forwarded once only (a replay, by the same socket
// or another, dropped; each session's counter in its IV, signed); an older page's random IVs still pass; a rekey keeps
// the filter. The server relay's cap on the connections waiting for their first message: test/collab.test.js style,
// over WebSockets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collabRooms, ROOM_LIMITS, READ_ONLY, EDITS_REFUSED } from '../core/collab-room.js';
import { KIND, PROTOCOL } from '../core/collab-client.js';
import { newKey, seal, unseal } from '../core/collab-crypto.js';
import { newSigner, signFrame, editIvs, editSeq, editsSeen } from '../core/collab-sign.js';

function socket() {
  const s = { readyState: 1, got: [], closed: null };
  s.send = (data, { binary } = {}) => s.got.push(binary ? [...data] : JSON.parse(data));
  s.close = (code, reason) => { s.readyState = 3; s.closed = [code, reason]; };
  return s;
}
const text = o => JSON.stringify({ v: PROTOCOL, ...o });
const settle = () => new Promise(r => setTimeout(r, 30));
const binaries = s => s.got.filter(m => Array.isArray(m));
const errors = s => s.got.filter(m => m.type === 'error').map(m => m.message);

async function room(limits = {}, now = undefined) {
  const signer = await newSigner(), key = (await newKey()).key;
  const host = collabRooms({ limits: { ...ROOM_LIMITS, ...limits }, ...(now && { now }) });
  const owner = socket(), o = host.welcome(owner, 'owner');
  o.message(text({ type: 'open', client: 1, editors: signer.pub }), false);
  const id = owner.got[0].room;
  const join = client => { const s = socket(), p = host.welcome(s, 'follower'); p.message(text({ type: 'join', room: id, client }), false); s.got.length = 0; return [s, p]; };
  const ivs = editIvs();
  const edit = async (bytes = [1, 2, 3], iv = ivs()) => signFrame(signer.key, id, await seal(key, id, KIND.edit, Uint8Array.from(bytes), iv));
  return { host, owner, o, id, join, edit, signer, key };
}

test('#4736 an editor\'s IVs: 8 bytes of its session, then a counter; unique across sessions; the frame still unsealed', async () => {
  const a = editIvs(), b = editIvs();
  const [a0, a1, b0] = [a(), a(), b()];
  assert.deepEqual([...a0.subarray(0, 8)], [...a1.subarray(0, 8)]);
  assert.notDeepEqual([...a0.subarray(0, 8)], [...b0.subarray(0, 8)]);
  assert.deepEqual([[...a0.subarray(8)], [...a1.subarray(8)]], [[0, 0, 0, 0], [0, 0, 0, 1]]);
  const key = (await newKey()).key, f = await seal(key, 'r', KIND.edit, Uint8Array.from([7]), a1);
  assert.equal(editSeq(f).n, 1);
  assert.deepEqual([...(await unseal(key, 'r', f)).bytes], [7]);
  assert.equal(editSeq(Uint8Array.from([1, 2])), null);
  // the filter: a session's frames in order, each once; another session's apart; the oldest sessions forgotten past its size
  const seen = editsSeen(2);
  const at = (s, n) => { const x = new Uint8Array(13); x[1] = s; new DataView(x.buffer).setUint32(9, n); return x; };
  assert.deepEqual([seen(at(1, 0)), seen(at(1, 1)), seen(at(1, 1)), seen(at(1, 0)), seen(at(2, 0)), seen(at(1, 5))], [true, true, false, false, true, true]);
  seen(at(3, 0));   // (session 2 the oldest now: forgotten)
  assert.deepEqual([seen(at(1, 5)), seen(at(2, 0))], [false, true]);
});

test('#4736 an editor\'s frame forwarded once: a replay (by another follower, or the same) dropped; a rekey keeps the filter', async () => {
  const { owner, join, edit, o } = await room();
  const [, pe] = join(7), [, px] = join(8), [watch] = join(9);
  const f = await edit();
  pe.message(f, true);
  await settle();
  assert.equal(binaries(owner).length, 1);
  px.message(f, true);   // (a follower that saw it sends it again)
  pe.message(f, true);
  await settle();
  assert.equal(binaries(owner).length, 1, 'the replay goes no further');
  assert.equal(binaries(watch).length, 1);
  pe.message(await edit([4]), true);
  await settle();
  assert.equal(binaries(owner).length, 2, 'the next one passes');
  // an older page's frames (random IVs): each passes once
  const old = await edit([5], crypto.getRandomValues(new Uint8Array(12)));
  pe.message(old, true);
  pe.message(old, true);
  await settle();
  assert.equal(binaries(owner).length, 3);
  // (a rekey: the same filter; the replay still dropped)
  o.message(JSON.stringify({ type: 'rekey', editors: (await newSigner()).pub }), false);
  px.message(f, true);
  await settle();
  assert.equal(binaries(owner).length, 3);
  assert.deepEqual(errors(owner), []);
});

test('#4736 an editor\'s edits faster than the bucket: closed (1008); the bucket refills', async () => {
  let t = 0;
  const { owner, join, edit } = await room({ editRate: 2, editBurst: 3 }, () => t);
  const [e, pe] = join(7);
  for (let i = 0; i < 3; i++) pe.message(await edit([i]), true);
  await settle();
  assert.equal(binaries(owner).length, 3);
  assert.equal(e.closed, null);
  t = 500;   // (one more token)
  pe.message(await edit([3]), true);
  await settle();
  assert.equal(binaries(owner).length, 4);
  pe.message(await edit([4]), true);
  assert.deepEqual([errors(e), e.closed], [[EDITS_REFUSED], [1008, 'refused']]);
  assert.deepEqual([ROOM_LIMITS.editRate, ROOM_LIMITS.editBurst, ROOM_LIMITS.editsPending, ROOM_LIMITS.editsBad], [50, 200, 64, 8]);
});

test('#4736 too many edits waiting for their check: closed; signatures not the room\'s: told, closed past editsBad', async () => {
  const { join, edit } = await room({ editsPending: 2, editsBad: 3 });
  const [e, pe] = join(7);
  const f = await edit();
  for (let i = 0; i < 3; i++) pe.message(f, true);   // (the third while two wait)
  assert.deepEqual([errors(e), e.closed], [[EDITS_REFUSED], [1008, 'refused']]);
  const [x, px] = join(8);
  const forged = Uint8Array.from([...(await edit([9])).slice(0, -64), ...new Uint8Array(64)]);
  px.message(forged, true);
  px.message(forged, true);
  await settle();
  const NOT = 'read only: this link cannot change the shared project (not an editor\'s)';
  assert.deepEqual([errors(x), x.closed], [[NOT, NOT], null]);
  px.message(forged, true);
  await settle();
  assert.deepEqual([errors(x), x.closed], [[NOT, NOT, EDITS_REFUSED], [1008, 'refused']]);
});

test('#4736 a room without editors: a follower\'s edits and updates dropped at once, the follower told once', async () => {
  const host = collabRooms();
  const owner = socket();
  host.welcome(owner, 'owner').message(text({ type: 'open', client: 1 }), false);
  const f = socket(), pf = host.welcome(f, 'follower');
  pf.message(text({ type: 'join', room: owner.got[0].room, client: 7 }), false);
  for (let i = 0; i < 100; i++) pf.message(Uint8Array.from([i % 2 ? KIND.edit : KIND.update, ...new Array(64).fill(1)]), true);
  await settle();
  assert.deepEqual(errors(f), [READ_ONLY]);
  assert.equal(f.closed, null);
  assert.equal(binaries(owner).length, 0);
});

test('#4736 the server\'s relay: the connections waiting for their first message capped, all roles together; one more refused, said', async () => {
  const http = await import('node:http');
  const { WebSocket } = await import('ws');
  const { attachRelay, RELAY_LIMITS, BUSY, SUBPROTOCOL } = await import('../server/collab-relay.js');
  assert.equal(RELAY_LIMITS.waiting, 256);
  const srv = http.createServer();
  const relay = attachRelay(srv, { limits: { ...RELAY_LIMITS, waiting: 2 } });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const at = role => `ws://127.0.0.1:${srv.address().port}/api/collab/${role}`;
  const open = (role, protocols = [SUBPROTOCOL]) => new Promise((res, rej) => { const w = new WebSocket(at(role), protocols); w.got = []; w.on('message', d => w.got.push(JSON.parse(String(d)))); w.on('open', () => res(w)); w.on('error', rej); });
  const closed = w => new Promise(r => (w.readyState === 3 ? r(w.closedWith) : w.on('close', c => r(c))));
  try {
    const a = await open('follow'), b = await open('meet/peer?topic=' + 'A'.repeat(32));
    await new Promise(r => setTimeout(r, 50));
    assert.equal(relay.waiting(), 2);
    const c = await open('follow');
    assert.equal(await closed(c), 1008);
    assert.deepEqual(c.got, [{ type: 'error', message: BUSY }]);
    // (one that sends its first message no longer waits: another one gets in)
    a.send(JSON.stringify({ v: 1, type: 'join', room: 'x', client: 3 }));
    await closed(a);
    await new Promise(r => setTimeout(r, 50));
    assert.equal(relay.waiting(), 1);
    const d = await open('follow');
    await new Promise(r => setTimeout(r, 50));
    assert.equal(relay.waiting(), 2);
    for (const w of [b, d]) w.close();
    await new Promise(r => setTimeout(r, 50));
    assert.equal(relay.waiting(), 0);
  } finally { relay.close(); srv.closeAllConnections?.(); await new Promise(r => srv.close(r)); }
});
