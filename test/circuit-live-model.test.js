// Try it running a KiCad part's module live (#4284, core/circuit-live-model.js, core/circuit-sim.js): an inverter and a
// toggle flip-flop, each in VHDL and in Verilog, run live as the circuit's generated HDL simulates them (the same outputs
// vector by vector); two parts of one module each with its own state; a module that cannot run live: its exact warning,
// its pins driving nothing; the simulation's speed with and without a modelled part
import test from 'node:test';
import assert from 'node:assert/strict';
import { kicadPartsOf } from '../core/circuit-kicad.js';
import { setProjectParts } from '../core/circuit-parts.js';
import { checkCircuit } from '../core/circuit-check.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { newCircuit, normalizeCircuit, circuitPorts } from '../core/circuit.js';
import { compile, simulate } from '../core/compile.js';
import { modelRunners, liveModel, MODEL_TPD } from '../core/circuit-live-model.js';
import { circuitBench } from './circuit-helpers.mjs';

const pin = (t, n, name) => `(pin ${t} line (name "${name}") (number "${n}"))`;
const sym = (name, hdl) => `(symbol "${name}" (property "Value" "TEST-${name}") (property "Silinx.HDL" "${hdl}") (property "Footprint" "PinHeader_1x02_P2.54mm_Vertical") (symbol "${name}_1_1" ${pin('input', 1, 'A')} ${pin('output', 2, 'Y')}))`;
const LIB = `(kicad_symbol_lib (version 20251024) ${sym('INV', 'test_inv')} ${sym('TFF', 'test_tff')} ${sym('FIN', 'm_finish')} ${sym('UNK', 'm_unknown')})`;
const VH = 'library ieee;\nuse ieee.std_logic_1164.all;\n';
const MODS = {
  vhdl: [{ path: 'inv.vhd', text: `${VH}entity test_inv is port (a : in std_logic; y : out std_logic); end entity;\narchitecture r of test_inv is begin y <= not a; end architecture;\n` },
    { path: 'tff.vhd', text: `${VH}entity test_tff is port (a : in std_logic; y : out std_logic); end entity;\narchitecture r of test_tff is\n  signal q : std_logic := '0';\nbegin\n  process (a) begin if rising_edge(a) then q <= not q; end if; end process;\n  y <= q;\nend architecture;\n` }],
  verilog: [{ path: 'inv.v', text: 'module test_inv (input a, output y);\n  assign y = ~a;\nendmodule\n' },
    { path: 'tff.v', text: 'module test_tff (input a, output y);\n  reg q = 1\'b0;\n  always @(posedge a) q <= ~q;\n  assign y = q;\nendmodule\n' }],
};
const BAD = [{ path: 'fin.v', text: 'module m_finish (input a, output y);\n  assign y = ~a;\n  initial $finish;\nendmodule\n' },
  { path: 'unk.vhd', text: `${VH}entity m_unknown is port (a : in std_logic; y : out std_logic); end entity;\narchitecture r of m_unknown is\n  component nothere port (i : in std_logic; o : out std_logic); end component;\nbegin\n  u : nothere port map (a, y);\nend architecture;\n` }];
setProjectParts(kicadPartsOf({ 'parts/m.kicad_sym': LIB }).defs);
const T = (s) => `parts/m.kicad_sym#${s}`;

// switches a[k] into the parts' inputs, LEDs y[k] on their outputs (cathodes on GND)
function circuit(lang, types) {
  const m = newCircuit('lc', lang, { breadboard: false });
  m.parts.push({ id: 'P1', type: 'supply', x: -20, y: -20 });
  types.forEach((t, k) => {
    const y = 10 * k;
    m.parts.push({ id: `U${k + 1}`, type: t, x: 0, y }, { id: `S${k + 1}`, type: 'logic-switch', x: -10, y, label: `a${k}` }, { id: `D${k + 1}`, type: 'led', x: 10, y: y + 5, label: `y${k}` });
    m.wires.push({ id: `wa${k}`, points: [[-10, y], [0, y]] }, { id: `wy${k}`, points: [[1, y], [10, y + 5]] }, { id: `wk${k}`, points: [[11, y + 5], [-20, -19]] });
  });
  return normalizeCircuit(m);
}
const live = (m, runner, vectors) => {
  const { inputs, outputs } = circuitPorts(m), sim = createCircuitSim(m, { runner });
  sim.run();
  return vectors.map((v) => { for (const i of inputs) sim.set(i.part, v[i.name] === 1); sim.run(); return outputs.map((o) => sim.outputs()[o.name]).join(''); });
};
function hdl(m, lang, vectors) {
  const { inputs, outputs } = circuitPorts(m), file = lang === 'vhdl' ? 'lc.vhd' : 'lc.v';
  const r = simulate([...MODS[lang], { path: file, text: generateCircuit(m, lang).code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name) }) }], 'tb', { until: 1e9 });
  assert.deepEqual(r.errors, []);
  return r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz]+$/.test(s));
}
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) & 1; };

