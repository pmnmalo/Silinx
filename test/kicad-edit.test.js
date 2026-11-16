// A KiCad symbol library's properties written in its text (#4280, core/kicad-edit.js): set, replaced and removed, in
// KiCad 6's and KiCad 8's syntax, the rest of the file byte for byte as it was; read back by core/kicad-sym.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setSymbolProperties, quote } from '../core/kicad-edit.js';
import { readKicadSymLib } from '../core/kicad-sym.js';

const read = (name) => readFileSync(new URL(`./fixtures/kicad/${name}`, import.meta.url), 'utf8');
const props = (text, name) => readKicadSymLib(text).symbols.find((s) => s.name === name).properties;
// the lines of b that are not a's, and the other way round
const diff = (a, b) => { const A = a.split('\n'), B = b.split('\n'); return { added: B.filter((l) => !A.includes(l)), removed: A.filter((l) => !B.includes(l)) }; };

test('KiCad 8: a property added after the symbol\'s last one, with its indent and (hide yes); the rest unchanged', () => {
  const t = read('gates.kicad_sym');
  const out = setSymbolProperties(t, { TEST7400: { 'Silinx.Model': '7400', 'Silinx.Family': 'ttl' } });
  assert.deepEqual(diff(t, out), { added: ['\t\t(property "Silinx.Model" "7400" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))',
    '\t\t(property "Silinx.Family" "ttl" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))'], removed: [] });
  assert.equal(out.indexOf('Silinx.Model') < out.indexOf('Silinx.Family'), true, 'in the order given');
  assert.equal(out.indexOf('ki_fp_filters') < out.indexOf('Silinx.Model') && out.indexOf('Silinx.Model') < out.indexOf('(symbol "TEST7400_1_1"'), true, 'after its properties, before its units');
  assert.deepEqual({ ...props(out, 'TEST7400') }, { ...props(t, 'TEST7400'), 'Silinx.Model': '7400', 'Silinx.Family': 'ttl' });
  assert.equal(props(out, 'TEST74HC00')['Silinx.Model'], '7400', 'a derived symbol takes its parent\'s');
  assert.deepEqual(readKicadSymLib(out).symbols[0].pins, readKicadSymLib(t).symbols[0].pins);
});

test('KiCad 6: an id after the symbol\'s last, a bare hide; a value replaced in place; a property removed', () => {
  const t = read('kicad6.kicad_sym');
  const out = setSymbolProperties(t, { TEST7404: { 'Silinx.Licence': 'CC-BY-SA-4.0', Description: 'hex inverter', Footprint: null } });
  assert.deepEqual(diff(t, out), { added: ['    (property "Description" "hex inverter" (id 3) (at 0 0 0)', '    (property "Silinx.Licence" "CC-BY-SA-4.0" (id 4) (at 0 0 0) (effects (font (size 1.27 1.27)) hide))'],
    removed: ['    (property "Footprint" "Package_DIP:DIP-14_W7.62mm" (id 2) (at 0 0 0)', '    (property "Description" "hex \\"inverter\\"\\\\buffer" (id 3) (at 0 0 0)'] });
  const p = props(out, 'TEST7404');
  assert.deepEqual([p.Description, p['Silinx.Licence'], p.Footprint], ['hex inverter', 'CC-BY-SA-4.0', undefined]);
  assert.equal(setSymbolProperties(t, { TEST7404: { Absent: null } }), t, 'removing a property it has not: nothing');
  assert.equal(setSymbolProperties(t, {}), t);
});

test('a symbol with no property, a value\'s quotes and escapes, several symbols; what it refuses', () => {
  const t = '(kicad_symbol_lib (version 20251024)\n\t(symbol "A"\n\t\t(symbol "A_1_1" (pin input line (number "1")))\n\t)\n\t(symbol "B" (extends "A"))\n)\n';
  const out = setSymbolProperties(t, { A: { 'Silinx.Source': 'a "lib"\\x\nnext' }, B: { 'Silinx.Model': '7404' } });
  assert.equal(props(out, 'A')['Silinx.Source'], 'a "lib"\\x\nnext');
  assert.equal(props(out, 'B')['Silinx.Model'], '7404');
  assert.match(out, /\(symbol "B" \(extends "A"\)\n\t\t\(property "Silinx\.Model" "7404"/);
  assert.equal(quote('a"b\\c\nd'), '"a\\"b\\\\c\\nd"');
  assert.throws(() => setSymbolProperties(t, { C: { x: '1' } }), /^Error: no symbol 'C' in the library$/);
  assert.throws(() => setSymbolProperties('(footprint "x")', {}), /^Error: not a KiCad symbol library: it does not start with \(kicad_symbol_lib$/);
  assert.throws(() => setSymbolProperties('(kicad_symbol_lib (version 1)', {}), /a "\(" not closed/);
  // a string holding parentheses and the keyword of a symbol is no symbol
  const tricky = '(kicad_symbol_lib (version 20251024) (symbol "S" (property "Description" "(symbol \\"T\\")")))';
  assert.equal(props(setSymbolProperties(tricky, { S: { Description: 'plain' } }), 'S').Description, 'plain');
  assert.throws(() => setSymbolProperties(tricky, { T: { x: '1' } }), /no symbol 'T'/);
});
