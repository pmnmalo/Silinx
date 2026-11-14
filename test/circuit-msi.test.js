// The MSI ICs of the digital circuits (#3900, core/circuit-msi.js): their pinouts (their datasheets', written here), and
// their function against a reference written here (the segments of each digit by name, the decoders' and multiplexers'
// selections, the sum, the comparator's function table): every input combination (or a random part of them) through the
// engine, and through the HDL simulated by Silinx in VHDL and in Verilog, with no warnings; an input unknown (X) makes
// every output X; the floating inputs of an IC whose outputs are used, warned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS } from '../core/circuit-parts.js';
import { normalizeCircuit, circuitPorts } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { simulate, compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { msiBench, circuitBench } from './circuit-helpers.mjs';

const B = '̅';
// the datasheets' pin names, pin 1 to 16
const PINOUT = {
  7447: ['B', 'C', `LT${B}`, `BI${B}`, `RBI${B}`, 'D', 'A', 'GND', 'e', 'd', 'c', 'b', 'a', 'g', 'f', 'VCC'],
  74138: ['A', 'B', 'C', `G2A${B}`, `G2B${B}`, 'G1', `Y7${B}`, 'GND', `Y6${B}`, `Y5${B}`, `Y4${B}`, `Y3${B}`, `Y2${B}`, `Y1${B}`, `Y0${B}`, 'VCC'],
  74139: [`1G${B}`, '1A', '1B', `1Y0${B}`, `1Y1${B}`, `1Y2${B}`, `1Y3${B}`, 'GND', `2Y3${B}`, `2Y2${B}`, `2Y1${B}`, `2Y0${B}`, '2B', '2A', `2G${B}`, 'VCC'],
  74151: ['D3', 'D2', 'D1', 'D0', 'Y', 'W', `G${B}`, 'GND', 'C', 'B', 'A', 'D7', 'D6', 'D5', 'D4', 'VCC'],
  74153: [`1G${B}`, 'B', '1C3', '1C2', '1C1', '1C0', '1Y', 'GND', '2Y', '2C0', '2C1', '2C2', '2C3', 'A', `2G${B}`, 'VCC'],
  74157: ['S', '1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3B', '3A', '4Y', '4B', '4A', `G${B}`, 'VCC'],
  7483: ['A4', 'Σ3', 'A3', 'B3', 'VCC', 'Σ2', 'B2', 'A2', 'Σ1', 'A1', 'B1', 'GND', 'C0', 'C4', 'Σ4', 'B4'],
  74283: ['Σ2', 'B2', 'A2', 'Σ1', 'A1', 'B1', 'C0', 'GND', 'C4', 'Σ4', 'B4', 'A4', 'Σ3', 'A3', 'B3', 'VCC'],
  7485: ['B3', 'A<B in', 'A=B in', 'A>B in', 'A>B out', 'A=B out', 'A<B out', 'GND', 'B0', 'A0', 'B1', 'A1', 'A2', 'B2', 'A3', 'VCC'],
};
PINOUT[7448] = PINOUT[7447];
// the segments lit for each digit (no tails on 6 and 9; 10–15 the 7447's shapes, 15 blank)
const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'cdefg', 'abc', 'abcdefg', 'abcfg', 'deg', 'cdg', 'bfg', 'adfg', 'defg', ''];
const num = (i, names) => names.reduce((v, n, k) => v + (i[n] << k), 0);
// each IC's outputs, by port, as its datasheet's function table says
const REF = {
  7447: (i) => seg(i, true), 7448: (i) => seg(i, false),
  74138: (i) => Object.fromEntries([...Array(8)].map((_, k) => [`y${k}_n`, i.g1 === 1 && i.g2a_n === 0 && i.g2b_n === 0 && num(i, ['a', 'b', 'c']) === k ? 0 : 1])),
  74139: (i) => Object.fromEntries([1, 2].flatMap((s) => [0, 1, 2, 3].map((k) => [`y${k}${s}_n`, i[`g${s}_n`] === 0 && num(i, [`a${s}`, `b${s}`]) === k ? 0 : 1]))),
  74151: (i) => { const y = i.g_n ? 0 : i[`d${num(i, ['a', 'b', 'c'])}`]; return { y, w: 1 - y }; },
  74153: (i) => ({ y1: i.g1_n ? 0 : i[`c${num(i, ['a', 'b'])}1`], y2: i.g2_n ? 0 : i[`c${num(i, ['a', 'b'])}2`] }),
  74157: (i) => Object.fromEntries([1, 2, 3, 4].map((k) => [`y${k}`, i.g_n ? 0 : i.s ? i[`b${k}`] : i[`a${k}`]])),
  7483: (i) => add(i), 74283: (i) => add(i),
  7485: (i) => {
    const a = num(i, ['a0', 'a1', 'a2', 'a3']), b = num(i, ['b0', 'b1', 'b2', 'b3']);
    if (a > b) return { ogt: 1, oeq: 0, olt: 0 };
    if (a < b) return { ogt: 0, oeq: 0, olt: 1 };
    // the 74LS85's cascading inputs' rows: A=B in high wins; both A>B in and A<B in high: both outputs low; all low: both high
    if (i.ieq) return { ogt: 0, oeq: 1, olt: 0 };
    return { ogt: i.ilt ? 0 : 1, oeq: 0, olt: i.igt ? 0 : 1 };
  },
};
function seg(i, low) {
  const d = num(i, ['a', 'b', 'c', 'd']);
  const lit = i.bi_n === 0 ? '' : i.lt_n === 0 ? 'abcdefg' : i.rbi_n === 0 && d === 0 ? '' : DIGITS[d];
  return Object.fromEntries([...'abcdefg'].map((s) => [`seg_${s}`, (lit.includes(s) ? 1 : 0) ^ (low ? 1 : 0)]));
}
function add(i) { const s = num(i, ['a1', 'a2', 'a3', 'a4']) + num(i, ['b1', 'b2', 'b3', 'b4']) + i.c0; return { s1: s & 1, s2: (s >> 1) & 1, s3: (s >> 2) & 1, s4: (s >> 3) & 1, c4: s >> 4 }; }

