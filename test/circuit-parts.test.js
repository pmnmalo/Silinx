// The parts of phase 2 of the digital circuits (#3899, docs/CIRCUITS.md): the ICs' pinouts (their datasheets', written
// here) and their gates against truth tables computed here (every input combination of a gate, every gate on its own:
// the 74LS gates, open collector ones pulled up, the 4000 gates), through the engine and through the HDL simulated by
// Silinx in VHDL and in Verilog; the full breadboard's split rails; a slide switch, a DIP switch, a pull-up and a
// pull-down, an open collector wired AND, a CMOS input floating (X), 7-segment displays (common cathode and anode), an
// LED bar, a clock source; the check's exact messages; the edits' properties.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, PART_ORDER, partPins, breadboardHoles } from '../core/circuit-parts.js';
import { normalizeCircuit, newCircuit, circuitPorts } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { setPartProps, addPart } from '../core/circuit-edit.js';
import { simulate, compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { icBench, circuitBench } from './circuit-helpers.mjs';

// the datasheets' pinouts, pin 1 to 14 (NC: not connected)
const QUAD = ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'];
const QUAD_Y1 = ['1Y', '1A', '1B', '2Y', '2A', '2B', 'GND', '3A', '3B', '3Y', '4A', '4B', '4Y', 'VCC'];
const HEX = ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'];
const TRIPLE = ['1A', '1B', '2A', '2B', '2C', '2Y', 'GND', '3Y', '3A', '3B', '3C', '1Y', '1C', 'VCC'];
const CMOS_QUAD = ['1A', '1B', '1Y', '2Y', '2A', '2B', 'VSS', '3A', '3B', '3Y', '4Y', '4A', '4B', 'VDD'];
const PINOUT = {
  7400: QUAD, 7401: QUAD_Y1, 7402: QUAD_Y1, 7403: QUAD, 7404: HEX, 7405: HEX, 7406: HEX, 7408: QUAD, 7410: TRIPLE, 7411: TRIPLE, 7414: HEX,
  7420: ['1A', '1B', 'NC', '1C', '1D', '1Y', 'GND', '2Y', '2A', '2B', 'NC', '2C', '2D', 'VCC'], 7427: TRIPLE,
  7430: ['A', 'B', 'C', 'D', 'E', 'F', 'GND', 'Y', 'NC', 'NC', 'G', 'H', 'NC', 'VCC'], 7432: QUAD, 7486: QUAD,
  4001: CMOS_QUAD, 4011: CMOS_QUAD, 4030: CMOS_QUAD, 4069: HEX.map((n) => (n === 'GND' ? 'VSS' : n === 'VCC' ? 'VDD' : n)), 4070: CMOS_QUAD, 4071: CMOS_QUAD, 4081: CMOS_QUAD,
};
// each IC's function, written here: the inputs' bits (an array of 0 / 1) → its output
const F = {
  nand: (b) => 1 - b.reduce((x, y) => x & y, 1), and: (b) => b.reduce((x, y) => x & y, 1), or: (b) => b.reduce((x, y) => x | y, 0),
  nor: (b) => 1 - b.reduce((x, y) => x | y, 0), xor: (b) => b.reduce((x, y) => x ^ y, 0), not: (b) => 1 - b[0],
};
const FN = { 7400: 'nand', 7401: 'nand', 7402: 'nor', 7403: 'nand', 7404: 'not', 7405: 'not', 7406: 'not', 7408: 'and', 7410: 'nand', 7411: 'and', 7414: 'not',
  7420: 'nand', 7427: 'nor', 7430: 'nand', 7432: 'or', 7486: 'xor', 4001: 'nor', 4011: 'nand', 4030: 'xor', 4069: 'not', 4070: 'xor', 4071: 'or', 4081: 'and' };
const OC = ['7401', '7403', '7405', '7406'];
let seed = 3;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed >> 4; };
const W = (m, id, ...points) => m.wires.push({ id, points, color: 'green' });

