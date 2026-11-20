// The circuit editor's wire handles (web/js/circuit-wire-drag.js, #4930, #4931): a drag started on the selected wire's
// handle (not another wire's, nor with no wire selected), moved over grid points (one edit from the circuit it started
// on; a refused point left out), a bend removed by its point.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';
import { halfAdder } from './circuit-helpers.mjs';

const { wireDragStart, wireDragTo, bendRemoved } = await import('../web/js/circuit-wire-drag.js');
// a pointer event on a handle `h` of the wire `id`'s handles group (a stand-in for the DOM's closest)
const on = (id, h) => {
  const group = { dataset: { id, kind: 'wire' } };
  const el = { dataset: { handle: h }, closest: (s) => (s === '[data-kind=wire]' ? group : el) };
  return { target: { closest: (s) => (s.startsWith('[data-handle') && (s === '[data-handle]' || h.startsWith('bend:')) ? el : null) } };
};
const pts = (m, id) => m.wires.find((w) => w.id === id).points;

test('a wire handle\'s drag: started on the selected wire\'s, moved over grid points from where it started; else none', () => {
  const m = halfAdder(), sel = { kind: 'wire', id: 'ws' };
  const d = wireDragStart(on('ws', 'mid:1'), sel, m);
  assert.deepEqual({ ...d, base: d.base === m }, { kind: 'wire', id: 'ws', handle: { kind: 'mid', index: 1 }, base: true, at: null, moved: false });
  assert.deepEqual(pts(wireDragTo(d, [15, 13]), 'ws'), [[6, 9], [6, 12], [15, 13], [24, 12], [24, 4]]);
  assert.equal(wireDragTo(d, [15, 13]), null, 'the same point: no change');
  assert.deepEqual(pts(wireDragTo(d, [15, 14]), 'ws'), [[6, 9], [6, 12], [15, 14], [24, 12], [24, 4]], 'one bend: from the circuit it started on');
  assert.equal(d.moved, true);
  // (an end onto its other end: refused, left out)
  const e = wireDragStart(on('wc', 'end:1'), { kind: 'wire', id: 'wc' }, m);
  assert.equal(wireDragTo(e, [15, 10]), null);
  assert.equal(e.moved, false);
  // no drag: another wire's handle, a part selected, no handle under the pointer
  assert.equal(wireDragStart(on('wc', 'end:0'), sel, m), null);
  assert.equal(wireDragStart(on('ws', 'end:0'), { kind: 'part', id: 'U1' }, m), null);
  assert.equal(wireDragStart({ target: { closest: () => null } }, sel, m), null);
});

test('a bend removed by its point (a double click there); none elsewhere or with no wire selected', () => {
  const m = halfAdder(), sel = { kind: 'wire', id: 'ws' };
  assert.deepEqual(pts(bendRemoved([24, 12], sel, m).model, 'ws'), [[6, 9], [6, 12], [24, 4]]);
  assert.equal(bendRemoved([24, 4], sel, m), null, 'an end: not a bend');
  assert.equal(bendRemoved([10, 10], sel, m), null);
  assert.equal(bendRemoved([24, 12], { kind: 'part', id: 'U1' }, m), null);
  assert.equal(bendRemoved([24, 12], null, m), null);
});