let seed = 5;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed >> 4; };
// an IC's input vectors (by port): every combination up to 8 inputs, else 200 random ones
function vectorsOf(type, limit = 256) {
  const ins = PARTS[type].pins.filter((p) => p.dir === 'in').map((p) => p.port);
  const v = (x) => Object.fromEntries(ins.map((n, k) => [n, (x >> k) & 1]));
  return 1 << ins.length <= limit ? [...Array(1 << ins.length)].map((_, x) => v(x)) : [...Array(limit)].map(() => v(rnd() & ((1 << ins.length) - 1)));
}
const outsOf = (type) => PARTS[type].pins.filter((p) => p.dir === 'out' || p.dir === 'oc').map((p) => p.port);
const want = (type, v) => outsOf(type).map((o) => REF[type](v)[o]).join('');

test('the MSI ICs\' pinouts are their datasheets\' (their power pins: the 7483\'s VCC 5 and GND 12); the 7447\'s outputs open collector', () => {
  for (const [type, names] of Object.entries(PINOUT)) {
    const d = PARTS[type];
    assert.deepEqual(d.pins.map((p) => p.name), names, type);
    assert.equal(d.chip, `SN74LS${type.slice(2)}`);
    assert.equal(d.dip, 16);
  }
  assert.deepEqual(['vcc', 'gnd'].map((dir) => PARTS[7483].pins.find((p) => p.dir === dir).n), [5, 12]);
  assert.deepEqual([...new Set(PARTS[7447].pins.filter((p) => /^[a-g]$/.test(p.name)).map((p) => p.dir))], ['oc']);
  assert.deepEqual([...new Set(PARTS[7448].pins.filter((p) => /^[a-g]$/.test(p.name)).map((p) => p.dir))], ['out']);
});

