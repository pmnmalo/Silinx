// The decoders, display drivers and encoders written once in VHDL (#4397, group F: core/circuit-model-decoders.js).
// Their pinouts and their function tables, both written here from their datasheets by pin number
// (test/circuit-model-sheet.mjs): each output's level for every combination of the inputs (an address or a digit latched
// as the chip latches it), evaluated against the engine (each core run live) and against the circuit's HDL simulated in
// VHDL and in Verilog (the core translated by Silinx), with no warnings. KiCad's symbols of them behave as them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS } from '../core/circuit-parts.js';
import { DECODER_ICS } from '../core/circuit-model-decoders.js';
import { CATALOGUE } from '../core/kicad-catalogue-data.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate } from '../core/compile.js';
import { synthesisText } from '../core/translate-off.js';
import { msiBench } from './circuit-helpers.mjs';
import { pin, num, checkCores, checkEngine, checkHdl } from './circuit-model-sheet.mjs';

const B = '̅';
const bar = (s) => `${s}${B}`;
// (an output by pins: k's level among them; active low or high)
const one = (pins, k, low) => Object.fromEntries(pins.map((p, i) => [p, k == null ? null : (i === k) !== low ? 1 : 0]));
const any = (pins) => pins.map((p) => [pin(p), 'any']);

// the segments of each digit, 0–15 (no tails on 6 and 9; 10–15 the 7447's shapes, 15 blank); with tails (the
// 74246–74248's datasheet), 6 lights a and 9 lights d
const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'cdefg', 'abc', 'abcdefg', 'abcfg', 'deg', 'cdg', 'bfg', 'adfg', 'defg', ''];
const TAILED = DIGITS.map((s, n) => (n === 6 ? 'acdefg' : n === 9 ? 'abcdfg' : s));
// (the 7447's segment pins: a 13, b 12, c 11, d 10, e 9, f 15, g 14)
const SEG47 = { a: 13, b: 12, c: 11, d: 10, e: 9, f: 15, g: 14 };
// 74246, 74247 (active low), 74248 (high): LT̅ low lights all; else RBI̅ low and 0 blanks, RBO̅ (pin 4) low then
const tailed = (low) => ({ names: ['B', 'C', bar('LT'), `${bar('BI')}/${bar('RBO')}`, bar('RBI'), 'D', 'A', 'GND', 'e', 'd', 'c', 'b', 'a', 'g', 'f', 'VCC'], exhaustive: true, out(c) {
  const v = num(c, [7, 1, 2, 6]), zero = c[3] === 1 && c[5] === 0 && v === 0;
  const on = (s) => (c[3] === 0 ? 1 : zero ? 0 : TAILED[v].includes(s) ? 1 : 0);
  return { ...segs(SEG47, (s) => (low ? 1 - on(s) : on(s))), 4: zero ? 0 : 1 };
} });
const segs = (at, on) => Object.fromEntries(Object.entries(at).map(([s, p]) => [p, on(s)]));
// 7446: BI̅ low blanks; else LT̅ low lights all; else RBI̅ low and 0 blanks; else the digit; active low
const bcd7 = { names: ['B', 'C', bar('LT'), `${bar('BI')}/${bar('RBO')}`, bar('RBI'), 'D', 'A', 'GND', 'e', 'd', 'c', 'b', 'a', 'g', 'f', 'VCC'], exhaustive: true, out(c) {
  const v = num(c, [7, 1, 2, 6]);
  return segs(SEG47, (s) => 1 - (c[4] === 0 ? 0 : c[3] === 0 ? 1 : c[5] === 0 && v === 0 ? 0 : DIGITS[v].includes(s) ? 1 : 0));
} };
// a priority encoder's code: the highest input low among `pins` (by their value), else null
const highest = (c, pins) => { for (let k = pins.length - 1; k >= 0; k--) if (pins[k] != null && c[pins[k]] === 0) return k; return null; };
const enc148 = (tri) => ({ names: [bar('4'), bar('5'), bar('6'), bar('7'), bar('EI'), bar('A2'), bar('A1'), 'GND', bar('A0'), bar('0'), bar('1'), bar('2'), bar('3'), bar('GS'), bar('EO'), 'VCC'],
  exhaustive: true, out(c) {
    const k = c[5] ? null : highest(c, [10, 11, 12, 13, 1, 2, 3, 4]);
    // (the 74348's A̅ off while GS̅ is high, EI̅ high or no input low: 0 on the bench's LEDs)
    const a = (b) => (c[5] || k == null ? (tri ? 0 : 1) : 1 - ((k >> b) & 1));
    return { 9: a(0), 7: a(1), 6: a(2), 14: c[5] || k == null ? 1 : 0, 15: !c[5] && k == null ? 0 : 1 };
  } });
