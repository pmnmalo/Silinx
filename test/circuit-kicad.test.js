// A project's KiCad parts (#4280, core/circuit-kicad.js): its parts/ folder's symbols made parts (a part number or
// Silinx.Model matched pin by pin to a library IC, else drawn only on its footprint's places), on hand-written fixtures
// (test/fixtures/kicad/project/); an imported 74HC00 simulated and its HDL against the 7400's, in VHDL and in Verilog;
// a drawn-only part's warning; the symbols that are no part, and why
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kicadPartsOf, useProjectParts, partOfNumber, pinDirection, pinoutDifference, pinPlaces, symbolPins, isKicadPartFile, kicadPartType, lookOf, ledColour } from '../core/circuit-kicad.js';
import { partDef, setProjectParts, projectParts, partsList, PARTS } from '../core/circuit-parts.js';
import { readKicadSymLib } from '../core/kicad-sym.js';
import { readKicadFootprint } from '../core/kicad-mod.js';
import { partInfo } from '../core/circuit-part-info.js';
import { checkCircuit } from '../core/circuit-check.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { circuitPorts, normalizeCircuit, newCircuit, newId, circuitCounts } from '../core/circuit.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { icBench, circuitBench } from './circuit-helpers.mjs';

const FIX = new URL('./fixtures/kicad/project/', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, FIX), 'utf8');
const FILES = { 'parts/ttl.kicad_sym': read('parts/ttl.kicad_sym'), 'parts/imported.pretty/Module_1x04.kicad_mod': read('parts/imported.pretty/Module_1x04.kicad_mod') };
const T = (s) => kicadPartType('parts/ttl.kicad_sym', s);
const LIB = readKicadSymLib(FILES['parts/ttl.kicad_sym']);
const sym = (name) => LIB.symbols.find((s) => s.name === name);
beforeEach(() => setProjectParts(kicadPartsOf(FILES).defs));

test('kicadPartsOf: the project\'s symbols as parts, those that are no part and why, a note, no errors', () => {
  const r = kicadPartsOf({ ...FILES, 'src/top.vhd': 'not a part', 'parts/README.md': 'nor this' });
  assert.deepEqual(r.defs.map((d) => `${d.type} ${d.kind} ${d.behaves ?? '-'} ${d.how ?? '-'}`), [
    'parts/ttl.kicad_sym#74LS00 ic 7400 part number', 'parts/ttl.kicad_sym#74HC00 ic 7400 part number', 'parts/ttl.kicad_sym#MYNAND ic 7400 Silinx.Model',
    'parts/ttl.kicad_sym#CD4011 ic 4011 part number', 'parts/ttl.kicad_sym#74LS04 drawn - -', 'parts/ttl.kicad_sym#SENSOR drawn - -', 'parts/ttl.kicad_sym#MODULE drawn - -']);
  assert.deepEqual(r.skipped, [
    { type: T('SMDCHIP'), reason: 'its footprint Package_SO:SOIC-8_3.9x4.9mm_P1.27mm is surface-mount: it does not plug into a breadboard' },
    { type: T('NOFP'), reason: 'it has no footprint: give it Silinx.Footprint (DIP-14_W7.62mm, PinHeader_1x04_P2.54mm)' },
    { type: T('BADMODEL'), reason: "its Silinx.Model 'led' is not an IC of the library" }]);
  assert.deepEqual(r.notes, ["parts/ttl.kicad_sym: 74LS04: its part number is the 7404's but its pin 2 (no name) is input, the 7404's pin 2 (1Y) out: drawn only"]);
  assert.deepEqual(r.errors, []);
  assert.ok(!r.defs.some((d) => d.kicad.value === 'VCC'), 'a power symbol is no part');
  assert.deepEqual(kicadPartsOf({}), { defs: [], skipped: [], notes: [], errors: [] });
  assert.deepEqual(kicadPartsOf({ 'parts/bad.kicad_sym': '(kicad_symbol_lib', 'parts/x.pretty/f.kicad_mod': '(nope)' }).errors,
    ['parts/x.pretty/f.kicad_mod: not a KiCad footprint: it does not start with (footprint', 'parts/bad.kicad_sym: line 1: a "(" not closed']);
});

