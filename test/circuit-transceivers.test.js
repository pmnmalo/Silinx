// The bus transceivers (#4397, group B: core/circuit-ics.js): the 74242 (inverting), 74243 and 74245, their A and B pins
// inputs and three-state outputs at once; each one tried both ways, its source side's pins on switches and the other's
// on LEDs pulled down, against its function table written here (its datasheet's), through the engine and through its
// HDL simulated in VHDL and in Verilog, with Check's exact warnings. And #4409: three-state outputs on one net are a bus,
// not a short; with a plain output on the net, a warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, partPins } from '../core/circuit-parts.js';
import { newCircuit, normalizeCircuit, circuitPorts } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { simulate, compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { circuitBench } from './circuit-helpers.mjs';
import { synthesisText } from '../core/translate-off.js';

// each transceiver's datasheet, written here: its A and B pins bit by bit, its controls (name → pin), whether it inverts,
// and when each direction is enabled (from the controls' levels)
const SHEET = {
  74242: { a: [3, 4, 5, 6], b: [11, 10, 9, 8], ctl: { gab: 1, gba: 13 }, inv: true, ab: (c) => c.gab === 0, ba: (c) => c.gba === 1 },
  74243: { a: [3, 4, 5, 6], b: [11, 10, 9, 8], ctl: { gab: 1, gba: 13 }, inv: false, ab: (c) => c.gab === 0, ba: (c) => c.gba === 1 },
  74245: { a: [2, 3, 4, 5, 6, 7, 8, 9], b: [18, 17, 16, 15, 14, 13, 12, 11], ctl: { dir: 1, oe: 19 }, inv: false, ab: (c) => c.oe === 0 && c.dir === 1, ba: (c) => c.oe === 0 && c.dir === 0 },
};

// a bench driving one side (`from`: 'a' or 'b'): its pins on switches s0…, the other side's on LEDs y0… pulled down, the
// controls on switches named after them; the IC's pin 1 at (0, 0), the supply at (-20, -20)
function bench(type, from) {
  const s = SHEET[type], m = newCircuit(`x${type}${from}`, 'vhdl', { breadboard: false }), ic = { id: 'U1', type, x: 0, y: 0 };
  m.parts.push(ic, { id: 'P1', type: 'supply', x: -20, y: -20 });
  const pin = new Map(partPins(ic).map((q) => [q.n, [q.x, q.y]]));
  let w = 0, row = 0;
  const W = (...points) => m.wires.push({ id: `w${++w}`, points, color: 'blue' });
  const d = PARTS[type];
  W([-20, -20], pin.get(d.pins.find((q) => q.dir === 'vcc').n)); W([-20, -19], pin.get(d.pins.find((q) => q.dir === 'gnd').n));
  const src = from === 'a' ? s.a : s.b, dst = from === 'a' ? s.b : s.a;
  src.forEach((n, k) => { m.parts.push({ id: `S${k}`, type: 'logic-switch', x: -40, y: row, label: `s${k}` }); W([-40, row++], pin.get(n)); });
  for (const [c, n] of Object.entries(s.ctl)) { m.parts.push({ id: `C${n}`, type: 'logic-switch', x: -40, y: row, label: c }); W([-40, row++], pin.get(n)); }
  dst.forEach((n, k) => {
    m.parts.push({ id: `D${k}`, type: 'led', x: 30 + 3 * k, y: 10, label: `y${k}` }, { id: `R${k}`, type: 'pull-down', x: 30 + 3 * k, y: 14 });
    W(pin.get(n), [30 + 3 * k, 10]); W([31 + 3 * k, 10], [-20, -19]); W([30 + 3 * k, 14], [30 + 3 * k, 10]);
  });
  return normalizeCircuit(m);
}
// its outputs for a vector: the source side through (inverted or not) while that direction is enabled, else 0 (pulled down)
const want = (type, from, v) => {
  const s = SHEET[type], on = from === 'a' ? s.ab(v) : s.ba(v);
  return (from === 'a' ? s.b : s.a).map((_, k) => (on ? String(s.inv ? 1 - v[`s${k}`] : v[`s${k}`]) : '0')).join('');
};
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed >> 4; };
const LANGS = ['vhdl', 'verilog'];