const DEC42 = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11];
const latched137 = (low) => ({ names: ['A', 'B', 'C', bar('GL'), bar('G2'), 'G1', low ? bar('Y7') : 'Y7', 'GND', ...[6, 5, 4, 3, 2, 1, 0].map((k) => (low ? bar(`Y${k}`) : `Y${k}`)), 'VCC'],
  steps: 300, init: () => ({ l: null }),
  procs: [{ sens: any([4, 1, 2, 3]), run(c, e, o, nx) { if (c[4] === 0) nx.l = num(c, [1, 2, 3]); } }],
  out: (c, s) => { const en = c[6] === 1 && c[5] === 0; return one([15, 14, 13, 12, 11, 10, 9, 7], en ? s.l : -1, low); } });
const dual155 = { names: ['1C', bar('1G'), 'B', bar('1Y3'), bar('1Y2'), bar('1Y1'), bar('1Y0'), 'GND', bar('2Y0'), bar('2Y1'), bar('2Y2'), bar('2Y3'), 'A', bar('2G'), bar('2C'), 'VCC'],
  exhaustive: true, out(c) {
    const v = num(c, [13, 3]);
    return { ...one([7, 6, 5, 4], c[1] === 1 && c[2] === 0 ? v : -1, true), ...one([9, 10, 11, 12], c[15] === 0 && c[14] === 0 ? v : -1, true) };
  } };

const SHEETS = {
  // 7442, 74145: Y0̅–Y9̅ low for 0–9, all high for 10–15
  7442: { names: [...DEC42.slice(0, 7).map((_, k) => bar(`Y${k}`)), 'GND', bar('Y7'), bar('Y8'), bar('Y9'), 'D', 'C', 'B', 'A', 'VCC'], exhaustive: true,
    out: (c) => one(DEC42, num(c, [15, 14, 13, 12]), true) },
  74145: null,
  74137: latched137(true),
  74237: latched137(false),
  // 74238: the 74138's, outputs active high
  74238: { names: ['A', 'B', 'C', bar('G2A'), bar('G2B'), 'G1', 'Y7', 'GND', 'Y6', 'Y5', 'Y4', 'Y3', 'Y2', 'Y1', 'Y0', 'VCC'], exhaustive: true,
    out: (c) => one([15, 14, 13, 12, 11, 10, 9, 7], c[6] === 1 && c[4] === 0 && c[5] === 0 ? num(c, [1, 2, 3]) : -1, false) },
  // 74154: 0̅–15̅, one low while G1̅ and G2̅ are low
  74154: { names: [...Array.from({ length: 11 }, (_, k) => bar(`${k}`)), 'GND', ...Array.from({ length: 5 }, (_, k) => bar(`${11 + k}`)), bar('G1'), bar('G2'), 'D', 'C', 'B', 'A', 'VCC'],
    exhaustive: true, out: (c) => one([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17], c[18] === 0 && c[19] === 0 ? num(c, [23, 22, 21, 20]) : -1, true) },
  74155: dual155,
  74156: dual155,
  7446: bcd7,
  74246: tailed(true),
  74247: tailed(true),
  74248: tailed(false),
  // 4543: A–D followed while LD is high; BI high blanks; 10–15 blank; PH high inverts (its datasheet: no tails)
  4543: { names: ['LD', 'C', 'B', 'D', 'A', 'PH', 'BI', 'VSS', 'a', 'b', 'c', 'd', 'e', 'g', 'f', 'VDD'], steps: 300, init: () => ({ l: null }),
    procs: [{ sens: any([1, 5, 3, 2, 4]), run(c, e, o, nx) { if (c[1] === 1) nx.l = num(c, [5, 3, 2, 4]); } }],
    out: (c, s) => segs({ a: 9, b: 10, c: 11, d: 12, e: 13, f: 15, g: 14 }, (x) => {
      const on = c[7] ? 0 : s.l == null ? null : s.l < 10 && DIGITS[s.l].includes(x) ? 1 : 0;
      return on == null ? null : on ^ c[6];
    }) },
  // 4028: Q0–Q9 high for 0–9, all low for 10–15
  4028: { names: ['Q4', 'Q2', 'Q0', 'Q7', 'Q9', 'Q5', 'Q6', 'VSS', 'Q8', 'A', 'D', 'C', 'B', 'Q1', 'Q3', 'VDD'], exhaustive: true,
    out: (c) => one([3, 14, 2, 15, 1, 6, 7, 4, 9, 5], num(c, [10, 13, 12, 11]), false) },
  // 7449: BI̅ low blanks; a lit segment released (high)
  7449: { names: ['B', 'C', bar('BI'), 'D', 'A', 'e', 'GND', 'd', 'c', 'b', 'a', 'g', 'f', 'VCC'], exhaustive: true,
    out: (c) => segs({ a: 11, b: 10, c: 9, d: 8, e: 6, f: 13, g: 12 }, (s) => (c[3] && DIGITS[num(c, [5, 1, 2, 4])].includes(s) ? 1 : 0)) },
  // 74147: the highest of 1̅–9̅ low, its BCD inverted on D̅C̅B̅A̅ (none: 1111)
  74147: { names: [bar('4'), bar('5'), bar('6'), bar('7'), bar('8'), bar('C'), bar('B'), 'GND', bar('A'), bar('9'), bar('1'), bar('2'), bar('3'), bar('D'), 'NC', 'VCC'], exhaustive: true,
    out(c) { const k = highest(c, [null, 11, 12, 13, 1, 2, 3, 4, 5, 10]) ?? 0; return { 9: 1 - (k & 1), 7: 1 - ((k >> 1) & 1), 6: 1 - ((k >> 2) & 1), 14: 1 - ((k >> 3) & 1) }; } },
  74148: enc148(false),
  74348: enc148(true),
};
SHEETS[74145] = { ...SHEETS[7442] };

