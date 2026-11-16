// The owner's Try it as its followers follow it (#4244, core/collab-try.js): the `try` value made (the documents with
// their Try it open, capped, BigInts carried) and taken (untrusted: what is not one left out); the schematic's and the
// circuit's steps recorded (a clock's cycles coalesced, #4173) and replayed by a follower's own simulation to the same
// values, from where it was (a step grown: only what was added) or from the start (another Try it, steps lost); the
// trace and inputs a follower shows; the MCP's lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tryActivity, followedTry, tryWire, fromWire, tryOps, replayPlan, recordLive, replayLive, recordCircuit, replayCircuit, adoptOps, traceRows, inputValues, tryLines, TRY_LIMITS } from '../core/collab-try.js';
import { buildLiveSim, fmtValue } from '../core/schlive.js';
import { newDoc, normalizeDoc, symbolPins } from '../core/schdoc.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { normalizeCircuit } from '../core/circuit.js';

const FSM = { kind: 'fsm', sum: { state: 'GO', steps: 2, inputs: { req: '1' }, outputs: { y: '01' } }, snap: { state: 's1', inputs: { req: 1 }, cycle: 2, trace: [] } };

test('tryWire / fromWire: BigInts carried as { $n }, the rest plain JSON; what is not one left out', () => {
  const v = { a: 5n, b: [1, -2n, 'x'], c: { d: null, e: true }, f: undefined, g: () => 1 };
  const w = tryWire(v);
  assert.deepEqual(JSON.parse(JSON.stringify(w)), { a: { $n: '5' }, b: [1, { $n: '-2' }, 'x'], c: { d: null, e: true } });
  assert.deepEqual(fromWire(JSON.parse(JSON.stringify(w))), { a: 5n, b: [1, -2n, 'x'], c: { d: null, e: true } });
  assert.deepEqual(fromWire({ n: Infinity, s: 'x'.repeat(TRY_LIMITS.string + 1), big: { $n: '1e3' }, __proto__x: 1 }), { __proto__x: 1 });
  assert.deepEqual(fromWire(JSON.parse('{"__proto__": {"polluted": 1}, "ok": 1}')), { ok: 1 });
  assert.equal({}.polluted, undefined);
  let deep = {}; const top = deep; for (let i = 0; i < 20; i++) deep = deep.x = {};
  assert.ok(JSON.stringify(fromWire(top)).length < 100, 'too deep: cut');
  assert.equal(fromWire(Array.from({ length: 2000 }, (_, i) => i)).length, TRY_LIMITS.items);
});

test('tryActivity: the documents with their Try it open, of the kinds that have one, at most TRY_LIMITS.docs', () => {
  const docs = [['fsm:src/a.fsm.json', FSM], ['fsm:src/b.fsm.json', null], ['file:src/a.vhd', FSM], ['sch:src/c.sch.json', { kind: 'nope' }], ['rtl:top', { kind: 'sch', sum: {}, run: 'r', base: {}, n: 0, ops: [] }]];
  assert.deepEqual(Object.keys(tryActivity(docs).docs), ['fsm:src/a.fsm.json', 'rtl:top']);
  const many = Array.from({ length: 20 }, (_, i) => [`fsm:src/m${i}.fsm.json`, FSM]);
  assert.equal(Object.keys(tryActivity(many).docs).length, TRY_LIMITS.docs);
});

test('followedTry: a value taken (untrusted): its documents and kinds checked, the summary\'s texts only, the steps capped', () => {
  assert.equal(followedTry(null), null);
  assert.equal(followedTry({ docs: [] }), null);
  const t = followedTry({ docs: {
    'fsm:src/a.fsm.json': { ...FSM, sum: { state: 3, steps: -1, inputs: { req: '1', bad: 2 }, outputs: 'no' } },
    'sch:src/c.sch.json': { kind: 'sch', sum: {}, run: 'r1', base: { P1: { width: 4, value: { $n: '5' } } }, n: 1, ops: [['set', 'P1', { $n: '5' }], 'no'] },
    'circ:src/d.circ.json': { kind: 'circ', ops: Array.from({ length: 600 }, () => ['advance', 1]), n: 10 },
    'x:y': FSM, 'fsm:src/e.fsm.json': { kind: 'other' },
  } });
  assert.deepEqual(Object.keys(t.docs), ['fsm:src/a.fsm.json', 'sch:src/c.sch.json', 'circ:src/d.circ.json']);
  assert.deepEqual(t.docs['fsm:src/a.fsm.json'], { kind: 'fsm', sum: { state: null, steps: 0, inputs: { req: '1' }, outputs: {} }, snap: FSM.snap });
  assert.deepEqual(t.docs['sch:src/c.sch.json'], { kind: 'sch', sum: { state: null, steps: 0, inputs: {}, outputs: {} }, run: 'r1', base: { P1: { width: 4, value: 5n } }, ops: [['set', 'P1', 5n]], n: 1 });
  const c = t.docs['circ:src/d.circ.json'];
  assert.equal(c.ops.length, TRY_LIMITS.items >= TRY_LIMITS.ops ? TRY_LIMITS.ops : TRY_LIMITS.items);
  assert.equal(c.n, c.ops.length, 'n at least the steps there');
});