test('the ICs\' pinouts are their datasheets\' (NC pins not connected; a 4000\'s VDD and VSS); every IC in the library', () => {
  assert.deepEqual(Object.keys(PINOUT).sort(), PART_ORDER.filter((t) => PARTS[t].gates).sort(), 'every gate IC (the MSI ICs: circuit-msi.test.js)');
  for (const [type, names] of Object.entries(PINOUT)) {
    const d = PARTS[type];
    assert.deepEqual(d.pins.map((p) => p.name), names, type);
    assert.equal(d.chip, type.startsWith('74') ? `SN74LS${type.slice(2)}` : `CD${type}B`, type);
    assert.equal(d.family, type.startsWith('74') ? 'ttl' : 'cmos');
    assert.equal(!!d.oc, OC.includes(type), `${type}: open collector`);
    assert.deepEqual(d.pins.filter((p) => p.name === 'NC').map((p) => p.dir), d.pins.filter((p) => p.name === 'NC').map(() => 'nc'));
  }
});

// an IC's vectors: every combination on every gate at once, then random ones (each gate its own)
function vectorsOf(type, m) {
  const gates = PARTS[type].gates, w = gates[0].ins.length;
  const names = circuitPorts(m).inputs.map((x) => x.name);
  const set = (bits) => Object.fromEntries(names.map((n) => [n, bits[n]]));
  const all = Array.from({ length: 1 << w }, (_, v) => set(Object.fromEntries(gates.flatMap((g, i) => g.ins.map((_, j) => [`g${i + 1}${'abcdefgh'[j]}`, (v >> j) & 1])))));
  return [...all, ...Array.from({ length: 12 }, () => set(Object.fromEntries(names.map((n) => [n, rnd() & 1]))))];
}
const want = (type, v) => PARTS[type].gates.map((g, i) => String(F[FN[type]](g.ins.map((_, j) => v[`g${i + 1}${'abcdefgh'[j]}`])))).join('');

test('every IC\'s gates against its truth table, through the engine: the 74LS gates, the open collector ones pulled up, the 4000s', () => {
  for (const type of Object.keys(PINOUT)) {
    const m = icBench(type, { name: `b${type}` });
    assert.deepEqual(checkCircuit(m), [], `${type}: a clean bench`);
    const sim = createCircuitSim(m);
    const ins = circuitPorts(m).inputs;
    for (const v of vectorsOf(type, m)) {
      for (const i of ins) sim.set(i.part, v[i.name] === 1);
      assert.equal(sim.run().quiet, true);
      assert.equal(Object.values(sim.outputs()).join(''), want(type, v), `${type} ${JSON.stringify(v)}`);
    }
  }
});

test('every IC\'s HDL: VHDL and Verilog simulated by Silinx as its truth table, no warnings', () => {
  for (const type of Object.keys(PINOUT)) {
    const m = icBench(type, { name: `b${type}` });
    const { inputs, outputs } = circuitPorts(m);
    const vectors = vectorsOf(type, m).slice(0, 10);
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateCircuit(m, lang), file = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
      const lib = compile([{ path: file, text: g.code }]), d = elaborate(lib, m.name);
      assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => e.message), [], `${type} ${lang}: no warnings`);
      const r = simulate([{ path: file, text: g.code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name), ns: 400 }) }], 'tb', { until: 1e9 });
      assert.deepEqual(r.errors, [], `${type} ${lang}`);
      assert.deepEqual(r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz]+$/.test(s)), vectors.map((v) => want(type, v)), `${type} ${lang}`);
    }
  }
});

test('the full breadboard: 63 columns, its rails split in the middle (columns 1–31 and 32–63)', () => {
  const holes = breadboardHoles(63, 31), strip = (n) => holes.find((h) => h.name === n).strip;
  assert.equal(holes.length, 63 * 14);
  assert.equal(strip('tp1'), strip('tp31'));
  assert.notEqual(strip('tp31'), strip('tp32'));
  assert.equal(strip('tp32'), strip('tp63'));
  assert.equal(strip('a40'), strip('e40'));
  assert.equal(PARTS['breadboard-full'].title, 'Full breadboard (its rails split in the middle)');
});

