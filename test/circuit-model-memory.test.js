// The memories and storage ICs written once in VHDL (#4397, group F: core/circuit-model-memory.js). Their pinouts and
// their function tables, both written here from their datasheets by pin number (test/circuit-model-sheet.mjs): a
// register file's words and an addressable latch's bits as latches, a register on its clock's edge; evaluated against
// the engine (each core run live) and against the circuit's HDL simulated in VHDL and in Verilog (the core translated by
// Silinx), with no warnings. KiCad's symbols of them behave as them; the 74322, 74385 and 74CBT3861 drawn only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS } from '../core/circuit-parts.js';
import { MEMORY_ICS } from '../core/circuit-model-memory.js';
import { CATALOGUE } from '../core/kicad-catalogue-data.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate } from '../core/compile.js';
import { synthesisText } from '../core/translate-off.js';
import { msiBench } from './circuit-helpers.mjs';
import { pin, num, unknown, shiftIn, checkCores, checkEngine, checkHdl } from './circuit-model-sheet.mjs';

const B = '̅';
const bar = (s) => `${s}${B}`;
const OFF = 0;   // (a three-state output off: 0 on the bench's LEDs)
const any = (pins) => pins.map((p) => [pin(p), 'any']);

// 74670, 74170: GW̅ low writes D1–D4 into the word WB WA; GR̅ low reads the word RB RA (else off, or released high)
const regFile = (oc) => ({ names: ['D2', 'D3', 'D4', 'RB', 'RA', 'Q4', 'Q3', 'GND', 'Q2', 'Q1', bar('GR'), bar('GW'), 'WB', 'WA', 'D1', 'VCC'], steps: 500,
  init: () => ({ m: [0, 1, 2, 3].map(() => unknown(4)) }),
  procs: [{ sens: any([12, 14, 13, 15, 1, 2, 3]), run(c, e, o, nx) { if (c[12] === 0) { nx.m = o.m.map((w) => w.slice()); nx.m[num(c, [14, 13])] = [15, 1, 2, 3].map((p) => c[p]); } } }],
  out: (c, s) => Object.fromEntries([10, 9, 7, 6].map((p, k) => [p, c[11] ? (oc ? 1 : OFF) : s.m[num(c, [5, 4])][k]])) });
// 74259, 74256: G̅ low: the addressed bit follows D; else CLR̅ low clears; `units` [D pin, Q pins] each, `sel` the address
const addressable = (names, sel, units) => ({ names, steps: 500, init: () => ({ r: units.map(([, q]) => unknown(q.length)) }),
  procs: [{ sens: any([14, 15, ...sel, ...units.map(([d]) => d)]), run(c, e, o, nx) {
    const at = num(c, sel);
    nx.r = units.map(([d, q], u) => q.map((_, k) => (c[14] === 0 && at === k ? c[d] : c[15] === 0 ? 0 : o.r[u][k])));
  } }],
  out: (c, s) => Object.fromEntries(units.flatMap(([, q], u) => q.map((p, k) => [p, s.r[u][k]]))) });

const SHEETS = {
  74670: regFile(false),
  74170: regFile(true),
  74259: addressable(['S0', 'S1', 'S2', 'Q0', 'Q1', 'Q2', 'Q3', 'GND', 'Q4', 'Q5', 'Q6', 'Q7', 'D', bar('G'), bar('CLR'), 'VCC'], [1, 2, 3], [[13, [4, 5, 6, 7, 9, 10, 11, 12]]]),
  74256: addressable(['A', 'B', '1D', '1Q0', '1Q1', '1Q2', '1Q3', 'GND', '2Q0', '2Q1', '2Q2', '2Q3', '2D', bar('G'), bar('CLR'), 'VCC'], [1, 2], [[3, [4, 5, 6, 7]], [13, [9, 10, 11, 12]]]),
  // 74395: CLR̅ low: 0; on CLK's falling edge LD/SH̅ high loads, low shifts SER in; OC̅ high: QA–QD off, QD' not
  74395: { names: [bar('CLR'), 'SER', 'A', 'B', 'C', 'D', `LD/${bar('SH')}`, 'GND', bar('OC'), 'CLK', "QD'", 'QD', 'QC', 'QB', 'QA', 'VCC'], clocks: [10], init: () => ({ r: unknown(4) }),
    procs: [{ sens: [[pin(10), 'f'], [pin(1), 'f']], run(c, e, o, nx) {
      if (c[1] === 0) nx.r = [0, 0, 0, 0];
      else if (e(pin(10), 'f')) nx.r = c[7] ? [3, 4, 5, 6].map((p) => c[p]) : shiftIn(o.r, c[2]);
    } }],
    out: (c, s) => ({ ...Object.fromEntries([15, 14, 13, 12].map((p, k) => [p, c[9] ? OFF : s.r[k]])), 11: s.r[3] }) },
};

