// Tests of the synchronous reactive model (#5486): core/reactive.js (its semantics), core/reactive-expr.js (Verilog's
// width rules lowered), core/reactive-from.js and core/reactive-asm.js (the drawings turned into it). Each drawing's model
// is run tick by tick against its generated HDL simulated in VHDL and in Verilog (the same inputs, the same outputs),
// on the examples' drawings (the traffic FSM, the lock's ASM timer, its alarm Petri net, the traffic lamps' truth table)
// and on edge cases; and against the drawings' own simulators on longer runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { simulateFsm, parseCond, evalCond } from '../core/fsm.js';
import { simulateAsm } from '../core/asm-sim.js';
import { clockStep, outputsOf, initialMarking } from '../core/petri.js';
import { reactiveReset, reactiveTick, reactiveType, simulateReactive, validateReactive } from '../core/reactive.js';
import { evalExpr, lower, lowerCond, narrow, selfWidth, maskOf } from '../core/reactive-expr.js';
import { REACTIVE_KINDS, SCHEMATIC_ON_CPU, drawingKind, drawingToReactive, reactiveFromFile, fsmToReactive, petriToReactive, tableToReactive } from '../core/reactive-from.js';
import { EXAMPLE_DRAWINGS, ROOT, randomVectors, readJson, runHdl, runModel } from './reactive-lib.mjs';

const modelOf = (kind, doc) => {
  const r = drawingToReactive(kind, doc);
  assert.equal(r.errors, undefined, JSON.stringify(r.errors));
  assert.deepEqual(validateReactive(r.model), [], `${doc.name}: no problem`);
  return r.model;
};

// ---------------------------------------------------------------------------------------------------- edge cases
/** A Mealy machine: a 2-bit input, a comparison, an output set on transitions, the otherwise written first. */
const mealy = () => ({
  kind: 'fsm', name: 'edge_m', lang: 'vhdl', clock: 'clk', reset: { name: 'rst', active: 'low', sync: false }, encoding: 'onehot',
  inputs: [{ name: 'x', width: 1 }, { name: 'k', width: 2 }],
  outputs: [{ name: 'z', width: 1, default: '0' }, { name: 'y', width: 3, default: '5' }],
  states: [{ id: 'a', name: 'A', outputs: { y: '1' } }, { id: 'b', name: 'B', outputs: {} }, { id: 'c', name: 'C', outputs: { y: '7' } }],
  transitions: [
    { id: 't0', from: 'a', to: 'a', cond: 'else', outputs: { z: '1' } },
    { id: 't1', from: 'a', to: 'b', cond: 'x && k == 2', outputs: { y: '3' } },
    { id: 't2', from: 'a', to: 'c', cond: 'k > 2\'d2', outputs: { y: '2' } },
    { id: 't3', from: 'b', to: 'c', cond: '!x | k[1]', outputs: { z: '1' } },
    { id: 't4', from: 'c', to: 'a', cond: 'k - 1 == 0', outputs: {} },
  ],
  initial: 'a',
});

/** An ASM chart: a case box, a registered output, a synchronised input, a generic, an every-cycle block, shifts. */
const chart = () => ({
  version: 1, name: 'edge_a', lang: 'verilog', clock: 'clk', reset: { name: 'rst', active: 'high', sync: true }, encoding: 'gray',
  generics: [{ name: 'K', default: 3 }],
  inputs: [{ name: 'a', width: 4 }, { name: 'op', width: 2 }, { name: 'go', width: 1, sync: true }],
  outputs: [{ name: 'y', width: 4, default: '0' }, { name: 'f', width: 1, default: '0' }, { name: 'acc', width: 6, default: '1', registered: true }],
  registers: [{ name: 'n', width: 3, init: '2' }],
  nodes: [
    { id: 's1', type: 'state', name: 'IDLE', actions: ['y = a >> 1'] },
    { id: 'd1', type: 'decision', cond: 'go' },
    { id: 's2', type: 'state', name: 'RUN', actions: ['acc = acc + a'] },
    { id: 'c1', type: 'case', expr: 'op' },
    { id: 'o1', type: 'output', actions: ['y = n << 1', 'n = n - 1'] },
    { id: 'o2', type: 'output', actions: ['f', 'acc = (acc << 1) | K'] },
    { id: 'a1', type: 'always', name: 'calc', actions: ['f = a == 4\'d15'] },
  ],
  edges: [
    { from: 's1', to: 'd1' }, { from: 'd1', to: 's2', port: 'true' }, { from: 'd1', to: 's1', port: 'false' },
    { from: 's2', to: 'c1' }, { from: 'c1', to: 'o1', port: '00|11' }, { from: 'c1', to: 'o2', port: '01' }, { from: 'c1', to: 's1', port: 'others' },
    { from: 'o1', to: 's2' }, { from: 'o2', to: 's1' },
  ],
  initial: 's1',
});