// a circuit with a supply at (-20, -20) and parts placed and wired by the caller
const bench = (name, parts, wires) => normalizeCircuit({ ...newCircuit(name, 'vhdl', { breadboard: false }), parts: [{ id: 'P1', type: 'supply', x: -20, y: -20 }, ...parts], wires });
const VCC = [-20, -20], GND = [-20, -19];

test('a slide switch (SPDT) between the rails, a DIP switch, a pull-down with a button to +: the engine and the HDL', () => {
  // SPDT: A on GND, B on +, its common to an LED: lit while on
  const s = bench('spdt', [{ id: 'S1', type: 'spdt', x: 0, y: 0, label: 'sel' }, { id: 'D1', type: 'led', x: 10, y: 0, label: 'y' }],
    [{ id: 'w1', points: [[0, 0], GND], color: 'black' }, { id: 'w2', points: [[2, 0], VCC], color: 'red' }, { id: 'w3', points: [[1, 0], [1, 3], [10, 3], [10, 0]], color: 'green' },
      { id: 'w4', points: [[11, 0], GND], color: 'black' }]);
  assert.deepEqual(checkCircuit(s), []);
  assert.deepEqual(circuitPorts(s).inputs, [{ name: 'sel', part: 'S1', type: 'spdt', index: 0, kind: 'level' }]);
  // a DIP switch of 4: lever k joins pin k (on +) to pin 9 − k (an LED each, pulled down)
  const parts = [{ id: 'S2', type: 'dip-4', x: 0, y: 10, label: 'sw', on: [true, false, false, true] }];
  const wires = [];
  for (let k = 1; k <= 4; k++) {
    const top = partPins(parts[0]).find((q) => q.n === 9 - k), bot = partPins(parts[0]).find((q) => q.n === k);
    const x = 10 + 3 * k;   // (LED k at (x, 0), its pull-down at (x, 3))
    wires.push({ id: `v${k}`, points: [[bot.x, bot.y], [bot.x, bot.y + 2 + k], VCC], color: 'red' });
    parts.push({ id: `D${k}`, type: 'led', x, y: 0, label: `l${k}` }, { id: `R${k}`, type: 'pull-down', x, y: 3 });
    wires.push({ id: `t${k}`, points: [[top.x, top.y], [top.x, top.y - 1 - k], [x, 0]], color: 'green' }, { id: `k${k}`, points: [[x + 1, 0], GND], color: 'black' },
      { id: `q${k}`, points: [[x, 3], [x, 0]], color: 'green' });
  }
  const dsw = bench('dips', parts, wires);
  assert.deepEqual(checkCircuit(dsw), []);
  assert.deepEqual(circuitPorts(dsw).inputs.map((x) => x.name), ['sw_1', 'sw_2', 'sw_3', 'sw_4']);
  const ds = createCircuitSim(dsw);
  ds.run();
  assert.deepEqual(ds.outputs(), { l1: '1', l2: '0', l3: '0', l4: '1' }, 'its levers as saved');
  ds.set('S2', true, 1); ds.run();
  assert.deepEqual(ds.outputs(), { l1: '1', l2: '1', l3: '0', l4: '1' });
  assert.deepEqual(ds.inputs().S2, [true, true, false, true]);
  assert.throws(() => ds.set('S2', true, 4), /S2 \(5\) is not a switch, a button or a clock of the circuit/);
  for (const [m, vectors] of [[s, [{ sel: 0 }, { sel: 1 }, { sel: 0 }]], [dsw, [{ sw_1: 0, sw_2: 0, sw_3: 0, sw_4: 0 }, { sw_1: 1, sw_2: 0, sw_3: 1, sw_4: 0 }, { sw_1: 1, sw_2: 1, sw_3: 1, sw_4: 1 }]]]) {
    const { inputs, outputs } = circuitPorts(m);
    const sim = createCircuitSim(m);
    sim.run();
    const engine = vectors.map((v) => { for (const i of inputs) sim.set(i.part, v[i.name] === 1, i.index); sim.run(); return Object.values(sim.outputs()).join(''); });
    assert.deepEqual(engine, m === s ? ['0', '1', '0'] : ['0000', '1010', '1111']);
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateCircuit(m, lang), file = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
      const lib = compile([{ path: file, text: g.code }]), d = elaborate(lib, m.name);
      assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => e.message), [], `${m.name} ${lang}: no warnings`);
      const r = simulate([{ path: file, text: g.code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name) }) }], 'tb', { until: 1e9 });
      assert.deepEqual(r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz]+$/.test(x)), engine, `${m.name} ${lang}`);
    }
  }
});

