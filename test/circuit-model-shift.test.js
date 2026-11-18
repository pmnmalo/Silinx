// The shift registers written once in VHDL (#4397, group E: core/circuit-model-shift.js). Their pinouts and their
// function, both written here from their datasheets by pin number (test/circuit-model-sheet.mjs): each process of the
// chip (what wakes it: its clock's edge, its asynchronous controls), its registers bit by bit (null: unknown), its
// outputs; evaluated vector by vector against the engine (each core run live) and against the circuit's HDL simulated in
// VHDL and in Verilog (the core translated by Silinx), with no warnings. KiCad's symbols of them behave as them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS } from '../core/circuit-parts.js';
import { SHIFT_ICS } from '../core/circuit-model-shift.js';
import { CATALOGUE } from '../core/kicad-catalogue-data.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate } from '../core/compile.js';
import { synthesisText } from '../core/translate-off.js';
import { circuitPorts } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { msiBench } from './circuit-helpers.mjs';
import { NOT, AND, OR, pin, unknown, shiftIn, checkCores, checkEngine, checkHdl } from './circuit-model-sheet.mjs';

const B = '̅';
// (a register's bits on pins, its first stage first; a load of pins, its first stage first)
const on = (key, pins) => (c, s) => Object.fromEntries(pins.map((p, b) => [p, s[key][b]]));
const loaded = (c, pins) => pins.map((p) => c[p]);
const zeros = (n) => Array(n).fill(0);

const sr594 = (oe) => ({ names: ['QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', 'GND', "QH'", `SRCLR${B}`, 'SRCLK', 'RCLK', oe ? `OE${B}` : `RCLR${B}`, 'SER', 'QA', 'VCC'], clocks: [11, 12],
  init: () => ({ r: unknown(8), t: unknown(8) }),
  procs: [{ sens: [[pin(11), 'r'], [pin(10), 'f']], run(c, e, o, nx) { if (c[10] === 0) nx.r = zeros(8); else if (e(pin(11), 'r')) nx.r = shiftIn(o.r, c[14]); } },
    // (the output register takes the shift register as it was: one clock behind when the two clocks are joined)
    { sens: [[pin(12), 'r'], ...(oe ? [] : [[pin(13), 'f']])], run(c, e, o, nx) { if (!oe && c[13] === 0) nx.t = zeros(8); else if (e(pin(12), 'r')) nx.t = o.r; } }],
  // (the 74596's open collectors on the bench's pull-ups: a 0, else high; all high while OE̅ is)
  out: (c, s) => ({ ...Object.fromEntries([15, 1, 2, 3, 4, 5, 6, 7].map((p, b) => [p, oe ? OR(s.t[b], c[13]) : s.t[b]])), 9: s.r[7] }) });

