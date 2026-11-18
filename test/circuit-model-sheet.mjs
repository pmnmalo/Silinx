// A datasheet's function as a test's reference (#4397: the ICs written once in VHDL, core/circuit-model-*.js), written
// by pin number in the test, evaluated vector by vector as VHDL's processes and Verilog's always blocks wake, and the
// bench that runs an IC against it: through the engine (its core run live) and through the circuit's HDL simulated in
// VHDL and in Verilog (the core translated by Silinx), with no warnings.
//
// A sheet: `names` its pins' by number; `init()` its state; `procs` its processes: `sens` what wakes them ([a function of
// the pins' levels, its edge 'r' / 'f' (Verilog's) / 'any']), run(c, e, old, nx): c the pins' levels, e(f, edge) an edge
// between the last vector and this one, old the state before, nx the state after (written); `out(c, s)` the outputs'
// levels by pin (null: unknown); `clocks` its clocks' pins (pulsed most often); `loads` its asynchronous loads [pin,
// level, data pins] (the data held while one is active); `exhaustive`: every combination of its inputs (combinational);
// `steps`: the random vectors (one input changed in each: a latch's data never changes with its enable); `vectors()`: its
// own, by pin.
import assert from 'node:assert/strict';
import { PARTS } from '../core/circuit-parts.js';
import { circuitPorts } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { simulate, compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { translateSource } from '../core/translate.js';
import { msiBench, circuitBench } from './circuit-helpers.mjs';

// three-valued logic (null: unknown)
export const NOT = (a) => (a == null ? null : 1 - a);
export const AND = (...v) => (v.includes(0) ? 0 : v.includes(null) ? null : 1);
export const OR = (...v) => (v.includes(1) ? 1 : v.includes(null) ? null : 0);
export const XOR = (...v) => (v.includes(null) ? null : v.reduce((a, b) => a ^ b, 0));
export const pin = (n) => (c) => c[n];
/** A number of the pins' levels, bit 0 first (null: one unknown). */
export const num = (c, pins) => (pins.some((p) => c[p] == null) ? null : pins.reduce((s, p, b) => s + (c[p] << b), 0));
/** A register of n unknown bits; one shifted into its first stage. */
export const unknown = (n) => Array(n).fill(null);
export const shiftIn = (r, bit) => [bit, ...r.slice(0, -1)];

// the datasheet's function, vector by vector, as `lang`'s processes wake: the outputs by pin number (null: unknown)
function evaluate(sheet, vectors, lang) {
  let s = sheet.init ? sheet.init() : {}, prev = null;
  return vectors.map((c) => {
    const e = (f, edge) => !!prev && (edge === 'r' ? f(prev) === 0 && f(c) === 1 : edge === 'f' ? f(prev) === 1 && f(c) === 0 : f(prev) !== f(c));
    const nx = { ...s };
    for (const p of sheet.procs || []) {
      // (the first vector: every process run once, as VHDL's at its start and Verilog's on its inputs leaving X)
      const wake = !prev || p.sens.some(([f, edge]) => (lang === 'verilog' ? e(f, edge) : f(prev) !== f(c)));
      if (wake) p.run(c, e, s, nx);
    }
    s = nx;
    prev = c;
    return sheet.out(c, s);
  });
}

let seed = 29;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed >> 4; };
/**
 * A bench of the IC `type` and its vectors: each input raised in turn, then lowered; each clock pulsed; then at random
 * (`steps` of them), a clock most often, a load's data held while it is active (a combinational sheet: every combination
 * of its inputs); and what the datasheet gives for each, as VHDL and as Verilog: the outputs in the bench's order, x where
 * unknown.
 */
