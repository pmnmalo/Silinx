// A participant's selection in live sharing (#4192, core/collab-select.js): its shape as sent and as it arrives (each
// editor family's: a text editor's ranges, a drawing's items, a truth table's look, #4193), untrusted input left out,
// its caps (an awareness frame under the relay's, #4173), a range past the text's end, an object deleted meanwhile, a
// module renamed (its document's path changed); the pacer that coalesces a dragged or typed selection; and through the
// relay of Silinx's own server, a follower's selection dragged at 100 a second: the owner gets the last one, the relay
// drops none (under its rate), and the owner's selection reaches the follower with its view.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { scratchEnv } from './server-helpers.js';
import { closable } from './server-close.js';
import { selectionValue, selectionAt, liveItems, clampRange, selectionWords, selectionPacer, SELECTION_LIMITS } from '../core/collab-select.js';
import { projectDoc, publishProject } from '../core/collab-doc.js';
import { shareRoom, followRoom } from '../core/collab-client.js';
import { relayUrl } from '../core/collab-link.js';
import { ROOM_LIMITS } from '../core/collab-room.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(10); } };
const roundTrip = v => selectionValue(JSON.parse(JSON.stringify(selectionValue(v))));

test('each editor family\'s selection, sent and read back the same', () => {
  const cases = [
    { ranges: [[3, 4, 3, 9]] },                                   // HDL: one range
    { ranges: [[0, 0, 0, 0], [5, 2, 7, 1], [9, 9, 8, 0]] },        // C / C++: a cursor, several ranges (CodeMirror's), one backwards
    { items: ['sym:S1', 'wire:W3', 'label:L2', 'port:P1', 'junction:120,40', 'graphic:G1'] },   // schematic
    { items: ['state:S0'] }, { items: ['trans:T1'] },             // state diagram
    { items: ['node:N1', 'node:N4', 'edge:E2'] },                 // ASM chart
    { items: ['place:p1'] }, { items: ['transition:t1'] }, { items: ['arc:a3'] },   // Petri net
    { items: ['part:U1'] }, { items: ['wire:W1'] },               // circuit
    { items: ['out:car_r'], look: { groups: 'pos', qm: 'sop', map: true, steps: false } },   // truth table (#4193)
    { items: ['pin:A'] },                                          // symbol
  ];
  for (const c of cases) assert.deepEqual(roundTrip(c), c, JSON.stringify(c));
});

test('nothing selected, or not a selection: null; what is not one left out', () => {
  for (const v of [null, undefined, 3, 'sym:S1', [], {}, { ranges: [] }, { items: [] }, { look: {} }, { items: [5, null, ''] }]) assert.equal(selectionValue(v), null, JSON.stringify(v));
  assert.deepEqual(selectionValue({
    ranges: [[1, 2, 3], [-1, 0, 0, 0], [1.5, 0, 0, 0], [0, 0, 0, 2e7], [1, 1, 1, 1], 'x'],
    items: ['sym:S1', 'sym:S1', 'Sym:S2', 'nokind', 'wire:', 'x:a\nb', 'part:U1', 'k:' + 'x'.repeat(200)],
    look: { groups: 'pos', map: true, bad: { x: 1 }, n: 3, 'no-dash': 'x', long: 'x'.repeat(40) },
    other: 'dropped',
  }), { ranges: [[1, 1, 1, 1]], items: ['sym:S1', 'part:U1'], look: { groups: 'pos', map: true } });
});

test('capped: 32 ranges, 200 items, the frame\'s bytes; what is left out counted', () => {
  const many = Array.from({ length: 500 }, (_, i) => `wire:W${i}`);
  const v = selectionValue({ items: many });
  assert.equal(v.items.length + v.more, 500);
  assert.ok(JSON.stringify(v).length <= SELECTION_LIMITS.bytes);
  assert.deepEqual(v.items.slice(0, 3), ['wire:W0', 'wire:W1', 'wire:W2']);
  // long ids: the bytes' cap before the items' number
  const long = selectionValue({ items: Array.from({ length: 150 }, (_, i) => `sym:${String(i).padStart(80, 'x')}`) });
  assert.ok(JSON.stringify(long).length <= SELECTION_LIMITS.bytes && long.items.length < 150 && long.items.length + long.more === 150);
  assert.equal(selectionValue({ ranges: Array.from({ length: 100 }, () => [0, 0, 1, 1]) }).ranges.length, 32);
  // (well under the relay's awareness frame, with the user's name and the rest of its state)
  assert.ok(SELECTION_LIMITS.bytes * 1.5 < ROOM_LIMITS.awarenessFrame);
});

test('a range past the text\'s end kept inside it', () => {
  const lines = ['entity a is', 'end;', ''];
  const len = i => lines[i].length;
  assert.deepEqual(clampRange([0, 2, 1, 3], 3, len), [{ line: 0, ch: 2 }, { line: 1, ch: 3 }]);
  assert.deepEqual(clampRange([0, 50, 9, 0], 3, len), [{ line: 0, ch: 11 }, { line: 2, ch: 0 }]);
  assert.deepEqual(clampRange([1, 99, 1, 99], 3, len), [{ line: 1, ch: 4 }, { line: 1, ch: 4 }]);
  assert.deepEqual(clampRange([7, 1, 8, 1], 2, len), [{ line: 1, ch: 4 }, { line: 1, ch: 4 }]);
  assert.deepEqual(clampRange([3, 3, 4, 4], 0, len), [{ line: 0, ch: 0 }, { line: 0, ch: 0 }]);
});

