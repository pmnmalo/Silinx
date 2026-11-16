// Silinx's parts in KiCad's formats (#4282, core/kicad-export.js): every IC of the library written as a KiCad symbol and
// read back (core/kicad-sym.js, core/circuit-kicad.js) as that IC, its pins the same, by its Silinx.Model and by its part
// number alone; its units, its pins on the grid, its names' overbars; a PCM package of a project's parts and those ICs,
// read back (core/kicad-pcm.js) the same, its metadata the PCM schema's required fields; what it refuses
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { readFileSync } from 'node:fs';
import { icSymbol, icLibrary, partsPackage, kicadPinName, EXPORTED_ICS, EXPORT_VERSION } from '../core/kicad-export.js';
import { readKicadSymLib, pinText, unitPins } from '../core/kicad-sym.js';
import { kicadPartsOf } from '../core/circuit-kicad.js';
import { readPcmPackage, packageOrigin } from '../core/kicad-pcm.js';
import { PARTS, PART_ORDER } from '../core/circuit-parts.js';
import { VERSION } from '../core/version.js';

const CODEC = { deflate: (d) => zlib.deflateRawSync(d), inflate: (d, limit) => zlib.inflateRawSync(d, { maxOutputLength: Math.max(1, limit) }) };
const BAR = '̅';

