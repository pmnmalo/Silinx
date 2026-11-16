// KiCad's symbol libraries (#4279): core/kicad-sym.js on hand-written fixtures (test/fixtures/kicad/) of KiCad 6's,
// KiCad 8's and KiCad 10's syntax, a .kicad_symdir folder, derived symbols, and what it refuses
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { readKicadSymLib, readKicadSymbols, readKicadSymDir, resolveSymbols, unitPins, footprintFilters, pinText, KICAD_SYM_VERSION, PIN_TYPES, PIN_STYLES } from '../core/kicad-sym.js';

const FIX = new URL('./fixtures/kicad/', import.meta.url);
const read = (name) => readFileSync(new URL(name, FIX), 'utf8');
const bySym = (lib) => Object.fromEntries(lib.symbols.map((s) => [s.name, s]));
const numbers = (pins) => pins.map((p) => p.number);

test('readKicadSymLib: a KiCad 8 library: its header, its symbols, no warnings but the unknown pin type', () => {
  const lib = readKicadSymLib(read('gates.kicad_sym'));
  assert.equal(lib.version, 20231120);
  assert.equal(lib.generator, 'silinx_test');
  assert.deepEqual(lib.symbols.map((s) => s.name), ['TEST7400', 'TEST74HC00', 'TESTFF', 'TESTVCC']);
  assert.deepEqual(lib.warnings, ["TESTFF: pin 6 has an unknown electrical type 'magic', read as unspecified"]);
});