/** A Petri net: two tokens in parallel, a pulse output, a guard on a 2-bit input. */
const net = () => ({
  kind: 'petri', version: 1, name: 'edge_p', lang: 'vhdl', clock: 'clk', reset: { name: 'rst', active: 'high', sync: true },
  inputs: [{ name: 'g', width: 1 }, { name: 'm', width: 2 }], outputs: [{ name: 'busy', width: 1 }, { name: 'pulse', width: 1 }, { name: 'v', width: 2 }],
  places: [
    { id: 'p1', name: 'ready', tokens: 1, capacity: 1, outputs: {} }, { id: 'p2', name: 'left', tokens: 0, capacity: 1, outputs: { busy: '1', v: '1' } },
    { id: 'p3', name: 'right', tokens: 0, capacity: 1, outputs: { busy: '1', v: '2' } },
  ],
  transitions: [{ id: 't1', name: 'split', guard: 'g', outputs: { pulse: '1' } }, { id: 't2', name: 'join', guard: 'm == 3', outputs: {} }],
  arcs: [
    { id: 'a1', from: 'p1', to: 't1', weight: 1 }, { id: 'a2', from: 't1', to: 'p2', weight: 1 }, { id: 'a3', from: 't1', to: 'p3', weight: 1 },
    { id: 'a4', from: 'p2', to: 't2', weight: 1 }, { id: 'a5', from: 'p3', to: 't2', weight: 1 }, { id: 'a6', from: 't2', to: 'p1', weight: 1 },
  ],
});

/** A truth table in the XOR form, with don't cares. */
const table = () => ({ version: 1, name: 'edge_t', inputs: ['a', 'b', 'c'], outputs: ['p', 'q'], table: { p: '01101001', q: '1X0X11X0' }, exprs: {}, form: 'xor', lang: 'vhdl' });

const EDGES = [['fsm', mealy], ['asm', chart], ['pn', net], ['bool', table]];

// ---------------------------------------------------------------------------------------------------- against the HDL
test('the examples\' drawings: their models do, tick by tick, what their VHDL and their Verilog do', () => {
  for (const [kind, file] of EXAMPLE_DRAWINGS) {
    const doc = readJson(file);
    const model = modelOf(kind, doc);
    const vectors = randomVectors(model.inputs, kind === 'bool' ? 16 : 300, 7);
    if (kind === 'bool') for (let r = 0; r < 16; r++) Object.assign(vectors[r], Object.fromEntries(doc.inputs.map((n, j) => [n, (r >> (doc.inputs.length - 1 - j)) & 1])));
    const want = runModel(model, vectors);
    for (const lang of ['vhdl', 'verilog']) assert.deepEqual(runHdl(file, kind, { ...doc, lang }, lang, vectors), want, `${file} ${lang}`);
  }
});

test('edge cases (Mealy outputs, an otherwise, a case box, a registered output, a synchroniser, a generic, an every-cycle block, parallel tokens, a pulse, the XOR form): the model is the HDL', () => {
  for (const [kind, make] of EDGES) {
    const doc = make();
    const model = modelOf(kind, doc);
    const vectors = randomVectors(model.inputs, kind === 'bool' ? 8 : 200, 11);
    if (kind === 'bool') for (let r = 0; r < 8; r++) Object.assign(vectors[r], { a: r >> 2, b: (r >> 1) & 1, c: r & 1 });
    const want = runModel(model, vectors);
    for (const lang of ['vhdl', 'verilog']) assert.deepEqual(runHdl(doc.name, kind, { ...doc, lang }, lang, vectors), want, `${doc.name} ${lang}`);
  }
});

