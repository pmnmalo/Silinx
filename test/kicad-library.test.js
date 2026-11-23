// Silinx's library in KiCad's format (#4290, core/kicad-export.js): every part of the library with pins written as a
// KiCad symbol (its ICs as #4282 wrote them; the others Silinx_<type>, a unit, Silinx.Model), the ones that are no IC nor
// DIP with a footprint of Silinx's (Silinx.pretty) whose pads are their pins' places; all of it read back by Silinx's
// readers (core/kicad-sym.js, core/kicad-mod.js, core/circuit-kicad.js) with the same pins in the same places, the ICs,
// the LED, the button and the slide switch behaving as the library's, the others drawn only and said so; KiCad's format
// checked (the lists and fields KiCad writes); a PCM package of it, imported into a project; what it refuses
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { partsLibrary, partSymbol, partFootprint, partFootprintName, symbolName, partsPackage, EXPORTED_PARTS, EXPORTED_ICS, FOOTPRINT_LIB, FOOTPRINT_VERSION, EXPORT_VERSION } from '../core/kicad-export.js';
import { readKicadSymLib, PIN_TYPES } from '../core/kicad-sym.js';
import { readKicadFootprint, gridPins, PAD_TYPES } from '../core/kicad-mod.js';
import { parseSexpr, head } from '../core/sexpr.js';
import { kicadPartsOf } from '../core/circuit-kicad.js';
import { readPcmPackage } from '../core/kicad-pcm.js';
import { importKicadPackage, packageContents } from '../core/kicad-import.js';
import { PARTS, PART_ORDER, setProjectParts } from '../core/circuit-parts.js';
import { VERSION } from '../core/version.js';

const CODEC = { deflate: (d) => zlib.deflateRawSync(d), inflate: (d, limit) => zlib.inflateRawSync(d, { maxOutputLength: Math.max(1, limit) }) };
const OTHERS = ['supply', 'logic-switch', 'button', 'spdt', 'dip-4', 'dip-8', 'clock', 'pull-up', 'pull-down', 'led', 'seg7-cc', 'seg7-ca', 'led-bar-10', 'probe'];
// (the library's parts a KiCad part behaves as, #4349; the others drawn only)
const BEHAVE = ['button', 'spdt', 'led'], DRAWN = OTHERS.filter((t) => !BEHAVE.includes(t));
const OWN_FP = ['supply', 'logic-switch', 'button', 'spdt', 'clock', 'pull-up', 'pull-down', 'led', 'probe'];
const filesOf = (lib) => ({ 'parts/Silinx.kicad_sym': lib.symbols, ...Object.fromEntries(lib.footprints.map((f) => [`parts/${FOOTPRINT_LIB}.pretty/${f.name}`, f.text])) });
const place = (p) => `${p.n} ${p.name} ${p.dx},${p.dy}`;
const note = (t) => `parts/Silinx.kicad_sym: Silinx_${t}: its Silinx.Model is the library's ${t}, which a KiCad part does not behave as yet: drawn only`;

test('the whole library: every part with pins, read back with the same pins in the same places; the ICs, LED, button and switch as the library\'s', () => {
  assert.deepEqual(EXPORTED_PARTS, PART_ORDER.filter((t) => !t.startsWith('breadboard-') && !['board', 'lcd', 'oled', 'sensor'].includes(PARTS[t].kind)));   // (a board, #5215, an LCD, #5330, an OLED, #5336, an LM75, #5342: KiCad's own)
  assert.deepEqual(EXPORTED_PARTS.filter((t) => PARTS[t].kind !== 'ic'), OTHERS);
  assert.deepEqual(EXPORTED_PARTS.filter((t) => PARTS[t].kind === 'ic'), EXPORTED_ICS);
  const lib = partsLibrary();
  assert.equal(partsLibrary().symbols, lib.symbols, 'the same text each time');
  const read = readKicadSymLib(lib.symbols);
  assert.deepEqual([read.version, read.generator, read.warnings], [EXPORT_VERSION, 'silinx', []]);
  assert.deepEqual(read.symbols.map((s) => s.name), EXPORTED_PARTS.map(symbolName));
  assert.deepEqual(lib.footprints.map((f) => f.name), OWN_FP.map((t) => `Silinx_${t}.kicad_mod`));
  const r = kicadPartsOf(filesOf(lib));
  assert.deepEqual([r.skipped, r.errors], [[], []]);
  assert.deepEqual(r.notes, DRAWN.map(note));
  assert.equal(r.defs.length, EXPORTED_PARTS.length);
  for (const [i, d] of r.defs.entries()) {
    const t = EXPORTED_PARTS[i], base = PARTS[t];
    assert.deepEqual(d.pins.map(place).sort(), base.pins.map(place).sort(), t);
    assert.equal(d.kicad.footprint, partFootprintName(t), t);
    if (base.kind === 'ic' || BEHAVE.includes(t)) {
      assert.deepEqual([d.behaves, d.how, d.kind], [t, 'Silinx.Model', base.kind], t);
      assert.deepEqual(d.pins.map((p) => `${p.n} ${p.dir}`).sort(), base.pins.map((p) => `${p.n} ${p.dir}`).sort(), t);
    } else assert.deepEqual([d.behaves, d.kind, d.title], [null, 'drawn', base.title], t);
  }
  // (a display's, an LED bar's, a DIP switch's: KiCad's DIP, its rows as the part's)
  assert.deepEqual(['seg7-cc', 'led-bar-10', 'dip-4', '7400', 'led'].map(partFootprintName),
    ['Package_DIP:DIP-10_W15.24mm', 'Package_DIP:DIP-20_W7.62mm', 'Package_DIP:DIP-8_W7.62mm', 'Package_DIP:DIP-14_W7.62mm', 'Silinx:Silinx_led']);
});

