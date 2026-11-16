// A KiCad part imported into a project (#4281, core/kicad-import.js): the interface's Import KiCad Part… and the MCP's
// import_part through the same function, on a store of files in memory: a library and a footprint written in parts/,
// the properties set, each symbol said; what it refuses, nothing written then
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importKicadPart, libraryWithProperties, isKicadImportName, kicadImportPath } from '../core/kicad-import.js';
import { readKicadSymLib } from '../core/kicad-sym.js';
import { setProjectParts, partDef } from '../core/circuit-parts.js';

const FIX = new URL('./fixtures/kicad/project/parts/', import.meta.url);
const LIB = readFileSync(new URL('ttl.kicad_sym', FIX), 'utf8'), FP = readFileSync(new URL('imported.pretty/Module_1x04.kicad_mod', FIX), 'utf8');
function store(files = {}) {
  const f = { ...files };
  return { files: f, fileTree: async () => Object.keys(f), readFile: async (_n, p) => { if (!(p in f)) throw new Error(`no ${p}`); return f[p]; }, writeFile: async (_n, p, t) => { f[p] = t; } };
}

test('a footprint, then a library: written in parts/, each symbol said, the project\'s parts set', async () => {
  setProjectParts([]);
  const P = store({ 'src/top.vhd': '' });
  const fp = await importKicadPart(P, 'p', { base: 'Module_1x04.kicad_mod', text: FP });
  assert.deepEqual(fp, { path: 'parts/imported.pretty/Module_1x04.kicad_mod', edited: false, lines: ['parts/imported.pretty/Module_1x04.kicad_mod written'], parts: [], skipped: [], errors: [] });
  const r = await importKicadPart(P, 'p', { base: 'ttl.kicad_sym', text: LIB, symbols: { NOFP: { footprint: 'DIP-8_W7.62mm' } }, origin: { licence: 'CC-BY-4.0', author: '' } });
  assert.equal(r.path, 'parts/ttl.kicad_sym');
  assert.equal(r.edited, true);
  assert.deepEqual(r.lines, ['parts/ttl.kicad_sym written (its symbols\' Silinx properties set)',
    'parts/ttl.kicad_sym#74LS00: behaves as the 7400 (by its part number)', 'parts/ttl.kicad_sym#74HC00: behaves as the 7400 (by its part number)',
    'parts/ttl.kicad_sym#MYNAND: behaves as the 7400 (by its Silinx.Model)', 'parts/ttl.kicad_sym#CD4011: behaves as the 4011 (by its part number)',
    'parts/ttl.kicad_sym#74LS04: drawn only: not simulated', 'parts/ttl.kicad_sym#SENSOR: drawn only: not simulated', 'parts/ttl.kicad_sym#MODULE: drawn only: not simulated',
    'parts/ttl.kicad_sym#NOFP: drawn only: not simulated',
    'parts/ttl.kicad_sym#SMDCHIP: not a part: its footprint Package_SO:SOIC-8_3.9x4.9mm_P1.27mm is surface-mount: it does not plug into a breadboard',
    'parts/ttl.kicad_sym#BADMODEL: not a part: its Silinx.Model \'led\' is not an IC of the library',
    "WARNING: parts/ttl.kicad_sym: 74LS04: its part number is the 7404's but its pin 2 (no name) is input, the 7404's pin 2 (1Y) out: drawn only"]);
  assert.equal(partDef('parts/ttl.kicad_sym#NOFP').dip, 8, 'its footprint given');
  const props = readKicadSymLib(P.files['parts/ttl.kicad_sym']).symbols.find((s) => s.name === 'NOFP').properties;
  assert.deepEqual([props['Silinx.Footprint'], props['Silinx.Licence'], props['Silinx.Author']], ['DIP-8_W7.62mm', 'CC-BY-4.0', undefined], 'an empty author not written');
  setProjectParts([]);
});

test('what it refuses, nothing written: a name, a footprint\'s symbols, a file there already, a text it cannot read', async () => {
  const P = store({ 'parts/ttl.kicad_sym': LIB });
  const refused = async (args, msg) => { await assert.rejects(importKicadPart(P, 'p', args), (e) => { assert.equal(e.message, msg); return true; }); };
  await refused({ base: '../x.kicad_sym', text: LIB }, "'../x.kicad_sym' is not a .kicad_sym nor a .kicad_mod file's name (letters, digits, . _ -)");
  await refused({ base: 'a.lib', text: LIB }, "'a.lib' is not a .kicad_sym nor a .kicad_mod file's name (letters, digits, . _ -)");
  await refused({ base: 'f.kicad_mod', text: FP, symbols: { A: {} } }, 'symbols: a footprint has none');
  await refused({ base: 'f.kicad_mod', text: '(kicad_symbol_lib)' }, 'not a KiCad footprint: it does not start with (footprint');
  await refused({ base: 'ttl.kicad_sym', text: LIB }, 'parts/ttl.kicad_sym: the project has it already (replace: true replaces it)');
  await refused({ base: 'new.kicad_sym', text: 'EESchema-LIBRARY Version 2.4' }, 'a KiCad 5 symbol library (.lib): open it in KiCad 6 or later and save it as a .kicad_sym');
  await refused({ base: 'new.kicad_sym', text: LIB, symbols: { NOFP: { family: 'ecl' } } }, 'symbols.NOFP.family: ttl or cmos');
  assert.deepEqual(Object.keys(P.files), ['parts/ttl.kicad_sym']);
  const again = await importKicadPart(P, 'p', { base: 'ttl.kicad_sym', text: LIB, replace: true });
  assert.equal(again.edited, false);
  assert.equal(P.files['parts/ttl.kicad_sym'], LIB, 'nothing given: the file as it was');
  setProjectParts([]);
});

test('the names and paths; libraryWithProperties alone', () => {
  assert.deepEqual(['a.kicad_sym', 'A-b_c.1.kicad_mod', '.x.kicad_sym', 'a b.kicad_sym', 'a.kicad_symdir', ''].map(isKicadImportName), [true, true, false, false, false, false]);
  assert.deepEqual([kicadImportPath('a.kicad_sym'), kicadImportPath('f.kicad_mod')], ['parts/a.kicad_sym', 'parts/imported.pretty/f.kicad_mod']);
  assert.equal(libraryWithProperties(LIB, {}), LIB);
  assert.equal(libraryWithProperties(LIB, { NOFP: { model: '', footprint: '' } }), LIB, 'empty values: nothing');
  assert.throws(() => libraryWithProperties(LIB, { NONE: {} }), /^Error: symbols: no symbol 'NONE' in the library \(its symbols: 74LS00, /);
});