// ---------------------------------------------------------------------------------------------------- against the simulators
test('the models against the drawings\' own simulators, on long runs', () => {
  const traffic = readJson('examples/traffic/src/traffic.fsm.json');
  for (const doc of [traffic, mealy(), readJson('examples/lock/src/lock.fsm.json')]) {
    const model = modelOf('fsm', doc), v = randomVectors(model.inputs, 3000, 5);
    const ref = simulateFsm(doc, v), got = simulateReactive(model, v);
    const name = (id) => doc.states.find((s) => s.id === id).name;
    got.forEach((row, i) => {
      assert.deepEqual(row.outputs, ref[i].outputs, `${doc.name} tick ${i}`);
      assert.equal(row.next, name(ref[i].next), `${doc.name} tick ${i}`);
    });
  }
  for (const doc of [readJson('examples/lock/src/timer.asm.json'), chart(), readJson('examples/blinky/src/speed_ctrl.asm.json')]) {
    const model = modelOf('asm', doc), v = randomVectors(model.inputs, 3000, 9);
    const ref = simulateAsm(doc, v), got = simulateReactive(model, v);
    got.forEach((row, i) => { assert.deepEqual(row.outputs, ref[i].outputs, `${doc.name} tick ${i}`); assert.equal(row.next, ref[i].next); });
  }
  for (const doc of [readJson('examples/lock/src/alarm.pn.json'), net()]) {
    const model = modelOf('pn', doc), v = randomVectors(model.inputs, 2000, 3);
    let mk = initialMarking(doc), fired = [];
    simulateReactive(model, v).forEach((row, i) => {
      assert.deepEqual(row.outputs, outputsOf(doc, mk, fired), `${doc.name} tick ${i}`);
      ({ marking: mk, fired } = clockStep(doc, mk, Object.fromEntries(Object.entries(v[i]).map(([k, x]) => [k, BigInt(x)]))));
    });
  }
});

// ---------------------------------------------------------------------------------------------------- the translations
test('the translations: the states in their codes\' order, Moore outputs first in an arm, the guards an if / else-if chain in their priority, the otherwise its else', () => {
  const m = modelOf('fsm', readJson('examples/traffic/src/traffic.fsm.json'));
  assert.deepEqual(m.states.map((s) => s.name), ['CARS', 'CARS_YELLOW', 'ALL_RED', 'WALK', 'WALK_END', 'ALL_RED_2', 'NIGHT']);
  assert.equal(m.initial, 'CARS');
  assert.equal(m.states[0].comment, 'cars green, pedestrians red (at least 5 s)');
  const cars = m.arms[0].body;
  assert.deepEqual(cars.map((s) => s.k), ['set', 'if']);
  assert.deepEqual(cars[1].then, [{ k: 'go', state: 'NIGHT' }]);
  assert.deepEqual(cars[1].else[0].then, [{ k: 'go', state: 'CARS_YELLOW' }]);
  assert.deepEqual(cars[1].else[0].else, []);
  assert.equal(reactiveType(m), 'moore');
  const e = modelOf('fsm', mealy());
  const a = e.arms.find((x) => x.state === 'A').body;
  assert.deepEqual(a[0], { k: 'set', target: 'y', expr: { k: 'const', v: 1n, w: 3 } });
  assert.deepEqual(a[1].else[0].else, [{ k: 'set', target: 'z', expr: { k: 'const', v: 1n, w: 1 } }, { k: 'go', state: 'A' }]);   // (the otherwise, last)
  assert.equal(reactiveType(e), 'mealy');
  const t = modelOf('asm', readJson('examples/lock/src/timer.asm.json'));
  assert.deepEqual(t.vars, [{ name: 'cnt', width: 4, init: 0n }]);
  assert.equal(reactiveType(t), 'mealy');
  const c = modelOf('asm', chart());
  assert.deepEqual(c.consts, [{ name: 'K', value: 3n }]);
  assert.deepEqual(c.vars.map((v) => v.name), ['n', 'go_meta', 'go_sync']);
  assert.deepEqual(c.every.map((s) => s.target), ['go_meta', 'go_sync', 'f']);
  assert.deepEqual(c.outputs.find((o) => o.name === 'acc'), { name: 'acc', width: 6, default: 1n, registered: true });
  const sw = c.arms.find((x) => x.state === 'RUN').body[1];
  assert.equal(sw.k, 'switch');
  assert.deepEqual(sw.cases.map((x) => x.values), [[0n, 3n], [1n]]);
  assert.deepEqual(sw.others, [{ k: 'go', state: 'IDLE' }]);
  const tt = modelOf('bool', readJson('examples/traffic/src/lamps.bool.json'));
  assert.equal(reactiveType(tt), 'combinational');
  assert.deepEqual(tt.every.map((s) => s.target), ['car_r', 'car_y', 'car_g', 'walk_r', 'walk_g']);
  const p = modelOf('pn', readJson('examples/lock/src/alarm.pn.json'));
  assert.equal(p.name, 'alarm');
  assert.deepEqual(p.states.map((s) => s.name), ['none', 'one', 'two', 'alarmed']);
  // (a marking of two places, and with its pulse: its places' names joined by _)
  assert.deepEqual(modelOf('pn', net()).states.map((s) => s.name), ['ready', 'left_right_split', 'left_right']);
});

