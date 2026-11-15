// How a schematic's wires are drawn (#4081, core/wire-style.js): Direct, Orthogonal, Curved. The ids and labels, a
// drawing's style (a file without one: orthogonal; another editor's default, the circuit's direct), set and read again (older files, a bad one dropped); Direct's
// geometry (core/schcurve.js with st 'direct': a straight line from end to end, or through the wire's own points; the
// point nearest a point, the path's point answering it, crossings and hops on the straight lines, a wire split); a
// style a drawing only: the netlist, Check Schematic, the generated VHDL and Verilog and ISE's .sch the same drawn
// Direct, for the gates example and every module of every example converted to a schematic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as W from '../core/wire-style.js';
import * as C from '../core/schcurve.js';
import { normalizeDoc, newDoc, netlist, generateHdl, splitWiresAt, modulesFromLibrary, wireCrossings } from '../core/schdoc.js';
import { exportIseSch } from '../core/isesch-export.js';
import { convertModuleToSchematic } from '../core/hdl-to-sch.js';
import { compile } from '../core/compile.js';
import { example, EXAMPLES } from './examples-lib.mjs';

const P = (x, y) => ({ x, y });
const near = (a, b, tol = 0.11) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

test('the styles: their ids and labels in the menu\'s order, the menu\'s title', () => {
  assert.deepEqual(W.WIRE_STYLES.map(s => [s.id, s.label]), [['direct', 'Direct'], ['orthogonal', 'Orthogonal'], ['curved', 'Curved']]);
  assert.equal(W.WIRE_STYLE_TITLE, 'Wires');
  assert.ok(Object.isFrozen(W.WIRE_STYLES) && W.WIRE_STYLES.every(Object.isFrozen), 'shared, not to be changed');
  for (const s of ['direct', 'orthogonal', 'curved']) assert.equal(W.isWireStyle(s), true, s);
  for (const s of [undefined, null, '', 'Curved', 'straight', 1, {}]) assert.equal(W.isWireStyle(s), false, String(s));
});

test('a drawing\'s style: none (an older file) or an unknown one is orthogonal; set, the default dropped; an unknown one refused', () => {
  assert.equal(W.wireStyleOf({}), 'orthogonal');
  assert.equal(W.wireStyleOf(null), 'orthogonal');
  assert.equal(W.wireStyleOf({ wireStyle: 'zigzag' }), 'orthogonal');
  assert.equal(W.wireStyleOf({ wireStyle: 'curved' }), 'curved');
  assert.equal(W.wireStyleOf({ wireStyle: 'direct' }), 'direct');
  assert.deepEqual([{}, { wireStyle: 'direct' }, { wireStyle: 'curved' }].map(d => W.isFreeStyle(d)), [false, true, true]);
  const d = {};
  assert.deepEqual(W.setWireStyle(d, 'direct'), { wireStyle: 'direct' });
  assert.deepEqual(W.setWireStyle(d, 'curved'), { wireStyle: 'curved' });
  assert.deepEqual(W.setWireStyle(d, 'orthogonal'), {}, 'the default: as a file without it');
  assert.throws(() => W.setWireStyle(d, 'zigzag'), /unknown wire style 'zigzag': direct, orthogonal, curved/);
  assert.deepEqual(d, {}, 'unchanged when refused');
});

test('another editor\'s default (the circuit editor\'s direct, #4080): none reads as it, it is dropped, orthogonal kept', () => {
  const D = 'direct';
  assert.equal(W.wireStyleOf({}, D), 'direct');
  assert.equal(W.wireStyleOf({ wireStyle: 'zigzag' }, D), 'direct');
  assert.equal(W.wireStyleOf({ wireStyle: 'orthogonal' }, D), 'orthogonal');
  assert.equal(W.wireStyleOf({ wireStyle: 'curved' }, D), 'curved');
  assert.deepEqual([{}, { wireStyle: 'orthogonal' }, { wireStyle: 'curved' }].map(d => W.isFreeStyle(d, D)), [true, false, true]);
  const d = {};
  assert.deepEqual(W.setWireStyle(d, 'orthogonal', D), { wireStyle: 'orthogonal' }, 'not the default: written');
  assert.deepEqual(W.setWireStyle(d, 'curved', D), { wireStyle: 'curved' });
  assert.deepEqual(W.setWireStyle(d, 'direct', D), {}, 'the default: dropped');
  assert.throws(() => W.setWireStyle(d, 'zigzag', D), /unknown wire style 'zigzag'/);
  const norm = ws => W.normalizeWireStyle({ wireStyle: ws }, D);
  assert.deepEqual(['orthogonal', 'curved', 'direct', 'zigzag', null].map(norm), [{ wireStyle: 'orthogonal' }, { wireStyle: 'curved' }, {}, {}, {}]);
  // (the schematic's default unchanged: no dflt, orthogonal)
  assert.deepEqual(['orthogonal', 'direct'].map(ws => W.normalizeWireStyle({ wireStyle: ws })), [{}, { wireStyle: 'direct' }]);
  assert.equal(W.wireStyleOf({}), 'orthogonal');
});

