// The catalogue of KiCad parts (#4305, core/kicad-catalogue.js): its data (written by scripts/kicad-catalogue.mjs) whole
// and consistent; its titles in Silinx's words, its search; a part imported as one KiCad file per symbol (and those it
// extends) in parts/<library>.kicad_symdir/, its footprint beside it, its origin in it, every file checked against its
// SHA-256, a file there already with the same text kept; on a catalogue of the test's own, from hand-written fixtures
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CATALOGUE, CATALOGUE_LIBRARIES, CORS_HOSTS, browserUrl, catalogueDrawing, catalogueTitle, searchCatalogue, isCatalogueFile, catalogueSha256, importCataloguePart } from '../core/kicad-catalogue.js';
import { PARTS, partDef, setProjectParts } from '../core/circuit-parts.js';
import { CATALOGUE_LOOKS } from '../core/kicad-catalogue-data.js';
import { lookOf } from '../core/circuit-kicad.js';
import { readKicadFootprint } from '../core/kicad-mod.js';
import { readKicadSymLib } from '../core/kicad-sym.js';
import { symbolTexts, oneSymbolFile, symbolFileName } from '../core/kicad-edit.js';

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
  assert.deepEqual(CORS_HOSTS, ['raw.githubusercontent.com', 'gitlab.com']);
  assert.equal(isCatalogueFile('https://gitlab.com/other'), false);
  assert.equal(catalogueSha256(CATALOGUE_LIBRARIES['kicad-74xx'].url), 'd229bea4164b7197952f31aa6deff19d9eaa0cf0a319190424cfad3ba1b6a727', 'the one core/kicad-pcm.js pins');
  assert.equal(catalogueSha256('https://gitlab.com/other'), null);
});