test('KiCad\'s format: the symbols\' and footprints\' lists and fields as KiCad writes them, their pins\' and pads\' types', () => {
  const lib = partsLibrary();
  const [top] = parseSexpr(lib.symbols);
  assert.deepEqual(top.slice(0, 4).map((l) => (Array.isArray(l) ? head(l) : l)), ['kicad_symbol_lib', 'version', 'generator', 'generator_version']);
  for (const s of top.filter((l) => head(l) === 'symbol')) {
    assert.deepEqual([...new Set(s.slice(2).map(head))], ['pin_names', 'exclude_from_sim', 'in_bom', 'on_board', 'property', 'symbol'], s[1]);
    for (const u of s.filter((l) => head(l) === 'symbol')) {
      assert.match(u[1], new RegExp(`^${s[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d+_1$`));
      for (const p of u.filter((l) => head(l) === 'pin')) assert.ok(PIN_TYPES.includes(p[1]) && p[2] === 'line', `${s[1]} ${p[1]}`);
    }
  }
  // the other parts' symbols: one unit; their properties (KiCad's own first, then Silinx's)
  const [led] = readKicadSymLib(`(kicad_symbol_lib (version ${EXPORT_VERSION}) ${partSymbol('led')})`).symbols;
  assert.equal(led.units, 1);
  assert.deepEqual(led.properties, { Reference: 'D', Value: 'Silinx_led', Footprint: 'Silinx:Silinx_led', Datasheet: '', Description: 'LED', ki_keywords: 'Silinx led',
    ki_fp_filters: 'Silinx_led*', 'Silinx.Model': 'led', 'Silinx.Source': `Silinx ${VERSION} library` });
  assert.deepEqual(led.pins.map((p) => `${p.number} ${p.name} ${p.type}`), ['1 A passive', '2 K passive']);
  const [ps] = readKicadSymLib(`(kicad_symbol_lib (version ${EXPORT_VERSION}) ${partSymbol('supply')})`).symbols;
  assert.deepEqual(ps.pins.map((p) => `${p.number} ${p.name} ${p.type} ${p.rot}`), ['1 + power_out 270', '2 - power_out 90']);
  const [bar] = readKicadSymLib(`(kicad_symbol_lib (version ${EXPORT_VERSION}) ${partSymbol('led-bar-10')})`).symbols;
  assert.deepEqual([bar.properties.Footprint, bar.properties.ki_fp_filters, bar.pins.filter((p) => p.x < 0).length], ['Package_DIP:DIP-20_W7.62mm', 'DIP*W7.62mm*', 10]);
  // the footprints: KiCad 9's, through-hole, their pads on the grid where the parts' pins are
  const KEYS = ['footprint', 'version', 'generator', 'generator_version', 'layer', 'descr', 'tags', 'property', 'attr', 'fp_rect', 'fp_circle', 'pad'];
  for (const f of lib.footprints) {
    const [fp] = parseSexpr(f.text);
    assert.deepEqual([...new Set(fp.slice(2).map(head))].filter((k) => !KEYS.includes(k)), [], f.name);
    const x = readKicadFootprint(f.text), t = f.name.replace(/^Silinx_|\.kicad_mod$/g, '');
    assert.deepEqual([x.name, x.version, x.attr], [`Silinx_${t}`, FOOTPRINT_VERSION, 'through_hole']);
    assert.ok(x.pads.every((p) => PAD_TYPES.includes(p.type) && p.drill === 0.8), f.name);
    const g = gridPins(x);
    assert.deepEqual([g.offGrid, g.smd, g.pins.length], [[], [], PARTS[t].pins.length], f.name);
    assert.ok(x.drawing?.layer === 'F.Fab', f.name);
  }
  assert.equal(partFootprint('led').text, `(footprint "Silinx_led"
\t(version ${FOOTPRINT_VERSION})
\t(generator "silinx")
\t(generator_version "${VERSION}")
\t(layer "F.Cu")
\t(descr "LED: Silinx's library part, its pins on a breadboard's 2.54 mm grid")
\t(tags "Silinx led")
\t(property "Reference" "REF**" (at 0 -2.77 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
\t(property "Value" "Silinx_led" (at 0 5.31 0) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))
\t(attr through_hole)
\t(fp_circle (center 0 1.27) (end 2.5 1.27) (stroke (width 0.1) (type solid)) (fill none) (layer "F.Fab"))
\t(fp_circle (center 0 1.27) (end 3 1.27) (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd"))
\t(pad "1" thru_hole rect (at 0 0) (size 1.6 1.6) (drill 0.8) (layers "*.Cu" "*.Mask"))
\t(pad "2" thru_hole circle (at 0 2.54) (size 1.6 1.6) (drill 0.8) (layers "*.Cu" "*.Mask"))
)
`);
  assert.deepEqual(['7400', 'seg7-cc', 'dip-8'].map(partFootprint), [null, null, null]);
});