test('a schematic read: no style (older files) orthogonal, direct and curved kept, orthogonal and a bad one dropped; saved and read again', () => {
  const read = ws => normalizeDoc({ ...newDoc('t'), ...(ws === undefined ? {} : { wireStyle: ws }) });
  assert.equal('wireStyle' in read(undefined), false);
  assert.equal(read('direct').wireStyle, 'direct');
  assert.equal(read('curved').wireStyle, 'curved');
  for (const ws of ['orthogonal', 'Direct', 'zigzag', 3, null, true]) assert.equal('wireStyle' in read(ws), false, String(ws));
  for (const ws of ['direct', 'curved']) assert.equal(normalizeDoc(JSON.parse(JSON.stringify(read(ws)))).wireStyle, ws, `${ws} again`);
});

// ------------------------------------------------------------------ Direct's geometry
test('Direct: a wire with no curve of its own a straight line from end to end, whatever its rectilinear path', () => {
  const w = { id: 'W1', points: [P(0, 0), P(100, 0), P(100, 80), P(200, 80)] };
  assert.deepEqual(C.curveKnots(w, 'direct'), [P(0, 0), P(200, 80)]);
  assert.equal(C.curveD(w, 'direct'), 'M0,0 L200,80');
  assert.deepEqual(C.sampleCurve(w, 16, 'direct'), [P(0, 0), P(200, 80)]);
  // (the Béziers of the straight line: its thirds, a straight line)
  const [[a, c1, c2, b]] = C.curveBeziers(w, 'direct');
  assert.deepEqual([a, b], [P(0, 0), P(200, 80)]);
  assert.ok(near(c1, P(200 / 3, 80 / 3)) && near(c2, P(400 / 3, 160 / 3)));
  // curved, the same wire: its bends rounded (other knots)
  assert.equal(C.curveKnots(w).length, 4);
  assert.match(C.curveD(w), / C/);
  // its rectilinear path untouched
  assert.deepEqual(w.points, [P(0, 0), P(100, 0), P(100, 80), P(200, 80)]);
});

test('Direct: through the wire\'s own points, the same knots as its curve, straight lines between them', () => {
  const w = C.setCurve({ id: 'W1', points: [P(0, 0), P(0, 100), P(200, 100)] }, [P(60, 20), P(140, 40)]);
  assert.deepEqual(C.curveKnots(w, 'direct'), C.curveKnots(w, 'curved'), 'its own curve\'s knots either way');
  assert.equal(C.curveD(w, 'direct'), 'M0,0 L60,20 L140,40 L200,100');
  assert.equal(C.curveBeziers(w, 'direct').length, 3);
  // an own curve of no points: a straight line (as Curved draws it)
  assert.equal(C.curveD(C.setCurve({ id: 'W2', points: [P(0, 0), P(50, 0), P(50, 50)] }, []), 'direct'), 'M0,0 L50,50');
  // the ends moved (a symbol moved): the points follow, each at the same fraction along the ends and the same distance
  // to their side ((60,20): 0.28 along, 8.9 px to the side: (112,56) + (4,-8)), straight lines between them
  const moved = { ...w, points: [P(0, 0), P(0, 200), P(400, 200)] };
  assert.equal(C.curveD(moved, 'direct'), 'M0,0 L116,48 L268,104 L400,200');
});

test('Direct: the point nearest a point on the straight lines, the point of the path answering it, the point at a fraction', () => {
  const w = { id: 'W1', points: [P(0, 0), P(100, 0), P(100, 100)] };
  // the diagonal from (0,0) to (100,100): (60,40) is 14.1 px from it, at its middle's fraction 0.5
  const n = C.curveNearest(w, P(60, 40), 'direct');
  assert.ok(Math.abs(n.d - Math.SQRT2 * 10) < 1e-9 && Math.abs(n.f - 0.5) < 1e-9, JSON.stringify(n));
  assert.ok(near(n.q, P(50, 50)));
  // drawn curved, the same point is elsewhere on its curve
  assert.notEqual(Math.round(C.curveNearest(w, P(60, 40)).d * 10), Math.round(n.d * 10));
  assert.ok(near(C.curvePointAt(w, 0.25, 'direct'), P(25, 25)));
  // the path's point at the same fraction of its length, on the grid: the corner (100,0)
  assert.deepEqual(C.curveToPath(w, P(60, 40), 10, 'direct'), P(100, 0));
  assert.deepEqual(C.curveToPath(w, P(5, 5), 10, 'direct'), P(10, 0));
});