test('#4397 the decoders, display drivers and encoders written once in VHDL: their pinouts, their datasheets\'; their cores\' lint and translation\'s clean', () => {
  checkCores(DECODER_ICS, SHEETS);
  // (the 74145's, 74156's, 7446's, 7449's, 74246's and 74247's outputs open collectors; the 74248's segments pulled up
  // inside the chip, its RBO̅ an open collector; the 74348's A̅ three-state, enabled while its GS̅ is low)
  assert.deepEqual(DECODER_ICS.filter((d) => d.pins.some((q) => q.dir === 'oc')).map((d) => d.type), ['74145', '74156', '7446', '7449', '74246', '74247', '74248']);
  assert.deepEqual(PARTS['74248'].pins.filter((q) => q.dir === 'oc').map((q) => q.name), [`${bar('BI')}/${bar('RBO')}`]);
  assert.deepEqual(PARTS['74248'].pins.filter((q) => q.pullup).map((q) => q.name), ['e', 'd', 'c', 'b', 'a', 'g', 'f']);
  assert.deepEqual(PARTS['74348'].threeState, { enable: [['gs_n', '0']], outs: ['a0_n', 'a1_n', 'a2_n'] });
  assert.match(PARTS['74348'].core.vhdl, /\n {4}a2_n, a1_n, a0_n, gs_n, eo_n : out std_logic\n/);
  // (the 74154 on a DIP-24 0.6 inch wide: its rows six apart)
  assert.deepEqual([PARTS['74154'].dip, PARTS['74154'].pins[23]], [24, { n: 24, name: 'VCC', dir: 'vcc', dx: 0, dy: -6, port: 'vcc' }]);
});

test('#4397 KiCad\'s symbols of them behave as them; KiCad\'s 74LS48 as the 7448 (its segments pulled up inside); the 4056 drawn only', () => {
  assert.deepEqual(CATALOGUE.filter((e) => Object.keys(SHEETS).includes(e.as) || e.symbol === '74LS48' || e.symbol === '4056').map((e) => `${e.symbol}:${e.as}`).sort(),
    ['4028:4028', '4056:null', '4543:4543', '74HC137:74137', '74HC237:74237', '74HC238:74238', '74HCT137:74137', '74HCT237:74237', '74HCT238:74238', '74LS137:74137', '74LS145:74145', '74LS147:74147', '74LS148:74148',
      '74LS154:74154', '74LS155:74155', '74LS156:74156', '74LS246:74246', '74LS247:74247', '74LS248:74248', '74LS348:74348', '74LS42:7442', '74LS46:7446', '74LS48:7448',
      '74LS49:7449']);
  // (the 74LS249: no datasheet of it read yet)
  assert.deepEqual(CATALOGUE.filter((e) => e.symbol === '74LS249').map((e) => e.as), [null]);
  assert.deepEqual(PARTS['7448'].pins.filter((q) => q.pullup).map((q) => q.name), ['e', 'd', 'c', 'b', 'a', 'g', 'f']);
});

test('#4397 their function against their datasheets\': through the engine (each core run live), Check clean', () => {
  for (const [type, sheet] of Object.entries(SHEETS)) checkEngine(type, sheet, { known: 16 });
});

test('#4397 their function in the circuit\'s HDL: VHDL and Verilog (the core translated by Silinx) simulated, no warnings', () => {
  for (const [type, sheet] of Object.entries(SHEETS)) checkHdl(type, sheet);
});

test('#4397 the open synthesis of a 74154, a 74348 and a 74137 on their benches, VHDL and Verilog: their exact warnings (the 74137\'s address latches, the chip\'s)', async () => {
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  for (const type of ['74154', '74348', '74137']) {
    const m = msiBench(type, { name: `c${type}` });
    for (const lang of ['vhdl', 'verilog']) {
      const lib = compile([{ path: lang === 'vhdl' ? 'd.vhd' : 'd.v', text: synthesisText(generateCircuit(m, lang).code) }]), d = elaborate(lib, m.name);
      assert.deepEqual([...lib.errors, ...d.diags].map((e) => e.message), [], `${type} ${lang}`);
      const s = await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode });
      // (its latch's signals, one warning each, Yosys's process names left out)
      const latches = s.warnings.map((w) => /^Warning: Latch inferred for signal `\\c74137\.\\d_u1\.u_core\.(\w+)' from process /i.exec(w)?.[1]);
      assert.deepEqual(latches.sort(), type === '74137' ? ['la', 'lb', 'lc'] : [], `${type} ${lang}: ${s.warnings}`);
      assert.ok(Object.values(s.cells).some((n) => n > 0), `${type} ${lang}: ${JSON.stringify(s.cells)}`);
    }
  }
});
