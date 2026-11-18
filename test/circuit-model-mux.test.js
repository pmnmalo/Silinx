// The multiplexers, arithmetic, comparators and parity ICs written once in VHDL (#4397, group F:
// core/circuit-model-mux.js). Their pinouts and their function tables, both written here from their datasheets by pin
// number (test/circuit-model-sheet.mjs): the 74181's 32 functions as its table gives them (for active-high data), the
// carries as sums, a register taking its word on its clock's edge; evaluated against the engine (each core run live)
// and against the circuit's HDL simulated in VHDL and in Verilog (the core translated by Silinx), with no warnings.
// KiCad's symbols of them behave as them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS } from '../core/circuit-parts.js';
import { MUX_ICS } from '../core/circuit-model-mux.js';
import { CATALOGUE } from '../core/kicad-catalogue-data.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate } from '../core/compile.js';
import { synthesisText } from '../core/translate-off.js';
import { msiBench } from './circuit-helpers.mjs';
import { pin, num, unknown, checkCores, checkEngine, checkHdl } from './circuit-model-sheet.mjs';

const B = '̅';
const bar = (s) => `${s}${B}`;
// (a three-state output off: 0 on the bench's LEDs)
const OFF = 0;

// quad 2-to-1: [A, B, Y] pins of each section
const QUAD = [[2, 3, 4], [5, 6, 7], [11, 10, 9], [14, 13, 12]];
const quad = (inv, tri) => ({ names: [`A/${bar('B')}`, '1A', '1B', inv ? bar('1Y') : '1Y', '2A', '2B', inv ? bar('2Y') : '2Y', 'GND', inv ? bar('3Y') : '3Y', '3B', '3A', inv ? bar('4Y') : '4Y', '4B', '4A', bar('G'), 'VCC'],
  exhaustive: true, out: (c) => Object.fromEntries(QUAD.map(([a, b, y]) => [y, c[15] ? (tri ? OFF : 1) : (c[1] ? c[b] : c[a]) ^ (inv ? 1 : 0)])) });
// dual 4-to-1: [G̅, C0–C3, Y] of each section, B and A its select
const DUAL = [[1, [6, 5, 4, 3], 7], [15, [10, 11, 12, 13], 9]];
const dual = (inv, tri) => ({ names: [bar('1G'), 'B', '1C3', '1C2', '1C1', '1C0', inv ? bar('1Y') : '1Y', 'GND', inv ? bar('2Y') : '2Y', '2C0', '2C1', '2C2', '2C3', 'A', bar('2G'), 'VCC'], steps: 400,
  out: (c) => Object.fromEntries(DUAL.map(([g, cs, y]) => [y, c[g] ? (tri ? OFF : inv ? 1 : 0) : c[cs[num(c, [14, 2])]] ^ (inv ? 1 : 0)])) });
// with storage: the words' pins [A, B, C, D], its Q pins, its clock's pin and edge
const stored = (names, ws, clk, edge, w1, w2, q) => ({ names, clocks: [clk], init: () => ({ r: unknown(4) }),
  procs: [{ sens: [[pin(clk), edge]], run(c, e, o, nx) { if (e(pin(clk), edge)) nx.r = (c[ws] ? w2 : w1).map((p) => c[p]); } }],
  out: (c, s) => Object.fromEntries(q.map((p, k) => [p, s.r[k]])) });

// 74181 (active-high data): its logic functions and its arithmetic ones (the carry in added when Cn is low), as its table
const N = (x) => ~x & 15;
const LOGIC = [(a) => N(a), (a, b) => N(a | b), (a, b) => N(a) & b, () => 0, (a, b) => N(a & b), (a, b) => N(b), (a, b) => a ^ b, (a, b) => a & N(b), (a, b) => N(a) | b, (a, b) => N(a ^ b),
  (a, b) => b, (a, b) => a & b, () => 15, (a, b) => a | N(b), (a, b) => a | b, (a) => a];
// ("minus 1" as plus 15: the sum's fifth bit its carry out)
const ARITH = [(a) => a, (a, b) => a | b, (a, b) => a | N(b), () => 15, (a, b) => a + (a & N(b)), (a, b) => (a | b) + (a & N(b)), (a, b) => a + N(b), (a, b) => (a & N(b)) + 15, (a, b) => a + (a & b),
  (a, b) => a + b, (a, b) => (a | N(b)) + (a & b), (a, b) => (a & b) + 15, (a) => a + a, (a, b) => (a | b) + a, (a, b) => (a | N(b)) + a, (a) => a + 15];