export function sheetRun(type, sheet, { steps = 160 } = {}) {
  const d = PARTS[type], m = msiBench(type, { name: `c${type}` }), { inputs, outputs } = circuitPorts(m);
  const pinOf = (port) => d.pins.find((q) => q.port === port).n;
  const ins = inputs.map((i) => pinOf(i.name)), vectors = [];
  if (sheet.vectors) vectors.push(...sheet.vectors());
  else if (sheet.exhaustive) {
    for (let k = 0; k < 2 ** ins.length; k++) vectors.push(Object.fromEntries(ins.map((p, b) => [p, (k >> b) & 1])));
  } else {
    const cur = Object.fromEntries(ins.map((p) => [p, 0]));
    vectors.push({ ...cur });
    const held = (p) => (sheet.loads || []).some(([l, v, data]) => cur[l] === v && data.includes(p));
    for (const v of [1, 0]) for (const p of ins) { if (!held(p)) { cur[p] = v; vectors.push({ ...cur }); } }
    for (const p of sheet.clocks || []) for (const v of [1, 0]) { cur[p] = v; vectors.push({ ...cur }); }
    for (let k = 0; k < (sheet.steps ?? steps); k++) {
      const clocks = sheet.clocks || [];
      const p = clocks.length && rnd() % 5 < 3 ? clocks[rnd() % clocks.length] : ins[rnd() % ins.length];
      if (held(p)) continue;
      cur[p] ^= 1;
      vectors.push({ ...cur });
    }
  }
  const want = (lang) => evaluate(sheet, vectors, lang).map((o) => outputs.map((x) => o[pinOf(x.name.replace(/^q_/, ''))] ?? 'x').join(''));
  const byPort = vectors.map((v) => Object.fromEntries(inputs.map((i) => [i.name, v[pinOf(i.name)]])));
  return { m, inputs, outputs, vectors: byPort, vhdl: want('vhdl'), verilog: want('verilog') };
}

// (a vector's outputs as the datasheet's, where it knows them)
const agrees = (got, want) => [...want].every((c, i) => c === 'x' || got[i] === c);

/** Each IC's pin names its sheet's, its core's VHDL and its translation to Verilog with no warnings. */
export function checkCores(list, sheets) {
  assert.deepEqual(list.map((d) => d.type).sort(), Object.keys(sheets).sort());
  for (const d of list) {
    assert.deepEqual(d.pins.map((q) => q.name), sheets[d.type].names, d.type);
    assert.equal(d.kind, 'ic', d.type);
    assert.match(d.core.vhdl, new RegExp(`^library ieee;\\nuse ieee.std_logic_1164.all;\\nuse ieee.numeric_std.all;[\\s\\S]*entity ic${d.type}_core is[\\s\\S]*end architecture rtl;\\n$`), d.type);
    const t = translateSource(d.core.vhdl, { path: `${d.core.entity}.vhd`, to: 'verilog' });
    assert.ok(t.ok, `${d.type}: ${t.errors.map((e) => e.message)}`);
    for (const [path, text] of [['c.vhd', d.core.vhdl], ['c.v', t.text]]) {
      const lib = compile([{ path, text }]), e = elaborate(lib, d.core.entity);
      assert.deepEqual([...lib.errors, ...e.diags, ...designChecks(lib, e, { lint: true })].map((x) => `${x.line}: ${x.message}`), [], `${d.type} ${path}: no warnings`);
    }
  }
}

/** The IC's bench through the engine (its core run live), Check clean: each vector's outputs the datasheet's; the vectors known. */
export function checkEngine(type, sheet, { known = 40 } = {}) {
  const { m, inputs, outputs, vectors, vhdl } = sheetRun(type, sheet);
  assert.deepEqual(checkCircuit(m), [], `${type}: a clean bench`);
  const sim = createCircuitSim(m);
  sim.run();
  vectors.forEach((v, k) => {
    for (const i of inputs) sim.set(i.part, v[i.name] === 1);
    sim.run();
    const got = outputs.map((o) => sim.outputs()[o.name]).join('');
    assert.ok(agrees(got, vhdl[k]), `${type} vector ${k}: ${got}, its datasheet ${vhdl[k]}`);
  });
  const n = vhdl.filter((w) => !/x/.test(w)).length;
  assert.ok(n >= Math.min(known, vectors.length), `${type}: ${n} vectors known`);
}

/** The IC's bench in the circuit's HDL, VHDL and Verilog simulated, no warnings: each vector's outputs the datasheet's. */
export function checkHdl(type, sheet) {
  const r0 = sheetRun(type, sheet), { m, inputs, outputs, vectors } = r0;
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
