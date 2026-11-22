// Where a Petri net's arcs are drawn (core/petri-geometry.js, #5266): a straight line from rim to rim; two arcs between
// a place and a transition, one each way, each bent to its side, apart, their weights by their own arcs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePetri, PLACE_R, TRANS_W } from '../core/petri.js';
import { ARC_BEND, arcBend, arcGeometry, rim } from '../core/petri-geometry.js';

// a place at (100,100), a transition at (200,100); a1 p→t, a2 t→p (the arc back), a3 p→u alone, a4 an inhibitor q→t
const net = (arcs) => normalizePetri({
  name: 'g', places: [{ id: 'p', name: 'p', x: 100, y: 100 }, { id: 'q', name: 'q', x: 200, y: 220 }],
  transitions: [{ id: 't', name: 't', x: 200, y: 100 }, { id: 'u', name: 'u', x: 100, y: 220 }], arcs,
});
const near = (a, b, msg) => { assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`); };
// a point of the quadratic Bezier p1 c p2 at s
const bez = (G, s) => ({ x: (1 - s) ** 2 * G.p1.x + 2 * s * (1 - s) * G.c.x + s * s * G.p2.x, y: (1 - s) ** 2 * G.p1.y + 2 * s * (1 - s) * G.c.y + s * s * G.p2.y });

test('petri geometry: an arc alone is a straight line from rim to rim, its weight above its middle', () => {
  const m = net([{ id: 'a1', from: 'p', to: 't', weight: 2 }]);
  assert.equal(arcBend(m, m.arcs[0]), 0);
  const G = arcGeometry(m, m.arcs[0]);
  assert.deepEqual(G.p1, { x: 100 + PLACE_R, y: 100 });
  assert.deepEqual(G.p2, { x: 200 - TRANS_W / 2 - 2, y: 100 });
  assert.deepEqual(G.end, G.p2);
  assert.equal(G.d, `M${G.p1.x},100 L${G.p2.x},100`);
  assert.equal(G.hit, G.d);
  assert.deepEqual(G.lab, { x: (G.p1.x + G.p2.x) / 2 + 6, y: 94 });
});

test('petri geometry: two arcs each way are bent apart, to their own sides, their weights by their own arcs', () => {
  const m = net([{ id: 'a1', from: 'p', to: 't' }, { id: 'a2', from: 't', to: 'p' }, { id: 'a3', from: 'p', to: 'u' }]);
  const [a1, a2, a3] = m.arcs;
  assert.deepEqual([arcBend(m, a1), arcBend(m, a2), arcBend(m, a3)], [ARC_BEND, ARC_BEND, 0]);
  const G1 = arcGeometry(m, a1), G2 = arcGeometry(m, a2);
  assert.match(G1.d, /^M[\d.-]+,[\d.-]+ Q[\d.-]+,[\d.-]+ [\d.-]+,[\d.-]+$/);
  // p→t (left to right) bends down (+y, its left in the SVG's frame), t→p up: one the other's mirror
  near(G1.mid.x, G2.mid.x, 'one above the other'); assert.ok(Math.abs(G1.mid.x - 150) < 5, `${G1.mid.x}`);
  assert.ok(G1.mid.y > 100 && G2.mid.y < 100, `${G1.mid.y} ${G2.mid.y}`);
  near(G1.mid.y - 100, 100 - G2.mid.y, 'symmetric');
  assert.ok(G1.mid.y - 100 > ARC_BEND * 0.8, `bent: ${G1.mid.y}`);
  // the middle is the curve's own point at its half
  const h = bez(G1, 0.5); near(h.x, G1.mid.x, 'mid x'); near(h.y, G1.mid.y, 'mid y');
  // the ends on the rims: on the place's circle, on the transition's bar's edge
  near(Math.hypot(G1.p1.x - 100, G1.p1.y - 100), PLACE_R, 'p1 on the place');
  near(Math.hypot(G2.p2.x - 100, G2.p2.y - 100), PLACE_R, 'p2 on the place');
  near(Math.abs(G1.p2.x - 200), TRANS_W / 2 + 2, 'p2 on the bar');
  // nowhere closer than a hit's width (10) between the two curves, but at the nodes
  for (const s of [0.3, 0.4, 0.5, 0.6, 0.7]) assert.ok(bez(G1, s).y - bez(G2, 1 - s).y > 10, `apart at ${s}`);
  // each weight on its own arc's side
  assert.ok(G1.lab.y > G1.mid.y && G2.lab.y < G2.mid.y, `${G1.lab.y} ${G2.lab.y}`);
  // the arc alone stays straight
  assert.match(arcGeometry(m, a3).d, / L/);
});

test('petri geometry: an inhibitor arc ends 5 short of the rim, along its curve; a missing node: null', () => {
  const m = net([{ id: 'a1', from: 'q', to: 't', inhibitor: true }, { id: 'a2', from: 't', to: 'q' }]);
  const G = arcGeometry(m, m.arcs[0]);
  near(Math.hypot(G.p2.x - G.end.x, G.p2.y - G.end.y), 5, 'inhibitor end');
  assert.ok(G.d.endsWith(`${G.end.x},${G.end.y}`) && G.hit.endsWith(`${G.p2.x},${G.p2.y}`));
  assert.equal(arcGeometry(m, { id: 'a9', from: 'p', to: 'x' }), null);
  // rim of a transition straight up: the bar's top edge
  assert.deepEqual(rim({ x: 0, y: 0 }, { x: 0, y: -100 }, false), { x: 0, y: -22 });
});