test('tryOps: the steps counted, a clock\'s cycles and the time moved on coalesced (one frame, not one per edge), the last TRY_LIMITS.ops kept', () => {
  const l = tryOps({}, 'r1');
  l.push(['set', 'A', 1n]); l.push(['cycles', ['C'], 1]); l.push(['cycles', ['C'], 3]); l.push(['cycles', ['D'], 1]);
  l.push(['advance', 10]); l.push(['advance', 5]);
  assert.deepEqual(l.wire(), { run: 'r1', base: {}, n: 4, ops: [['set', 'A', 1n], ['cycles', ['C'], 4], ['cycles', ['D'], 1], ['advance', 15]] });
  for (let i = 0; i < TRY_LIMITS.ops + 10; i++) l.push(['set', 'A', BigInt(i % 2)]);
  assert.equal(l.ops.length, TRY_LIMITS.ops);
  assert.equal(l.n, 4 + TRY_LIMITS.ops + 10);
});

test('replayPlan: from the start the first time; then only what is new, a grown step\'s addition; from the start again when another Try it, steps lost, or a step changed', () => {
  const l = tryOps({}, 'r1');
  l.push(['set', 'A', 1n]); l.push(['cycles', ['C'], 1]);
  const p1 = replayPlan(null, l.wire());
  assert.deepEqual([p1.restart, p1.ops], [true, [['set', 'A', 1n], ['cycles', ['C'], 1]]]);
  l.push(['cycles', ['C'], 2]);
  const p2 = replayPlan(p1, l.wire());
  assert.deepEqual([p2.restart, p2.ops], [false, [['cycles', ['C'], 2]]]);
  l.push(['set', 'A', 0n]);
  const p3 = replayPlan(p2, l.wire());
  assert.deepEqual([p3.restart, p3.ops], [false, [['set', 'A', 0n]]]);
  assert.deepEqual(replayPlan(p3, l.wire()).ops, [], 'nothing new');
  assert.equal(replayPlan(p3, { ...l.wire(), run: 'r2' }).restart, true, 'another Try it');
  assert.equal(replayPlan({ ...p3, n: 9 }, l.wire()).restart, true, 'ahead of the owner');
  const lost = { run: 'r1', base: {}, n: 100, ops: [['set', 'A', 1n]] };
  assert.equal(replayPlan(p3, lost).restart, true, 'steps no longer kept');
  assert.equal(replayPlan({ ...p3, last: ['set', 'A', 1n] }, l.wire()).restart, true, 'its last step changed');
});

// a clocked schematic: a D flip-flop (d, clk in, q out) and a toggle one (qt out), as test/sch-livesim.test.js draws them
function clocked() {
  const doc = newDoc('dff', 'vhdl');
  let wid = 0;
  const sym = (type, x, y, name) => { const o = { id: `S${doc.symbols.length + 1}`, type, x, y, rot: 0, mirror: false, name: name || `U${doc.symbols.length + 1}`, params: {} }; doc.symbols.push(o); return o; };
  const pinAt = (o, pin) => { const q = symbolPins(normalizeDoc({ ...doc, symbols: [o] }).symbols[0]).find((x) => x.name === pin); return { x: q.x, y: q.y }; };
  const wire = (...pts) => doc.wires.push({ id: `W${++wid}`, points: pts.map((q) => ({ ...q })) });
  const io = (o, pin, name, dir) => { const q = pinAt(o, pin), at = { x: q.x + (dir === 'in' ? -40 : 40), y: q.y }; doc.ports.push({ id: `P${doc.ports.length + 1}`, name, dir, width: 1, x: at.x, y: at.y }); wire(at, q); };
  const ff = sym('fd', 200, 100), t = sym('fd', 200, 300, 'TFF'), inv = sym('inv', 400, 400);
  io(ff, 'D', 'd', 'in'); io(ff, 'C', 'clk', 'in'); io(ff, 'Q', 'q', 'out');
  const qt = pinAt(t, 'Q');
  io(t, 'Q', 'qt', 'out');
  const ii = pinAt(inv, 'I');
  wire({ x: qt.x + 40, y: qt.y }, { x: qt.x + 20, y: qt.y }, { x: qt.x + 20, y: ii.y }, ii);
  const ti = pinAt(inv, 'O');
  wire(ti, { x: ti.x + 20, y: ti.y }, { x: ti.x + 20, y: 460 }, { x: 150, y: 460 }, { x: 150, y: pinAt(t, 'D').y }, pinAt(t, 'D'));
  const tc = pinAt(t, 'C');
  doc.labels.push({ id: 'L1', x: tc.x - 20, y: tc.y, net: 'clk' });
  wire({ x: tc.x - 40, y: tc.y }, tc);
  return doc;
}
const values = (L, d) => JSON.stringify(d.ports.map((p) => [p.name, fmtValue(L.portValue(p.id), 'hex')]));

