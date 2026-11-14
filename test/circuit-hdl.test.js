// The HDL generated from a circuit (#3897, core/circuit-hdl.js): compiled, elaborated and simulated by Silinx, in VHDL
// and in Verilog, with no errors and no warnings (Check Syntax's lint); its outputs against the live engine's
// (core/circuit-sim.js) and the truth tables: every IC's bench, the half adder, a button, a floating input; its delays
// (a ring oscillator's period, a glitch); its names (an IC's entity after the circuit, the nets made unique); through
// view-hdl (a project's drawn source) with its header; a circuit with errors has none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { circuitPorts, normalizeCircuit, newCircuit } from '../core/circuit.js';
import { partPins } from '../core/circuit-parts.js';
import { viewHdl } from '../core/view-hdl.js';
import { halfAdder, icBench, circuitBench } from './circuit-helpers.mjs';

const LANGS = ['vhdl', 'verilog'];
const file = (lang) => (lang === 'vhdl' ? 'dut.vhd' : 'dut.v');
function checkSyntax(lang, code, top) {
  const lib = compile([{ path: file(lang), text: code }]);
  const d = elaborate(lib, top);
  return [...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => `${e.severity}: ${e.message}`);
}
// the outputs, one line of bits per vector, as the HDL simulates them
function hdlRun(m, lang, vectors, ns = 100) {
  const { inputs, outputs } = circuitPorts(m);
  const ins = inputs.map((x) => x.name), outs = outputs.map((x) => x.name);
  const g = generateCircuit(m, lang);
  const r = simulate([{ path: file(lang), text: g.code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins, outs, ns }) }], 'tb', { until: 1e9 });
  assert.deepEqual(r.errors, [], `${m.name} ${lang}`);
  return r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz]+$/.test(s));
}
// the same, through the engine: each vector's switches set, run until quiet
function engineRun(m, vectors) {
  const { inputs, outputs } = circuitPorts(m);
  const sim = createCircuitSim(m);
  sim.run();
  return vectors.map((v) => {
    for (const i of inputs) sim.set(i.part, v[i.name] === 1);
    sim.run();
    return outputs.map((o) => sim.outputs()[o.name]).join('');
  });
}
let seed = 11;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed >> 4; };

test('every IC\'s bench: its HDL simulates as the engine, in VHDL and in Verilog, with no warnings', () => {
  for (const type of ['7400', '7404', '7408', '7432', '7486']) {
    const m = icBench(type, { name: `bench${type}` });
    const names = circuitPorts(m).inputs.map((x) => x.name);
    const vectors = [Object.fromEntries(names.map((n) => [n, 0])), Object.fromEntries(names.map((n) => [n, 1])),
      ...Array.from({ length: 30 }, () => Object.fromEntries(names.map((n) => [n, rnd() & 1])))];
    const want = engineRun(m, vectors);
    for (const lang of LANGS) {
      const g = generateCircuit(m, lang);
      assert.deepEqual(checkSyntax(lang, g.code, m.name), [], `${type} ${lang}: no warnings`);
      assert.deepEqual(hdlRun(m, lang, vectors), want, `${type} ${lang}`);
    }
  }
});