test('a symbol that is a library IC: the IC\'s logic, pins and places, its own name, datasheet and origin', () => {
  const d = partDef(T('74HC00')), base = PARTS['7400'];
  assert.equal(d.kind, 'ic');
  assert.equal(d.pins, base.pins);
  assert.equal(d.gates, base.gates);
  assert.deepEqual([d.chip, d.family, d.tpd, d.dip, d.behaves, d.title], ['SN74LS00', 'ttl', 10, 14, '7400', 'Quad 2-input NAND'], 'the library IC\'s title: its HDL\'s');
  assert.deepEqual(d.kicad, { library: 'parts/ttl.kicad_sym', symbol: '74HC00', value: '74HC00', description: 'quad 2-input NAND gate, HCMOS', datasheet: 'https://example.org/74hc00.pdf' });
  // Silinx.Family: another family's inputs, an entity of its own
  const my = partDef(T('MYNAND'));
  assert.deepEqual([my.family, my.chip, my.how, my.kicad.footprint], ['cmos', 'MYNAND', 'Silinx.Model', 'Package_DIP:DIP-14_W7.62mm']);
  assert.equal(partDef(T('CD4011')).gates, PARTS['4011'].gates);
  assert.deepEqual(partInfo(T('74HC00')).about, 'Behaves as the 7400 of the library (by its part number).');
  assert.equal(partInfo(T('MYNAND')).openInput, 'X');
  assert.equal(partInfo(T('74LS00')).openInput, '1');
  assert.deepEqual(partInfo(T('74HC00')).kicad, d.kicad);
});

test('a drawn-only symbol: its pins on its footprint\'s places, not simulated; its Part info', () => {
  const s = partDef(T('SENSOR'));
  assert.equal(s.kind, 'drawn');
  assert.equal(s.behaves, null);
  assert.deepEqual(s.pins, [{ n: 1, name: 'VCC', dir: 'none', kicadType: 'power_in', dx: 0, dy: 0 }, { n: 2, name: 'GND', dir: 'none', kicadType: 'power_in', dx: 1, dy: 0 },
    { n: 3, name: 'OUT', dir: 'none', kicadType: 'tri_state', dx: 2, dy: 0 }, { n: 4, name: 'EN', dir: 'none', kicadType: 'input', dx: 3, dy: 0 }]);
  assert.deepEqual(partInfo(T('SENSOR')), { type: T('SENSOR'), title: 'a sensor module', kicad: { library: 'parts/ttl.kicad_sym', symbol: 'SENSOR', value: 'TEST-SENSOR',
    description: 'a sensor module', footprint: 'Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical' }, about: 'Drawn only: not simulated, its pins drive nothing.',
  pins: [1, 2, 3, 4].map((n, i) => ({ n, name: ['VCC', 'GND', 'OUT', 'EN'][i], role: 'not simulated', kicadType: ['power_in', 'power_in', 'tri_state', 'input'][i] })) });
  // its footprint's file: the pads turned as a DIP lies (KiCad's rows down, Silinx's along the board), the pad off the grid not a pin
  assert.deepEqual(partDef(T('MODULE')).pins.map((p) => [p.n, p.dx, p.dy]), [[1, 0, 0], [2, 0, -1], [3, 0, -2], [4, 0, -3]]);
  // a 7404 whose pins are not the 7404's: a DIP-14 by its filter, its highest pin's
  assert.deepEqual(partDef(T('74LS04')).pins.map((p) => [p.n, p.dx, p.dy]), [[1, 0, 0], [2, 1, 0], [7, 6, 0], [14, 0, -3]]);
  assert.equal(partDef(T('74LS04')).dip, 14);
});

test('partOfNumber: 74xx and 4000 part numbers, their families\' letters, prefixes and packages', () => {
  const cases = { SN74LS00N: '7400', '74HC00': '7400', '74HCT00D': '7400', DM7400N: '7400', '74LS138': '74138', 'SN74LS161AN': '74161', '74F04': '7404', 'CD74HC04E': '7404',
    'MC74ACT08': '7408', '7486': '7486', CD4011BE: '4011', HEF4071BP: '4071', '4017': '4017', MC14081B: '4081', 'Lib:74LS32': '7432', 'sn74ls00n': '7400' };
  for (const [n, t] of Object.entries(cases)) assert.equal(partOfNumber(n), t, n);
  for (const n of ['74HC4052D', '74LS999', 'NE555', 'ATMEGA328P', '', null, '4000', 'LM7400', 'X74LS00']) assert.equal(partOfNumber(n), null, String(n));
});

