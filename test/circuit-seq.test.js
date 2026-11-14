// The sequential ICs of the digital circuits (#3900, core/circuit-seq.js): their pinouts (their datasheets', written
// here); what each must do, as its datasheet says it (a scenario per IC, its expected outputs written here: a D
// flip-flop's capture, preset and clear; a J-K's toggle on the falling edge; the counters' sequences, loads, clears,
// carries; the shift registers' shifts and loads; the 4511's latch and blanking; the 4017's one-hot count); and the engine
// and the HDL (VHDL and Verilog, simulated by Silinx, no warnings) step for step on a random walk of each IC's inputs
// (one input flipped per step: no two changes at once).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS } from '../core/circuit-parts.js';
import { circuitPorts, normalizeCircuit } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { simulate, compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { msiBench, circuitBench } from './circuit-helpers.mjs';

const B = '̅';
const PINOUT = {
  7474: [`1CLR${B}`, '1D', '1CLK', `1PRE${B}`, '1Q', `1Q${B}`, 'GND', `2Q${B}`, '2Q', `2PRE${B}`, '2CLK', '2D', `2CLR${B}`, 'VCC'],
  7476: ['1CLK', `1PRE${B}`, `1CLR${B}`, '1J', 'VCC', '2CLK', `2PRE${B}`, `2CLR${B}`, '2J', `2Q${B}`, '2Q', '2K', 'GND', `1Q${B}`, '1Q', '1K'],
  74112: ['1CLK', '1K', '1J', `1PRE${B}`, '1Q', `1Q${B}`, `2Q${B}`, 'GND', '2Q', `2PRE${B}`, '2J', '2K', '2CLK', `2CLR${B}`, `1CLR${B}`, 'VCC'],
  7490: ['CKB', 'R0(1)', 'R0(2)', 'NC', 'VCC', 'R9(1)', 'R9(2)', 'QC', 'QB', 'GND', 'QD', 'QA', 'NC', 'CKA'],
  7493: ['CKB', 'R0(1)', 'R0(2)', 'NC', 'VCC', 'NC', 'NC', 'QC', 'QB', 'GND', 'QD', 'QA', 'NC', 'CKA'],
  74161: [`CLR${B}`, 'CLK', 'A', 'B', 'C', 'D', 'ENP', 'GND', `LOAD${B}`, 'ENT', 'QD', 'QC', 'QB', 'QA', 'RCO', 'VCC'],
  74191: ['B', 'QB', 'QA', `CTEN${B}`, `D/U${B}`, 'QC', 'QD', 'GND', 'D', 'C', `LOAD${B}`, 'MAX/MIN', `RCO${B}`, 'CLK', 'A', 'VCC'],
  74193: ['B', 'QB', 'QA', 'DOWN', 'UP', 'QC', 'QD', 'GND', 'D', 'C', `LOAD${B}`, `CO${B}`, `BO${B}`, 'CLR', 'A', 'VCC'],
  74164: ['A', 'B', 'QA', 'QB', 'QC', 'QD', 'GND', 'CLK', `CLR${B}`, 'QE', 'QF', 'QG', 'QH', 'VCC'],
  74165: [`SH/LD${B}`, 'CLK', 'E', 'F', 'G', 'H', `QH${B}`, 'GND', 'QH', 'SER', 'A', 'B', 'C', 'D', 'CLK INH', 'VCC'],
  74194: [`CLR${B}`, 'SR SER', 'A', 'B', 'C', 'D', 'SL SER', 'GND', 'S0', 'S1', 'CLK', 'QD', 'QC', 'QB', 'QA', 'VCC'],
  74595: ['QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', 'GND', "QH'", `SRCLR${B}`, 'SRCLK', 'RCLK', `OE${B}`, 'SER', 'QA', 'VCC'],
  4511: ['B', 'C', `LT${B}`, `BL${B}`, 'LE', 'D', 'A', 'VSS', 'e', 'd', 'c', 'b', 'a', 'g', 'f', 'VDD'],
  4017: ['Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', 'VSS', 'Q8', 'Q4', 'Q9', 'CO', 'CLK INH', 'CLK', 'RST', 'VDD'],
};
PINOUT[74163] = PINOUT[74161];

test('the sequential ICs\' pinouts are their datasheets\'; the 4511 and the 4017 CMOS, the rest 74LS', () => {
  for (const [type, names] of Object.entries(PINOUT)) {
    assert.deepEqual(PARTS[type].pins.map((p) => p.name), names, type);
    assert.equal(PARTS[type].family, type.startsWith('4') ? 'cmos' : 'ttl', type);
  }
});

// an IC on its bench, driven step by step: each step sets some inputs (by port), its outputs read (by port: 0, 1)
function driver(type) {
  const m = msiBench(type, { name: `s${type}` });
  assert.deepEqual(checkCircuit(m), [], `${type}: a clean bench`);
  const sim = createCircuitSim(m);
  const ins = new Map(circuitPorts(m).inputs.map((i) => [i.name, i.part]));
  sim.run();
  return {
    set(v) { for (const [k, x] of Object.entries(v)) { sim.set(ins.get(k), x === 1); sim.run(); } return this; },
    get: (o) => Number(sim.outputs()[`q_${o}`]),
    word: (os) => os.map((o) => Number(sim.outputs()[`q_${o}`])).join(''),
  };
}
const clk = (d, c, edge = 'rise') => (edge === 'rise' ? d.set({ [c]: 1 }).set({ [c]: 0 }) : d.set({ [c]: 1 }).set({ [c]: 0 }));

test('flip-flops: the 7474 captures D on the rising edge, preset and clear asynchronous (both: Q and Q̄ high); the J-Ks toggle on the falling edge', () => {
  const d = driver('7474').set({ pre1_n: 1, clr1_n: 1, pre2_n: 1, clr2_n: 1 });
  d.set({ d1: 1, clk1: 1 });
  assert.deepEqual([d.get('q1'), d.get('q1_n')], [1, 0], 'D captured on the rising edge');
  d.set({ d1: 0 }).set({ clk1: 0 });
  assert.equal(d.get('q1'), 1, 'not on the falling edge');
  d.set({ clr1_n: 0 });
  assert.deepEqual([d.get('q1'), d.get('q1_n')], [0, 1], 'cleared at once');
  d.set({ pre1_n: 0 });
  assert.deepEqual([d.get('q1'), d.get('q1_n')], [1, 1], 'preset and clear: both high');
  d.set({ clr1_n: 1 });
  assert.deepEqual([d.get('q1'), d.get('q1_n')], [1, 0]);
  for (const type of ['7476', '74112']) {
    const j = driver(type).set({ pre1_n: 1 }).set({ clr1_n: 0 }).set({ clr1_n: 1 });
    assert.equal(j.get('q1'), 0);
    j.set({ j1: 1, k1: 1 });
    const seen = [];
    for (let k = 0; k < 4; k++) { j.set({ clk1: 1 }); seen.push(j.get('q1')); j.set({ clk1: 0 }); seen.push(j.get('q1')); }
    assert.deepEqual(seen, [0, 1, 1, 0, 0, 1, 1, 0], `${type}: toggles on each falling edge`);
    j.set({ k1: 0 }).set({ clk1: 1 }).set({ clk1: 0 });
    assert.equal(j.get('q1'), 1, `${type}: J set`);
    j.set({ j1: 0, k1: 1 }).set({ clk1: 1 }).set({ clk1: 0 });
    assert.equal(j.get('q1'), 0, `${type}: K reset`);
  }
});

test('counters: the 7493 and the 7490 (their sections), the 74161 / 74163 (count, load, clears, RCO), the 74191 and 74193 (up, down, loads, carries)', () => {
  const r = driver('7493').set({ r01: 1, r02: 1 }).set({ r01: 0 });
  const seq = [];
  for (let k = 0; k < 9; k++) { seq.push(r.word(['qd', 'qc', 'qb'])); clk(r, 'ckb', 'fall'); }
  assert.deepEqual(seq, ['000', '001', '010', '011', '100', '101', '110', '111', '000'], 'the 7493\'s divide by 8');
  clk(r, 'cka', 'fall');
  assert.equal(r.get('qa'), 1);
  const dec = driver('7490').set({ r01: 1, r02: 1 }).set({ r01: 0 });
  const five = [];
  for (let k = 0; k < 6; k++) { five.push(dec.word(['qd', 'qc', 'qb'])); clk(dec, 'ckb', 'fall'); }
  assert.deepEqual(five, ['000', '001', '010', '011', '100', '000'], 'the 7490\'s divide by 5');
  dec.set({ r91: 1, r92: 1 });
  assert.equal(dec.word(['qd', 'qc', 'qb', 'qa']), '1001', 'R9: 9');
  for (const type of ['74161', '74163']) {
    const c = driver(type).set({ clr_n: 1, load_n: 1, enp: 1, ent: 1 }).set({ clr_n: 0 });
    assert.equal(c.word(['qd', 'qc', 'qb', 'qa']), type === '74161' ? '0000' : 'xxxx'.replace(/x/g, '0'), `${type}: cleared`);
    if (type === '74163') { assert.equal(c.get('qa'), 0); c.set({ clk: 1 }).set({ clk: 0 }); }
    c.set({ clr_n: 1 });
    const counts = [];
    for (let k = 0; k < 16; k++) { counts.push(parseInt(c.word(['qd', 'qc', 'qb', 'qa']), 2)); c.set({ clk: 1 }).set({ clk: 0 }); }
    assert.deepEqual(counts, [...Array(16).keys()], `${type}: counts 0 to 15`);
    c.set({ clk: 1 }).set({ clk: 0 });
    for (let k = 0; k < 14; k++) c.set({ clk: 1 }).set({ clk: 0 });
    assert.deepEqual([c.word(['qd', 'qc', 'qb', 'qa']), c.get('rco')], ['1111', 1], `${type}: RCO at 15`);
    c.set({ d: 1, b: 1 }).set({ load_n: 0 });
    assert.equal(c.word(['qd', 'qc', 'qb', 'qa']), '1111', `${type}: LOAD waits for the clock`);
    c.set({ clk: 1 }).set({ clk: 0 }).set({ load_n: 1 });
    assert.equal(c.word(['qd', 'qc', 'qb', 'qa']), '1010', `${type}: loaded`);
    c.set({ clr_n: 0 });
    assert.equal(c.word(['qd', 'qc', 'qb', 'qa']), type === '74161' ? '0000' : '1010', `${type}: clear ${type === '74161' ? 'at once' : 'on the clock'}`);
  }
  const ud = driver('74191').set({ load_n: 1, a: 1, d: 1 }).set({ load_n: 0 }).set({ load_n: 1 });
  assert.equal(ud.word(['qd', 'qc', 'qb', 'qa']), '1001', '74191: loaded at once');
  ud.set({ clk: 1 }).set({ clk: 0 });
  assert.equal(ud.word(['qd', 'qc', 'qb', 'qa']), '1010', 'up');
  ud.set({ du: 1 }); ud.set({ clk: 1 }).set({ clk: 0 }); ud.set({ clk: 1 }).set({ clk: 0 });
  assert.equal(ud.word(['qd', 'qc', 'qb', 'qa']), '1000', 'down');
  ud.set({ a: 0, d: 0 }).set({ load_n: 0 }).set({ load_n: 1 });
  assert.deepEqual([ud.get('maxmin'), ud.get('rco_n')], [1, 0], '0 counting down: MAX/MIN, RCO low while the clock is low');
  ud.set({ clk: 1 });
  assert.deepEqual([ud.word(['qd', 'qc', 'qb', 'qa']), ud.get('rco_n')], ['1111', 1], 'the rising edge: down to 15; RCO high while the clock is high');
  const dc = driver('74193').set({ load_n: 1 }).set({ up: 1 }).set({ down: 1 }).set({ clr: 1 }).set({ clr: 0 });
  for (let k = 0; k < 3; k++) dc.set({ up: 0 }).set({ up: 1 });
  assert.equal(dc.word(['qd', 'qc', 'qb', 'qa']), '0011', '74193: three up');
  dc.set({ down: 0 }).set({ down: 1 });
  assert.equal(dc.word(['qd', 'qc', 'qb', 'qa']), '0010', 'one down');
  dc.set({ clr: 1 });
  assert.deepEqual([dc.word(['qd', 'qc', 'qb', 'qa']), dc.get('bo_n')], ['0000', 1]);
  dc.set({ clr: 0 }).set({ down: 0 });
  assert.equal(dc.get('bo_n'), 0, 'BO low at 0 while DOWN is low');
});

test('shift registers: the 74164 shifts A and B in, the 74165 loads and shifts out, the 74194\'s four modes, the 74595\'s storage and 3-state outputs', () => {
  const s = driver('74164').set({ clr_n: 1, b: 1 });
  for (const bit of [1, 0, 1, 1]) s.set({ a: bit }).set({ clk: 1 }).set({ clk: 0 });
  assert.equal(s.word(['qa', 'qb', 'qc', 'qd']), '1101', 'the last bit in QA');
  s.set({ clr_n: 0 });
  assert.equal(s.word(['qa', 'qb', 'qc', 'qd', 'qe', 'qf', 'qg', 'qh']), '00000000');
  // (the load takes A–H when SH/LD falls: an asynchronous load as a synthesis tool's flip-flops have it)
  const p = driver('74165').set({ shld_n: 1 }).set({ a: 1, c: 1, h: 1 }).set({ shld_n: 0 }).set({ shld_n: 1 });
  const out = [];
  for (let k = 0; k < 8; k++) { out.push(p.get('qh')); p.set({ clk: 1 }).set({ clk: 0 }); }
  assert.deepEqual(out, [1, 0, 0, 0, 0, 1, 0, 1], 'H first, then G … A');
  p.set({ inh: 1 }).set({ clk: 1 }).set({ clk: 0 });
  assert.equal(p.get('qh'), 0, 'SER (0) shifted in; CLK INH high: no edge of the two ORed while it stays high');
  const u = driver('74194').set({ clr_n: 1, s0: 1, s1: 1, a: 1, d: 1 }).set({ clk: 1 }).set({ clk: 0 });
  assert.equal(u.word(['qa', 'qb', 'qc', 'qd']), '1001', 'load');
  u.set({ s1: 0, sr: 0 }).set({ clk: 1 }).set({ clk: 0 });
  assert.equal(u.word(['qa', 'qb', 'qc', 'qd']), '0100', 'shift right');
  u.set({ s1: 1 }).set({ s0: 0, sl: 1 }).set({ clk: 1 }).set({ clk: 0 });
  assert.equal(u.word(['qa', 'qb', 'qc', 'qd']), '1001', 'shift left');
  u.set({ s1: 0 }).set({ clk: 1 }).set({ clk: 0 });
  assert.equal(u.word(['qa', 'qb', 'qc', 'qd']), '1001', 'hold');
  const r = driver('74595').set({ srclr_n: 1 });
  for (const bit of [1, 1, 0, 1]) r.set({ ser: bit }).set({ srclk: 1 }).set({ srclk: 0 });
  assert.equal(r.word(['qa', 'qb', 'qc', 'qd']), '0000', 'the storage register not yet');
  r.set({ rclk: 1 }).set({ rclk: 0 });
  assert.equal(r.word(['qa', 'qb', 'qc', 'qd']), '1011', 'stored');
  r.set({ oe_n: 1 });
  assert.equal(r.word(['qa', 'qb', 'qc', 'qd']), '0000', 'OE high: Z (the LEDs off)');
});

test('the 4511 latches DCBA while LE is low and holds it while high; LT, BL, above 9 blank; the 4017 counts one-hot, CO for 0–4', () => {
  const l = driver('4511').set({ lt_n: 1, bl_n: 1 }).set({ c: 1, b: 1, a: 1 });   // 7
  const seg = () => l.word(['seg_a', 'seg_b', 'seg_c', 'seg_d', 'seg_e', 'seg_f', 'seg_g']);
  assert.equal(seg(), '1110000', '7: a b c');
  l.set({ le: 1 }).set({ a: 0 });
  assert.equal(seg(), '1110000', 'latched');
  l.set({ le: 0 });
  assert.equal(seg(), '0011111', '6: c d e f g (no tail)');
  l.set({ d: 1 });
  assert.equal(seg(), '0000000', '14: blank');
  l.set({ lt_n: 0 });
  assert.equal(seg(), '1111111', 'lamp test');
  l.set({ lt_n: 1, bl_n: 0 }).set({ d: 0 });
  assert.equal(seg(), '0000000', 'blanked');
  const c = driver('4017').set({ rst: 1 }).set({ rst: 0 });
  const seen = [];
  for (let k = 0; k < 11; k++) {
    const q = [...Array(10)].map((_, n) => c.get(`q${n}`));
    seen.push(`${q.indexOf(1)}${c.get('co')}`);
    assert.equal(q.filter(Boolean).length, 1, 'one-hot');
    c.set({ clk: 1 }).set({ clk: 0 });
  }
  assert.deepEqual(seen, ['01', '11', '21', '31', '41', '50', '60', '70', '80', '90', '01']);
  c.set({ inh: 1 }).set({ clk: 1 }).set({ clk: 0 });
  assert.deepEqual([c.get('q1'), c.get('q2')], [1, 0], 'CLK INH high: held at 1 (eleven pulses before)');
});

// the second of two asynchronous controls held inactive (releasing one while the other is active is not stable on the
// chip: Verilog's edges do not see it, core/circuit-seq.js); the scenarios above try them
const HOLD = { 7474: { pre1_n: 1, pre2_n: 1 }, 7476: { pre1_n: 1, pre2_n: 1 }, 74112: { pre1_n: 1, pre2_n: 1 }, 7490: { r91: 0, r92: 0 }, 74193: { load_n: 1 } };
let seed = 9;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed >> 4; };
test('every sequential IC: the engine and its HDL (VHDL and Verilog) step for step on a random walk of its inputs, no warnings', () => {
  for (const type of Object.keys(PINOUT)) {
    const m0 = msiBench(type, { name: `w${type}` });
    // (the switches saved at the walk's first levels: the engine starts where the test bench does)
    const m = normalizeCircuit({ ...m0, parts: m0.parts.map((p) => (p.type === 'logic-switch' && HOLD[type]?.[p.label] ? { ...p, on: true } : p)) });
    const { inputs, outputs } = circuitPorts(m);
    // the walk: from all 0 (but the held inputs), one input flipped per step
    const cur = Object.fromEntries(inputs.map((i) => [i.name, HOLD[type]?.[i.name] ?? 0]));
    const walk = inputs.filter((i) => !(i.name in (HOLD[type] || {})));
    const vectors = [{ ...cur }];
    for (let k = 0; k < 120; k++) { const n = walk[rnd() % walk.length].name; cur[n] ^= 1; vectors.push({ ...cur }); }
    const sim = createCircuitSim(m);
    sim.run();
    const engine = vectors.map((v) => { for (const i of inputs) sim.set(i.part, v[i.name] === 1); sim.run(); return outputs.map((o) => sim.outputs()[o.name]).join(''); });
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateCircuit(m, lang), file = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
      const lib = compile([{ path: file, text: g.code }]), d = elaborate(lib, m.name);
      assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => e.message), [], `${type} ${lang}: no warnings`);
      const r = simulate([{ path: file, text: g.code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name), ns: 1000 }) }], 'tb', { until: 1e10 });
      assert.deepEqual(r.errors, [], `${type} ${lang}`);
      const got = r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz]+$/.test(x));
      const at = got.findIndex((x, k) => x !== engine[k]);
      assert.equal(at, -1, `${type} ${lang}: step ${at} (${JSON.stringify(vectors[at])}): ${got[at]} ≠ ${engine[at]}`);
    }
  }
});