test('every MSI IC against its function table, through the engine (every combination, or 256 random ones)', () => {
  for (const type of Object.keys(PINOUT)) {
    const m = msiBench(type, { name: `b${type}` });
    assert.deepEqual(checkCircuit(m), [], `${type}: a clean bench`);
    const sim = createCircuitSim(m);
    const ins = circuitPorts(m).inputs;
    for (const v of vectorsOf(type)) {
      for (const i of ins) sim.set(i.part, v[i.name] === 1);
      assert.equal(sim.run().quiet, true);
      assert.equal(outsOf(type).map((o) => sim.outputs()[`q_${o}`]).join(''), want(type, v), `${type} ${JSON.stringify(v)}`);
    }
  }
});

test('every MSI IC\'s HDL: VHDL and Verilog simulated by Silinx as its function table, no warnings', () => {
  for (const type of Object.keys(PINOUT)) {
    const m = msiBench(type, { name: `b${type}` });
    const { inputs, outputs } = circuitPorts(m);
    const vectors = vectorsOf(type, 32);
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateCircuit(m, lang), file = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
      const lib = compile([{ path: file, text: g.code }]), d = elaborate(lib, m.name);
      assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => e.message), [], `${type} ${lang}: no warnings`);
      const r = simulate([{ path: file, text: g.code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name), ns: 200 }) }], 'tb', { until: 1e9 });
      assert.deepEqual(r.errors, [], `${type} ${lang}`);
      assert.deepEqual(r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz]+$/.test(s)), vectors.map((v) => want(type, v)), `${type} ${lang}`);
    }
  }
});

test('an MSI IC: an unknown input makes every output X; its floating inputs warned once an output is used; its delay', () => {
  const m = msiBench('74157');
  // S's switch gone: S floats (a 74LS input reads high: B selected), warned; 1A, 1B as they are
  const f = normalizeCircuit({ ...m, parts: m.parts.filter((p) => p.id !== 'S1'), wires: m.wires.filter((w) => w.id !== 'w3') });
  assert.deepEqual(checkCircuit(f).map((x) => x.message), ['U1 pin 1 (S) is floating: a 74LS input reads high']);
  const sim = createCircuitSim(f);
  sim.run();
  sim.set('S3', true); sim.run();   // (1B)
  assert.equal(sim.outputs().q_y1, '1', 'S high: 1B');
  // an input driven X (two switches against each other on 1A): every output X
  const x = normalizeCircuit({ ...m, wires: [...m.wires, { id: 'x1', points: [[-40, 1], [-44, 1], [-44, 2], [-40, 2]], color: 'red' }] });
  const xs = createCircuitSim(x);
  xs.run();
  xs.set('S2', true); const r = xs.run();
  assert.equal(xs.shorts().length, 1);
  assert.deepEqual(['y1', 'y2', 'y3', 'y4'].map((o) => xs.pin(`U1.${PARTS[74157].pins.find((p) => p.port === o).n}`)), ['X', 'X', 'X', 'X']);
  assert.ok(r.quiet);
  // its delay: the 74157's 12 ns from S to the outputs
  const d = createCircuitSim(m);
  d.run();
  d.set('S2', true); const t0 = d.time; const r2 = d.run();
  assert.equal(r2.time - t0, 12);
  // with no output used, its inputs are not warned
  // (the wires w1–w12: the supply's two and the 11 inputs'; the rest the LEDs')
  const none = normalizeCircuit({ ...f, parts: f.parts.filter((p) => !/^D/.test(p.id)), wires: f.wires.filter((w) => Number(w.id.slice(1)) <= 12) });
  assert.deepEqual(checkCircuit(none).filter((c) => c.message.includes('floating')), []);
});
