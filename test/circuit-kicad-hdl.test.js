// A KiCad part modelled by a module of the project (#4283, core/circuit-kicad-hdl.js): its pins as the module's ports
// (by their names, by Silinx.Ports), what it refuses; a circuit with it: its generated HDL instantiating the module in
// its simulation's model and its digital one, compiled, elaborated and simulated with the module, in VHDL and in
// Verilog, no warnings; its checks against the project's modules (a module missing, ports and pins, directions, widths)
// and Try it's warning, exactly
import test from 'node:test';
import assert from 'node:assert/strict';
import { kicadPartsOf } from '../core/circuit-kicad.js';
import { modelPins, portsProperty } from '../core/circuit-kicad-hdl.js';
import { setProjectParts, partDef } from '../core/circuit-parts.js';
import { checkCircuit } from '../core/circuit-check.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { partInfo } from '../core/circuit-part-info.js';
import { newCircuit, normalizeCircuit, circuitPorts } from '../core/circuit.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { synthesisText } from '../core/translate-off.js';
import { modulesFromLibrary } from '../core/schdoc.js';
import { circuitBench } from './circuit-helpers.mjs';

const pin = (t, n, name) => `(pin ${t} line (name "${name}") (number "${n}"))`;
const sym = (name, props, pins) => `(symbol "${name}" ${Object.entries(props).map(([k, v]) => `(property "${k}" "${v}")`).join(' ')} (symbol "${name}_1_1" ${pins.join(' ')}))`;
const INV = sym('INV', { Value: 'TEST-INV', 'Silinx.HDL': 'test_inv', Footprint: 'PinHeader_1x04_P2.54mm_Vertical' },
  [pin('input', 1, 'A'), pin('output', 2, 'Y'), pin('power_in', 3, 'VCC'), pin('power_in', 4, 'GND')]);
