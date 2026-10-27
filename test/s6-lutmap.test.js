// research/s6 stage S6-B (#725), without ISE: gen-lutmap6.mjs's designs (every slice's four LUTs numbered) and
// ana-lutmap6.mjs's analysis on frame data built here from a known layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lutSlices, lutDesign, lutMapDesigns, idBits, LUTS } from '../research/s6/gen-lutmap6.mjs';
import { setBits, lutBits, lutMap } from '../research/s6/ana-lutmap6.mjs';
import { S6_DEVICES, emptyFdri, FRAME_WORDS } from '../core/fpga/s6/bitstream.js';

const SLICES = [{ name: 'SLICE_X0Y0', kind: 'L', tile: 'CLEXL_X1Y0' }, { name: 'SLICE_X1Y0', kind: 'X', tile: 'CLEXL_X1Y0' },
  { name: 'SLICE_X2Y1', kind: 'M', tile: 'CLEXM_X2Y1' }];

test('gen-lutmap6: the slices by X then Y; a design\'s XDL; the designs of a part', () => {
  const sites = { slices: new Map([['b', { name: 'SLICE_X1Y0', kind: 'X', x: 1, y: 0, tile: 'T1' }], ['a', { name: 'SLICE_X0Y5', kind: 'M', x: 0, y: 5, tile: 'T0' }],
    ['c', { name: 'SLICE_X0Y1', kind: 'L', x: 0, y: 1, tile: 'T0' }]]) };
  assert.deepEqual(lutSlices(sites).map(s => s.name), ['SLICE_X0Y1', 'SLICE_X0Y5', 'SLICE_X1Y0']);
  const x = lutDesign('xc6slx16csg324-3', SLICES.slice(0, 2), n => (n === 1 ? 'A3' : n === 6 ? '1' : null));
  assert.equal(x, 'design "lutmap" xc6slx16csg324-3 v3.2 ,\n  cfg "";\n'
    + 'inst "SLICE_X0Y0" "SLICEL",placed CLEXL_X1Y0 SLICE_X0Y0  ,\n  cfg " B6LUT:SLICE_X0Y0.B:#LUT:O6=A3 " ;\n'
    + 'inst "SLICE_X1Y0" "SLICEX",placed CLEXL_X1Y0 SLICE_X1Y0  ,\n  cfg " C6LUT:SLICE_X1Y0.C:#LUT:O6=1 " ;\n');
  const d = lutMapDesigns('xc6slx16csg324-3', SLICES);
  assert.equal(idBits(SLICES), 4);
  assert.deepEqual(Object.keys(d), ['xc6slx16-csg324-3.one.xdl', 'xc6slx16-csg324-3.zero.xdl', ...[1, 2, 3, 4, 5, 6].map(k => `xc6slx16-csg324-3.a${k}.xdl`),
    ...[0, 1, 2, 3].map(j => `xc6slx16-csg324-3.id${j}.xdl`)]);
  assert.match(d['xc6slx16-csg324-3.a6.xdl'], /D6LUT:SLICE_X2Y1\.D:#LUT:O6=A6 " ;/);
  assert.match(d['xc6slx16-csg324-3.zero.xdl'], /"SLICEM",placed CLEXM_X2Y1 SLICE_X2Y1 {2},\n {2}cfg " A6LUT:SLICE_X2Y1\.A:#LUT:O6=0 /);
  // id3: LUTs 8 … 11, the third slice's
  assert.doesNotMatch(d['xc6slx16-csg324-3.id3.xdl'], /SLICE_X[01]Y0/);
  assert.equal((d['xc6slx16-csg324-3.id3.xdl'].match(/O6=1/g) || []).length, 4);
  assert.equal(idBits(new Array(2278)), 14);
  assert.equal(idBits(new Array(6822)), 15);
});

// frame data from a layout: slice i at frame 10 + 40 i, bit 100; LUT l entry e at (l * 4 + (e >> 4), e & 15); a used
// slice also sets (20, 0) from its base
const dev = S6_DEVICES.xc6slx16;
function build(slices, rel = (l, e) => [l * 4 + (e >> 4), e & 15]) {
  const base = emptyFdri(dev), at = (i, l, e) => { const [f, b] = rel(l, e, i); return [10 + 40 * i + f, 100 + b]; };
  const fdri = (lut, used) => {
    const x = Uint16Array.from(base);
    const set = ([f, b]) => { x[f * FRAME_WORDS + (b >> 4)] |= 0x8000 >> (b & 15); };
    slices.forEach((_, i) => {
      let any = false;
      LUTS.forEach((_, l) => { for (let e = 0; e < 64; e++) { const v = lut(i * 4 + l, e); if (v !== null) any = true; if (v) set(at(i, l, e)); } });
      if (any && used) set([10 + 40 * i + 20, 100]);
    });
    return x;
  };
  return { base, designs: { one: fdri(() => 1, true), zero: fdri(() => 0, true), a: [0, 1, 2, 3, 4, 5].map(k => fdri((n, e) => (e >> k) & 1, true)),
    id: [0, 1, 2, 3].map(j => fdri(n => ((n >> j) & 1 ? 1 : null), true)) } };
}

test('ana-lutmap6: every LUT\'s 64 entries found, the used bits apart, the layout per kind and each slice\'s base', () => {
  const { base, designs } = build(SLICES);
  assert.equal(setBits(designs.one, base, dev).length, 3 * 4 * 64 + 3);
  const { luts, used, problems } = lutBits(designs, base, dev);
  assert.deepEqual(problems, []);
  assert.equal(luts.size, 12);
  assert.deepEqual(used, [0, 1, 2].map(i => (30 + 40 * i) * 1040 + 100));
  assert.equal(luts.get(5)[17], (50 + 4 + 1) * 1040 + 101, 'slice 1, LUT B, entry 17');
  const m = lutMap(luts, SLICES);
  assert.deepEqual(m.problems, []);
  assert.deepEqual(Object.keys(m.kinds).sort(), ['L', 'M', 'X']);
  assert.deepEqual(m.kinds.M.D[63], [15, 15]);
  assert.deepEqual(m.kinds.L.A[0], [0, 0]);
  assert.deepEqual(m.slices, { SLICE_X0Y0: [10, 100], SLICE_X1Y0: [50, 100], SLICE_X2Y1: [90, 100] });
});

test('ana-lutmap6: what it reports: a LUT not found, an entry twice, a slice laid out unlike the others of its kind', () => {
  // the third slice (a SLICEM) left out of every design: its LUTs are not found
  const two = build(SLICES.slice(0, 2));
  const r = lutBits(two.designs, two.base, dev);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(lutMap(r.luts, SLICES).problems, ['SLICE_X2Y1: 4 LUTs not found']);
  // the a1 design lost: entries 2k and 2k+1 land at one place, and half are not found
  const { base, designs } = build(SLICES);
  const lost = lutBits({ ...designs, a: [designs.zero, ...designs.a.slice(1)] }, base, dev);
  assert.match(lost.problems[0], /^LUT 0 entry 0 at two places/);
  assert.ok(lost.problems.some(p => /^LUT 11: 32 entries not found$/.test(p)));
  // two slices of a kind laid out differently
  const odd = build([SLICES[0], { ...SLICES[0], name: 'SLICE_X4Y0' }], (l, e, i) => (i === 1 && l === 0 ? [e >> 4, (e & 15) ^ 1] : [l * 4 + (e >> 4), e & 15]));
  const o = lutBits(odd.designs, odd.base, dev);
  assert.deepEqual(lutMap(o.luts, [SLICES[0], { ...SLICES[0], name: 'SLICE_X4Y0' }]).problems, ['SLICE_X4Y0: its LUTs are not laid out as the other SLICELs\'']);
});
