// The ICs written once in VHDL (#4397, group C: core/circuit-model-ics.js): KiCad's flip-flops, latches and registers. Their
// pinouts and their function, both written here from their datasheets by pin number: each storage element's clock (its
// edge), J and K (or K̅), D, preset, clear and enable, Q and Q̅; evaluated here vector by vector (the asynchronous controls
// first, then a clock's edge between two vectors), against the engine (each core run live) and against the circuit's
// HDL simulated in VHDL and in Verilog (the core translated by Silinx), with no warnings. A flip-flop's preset and clear
// both active then one released: the Verilog's always block sees no release (core/circuit-seq.js's 7474 note), left out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS } from '../core/circuit-parts.js';
import { MODEL_ICS } from '../core/circuit-model-ics.js';
import { circuitPorts } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { simulate, compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { msiBench, circuitBench } from './circuit-helpers.mjs';

const B = '̅';
// a flip-flop: [clk, edge 'r' / 'f', { jk: [J, K] | jkn: [J, K̅] | d: D, pre: [pin, level], clr, ce }, Q, Q̅ | null]
const ff = (clk, edge, o, q, qn = null) => ({ ff: { clk, edge, ...o }, q, qn });
const lat = (en, d, q, qn = null) => ({ latch: { en, d }, q, qn });
const SHEETS = {
  7473: { names: ['1CLK', `1CLR${B}`, '1K', 'VCC', '2CLK', `2CLR${B}`, '2J', `2Q${B}`, '2Q', '2K', 'GND', '1Q', `1Q${B}`, '1J'],
    stores: [ff(1, 'f', { jk: [14, 3], clr: [2, 0] }, 12, 13), ff(5, 'f', { jk: [7, 10], clr: [6, 0] }, 9, 8)] },
  7478: { names: ['CLK', `1PRE${B}`, '1J', 'VCC', `CLR${B}`, `2PRE${B}`, '2K', '2Q', `2Q${B}`, '2J', 'GND', `1Q${B}`, '1Q', '1K'],
    stores: [ff(1, 'f', { jk: [3, 14], pre: [2, 0], clr: [5, 0] }, 13, 12), ff(1, 'f', { jk: [10, 7], pre: [6, 0], clr: [5, 0] }, 8, 9)] },
  74107: { names: ['1J', `1Q${B}`, '1Q', '1K', '2Q', `2Q${B}`, 'GND', '2J', '2CLK', `2CLR${B}`, '2K', '1CLK', `1CLR${B}`, 'VCC'],
    stores: [ff(12, 'f', { jk: [1, 4], clr: [13, 0] }, 3, 2), ff(9, 'f', { jk: [8, 11], clr: [10, 0] }, 5, 6)] },
  74109: { names: [`1CLR${B}`, '1J', `1K${B}`, '1CLK', `1PRE${B}`, '1Q', `1Q${B}`, 'GND', `2Q${B}`, '2Q', `2PRE${B}`, '2CLK', `2K${B}`, '2J', `2CLR${B}`, 'VCC'],
    stores: [ff(4, 'r', { jkn: [2, 3], pre: [5, 0], clr: [1, 0] }, 6, 7), ff(12, 'r', { jkn: [14, 13], pre: [11, 0], clr: [15, 0] }, 10, 9)] },
  74113: { names: ['1CLK', '1K', '1J', `1PRE${B}`, '1Q', `1Q${B}`, 'GND', `2Q${B}`, '2Q', `2PRE${B}`, '2J', '2K', '2CLK', 'VCC'],
    stores: [ff(1, 'f', { jk: [3, 2], pre: [4, 0] }, 5, 6), ff(13, 'f', { jk: [11, 12], pre: [10, 0] }, 9, 8)] },
  74114: { names: [`CLR${B}`, '1K', '1J', `1PRE${B}`, '1Q', `1Q${B}`, 'GND', `2Q${B}`, '2Q', `2PRE${B}`, '2J', '2K', 'CLK', 'VCC'],
    stores: [ff(13, 'f', { jk: [3, 2], pre: [4, 0], clr: [1, 0] }, 5, 6), ff(13, 'f', { jk: [11, 12], pre: [10, 0], clr: [1, 0] }, 9, 8)] },
  4013: { names: ['1Q', `1Q${B}`, '1CLK', '1R', '1D', '1S', 'VSS', '2S', '2D', '2R', '2CLK', `2Q${B}`, '2Q', 'VDD'],
    stores: [ff(3, 'r', { d: 5, pre: [6, 1], clr: [4, 1] }, 1, 2), ff(11, 'r', { d: 9, pre: [8, 1], clr: [10, 1] }, 13, 12)] },
  4027: { names: ['1Q', `1Q${B}`, '1CLK', '1R', '1K', '1J', '1S', 'VSS', '2S', '2J', '2K', '2R', '2CLK', `2Q${B}`, '2Q', 'VDD'],
    stores: [ff(3, 'r', { jk: [6, 5], pre: [7, 1], clr: [4, 1] }, 1, 2), ff(13, 'r', { jk: [10, 11], pre: [9, 1], clr: [12, 1] }, 15, 14)] },
  7475: { names: [`1Q${B}`, '1D', '2D', '3C,4C', 'VCC', '3D', '4D', `4Q${B}`, '4Q', '3Q', `3Q${B}`, 'GND', '1C,2C', `2Q${B}`, '2Q', '1Q'],
    stores: [lat(13, 2, 16, 1), lat(13, 3, 15, 14), lat(4, 6, 10, 11), lat(4, 7, 9, 8)] },
  7477: { names: ['1D', '2D', '3C,4C', 'VCC', '3D', '4D', 'NC', '4Q', '3Q', 'NC', 'GND', '1C,2C', '2Q', '1Q'],
    stores: [lat(12, 1, 14), lat(12, 2, 13), lat(3, 5, 9), lat(3, 6, 8)] },
  74375: { names: ['1D', `1Q${B}`, '1Q', '1C,2C', '2Q', `2Q${B}`, '2D', 'GND', '3D', `3Q${B}`, '3Q', '3C,4C', '4Q', `4Q${B}`, '4D', 'VCC'],
    stores: [lat(4, 1, 3, 2), lat(4, 7, 5, 6), lat(12, 9, 11, 10), lat(12, 15, 13, 14)] },
  74279: { names: [`1R${B}`, `1S1${B}`, `1S2${B}`, '1Q', `2R${B}`, `2S${B}`, '2Q', 'GND', '3Q', `3R${B}`, `3S1${B}`, `3S2${B}`, '4Q', `4R${B}`, `4S${B}`, 'VCC'],
    stores: [{ sr: { s: [2, 3], r: 1 }, q: 4 }, { sr: { s: [6], r: 5 }, q: 7 }, { sr: { s: [11, 12], r: 10 }, q: 9 }, { sr: { s: [15], r: 14 }, q: 13 }] },
  74174: { names: [`CLR${B}`, '1Q', '1D', '2D', '2Q', '3D', '3Q', 'GND', 'CLK', '4Q', '4D', '5Q', '5D', '6D', '6Q', 'VCC'],
    stores: [[3, 2], [4, 5], [6, 7], [11, 10], [13, 12], [14, 15]].map(([d, q]) => ff(9, 'r', { d, clr: [1, 0] }, q)) },
  74175: { names: [`CLR${B}`, '1Q', `1Q${B}`, '1D', '2D', `2Q${B}`, '2Q', 'GND', 'CLK', '3Q', `3Q${B}`, '3D', '4D', `4Q${B}`, '4Q', 'VCC'],
    stores: [[4, 2, 3], [5, 7, 6], [12, 10, 11], [13, 15, 14]].map(([d, q, qn]) => ff(9, 'r', { d, clr: [1, 0] }, q, qn)) },
  74273: { names: [`CLR${B}`, '1Q', '1D', '2D', '2Q', '3Q', '3D', '4D', '4Q', 'GND', 'CLK', '5Q', '5D', '6D', '6Q', '7Q', '7D', '8D', '8Q', 'VCC'],
    stores: [[3, 2], [4, 5], [7, 6], [8, 9], [13, 12], [14, 15], [17, 16], [18, 19]].map(([d, q]) => ff(11, 'r', { d, clr: [1, 0] }, q)) },
  74377: { names: [`E${B}`, '1Q', '1D', '2D', '2Q', '3Q', '3D', '4D', '4Q', 'GND', 'CLK', '5Q', '5D', '6D', '6Q', '7Q', '7D', '8D', '8Q', 'VCC'],
    stores: [[3, 2], [4, 5], [7, 6], [8, 9], [13, 12], [14, 15], [17, 16], [18, 19]].map(([d, q]) => ff(11, 'r', { d, ce: [1, 0] }, q)) },
  74378: { names: [`E${B}`, '1Q', '1D', '2D', '2Q', '3D', '3Q', 'GND', 'CLK', '4Q', '4D', '5Q', '5D', '6D', '6Q', 'VCC'],
    stores: [[3, 2], [4, 5], [6, 7], [11, 10], [13, 12], [14, 15]].map(([d, q]) => ff(9, 'r', { d, ce: [1, 0] }, q)) },
  74379: { names: [`E${B}`, '1Q', `1Q${B}`, '1D', '2D', `2Q${B}`, '2Q', 'GND', 'CLK', '3Q', `3Q${B}`, '3D', '4D', `4Q${B}`, '4Q', 'VCC'],
    stores: [[4, 2, 3], [5, 7, 6], [12, 10, 11], [13, 15, 14]].map(([d, q, qn]) => ff(9, 'r', { d, ce: [1, 0] }, q, qn)) },
  // (three-state outputs: `oe` their enables [pin, level], all at their levels; off, an LED of the bench dark: 0)
  74173: { names: ['M', 'N', '1Q', '2Q', '3Q', '4Q', 'CLK', 'GND', `G1${B}`, `G2${B}`, '4D', '3D', '2D', '1D', 'CLR', 'VCC'], oe: [[1, 0], [2, 0]],
    stores: [[14, 3], [13, 4], [12, 5], [11, 6]].map(([d, q]) => ff(7, 'r', { d, clr: [15, 1], ce: [[9, 0], [10, 0]] }, q)) },
  74373: { names: [`OE${B}`, '1Q', '1D', '2D', '2Q', '3Q', '3D', '4D', '4Q', 'GND', 'LE', '5Q', '5D', '6D', '6Q', '7Q', '7D', '8D', '8Q', 'VCC'], oe: [[1, 0]],
    stores: [[3, 2], [4, 5], [7, 6], [8, 9], [13, 12], [14, 15], [17, 16], [18, 19]].map(([d, q]) => lat(11, d, q)) },
  74374: { names: [`OE${B}`, '1Q', '1D', '2D', '2Q', '3Q', '3D', '4D', '4Q', 'GND', 'CLK', '5Q', '5D', '6D', '6Q', '7Q', '7D', '8D', '8Q', 'VCC'], oe: [[1, 0]],
    stores: [[3, 2], [4, 5], [7, 6], [8, 9], [13, 12], [14, 15], [17, 16], [18, 19]].map(([d, q]) => ff(11, 'r', { d }, q)) },
  74573: { names: [`OE${B}`, '1D', '2D', '3D', '4D', '5D', '6D', '7D', '8D', 'GND', 'LE', '8Q', '7Q', '6Q', '5Q', '4Q', '3Q', '2Q', '1Q', 'VCC'], oe: [[1, 0]],
    stores: [2, 3, 4, 5, 6, 7, 8, 9].map((d, k) => lat(11, d, 19 - k)) },
  74574: { names: [`OE${B}`, '1D', '2D', '3D', '4D', '5D', '6D', '7D', '8D', 'GND', 'CLK', '8Q', '7Q', '6Q', '5Q', '4Q', '3Q', '2Q', '1Q', 'VCC'], oe: [[1, 0]],
    stores: [2, 3, 4, 5, 6, 7, 8, 9].map((d, k) => ff(11, 'r', { d }, 19 - k)) },
};

// the datasheet's function, vector by vector: `cur`, `prev` the pins' levels (0 / 1, by number), `st` the elements'
// states (null: unknown); the outputs' levels by pin number (null: unknown)
function step(sheet, prev, cur, st) {
  const out = {};
  sheet.stores.forEach((e, k) => {
    const both = e.ff?.pre && e.ff?.clr && cur[e.ff.pre[0]] === e.ff.pre[1] && cur[e.ff.clr[0]] === e.ff.clr[1];
    if (e.latch) { if (cur[e.latch.en] === 1) st[k] = cur[e.latch.d]; }
    else if (e.sr) { if (e.sr.s.some((p) => cur[p] === 0)) st[k] = 1; else if (cur[e.sr.r] === 0) st[k] = 0; }
    else {
      const f = e.ff;
      if (f.pre && cur[f.pre[0]] === f.pre[1]) st[k] = 1;
      else if (f.clr && cur[f.clr[0]] === f.clr[1]) st[k] = 0;
      else if (prev && (f.edge === 'r' ? prev[f.clk] === 0 && cur[f.clk] === 1 : prev[f.clk] === 1 && cur[f.clk] === 0) && (!f.ce || (Array.isArray(f.ce[0]) ? f.ce : [f.ce]).every(([p, v]) => cur[p] === v))) {
        if ('d' in f) st[k] = cur[f.d];
        else {
          const j = cur[(f.jk ?? f.jkn)[0]], kk = f.jk ? cur[f.jk[1]] : 1 - cur[f.jkn[1]];
          st[k] = j && kk ? (st[k] == null ? null : 1 - st[k]) : j ? 1 : kk ? 0 : st[k];
        }
      }
    }
    // (its outputs off: 0 on the bench's LEDs)
    const off = sheet.oe && !sheet.oe.every(([p, v]) => cur[p] === v);
    out[e.q] = off ? 0 : st[k];
    if (e.qn) out[e.qn] = both ? 1 : st[k] == null ? null : 1 - st[k];
  });
  return out;
}
let seed = 13;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed >> 4; };
// a bench's vectors (one input toggled at a time, from all low), and what the datasheet gives for each: its outputs in the
// bench's order, x where unknown
function run(type) {
  const d = PARTS[type], m = msiBench(type, { name: `c${type}` }), { inputs, outputs } = circuitPorts(m);
  const pinOf = (port) => d.pins.find((q) => q.port === port).n;
  // (each input raised in turn, then lowered in turn: every latch loaded, every clock an edge; then at random)
  const cur = Object.fromEntries(inputs.map((i) => [i.name, 0])), vectors = [{ ...cur }];
  for (const v of [1, 0]) for (const i of inputs) { cur[i.name] = v; vectors.push({ ...cur }); }
  // (and each clock pulsed, the other inputs low: an enable's active level, a register loaded)
  for (const i of inputs.filter((x) => /^clk/.test(x.name))) for (const v of [1, 0]) { cur[i.name] = v; vectors.push({ ...cur }); }
  for (let k = 0; k < 60; k++) { const n = inputs[rnd() % inputs.length].name; cur[n] ^= 1; vectors.push({ ...cur }); }
  const st = [];
  let prev = null;
  const want = vectors.map((v) => {
    const pins = Object.fromEntries(inputs.map((i) => [pinOf(i.name), v[i.name]]));
    const o = step(SHEETS[type], prev, pins, st);
    prev = pins;
    return outputs.map((x) => (o[pinOf(x.name.replace(/^q_/, ''))] ?? 'x')).join('');
  });
  return { m, inputs, outputs, vectors, want };
}
// (a vector's outputs as the datasheet's, where it knows them)
const agrees = (got, want) => [...want].every((c, i) => c === 'x' || got[i] === c);
// (a preset and a clear both active before this vector, one of them released now: Verilog's corner)
const released = (type, vectors, k) => SHEETS[type].stores.some((e) => {
  const f = e.ff, pin = (p) => PARTS[type].pins.find((q) => q.n === p).port;
  if (!f?.pre || !f?.clr || !k) return false;
  const on = (v) => v[pin(f.pre[0])] === f.pre[1] && v[pin(f.clr[0])] === f.clr[1];
  return vectors.slice(0, k).some(on);
});

