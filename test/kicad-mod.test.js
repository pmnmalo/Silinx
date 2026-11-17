// KiCad's footprints (#4279): core/kicad-mod.js on hand-written fixtures (test/fixtures/kicad/parts.pretty/): a DIP's
// pads on the 0.1 inch grid, a module's header with a pad off it and its mounting holes, an SMD package, KiCad 5's
// (module …); the footprints' names read as packages, and the symbols' footprint filters
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readKicadFootprint, gridPins, packageOfFootprint, matchesFootprintFilters, footprintDrawing, shapePath, GRID_MM, PAD_TYPES } from '../core/kicad-mod.js';
import { parseSexpr } from '../core/sexpr.js';

const read = (name) => readFileSync(new URL(`./fixtures/kicad/parts.pretty/${name}`, import.meta.url), 'utf8');

test('readKicadFootprint: a DIP-14: its header, its through-hole pads, its 3D model named', () => {
  const fp = readKicadFootprint(read('DIP-14_W7.62mm.kicad_mod'));
  assert.equal(fp.name, 'DIP-14_W7.62mm');
  assert.equal(fp.version, 20240108);
  assert.equal(fp.attr, 'through_hole');
  assert.match(fp.description, /^14-lead through-hole/);
  assert.equal(fp.tags, 'THT DIP DIL PDIP 2.54mm 7.62mm 300mil');
  assert.equal(fp.pads.length, 14);
  assert.deepEqual(fp.pads[0], { number: '1', type: 'thru_hole', shape: 'rect', x: 0, y: 0, rot: 0, size: [1.6, 1.6], drill: 0.8, layers: ['*.Cu', '*.Mask'] });
  assert.deepEqual(fp.models, ['${KICAD8_3DMODEL_DIR}/Package_DIP.3dshapes/DIP-14_W7.62mm.wrl']);
});

test('gridPins: a DIP-14 on the grid: pins 1–7 down one row, 8–14 up the other, three steps apart', () => {
  const g = gridPins(readKicadFootprint(read('DIP-14_W7.62mm.kicad_mod')));
  assert.deepEqual(g.offGrid, []);
  assert.deepEqual(g.smd, []);
  assert.deepEqual(g.pins.map((p) => `${p.number}:${p.dx},${p.dy}`),
    ['1:0,0', '2:0,1', '3:0,2', '4:0,3', '5:0,4', '6:0,5', '7:0,6', '8:3,6', '9:3,5', '10:3,4', '11:3,3', '12:3,2', '13:3,1', '14:3,0']);
  // against an independent reference: KiCad's DIP numbering, counter-clockwise from pin 1 seen from above
  const n = 14, ref = Array.from({ length: n }, (_, k) => (k < n / 2 ? [0, k] : [3, n - 1 - k]));
  assert.deepEqual(g.pins.map((p) => [p.dx, p.dy]), ref);
});

test('a KiCad 5 module: unquoted pad numbers, an oval drill, a pad off the grid, mounting holes left out', () => {
  const fp = readKicadFootprint(read('Module_1x04.kicad_mod'));
  assert.equal(fp.name, 'Module_1x04');
  assert.equal(fp.version, 0);
  assert.equal(fp.attr, 'virtual');
  assert.deepEqual(fp.pads.map((p) => `${p.number || '-'} ${p.type}`), ['1 thru_hole', '2 thru_hole', '3 thru_hole', '4 thru_hole', '5 thru_hole', '- np_thru_hole', '- np_thru_hole']);
  assert.equal(fp.pads[2].drill, 1.2);
  assert.equal(fp.pads[0].rot, 90);
  assert.deepEqual(fp.models, []);
  const g = gridPins(fp);
  assert.deepEqual(g.pins, [{ number: '1', dx: 0, dy: 0 }, { number: '2', dx: 1, dy: 0 }, { number: '3', dx: 2, dy: 0 }, { number: '4', dx: 3, dy: 0 }]);
  assert.deepEqual(g.offGrid, ['5']);
});

test('an SMD package: no pin on the grid, its pads said', () => {
  const fp = readKicadFootprint(read('SOIC-8_3.9x4.9mm_P1.27mm.kicad_mod'));
  assert.equal(fp.attr, 'smd');
  assert.deepEqual(gridPins(fp), { pins: [], offGrid: [], smd: ['1', '2', '3', '4', '5', '6', '7', '8'] });
  assert.equal(fp.pads[0].shape, 'roundrect');
  assert.deepEqual(fp.pads[0].layers, ['F.Cu', 'F.Paste', 'F.Mask']);
});