test('partsLibrary: some parts, each once; what it refuses; a symbol of the library\'s other parts without its footprint', () => {
  const lib = partsLibrary(['led', '7404', 'led', 'seg7-cc']);
  assert.deepEqual(readKicadSymLib(lib.symbols).symbols.map((s) => s.name), ['Silinx_led', 'SN74LS04', 'Silinx_seg7-cc']);
  assert.deepEqual(lib.footprints.map((f) => f.name), ['Silinx_led.kicad_mod']);
  assert.throws(() => partsLibrary(['breadboard-half']), /^Error: 'breadboard-half' is not a part of the library with pins \(circuit_parts: a breadboard has none\)$/);
  assert.throws(() => partsLibrary(['nope']), /^Error: 'nope' is not a part of the library with pins/);
  assert.throws(() => partsLibrary([]), /^Error: no part chosen$/);
  assert.throws(() => partSymbol('breadboard-full'), /^Error: 'breadboard-full' is not a part of the library with pins$/);
  // (its footprint missing: the LED no part, a display still one, on its DIP)
  const r = kicadPartsOf({ 'parts/Silinx.kicad_sym': lib.symbols });
  assert.deepEqual(r.skipped.map((x) => x.reason), ['its Silinx.Model is led but its footprint Silinx:Silinx_led is not in the project\'s parts nor a DIP or a pin header']);
  assert.deepEqual(r.defs.map((d) => [d.kicad.symbol, d.behaves, d.kind]), [['SN74LS04', '7404', 'ic'], ['Silinx_seg7-cc', null, 'drawn']]);
});

test('partsPackage with the library\'s parts: its symbols and Silinx.pretty, read back; imported into a project, its parts as the library\'s', async () => {
  const meta = { identifier: 'org.example.silinx', name: 'Silinx parts', description: 'Silinx\'s library', author: 'A Teacher', licence: 'AGPL-3.0-only', version: '1.0' };
  const pkg = await readPcmPackage(await partsPackage({}, meta, CODEC, { parts: EXPORTED_PARTS }), CODEC);
  const lib = partsLibrary();
  assert.deepEqual(pkg.symbols.map((s) => [s.name, s.text === lib.symbols]), [['Silinx.kicad_sym', true]]);
  assert.deepEqual(pkg.footprints.map((f) => `${f.library}/${f.name}`), lib.footprints.map((f) => `Silinx/${f.name}`));
  assert.deepEqual(packageContents(pkg), [{ name: 'Silinx.kicad_sym', parts: EXPORTED_PARTS.length, ics: [...EXPORTED_ICS, ...BEHAVE].sort((a, b) => EXPORTED_PARTS.indexOf(a) - EXPORTED_PARTS.indexOf(b))
    .map((t) => ({ symbol: symbolName(t), as: t })), drawn: DRAWN.length, skipped: 0 }]);
  // (parts given, the ICs are not: parts may hold them)
  assert.equal((await readPcmPackage(await partsPackage({}, meta, CODEC, { parts: ['7400'], ics: ['7404'] }), CODEC)).symbols[0].text, partsLibrary(['7400']).symbols);
  // imported into a project (Import KiCad Part… of a .zip, import_part): its library and the footprints its symbols name
  const files = new Map();
  const P = { fileTree: async () => [...files.keys()], readFile: async (n, f) => files.get(f), writeFile: async (n, f, t) => { files.set(f, t); } };
  const r = await importKicadPackage(P, 'p', pkg, { origin: { source: 'org.example.silinx 1.0', author: 'A Teacher', licence: 'AGPL-3.0-only' } });
  assert.deepEqual(r.written, ['parts/Silinx.kicad_sym', ...lib.footprints.map((f) => `parts/Silinx.pretty/${f.name}`)]);
  assert.deepEqual(r.lines, [`parts/Silinx.kicad_sym written: ${EXPORTED_PARTS.length} part(s), ${EXPORTED_ICS.length + 3} of them as ICs of the library (${['button', 'spdt', 'led', ...EXPORTED_ICS].join(', ')}), ${DRAWN.length} drawn only; 0 symbol(s) no part`,
    `${lib.footprints.length} footprint(s) written: parts/Silinx.pretty`]);
  assert.deepEqual(r.parts.filter((p) => !p.behavesAs).map((p) => p.value), DRAWN.map((t) => `Silinx_${t}`));
  setProjectParts([]);
  await assert.rejects(partsPackage({}, meta, CODEC, { parts: ['breadboard-half'] }), { message: '\'breadboard-half\' is not a part of the library with pins (circuit_parts: a breadboard has none)' });
});