test('#4397 the register files, addressable latches and 74395 written once in VHDL: their pinouts, their datasheets\'; their cores\' lint and translation\'s clean', () => {
  checkCores(MEMORY_ICS, SHEETS);
  // (the 74670's and 74395's outputs three-state, the 74395's QD' not; the 74170's open collectors)
  assert.deepEqual(MEMORY_ICS.filter((d) => d.threeState).map((d) => [d.type, d.threeState.enable, d.threeState.outs.length]),
    [['74670', [['gr_n', '0']], 4], ['74395', [['oc_n', '0']], 4]]);
  assert.deepEqual(PARTS['74170'].pins.filter((q) => q.dir === 'oc').map((q) => q.name), ['Q4', 'Q3', 'Q2', 'Q1']);
});

test('#4397 KiCad\'s symbols of them behave as them (the 74LS170\'s three-state pins its open collectors); the 74322, 74385 and 74CBT3861s drawn only', () => {
  assert.deepEqual(CATALOGUE.filter((e) => Object.keys(SHEETS).includes(e.as)).map((e) => `${e.symbol}:${e.as}`).sort(), ['74LS170:74170', '74LS256:74256', '74LS259:74259',
    '74LS395:74395', '74LS670:74670']);
  // (the 74469 waits for its datasheet's U/D̅ to be checked)
  assert.deepEqual(CATALOGUE.filter((e) => e.symbol === '74469').map((e) => e.as), [null]);
  assert.deepEqual(CATALOGUE.filter((e) => /^74(LS322|LS385|CBT\w*3861)$/.test(e.symbol)).map((e) => `${e.symbol}:${e.as}`).sort(), ['74CBT3861:null', '74CBTD3861:null', '74CBTLV3861:null',
    '74LS322:null', '74LS385:null']);
});

test('#4397 their function against their datasheets\': through the engine (each core run live), Check clean', () => {
  for (const [type, sheet] of Object.entries(SHEETS)) checkEngine(type, sheet, { known: 40 });
});

test('#4397 their function in the circuit\'s HDL: VHDL and Verilog (the core translated by Silinx) simulated, no warnings', () => {
  for (const [type, sheet] of Object.entries(SHEETS)) checkHdl(type, sheet);
});

test('#4397 the open synthesis of a 74395 and a 74670 on their benches, VHDL and Verilog: their exact warnings (the 74670\'s latches, the chip\'s)', async () => {
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  for (const type of ['74395', '74670']) {
    const m = msiBench(type, { name: `c${type}` });
    for (const lang of ['vhdl', 'verilog']) {
      const lib = compile([{ path: lang === 'vhdl' ? 'd.vhd' : 'd.v', text: synthesisText(generateCircuit(m, lang).code) }]), d = elaborate(lib, m.name);
      assert.deepEqual([...lib.errors, ...d.diags].map((e) => e.message), [], `${type} ${lang}`);
      const s = await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode });
      // (its words' latches, one warning each, Yosys's process names left out)
      const latches = s.warnings.map((w) => /^Warning: Latch inferred for signal `\\c74670\.\\d_u1\.u_core\.(\w+)' from process /i.exec(w)?.[1]);
      assert.deepEqual(latches.sort(), type === '74670' ? ['w0', 'w1', 'w2', 'w3'] : [], `${type} ${lang}: ${s.warnings}`);
      assert.ok(Object.values(s.cells).some((n) => n > 0), `${type} ${lang}: ${JSON.stringify(s.cells)}`);
    }
  }
});