test('gridPins: within 0.01 mm of a grid point is on it; a pad 1 missing puts every pad off the grid', () => {
  const fp = (pads) => readKicadFootprint(`(footprint "x" ${pads.map(([n, x, y]) => `(pad "${n}" thru_hole circle (at ${x} ${y}))`).join(' ')})`);
  assert.deepEqual(gridPins(fp([['1', 0, 0], ['2', 2.549, -2.531]])).pins, [{ number: '1', dx: 0, dy: 0 }, { number: '2', dx: 1, dy: -1 }]);
  assert.deepEqual(gridPins(fp([['1', 0, 0], ['2', 2.552, 0]])).offGrid, ['2']);
  assert.deepEqual(gridPins(fp([['1', 10.16, 5.08], ['2', 7.62, 5.08]])).pins, [{ number: '1', dx: 0, dy: 0 }, { number: '2', dx: -1, dy: 0 }], 'from pad 1, wherever the origin');
  assert.deepEqual(gridPins(fp([['2', 0, 0], ['3', 2.54, 0]])), { pins: [], offGrid: ['2', '3'], smd: [] });
  assert.equal(GRID_MM, 2.54);
  assert.deepEqual(PAD_TYPES, ['thru_hole', 'smd', 'connect', 'np_thru_hole']);
  assert.equal(readKicadFootprint('(footprint "x" (pad "1" weird circle (at 0 0)))').pads[0].type, 'smd', 'an unknown pad type read as SMD: not on a breadboard');
});

