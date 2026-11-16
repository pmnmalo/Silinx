// The catalogue of KiCad parts (#4305, core/kicad-catalogue.js): its data (written by scripts/kicad-catalogue.mjs) whole
// and consistent; its titles in Silinx's words, its search; a part imported as one KiCad file per symbol (and those it
// extends) in parts/<library>.kicad_symdir/, its footprint beside it, its origin in it, every file checked against its
// SHA-256, a file there already with the same text kept; on a catalogue of the test's own, from hand-written fixtures
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CATALOGUE, CATALOGUE_LIBRARIES, CORS_HOSTS, catalogueTitle, searchCatalogue, isCatalogueFile, catalogueSha256, importCataloguePart } from '../core/kicad-catalogue.js';
import { PARTS, partDef, setProjectParts } from '../core/circuit-parts.js';
import { readKicadSymLib } from '../core/kicad-sym.js';
import { symbolTexts, oneSymbolFile } from '../core/kicad-edit.js';

const sha = (t) => createHash('sha256').update(t).digest('hex');
const FIX = new URL('./fixtures/kicad/', import.meta.url);

test('the catalogue\'s data: its parts\' libraries, ids, behaviours, packages, footprints; no library\'s content', () => {
  assert.ok(CATALOGUE.length >= 200, `${CATALOGUE.length} parts`);
  assert.equal(new Set(CATALOGUE.map((e) => e.id)).size, CATALOGUE.length, 'each id once');
  for (const e of CATALOGUE) {
    const lib = CATALOGUE_LIBRARIES[e.library];
    assert.ok(lib, e.id);
    assert.equal(e.id, `${e.library}/${e.symbol}`);
    assert.match(lib.sha256, /^[0-9a-f]{64}$/);
    assert.match(lib.url, /^https:\/\/(?:gitlab\.com\/kicad\/libraries\/kicad-symbols\/-\/raw\/9\.0\.0|raw\.githubusercontent\.com\/sparkfun\/SparkFun-KiCad-Libraries\/v10\.0\.0)\//);
    if (e.as) { assert.equal(PARTS[e.as]?.kind, 'ic', e.id); assert.match(e.package, /^DIP-\d+$/); } else assert.equal(e.as, null);
    if (e.footprint) { assert.match(e.footprint.sha256, /^[0-9a-f]{64}$/); assert.ok(isCatalogueFile(e.footprint.url)); }
    assert.deepEqual(Object.keys(e).filter((k) => !['id', 'library', 'symbol', 'value', 'as', 'package', 'pins', 'needs', 'footprint'].includes(k)), [], `${e.id}: facts only`);
  }
  assert.deepEqual(Object.values(CATALOGUE_LIBRARIES).map((l) => l.licence).filter((x, i, a) => a.indexOf(x) === i).sort(), ['CC-BY-4.0', 'CC-BY-SA-4.0']);
  // KiCad's 74LS00 and its derived 74HC00 among them, as the 7400; SparkFun's parts drawn only, each one with its footprint
  const hc = CATALOGUE.find((e) => e.id === 'kicad-74xx/74HC00');
  assert.deepEqual([hc.as, hc.package, hc.needs], ['7400', 'DIP-14', ['74LS00']]);
  assert.ok(CATALOGUE.filter((e) => e.library.startsWith('sparkfun-')).every((e) => !e.as && e.footprint));
  assert.deepEqual(CORS_HOSTS, ['raw.githubusercontent.com']);
  assert.equal(isCatalogueFile('https://gitlab.com/other'), false);
  assert.equal(catalogueSha256(CATALOGUE_LIBRARIES['kicad-74xx'].url), 'd229bea4164b7197952f31aa6deff19d9eaa0cf0a319190424cfad3ba1b6a727', 'the one core/kicad-pcm.js pins');
  assert.equal(catalogueSha256('https://gitlab.com/other'), null);
});

test('catalogueTitle in Silinx\'s words; searchCatalogue by number, title and library', () => {
  assert.equal(catalogueTitle(CATALOGUE.find((e) => e.id === 'kicad-74xx/74HC00')), '74HC00, as the 7400: Quad 2-input NAND');
  assert.equal(catalogueTitle({ value: 'X', as: null, pins: 4, package: 'grid' }), 'X, drawn only: 4 pin(s)');
  assert.equal(catalogueTitle({ value: 'Y', as: null, pins: 14, package: 'DIP-14' }), 'Y, drawn only: 14 pin(s), DIP-14');
  assert.deepEqual(searchCatalogue('nand hct').map((e) => e.id), ['kicad-74xx/74HCT00']);
  assert.ok(searchCatalogue('4011').some((e) => e.id === 'kicad-4xxx/4011'));
  assert.ok(searchCatalogue('sparkfun connector').length > 10);
  assert.equal(searchCatalogue('').length, CATALOGUE.length);
  assert.deepEqual(searchCatalogue('no-such-part-anywhere'), []);
});

test('symbolTexts and oneSymbolFile: a symbol taken out of its library, read again the same', () => {
  const text = readFileSync(new URL('gates.kicad_sym', FIX), 'utf8');
  const { version, symbols } = symbolTexts(text);
  assert.equal(version, 20231120);
  assert.deepEqual([...symbols.keys()], ['TEST7400', 'TEST74HC00', 'TESTFF', 'TESTVCC']);
  const one = oneSymbolFile(version, symbols.get('TESTFF'));
  assert.match(one, /^\(kicad_symbol_lib\n\t\(version 20231120\)\n\t\(generator "silinx"\)\n\t\(symbol "TESTFF"/);
  const { warnings, ...a } = readKicadSymLib(one), b = readKicadSymLib(text);
  assert.deepEqual(a.symbols, b.symbols.filter((s) => s.name === 'TESTFF'));
  assert.throws(() => symbolTexts('(footprint "x")'), /not a KiCad symbol library/);
});

test('importCataloguePart: its symbol and its parent, each a file, its footprint, its origin; checked; kept when the same', async () => {
  const LIB = readFileSync(new URL('project/parts/ttl.kicad_sym', FIX), 'utf8'), MOD = readFileSync(new URL('project/parts/imported.pretty/Module_1x04.kicad_mod', FIX), 'utf8');
  const urls = { lib: 'https://raw.githubusercontent.com/example/lib/v1/symbols/ttl.kicad_sym', fp: 'https://raw.githubusercontent.com/example/lib/v1/footprints/imported.pretty/Module_1x04.kicad_mod' };
  const catalogue = { CATALOGUE_LIBRARIES: { ttl: { name: 'Test TTL', version: '1', licence: 'CC-BY-4.0', author: 'Test', url: urls.lib, file: 'ttl.kicad_sym', sha256: sha(LIB) } },
    CATALOGUE: [{ id: 'ttl/74HC00', library: 'ttl', symbol: '74HC00', value: '74HC00', as: '7400', package: 'DIP-14', pins: 14, needs: ['74LS00'] },
      { id: 'ttl/MODULE', library: 'ttl', symbol: 'MODULE', value: 'TEST-MODULE', as: null, package: 'grid', pins: 4, footprint: { name: 'imported:Module_1x04', url: urls.fp, sha256: sha(MOD) } }] };
  const files = {}, asked = [];
  const P = { fileTree: async () => Object.keys(files), readFile: async (_n, p) => files[p], writeFile: async (_n, p, t) => { files[p] = t; } };
  const get = async (u) => { asked.push(u); return u === urls.lib ? LIB : MOD; };
  const r = await importCataloguePart(P, 'p', 'ttl/74HC00', get, { catalogue });
  assert.equal(r.type, 'parts/ttl.kicad_symdir#74HC00');
  assert.deepEqual(r.written, ['parts/ttl.kicad_symdir/74LS00.kicad_sym', 'parts/ttl.kicad_symdir/74HC00.kicad_sym']);
  assert.deepEqual(r.lines, ['parts/ttl.kicad_symdir written: 2 part(s), 2 of them as ICs of the library (7400), 0 drawn only; 0 symbol(s) no part']);
  assert.equal(partDef(r.type).behaves, '7400');
  assert.match(files['parts/ttl.kicad_symdir/74LS00.kicad_sym'], /"Silinx\.Source" "Test TTL 1 \(https:\/\/raw\.githubusercontent\.com\/example\/lib\/v1\/symbols\/ttl\.kicad_sym\)"/);
  assert.doesNotMatch(files['parts/ttl.kicad_symdir/74HC00.kicad_sym'], /Silinx\.Source/, 'a derived symbol takes its parent\'s');
  // another part sharing nothing; the same one again: its files kept, none written
  const m = await importCataloguePart(P, 'p', 'ttl/MODULE', get, { catalogue });
  assert.deepEqual(m.written, ['parts/ttl.kicad_symdir/MODULE.kicad_sym', 'parts/imported.pretty/Module_1x04.kicad_mod']);
  assert.equal(partDef(m.type).kind, 'drawn');
  assert.deepEqual((await importCataloguePart(P, 'p', 'ttl/74HC00', get, { catalogue })).written, []);
  // a file of the project changed: refused unless replaced
  files['parts/ttl.kicad_symdir/74LS00.kicad_sym'] += '\n';
  await assert.rejects(importCataloguePart(P, 'p', 'ttl/74HC00', get, { catalogue }), { message: 'parts/ttl.kicad_symdir/74LS00.kicad_sym: the project has it already (replace: true replaces it)' });
  assert.deepEqual((await importCataloguePart(P, 'p', 'ttl/74HC00', get, { catalogue, replace: true })).written.length, 2);
  // a file whose SHA-256 is not the catalogue's: refused, nothing written
  const bad = async () => `${LIB} `;
  const before = JSON.stringify(files);
  await assert.rejects(importCataloguePart(P, 'p', 'ttl/74HC00', bad, { catalogue }), new RegExp(`^Error: ${urls.lib.replace(/[.]/g, '\\.')}'s SHA-256 is [0-9a-f]{64}, not the ${sha(LIB)} it should be: not read$`));
  assert.equal(JSON.stringify(files), before);
  await assert.rejects(importCataloguePart(P, 'p', 'ttl/NONE', get, { catalogue }), { message: 'no part \'ttl/NONE\' in the KiCad catalogue (part_libraries with catalogue lists them)' });
  setProjectParts([]);
});