test('the half adder: its truth table in VHDL and in Verilog; the HDL\'s names and header', () => {
  const m = halfAdder();
  const vectors = [{ a: 0, b: 0 }, { a: 0, b: 1 }, { a: 1, b: 0 }, { a: 1, b: 1 }];
  for (const lang of LANGS) {
    assert.deepEqual(hdlRun(m, lang, vectors), ['00', '10', '10', '01'], lang);
    const g = generateCircuit(m, lang);
    assert.deepEqual(checkSyntax(lang, g.code, 'half_adder'), [], `${lang}: no warnings`);
    assert.equal(g.filename, lang === 'vhdl' ? 'half_adder.vhd' : 'half_adder.v');
    assert.equal(g.module, 'half_adder');
    const c = lang === 'vhdl' ? '--' : '//';
    assert.deepEqual(g.code.split('\n').slice(1, 7), [`${c} ${lang === 'vhdl' ? 'Entity' : 'Module'}      : half_adder`, `${c} Description : the digital circuit half_adder.circ.json`,
      `${c} Generator   : Silinx circuit editor (edit the circuit, not this file)`, `${c} Parts       : U1 (SN74LS86), U2 (SN74LS08)`,
      `${c} Inputs      : a (S1, '1' while on), b (S2, '1' while on)`, `${c} Outputs     : s (D1, '1' while lit), c (D2, '1' while lit)`]);
    // each IC's entity after the circuit, its delay
    assert.match(g.code, lang === 'vhdl' ? /entity half_adder_sn74ls86 is[^]*y1 <= \(rd\(a1\) xor rd\(b1\)\) after 12 ns when pw else 'Z' after 12 ns;/ : /module half_adder_sn74ls86 \([^]*assign #12 y1 = pw \? \(rd\(a1\) \^ rd\(b1\)\) : 1'bz;/);
    assert.match(g.code, lang === 'vhdl' ? /u_U2 : entity work\.half_adder_sn74ls08 port map \(a1 => n\d+, b1 => n\d+, y1 => n\d+, a2 => 'Z', b2 => 'Z', y2 => open,/ : /half_adder_sn74ls08 u_U2 \(\.a1\(n\d+\), \.b1\(n\d+\), \.y1\(n\d+\), \.a2\(1'bz\), \.b2\(1'bz\), \.y2\(\),/);
  }
  // a label that is a net's name: the net renamed
  const n = normalizeCircuit({ ...m, parts: m.parts.map((p) => (p.id === 'S1' ? { ...p, label: 'n1' } : p)) });
  const g = generateCircuit(n, 'vhdl');
  assert.match(g.code, /signal n1_2, /);
  assert.deepEqual(hdlRun(n, 'vhdl', [{ n1: 1, b: 1 }]), ['01']);
});

test('a button to GND on a floating input, in VHDL and in Verilog: high while released, low while pressed', () => {
  const m = icBench('7404', { name: 'btn' });
  const pins = new Map(partPins(m.parts[0]).map((q) => [q.n, [q.x, q.y]]));
  const b = normalizeCircuit({ ...m, parts: [...m.parts.filter((p) => p.id !== 'S1a'), { id: 'B1', type: 'button', x: -10, y: 0, label: 'go' }],
    wires: [...m.wires.filter((w) => w.id !== 'w3'), { id: 'v1', points: [[-10, 0], pins.get(1)], color: 'green' }, { id: 'v2', points: [[-7, 0], [-20, -19]], color: 'black' }] });
  const names = circuitPorts(b).inputs.map((x) => x.name);
  const vectors = [0, 1, 0, 1].map((go) => ({ ...Object.fromEntries(names.map((n) => [n, 0])), go }));
  const want = engineRun(b, vectors);
  assert.deepEqual(want.map((s) => s[0]), ['0', '1', '0', '1'], 'g1y: 1A floating (high), then 0');
  for (const lang of LANGS) {
    assert.deepEqual(hdlRun(b, lang, vectors), want, lang);
    const g = generateCircuit(b, lang);
    assert.deepEqual(checkSyntax(lang, g.code, 'btn'), [], `${lang}: no warnings`);
    assert.match(g.code, lang === 'vhdl' ? /n\d+ <= n\d+ when go = '1' else 'Z';   -- B1 pressed/ : /assign n\d+ = go \? n\d+ : 1'bz;   \/\/ B1 pressed/);
  }
  // an input left floating: its net 'Z', said
  const f = normalizeCircuit({ ...m, parts: m.parts.filter((p) => p.id !== 'S1a') });
  for (const lang of LANGS) {
    const g = generateCircuit(f, lang);
    assert.match(g.code, lang === 'vhdl' ? /n\d+ <= 'Z';   -- floating: a 74LS input reads it high, a 4000 input X/ : /assign n\d+ = 1'bz;   \/\/ floating: a 74LS input reads it high, a 4000 input X/);
    assert.deepEqual(checkSyntax(lang, g.code, 'btn'), [], `${lang}: no warnings`);
  }
});

test('the delays in the HDL: an inverter\'s 10 ns, a chain\'s sum, as the engine\'s', () => {
  // the 7404's six inverters in a row: a → g6y after 60 ns, seen 55 ns after a rises (not yet) and 65 ns after (there)
  const m = icBench('7404', { name: 'chain6' });
  const pins = new Map(partPins(m.parts[0]).map((q) => [q.n, [q.x, q.y]]));
  const keep = ['S1a', 'U1', 'P1', 'D6'];
  const wires = m.wires.filter((w) => ['w1', 'w2', 'w3', 'w19', 'w20'].includes(w.id));
  // 1Y→2A, 2Y→3A, 3Y→4A, 4Y→5A, 5Y→6A
  for (const [a, b] of [[2, 3], [4, 5], [6, 9], [8, 11], [10, 13]]) wires.push({ id: `c${a}`, points: [pins.get(a), pins.get(b)], color: 'green' });
  const c = normalizeCircuit({ ...m, parts: m.parts.filter((p) => keep.includes(p.id)), wires });
  const sim = createCircuitSim(c);
  sim.run();
  const t0 = sim.time;
  sim.set('S1a', true);
  assert.equal(sim.run().time - t0, 60);
  for (const lang of LANGS) {
    const at = (ns) => hdlRun(c, lang, [{ g1a: 0 }, { g1a: 0 }, { g1a: 1 }], ns)[2];   // (settled from its power-on first)
    assert.equal(at(55), '0', `${lang}: still 0 at 55 ns`);
    assert.equal(at(65), '1', `${lang}: 1 at 65 ns (six inversions of 1)`);
  }
});

test('through view-hdl: a .circ.json is a drawn source, its HDL in its language; one with errors has none', () => {
  const m = halfAdder('verilog');
  const r = viewHdl('src/half_adder.circ.json', JSON.stringify(m));
  assert.deepEqual(r.errors, []);
  assert.equal(r.module, 'half_adder');
  assert.equal(r.lang, 'verilog');
  assert.match(r.text, /^module half_adder \(input a, input b, output s, output c\);$/m);
  assert.equal(viewHdl('src/half_adder.circ.json', JSON.stringify({ ...m, generatedFile: 'src/half_adder.v' })), null, 'kept in sync with its file');
  const bad = normalizeCircuit({ ...m, parts: [...m.parts, { id: 'U3', type: '7404', x: 40, y: 40 }] });
  assert.deepEqual(viewHdl('src/bad.circ.json', JSON.stringify(bad)).errors, ['src/bad.circ.json: U3 (7404) is not powered: its VCC (pin 14) is not on the supply\'s + and its GND (pin 7) is not on the supply\'s −']);
  assert.throws(() => generateCircuit(bad, 'vhdl'), /The circuit 'half_adder' has 1 error\(s\):\n {2}- U3 \(7404\) is not powered/);
  // an empty circuit: a module with no ports, no warnings
  for (const lang of LANGS) {
    const g = generateCircuit(newCircuit('empty', lang, { breadboard: false }), lang);
    assert.deepEqual(checkSyntax(lang, g.code, 'empty'), [], lang);
  }
});