// (its propagate word, by S1 S0, and its generate word, by S3 S2: P̅ low while all propagate, G̅ low while their sum carries)
const PROP = [(a) => a, (a, b) => a | b, (a, b) => a | N(b), () => 15], GEN = [() => 0, (a, b) => a & N(b), (a, b) => a & b, (a) => a];
const alu = { names: ['B0', 'A0', 'S3', 'S2', 'S1', 'S0', 'Cn', 'M', 'F0', 'F1', 'F2', 'GND', 'F3', 'A=B', bar('P'), 'Cn+4', bar('G'), 'B3', 'A3', 'B2', 'A2', 'B1', 'A1', 'VCC'], steps: 600,
  out(c) {
    const a = num(c, [2, 23, 21, 19]), b = num(c, [1, 22, 20, 18]), s = num(c, [6, 5, 4, 3]), sum = ARITH[s](a, b) + (c[7] ? 0 : 1), f = c[8] ? LOGIC[s](a, b) : sum & 15;
    const p = PROP[s & 3](a, b), g = GEN[s >> 2](a, b);
    return { 9: f & 1, 10: (f >> 1) & 1, 11: (f >> 2) & 1, 13: f >> 3, 14: f === 15 ? 1 : 0, 16: sum >= 16 ? 0 : 1, 15: p === 15 ? 0 : 1, 17: p + g >= 16 ? 0 : 1 };
  } };

const SHEETS = {
  74158: quad(true, false),
  74257: quad(false, true),
  74258: quad(true, true),
  // 74251: D0–D7 by C B A on Y, W its complement, both off while G̅ is high
  74251: { names: ['D3', 'D2', 'D1', 'D0', 'Y', 'W', bar('G'), 'GND', 'C', 'B', 'A', 'D7', 'D6', 'D5', 'D4', 'VCC'], steps: 400,
    out(c) { const y = c[[4, 3, 2, 1, 15, 14, 13, 12][num(c, [11, 10, 9])]]; return { 5: c[7] ? OFF : y, 6: c[7] ? OFF : 1 - y }; } },
  74253: dual(false, true),
  74352: dual(true, false),
  74353: dual(true, true),
  74298: stored(['B2', 'A2', 'A1', 'B1', 'C2', 'D2', 'D1', 'GND', 'C1', 'WS', 'CLK', 'QD', 'QC', 'QB', 'QA', 'VCC'], 10, 11, 'f', [3, 4, 9, 7], [2, 1, 5, 6], [15, 14, 13, 12]),
  74181: alu,
  // 74182: the carries into the 2nd, 3rd and 4th ALU, one after the other; the group's P̅ and G̅
  74182: { names: [bar('G1'), bar('P1'), bar('G0'), bar('P0'), bar('G3'), bar('P3'), bar('P'), 'GND', 'Cn+z', bar('G'), 'Cn+y', 'Cn+x', 'Cn', bar('G2'), bar('P2'), 'VCC'], exhaustive: true,
    out(c) {
      const g = [3, 1, 14, 5].map((p) => 1 - c[p]), p = [4, 2, 15, 6].map((q) => 1 - c[q]), cy = [c[13]];
      for (let k = 0; k < 3; k++) cy.push(g[k] | (p[k] & cy[k]));
      return { 12: cy[1], 11: cy[2], 9: cy[3], 7: 1 - (p[0] & p[1] & p[2] & p[3]), 10: 1 - (g[3] | (p[3] & (g[2] | (p[2] & (g[1] | (p[1] & g[0])))))) };
    } },
  // 74280: ΣEVEN high while an even number of A–I are high
  74280: { names: ['G', 'H', 'NC', 'I', 'ΣEVEN', 'ΣODD', 'GND', 'A', 'B', 'C', 'D', 'E', 'F', 'VCC'], exhaustive: true,
    out(c) { const n = [8, 9, 10, 11, 12, 13, 1, 2, 4].filter((p) => c[p]).length % 2; return { 5: 1 - n, 6: n }; } },
  // 74688: P=Q̅ low while G̅ is low and P is Q (words equal, one bit apart, any two; G̅ low and high)
  74688: { names: [bar('G'), 'P0', 'Q0', 'P1', 'Q1', 'P2', 'Q2', 'P3', 'Q3', 'GND', 'P4', 'Q4', 'P5', 'Q5', 'P6', 'Q6', 'P7', 'Q7', bar('P=Q'), 'VCC'],
    vectors: () => [0, 1, 0x5a, 0xa5, 0xff, 0x80, 0x37].flatMap((p) => [p, p ^ 1, p ^ 0x40, (p * 7 + 3) & 255].flatMap((q) => [0, 1].map((g) => ({ 1: g,
      ...Object.fromEntries([2, 4, 6, 8, 11, 13, 15, 17].map((at, k) => [at, (p >> k) & 1])), ...Object.fromEntries([3, 5, 7, 9, 12, 14, 16, 18].map((at, k) => [at, (q >> k) & 1])) })))),
    out(c) { const eq = [2, 4, 6, 8, 11, 13, 15, 17].every((at) => c[at] === c[at + 1]); return { 19: !c[1] && eq ? 0 : 1 }; } },
};