test('the drawings\' files: their kinds; the schematic, a circuit and a register map refused with their messages; a drawing with errors refused with them', () => {
  assert.deepEqual(REACTIVE_KINDS, ['fsm', 'asm', 'pn', 'bool', 'tt']);
  assert.deepEqual(drawingToReactive('pn', net()), petriToReactive(net()));
  assert.deepEqual(drawingToReactive('tt', table()), tableToReactive(table()));
  assert.equal(drawingKind('src/a.FSM.json'), 'fsm');
  assert.equal(drawingKind('src/a.vhd'), null);
  const sch = reactiveFromFile('src/control.sch.json', fs.readFileSync(path.join(ROOT, 'examples/lock/src/control.sch.json'), 'utf8'));
  assert.deepEqual(sch, { errors: [{ severity: 'error', message: SCHEMATIC_ON_CPU }] });
  assert.equal(SCHEMATIC_ON_CPU, 'A schematic is hardware: it cannot run on a CPU. Draw the module as a state diagram, an ASM chart, a Petri net or a truth table, or write its code.');
  assert.deepEqual(drawingToReactive('circ', {}).errors.map((d) => d.message), ['A circuit is hardware: it has no CPU code']);
  assert.deepEqual(drawingToReactive('regs', {}).errors.map((d) => d.message), ['A register map is hardware: it has no CPU code']);
  assert.deepEqual(reactiveFromFile('src/a.vhd', '').errors.map((d) => d.message), ['src/a.vhd is not a drawing']);
  assert.match(reactiveFromFile('src/a.fsm.json', '{').errors[0].message, /^src\/a\.fsm\.json is not valid JSON: /);
  const ok = reactiveFromFile('src/traffic.fsm.json', fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8'));
  assert.equal(ok.model.source, 'traffic.fsm.json');
  const bad = mealy(); bad.transitions[1].cond = 'x &&';
  assert.ok(fsmToReactive(bad).errors.length);
  const wide = chart(); wide.registers[0].width = 40;
  assert.deepEqual(drawingToReactive('asm', wide).errors, undefined);   // (a chart may hold 40 bits: the model says it)
  assert.deepEqual(validateReactive(drawingToReactive('asm', wide).model).map((d) => d.message).slice(0, 1), ["'n' is 40 bits wide: at most 32 on a CPU"]);
  const many = { kind: 'petri', name: 'many', inputs: [{ name: 'g', width: 1 }], outputs: [], places: [{ id: 'p', name: 'p', tokens: 0, capacity: 300, outputs: {} }],
    transitions: [{ id: 't', name: 't', guard: 'g', outputs: {} }], arcs: [{ id: 'a', from: 't', to: 'p', weight: 1 }] };
  assert.deepEqual(drawingToReactive('pn', many).errors.map((d) => d.message), ['The net reaches more than 200 markings: too many states for a CPU\'s code']);
});

// ---------------------------------------------------------------------------------------------------- the semantics
/** A hand-written model: a timer, a register read after it is set, a registered output, a switch, guards in order. */
const handModel = () => ({
  kind: 'reactive', version: 1, name: 'hand', from: 'fsm',
  inputs: [{ name: 'go', width: 1 }, { name: 'sel', width: 2 }],
  outputs: [{ name: 'z', width: 4, default: 9n }, { name: 'r', width: 3, default: 5n, registered: true }],
  vars: [{ name: 't', width: 2, init: 0n, timer: true }, { name: 'c', width: 4, init: 1n }],
  consts: [{ name: 'K', value: 2n }],
  states: [{ name: 'A' }, { name: 'B' }], initial: 'A',
  every: [{ k: 'set', target: 'c', expr: { k: 'arith', op: '+', a: { k: 'ref', name: 'c', w: 4 }, b: { k: 'const', v: 1n, w: 4 }, w: 4 } }],
  arms: [
    { state: 'A', body: [
      { k: 'set', target: 'z', expr: { k: 'ref', name: 'c', w: 4 } },   // (c's present value, not the one just set)
      { k: 'if', cond: { k: 'ref', name: 'go', w: 1 }, then: [{ k: 'set', target: 't', expr: { k: 'const', v: 0n, w: 2 } }, { k: 'go', state: 'B' }],
        else: [{ k: 'if', cond: { k: 'cmp', op: '>=', a: { k: 'ref', name: 't', w: 32 }, b: { k: 'ref', name: 'K', w: 32 } }, then: [{ k: 'set', target: 'r', expr: { k: 'ref', name: 't', w: 3 } }], else: [] }] },
    ] },
    { state: 'B', body: [
      { k: 'switch', expr: { k: 'ref', name: 'sel', w: 2 }, cases: [{ values: [0n, 1n], body: [{ k: 'go', state: 'A' }, { k: 'set', target: 'z', expr: { k: 'const', v: 1n, w: 4 } }] }, { values: [1n, 2n], body: [{ k: 'set', target: 'z', expr: { k: 'const', v: 2n, w: 4 } }] }],
        others: [{ k: 'set', target: 'z', expr: { k: 'const', v: 3n, w: 4 } }, { k: 'set', target: 'z', expr: { k: 'const', v: 4n, w: 4 } }] },
    ] },
  ],
});

test('the semantics: inputs sampled once, reads of present values, defaults, a timer counting ticks and held at its maximum, a registered output, the last set winning, a switch\'s first case, the reset state', () => {
  const m = handModel();
  assert.deepEqual(validateReactive(m), []);
  assert.deepEqual(reactiveReset(m), { state: 'A', vars: { t: 0n, c: 1n, r: 5n } });
  const rows = simulateReactive(m, [{ go: 0 }, { go: 0 }, { go: 0 }, { go: 0 }, { go: 1 }, { sel: 1 }, { go: 0 }, { sel: 3, go: 1 }, { sel: 2 }]);
  assert.deepEqual(rows.map((r) => [r.state, Number(r.outputs.z), Number(r.outputs.r), r.next]), [
    ['A', 1, 5, 'A'],     // t 0
    ['A', 2, 5, 'A'],     // t 1
    ['A', 3, 5, 'A'],     // t 2 >= K: r's next 2
    ['A', 4, 2, 'A'],     // t 3 (its maximum): r's next 3
    ['A', 5, 3, 'B'],     // go: t restarted
    ['B', 1, 3, 'A'],     // sel 1: the first case that lists it
    ['A', 7, 3, 'A'],
    ['A', 8, 3, 'B'],
    ['B', 2, 3, 'B'],     // sel 2
  ]);
  const last = reactiveTick(m, { state: 'B', vars: { t: 3n, c: 0n, r: 0n } }, { sel: 3 });
  assert.equal(last.outputs.z, 4n);   // (the last set of the tick)
  assert.equal(last.st.vars.t, 3n);   // (held at its maximum)
  assert.equal(reactiveTick(m, reactiveReset(m), { go: '1', sel: '10' }).next, 'B');   // (binary digits; '1' a number)
  assert.equal(reactiveType(m), 'mealy');
});

test('the model\'s problems: each said', () => {
  const m = handModel();
  m.inputs.push({ name: 'go', width: 1 });
  m.vars.push({ name: 'w', width: 33, init: 0n });
  m.initial = 'Z';
  m.arms.push({ state: 'Q', body: [] });
  m.arms[0].body.push({ k: 'go', state: 'Y' }, { k: 'set', target: 'sel', expr: { k: 'const', v: 0n, w: 2 } }, { k: 'set', target: 'K', expr: { k: 'const', v: 0n, w: 2 } },
    { k: 'set', target: 'c', expr: { k: 'arith', op: '+', a: { k: 'ref', name: 'z', w: 40 }, b: { k: 'ref', name: 'nope', w: 4 }, w: 40 } });
  assert.deepEqual(validateReactive(m).map((d) => `${d.severity}: ${d.message}`), [
    "error: 'go' is declared twice",
    "error: 'w' is 33 bits wide: at most 32 on a CPU",
    "error: The initial state 'Z' is not a state",
    "error: The arm of 'Q' is not of a state",
    "error: 'Y' is not a state",
    "error: 'sel' is not an output or a variable: it cannot be set",
    "error: 'K' is not an output or a variable: it cannot be set",
    "error: 'z' is a combinational output: it cannot be read",
    "error: 'nope' is read but not declared",
    'error: An expression is 40 bits wide: at most 32 on a CPU',
  ]);
  assert.throws(() => simulateReactive(m, [{}]), /'go' is declared twice/);
});

// ---------------------------------------------------------------------------------------------------- the expressions
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; }; }
const OPS = ['+', '-', '&', '|', '^', '<<', '>>', '==', '!=', '<', '>', '<=', '>=', '&&', '||'];
function randomAst(r, depth) {
  const k = depth ? r() % 6 : r() % 3;
  if (k === 0) return { k: 'lit', v: BigInt(r() % 20), w: r() % 2 ? null : 1 + (r() % 6) };
  if (k === 1) return { k: 'id', name: ['a', 'b', 'c'][r() % 3] };
  if (k === 2) return { k: 'sel', name: 'b', hi: 2, lo: r() % 3 };
  if (k === 3) return { k: 'un', op: ['!', '~', '-'][r() % 3], a: randomAst(r, depth - 1) };
  return { k: 'bin', op: OPS[r() % OPS.length], a: randomAst(r, depth - 1), b: randomAst(r, depth - 1) };
}