const LIB = `(kicad_symbol_lib (version 20251024) ${INV})`;
const T = 'parts/m.kicad_sym#INV';
const MOD = {
  vhdl: { path: 'test_inv.vhd', text: 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity test_inv is\n  port (\n    a : in std_logic;\n    y : out std_logic\n  );\nend entity test_inv;\n\narchitecture rtl of test_inv is\nbegin\n  y <= not a;\nend architecture rtl;\n' },
  verilog: { path: 'test_inv.v', text: '`timescale 1ns / 1ps\n\nmodule test_inv (\n  input a,\n  output y\n);\n  assign y = ~a;\nendmodule\n' },
};
const modulesOf = (src) => modulesFromLibrary(compile([src]), { sources: { [src.path]: src.text } });

// a switch into the module's input, an LED on its output
function circuit(lang) {
  const m = newCircuit('mc', lang, { breadboard: false });
  m.parts.push({ id: 'U1', type: T, x: 0, y: 0 }, { id: 'S1', type: 'logic-switch', x: -10, y: 0, label: 'a' }, { id: 'D1', type: 'led', x: 10, y: 5, label: 'y' }, { id: 'P1', type: 'supply', x: -20, y: -20 });
  m.wires.push({ id: 'w1', points: [[-10, 0], [0, 0]] }, { id: 'w2', points: [[1, 0], [10, 5]] }, { id: 'w3', points: [[11, 5], [-20, -19]] });
  return normalizeCircuit(m);
}

test('modelPins and portsProperty: the ports by name, overbar, Silinx.Ports; supply pins none; what it refuses', () => {
  const places = new Map(['1', '2', '3', '4'].map((n, i) => [n, { dx: i, dy: 0 }]));
  const p = (number, type, name) => ({ number, type, name });
  const r = modelPins([p('1', 'input', 'A'), p('2', 'output', '~{Q}'), p('3', 'power_in', 'VCC'), p('4', 'tri_state', 'DATA')], { 'Silinx.HDL': 'Ctl' }, places);
  assert.equal(r.module, 'Ctl');
  assert.deepEqual(r.pins.map((q) => [q.n, q.dir, q.port ?? null]), [[1, 'in', 'a'], [2, 'out', 'q_n'], [3, 'none', null], [4, 'out', 'data']]);
  assert.deepEqual(modelPins([p('1', 'input', 'A+')], { 'Silinx.HDL': 'x', 'Silinx.Ports': '1=ap' }, places).pins.map((q) => q.port), ['ap']);
  assert.deepEqual([...portsProperty(' 1 = a , 2=Y ')], [['1', 'a'], ['2', 'y']]);
  assert.deepEqual([...portsProperty(undefined)], []);
  const no = (pins, props, msg) => assert.deepEqual(modelPins(pins, { 'Silinx.HDL': 'm', ...props }, places), { error: msg });
  no([p('1', 'bidirectional', 'D')], {}, 'its pin 1 (D) is bidirectional: a module\'s port is an input or an output');
  no([p('1', 'passive', 'D')], {}, 'its pin 1 (D) is passive: a module\'s port is an input or an output');
  no([p('1', 'input', 'A+')], {}, 'its pin 1\'s name \'A+\' is not an HDL name: give it one in Silinx.Ports (1=a)');
  no([p('1', 'input', 'IN')], {}, 'its pin 1\'s name \'IN\' is not an HDL name: give it one in Silinx.Ports (1=a)');
  no([p('1', 'input', 'A'), p('2', 'input', 'a')], {}, 'its pins 1 and 2 are both the port a');
  no([p('1', 'power_in', 'VCC')], {}, 'it has no pin that is an input or an output: no port for its module');
  no([p('1', 'input', 'A')], { 'Silinx.Ports': '1:a' }, 'its Silinx.Ports \'1:a\' is not a list of pin=port (1=a, 2=y)');
  assert.deepEqual(modelPins([p('1', 'input', 'A')], { 'Silinx.HDL': '9x' }, places), { error: 'its Silinx.HDL \'9x\' is not an HDL name' });
});

test('the part: kind model, its module, its pins on its footprint; Part info; Silinx.HDL before a part number', () => {
  const r = kicadPartsOf({ 'parts/m.kicad_sym': LIB.replace('"TEST-INV"', '"74LS04"') });
  assert.deepEqual([r.skipped, r.notes, r.errors], [[], [], []]);
  const d = r.defs[0];
  assert.deepEqual([d.kind, d.module, d.behaves, d.kicad.hdl], ['model', 'test_inv', null, 'test_inv'], 'its Silinx.HDL, not the 7404 its number is');
  assert.deepEqual(d.pins.map((q) => [q.n, q.dir, q.port ?? null, q.dx, q.dy]), [[1, 'in', 'a', 0, 0], [2, 'out', 'y', 1, 0], [3, 'none', null, 2, 0], [4, 'none', null, 3, 0]]);
  setProjectParts(r.defs);
  assert.equal(partInfo(T).about, 'Simulated by the project\'s module test_inv in the HDL (Try it does not run it).');
  assert.deepEqual(partInfo(T).pins.map((q) => q.port ?? null), ['a', 'y', null, null]);
  assert.deepEqual(kicadPartsOf({ 'parts/m.kicad_sym': LIB.replace('PinHeader_1x04_P2.54mm_Vertical', 'SOIC-8') }).skipped[0].reason, 'its footprint SOIC-8 is surface-mount: it does not plug into a breadboard');
  setProjectParts([]);
});

test('its checks: with the module, without the project\'s modules, a module missing, ports, directions, widths', () => {
  setProjectParts(kicadPartsOf({ 'parts/m.kicad_sym': LIB }).defs);
  const m = circuit('vhdl');
  const say = (modules) => checkCircuit(m, undefined, { modules }).map((x) => `${x.severity}: ${x.message}`);
  const WARN = 'warning: U1 (TEST-INV) is simulated by its module test_inv in the HDL only: Try it does not run it';
  assert.deepEqual(say(modulesOf(MOD.vhdl)), [WARN]);
  assert.deepEqual(say(modulesOf(MOD.verilog)), [WARN]);
  assert.deepEqual(say(null), [WARN], 'the project\'s modules not at hand: the warning only');
  assert.deepEqual(say({}), [WARN, 'error: U1 (TEST-INV): no module \'test_inv\' in the project']);
  assert.deepEqual(say({ TEST_INV: { ports: [{ name: 'a', dir: 'in', width: 1 }, { name: 'z', dir: 'out', width: 1 }] } }), [WARN,
    'error: U1 (TEST-INV): its module test_inv has no port y (its pin 2)', 'error: U1 (TEST-INV): its module test_inv\'s port z has no pin']);
  assert.deepEqual(say({ test_inv: { ports: [{ name: 'a', dir: 'out', width: 1 }, { name: 'y', dir: 'out', width: 4 }] } }), [WARN,
    'error: U1 (TEST-INV): its pin 1 (A) is an input, its module test_inv\'s port a an output', 'error: U1 (TEST-INV): its module test_inv\'s port y is 4 bits wide, a pin one']);
  // Try it: nothing driven by it
  const sim = createCircuitSim(m);
  sim.run();
  assert.equal(sim.outputs().y, '0', 'its LED off: nothing drives it');
  setProjectParts([]);
});

test('its generated HDL: the module instantiated in both models; compiled with it, simulated, in VHDL and in Verilog, no warnings', () => {
  setProjectParts(kicadPartsOf({ 'parts/m.kicad_sym': LIB }).defs);
  for (const lang of ['vhdl', 'verilog']) {
    const m = circuit(lang), g = generateCircuit(m, lang), V = lang === 'vhdl', file = V ? 'mc.vhd' : 'mc.v';
    assert.match(g.code, /Parts {7}: U1 \(TEST-INV, by its module test_inv\)/);
    assert.equal(g.code.split('\n').filter((l) => (V ? /: entity work\.test_inv port map \(a => \w+, y => \w+\);$/ : /^\s*test_inv \w+ \(\.a\(\w+\), \.y\(\w+\)\);$/).test(l)).length, 2, `${lang}: an instance in each model`);
    assert.doesNotMatch(g.code, V ? /entity test_inv is/ : /^module test_inv/m, 'the module is the project\'s, not the circuit file\'s');
    // compiled and elaborated with the module, no warnings; its digital model as synthesis reads it too
    const lib = compile([MOD[lang], { path: file, text: g.code }]), d = elaborate(lib, 'mc');
    assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => `${e.severity}: ${e.message}`), [], `${lang}: no warnings`);
    const syn = compile([MOD[lang], { path: file, text: synthesisText(g.code) }]), ds = elaborate(syn, 'mc');
    assert.deepEqual([...syn.errors, ...ds.diags].map((e) => e.message), [], `${lang}: its digital model`);
    // simulated: y is not a
    const { inputs, outputs } = circuitPorts(m);
    const vectors = [{ a: 0 }, { a: 1 }, { a: 0 }, { a: 1 }];
    const r = simulate([MOD[lang], { path: file, text: g.code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name) }) }], 'tb', { until: 1e9 });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz]+$/.test(s)), ['1', '0', '1', '0'], lang);
  }
  setProjectParts([]);
});