// two 7403 NANDs (open collector) on one net: a wired AND (pulled up or not), on an LED and a 7404's input
function wiredAnd({ pull = true } = {}) {
  const m = icBench('7403', { name: 'wired', pullUps: false });
  const pins = new Map(partPins(m.parts[0]).map((q) => [q.n, [q.x, q.y]]));
  // 2Y (pin 6) joined to 1Y (pin 3); the LEDs of gates 2 to 4 left out, their wires too
  m.parts = m.parts.filter((p) => !['D2', 'D3', 'D4', 'S3a', 'S3b', 'S4a', 'S4b'].includes(p.id));
  m.wires = m.wires.filter((w) => !['w9', 'w10', 'w11', 'w12', 'w13', 'w14', 'w15', 'w16', 'w17', 'w18', 'w19', 'w20'].includes(w.id));
  W(m, 'x1', pins.get(6), [5, 3], pins.get(3));
  if (pull) { m.parts.push({ id: 'R1', type: 'pull-up', x: 18, y: 6 }); W(m, 'x2', [18, 6], [20, 10]); }
  return normalizeCircuit(m);
}

test('open collector outputs on one net: a wired AND with a pull-up; with none, warned (the net floats)', () => {
  const m = wiredAnd();
  assert.deepEqual(checkCircuit(m), []);
  const vectors = [[0, 0, 0, 0], [1, 1, 0, 0], [1, 1, 1, 1], [0, 1, 1, 1], [1, 0, 0, 1]].map(([a, b, c, d]) => ({ g1a: a, g1b: b, g2a: c, g2b: d }));
  const ref = vectors.map((v) => String((1 - (v.g1a & v.g1b)) & (1 - (v.g2a & v.g2b))));
  const { inputs, outputs } = circuitPorts(m);
  const sim = createCircuitSim(m);
  sim.run();
  assert.deepEqual(vectors.map((v) => { for (const i of inputs) sim.set(i.part, v[i.name] === 1); sim.run(); return sim.outputs().g1y; }), ref);
  assert.deepEqual(sim.shorts(), [], 'no short: open collectors');
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(m, lang), file = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    assert.match(g.code, lang === 'vhdl' ? /n\d+ <= '1' when n\d+_d = 'Z' else n\d+_d;   -- pulled up/ : /assign n\d+ = \(n\d+_d === 1'bz\) \? 1'b1 : n\d+_d;   \/\/ pulled up/);
    const lib = compile([{ path: file, text: g.code }]), d = elaborate(lib, m.name);
    assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => e.message), [], `${lang}: no warnings`);
    const r = simulate([{ path: file, text: g.code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name) }) }], 'tb', { until: 1e9 });
    assert.deepEqual(r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz]+$/.test(x)), ref, lang);
  }
  assert.deepEqual(checkCircuit(wiredAnd({ pull: false })).map((x) => x.message), ['U1 1Y, U1 2Y: open collector with no pull-up: the net floats while they are off (a 74LS input reads it high, an LED stays off)']);
});