test('pinDirection and pinoutDifference: the first difference said', () => {
  const p = (type, name = '') => ({ type, name });
  assert.deepEqual([p('input'), p('output'), p('open_collector'), p('no_connect'), p('power_in', 'VCC'), p('power_in', 'VDD'), p('power_in', 'GND'), p('power_in', 'VSS'),
    p('power_in', 'VREF'), p('tri_state'), p('bidirectional'), p('passive')].map(pinDirection), ['in', 'out', 'oc', 'nc', 'vcc', 'vcc', 'gnd', 'gnd', null, null, null, null]);
  assert.equal(pinoutDifference(sym('74LS00'), '7400'), null);
  assert.equal(pinoutDifference(sym('74LS00'), '7408'), null, 'the same pins: a 7408\'s are a 7400\'s');
  assert.equal(pinoutDifference(sym('74LS00'), '7402'), "its pin 1 (no name) is input, the 7402's pin 1 (1Y) out");
  assert.equal(pinoutDifference(sym('CD4011'), '7400'), "its pin 4 (no name) is output, the 7400's pin 4 (2A) in", 'a 4011\'s second gate is not a 7400\'s')
  assert.equal(pinoutDifference(sym('74LS04'), '7404'), "its pin 2 (no name) is input, the 7404's pin 2 (1Y) out");
  assert.equal(pinoutDifference(sym('SENSOR'), '7400'), "its pin 1 (VCC) is power_in, the 7400's pin 1 (1A) in");
  assert.equal(pinoutDifference(sym('SMDCHIP'), '7404'), "its pin 2 is missing (the 7404's 1Y)");
  const extra = { pins: [...sym('74LS00').pins, { number: '15', name: 'X', type: 'input', body: 1, unit: 1 }] };
  assert.equal(pinoutDifference(extra, '7400'), "its pin 15 is not one of the 7400's 14");
  assert.deepEqual(symbolPins(sym('74LS00')).map((x) => x.number), ['1', '2', '3', '4', '5', '6', '9', '10', '8', '12', '13', '11', '14', '7']);
});

test('pinPlaces: a footprint\'s name (DIP, headers), its file; what has none', () => {
  const s = (pins, props) => ({ name: 'X', pins: pins.map((n) => ({ number: String(n), name: '', type: 'input', unit: 1, body: 1 })), properties: props });
  const places = (r) => [...r.places].map(([n, q]) => `${n}:${q.dx},${q.dy}`).join(' ');
  assert.equal(places(pinPlaces(s([1, 2, 3, 4], { Footprint: 'PinHeader_1x04_P2.54mm_Vertical' }))), '1:0,0 2:1,0 3:2,0 4:3,0');
  assert.equal(places(pinPlaces(s([1, 2, 3, 4, 5, 6], { Footprint: 'PinHeader_2x03_P2.54mm_Vertical' }))), '1:0,0 2:0,-1 3:1,0 4:1,-1 5:2,0 6:2,-1');
  assert.equal(places(pinPlaces(s([1, 8], { 'Silinx.Footprint': 'DIP-8_W7.62mm', Footprint: 'Package_SO:SOIC-8' }))), '1:0,0 2:1,0 3:2,0 4:3,0 5:3,-3 6:2,-3 7:1,-3 8:0,-3');
  assert.equal(pinPlaces(s([1, 8], { Footprint: 'DIP-8_W15.24mm' })).places.get('8').dy, -6);
  assert.deepEqual(pinPlaces(s([1, 9], { Footprint: 'DIP-8_W7.62mm' })), { error: 'its pin 9 is not one of its footprint DIP-8_W7.62mm\'s 8' });
  assert.deepEqual(pinPlaces(s([1], { Footprint: 'PinHeader_1x03_P2.00mm_Vertical' })), { error: 'its footprint PinHeader_1x03_P2.00mm_Vertical\'s pins are 2 mm apart, not a breadboard\'s 2.54' });
  assert.deepEqual(pinPlaces(s([1], { Footprint: 'Resistor_THT:R_Axial' })), { error: 'its footprint Resistor_THT:R_Axial is not in the project\'s parts nor a DIP or a pin header' });
  assert.deepEqual(pinPlaces(s([1], { ki_fp_filters: 'SO14*' })), { error: 'it has no footprint: give it Silinx.Footprint (DIP-14_W7.62mm, PinHeader_1x04_P2.54mm)' });
  const fp = new Map([['M', readKicadFootprint(FILES['parts/imported.pretty/Module_1x04.kicad_mod'])]]);
  assert.deepEqual(pinPlaces(s([1, 5], { Footprint: 'lib:M' }), fp), { error: 'its pin 5\'s pad is off the 0.1 inch grid' });
  assert.deepEqual(pinPlaces(s([1, 7], { Footprint: 'M' }), fp), { error: 'its pin 7 has no pad in its footprint Module_1x04' });
  const smd = new Map([['S', readKicadFootprint('(footprint "S" (pad "1" smd rect (at 0 0)))')]]);
  assert.deepEqual(pinPlaces(s([1], { Footprint: 'S' }), smd), { error: 'its footprint S is surface-mount: it does not plug into a breadboard' });
});