test('liveModel: a module\'s inputs forced, its outputs read; its own state; modelRunners tries a module once', () => {
  const lib = compile(MODS.verilog);
  const inv = liveModel(lib, 'test_inv');
  assert.deepEqual([inv.run({ a: '0' }), inv.run({ a: '1' }), inv.run({ a: 'X' })], [{ y: '1' }, { y: '0' }, { y: 'X' }]);
  const a = liveModel(lib, 'test_tff'), b = liveModel(lib, 'test_tff');
  assert.deepEqual([a.run({ a: '0' }), a.run({ a: '1' }), a.run({ a: '0' }), a.run({ a: '1' })].map((o) => o.y), ['0', '1', '1', '0']);
  assert.deepEqual(b.run({ a: '0' }), { y: '0' }, 'another copy: its own state');
  const runner = modelRunners(lib);
  assert.equal(runner('TEST_INV'), runner('test_inv'), 'once, by its name in any case');
  assert.equal(typeof runner('test_inv').make, 'function');
  assert.equal(MODEL_TPD, 10);
});

test('live as its HDL: an inverter and a toggle flip-flop, in VHDL and in Verilog, vector by vector', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const m = circuit(lang, [T('INV'), T('TFF')]), runner = modelRunners(compile(MODS[lang]));
    assert.deepEqual(checkCircuit(m, undefined, { runner }).map((d) => d.message), [], `${lang}: no warnings`);
    // (first every input 0, as Try it's switches start: the bench's start from X is no rising edge in VHDL)
    const vectors = [{ a0: 0, a1: 0 }, ...Array.from({ length: 40 }, () => ({ a0: rnd(), a1: rnd() }))];
    const want = hdl(m, lang, vectors);
    assert.deepEqual(live(m, runner, vectors), want, lang);
    assert.ok(new Set(want.map((x) => x[1])).size === 2, 'the flip-flop toggled');
  }
});

test('two parts of one module, each its own state; the part\'s delay', () => {
  const m = circuit('verilog', [T('TFF'), T('TFF')]), runner = modelRunners(compile(MODS.verilog));
  const sim = createCircuitSim(m, { runner });
  sim.run();
  for (const v of [true, false, true]) { sim.set('S1', v); sim.run(); }
  assert.deepEqual([sim.outputs().y0, sim.outputs().y1], ['0', '0'], 'the first toggled twice, the second never');
  sim.set('S2', true);
  const r = sim.run();
  assert.deepEqual([sim.outputs().y0, sim.outputs().y1], ['0', '1']);
  assert.equal(r.time - r.start, MODEL_TPD, 'its output after the part\'s delay');
});

test('a module that cannot run live: its exact warning, its pins driving nothing', () => {
  const m = circuit('verilog', [T('FIN'), T('UNK')]), runner = modelRunners(compile(BAD));
  assert.deepEqual(checkCircuit(m, undefined, { runner }).map((d) => `${d.severity}: ${d.message}`), [
    'warning: U1 (TEST-FIN): its module m_finish cannot run in Try it: its simulation stopped (finish)',
    'warning: U2 (TEST-UNK): its module m_unknown cannot run in Try it: module/entity \'nothere\' not found (instance \'u\')']);
  const sim = createCircuitSim(m, { runner });
  sim.run();
  sim.set('S1', true); sim.set('S2', true); sim.run();
  assert.deepEqual([sim.outputs().y0, sim.outputs().y1], ['0', '0']);
});

test('the speed: a modelled inverter against a 7404\'s, 400 switch flips', (t) => {
  const flips = (m, runner) => { const sim = createCircuitSim(m, { runner }); sim.run(); const t0 = performance.now(); for (let k = 0; k < 400; k++) { sim.set('S1', k % 2 === 0); sim.run(); } return performance.now() - t0; };
  const ic = newCircuit('lc', 'verilog', { breadboard: false });
  ic.parts.push({ id: 'P1', type: 'supply', x: -20, y: -20 }, { id: 'U1', type: '7404', x: 0, y: 0 }, { id: 'S1', type: 'logic-switch', x: -10, y: 0, label: 'a0' }, { id: 'D1', type: 'led', x: 10, y: 5, label: 'y0' });
  ic.wires.push({ id: 'w1', points: [[-10, 0], [0, 0]] }, { id: 'w2', points: [[1, 0], [10, 5]] }, { id: 'w3', points: [[11, 5], [-20, -19]] }, { id: 'wv', points: [[-20, -20], [0, -3]] }, { id: 'wg', points: [[-20, -19], [6, 0]] });
  const base = flips(normalizeCircuit(ic)), model = flips(circuit('verilog', [T('INV')]), modelRunners(compile(MODS.verilog)));
  t.diagnostic(`400 flips: a 7404 ${base.toFixed(1)} ms, a modelled inverter ${model.toFixed(1)} ms`);
  assert.ok(model / 400 < 5, `a flip with a modelled part under 5 ms (${(model / 400).toFixed(3)} ms)`);
});
