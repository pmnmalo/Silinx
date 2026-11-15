// A circuit's wire drawn from A to B in its style (#4083, core/circuit-route.js, the editor's and edit_circuit's): Direct
// and Curved through the points given; Orthogonal routed by the schematic's router: every step horizontal or vertical,
// never over another part's pin nor into an IC's body (checked point by point, independently of the router), through
// its waypoints; the connections only its ends' (the nets before, A's and B's joined); a pin boxed in: drawn straight,
// said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addStyledWire, routeOrthogonal } from '../core/circuit-route.js';
import { partDef, partPins } from '../core/circuit-parts.js';
import { circuitNets } from '../core/circuit-net.js';
import { pointOf } from '../core/circuit-edit.js';
import { halfAdder } from './circuit-helpers.mjs';

const joins = (m) => circuitNets(m).nets.map((n) => n.pins.map((q) => `${q.part}.${q.n}`).sort().join(' ')).filter(Boolean).sort();
// every grid point of a route (its segments' points)
const along = (pts) => pts.flatMap((p, i) => {
  if (!i) return [p];
  const a = pts[i - 1], n = Math.max(Math.abs(p[0] - a[0]), Math.abs(p[1] - a[1]));
  return Array.from({ length: n }, (_, k) => [a[0] + Math.sign(p[0] - a[0]) * (k + 1), a[1] + Math.sign(p[1] - a[1]) * (k + 1)]);
});
// what a route may not go over: the other parts' pins, the ICs' bodies
function blocked(m, ends) {
  const out = new Set(), k = ([x, y]) => `${x},${y}`;
  for (const p of m.parts) {
    if (partDef(p.type)?.kind === 'breadboard') continue;
    const pins = partPins(p);
    for (const q of pins) out.add(k([q.x, q.y]));
    if (partDef(p.type)?.kind === 'ic') {
      const xs = pins.map((q) => q.x), ys = pins.map((q) => q.y);
      for (let x = Math.min(...xs); x <= Math.max(...xs); x++) for (let y = Math.min(...ys); y <= Math.max(...ys); y++) out.add(k([x, y]));
    }
  }
  for (const e of ends) out.delete(k(e));
  return out;
}

test('orthogonal: routed around the parts, every step horizontal or vertical, never over a pin or into an IC', () => {
  const m = { ...halfAdder(), wireStyle: 'orthogonal' };
  for (const [from, to] of [['U1.4', 'U2.12'], ['S1.out', 'BB1.j20'], ['BB1.a1', 'BB1.j30'], ['BB1.a3', 'BB1.a8'], ['U2.6', 'D1.A']]) {
    const r = addStyledWire(m, { from, to });
    assert.equal(r.error, undefined, `${from} ${to}`);
    assert.equal(r.warning, undefined, `${from} ${to}: ${r.warning}`);
    const w = r.model.wires.find((x) => x.id === r.id).points;
    const [a, b] = [pointOf(m, from), pointOf(m, to)];
    assert.deepEqual([w[0], w.at(-1)], [a, b], 'its ends A and B');
    for (let i = 1; i < w.length; i++) assert.ok(w[i][0] === w[i - 1][0] || w[i][1] === w[i - 1][1], `${from} ${to}: step ${i} slanted`);
    const no = blocked(m, [a, b]);
    for (const p of along(w)) assert.ok(!no.has(`${p[0]},${p[1]}`), `${from} ${to}: over ${p}`);
    // the connections: the circuit's, none split, at most A's and B's two joined in one
    const before = joins(m), after = joins(r.model);
    for (const n of before) assert.ok(after.some((x) => n.split(' ').every((q) => x.split(' ').includes(q))), `${from} ${to}: ${n} split`);
    assert.ok(after.length >= before.length - 1, `${from} ${to}: more than two nets joined`);
  }
  // a3 to a8 over the gap above row a, as a jumper would
  assert.deepEqual(routeOrthogonal(m, [[2, 0], [7, 0]]), { points: [[2, 0], [2, -1], [7, -1], [7, 0]], straight: 0 });
});

test('orthogonal: through its waypoints; a pin boxed in drawn straight, said', () => {
  const m = { ...halfAdder(), wireStyle: 'orthogonal' };
  const r = routeOrthogonal(m, [[2, 0], [2, -2], [7, 0]]);
  assert.ok(r.points.some((p) => p[0] === 2 && p[1] === -2), JSON.stringify(r.points));
  assert.equal(r.straight, 0);
  // U1 pin 3: its neighbours pins, the IC's body above, a wire's end and a crossing wire below
  const s = addStyledWire(m, { from: 'U1.3', to: 'D2.A', id: 'wx' });
  assert.equal(s.warning, 'wx: no clear orthogonal path (the parts\' pins and the other wires in the way): drawn straight there');
  assert.deepEqual(s.model.wires.at(-1).points, [[6, 7], [26, 2]]);
});

test('direct and curved: the points given; the errors addWire\'s', () => {
  for (const style of [undefined, 'curved']) {
    const m = { ...halfAdder(), ...(style ? { wireStyle: style } : {}) };
    const r = addStyledWire(m, { from: 'BB1.a3', to: 'BB1.a8', via: [[4, -2]] });
    assert.deepEqual(r.model.wires.at(-1).points, [[2, 0], [4, -2], [7, 0]]);
  }
  const m = { ...halfAdder(), wireStyle: 'orthogonal' };
  assert.deepEqual(addStyledWire(m, { from: 'U9.1', to: 'U1.1' }), { error: '\'U9.1\': no part U9 in the circuit' });
  assert.deepEqual(addStyledWire(m, { from: 'U1.1', to: 'U1.2', via: [[1]] }), { error: 'via: the bends, a list of grid points [[x, y], …]' });
});