test('the expressions: lowered by Verilog\'s width rules, as the drawings\' simulators evaluate them; narrowed to a target\'s bits, the same low bits', () => {
  const W = { a: 1, b: 5, c: 12 };
  const width = (n) => W[n] ?? null;
  const r = rng(99);
  for (let i = 0; i < 3000; i++) {
    const ast = randomAst(r, 1 + (i % 4));
    const env = { a: BigInt(r() % 2), b: BigInt(r() % 32), c: BigInt(r() % 4096) };
    const read = (n) => env[n];
    assert.equal(evalExpr(lowerCond(ast, width), read) !== 0n, evalCond(ast, env, (n) => W[n] ?? 1), JSON.stringify(ast, (k, v) => (typeof v === 'bigint' ? `${v}` : v)));
    const Wx = Math.max(7, selfWidth(ast, width)), e = lower(ast, Wx, width);
    for (const t of [1, 3, 7]) assert.equal(evalExpr(narrow(e, t), read) & maskOf(t), evalExpr(e, read) & maskOf(t));   // (its consumer masks it)
  }
  assert.deepEqual(lowerCond(parseCond('x').ast, () => null), { k: 'const', v: 0n, w: 1 });   // (no such input: 0)
  assert.deepEqual(narrow({ k: 'shift', op: '>>', a: { k: 'ref', name: 'c', w: 12 }, b: { k: 'const', v: 2n, w: 32 }, w: 12 }, 4).w, 12);   // (>> keeps its width)
});