// ------------------------------------------------------------------ in a circuit
const LANGS = ['vhdl', 'verilog'];
const file = (lang) => (lang === 'vhdl' ? 'dut.vhd' : 'dut.v');
const hdlDiags = (lang, code, top) => { const lib = compile([{ path: file(lang), text: code }]); const d = elaborate(lib, top); return [...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => `${e.severity}: ${e.message}`); };
function hdlRun(m, lang, vectors) {
  const { inputs, outputs } = circuitPorts(m);
  const r = simulate([{ path: file(lang), text: generateCircuit(m, lang).code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name) }) }], 'tb', { until: 1e9 });
  assert.deepEqual(r.errors, []);
  return r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz]+$/.test(s));
}
function engineRun(m, vectors) {
  const { inputs, outputs } = circuitPorts(m), sim = createCircuitSim(m);
  sim.run();
  return vectors.map((v) => { for (const i of inputs) sim.set(i.part, v[i.name] === 1); sim.run(); return outputs.map((o) => sim.outputs()[o.name]).join(''); });
}
const VECTORS = Array.from({ length: 16 }, (_, k) => Object.fromEntries(['g1a', 'g1b', 'g2a', 'g2b', 'g3a', 'g3b', 'g4a', 'g4b'].map((n, j) => [n, ((k * 7 + 3) >> (j % 4)) & 1])));

test('an imported 74HC00: simulated as the 7400, its HDL the 7400\'s but its header, in VHDL and in Verilog, no warnings', () => {
  const ref = icBench('7400', { name: 'bench' }), hc = icBench(T('74HC00'), { name: 'bench' });
  assert.deepEqual(checkCircuit(hc), checkCircuit(ref), 'the same checks: none');
  assert.deepEqual(checkCircuit(hc), []);
  const want = engineRun(ref, VECTORS);
  assert.deepEqual(engineRun(hc, VECTORS), want);
  for (const lang of LANGS) {
    const a = generateCircuit(ref, lang).code.split('\n'), b = generateCircuit(hc, lang).code.split('\n');
    const at = a.findIndex((l) => /Parts {7}:/.test(l));
    assert.equal(a[at].replace(/^.. /, ''), 'Parts       : U1 (SN74LS00)');
    assert.equal(b[at].replace(/^.. /, ''), 'Parts       : U1 (74HC00, as the SN74LS00)');
    assert.deepEqual(b.filter((_, k) => k !== at), a.filter((_, k) => k !== at), `${lang}: the same HDL`);
    assert.deepEqual(hdlDiags(lang, b.join('\n'), 'bench'), [], `${lang}: no warnings`);
    assert.deepEqual(hdlRun(hc, lang, VECTORS), want, lang);
  }
});

test('a 7400 and a 74HC00 in one circuit: one entity; Silinx.Family cmos: an entity of its own, its inputs a 4000\'s', () => {
  const m = icBench('7400', { name: 'two' });
  m.parts.push({ id: 'U2', type: T('74HC00'), x: 0, y: 20 }, { id: 'U3', type: T('MYNAND'), x: 0, y: 30 });
  // unpowered: the checks name them by their part number
  assert.deepEqual(checkCircuit(normalizeCircuit(m)).map((d) => d.message).filter((x) => /^U[23] /.test(x)), [
    "U2 (74HC00) is not powered: its VCC (pin 14) is not on the supply's + and its GND (pin 7) is not on the supply's −",
    "U3 (MYNAND) is not powered: its VCC (pin 14) is not on the supply's + and its GND (pin 7) is not on the supply's −"]);
  m.wires.push({ id: 'v1', points: [[-20, -20], [0, 17]] }, { id: 'v2', points: [[-20, -19], [6, 20]] }, { id: 'v3', points: [[-20, -20], [0, 27]] }, { id: 'v4', points: [[-20, -19], [6, 30]] });
  for (const lang of LANGS) {
    const code = generateCircuit(normalizeCircuit(m), lang).code;
    assert.equal(code.match(lang === 'vhdl' ? /^entity two_sn74ls00 is/mg : /^module two_sn74ls00 /mg).length, 1, lang);
    assert.equal(code.match(lang === 'vhdl' ? /^entity two_mynand is/mg : /^module two_mynand /mg).length, 1, lang);
    assert.match(code, /Parts {7}: U1 \(SN74LS00\), U2 \(74HC00, as the SN74LS00\), U3 \(MYNAND, as the MYNAND\)/);
  }
});