test('#4397 the transceivers both ways against their function tables: the engine, and their HDL in VHDL and in Verilog with no warnings', () => {
  for (const type of Object.keys(SHEET)) {
    for (const from of ['a', 'b']) {
      const m = bench(type, from), { inputs, outputs } = circuitPorts(m);
      // (both ways enabled at once, a 74242's or 74243's GAB̅ low and GBA high: its datasheet's forbidden case, the bus
      // fighting itself; left out)
      const vectors = Array.from({ length: 32 }, () => Object.fromEntries(inputs.map((i) => [i.name, rnd() & 1]))).filter((v) => !(SHEET[type].ab(v) && SHEET[type].ba(v)));
      const sim = createCircuitSim(m);
      sim.run();
      for (const v of vectors) {
        for (const i of inputs) sim.set(i.part, v[i.name] === 1);
        sim.run();
        assert.equal(outputs.map((o) => sim.outputs()[o.name]).join(''), want(type, from, v), `${type} from ${from}: ${JSON.stringify(v)}`);
      }
      for (const lang of LANGS) {
        const g = generateCircuit(m, lang), file = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
        const lib = compile([{ path: file, text: g.code }]), d = elaborate(lib, m.name);
        assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => e.message), [], `${type} ${from} ${lang}: no warnings`);
        const r = simulate([{ path: file, text: g.code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name), ns: 400 }) }], 'tb', { until: 1e9 });
        assert.deepEqual(r.errors, [], `${type} ${from} ${lang}`);
        assert.deepEqual(r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz]+$/.test(x)), vectors.map((v) => want(type, from, v)), `${type} ${from} ${lang}`);
        // its digital model, as synthesis reads it: the same, with no Z and no delay
        const code = synthesisText(g.code);
        // (its Verilog's simulation model behind `ifdef SILINX_SIM_…, which synthesis does not define)
        assert.doesNotMatch(code.replace(/`ifdef SILINX_SIM_\w+\n[\s\S]*?`else\n/g, ''), /'Z'|1'bz|\bafter\b|#\d/, `${type} ${from} ${lang}: no Z, no delay`);
        const ds = simulate([{ path: file, text: code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name), ns: 400 }) }], 'tb', { until: 1e9 });
        assert.deepEqual(ds.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz]+$/.test(x)), vectors.map((v) => want(type, from, v)), `${type} ${from} ${lang}: digital`);
      }
    }
  }
});

test('#4397 the transceivers\' pinouts, their datasheets\': A and B inputs and three-state outputs at once', () => {
  const names = (t) => PARTS[t].pins.map((q) => q.name);
  for (const t of ['74242', '74243']) assert.deepEqual(names(t), ['GAB\u0305', 'NC', 'A1', 'A2', 'A3', 'A4', 'GND', 'B4', 'B3', 'B2', 'B1', 'NC', 'GBA', 'VCC'], t);
  assert.deepEqual(names('74245'), ['DIR', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'GND', 'B8', 'B7', 'B6', 'B5', 'B4', 'B3', 'B2', 'B1', 'OE\u0305', 'VCC']);
  for (const t of Object.keys(SHEET)) for (const q of PARTS[t].pins.filter((x) => /^[AB]\d$/.test(x.name))) assert.deepEqual([q.dir, q.tri, q.io], ['out', true, true], `${t} ${q.name}`);
});

test('#4397 a transceiver bench\'s Check: its switches on pins it drives the other way, a short while that way is enabled', () => {
  const msgs = checkCircuit(bench('74245', 'a')).map((x) => `${x.severity}: ${x.message}`);
  assert.deepEqual(msgs, [0, 1, 2, 3, 4, 5, 6, 7].map((k) => `warning: U1 A${k + 1} (3-state) and S${k} out drive one net: a short whenever it is enabled`));
});

test('#4409 two three-state outputs on one net: a bus, no short; with a plain output on it, a warning', () => {
  // two 74125s, their 1Y (pin 3) joined, each its 1A (pin 2) and 1OE̅ (pin 1) on a switch; an LED on the bus, pulled down
  const m = newCircuit('bus2', 'vhdl', { breadboard: false });
  m.parts.push({ id: 'U1', type: '74125', x: 0, y: 0 }, { id: 'U2', type: '74125', x: 0, y: 10 }, { id: 'P1', type: 'supply', x: -20, y: -20 },
    { id: 'D1', type: 'led', x: 20, y: 5, label: 'q' }, { id: 'R1', type: 'pull-down', x: 20, y: 8 });
  let w = 0;
  const W = (...points) => m.wires.push({ id: `w${++w}`, points, color: 'blue' });
  ['U1', 'U2'].forEach((u, i) => {
    const pin = new Map(partPins(m.parts.find((p) => p.id === u)).map((q) => [q.n, [q.x, q.y]]));
    W([-20, -20], pin.get(14)); W([-20, -19], pin.get(7));
    for (const [n, l] of [[2, `a${i}`], [1, `oe${i}`]]) { m.parts.push({ id: `S${l}`, type: 'logic-switch', x: -40, y: 2 * i + (n === 1 ? 1 : 0), label: l }); W([-40, 2 * i + (n === 1 ? 1 : 0)], pin.get(n)); }
    W(pin.get(3), [20, 5]);
  });
  W([21, 5], [-20, -19]); W([20, 8], [20, 5]);
  const bus = normalizeCircuit(m);
  assert.deepEqual(checkCircuit(bus), []);
  // the bus driven by one, then the other
  const sim = createCircuitSim(bus);
  const set = (o) => { for (const [k, v] of Object.entries(o)) sim.set(`S${k}`, v === 1); sim.run(); return sim.outputs().q; };
  assert.deepEqual([set({ a0: 1, oe0: 0, a1: 0, oe1: 1 }), set({ a0: 1, oe0: 1, a1: 0, oe1: 0 }), set({ a0: 1, oe0: 1, a1: 1, oe1: 0 }), set({ a0: 0, oe0: 1, a1: 0, oe1: 1 })], ['1', '0', '1', '0']);
  // a logic switch on the bus too: a short whenever one of the buffers is enabled
  bus.parts.push({ id: 'SX', type: 'logic-switch', x: 25, y: 5, label: 'x' });
  bus.wires.push({ id: 'wx', points: [[25, 5], [20, 5]], color: 'blue' });
  assert.deepEqual(checkCircuit(normalizeCircuit(bus)).map((x) => `${x.severity}: ${x.message}`), ['warning: U1 1Y, U2 1Y (3-state) and SX out drive one net: a short whenever one is enabled']);
});