test('Direct: straight lines cross where the technical drawing\'s paths do not; a hop where they do; a split shares the points', () => {
  // two wires whose paths run apart (A an L, B around it) but whose straight lines cross at (120,120)
  const A = { id: 'A', points: [P(0, 0), P(0, 200), P(200, 200)] }, B = { id: 'B', points: [P(200, 0), P(300, 0), P(300, 300), P(0, 300)] };
  assert.deepEqual(wireCrossings({ ...newDoc('t'), wires: [A, B] }), [], 'the technical drawing: no crossing');
  const X = C.curveCrossings({ wireStyle: 'direct', wires: [A, B] });
  assert.equal(X.length, 1);
  // (A hops: the more horizontal there, 45° against B's 56°; s its length to there)
  assert.equal(X[0].wire, 'A');
  assert.deepEqual([X[0].x, X[0].y], [120, 120]);
  assert.ok(Math.abs(X[0].s - 120 * Math.SQRT2) < 0.01);
  assert.equal(C.curveHopD(A, [X[0].s], 16, 'direct'), 'M0,0 L116.5,116.5 A5,5 0 0 1 123.5,123.5 L200,200');
  // a wire split at a point of its path (#678): its own points shared between the two, in place on the sheet
  const sd = normalizeDoc({ ...newDoc('t'), wireStyle: 'direct', wires: [C.setCurve({ id: 'W1', points: [P(0, 0), P(200, 0)] }, [P(50, 30), P(150, 30)])] });
  splitWiresAt(sd, [P(100, 0)]);
  assert.equal(sd.wires.length, 2);
  const abs = sd.wires.map(w => C.curveKnots(w, 'direct').map(p => [Math.round(p.x), Math.round(p.y)]));
  assert.deepEqual(abs, [[[0, 0], [50, 30], [100, 0]], [[100, 0], [150, 30], [200, 0]]]);
});

// ------------------------------------------------------------------ a drawing only: the same netlist, HDL and .sch
// the document drawn Direct: the style chosen, some wires through points of their own, the others straight
function directCopy(doc) {
  const d = JSON.parse(JSON.stringify(doc));
  W.setWireStyle(d, 'direct');
  d.wires.forEach((w, k) => {
    const a = w.points[0], b = w.points.at(-1);
    if (k % 2) C.setCurve(w, [P((a.x + b.x) / 2 + 17, (a.y + b.y) / 2 - 29)]);
  });
  return normalizeDoc(d);
}
const nlView = nl => ({ nets: nl.nets, wireNet: [...nl.wireNet].map(([k, n]) => [k, n.id]), junctions: nl.junctions, diagnostics: nl.diagnostics });
function sameEitherWay(doc, modules, what) {
  const dr = directCopy(doc);
  assert.equal(dr.wireStyle, 'direct');
  assert.deepEqual(dr.wires.map(w => w.points), doc.wires.map(w => w.points), `${what}: the rectilinear paths kept`);
  assert.deepEqual(nlView(netlist(dr, { modules })), nlView(netlist(doc, { modules })), `${what}: the netlist and Check Schematic's messages`);
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(generateHdl(dr, { lang, modules }), generateHdl(doc, { lang, modules }), `${what}: the ${lang}`);
  const ise = d => exportIseSch(d, { modules, timestamp: '2026-11-15T12:00:00' });
  assert.deepEqual(ise(dr), ise(doc), `${what}: ISE's .sch (its wires the rectilinear paths) and its warnings`);
}

test('the gates example drawn Direct: its netlist (no message), VHDL, Verilog and ISE .sch the same', () => {
  const ex = example('gates');
  const doc = normalizeDoc(JSON.parse(fs.readFileSync(path.join(ex.dir, 'src/gates.sch.json'), 'utf8')));
  assert.equal('wireStyle' in doc, false, 'the example: orthogonal');
  assert.deepEqual(netlist(directCopy(doc)).diagnostics, [], 'no warnings');
  sameEitherWay(doc, {}, 'gates');
});

const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
for (const name of EXAMPLES) {
  test(`every module of the example ${name} as a schematic, drawn Direct: the same netlist, HDL and ISE .sch`, async () => {
    const ex = example(name);
    const lib = compile(ex.sources);
    const modules = modulesFromLibrary(lib, { sources: ex.sources });
    const files = new Set(ex.sources.map(s => s.path));
    let n = 0;
    for (const m of lib.modules.values()) {
      if (!files.has(m.archFile || m.file)) continue;
      const r = await convertModuleToSchematic({ sources: ex.sources, module: m.name, layout: g => elk.layout(g) });
      if (!r.doc.wires.length) continue;
      sameEitherWay(normalizeDoc(r.doc, { modules }), modules, `${name}/${m.name}`);
      n++;
    }
    assert.ok(n >= 1, `${name}: schematics with wires`);
  });
}