test('#4397 the multiplexers, ALU, carry generator, parity and comparator written once in VHDL: their pinouts, their datasheets\'; their cores\' lint and translation\'s clean', () => {
  checkCores(MUX_ICS, SHEETS);
  // (three-state: the 74257's, 74258's and 74251's outputs, one enable; the 74253's and 74353's, an enable each section)
  assert.deepEqual(MUX_ICS.filter((d) => d.threeState).map((d) => [d.type, d.threeState.sections?.length ?? 1, d.threeState.outs]),
    [['74257', 1, ['y1', 'y2', 'y3', 'y4']], ['74258', 1, ['y1', 'y2', 'y3', 'y4']], ['74251', 1, ['y', 'w']], ['74253', 2, ['y1', 'y2']], ['74353', 2, ['y1', 'y2']]]);
  // (the 74181's A=B an open collector; all of them the Parts panel's MSI ICs)
  assert.deepEqual(PARTS['74181'].pins.filter((q) => q.dir === 'oc').map((q) => q.name), ['A=B']);
  assert.ok(MUX_ICS.every((d) => d.msi && PARTS[d.type].msi));
});

test('#4397 KiCad\'s symbols of them behave as them', () => {
  assert.deepEqual(CATALOGUE.filter((e) => Object.keys(SHEETS).includes(e.as)).map((e) => `${e.symbol}:${e.as}`).sort(), ['74HC688:74688', '74HCT688:74688', '74LS158:74158', '74LS181:74181',
    '74LS182:74182', '74LS251:74251', '74LS253:74253', '74LS257:74257', '74LS258:74258', '74LS280:74280', '74LS298:74298', '74LS352:74352', '74LS353:74353', '74LS688:74688']);
  // (the 74398 and 74399 wait for their datasheets' clock edge to be checked)
  assert.deepEqual(CATALOGUE.filter((e) => ['74LS398', '74LS399'].includes(e.symbol)).map((e) => e.as), [null, null]);
});

test('#4397 their function against their datasheets\': through the engine (each core run live), Check clean', () => {
  for (const [type, sheet] of Object.entries(SHEETS)) checkEngine(type, sheet, { known: 40 });
});

test('#4397 their function in the circuit\'s HDL: VHDL and Verilog (the core translated by Silinx) simulated, no warnings', () => {
  for (const [type, sheet] of Object.entries(SHEETS)) checkHdl(type, sheet);
});

test('#4397 the open synthesis of a 74181 and a 74253 on their benches, VHDL and Verilog: no warnings', async () => {
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  for (const type of ['74181', '74253']) {
    const m = msiBench(type, { name: `c${type}` });
    for (const lang of ['vhdl', 'verilog']) {
      const lib = compile([{ path: lang === 'vhdl' ? 'd.vhd' : 'd.v', text: synthesisText(generateCircuit(m, lang).code) }]), d = elaborate(lib, m.name);
      assert.deepEqual([...lib.errors, ...d.diags].map((e) => e.message), [], `${type} ${lang}`);
      const s = await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode });
      assert.deepEqual(s.warnings, [], `${type} ${lang}`);
      assert.ok(Object.values(s.cells).some((n) => n > 0), `${type} ${lang}: ${JSON.stringify(s.cells)}`);
    }
  }
});