const SHEETS = {
  // 7491: on CLK's rising edge A·B into the first stage
  7491: { names: ['NC', 'NC', 'NC', 'NC', 'VCC', 'NC', 'NC', 'NC', 'CLK', 'GND', 'B', 'A', 'QH', `QH${B}`], clocks: [9], init: () => ({ r: unknown(8) }),
    procs: [{ sens: [[pin(9), 'r']], run(c, e, o, nx) { if (e(pin(9), 'r')) nx.r = shiftIn(o.r, AND(c[12], c[11])); } }],
    out: (c, s) => ({ 13: s.r[7], 14: NOT(s.r[7]) }) },
  // 7495: its clock CLK1 while MODE is low, CLK2 while it is high; on its falling edge a shift (low) or a load (high)
  7495: { names: ['SER', 'A', 'B', 'C', 'D', 'MODE', 'GND', 'CLK2', 'CLK1', 'QD', 'QC', 'QB', 'QA', 'VCC'], clocks: [9, 8], init: () => ({ r: unknown(4) }),
    procs: [{ sens: [[(c) => OR(AND(c[9], NOT(c[6])), AND(c[8], c[6])), 'f']], run(c, e, o, nx) {
      if (e((x) => OR(AND(x[9], NOT(x[6])), AND(x[8], x[6])), 'f')) nx.r = c[6] ? loaded(c, [2, 3, 4, 5]) : shiftIn(o.r, c[1]);
    } }],
    out: on('r', [13, 12, 11, 10]) },
  // 74166: CLR̅ low: 0; on the rising edge of CLK or CLK INH, SH/LD̅ low loads A–H, high shifts SER in
  74166: { names: ['SER', 'A', 'B', 'C', 'D', 'CLK INH', 'CLK', 'GND', `CLR${B}`, 'E', 'F', 'G', 'QH', 'H', `SH/LD${B}`, 'VCC'], clocks: [7, 6], init: () => ({ r: unknown(8) }),
    procs: [{ sens: [[(c) => OR(c[7], c[6]), 'r'], [pin(9), 'f']], run(c, e, o, nx) {
      if (c[9] === 0) nx.r = zeros(8);
      else if (e((x) => OR(x[7], x[6]), 'r')) nx.r = c[15] === 0 ? loaded(c, [2, 3, 4, 5, 10, 11, 12, 14]) : shiftIn(o.r, c[1]);
    } }],
    out: (c, s) => ({ 13: s.r[7] }) },
  // 74195: CLR̅ low: 0; on CLK's rising edge SH/LD̅ low loads A–D, high shifts, QA by J and K̅
  74195: { names: [`CLR${B}`, 'J', `K${B}`, 'A', 'B', 'C', 'D', 'GND', `SH/LD${B}`, 'CLK', `QD${B}`, 'QD', 'QC', 'QB', 'QA', 'VCC'], clocks: [10], init: () => ({ r: unknown(4) }),
    procs: [{ sens: [[pin(10), 'r'], [pin(1), 'f']], run(c, e, o, nx) {
      if (c[1] === 0) nx.r = zeros(4);
      else if (e(pin(10), 'r')) nx.r = c[9] === 0 ? loaded(c, [4, 5, 6, 7]) : shiftIn(o.r, ({ '00': 0, '11': 1, '01': o.r[0], '10': NOT(o.r[0]) })[`${c[2]}${c[3]}`]);
    } }],
    out: (c, s) => ({ ...on('r', [15, 14, 13, 12])(c, s), 11: NOT(s.r[3]) }) },
  // 74295: on CLK's falling edge LD/SH̅ high loads A–D, low shifts SER in; OC low: its outputs off (0 on the bench's LEDs)
  74295: { names: ['SER', 'A', 'B', 'C', 'D', `LD/SH${B}`, 'GND', 'OC', 'CLK', 'QD', 'QC', 'QB', 'QA', 'VCC'], clocks: [9], init: () => ({ r: unknown(4) }),
    procs: [{ sens: [[pin(9), 'f']], run(c, e, o, nx) { if (e(pin(9), 'f')) nx.r = c[6] ? loaded(c, [2, 3, 4, 5]) : shiftIn(o.r, c[1]); } }],
    out: (c, s) => Object.fromEntries([13, 12, 11, 10].map((p, b) => [p, c[8] ? s.r[b] : 0])) },
  74594: sr594(false),
  74596: sr594(true),
  // 4021: P/S high: PI-1–PI-8 loaded at once; low: on CLK's rising edge SER into stage 1
  4021: { names: ['PI-8', 'Q6', 'Q8', 'PI-4', 'PI-3', 'PI-2', 'PI-1', 'VSS', 'P/S', 'CLK', 'SER', 'Q7', 'PI-5', 'PI-6', 'PI-7', 'VDD'], clocks: [10],
    loads: [[9, 1, [7, 6, 5, 4, 13, 14, 15, 1]]], init: () => ({ r: unknown(8) }),
    procs: [{ sens: [[pin(10), 'r'], [pin(9), 'r']], run(c, e, o, nx) {
      if (c[9] === 1) nx.r = loaded(c, [7, 6, 5, 4, 13, 14, 15, 1]);
      else if (e(pin(10), 'r')) nx.r = shiftIn(o.r, c[11]);
    } }],
    out: (c, s) => ({ 2: s.r[5], 12: s.r[6], 3: s.r[7] }) },
};

test('#4397 the shift registers written once in VHDL: their pinouts, their datasheets\'; their cores\' lint and their translation\'s clean', () => {
  checkCores(SHIFT_ICS, SHEETS);
  assert.deepEqual(SHIFT_ICS.map((d) => [d.type, d.chip, d.family]), [['7491', 'SN74LS91', 'ttl'], ['7495', 'SN74LS95', 'ttl'], ['74166', 'SN74LS166', 'ttl'], ['74195', 'SN74LS195', 'ttl'],
    ['74295', 'SN74LS295', 'ttl'], ['74594', 'SN74HC594', 'ttl'], ['74596', 'SN74LS596', 'ttl'], ['4021', 'CD4021B', 'cmos']]);
  // (the 74295's outputs three-state, enabled while OC is high; the 74596's open collectors, its QH' not)
  assert.deepEqual(PARTS['74295'].threeState, { enable: [['oe', '1']], outs: ['qd', 'qc', 'qb', 'qa'] });
  assert.deepEqual(PARTS['74596'].pins.filter((q) => q.dir === 'oc').map((q) => q.name), ['QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', 'QA']);
});