test('a drawn-only part in a circuit: its warning, nothing driven, its HDL made without it, in VHDL and in Verilog', () => {
  const m = newCircuit('drawn', 'vhdl', { breadboard: false });
  m.parts.push({ id: 'M1', type: T('SENSOR'), x: 0, y: 0 }, { id: 'LP1', type: 'probe', x: 2, y: 5 }, { id: 'P1', type: 'supply', x: -10, y: 0 });
  m.wires.push({ id: 'w1', points: [[-10, 0], [0, 0]], color: 'red' }, { id: 'w2', points: [[-10, 1], [1, 0]], color: 'black' }, { id: 'w3', points: [[2, 0], [2, 5]], color: 'blue' });
  const c = normalizeCircuit(m);
  assert.deepEqual(checkCircuit(c).map((d) => `${d.severity}: ${d.message}`), ['warning: M1 (TEST-SENSOR) is drawn only: it is not simulated and its pins drive nothing']);
  const sim = createCircuitSim(c);
  sim.run();
  assert.equal(sim.probes().LP1, 'Z', 'its OUT pin drives nothing');
  for (const lang of LANGS) {
    const g = generateCircuit(c, { ...c, lang }.lang);
    assert.match(g.code, /Parts {7}: M1 \(TEST-SENSOR, drawn only\)/);
    assert.deepEqual(hdlDiags(lang, generateCircuit({ ...c, lang }, lang).code, 'drawn'), [], lang);
  }
  assert.equal(newId(c, T('SENSOR')), 'U1');
  assert.equal(circuitCounts(c), '1 IC(s) · 0 input(s) · 0 display(s) · 3 wire(s)');
});

test('setProjectParts: the project\'s parts replaced; a part of another project unknown; partsList lists them after the library', () => {
  assert.equal(projectParts().length, 7);
  const list = partsList();
  assert.deepEqual(list.slice(-7).map((p) => [p.type, p.behavesAs]), [[T('74LS00'), '7400'], [T('74HC00'), '7400'], [T('MYNAND'), '7400'], [T('CD4011'), '4011'], [T('74LS04'), null], [T('SENSOR'), null], [T('MODULE'), null]]);
  assert.equal(list.find((p) => p.type === '7400').kicad, undefined);
  setProjectParts([]);
  assert.equal(partDef(T('74HC00')), null);
  assert.equal(partsList().length, list.length - 7);
  const m = icBench('7400', { name: 'gone' });
  m.parts[0].type = T('74HC00');
  assert.deepEqual(checkCircuit(normalizeCircuit(m)).filter((d) => d.severity === 'error').map((d) => d.message)[0], `U1: no part '${T('74HC00')}' in the library`);
  assert.equal(partDef('7400'), PARTS['7400'], 'the library\'s parts first, always');
});

test('useProjectParts: the parts/ files of a project read through its store, the others left out', async () => {
  const tree = [...Object.keys(FILES), 'src/top.vhd', 'parts/notes.txt', 'parts/deep/x.kicad_sym'];
  const asked = [];
  const P = { fileTree: async () => tree, readFile: async (_n, f) => { asked.push(f); return FILES[f] ?? ''; } };
  setProjectParts([]);
  const r = await useProjectParts(P, 'p');
  assert.deepEqual(asked, Object.keys(FILES));
  assert.equal(r.defs.length, 7);
  assert.equal(projectParts().length, 7);
  assert.deepEqual(['parts/a.kicad_sym', 'parts/l.kicad_symdir/s.kicad_sym', 'parts/f.pretty/x.kicad_mod', 'parts/A.KICAD_SYM'].map(isKicadPartFile), [true, true, true, true]);
  assert.deepEqual(['parts/deep/x.kicad_sym', 'src/a.kicad_sym', 'parts/a.lib', 'parts/l.kicad_symdir/s.txt'].map(isKicadPartFile), [false, false, false, false]);
});