test('readKicadFootprint refuses what is not a footprint; the parser\'s limits apply', () => {
  assert.throws(() => readKicadFootprint('(kicad_symbol_lib (version 20231120))'), /^Error: not a KiCad footprint: it does not start with \(footprint$/);
  assert.throws(() => readKicadFootprint(''), /not a KiCad footprint/);
  assert.throws(() => readKicadFootprint('(footprint "a") (footprint "b")'), /not a KiCad footprint/);
  assert.throws(() => readKicadFootprint('(footprint "a" (pad "1"', {}), /^Error: line 1: a "\(" not closed$/);
  assert.throws(() => readKicadFootprint('(footprint "a" (pad "1" (at 0 0)))', { maxTokens: 3 }), /too many tokens/);
});

test('packageOfFootprint: KiCad\'s names of DIPs, headers and SMD packages, with or without their library', () => {
  assert.deepEqual(packageOfFootprint('Package_DIP:DIP-14_W7.62mm'), { kind: 'dip', pins: 14, rows: 3 });
  assert.deepEqual(packageOfFootprint('DIP-40_W15.24mm_Socket'), { kind: 'dip', pins: 40, rows: 6 });
  assert.deepEqual(packageOfFootprint('PDIP-8_W7.62mm'), { kind: 'dip', pins: 8, rows: 3 });
  assert.deepEqual(packageOfFootprint('Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical'), { kind: 'header', rows: 1, cols: 4, pitch: 2.54 });
  assert.deepEqual(packageOfFootprint('PinSocket_2x08_P2.54mm_Vertical'), { kind: 'header', rows: 2, cols: 8, pitch: 2.54 });
  assert.deepEqual(packageOfFootprint('PinHeader_1x03_P2.00mm_Vertical'), { kind: 'header', rows: 1, cols: 3, pitch: 2 });
  for (const n of ['SOIC-14_3.9x8.7mm_P1.27mm', 'Package_SO:TSSOP-16_4.4x5mm_P0.65mm', 'SOT-23-5', 'QFN-32-1EP_5x5mm_P0.5mm', 'LQFP-48_7x7mm_P0.5mm'])
    assert.deepEqual(packageOfFootprint(n), { kind: 'smd' }, n);
  for (const n of ['', null, 'R_Axial_DIN0207', 'MyFootprint', 'DIPX-14']) assert.equal(packageOfFootprint(n), null, String(n));
});

test('matchesFootprintFilters: ki_fp_filters\' globs', () => {
  const f = ['DIP*W7.62mm*', 'SO14*'];
  assert.equal(matchesFootprintFilters('Package_DIP:DIP-14_W7.62mm', f), true);
  assert.equal(matchesFootprintFilters('DIP-14_W7.62mm_Socket', f), true);
  assert.equal(matchesFootprintFilters('SO14_wide', f), true);
  assert.equal(matchesFootprintFilters('DIP-14_W15.24mm', f), false);
  assert.equal(matchesFootprintFilters('DIP-14_W7X62mm', f), false, 'a dot is a dot');
  assert.equal(matchesFootprintFilters('SOT-23', ['SOT?23']), true);
  assert.equal(matchesFootprintFilters('x', []), false);
  assert.equal(matchesFootprintFilters('a(b)', ['a(b)']), true, 'regular expressions\' characters are literal');
});

test('a footprint\'s drawing (#4315): its F.Fab shapes (a circle, an arc, a line, a rectangle and a polygon, filled or not), not its texts nor its other layers', () => {
  const fp = readKicadFootprint(read('LED_D5.0mm_test.kicad_mod'));
  assert.deepEqual(fp.drawing, { layer: 'F.Fab', shapes: [
    { k: 'circle', c: [1.27, 0], r: 2.5, fill: false, w: 0.1 },
    { k: 'arc', pts: [[-1.23, -1.5], [1.27, -2.9], [3.77, -1.5]], fill: false, w: 0.1 },
    { k: 'line', pts: [[-1.23, -1.5], [-1.23, 1.5]], fill: false, w: 0.1 },
    { k: 'poly', pts: [[0, -0.5], [2.54, -0.5], [2.54, 0.5], [0, 0.5]], fill: true, w: 0 },
    { k: 'poly', pts: [[0, 0], [1, 1], [0, 1]], fill: true, w: 0 }] });
  // the DIP-14 fixture has F.SilkS only: its silkscreen; one with neither: none
  assert.equal(readKicadFootprint(read('DIP-14_W7.62mm.kicad_mod')).drawing.layer, 'F.SilkS');
  assert.equal(readKicadFootprint(read('Module_1x04.kicad_mod')).drawing, null);
});

test('footprintDrawing: KiCad 5\'s shapes (width, an arc by its centre and angle); a shape with too few points left out', () => {
  const d = footprintDrawing(parseSexpr(`(module X (layer F.Cu)
    (fp_arc (start 0 0) (end 1 0) (angle 90) (layer F.Fab) (width 0.15))
    (fp_circle (center 0 0) (end 0 2) (layer F.Fab) (width 0.2))
    (fp_poly (pts (xy 1 1)) (layer F.Fab) (width 0))
    (fp_circle (center 5 5) (end 5 5) (layer F.Fab) (width 0.2)))`)[0]);
  assert.equal(d.shapes.length, 2);
  const [arc, circle] = d.shapes;
  // (90° clockwise on the page, y down: from (1, 0) to (0, 1), by (0.707, 0.707))
  assert.deepEqual(arc.pts.map((q) => q.map((v) => Math.round(v * 1000) / 1000)), [[1, 0], [0.707, 0.707], [0, 1]]);
  assert.deepEqual([arc.w, circle.r, circle.w], [0.15, 2, 0.2]);
});

test('shapePath: a line, a polygon closed, a circle, arcs clockwise and anticlockwise, under and over 180°, three points in a line', () => {
  const id = (q) => q;
  assert.equal(shapePath({ k: 'line', pts: [[0, 0], [1, 2]] }, id, 1), 'M0 0L1 2');
  assert.equal(shapePath({ k: 'poly', pts: [[0, 0], [1, 0], [1, 1]] }, (q) => [q[0] * 10, q[1] * 10 + 5], 10), 'M0 5L10 5L10 15Z');
  assert.equal(shapePath({ k: 'circle', c: [1, 1], r: 0.5 }, (q) => [q[0] * 10, q[1] * 10], 10), 'M5 10a5 5 0 1 0 10 0a5 5 0 1 0 -10 0Z');
  assert.equal(shapePath({ k: 'arc', pts: [[1, 0], [0, 1], [-1, 0]] }, id, 1), 'M1 0A1 1 0 0 1 -1 0');
  assert.equal(shapePath({ k: 'arc', pts: [[1, 0], [0, -1], [-1, 0]] }, id, 1), 'M1 0A1 1 0 0 0 -1 0');
  assert.equal(shapePath({ k: 'arc', pts: [[1, 0], [0, -1], [0, 1]] }, id, 1), 'M1 0A1 1 0 1 0 0 1');
  assert.equal(shapePath({ k: 'arc', pts: [[0, 0], [1, 1], [2, 2]] }, id, 1), 'M0 0L2 2');
});
