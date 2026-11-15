// How a circuit's wires are drawn (#4064, core/circuit-wires.js): a curve through a wire's bends (its ends and bends on
// it), the crossings of wires (not at their ends, not when parallel), the hops' arcs over them (only where they fit),
// against crossings reckoned by hand; and the wireStyle of a circuit (core/circuit.js, core/circuit-edit.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curveD, curvePoints, wireHops, hopD, wirePaths } from '../core/circuit-wires.js';
import { normalizeCircuit } from '../core/circuit.js';
import { setWireStyle } from '../core/circuit-edit.js';
import { halfAdder } from './circuit-helpers.mjs';

test('a curve through a wire\'s bends: it passes its ends and bends; two points a straight line', () => {
  assert.equal(curveD([[0, 0], [40, 0]]), 'M0,0 L40,0');
  const pts = [[0, 0], [40, 0], [40, 40], [80, 40]];
  const d = curveD(pts);
  assert.match(d, /^M0,0 C[^C]+ C[^C]+ C[^C]+$/);
  assert.equal(d.split(' C').length - 1, 3, 'a Bézier per segment');
  const s = curvePoints(pts);
  assert.equal(s.length, 31);
  for (const [i, p] of pts.entries()) assert.deepEqual(s[i * 10].map((v) => Math.round(v * 1e6) / 1e6), p, `through point ${i}`);
});

test('the crossings: a later wire hops over an earlier one; not at an end, not on a parallel, not over itself', () => {
  const a = { id: 'a', pts: [[0, 50], [100, 50]] };
  const b = { id: 'b', pts: [[30, 0], [30, 100]] };
  const c = { id: 'c', pts: [[100, 50], [100, 0]] };          // (from a's end: no crossing)
  const e = { id: 'e', pts: [[0, 60], [100, 60]] };           // (parallel to a)
  const f = { id: 'f', pts: [[0, 0], [100, 100]] };           // (across a at 50,50, b at 30,30, e at 60,60)
  const hops = wireHops([a, b, c, e, f]);
  assert.deepEqual([...hops.keys()], ['b', 'e', 'f']);
  assert.deepEqual(hops.get('b'), [{ seg: 0, t: 0.5, x: 30, y: 50 }]);
  assert.deepEqual(hops.get('e'), [{ seg: 0, t: 0.3, x: 30, y: 60 }]);
  assert.deepEqual(hops.get('f').map((h) => [h.x, h.y]).sort((p, q) => p[0] - q[0]), [[30, 30], [50, 50], [60, 60]]);
  assert.equal(wireHops([a]).size, 0);
});

test('a hop\'s arc over its crossing, of radius r; none where it does not fit', () => {
  assert.equal(hopD([[0, 0], [100, 0]], [{ seg: 0, t: 0.5, x: 50, y: 0 }], 5), 'M0,0 L45,0 A5,5 0 0 1 55,0 L100,0');
  // (two too close: the second left out; one at an end's 2: left out)
  assert.equal(hopD([[0, 0], [100, 0]], [{ seg: 0, t: 0.5 }, { seg: 0, t: 0.52 }, { seg: 0, t: 0.02 }], 5), 'M0,0 L45,0 A5,5 0 0 1 55,0 L100,0');
  assert.equal(hopD([[0, 0], [0, 10], [10, 10]]), 'M0,0 L0,10 L10,10');
  // the wires' paths: straight, curved, with hops
  const w = [{ id: 'a', pts: [[0, 50], [100, 50]] }, { id: 'b', pts: [[30, 0], [30, 100]] }];
  assert.deepEqual(wirePaths(w), { a: 'M0,50 L100,50', b: 'M30,0 L30,100' });
  assert.deepEqual(wirePaths(w, { hops: true }), { a: 'M0,50 L100,50', b: 'M30,0 L30,45 A5,5 0 0 1 30,55 L30,100' });
  assert.match(wirePaths([{ id: 'c', pts: [[0, 0], [10, 0], [10, 10]] }], { curved: true }).c, /^M0,0 C/);
});

test('a circuit\'s wireStyle: curved kept, any other dropped; set by an edit, undone by straight', () => {
  const m = halfAdder();
  assert.equal(m.wireStyle, undefined);
  assert.equal(normalizeCircuit({ ...m, wireStyle: 'curved' }).wireStyle, 'curved');
  assert.equal(normalizeCircuit({ ...m, wireStyle: 'wavy' }).wireStyle, undefined);
  const c = setWireStyle(m, 'curved').model;
  assert.equal(c.wireStyle, 'curved');
  assert.deepEqual(setWireStyle(c, 'straight').model, m);
  assert.deepEqual(setWireStyle(m, 'wavy'), { error: 'style: curved or straight' });
});
