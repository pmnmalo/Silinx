// The wires' style each participant's own in a shared project (#4239, core/collab-model.js): a schematic's and a
// circuit's wireStyle (Direct, Orthogonal, Curved) is how one sees the drawing, never in its shared structure: a
// participant's put of another style changes nothing there (no update sent) and its other changes still merge; the
// owner's file read again with a new style changes nothing either; withView puts a file's (or an editor's) style back;
// a copy of the room (Keep a Copy, core/collab-keep.js) keeps the owner's file's; the other drawings have no view field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as Y from 'yjs';
import { putDrawing, drawingModel, syncDrawing, viewFields, withView, withoutView, drawingText } from '../core/collab-model.js';
import { projectDoc, publishProject } from '../core/collab-doc.js';
import { followedCopy } from '../core/collab-keep.js';

const SCH = 'src/gates.sch.json', CIRC = 'src/breadboard.circ.json';
const sch0 = JSON.parse(fs.readFileSync('examples/gates/src/gates.sch.json', 'utf8'));
const circ0 = JSON.parse(fs.readFileSync('examples/breadboard/src/breadboard.circ.json', 'utf8'));
const PROJECT = { name: 'gates', top: 'gates', device: { part: 'xc3s250e' }, fileTree: [SCH, CIRC] };
// the owner's room, its files' texts with their styles
function room(schStyle = 'curved', circStyle = 'orthogonal') {
  const doc = projectDoc(), bases = new Map();
  const files = { [SCH]: drawingText(SCH, { ...sch0, wireStyle: schStyle }), [CIRC]: drawingText(CIRC, { ...circ0, wireStyle: circStyle }) };
  publishProject(doc, { project: PROJECT, files, owner: 'Ana', bases });
  return { doc, bases, files };
}
const updates = (doc, fn) => { let n = 0; const on = () => { n++; }; doc.on('update', on); fn(); doc.off('update', on); return n; };

test('the view fields: a schematic\'s and a circuit\'s wires\' style; none for the other drawings', () => {
  assert.deepEqual(viewFields(SCH), ['wireStyle']);
  assert.deepEqual(viewFields(CIRC), ['wireStyle']);
  for (const p of ['src/a.fsm.json', 'src/a.bool.json', 'src/a.asm.json', 'src/a.pn.json', 'src/a.vhd']) assert.deepEqual(viewFields(p), []);
  assert.deepEqual(withoutView(SCH, { a: 1, wireStyle: 'curved' }), { a: 1 });
  assert.deepEqual(withoutView('src/a.fsm.json', { a: 1, wireStyle: 'curved' }), { a: 1, wireStyle: 'curved' });
});

test('withView: the style of a model or of a file\'s text put back, none when it has none, a broken text ignored', () => {
  assert.deepEqual(withView(SCH, { a: 1, wireStyle: 'direct' }, { wireStyle: 'curved' }), { a: 1, wireStyle: 'curved' });
  assert.deepEqual(withView(SCH, { a: 1, wireStyle: 'direct' }, '{"wireStyle":"orthogonal","x":2}'), { a: 1, wireStyle: 'orthogonal' });
  assert.deepEqual(withView(SCH, { a: 1, wireStyle: 'direct' }, '{"x":2}'), { a: 1 });
  assert.deepEqual(withView(SCH, { a: 1, wireStyle: 'direct' }, 'not json'), { a: 1 });
  assert.deepEqual(withView(SCH, { a: 1 }, null), { a: 1 });
});

test('the structure has no wires\' style: the merged model has none, and withView gives the owner\'s file\'s', () => {
  const { doc, files } = room();
  for (const p of [SCH, CIRC]) {
    const { model } = drawingModel(doc, p);
    assert.equal('wireStyle' in model, false, p);
    assert.equal(withView(p, model, files[p]).wireStyle, JSON.parse(files[p]).wireStyle, p);
  }
});

test('a participant\'s put of another style: no change of the structure, nothing sent', () => {
  const { doc } = room();
  for (const p of [SCH, CIRC]) {
    const before = JSON.stringify(drawingModel(doc, p).model);
    const n = updates(doc, () => putDrawing(doc, p, { ...drawingModel(doc, p).model, wireStyle: 'direct' }, { client: 7 }));
    assert.equal(n, 0, `${p}: an update sent`);
    assert.equal(JSON.stringify(drawingModel(doc, p).model), before);
  }
});

test('a style changed with another change: only the other change merges, and the other participant\'s view keeps its own', () => {
  const { doc } = room();
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(doc));
  doc.on('update', (u, o) => { if (o !== 'remote') Y.applyUpdate(b, u, 'remote'); });
  const m = drawingModel(doc, SCH).model;
  const moved = { ...m, wireStyle: 'direct', symbols: m.symbols.map((s, i) => (i === 0 ? { ...s, y: s.y + 40 } : s)) };
  putDrawing(doc, SCH, moved, { client: 7 });
  const there = drawingModel(b, SCH).model;
  assert.equal(there.symbols[0].y, m.symbols[0].y + 40);
  assert.equal('wireStyle' in there, false);
  // (the other participant's editor, Curved, keeps its style when the merge is applied, as collab-drawing.js does)
  assert.equal(withView(SCH, there, { ...there, wireStyle: 'curved' }).wireStyle, 'curved');
});

test('the owner\'s file read again with another style: nothing changes in the structure, nothing sent', () => {
  const { doc, bases, files } = room();
  for (const p of [SCH, CIRC]) {
    const text = drawingText(p, { ...JSON.parse(files[p]), wireStyle: 'direct' });
    const before = JSON.stringify(drawingModel(doc, p).model);
    assert.equal(updates(doc, () => syncDrawing(doc, p, text, bases)), 0, p);
    assert.equal(JSON.stringify(drawingModel(doc, p).model), before);
    assert.equal(bases.get(p), text);
  }
});

test('a copy of the room (Keep a Copy) keeps the owner\'s file\'s style, a participant\'s change merged', () => {
  const { doc } = room('curved', 'orthogonal');
  const m = drawingModel(doc, SCH).model;
  putDrawing(doc, SCH, { ...m, wireStyle: 'direct', symbols: m.symbols.map((s, i) => (i === 0 ? { ...s, x: s.x + 20 } : s)) }, { client: 7 });
  const c = followedCopy(doc);
  const sch = JSON.parse(c.entries.find(e => e.path === SCH).data), circ = JSON.parse(c.entries.find(e => e.path === CIRC).data);
  assert.equal(sch.wireStyle, 'curved');
  assert.equal(sch.symbols[0].x, m.symbols[0].x + 20);
  assert.equal(circ.wireStyle, 'orthogonal');
});