test('#4397 KiCad\'s symbols of the shift registers behave as them; the 74299 and 74323 (their bidirectional I/O) drawn only', () => {
  const as = (types) => CATALOGUE.filter((e) => types.includes(e.as)).map((e) => `${e.symbol}:${e.as}`).sort();
  assert.deepEqual(as(Object.keys(SHEETS)), ['4021:4021', '74HC594:74594', '74HC596:74596', '74HCT596:74596', '74LS166:74166', '74LS195:74195', '74LS295:74295', '74LS596:74596',
    '74LS91:7491', '74LS95:7495']);
  assert.deepEqual(CATALOGUE.filter((e) => ['74LS299', '74LS323'].includes(e.symbol)).map((e) => e.as), [null, null]);
});

test('#4397 an IC written once in VHDL with open collectors (the 74596\'s): a 1 released, in the engine and in its HDL', () => {
  // (QB without its pull-up: released, its LED dark; QC on its pull-up: high)
  const m = msiBench('74596', { name: 'c74596' }), r1 = m.parts.find((p) => p.id === 'R1');
  m.parts = m.parts.filter((p) => p !== r1);
  m.wires = m.wires.filter((w) => !(w.points[0][0] === r1.x && w.points[0][1] === r1.y));
  const { inputs } = circuitPorts(m), sim = createCircuitSim(m);
  const set = (name, v) => { sim.set(inputs.find((i) => i.name === name).part, v); sim.run(); };
  sim.run();
  for (const [name, v] of [['srclr_n', false], ['rclk', true], ['rclk', false], ['oe_n', false]]) set(name, v);
  assert.deepEqual([sim.outputs().q_qb, sim.outputs().q_qc], ['0', '0']);
  set('oe_n', true);
  assert.deepEqual([sim.outputs().q_qb, sim.outputs().q_qc], ['0', '1']);
  const v = generateCircuit(m, 'vhdl').code, g = generateCircuit(m, 'verilog').code;
  assert.match(v, / {2}function oc\(s : std_logic\) return std_logic is\n[\s\S]* {2}qb <= oc\(o_qb\) after 20 ns when pw else 'Z' after 20 ns;\n[\s\S]* {2}qh2 <= o_qh2 after 20 ns when pw/);
  assert.match(g, / {2}function oc\(input s\);\n[\s\S]* {2}assign #20 qb = pw \? oc\(o_qb\) : 1'bz;\n[\s\S]* {2}assign #20 qh2 = pw \? o_qh2 : 1'bz;/);
});

test('#4397 their function against their datasheets\': through the engine (each core run live), Check clean', () => {
  for (const [type, sheet] of Object.entries(SHEETS)) checkEngine(type, sheet);
});

test('#4397 their function in the circuit\'s HDL: VHDL and Verilog (the core translated by Silinx) simulated, no warnings', () => {
  for (const [type, sheet] of Object.entries(SHEETS)) checkHdl(type, sheet);
});

test('#4397 the open synthesis of a 74596 and a 4021 on their benches, VHDL and Verilog: their exact warnings (the 4021\'s asynchronous load)', async () => {
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  const load = "Warning: Async reset value `{ \\pi8 \\pi7 \\pi6 \\pi5 \\pi4 \\pi3 \\pi2 \\pi1 }' is not constant!";
  for (const [type, warnings] of [['74596', []], ['4021', [load]]]) {
    const m = msiBench(type, { name: `c${type}` });
    for (const lang of ['vhdl', 'verilog']) {
      const lib = compile([{ path: lang === 'vhdl' ? 'd.vhd' : 'd.v', text: synthesisText(generateCircuit(m, lang).code) }]), d = elaborate(lib, m.name);
      assert.deepEqual([...lib.errors, ...d.diags].map((e) => e.message), [], `${type} ${lang}`);
      const s = await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode });
      assert.deepEqual(s.warnings, warnings, `${type} ${lang}`);
      // (its registers built: flip-flops in its cells)
      assert.ok(Object.entries(s.cells).some(([c, n]) => /^FD/.test(c) && n > 0), `${type} ${lang}: ${JSON.stringify(s.cells)}`);
    }
  }
});