test('a 4000\'s floating input reads X; a 74LS\'s high; a pull-down and a button to +; two pulls of opposite levels: X', () => {
  const m = icBench('4069');
  const f = normalizeCircuit({ ...m, parts: m.parts.filter((p) => p.id !== 'S1a'), wires: m.wires.filter((w) => w.id !== 'w3') });
  assert.deepEqual(checkCircuit(f).map((x) => x.message), ['U1 pin 1 (1A) is floating: a CMOS input reads X']);
  const sim = createCircuitSim(f);
  sim.run();
  assert.equal(sim.pin('U1.2'), 'X');
  assert.equal(sim.leds().D1, 'x');
  // its input pulled down, a button to +: 0 while released (its output 1), 1 while pressed
  const pins = new Map(partPins(f.parts[0]).map((q) => [q.n, [q.x, q.y]]));
  const b = normalizeCircuit({ ...f, parts: [...f.parts, { id: 'R1', type: 'pull-down', x: -8, y: 4 }, { id: 'B1', type: 'button', x: -12, y: 0, label: 'go' }],
    wires: [...f.wires, { id: 'v1', points: [[-8, 4], pins.get(1)], color: 'green' }, { id: 'v2', points: [[-9, 0], pins.get(1)], color: 'green' }, { id: 'v3', points: [[-12, 0], VCC], color: 'red' }] });
  assert.deepEqual(checkCircuit(b), []);
  const bs = createCircuitSim(b);
  bs.run();
  assert.equal(bs.outputs().g1y, '1');
  bs.set('B1', true); bs.run();
  assert.equal(bs.outputs().g1y, '0');
  // a pull-up beside the pull-down: X
  const both = normalizeCircuit({ ...b, parts: [...b.parts, { id: 'R2', type: 'pull-up', x: -8, y: 6 }], wires: [...b.wires, { id: 'v4', points: [[-8, 6], [-8, 4]], color: 'green' }] });
  const xs = createCircuitSim(both);
  xs.run();
  assert.equal(xs.pin('U1.1'), 'X');
});

test('7-segment displays (common cathode and common anode) and an LED bar: their segments as ports, lit as the HDL\'s', () => {
  // each display's segment a and its point driven by switches, its common on its rail; an LED bar's light 3 on +
  const cc = { id: 'DS1', type: 'seg7-cc', x: 0, y: 0, label: 'cc' }, ca = { id: 'DS2', type: 'seg7-ca', x: 10, y: 0, label: 'ca' }, bar = { id: 'D1', type: 'led-bar-10', x: 20, y: 0, label: 'bar' };
  const pin = (p, n) => { const q = partPins(p).find((x) => x.n === n); return [q.x, q.y]; };
  const m = bench('disp', [cc, ca, bar, { id: 'S1', type: 'logic-switch', x: -10, y: 3, label: 'a' }, { id: 'S2', type: 'logic-switch', x: -10, y: 4, label: 'dp' }], [
    { id: 'w1', points: [pin(cc, 3), [2, 2], GND], color: 'black' }, { id: 'w2', points: [pin(ca, 3), [12, 2], VCC], color: 'red' },
    { id: 'w3', points: [[-10, 3], [-5, 3], [-5, -9], [3, -9], pin(cc, 7)], color: 'green' }, { id: 'w4', points: [pin(cc, 7), [3, -8], [13, -8], pin(ca, 7)], color: 'green' },
    { id: 'w5', points: [[-10, 4], pin(cc, 5)], color: 'green' }, { id: 'w6', points: [pin(bar, 3), [22, 3], VCC], color: 'red' }, { id: 'w7', points: [pin(bar, 18), [22, -5], GND], color: 'black' },
  ]);
  assert.deepEqual(checkCircuit(m), []);
  const outs = circuitPorts(m).outputs.map((x) => x.name);
  assert.deepEqual(outs.slice(0, 8), ['cc_a', 'cc_b', 'cc_c', 'cc_d', 'cc_e', 'cc_f', 'cc_g', 'cc_dp']);
  assert.deepEqual(outs.slice(16), ['bar_1', 'bar_2', 'bar_3', 'bar_4', 'bar_5', 'bar_6', 'bar_7', 'bar_8', 'bar_9', 'bar_10']);
  const sim = createCircuitSim(m);
  sim.run();
  const lit = () => Object.entries(sim.outputs()).filter(([, v]) => v === '1').map(([k]) => k);
  assert.deepEqual(lit(), ['ca_a', 'bar_3'], 'a 0: the common anode\'s a lit, the cathode\'s not');
  sim.set('S1', true); sim.set('S2', true); sim.run();
  assert.deepEqual(lit(), ['cc_a', 'cc_dp', 'bar_3']);
  assert.deepEqual(sim.leds().DS1, ['on', 'off', 'off', 'off', 'off', 'off', 'off', 'on']);
  const vectors = [{ a: 0, dp: 0 }, { a: 1, dp: 0 }, { a: 1, dp: 1 }, { a: 0, dp: 1 }];
  const engine = vectors.map((v) => { sim.set('S1', !!v.a); sim.set('S2', !!v.dp); sim.run(); return Object.values(sim.outputs()).join(''); });
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(m, lang), file = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    const lib = compile([{ path: file, text: g.code }]), d = elaborate(lib, m.name);
    assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => e.message), [], `${lang}: no warnings`);
    const r = simulate([{ path: file, text: g.code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: ['a', 'dp'], outs }) }], 'tb', { until: 1e9 });
    assert.deepEqual(r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz]+$/.test(x)), engine, lang);
  }
  // a display on the wrong rail: never lights
  const wrong = normalizeCircuit({ ...m, parts: m.parts.map((p) => (p.id === 'DS1' ? { ...p, type: 'seg7-ca' } : p.id === 'DS2' ? { ...p, type: 'seg7-cc' } : p)) });
  assert.deepEqual(checkCircuit(wrong).map((x) => x.message), [
    'DS1 never lights: its common anode is on the supply\'s − (a common cathode display\'s place)',
    'DS2 never lights: its common cathode is on the supply\'s + (a common anode display\'s place)']);
});

