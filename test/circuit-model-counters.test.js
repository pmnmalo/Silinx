// The counters written once in VHDL (#4397, group D: core/circuit-model-counters.js). Their pinouts and their function,
// both written here from their datasheets by pin number: each process of the chip (what wakes it: its clock's edge, its
// asynchronous controls), its count an integer (null: unknown), its outputs; evaluated vector by vector against the
// engine (each core run live) and against the circuit's HDL simulated in VHDL and in Verilog (the core translated by
// Silinx), with no warnings. VHDL's processes wake on any change of what they read, Verilog's always blocks on their
// edges only: the datasheet's processes run both ways, each language against its own (a clear released while a load is
// held reloads in VHDL, not in Verilog). An asynchronous load takes its data when it starts (the 74191's): the vectors
// hold the data while it is active.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS } from '../core/circuit-parts.js';
import { COUNTER_ICS } from '../core/circuit-model-counters.js';
import { circuitPorts } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { simulate, compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { translateSource } from '../core/translate.js';
import { msiBench, circuitBench } from './circuit-helpers.mjs';

const B = '̅';
// three-valued logic (null: unknown)
const NOT = (a) => (a == null ? null : 1 - a);
const AND = (...v) => (v.includes(0) ? 0 : v.includes(null) ? null : 1);
const OR = (...v) => (v.includes(1) ? 1 : v.includes(null) ? null : 0);
const EQ = (n, k) => (n == null ? null : n === k ? 1 : 0);
const BIT = (n, b) => (n == null ? null : (n >> b) & 1);
const num = (c, pins) => pins.reduce((s, p, b) => s + (c[p] << b), 0);
// (a count's steps; null stays null)
const add = (n, d, m) => (n == null ? null : (n + d + m) % m);
const decUp = (n) => (n == null ? null : n === 9 ? 0 : (n + 1) % 16), decDown = (n) => (n == null ? null : n === 0 ? 9 : (n + 15) % 16);
const pin = (n) => (c) => c[n];
// (a count on pins, bit 0 first)
const bits = (key, pins) => (s) => Object.fromEntries(pins.map((p, b) => [p, BIT(s[key], b)]));

// a sheet: `names` its pins' by number; `procs` its processes: `sens` what wakes them ([level of the pins, edge 'r' / 'f'
// (Verilog's) / 'any']), run(c, e, old, nx): c the pins' levels, e(f, edge) an edge between the last vector and this one,
// old the state before, nx the state after (written); `out(c, s)` the outputs' levels by pin; `clocks` its clocks' pins;
// `loads` its asynchronous loads [pin, level, data pins]
const SYNC = ['CLR' + B, 'CLK', 'A', 'B', 'C', 'D', 'ENP', 'GND', 'LOAD' + B, 'ENT', 'QD', 'QC', 'QB', 'QA', 'RCO', 'VCC'];
const DEC160 = { 9: 0, 11: 6, 13: 4, 15: 2 };
const sync160 = (syncClear) => ({ names: SYNC, clocks: [2],
  procs: [{ sens: [[pin(2), 'r'], ...(syncClear ? [] : [[pin(1), 'f']])], run(c, e, o, nx) {
    if (!syncClear && c[1] === 0) nx.q = 0;
    else if (e(pin(2), 'r')) {
      if (syncClear && c[1] === 0) nx.q = 0;
      else if (c[9] === 0) nx.q = num(c, [3, 4, 5, 6]);
      else if (c[7] && c[10]) nx.q = o.q == null ? null : DEC160[o.q] ?? o.q + 1;
    }
  } }],
  out: (c, s) => ({ ...bits('q', [14, 13, 12, 11])(s), 15: AND(c[10], BIT(s.q, 0), BIT(s.q, 3)) }) });
const updown = (decade) => ({ names: [`U/D${B}`, 'CLK', 'A', 'B', 'C', 'D', `ENP${B}`, 'GND', `LOAD${B}`, `ENT${B}`, 'QD', 'QC', 'QB', 'QA', `RCO${B}`, 'VCC'], clocks: [2],
  procs: [{ sens: [[pin(2), 'r']], run(c, e, o, nx) {
    if (!e(pin(2), 'r')) return;
    if (c[9] === 0) nx.q = num(c, [3, 4, 5, 6]);
    else if (c[7] === 0 && c[10] === 0) nx.q = c[1] ? (decade ? decUp(o.q) : add(o.q, 1, 16)) : decade ? decDown(o.q) : add(o.q, -1, 16);
  } }],
  out: (c, s) => ({ ...bits('q', [14, 13, 12, 11])(s), 15: NOT(AND(NOT(c[10]), OR(AND(c[1], EQ(s.q, decade ? 9 : 15)), AND(NOT(c[1]), EQ(s.q, 0))))) }) });
// (a stage of a ripple counter: its clock falling, its asynchronous controls [pin's level, its active edge, its value])
const ripple = (key, clk, ctl, count) => ({ sens: [[pin(clk), 'f'], ...ctl.map(([f, edge]) => [f, edge])], run(c, e, o, nx) {
  const on = ctl.find(([f, edge]) => f(c) === (edge === 'r' ? 1 : 0));
  if (on) nx[key] = typeof on[2] === 'function' ? on[2](c) : on[2];
  else if (e(pin(clk), 'f')) nx[key] = count(o[key]);
} });
const DIV5 = (n) => (n == null ? null : n & 4 ? 0 : n + 1);
const presettable = (decade) => ({ names: [`CT/LOAD${B}`, 'QC', 'C', 'A', 'QA', 'CLK2', 'GND', 'CLK1', 'QB', 'B', 'D', 'QD', `CLR${B}`, 'VCC'], clocks: [8, 6], loads: [[1, 0, [4, 10, 3, 11]]],
  procs: [ripple('a', 8, [[pin(13), 'f', 0], [pin(1), 'f', (c) => c[4]]], NOT), ripple('b', 6, [[pin(13), 'f', 0], [pin(1), 'f', (c) => num(c, [10, 3, 11])]], decade ? DIV5 : (n) => add(n, 1, 8))],
  out: (c, s) => ({ 5: s.a ?? null, ...bits('b', [9, 2, 12])(s) }) });
const r9 = (c) => c[1] & c[3], r0 = (c) => c[12] & c[13];
const dualUp = (decade) => ({ names: ['1CLK', '1EN', '1Q1', '1Q2', '1Q3', '1Q4', '1RESET', 'VSS', '2CLK', '2EN', '2Q1', '2Q2', '2Q3', '2Q4', '2RESET', 'VDD'], clocks: [1, 2, 9, 10],
  procs: [[1, 'n1'], [9, 'n2']].map(([at, key]) => {
    const ck = (c) => c[at] | (1 - c[at + 1]);
    return { sens: [[ck, 'r'], [pin(at + 6), 'r']], run(c, e, o, nx) { if (c[at + 6]) nx[key] = 0; else if (e(ck, 'r')) nx[key] = decade ? decUp(o[key]) : add(o[key], 1, 16); } };
  }),
  out: (c, s) => ({ ...bits('n1', [3, 4, 5, 6])(s), ...bits('n2', [11, 12, 13, 14])(s) }) });
const presetUpDown = (reset) => ({ names: ['PE', 'Q4', reset ? 'P4' : 'J4', reset ? 'P1' : 'J1', `CI${B}`, 'Q1', `CO${B}`, 'VSS', reset ? 'RESET' : `B/D${B}`, `U/D${B}`, 'Q2', reset ? 'P2' : 'J2', reset ? 'P3' : 'J3', 'Q3', 'CLK', 'VDD'],
  clocks: [15], loads: [[1, 1, [4, 12, 13, 3]]],
  procs: [{ sens: [[pin(15), 'r'], [pin(1), 'r'], ...(reset ? [[pin(9), 'r']] : [])], run(c, e, o, nx) {
    const dec = reset || c[9] === 0;
    if (reset && c[9]) nx.q = 0;
    else if (c[1]) nx.q = num(c, [4, 12, 13, 3]);
    else if (e(pin(15), 'r') && c[5] === 0) nx.q = c[10] ? (dec ? decUp(o.q) : add(o.q, 1, 16)) : dec ? decDown(o.q) : add(o.q, -1, 16);
  } }],
  out(c, s) {
    const max = reset ? EQ(s.q, 9) : OR(AND(c[9], EQ(s.q, 15)), AND(NOT(c[9]), EQ(s.q, 9)));
    return { ...bits('q', [6, 11, 14, 2])(s), 7: NOT(AND(NOT(c[5]), OR(AND(c[10], max), AND(NOT(c[10]), EQ(s.q, 0))))) };
  } });
const binRipple = (n, qs) => ({ clocks: [10], procs: [ripple('n', 10, [[pin(11), 'r', 0]], (v) => add(v, 1, 2 ** n))],
  out: (c, s) => Object.fromEntries(qs.map(([p, k]) => [p, BIT(s.n, k - 1)])) });
const Q4020 = [[9, 1], [7, 4], [5, 5], [4, 6], [6, 7], [13, 8], [12, 9], [14, 10], [15, 11], [1, 12], [2, 13], [3, 14]];
const Q4040 = [[9, 1], [7, 2], [6, 3], [5, 4], [3, 5], [2, 6], [4, 7], [13, 8], [12, 9], [14, 10], [15, 11], [1, 12]];
const namesOf = (qs) => Array.from({ length: 16 }, (_, k) => ({ 8: 'VSS', 10: 'CLK', 11: 'RESET', 16: 'VDD' })[k + 1] ?? `Q${qs.find(([p]) => p === k + 1)[1]}`);
const DIV6 = { 0: 1, 1: 2, 2: 4, 3: 4, 4: 5, 5: 6, 6: 0, 7: 0 };

const SHEETS = {
  74160: sync160(false),
  74162: sync160(true),
  74168: updown(true),
  74169: updown(false),
  74190: { names: ['B', 'QB', 'QA', `CTEN${B}`, `D/U${B}`, 'QC', 'QD', 'GND', 'D', 'C', `LOAD${B}`, 'MAX/MIN', `RCO${B}`, 'CLK', 'A', 'VCC'], clocks: [14], loads: [[11, 0, [15, 1, 10, 9]]],
    procs: [{ sens: [[pin(14), 'r'], [pin(11), 'f']], run(c, e, o, nx) {
      if (c[11] === 0) nx.q = num(c, [15, 1, 10, 9]);
      else if (e(pin(14), 'r') && c[4] === 0) nx.q = c[5] === 0 ? decUp(o.q) : decDown(o.q);
    } }],
    out(c, s) { const mm = OR(AND(NOT(c[5]), EQ(s.q, 9)), AND(c[5], EQ(s.q, 0))); return { ...bits('q', [3, 2, 6, 7])(s), 12: mm, 13: NOT(AND(NOT(c[4]), mm, NOT(c[14]))) }; } },
  74192: { names: ['B', 'QB', 'QA', 'DOWN', 'UP', 'QC', 'QD', 'GND', 'D', 'C', `LOAD${B}`, `CO${B}`, `BO${B}`, 'CLR', 'A', 'VCC'], clocks: [5, 4], loads: [[11, 0, [15, 1, 10, 9]]],
    procs: [{ sens: [[pin(5), 'any'], [pin(4), 'any']], run(c, e, o, nx) { if (c[5] === 0 && c[4] === 1) nx.dir = 1; else if (c[4] === 0 && c[5] === 1) nx.dir = 0; } },
      { sens: [[(c) => c[5] & c[4], 'r'], [pin(14), 'r'], [pin(11), 'f']], run(c, e, o, nx) {
        if (c[14]) nx.q = 0;
        else if (c[11] === 0) nx.q = num(c, [15, 1, 10, 9]);
        else if (e((x) => x[5] & x[4], 'r')) nx.q = o.dir === 1 ? decUp(o.q) : o.dir === 0 ? decDown(o.q) : null;
      } }],
    out: (c, s) => ({ ...bits('q', [3, 2, 6, 7])(s), 12: NOT(AND(EQ(s.q, 9), NOT(c[5]))), 13: NOT(AND(EQ(s.q, 0), NOT(c[4]))) }) },
  74196: presettable(true),
  74197: presettable(false),
  74290: { names: ['R9(1)', 'NC', 'R9(2)', 'QC', 'QB', 'NC', 'GND', 'QD', 'QA', 'CKA', 'CKB', 'R0(1)', 'R0(2)', 'VCC'], clocks: [10, 11],
    procs: [ripple('a', 10, [[r9, 'r', 1], [r0, 'r', 0]], NOT), ripple('b', 11, [[r9, 'r', 4], [r0, 'r', 0]], DIV5)],
    out: (c, s) => ({ 9: s.a ?? null, ...bits('b', [5, 4, 8])(s) }) },
  74390: { names: ['1CKA', '1CLR', '1QA', '1CKB', '1QB', '1QC', '1QD', 'GND', '2QD', '2QC', '2QB', '2CKB', '2QA', '2CLR', '2CKA', 'VCC'], clocks: [1, 4, 15, 12],
    procs: [ripple('a1', 1, [[pin(2), 'r', 0]], NOT), ripple('b1', 4, [[pin(2), 'r', 0]], DIV5), ripple('a2', 15, [[pin(14), 'r', 0]], NOT), ripple('b2', 12, [[pin(14), 'r', 0]], DIV5)],
    out: (c, s) => ({ 3: s.a1 ?? null, ...bits('b1', [5, 6, 7])(s), 13: s.a2 ?? null, ...bits('b2', [11, 10, 9])(s) }) },
  74393: { names: ['1A', '1CLR', '1QA', '1QB', '1QC', '1QD', 'GND', '2QD', '2QC', '2QB', '2QA', '2CLR', '2A', 'VCC'], clocks: [1, 13],
    procs: [ripple('n1', 1, [[pin(2), 'r', 0]], (n) => add(n, 1, 16)), ripple('n2', 13, [[pin(12), 'r', 0]], (n) => add(n, 1, 16))],
    out: (c, s) => ({ ...bits('n1', [3, 4, 5, 6])(s), ...bits('n2', [11, 10, 9, 8])(s) }) },
  7492: { names: ['CKB', 'NC', 'NC', 'NC', 'VCC', 'R0(1)', 'R0(2)', 'QD', 'QC', 'GND', 'QB', 'QA', 'NC', 'CKA'], clocks: [14, 1],
    procs: [ripple('a', 14, [[(c) => c[6] & c[7], 'r', 0]], NOT), ripple('b', 1, [[(c) => c[6] & c[7], 'r', 0]], (n) => (n == null ? null : DIV6[n]))],
    out: (c, s) => ({ 12: s.a ?? null, ...bits('b', [11, 9, 8])(s) }) },
  74590: { names: ['QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', 'GND', `RCO${B}`, `CCLR${B}`, 'CCK', `CCKEN${B}`, 'RCK', `G${B}`, 'QA', 'VCC'], clocks: [11, 13],
    procs: [{ sens: [[pin(11), 'r'], [pin(10), 'f']], run(c, e, o, nx) { if (c[10] === 0) nx.n = 0; else if (e(pin(11), 'r') && c[12] === 0) nx.n = add(o.n, 1, 256); } },
      { sens: [[pin(13), 'r']], run(c, e, o, nx) { if (e(pin(13), 'r')) nx.r = o.n ?? null; } }],
    // (its outputs off: 0 on the bench's LEDs)
    out: (c, s) => ({ ...Object.fromEntries([15, 1, 2, 3, 4, 5, 6, 7].map((p, b) => [p, c[14] ? 0 : BIT(s.r, b)])), 9: NOT(EQ(s.n, 255)) }) },
  4020: { names: namesOf(Q4020), ...binRipple(14, Q4020) },
  4040: { names: namesOf(Q4040), ...binRipple(12, Q4040) },
  4022: { names: ['Q1', 'Q0', 'Q2', 'Q5', 'Q6', 'NC', 'Q3', 'VSS', 'NC', 'Q7', 'Q4', 'CO', 'CLK INH', 'CLK', 'RST', 'VDD'], clocks: [14],
    procs: [{ sens: [[pin(14), 'r'], [pin(15), 'r']], run(c, e, o, nx) { if (c[15]) nx.n = 0; else if (e(pin(14), 'r') && c[13] === 0) nx.n = add(o.n, 1, 8); } }],
    out: (c, s) => ({ ...Object.fromEntries([2, 1, 3, 7, 11, 4, 5, 10].map((p, k) => [p, EQ(s.n, k)])), 12: NOT(BIT(s.n, 2)) }) },
  4029: presetUpDown(false),
  4510: presetUpDown(true),
  4518: dualUp(true),
  4520: dualUp(false),
};

// the datasheet's function, vector by vector, as `lang`'s processes wake: the outputs by pin number (null: unknown)
function evaluate(sheet, vectors, lang) {
  let s = {}, prev = null;
  return vectors.map((c) => {
    const e = (f, edge) => !!prev && (edge === 'r' ? f(prev) === 0 && f(c) === 1 : edge === 'f' ? f(prev) === 1 && f(c) === 0 : f(prev) !== f(c));
    const nx = { ...s };
    for (const p of sheet.procs) {
      // (the first vector: every process run once, as VHDL's at its start and Verilog's on its inputs leaving X)
      const wake = !prev || p.sens.some(([f, edge]) => (lang === 'verilog' ? e(f, edge === 'any' ? 'any' : edge) : f(prev) !== f(c)));
      if (wake) p.run(c, e, s, nx);
    }
    s = nx;
    prev = c;
    return sheet.out(c, s);
  });
}
let seed = 29;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed >> 4; };
// a bench's vectors: each input raised in turn, then lowered; each clock pulsed; then at random, a clock most often, a
// load's data held while it is active; and what the datasheet gives for each, as VHDL and as Verilog: the outputs in
// the bench's order, x where unknown
function run(type) {
  const d = PARTS[type], sheet = SHEETS[type], m = msiBench(type, { name: `c${type}` }), { inputs, outputs } = circuitPorts(m);
  const pinOf = (port) => d.pins.find((q) => q.port === port).n;
  const ins = inputs.map((i) => pinOf(i.name)), cur = Object.fromEntries(ins.map((p) => [p, 0])), vectors = [{ ...cur }];
  const held = (p) => (sheet.loads || []).some(([l, v, data]) => cur[l] === v && data.includes(p));
  for (const v of [1, 0]) for (const p of ins) { if (!held(p)) { cur[p] = v; vectors.push({ ...cur }); } }
  for (const p of sheet.clocks) for (const v of [1, 0]) { cur[p] = v; vectors.push({ ...cur }); }
  for (let k = 0; k < 160; k++) {
    const p = rnd() % 5 < 3 ? sheet.clocks[rnd() % sheet.clocks.length] : ins[rnd() % ins.length];
    if (held(p)) continue;
    cur[p] ^= 1;
    vectors.push({ ...cur });
  }
  const want = (lang) => evaluate(sheet, vectors, lang).map((o) => outputs.map((x) => o[pinOf(x.name.replace(/^q_/, ''))] ?? 'x').join(''));
  const byPort = vectors.map((v) => Object.fromEntries(inputs.map((i) => [i.name, v[pinOf(i.name)]])));
  return { m, inputs, outputs, vectors: byPort, vhdl: want('vhdl'), verilog: want('verilog') };
}
const translateCore = (d) => translateSource(d.core.vhdl, { path: `${d.core.entity}.vhd`, to: 'verilog' });
// (a vector's outputs as the datasheet's, where it knows them)
const agrees = (got, want) => [...want].every((c, i) => c === 'x' || got[i] === c);