test('every IC of the library, written and read back: that IC, its pins the same, no warning', () => {
  assert.deepEqual(EXPORTED_ICS, PART_ORDER.filter((t) => PARTS[t].kind === 'ic'));
  assert.equal(EXPORTED_ICS.length, 48);
  const text = icLibrary();
  const lib = readKicadSymLib(text);
  assert.deepEqual([lib.version, lib.generator, lib.warnings], [EXPORT_VERSION, 'silinx', []]);
  const r = kicadPartsOf({ 'parts/Silinx.kicad_sym': text });
  assert.deepEqual([r.skipped, r.notes, r.errors], [[], [], []]);
  assert.deepEqual(r.defs.map((d) => d.behaves), EXPORTED_ICS);
  for (const d of r.defs) {
    assert.equal(d.pins, PARTS[d.behaves].pins, d.behaves);
    assert.equal(d.how, 'Silinx.Model');
    assert.equal(d.family, PARTS[d.behaves].family);
    assert.deepEqual([d.kicad.value, d.kicad.footprint, d.kicad.description], [PARTS[d.behaves].chip, `Package_DIP:DIP-${PARTS[d.behaves].dip}_W7.62mm`, PARTS[d.behaves].title]);
  }
  // by its part number alone (its Silinx properties taken out): the same ICs
  const plain = kicadPartsOf({ 'parts/Plain.kicad_sym': text.replace(/\n\t\t\(property "Silinx\.[^\n]*/g, '') });
  assert.deepEqual(plain.defs.map((d) => [d.behaves, d.how]), EXPORTED_ICS.map((t) => [t, 'part number']));
});

test('a symbol\'s units, pins and names: a gate a unit, the supply\'s last; an MSI one unit; the grid; overbars', () => {
  const [s] = readKicadSymLib(`(kicad_symbol_lib (version ${EXPORT_VERSION}) ${icSymbol('7400')})`).symbols;
  assert.equal(s.name, 'SN74LS00');
  assert.equal(s.units, 5);
  assert.deepEqual([1, 2, 3, 4].map((u) => unitPins(s, u).map((p) => `${p.number} ${p.type} ${p.x},${p.y}`)), [
    ['1 input -7.62,1.27', '2 input -7.62,-1.27', '3 output 7.62,0'], ['4 input -7.62,1.27', '5 input -7.62,-1.27', '6 output 7.62,0'],
    ['9 input -7.62,1.27', '10 input -7.62,-1.27', '8 output 7.62,0'], ['12 input -7.62,1.27', '13 input -7.62,-1.27', '11 output 7.62,0']]);
  assert.deepEqual(unitPins(s, 5).map((p) => `${p.number} ${p.name} ${p.type} ${p.rot}`), ['14 VCC power_in 270', '7 GND power_in 90']);
  assert.deepEqual(s.properties, { Reference: 'U', Value: 'SN74LS00', Footprint: 'Package_DIP:DIP-14_W7.62mm', Datasheet: '', Description: 'Quad 2-input NAND',
    ki_keywords: 'TTL 74LS 7400', ki_fp_filters: 'DIP*W7.62mm*', 'Silinx.Model': '7400', 'Silinx.Family': 'ttl', 'Silinx.Source': `Silinx ${VERSION} library` });
  // every pin of every IC on the 1.27 mm half grid, its length 2.54 (KiCad's convention)
  for (const t of EXPORTED_ICS) {
    const [x] = readKicadSymLib(`(kicad_symbol_lib (version ${EXPORT_VERSION}) ${icSymbol(t)})`).symbols;
    for (const p of x.pins) { assert.ok(Number.isInteger(Math.round(p.x * 100) / 127) && Number.isInteger(Math.round(p.y * 100) / 127), `${t} ${p.number}`); assert.equal(p.length, 2.54); }
  }
  // an MSI: one unit, its supply in it; its active low names overlined, read back as Silinx's
  const [m] = readKicadSymLib(`(kicad_symbol_lib (version ${EXPORT_VERSION}) ${icSymbol('7447')})`).symbols;
  assert.equal(m.units, 1);
  assert.deepEqual(m.pins.filter((p) => p.name.startsWith('~')).map((p) => p.name), ['~{LT}', '~{BI}', '~{RBI}']);
  assert.deepEqual(m.pins.map((p) => { const t = pinText(p.name); return t.low ? `${t.text}${BAR}` : t.text; }).sort(), PARTS['7447'].pins.map((p) => p.name).sort());
  assert.deepEqual([kicadPinName('CLR' + BAR), kicadPinName('1Q'), kicadPinName('')], ['~{CLR}', '1Q', '']);
});

test('icLibrary: some ICs, each once; what it refuses', () => {
  assert.deepEqual(readKicadSymLib(icLibrary(['74161', '7404', '74161'])).symbols.map((s) => s.name), ['SN74LS161', 'SN74LS04']);
  assert.match(icLibrary(['7404']), new RegExp(`^\\(kicad_symbol_lib\\n\\t\\(version ${EXPORT_VERSION}\\)\\n\\t\\(generator "silinx"\\)\\n\\t\\(generator_version "${VERSION.replace(/\./g, '\\.')}"\\)\\n`));
  assert.throws(() => icLibrary(['led']), new RegExp(`^Error: 'led' is not an IC of the library \\(its ICs: ${EXPORTED_ICS.join(', ')}\\)$`));
  assert.throws(() => icLibrary([]), /^Error: no IC chosen$/);
  assert.throws(() => icSymbol('nope'), /^Error: 'nope' is not an IC of the library$/);
});

test('partsPackage: a project\'s parts and ICs as a PCM package, read back the same; its metadata; its refusals', async () => {
  const LIB = readFileSync(new URL('./fixtures/kicad/project/parts/ttl.kicad_sym', import.meta.url), 'utf8');
  const MOD = readFileSync(new URL('./fixtures/kicad/project/parts/imported.pretty/Module_1x04.kicad_mod', import.meta.url), 'utf8');
  const files = { 'parts/ttl.kicad_sym': LIB, 'parts/imported.pretty/Module_1x04.kicad_mod': MOD, 'parts/logic.kicad_symdir/A.kicad_sym': '(kicad_symbol_lib (version 20251024))', 'src/top.vhd': 'x' };
  const meta = { identifier: 'org.example.course-parts', name: 'Course parts', description: 'The parts of a course', author: 'A Teacher', licence: 'CC-BY-SA-4.0', version: '1.0.0' };
  const zip = await partsPackage(files, meta, CODEC, { ics: ['7400', '74161'] });
  const p = await readPcmPackage(zip, CODEC);
  assert.deepEqual(p.symbols.map((s) => s.name).sort(), ['Silinx.kicad_sym', 'ttl.kicad_sym']);
  assert.equal(p.symbols.find((s) => s.name === 'ttl.kicad_sym').text, LIB, 'as it was');
  assert.deepEqual(p.symdirs.map((d) => [d.name, d.files.map((f) => f.name)]), [['logic.kicad_symdir', ['A.kicad_sym']]]);
  assert.deepEqual(p.footprints.map((f) => [f.library, f.name, f.text === MOD]), [['imported', 'Module_1x04.kicad_mod', true]]);
  // the PCM schema's required fields
  assert.deepEqual(p.metadata, { $schema: 'https://go.kicad.org/pcm/schemas/v1', name: 'Course parts', description: 'The parts of a course', description_full: 'The parts of a course',
    identifier: 'org.example.course-parts', type: 'library', author: { name: 'A Teacher' }, license: 'CC-BY-SA-4.0', versions: [{ version: '1.0.0', status: 'stable', kicad_version: '7.0' }] });
  assert.deepEqual(packageOrigin(p.metadata), { source: 'org.example.course-parts 1.0.0', author: 'A Teacher', licence: 'CC-BY-SA-4.0' });
  assert.deepEqual(kicadPartsOf({ 'parts/Silinx.kicad_sym': p.symbols.find((s) => s.name === 'Silinx.kicad_sym').text }).defs.map((d) => d.behaves), ['7400', '74161']);
  const refused = (m, msg, f = files, o) => assert.rejects(partsPackage(f, { ...meta, ...m }, CODEC, o), { message: msg });
  await refused({ identifier: 'nodots' }, 'identifier: \'nodots\' is not a reverse domain name of 2 to 50 letters, digits and - each (org.example.parts)');
  await refused({ author: ' ' }, 'author: missing');
  await refused({ description: 'x'.repeat(151) }, 'description: at most 150 characters');
  await refused({ version: 'v1' }, 'version: \'v1\' is not a version (1, 1.0, 1.2.3)');
  await refused({}, 'nothing to package: the project has no KiCad parts (parts/), and no IC of the library was chosen', { 'src/a.vhd': 'x' });
  assert.equal((await readPcmPackage(await partsPackage({}, meta, CODEC, { ics: ['7404'] }), CODEC)).symbols.length, 1, 'the ICs alone');
});
