// A circuit's moves that keep its connections (#4059), a breadboard turned (#4065), copy and paste (#4066):
// core/circuit-edit.js, the editor's and the MCP server's edit_circuit's. The connections checked against the circuit's
// nets before the edit (core/circuit-net.js), an independent reckoning of what joins what.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partHoles, partPins } from '../core/circuit-parts.js';
import { circuitNets } from '../core/circuit-net.js';
import { checkCircuit } from '../core/circuit-check.js';
import { movePart, rotatePart, copyParts, pasteParts, addPart, pointOf } from '../core/circuit-edit.js';
import { halfAdder, icBench } from './circuit-helpers.mjs';

// what joins what: each net's pins, sorted
const joins = (m) => circuitNets(m).nets.map((n) => n.pins.map((q) => `${q.part}.${q.n}`).sort().join(' ')).filter(Boolean).sort();
const part = (m, id) => m.parts.find((p) => p.id === id);

test('a breadboard moved carries the parts on it, and the wires follow: the connections the same, the check clean', () => {
  const m = halfAdder();
  const r = movePart(m, 'BB1', [3, 5]);
  assert.equal(r.error, undefined);
  // (the ICs and the LEDs are on it; the switches and the supply beside it stay)
  for (const [id, x, y] of [['BB1', 3, 5], ['U1', 7, 12], ['U2', 16, 12], ['D1', 27, 7], ['D2', 29, 7], ['S1', -6, 9], ['P1', -4, -4]]) assert.deepEqual([part(r.model, id).x, part(r.model, id).y], [x, y], id);
  assert.deepEqual(joins(r.model), joins(m));
  assert.deepEqual(checkCircuit(r.model), checkCircuit(m));
  // a wire with both ends on it moved whole, its bends too; one from a switch beside it: its end on the board only
  assert.deepEqual(r.model.wires.find((w) => w.id === 'ws').points, [[9, 14], [9, 17], [27, 17], [27, 9]]);
  assert.deepEqual(r.model.wires.find((w) => w.id === 'wb1').points, [[-6, 10], [-5, 10], [-5, 11], [8, 16]]);
});

test('Keep connections off: the wires to the parts beside a moved breadboard stay where they were', () => {
  const m = halfAdder();
  const r = movePart(m, 'BB1', [3, 5], { keep: false });
  assert.deepEqual(r.model.wires.find((w) => w.id === 'wb1').points, m.wires.find((w) => w.id === 'wb1').points);
  // (the wires on the board go with it all the same)
  assert.deepEqual(r.model.wires.find((w) => w.id === 'wv1').points, [[7, 8], [7, 1]]);
  assert.notDeepEqual(joins(r.model), joins(m));
});

test('an IC moved or turned beside nothing: its wires follow its pins, the connections the same; not kept, they stay', () => {
  const m = icBench('7400');
  for (const r of [movePart(m, 'U1', [7, 3]), rotatePart(m, 'U1'), rotatePart(m, 'U1', 2)]) {
    assert.equal(r.error, undefined);
    assert.deepEqual(joins(r.model), joins(m));
  }
  const r = movePart(m, 'U1', [7, 3], { keep: false });
  assert.deepEqual(r.model.wires, m.wires);
});

test('a breadboard turned (#4065): its holes, the parts on it and their wires with it, the connections the same', () => {
  const m = halfAdder();
  const r = rotatePart(m, 'BB1');
  assert.equal(r.error, undefined);
  assert.equal(part(r.model, 'BB1').rot, 1);
  assert.equal(part(r.model, 'U1').rot, 1);
  // its hole f5 (dx 4, dy 7 from a1) turned a quarter clockwise about a1: (-7, 4)
  assert.deepEqual(pointOf(r.model, 'BB1.f5'), [-7, 4]);
  assert.deepEqual(pointOf(r.model, 'U1.1'), [-7, 4]);
  assert.deepEqual(joins(r.model), joins(m));
  // four quarters: as it was
  assert.deepEqual(rotatePart(m, 'BB1', 4).model, m);
  assert.deepEqual(rotatePart(rotatePart(m, 'BB1').model, 'BB1', 3).model, m);
  // a breadboard added turned
  const t = addPart(m, { type: 'breadboard-half', at: [40, 0], rot: 2 });
  assert.equal(t.error, undefined);
  assert.deepEqual(partHoles(part(t.model, t.id)).find((h) => h.name === 'j30'), { name: 'j30', strip: '30f', x: 11, y: -11 });
});

test('copy and paste (#4066): a breadboard with the parts on it and the wires between them, new ids, moved by', () => {
  const m = halfAdder();
  const clip = copyParts(m, 'BB1');
  assert.deepEqual(clip.parts.map((p) => p.id), ['BB1', 'U1', 'U2', 'D1', 'D2']);
  // (the wires from the switches and the supply beside it left out)
  assert.deepEqual(clip.wires.map((w) => w.id), ['wv1', 'wg1', 'wv2', 'wg2', 'wgg', 'wa2', 'wb2', 'ws', 'wc', 'wk1', 'wk2']);
  const r = pasteParts(m, clip, [0, 30]);
  assert.deepEqual(r.ids, ['BB2', 'U3', 'U4', 'D3', 'D4']);
  assert.equal(r.model.parts.length, m.parts.length + 5);
  assert.equal(r.model.wires.length, m.wires.length + 11);
  assert.deepEqual([part(r.model, 'U3').x, part(r.model, 'U3').y, part(r.model, 'D3').label], [4, 37, undefined], 'its label taken: left out');
  // (no label twice; the copy's ICs unpowered, its supply beside the original's breadboard not copied)
  assert.deepEqual(checkCircuit(r.model).filter((d) => d.severity === 'error').map((d) => d.ref.id), ['U3', 'U4']);
  assert.deepEqual(r.model.wires.at(-1), { id: 'w13', points: [[27, 31], [27, 27]], color: 'blue' });
  // the copy's ICs on its breadboard as the original's: U3 pin 1 in BB2's f5
  assert.deepEqual(pointOf(r.model, 'U3.1'), pointOf(r.model, 'BB2.f5'));
  // one part: itself; the default move 2 steps right and down
  const one = pasteParts(m, copyParts(m, 'S1'));
  assert.deepEqual(one.ids, ['S3']);
  assert.deepEqual(part(one.model, 'S3'), { id: 'S3', type: 'logic-switch', x: -4, y: 11, on: false });
  assert.deepEqual(partPins(part(one.model, 'S3')).length, 1);
  // its errors
  assert.deepEqual(copyParts(m, 'U9'), { error: 'no part U9 in the circuit' });
  assert.deepEqual(pasteParts(m, { parts: [] }), { error: 'nothing to paste' });
  assert.deepEqual(pasteParts(m, clip, [1]), { error: 'by: a move [dx, dy] in grid steps' });
  assert.deepEqual(pasteParts(m, { parts: [{ type: 'resistor', x: 0, y: 0 }] }), { error: 'no part \'resistor\' in the library' });
});