test('a clock source: an input the editor ticks in real time (its frequency saved), a port of the HDL', () => {
  const m = bench('clocked', [{ id: 'CK1', type: 'clock', x: 0, y: 0, label: 'clk', hz: 2 }, { id: 'D1', type: 'led', x: 5, y: 0, label: 'y' }],
    [{ id: 'w1', points: [[0, 0], [5, 0]], color: 'green' }, { id: 'w2', points: [[6, 0], GND], color: 'black' }]);
  assert.deepEqual(checkCircuit(m), []);
  assert.equal(m.parts[1].hz, 2);
  assert.deepEqual(circuitPorts(m).inputs, [{ name: 'clk', part: 'CK1', type: 'clock', index: 0, kind: 'clock' }]);
  const sim = createCircuitSim(m);
  sim.run();
  assert.equal(sim.outputs().y, '0');
  sim.set('CK1', true); sim.run();
  assert.equal(sim.outputs().y, '1');
  assert.match(generateCircuit(m, 'vhdl').code, /-- Inputs {6}: clk \(CK1, '1' while high\)/);
  assert.equal(normalizeCircuit({ parts: [{ id: 'CK1', type: 'clock', hz: 500 }] }).parts[0].hz, 50, 'at most 50 Hz');
  assert.equal(normalizeCircuit({ parts: [{ id: 'CK1', type: 'clock' }] }).parts[0].hz, 1);
});