test('#4397 the ICs written once in VHDL: their pinouts, their datasheets\'; their cores and supply', () => {
  assert.deepEqual(MODEL_ICS.map((d) => d.type).sort(), Object.keys(SHEETS).sort());
  for (const [type, s] of Object.entries(SHEETS)) {
    const d = PARTS[type];
    assert.deepEqual(d.pins.map((q) => q.name), s.names, type);
    assert.equal(d.kind, 'ic', type);
    assert.equal(d.chip, type.startsWith('74') ? `SN74LS${type.slice(2)}` : `CD${type}B`);
    assert.match(d.core.vhdl, new RegExp(`^library ieee;[\\s\\S]*entity ic${type}_core is[\\s\\S]*end architecture rtl;\\n$`), type);
  }
});

test('#4397 their function against their datasheets\': through the engine (each core run live), Check clean', () => {
  for (const type of Object.keys(SHEETS)) {
    const { m, inputs, outputs, vectors, want } = run(type);
    assert.deepEqual(checkCircuit(m), [], `${type}: a clean bench`);
    const sim = createCircuitSim(m);
    sim.run();
    vectors.forEach((v, k) => {
      for (const i of inputs) sim.set(i.part, v[i.name] === 1);
      sim.run();
      const got = outputs.map((o) => sim.outputs()[o.name]).join('');
      assert.ok(agrees(got, want[k]), `${type} vector ${k}: ${got}, its datasheet ${want[k]}`);
    });
    // (enough of them known: a latch's or a flip-flop's every output once its state is)
    assert.ok(want.filter((w) => !/x/.test(w)).length >= 10, `${type}: ${want.filter((w) => !/x/.test(w)).length} vectors known`);
  }
});

test('#4397 their function in the circuit\'s HDL: VHDL and Verilog (the core translated by Silinx) simulated, no warnings', () => {
  for (const type of Object.keys(SHEETS)) {
    const { m, inputs, outputs, vectors, want } = run(type);
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateCircuit(m, lang), file = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
      const lib = compile([{ path: file, text: g.code }]), d = elaborate(lib, m.name);
      assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => e.message), [], `${type} ${lang}: no warnings`);
      const r = simulate([{ path: file, text: g.code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name), ns: 400 }) }], 'tb', { until: 1e10 });
      assert.deepEqual(r.errors, [], `${type} ${lang}`);
      const got = r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz]+$/.test(x));
      assert.equal(got.length, vectors.length);
      got.forEach((x, k) => { if (!(lang === 'verilog' && released(type, vectors, k))) assert.ok(agrees(x, want[k]), `${type} ${lang} vector ${k}: ${x}, its datasheet ${want[k]}`); });
    }
  }
});
