// How soon a shared project's page says what it does (#4647, core/collab-pace.js): soon() calls its function once for a
// burst of pokes, SOON_MS later, and again for a poke after it; cancel() drops one pending; trackOnEvents() pokes at
// each of the page's events that may move a cursor, and no more once unwatched. The paces: a follower's views under the
// relay's rate of a follower's awareness (a follower moving its cursor without a pause, on a room whose bucket holds 2:
// nothing dropped, no warning, its last view at the owner's), the owner's faster (its views at most every
// OWNER_VIEW_MS, the last one always sent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soon, trackOnEvents, TRACK_MS, SOON_MS, VIEW_MS, OWNER_VIEW_MS, TRACK_EVENTS } from '../core/collab-pace.js';
import { ROOM_LIMITS, AWARENESS_DROPPED } from '../core/collab-room.js';
import { hostedRooms, HOST_LIMITS } from '../core/collab-loop.js';
import { shareRoom, followRoom } from '../core/collab-client.js';
import { projectDoc, publishProject } from '../core/collab-doc.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(5); } };
const owned = () => { const doc = projectDoc(); publishProject(doc, { project: { name: 'p', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], fileTree: ['src/top.vhd'] }, files: { 'src/top.vhd': 'entity top is end;\n' }, owner: 'Ana' }); return doc; };

// a clock of the test's: timers that fire when it says
function clock() {
  const timers = [];
  return {
    timer: (f, ms) => { const x = { f, ms }; timers.push(x); return x; },
    clear: x => { const i = timers.indexOf(x); if (i >= 0) timers.splice(i, 1); },
    fire: () => { for (const x of timers.splice(0)) x.f(); },
    pending: () => timers.map(x => x.ms),
  };
}

test('the paces: a look at least every TRACK_MS, a frame after an event; a follower\'s views under the relay\'s rate, the owner\'s faster', () => {
  assert.equal(TRACK_MS, 300);
  assert.equal(SOON_MS, 16);
  assert.ok(VIEW_MS >= 1000 / ROOM_LIMITS.awarenessRate, 'a follower\'s views at most the relay\'s rate');
  assert.ok(OWNER_VIEW_MS < VIEW_MS && OWNER_VIEW_MS >= SOON_MS);
  assert.deepEqual(TRACK_EVENTS, ['keydown', 'keyup', 'pointerdown', 'pointerup', 'selectionchange', 'input', 'change']);
  assert.throws(() => { TRACK_EVENTS.push('wheel'); }, TypeError);
});

test('soon(): one call for a burst of pokes, SOON_MS later; again for a poke after it; cancel() drops a pending one', () => {
  const c = clock();
  let calls = 0;
  const s = soon(() => { calls++; }, { timer: c.timer, clear: c.clear });
  assert.equal(s.pending(), false);
  assert.equal(s.poke(), true);
  assert.equal(s.poke(), false, 'a poke meanwhile: the same call');
  assert.equal(s.poke(), false);
  assert.deepEqual(c.pending(), [SOON_MS]);
  assert.equal(s.pending(), true);
  assert.equal(calls, 0, 'never within the poke');
  c.fire();
  assert.equal(calls, 1);
  assert.equal(s.pending(), false);
  s.poke();
  c.fire();
  assert.equal(calls, 2, 'a poke after the call: another');
  s.poke();
  s.cancel();
  assert.deepEqual(c.pending(), []);
  assert.equal(s.pending(), false);
  c.fire();
  assert.equal(calls, 2, 'cancelled');
  s.cancel();   // (nothing pending: nothing)
  assert.equal(s.poke(), true, 'poked again after a cancel');
});

test('soon(): its own ms; on real timers, called once', async () => {
  const c = clock();
  soon(() => {}, { ms: 40, timer: c.timer, clear: c.clear }).poke();
  assert.deepEqual(c.pending(), [40]);
  let calls = 0;
  const s = soon(() => { calls++; });
  for (let i = 0; i < 10; i++) s.poke();
  await until(() => calls === 1, 'the call');
  await sleep(SOON_MS * 2);
  assert.equal(calls, 1);
});