test('the check: open collectors on + or with a totem pole, a slide switch shorting the supply, a DIP lever\'s input floating while off', () => {
  const oc = icBench('7405');
  const pins = new Map(partPins(oc.parts[0]).map((q) => [q.n, [q.x, q.y]]));
  const msgs = (m) => checkCircuit(normalizeCircuit(m)).map((x) => `${x.severity}: ${x.message}`);
  assert.deepEqual(msgs({ ...oc, wires: [...oc.wires, { id: 'x1', points: [pins.get(2), VCC], color: 'red' }] })[0],
    'error: Short circuit: U1 1Y (open collector) on the supply\'s + rail: a short whenever it is 0');
  const mixed = { ...oc, parts: [...oc.parts, { id: 'U2', type: '7404', x: 0, y: 20 }],
    wires: [...oc.wires, { id: 'x1', points: [[1, 20], pins.get(2)], color: 'green' }, { id: 'x2', points: [[0, 17], VCC], color: 'red' }, { id: 'x3', points: [[6, 20], GND], color: 'black' }] };
  assert.equal(msgs(mixed).find((x) => x.includes('drive one net')), 'error: Short circuit: U2 1Y and U1 1Y drive one net (a short whenever they differ)');
  // a slide switch's common on +, its A on −: a short while off (break before make: A and B never joined)
  const sw = { ...oc, parts: [...oc.parts, { id: 'S9', type: 'spdt', x: -30, y: -25 }], wires: [...oc.wires, { id: 'x1', points: [[-29, -25], VCC], color: 'red' }, { id: 'x2', points: [[-30, -25], [-30, -19], GND], color: 'black' }] };
  assert.deepEqual(msgs(sw).filter((x) => x.startsWith('error')), ['error: Short circuit while S9 is off: it joins the supply\'s + and −']);
  // a DIP switch's lever between + and the 7405's 1A, the switch S1a gone: 1A floats while the lever is off
  const dipm = { ...oc, parts: [...oc.parts.filter((p) => p.id !== 'S1a'), { id: 'S9', type: 'dip-4', x: -12, y: 0 }],
    wires: [...oc.wires.filter((w) => w.id !== 'w3'), { id: 'x1', points: [[-12, 0], pins.get(1)], color: 'green' }, { id: 'x2', points: [[-12, -3], VCC], color: 'red' }] };
  assert.deepEqual(msgs(dipm), ['warning: U1 pin 1 (1A) floats while S9 is off: a 74LS input reads high']);
  // a label that is one of the DIP switch's ports (S9_2)
  assert.deepEqual(msgs({ ...dipm, parts: dipm.parts.map((p) => (p.id === 'S2a' ? { ...p, label: 'S9_2' } : p)) }).filter((x) => x.startsWith('error')),
    ['error: S9: its label \'S9\' is S2a\'s too (S9_2)']);
});

test('the edits: a DIP switch\'s levers, a clock\'s frequency, a display\'s colour; their refusals', () => {
  let m = addPart(newCircuit('e'), { type: 'dip-4', at: 'BB1.f3' }).model;
  assert.deepEqual(m.parts.at(-1), { id: 'S1', type: 'dip-4', x: 2, y: 7, on: [false, false, false, false] });
  assert.deepEqual(setPartProps(m, 'S1', { on: { lever: 2, on: true } }).model.parts.at(-1).on, [false, true, false, false]);
  assert.deepEqual(setPartProps(m, 'S1', { on: [true, true, false, true] }).model.parts.at(-1).on, [true, true, false, true]);
  assert.deepEqual(setPartProps(m, 'S1', { on: [true] }), { error: 'on: a list of 4 levers\' positions' });
  assert.deepEqual(setPartProps(m, 'S1', { on: { lever: 5, on: true } }), { error: 'on: a list of 4 levers\' positions, or { lever: 1 to 4, on }' });
  assert.deepEqual(setPartProps(m, 'S1', { hz: 3 }), { error: 'S1 (dip-4) has no property \'hz\' (label, on)' });
  m = addPart(m, { type: 'clock', at: [-8, 2] }).model;
  assert.deepEqual(m.parts.at(-1), { id: 'CK1', type: 'clock', x: -8, y: 2, hz: 1 });
  assert.equal(setPartProps(m, 'CK1', { hz: 2.5 }).model.parts.at(-1).hz, 2.5);
  assert.deepEqual(setPartProps(m, 'CK1', { hz: 99 }), { error: 'hz: a frequency from 0.1 to 50 Hz' });
  m = addPart(m, { type: 'seg7-cc', at: [40, 9] }).model;
  assert.equal(m.parts.at(-1).id, 'DS1');
  assert.equal(setPartProps(m, 'DS1', { color: 'green' }).model.parts.at(-1).color, 'green');
  m = addPart(m, { type: 'pull-up', at: [-8, 6] }).model;
  assert.deepEqual(setPartProps(m, 'R1', { label: 'x' }), { error: 'R1 (pull-up) has no property \'label\' (none)' });
});