test('browserUrl: every catalogue file has one; GitHub\'s raw files as they are, gitlab.com\'s through its API; others none (#4312)', () => {
  const files = [...Object.values(CATALOGUE_LIBRARIES).map((l) => l.url), ...CATALOGUE.filter((e) => e.footprint).map((e) => e.footprint.url)];
  for (const u of files) assert.ok(CORS_HOSTS.includes(new URL(browserUrl(u)).hostname), u);
  // (the same bytes as the raw file, SHA-256 d229bea4…, checked by hand: GitLab's API sends Access-Control-Allow-Origin: *)
  assert.equal(browserUrl(CATALOGUE_LIBRARIES['kicad-74xx'].url), 'https://gitlab.com/api/v4/projects/kicad%2Flibraries%2Fkicad-symbols/repository/files/74xx.kicad_sym/raw?ref=9.0.0');
  assert.equal(browserUrl('https://gitlab.com/a/b/-/raw/v1/dir/x%20y.kicad_mod'), 'https://gitlab.com/api/v4/projects/a%2Fb/repository/files/dir%2Fx%20y.kicad_mod/raw?ref=v1');
  const sf = CATALOGUE_LIBRARIES['sparkfun-board'].url;
  assert.equal(browserUrl(sf), sf);
  assert.equal(browserUrl('https://gitlab.com/kicad/libraries/kicad-symbols'), null);
  assert.equal(browserUrl('https://repository.kicad.org/repository.json'), null);
  assert.equal(browserUrl('https://github.com/x/y/releases/download/v1/a.zip'), null);
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

test('a symbol whose name holds a \'/\' (SparkFun\'s 10k_Axial_1/6W, #4318): its file named as KiCad 10 names it, {slash}; the part found', async () => {
  assert.equal(symbolFileName('74HC00'), '74HC00.kicad_sym');
  assert.equal(symbolFileName('10k_Axial_1/6W'), '10k_Axial_1{slash}6W.kicad_sym');
  assert.equal(symbolFileName('a\\b"c<d>e|f:g\th\ni'), 'a{backslash}b{dblquote}c{lt}d{gt}e{bar}f{colon}g{tab}h{return}i.kicad_sym');
  const NAME = '10k_Axial_1/6W';
  const LIB = readFileSync(new URL('project/parts/ttl.kicad_sym', FIX), 'utf8').replaceAll('"MODULE"', `"${NAME}"`).replaceAll('"MODULE_1_1"', `"${NAME}_1_1"`);
  const MOD = readFileSync(new URL('project/parts/imported.pretty/Module_1x04.kicad_mod', FIX), 'utf8');
  const urls = { lib: 'https://raw.githubusercontent.com/example/lib/v1/symbols/res.kicad_sym', fp: 'https://raw.githubusercontent.com/example/lib/v1/footprints/imported.pretty/Module_1x04.kicad_mod' };
  const catalogue = { CATALOGUE_LIBRARIES: { res: { name: 'Test', version: '1', licence: 'CC-BY-4.0', author: 'Test', url: urls.lib, file: 'res.kicad_sym', sha256: sha(LIB) } },
    CATALOGUE: [{ id: `res/${NAME}`, library: 'res', symbol: NAME, value: 'TEST-MODULE', as: null, package: 'grid', pins: 4, footprint: { name: 'imported:Module_1x04', url: urls.fp, sha256: sha(MOD) } }] };
  const files = {};
  const P = { fileTree: async () => Object.keys(files), readFile: async (_n, p) => files[p], writeFile: async (_n, p, t) => { files[p] = t; } };
  const r = await importCataloguePart(P, 'p', `res/${NAME}`, async (u) => (u === urls.lib ? LIB : MOD), { catalogue });
  assert.deepEqual(r.written, ['parts/res.kicad_symdir/10k_Axial_1{slash}6W.kicad_sym', 'parts/imported.pretty/Module_1x04.kicad_mod']);
  assert.equal(r.type, `parts/res.kicad_symdir#${NAME}`);
  assert.deepEqual(r.lines, ['parts/res.kicad_symdir written: 1 part(s), 0 of them as ICs of the library (none), 1 drawn only; 0 symbol(s) no part', '1 footprint(s) written: parts/imported.pretty']);
  assert.equal(partDef(r.type)?.kind, 'drawn', 'the part found by its type');
  setProjectParts([]);
});

test('catalogueDrawing (#4346): every part drawn only has a preview (its footprint\'s drawing, its pads, or a DIP\'s), each look used; an IC none', () => {
  const used = new Set();
  for (const e of CATALOGUE) {
    const d = catalogueDrawing(e);
    if (e.as) { assert.equal(d, null, e.id); continue; }
    assert.ok(d, e.id);
    assert.equal(d.kind, 'drawn');
    assert.ok(d.pins.length >= e.pins, `${e.id}: its pads, at least its pins`);
    if (/^DIP-/.test(e.package)) assert.equal(d.dip, Number(e.package.slice(4)));
    else { used.add(e.footprint.name); assert.ok(d.pins.some((q) => q.n === '1' && q.dx === 0 && q.dy === 0), `${e.id}: pad 1 its place`); }
    for (const sh of d.look?.shapes ?? []) assert.ok(['circle', 'line', 'arc', 'poly'].includes(sh.k) && (sh.k === 'circle' ? sh.r > 0 : sh.pts.length >= 2), e.id);
  }
  assert.deepEqual(Object.keys(CATALOGUE_LOOKS).filter((k) => !used.has(k)), []);
  // SparkFun's red LED: round (its body a circle), its value and symbol said (its colour, core/circuit-kicad.js ledColour)
  const led = catalogueDrawing(CATALOGUE.find((e) => e.id === 'sparkfun-led/LED_Red_5mm_PTH_NoSilk'));
  assert.deepEqual([led.kicad.value, led.kicad.symbol, led.pins.length, led.look.shapes.some((sh) => sh.k === 'circle' && !sh.fill)], ['Red', 'LED_Red_5mm_PTH_NoSilk', 2, true]);
  // a 74xx drawn only on a DIP-14: its pins as a DIP's
  const dip14 = catalogueDrawing(CATALOGUE.find((e) => !e.as && e.package === 'DIP-14'));
  assert.deepEqual(dip14.pins.filter((q) => [1, 7, 8, 14].includes(q.n)).map((q) => [q.n, q.dx, q.dy]), [[1, 0, 0], [7, 6, 0], [8, 6, -3], [14, 0, -3]]);
});

test('catalogueDrawing decodes a look as scripts/kicad-catalogue.mjs writes it: lookOf\'s shapes, rounded (#4346)', () => {
  const fp = readKicadFootprint(readFileSync(new URL('parts.pretty/LED_D5.0mm_test.kicad_mod', FIX), 'utf8')), look = lookOf(fp);
  const r2 = (v) => Math.round(v * 100) / 100 || 0;
  const looks = { 'T:LED': { pins: [['1', 0, 0], ['2', 0, -1]], shapes: look.shapes.map((sh) => [sh.k[0], sh.fill ? 1 : 0, Math.round(sh.w * 1000) / 1000, ...(sh.k === 'circle' ? [...sh.c, sh.r] : sh.pts.flat()).map(r2)]) } };
  const d = catalogueDrawing({ id: 't/LED', value: 'Red', symbol: 'LED', as: null, package: 'grid', pins: 2, footprint: { name: 'T:LED' } }, looks);
  assert.deepEqual(d.look.shapes.map((sh) => sh.k), look.shapes.map((sh) => sh.k));
  assert.deepEqual(d.look.shapes[0], { k: 'circle', fill: false, w: 0.039, c: [0, -0.5], r: 0.98 });
  assert.deepEqual(d.look.shapes[3].pts, look.shapes[3].pts.map((q) => q.map(r2)));
  assert.deepEqual(d.pins, [{ n: '1', dx: 0, dy: 0 }, { n: '2', dx: 0, dy: -1 }]);
  // a footprint with no drawing: its pads only; one not in the looks: none
  assert.equal(catalogueDrawing({ id: 't/H', value: 'H', as: null, package: 'grid', pins: 1, footprint: { name: 'T:H' } }, { 'T:H': { pins: [['1', 0, 0]], shapes: [] } }).look, undefined);
  assert.equal(catalogueDrawing({ id: 't/X', value: 'X', as: null, package: 'grid', pins: 1, footprint: { name: 'T:X' } }, {}), null);
});