test('an object deleted meanwhile not drawn; a module renamed: its document\'s path changed, none shown there', () => {
  const sel = { items: ['state:S0', 'state:S1', 'trans:T1'] };
  const have = new Set(['state:S0', 'trans:T1']);
  assert.deepEqual(liveItems(sel, x => have.has(x)), ['state:S0', 'trans:T1']);
  assert.deepEqual(liveItems(null, () => true), []);
  const view = { path: 'src/ctl.fsm.json', line: null, ch: null, sel };
  assert.equal(selectionAt(view, 'src/ctl.fsm.json'), sel);
  assert.equal(selectionAt(view, 'src/control.fsm.json'), null);   // (renamed: the follower's document is the new path)
  assert.equal(selectionAt({ path: 'src/control.fsm.json', line: null, ch: null }, 'src/control.fsm.json'), null);   // (deselected)
  assert.equal(selectionAt(null, 'src/x.vhd'), null);
});

test('in words, for the MCP\'s follow_project', () => {
  assert.equal(selectionWords(null), '');
  assert.equal(selectionWords({ ranges: [[0, 0, 0, 0]] }), 'the cursor at 1:1');
  assert.equal(selectionWords({ ranges: [[2, 4, 3, 0], [9, 1, 9, 1]] }), '3:5 to 4:1, the cursor at 10:2');
  assert.equal(selectionWords({ items: ['sym:S1', 'wire:W2'], more: 3 }), 'sym:S1, wire:W2 and 3 more');
  assert.equal(selectionWords({ items: ['out:Y'], look: { groups: 'pos', map: true } }), 'out:Y; groups pos, map true');
});

test('the pacer: the first at once, a burst coalesced, the last one always sent', () => {
  let t = 0;
  const timers = [];
  const p = selectionPacer({ ms: 250, now: () => t, timer: (f, ms) => { const x = { f, at: t + ms }; timers.push(x); return x; }, clear: x => { timers.splice(timers.indexOf(x), 1); } });
  const sent = [];
  const send = v => sent.push([t, v]);
  const run = () => { for (const x of timers.filter(x => x.at <= t)) { timers.splice(timers.indexOf(x), 1); x.f(); } };
  assert.equal(p.push(1, send), true);
  // a drag: 100 selections in a second, one every 10 ms
  for (let i = 2; i <= 101; i++) { t += 10; p.push(i, send); run(); }
  t += 300; run();
  assert.ok(sent.length <= 6, `${sent.length} sent`);
  assert.deepEqual(sent.at(-1)[1], 101, 'the last one sent');
  for (let i = 1; i < sent.length; i++) assert.ok(sent[i][0] - sent[i - 1][0] >= 250, 'never two within 250 ms');
  assert.equal(p.pending(), false);
  // after a pause: at once again; cancel drops a pending one
  t += 1000; sent.length = 0;
  assert.equal(p.push('a', send), true);
  t += 10; assert.equal(p.push('b', send), false);
  p.cancel(); t += 500; run();
  assert.deepEqual(sent.map(x => x[1]), ['a']);
});

let tmp, srv, base, closeSrv;
before(async () => {
  tmp = await scratchEnv('silinx-collab-select-');
  const { createApp } = await import('../server/server.js');
  const app = await createApp({ host: '127.0.0.1', token: 'the-token' });
  srv = app.listen(0, '127.0.0.1');
  closeSrv = closable(srv);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}/`;
});
after(async () => { await closeSrv(); const fs = await import('node:fs'); fs.rmSync(tmp, { recursive: true, force: true }); });

test('through the relay: the owner\'s selection with its view; a follower\'s dragged at 100 a second, coalesced, the last one arrives, none dropped', async () => {
  const doc = projectDoc();
  publishProject(doc, { project: { name: 'p', top: 'top', files: [], fileTree: ['src/top.sch.json'] }, files: { 'src/top.sch.json': '{}' }, owner: 'Ana' });
  const events = [];
  const owner = await shareRoom({ url: relayUrl(base, 'share'), token: 'the-token', doc, user: { name: 'Ana' } });
  const fol = await followRoom({ url: relayUrl(base, 'follow'), room: owner.room, key: owner.key, user: { name: 'Rui' }, onEvent: ev => events.push(ev) });
  try {
    await fol.ready;
    owner.setView({ path: 'src/top.sch.json', line: null, ch: null, sel: { items: ['sym:S1', 'wire:W2'], junk: 1 } });
    const v = await until(() => fol.owner()?.view?.sel && fol.owner().view, 'the owner\'s selection');
    assert.deepEqual(v, { path: 'src/top.sch.json', line: null, ch: null, sel: { items: ['sym:S1', 'wire:W2'] } });
    // deselected: the view with no selection
    await sleep(300);
    owner.setView({ path: 'src/top.sch.json', line: null, ch: null, sel: null });
    await until(() => fol.owner()?.view && !fol.owner().view.sel, 'deselected');
    // the follower drags a band: a selection every 10 ms for a second
    for (let i = 0; i < 100; i++) { fol.setView({ path: 'src/top.sch.json', line: null, ch: null, sel: { items: Array.from({ length: 1 + (i % 20) }, (_, k) => `wire:W${k}`) } }); await sleep(10); }
    const last = Array.from({ length: 1 + (99 % 20) }, (_, k) => `wire:W${k}`);
    await until(() => JSON.stringify(owner.peers()[0]?.view?.sel?.items) === JSON.stringify(last), 'the last selection at the owner\'s');
    assert.deepEqual(events.filter(e => e.type === 'error'), [], 'the relay dropped none');
  } finally { await fol.close(); await owner.close(); }
});