test('a schematic\'s Try it recorded and replayed: the follower\'s own simulation at the owner\'s values, in one replay or step by step', () => {
  const d = clocked();
  const built = buildLiveSim(d);
  assert.deepEqual(built.errors, []);
  const owner = built.live, log = tryOps(owner.inputValues());
  recordLive(owner, log);
  const clk = owner.inputs.find((i) => i.clock).id, data = owner.inputs.filter((i) => !i.clock);
  const follower = buildLiveSim(d).live;
  let applied = null;
  const follow = () => {
    const o = followedTry({ docs: { 'sch:src/x.sch.json': { kind: 'sch', sum: {}, ...tryWire(log.wire()) } } }).docs['sch:src/x.sch.json'];
    const plan = replayPlan(applied, o);
    if (plan.restart) { follower.reset({ inputs: true }); follower.restoreInputs(o.base); }
    replayLive(follower, plan.ops);
    applied = plan;
  };
  for (const i of data) owner.set(i.id, 1n);
  owner.cycle(clk); follow();
  assert.equal(values(follower, d), values(owner, d));
  owner.cycles([clk], 3); owner.cycle(clk); follow();
  assert.equal(log.ops.at(-1)[2], 5, 'the cycles coalesced: one step, grown since the follower replayed it');
  assert.equal(values(follower, d), values(owner, d));
  owner.reset({ inputs: true }); owner.cycle(clk); follow();
  assert.equal(values(follower, d), values(owner, d));
  // (a fresh follower: all in one replay)
  const late = buildLiveSim(d).live;
  replayLive(late, followedTry({ docs: { 'sch:a': { kind: 'sch', ...tryWire(log.wire()) } } }).docs['sch:a'].ops);
  assert.equal(values(late, d), values(owner, d));
  // (a step that is not one: skipped)
  replayLive(late, [['set', 7, 1n], ['cycles', [clk], -1], ['nope'], 'x']);
  assert.equal(values(late, d), values(owner, d));
  // (adopted: the follower's steps the owner's)
  const mine = tryOps({}, 'mine'); mine.push(['reset', true]);
  assert.deepEqual(adoptOps(mine, log.wire()).wire(), log.wire());
});

test('a circuit\'s Try it recorded and replayed: its switches and its time, the follower\'s LEDs the owner\'s; a part that is not one skipped', () => {
  const m = normalizeCircuit(JSON.parse(fs.readFileSync('examples/breadboard/src/breadboard.circ.json', 'utf8')));
  const owner = createCircuitSim(m), log = tryOps(null);
  recordCircuit(owner, log);
  owner.run();
  const ids = Object.keys(owner.inputs());
  assert.ok(ids.length, 'its switches');
  for (const id of ids) { owner.set(id, true); owner.run(); }
  owner.advance(1000);
  const follower = createCircuitSim(m);
  follower.run();
  replayCircuit(follower, [...followedTry({ docs: { 'circ:c': { kind: 'circ', ...tryWire(log.wire()) } } }).docs['circ:c'].ops, ['set', 'NOPE', true, 0], ['advance', -5]]);
  assert.deepEqual(follower.leds(), owner.leds());
  assert.deepEqual(follower.inputs(), owner.inputs());
  assert.equal(log.n, ids.length + 1);
});

test('traceRows and inputValues: what a follower shows of a trace and sets of the inputs', () => {
  assert.deepEqual(traceRows([{ cycle: 1, state: 'A', next: 'B', inputs: { a: 1, b: 'x', c: {} }, outputs: { y: 2n } }, 'no', null, { cycle: 'x' }]),
    [{ cycle: 1, state: 'A', next: 'B', inputs: { a: 1, b: 'x' }, outputs: { y: '2' } }, { cycle: 0, state: '?', next: '?', inputs: {}, outputs: {} }]);
  assert.equal(traceRows(Array.from({ length: 100 }, () => ({}))).length, 32);
  assert.deepEqual(inputValues({ a: 1, b: -1, c: 1.5, d: '1', e: 3, constructor: 1 }, ['a', 'b', 'c', 'd', 'constructor']), { a: 1, constructor: 1 });
  assert.deepEqual(inputValues(null, ['a']), {});
});

test('tryLines: the owner\'s Try it in words, per document', () => {
  assert.deepEqual(tryLines({ docs: { 'fsm:src/a.fsm.json': FSM, 'circ:src/d.circ.json': { kind: 'circ', sum: { steps: 1, inputs: {}, outputs: { led: '1' } }, ops: [] } } }), [
    'Their Try it of the state diagram src/a.fsm.json: state GO; 2 step(s); inputs req = 1; outputs y = 01.',
    'Their Try it of the circuit src/d.circ.json: 1 step(s); outputs led = 1.',
  ]);
  assert.deepEqual(tryLines(null), []);
});