test('#4397 the counters written once in VHDL: their pinouts, their datasheets\'; their cores, their supply', () => {
  assert.deepEqual(COUNTER_ICS.map((d) => d.type).sort(), Object.keys(SHEETS).sort());
  for (const [type, s] of Object.entries(SHEETS)) {
    const d = PARTS[type];
    assert.deepEqual(d.pins.map((q) => q.name), s.names, type);
    assert.equal(d.kind, 'ic', type);
    assert.equal(d.chip, type.startsWith('74') ? `SN74LS${type.slice(2)}` : `CD${type}B`);
    assert.match(d.core.vhdl, new RegExp(`^library ieee;\\nuse ieee.std_logic_1164.all;\\nuse ieee.numeric_std.all;[\\s\\S]*entity ic${type}_core is[\\s\\S]*end architecture rtl;\\n$`), type);
  }
  // (the 74590's outputs three-state, its RCO̅ not)
  assert.deepEqual(PARTS['74590'].pins.filter((q) => q.tri).map((q) => q.name), ['QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', 'QA']);
  assert.deepEqual(PARTS['74590'].threeState.enable, [['g_n', '0']]);
});

test('#4397 the counters\' cores: their lint and their translation\'s clean', () => {
  for (const d of COUNTER_ICS) {
    for (const [path, text] of [['c.vhd', d.core.vhdl], ['c.v', null]]) {
      const src = text ?? (() => { const r = translateCore(d); assert.ok(r.ok, `${d.type}: ${r.errors.map((e) => e.message)}`); return r.text; })();
      const lib = compile([{ path, text: src }]), e = elaborate(lib, d.core.entity);
      assert.deepEqual([...lib.errors, ...e.diags, ...designChecks(lib, e, { lint: true })].map((x) => `${x.line}: ${x.message}`), [], `${d.type} ${path}: no warnings`);
    }
  }
});