test('trackOnEvents(): a poke at each event that may move a cursor, in the capture; none once unwatched, nor for another event', () => {
  // (a page's document as the test's own: Node's EventTarget does not remove a listener added in the capture)
  const listeners = new Map(), seen = [];
  const target = {
    addEventListener: (type, fn, capture) => { seen.push([type, capture]); listeners.set(`${type}:${capture}`, fn); },
    removeEventListener: (type, fn, capture) => { if (listeners.get(`${type}:${capture}`) === fn) listeners.delete(`${type}:${capture}`); },
    dispatchEvent: e => { for (const c of [true, false]) listeners.get(`${e.type}:${c}`)?.(e); },
  };
  let pokes = 0;
  const unwatch = trackOnEvents(target, () => { pokes++; });
  assert.deepEqual(seen, TRACK_EVENTS.map(e => [e, true]));
  for (const e of TRACK_EVENTS) target.dispatchEvent(new Event(e));
  assert.equal(pokes, TRACK_EVENTS.length);
  target.dispatchEvent(new Event('wheel'));
  target.dispatchEvent(new Event('pointermove'));
  assert.equal(pokes, TRACK_EVENTS.length, 'not another event');
  unwatch();
  assert.equal(listeners.size, 0);
  for (const e of TRACK_EVENTS) target.dispatchEvent(new Event(e));
  assert.equal(pokes, TRACK_EVENTS.length, 'unwatched');
});

test('a follower moving its cursor without a pause, on a room whose bucket holds 2: nothing dropped, no warning; its last view at the owner\'s', async () => {
  const h = hostedRooms({ limits: { ...HOST_LIMITS, awarenessBurst: 2 } });
  const errors = [];
  const owner = await shareRoom({ url: 'silinx-host:', WebSocket: h.owner, doc: owned(), user: { name: 'Ana' }, onEvent: e => { if (e.type === 'error') errors.push(e.message); } });
  const Follower = function FollowerSocket() { const { socketPair } = FollowerSocket; const { client, room } = socketPair(); h.follower(room); return client; };
  Follower.socketPair = (await import('../core/collab-loop.js')).socketPair;
  const fol = await followRoom({ url: 'silinx-host:', WebSocket: Follower, room: owner.room, key: owner.key, user: { name: 'Rui' }, reconnect: false, onEvent: e => { if (e.type === 'error') errors.push(e.message); } });
  await fol.ready;
  try {
    const t0 = Date.now();
    let line = 0;
    while (Date.now() - t0 < 1200) { fol.setView({ path: 'src/top.vhd', line: ++line, ch: 0 }); await sleep(5); }
    await until(() => owner.peers().find(p => p.name === 'Rui')?.view?.line === line, 'the follower\'s last view at the owner\'s');
    assert.deepEqual(errors, [], `no warning (not ${AWARENESS_DROPPED})`);
  } finally { await fol.close(); await owner.close(); }
});

test('the owner\'s views: at most every OWNER_VIEW_MS (its own viewMs too), the last one always sent', async () => {
  for (const viewMs of [undefined, 150]) {
    const ms = viewMs ?? OWNER_VIEW_MS;
    const h = hostedRooms();
    const owner = await shareRoom({ url: 'silinx-host:', WebSocket: h.owner, doc: owned(), user: { name: 'Ana' }, ...(viewMs ? { viewMs } : {}) });
    const sent = [];
    owner.awareness.on('update', (_c, origin) => { if (origin === 'local') sent.push([Date.now(), owner.awareness.getLocalState()?.view?.line]); });
    const t0 = Date.now();
    let line = 0;
    while (Date.now() - t0 < 600) { owner.setView({ path: 'src/top.vhd', line: ++line, ch: 0 }); await sleep(3); }
    await until(() => sent.at(-1)?.[1] === line, 'the last view');
    for (let i = 1; i < sent.length; i++) assert.ok(sent[i][0] - sent[i - 1][0] >= ms - 2, `never two within ${ms} ms`);
    assert.ok(sent.length >= Math.floor(600 / ms) - 1 && sent.length <= Math.ceil(600 / ms) + 2, `about one every ${ms} ms (${sent.length})`);
    sent.length = 0;
    await owner.close();
  }
});