test('a multi-unit gate: its properties, its four gates and its power unit, its De Morgan body', () => {
  const s = bySym(readKicadSymLib(read('gates.kicad_sym'))).TEST7400;
  assert.deepEqual(s.properties, { Reference: 'U', Value: 'TEST7400', Footprint: '', Datasheet: 'https://example.org/test7400.pdf',
    Description: 'quad 2-input NAND gate', ki_keywords: 'TTL nand 2-input', ki_fp_filters: 'DIP*W7.62mm* SO14*' });
  assert.equal(s.units, 5);
  assert.equal(s.demorgan, true);
  assert.equal(s.power, null);
  assert.equal(s.extends, null);
  assert.deepEqual(footprintFilters(s), ['DIP*W7.62mm*', 'SO14*']);
  assert.deepEqual(numbers(unitPins(s, 1)), ['1', '2', '3']);
  assert.deepEqual(unitPins(s, 1).map((p) => `${p.type}/${p.style}`), ['input/line', 'input/line', 'output/inverted']);
  assert.deepEqual(unitPins(s, 1, 2).map((p) => `${p.type}/${p.style}`), ['input/inverted', 'input/inverted', 'output/line'], 'the De Morgan body');
  assert.deepEqual(numbers(unitPins(s, 3)), ['8', '9', '10']);
  assert.deepEqual(unitPins(s, 5).map((p) => `${p.number} ${p.name} ${p.type} ${p.body}`), ['14 VCC power_in 0', '7 GND power_in 0'], 'the power unit, both bodies');
  assert.deepEqual(unitPins(s, 5, 2).map((p) => p.number), ['14', '7']);
  const p1 = s.pins[0];
  assert.deepEqual(p1, { number: '1', name: '', type: 'input', style: 'line', unit: 1, body: 1, x: -7.62, y: 2.54, rot: 0, length: 3.81, hidden: false, alternates: [] });
  // every pin of the chip once in each body
  assert.deepEqual([...new Set(s.pins.filter((p) => p.body !== 2).map((p) => Number(p.number)))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.deepEqual(s.graphics.map((g) => `${g.kind} ${g.unit}/${g.body} ${g.fill}`), ['arc 1/1 background', 'polyline 1/1 background', 'rectangle 5/1 background']);
  assert.deepEqual(s.graphics[0].mid, { x: 3.81, y: 0 });
  assert.deepEqual(s.graphics[1].pts, [{ x: 0, y: 3.81 }, { x: -3.81, y: 3.81 }, { x: -3.81, y: -3.81 }, { x: 0, y: -3.81 }]);
  assert.deepEqual(s.graphics[2].start, { x: -5.08, y: 7.62 });
});

test('a derived symbol: its parent\'s pins, units and graphics, its own properties over its parent\'s', () => {
  const { TEST7400: base, TEST74HC00: hc } = bySym(readKicadSymLib(read('gates.kicad_sym')));
  assert.equal(hc.extends, 'TEST7400');
  assert.equal(hc.units, 5);
  assert.equal(hc.demorgan, true);
  assert.equal(hc.pins, base.pins);
  assert.equal(hc.graphics, base.graphics);
  assert.deepEqual(hc.properties, { ...base.properties, Value: 'TEST74HC00', Datasheet: 'https://example.org/test74hc00.pdf', ki_keywords: 'HCMOS nand 2-input' });
  assert.equal(base.properties.Value, 'TEST7400', 'the parent is left as it is');
});

test('pins: names with overbars, hidden, alternates, clock and low styles, tri-state and bidirectional; flags and units', () => {
  const { TESTFF: ff, TESTVCC: vcc } = bySym(readKicadSymLib(read('gates.kicad_sym')));
  assert.deepEqual(ff.pins.map((p) => `${p.number}:${p.name}:${p.type}:${p.style}:${p.hidden}`),
    ['1:C:input:clock:false', '2:~{CLR}:input:input_low:false', '3:Q:tri_state:line:false', '4:D:bidirectional:line:false', '5:~:no_connect:line:true', '6:X:unspecified:line:false']);
  assert.deepEqual(ff.pins[3].alternates, [{ name: 'SDA', type: 'bidirectional', style: 'line' }, { name: 'TX', type: 'output', style: 'line' }]);
  assert.deepEqual(pinText(ff.pins[1].name), { text: 'CLR', low: true });
  assert.deepEqual(pinText('~'), { text: '', low: false });
  assert.deepEqual(pinText('~{A}B'), { text: '~{A}B', low: false }, 'only a whole name overlined');
  assert.deepEqual(pinText(undefined), { text: '', low: false });
  assert.equal(ff.hidePinNames, true);
  assert.equal(ff.hidePinNumbers, true);
  assert.deepEqual(ff.unitNames, { 1: 'flip-flop' });
  assert.equal(ff.units, 1);
  assert.equal(ff.properties['Sim.Device'], 'SPICE', 'SPICE fields are properties as any other');
  assert.deepEqual(ff.graphics.map((g) => g.kind), ['rectangle', 'circle', 'text']);
  assert.equal(ff.graphics[1].radius, 0.5);
  assert.deepEqual([ff.graphics[2].text, ff.graphics[2].rot], ['FF', 900]);
  assert.equal(vcc.power, 'global');
  assert.equal(vcc.pins[0].hidden, true);
  assert.equal(vcc.hidePinNames, false);
});

test('a KiCad 6 library: properties with ids, bare hide flags, (power), units common to both bodies, escapes', () => {
  const lib = readKicadSymLib(read('kicad6.kicad_sym'));
  assert.equal(lib.version, 20211014);
  assert.equal(lib.generator, 'kicad_symbol_editor');
  assert.deepEqual(lib.warnings, []);
  const { TEST7404: inv, TESTGND: gnd } = bySym(lib);
  assert.equal(inv.properties.Footprint, 'Package_DIP:DIP-14_W7.62mm');
  assert.equal(inv.properties.Description, 'hex "inverter"\\buffer');
  assert.equal(inv.units, 7);
  assert.equal(inv.demorgan, false);
  assert.deepEqual(inv.pins.map((p) => `${p.number} ${p.unit}/${p.body} ${p.hidden}`), ['1 1/0 false', '2 1/0 true', '14 7/0 false', '7 7/0 false']);
  assert.deepEqual(numbers(unitPins(inv, 1)), ['1', '2']);
  assert.equal(gnd.power, 'global');
  assert.deepEqual(gnd.graphics.map((g) => `${g.kind} ${g.unit}`), ['polyline 0']);
  assert.deepEqual(numbers(unitPins(gnd, 1)), ['1']);
});

test('readKicadSymDir: a folder of one symbol per file, a parent in another file, a chain of two, other files left out', () => {
  const dir = new URL('logic.kicad_symdir/', FIX);
  const files = readdirSync(dir).sort().map((name) => ({ name, text: readFileSync(new URL(name, dir), 'utf8') }));
  assert.deepEqual(files.map((f) => f.name), ['TESTBASE.kicad_sym', 'TESTDERIVED.kicad_sym', 'notes.txt']);
  const lib = readKicadSymDir(files);
  assert.equal(lib.version, 20251024);
  assert.deepEqual(lib.warnings, []);
  const s = bySym(lib);
  assert.deepEqual(Object.keys(s), ['TESTBASE', 'TESTDERIVED', 'TESTDERIVED2']);
  assert.deepEqual(numbers(s.TESTDERIVED2.pins), ['1', '2']);
  assert.deepEqual(s.TESTDERIVED2.properties, { Reference: 'U', Value: 'TESTDERIVED', Description: 'derived twice' }, 'through its parent, from its grandparent');
  assert.deepEqual(readKicadSymDir([files[1], files[0]]).symbols.map((x) => x.name), ['TESTDERIVED', 'TESTDERIVED2', 'TESTBASE'], 'in any order');
  assert.throws(() => readKicadSymDir([files[1]]), /^Error: 'TESTDERIVED' extends 'TESTBASE', which is not in the library$/);
  assert.throws(() => readKicadSymDir([{ name: 'BAD.kicad_sym', text: '(kicad_symbol_lib (version 1)' }]), /^Error: BAD\.kicad_sym: line 1: a "\(" not closed$/);
  assert.deepEqual(readKicadSymDir([]), { version: 0, symbols: [], warnings: [] });
});

test('what it refuses: other files, KiCad 5\'s .lib, no version, loops, missing parents, duplicates, unnamed', () => {
  assert.throws(() => readKicadSymLib('EESchema-LIBRARY Version 2.4\n#encoding utf-8\n'), /^Error: a KiCad 5 symbol library \(\.lib\): open it in KiCad 6 or later and save it as a \.kicad_sym$/);
  assert.throws(() => readKicadSymLib('(footprint "x")'), /^Error: not a KiCad symbol library: it does not start with \(kicad_symbol_lib$/);
  assert.throws(() => readKicadSymLib('(kicad_symbol_lib (version 20211014)) (kicad_symbol_lib)'), /not a KiCad symbol library/);
  assert.throws(() => readKicadSymLib('(kicad_symbol_lib (generator x))'), /^Error: a KiCad symbol library with no \(version …\)$/);
  assert.throws(() => readKicadSymLib('(kicad_symbol_lib (version 2021x))'), /no \(version …\)/);
  const lib = (body) => `(kicad_symbol_lib (version 20231120) ${body})`;
  assert.throws(() => readKicadSymLib(lib('(symbol "A" (extends "B")) (symbol "B" (extends "A"))')), /^Error: 'A' extends a loop of symbols$/);
  assert.throws(() => readKicadSymLib(lib('(symbol "A" (extends "A"))')), /extends a loop of symbols/);
  assert.throws(() => readKicadSymLib(lib('(symbol "A" (extends "Z"))')), /^Error: 'A' extends 'Z', which is not in the library$/);
  assert.throws(() => readKicadSymLib(lib('(symbol "A") (symbol "A")')), /^Error: two symbols named 'A'$/);
  assert.throws(() => readKicadSymLib(lib('(symbol "")')), /^Error: a symbol with no name$/);
  assert.throws(() => readKicadSymLib('(kicad_symbol_lib (version 20231120)', { maxBytes: 10 }), /the file is too large/, 'the parser\'s limits');
  assert.deepEqual(readKicadSymLib(lib('')).symbols, []);
});

test('a newer version and a unit not named NAME_U_B: read, with a warning each', () => {
  const lib = readKicadSymLib(`(kicad_symbol_lib (version ${KICAD_SYM_VERSION + 1}) (symbol "A" (symbol "A_x" (pin input line (number "1"))) (symbol "A_1_1" (pin input line (number "2")))))`);
  assert.deepEqual(lib.warnings, [`the library's version ${KICAD_SYM_VERSION + 1} is newer than ${KICAD_SYM_VERSION}, the latest this reader knows: some of its contents may be left out`,
    "A: a unit named 'A_x' not named A_U_B (U its unit, B its body style), left out"]);
  assert.deepEqual(numbers(lib.symbols[0].pins), ['2']);
  assert.equal(lib.symbols[0].units, 1);
});

test('readKicadSymbols leaves extends to resolveSymbols; the constants', () => {
  const raw = readKicadSymbols(read('gates.kicad_sym'));
  const hc = raw.symbols.find((s) => s.name === 'TEST74HC00');
  assert.deepEqual(hc.pins, []);
  assert.equal(hc.units, undefined);
  assert.equal(resolveSymbols(raw.symbols).find((s) => s.name === 'TEST74HC00').pins.length, 17, 'unit 1 in both bodies (6), units 2 to 4 (9), the power unit (2)');
  assert.equal(PIN_TYPES.length, 12);
  assert.ok(PIN_TYPES.includes('open_collector') && PIN_TYPES.includes('power_in') && PIN_TYPES.includes('tri_state'));
  assert.equal(PIN_STYLES.length, 9);
});