test('#4397 their function against their datasheets\': through the engine (each core run live), Check clean', () => {
  for (const type of Object.keys(SHEETS)) {
    const { m, inputs, outputs, vectors, vhdl } = run(type);
    assert.deepEqual(checkCircuit(m), [], `${type}: a clean bench`);
    const sim = createCircuitSim(m);
    sim.run();
    vectors.forEach((v, k) => {
      for (const i of inputs) sim.set(i.part, v[i.name] === 1);
      sim.run();
      const got = outputs.map((o) => sim.outputs()[o.name]).join('');
      assert.ok(agrees(got, vhdl[k]), `${type} vector ${k}: ${got}, its datasheet ${vhdl[k]}`);
    });
    // (enough of them known: the count once a clear or a load set it)
    assert.ok(vhdl.filter((w) => !/x/.test(w)).length >= 40, `${type}: ${vhdl.filter((w) => !/x/.test(w)).length} vectors known`);
  }
});

test('#4397 their function in the circuit\'s HDL: VHDL and Verilog (the core translated by Silinx) simulated, no warnings', () => {
  for (const type of Object.keys(SHEETS)) {
    const r0 = run(type), { m, inputs, outputs, vectors } = r0;
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateCircuit(m, lang), file = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
      const lib = compile([{ path: file, text: g.code }]), d = elaborate(lib, m.name);
      assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => e.message), [], `${type} ${lang}: no warnings`);
      const r = simulate([{ path: file, text: g.code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name), ns: 400 }) }], 'tb', { until: 1e10 });
      assert.deepEqual(r.errors, [], `${type} ${lang}`);
      const got = r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz]+$/.test(x));
      assert.equal(got.length, vectors.length);
      got.forEach((x, k) => assert.ok(agrees(x, r0[lang][k]), `${type} ${lang} vector ${k}: ${x}, its datasheet ${r0[lang][k]}`));
    }
  }
});