test('a .kicad_symdir folder of the project: its symbols, a part number matched', () => {
  const dir = 'parts/logic.kicad_symdir';
  const one = '(kicad_symbol_lib (version 20251024) (generator "t") (symbol "74LS08" (property "Value" "74LS08") (property "ki_fp_filters" "DIP*W7.62mm*") '
    + `${[[1, 2, 3], [4, 5, 6], [9, 10, 8], [12, 13, 11]].map(([a, b, y], i) => `(symbol "74LS08_${i + 1}_1" (pin input line (name "") (number "${a}")) (pin input line (name "") (number "${b}")) (pin output line (name "") (number "${y}")))`).join(' ')}`
    + ' (symbol "74LS08_5_0" (pin power_in line (name "VCC") (number "14")) (pin power_in line (name "GND") (number "7")))))';
  const two = '(kicad_symbol_lib (version 20251024) (symbol "74HCT08" (extends "74LS08") (property "Value" "74HCT08")))';
  const r = kicadPartsOf({ [`${dir}/74LS08.kicad_sym`]: one, [`${dir}/74HCT08.kicad_sym`]: two });
  assert.deepEqual(r.defs.map((d) => [d.type, d.behaves]), [[`${dir}#74LS08`, '7408'], [`${dir}#74HCT08`, '7408']]);
  assert.deepEqual([r.skipped, r.notes, r.errors], [[], [], []]);
});

test('a drawn-only part\'s look (#4315): its footprint\'s drawing in grid steps from pad 1, turned as its pins; none with no footprint file; an LED\'s colour', () => {
  const led = fs.readFileSync(new URL('../parts.pretty/LED_D5.0mm_test.kicad_mod', FIX), 'utf8');
  const lib = `(kicad_symbol_lib (version 20231120) (generator "silinx_test")
  (symbol "LED_Red_5mm" (property "Reference" "D") (property "Value" "Red") (property "Description" "Light emitting diode, 5 mm")
    (property "ki_keywords" "LED") (property "Footprint" "leds:LED_D5.0mm_test")
    (symbol "LED_Red_5mm_1_1" (pin passive line (at 0 0 0) (length 2.54) (name "K") (number "1")) (pin passive line (at 0 0 0) (length 2.54) (name "A") (number "2")))))`;
  const r = kicadPartsOf({ 'parts/leds.kicad_sym': lib, 'parts/leds.pretty/LED_D5.0mm_test.kicad_mod': led });
  assert.deepEqual([r.errors, r.skipped], [[], []]);
  const d = r.defs[0];
  assert.equal(d.kind, 'drawn');
  // (pad 2 at 2.54 mm right of pad 1: one step up once turned, as the pins)
  assert.deepEqual(d.pins.map((p) => [p.n, p.dx, p.dy]), [[1, 0, 0], [2, 0, -1]]);
  assert.equal(d.look.layer, 'F.Fab');
  assert.deepEqual(d.look.shapes.map((sh) => sh.k), ['circle', 'arc', 'line', 'poly', 'poly']);
  const r2 = (v) => Math.round(v * 1000) / 1000;
  const [circle, , line] = d.look.shapes;
  assert.deepEqual([circle.c.map(r2), r2(circle.r), r2(circle.w), circle.fill], [[0, -0.5], 0.984, 0.039, false]);
  assert.deepEqual(line.pts.map((q) => q.map(r2)), [[-0.591, 0.484], [0.591, 0.484]]);
  assert.equal(lookOf(readKicadFootprint(fs.readFileSync(new URL('../parts.pretty/Module_1x04.kicad_mod', FIX), 'utf8'))), null);
  // a footprint known by its name only (no file): no look
  assert.equal(partDef(T('SENSOR')).look, undefined);
  // the LED's colour: by its value, symbol or description, for an LED only
  assert.equal(ledColour(d.kicad), 'red');
  assert.equal(ledColour({ symbol: 'LED_5mm', value: 'Green', keywords: 'LED' }), 'green');
  assert.equal(ledColour({ symbol: 'LED-RGB', value: 'RGB', description: 'LED' }), null);
  assert.equal(ledColour({ symbol: 'Wire', value: 'Red' }), null);
  assert.equal(ledColour({ symbol: 'LEDGER', value: 'Blue' }), null);
});
