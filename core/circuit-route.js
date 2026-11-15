// A circuit's wire drawn from A to B in its style (#4083, docs/CIRCUITS.md), the editor's and the MCP's edit_circuit
// wire's: Direct and Curved through the points given (A, the clicked points, B: drawn straight, or as a curve,
// core/circuit-wires.js); Orthogonal routed in horizontal and vertical segments by the schematic's router
// (core/schpath.js routePath, its A* on a grid of what to keep clear of), here on the circuit's grid: the parts' pins
// never crossed, an IC's body never entered, the other wires' segments not run along, and the breadboards' holes
// crossable (a jumper wire lies over them, as on the bench) but dearer, so that a route goes around the board where it
// can; the clicked points its waypoints; a leg no clear path is found for (a pin boxed in by its neighbours and the
// other wires): drawn straight, and said. Isomorphic.
import { routePath, cleanPath } from './schpath.js';
import { GRID, key } from './schdoc.js';
import { partDef, partPins, partHoles } from './circuit-parts.js';
import { addWire, pointOf } from './circuit-edit.js';

const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

// the router's grid of the circuit (schpath.js wireGrid's fields), in its units: a circuit step is GRID
function circuitGrid(m) {
  const g = { fixed: new Set(), labels: new Map(), vtx: new Map(), h: new Map(), v: new Map(), stepH: new Map(), stepV: new Map(), nearH: new Map(), nearV: new Map(),
    inner: new Set(), edge: new Set(), side: new Map(), bounds: null };
  const xs = [], ys = [];
  const at = (x, y) => { xs.push(x * GRID); ys.push(y * GRID); return key(x * GRID, y * GRID); };
  for (const p of m.parts) {
    const d = partDef(p.type);
    if (d?.kind === 'breadboard') {
      // (its holes: dearer, as near a wire both ways and on a body's edge)
      for (const q of partHoles(p)) { const k = at(q.x, q.y); bump(g.nearH, k); bump(g.nearV, k); g.edge.add(k); }
      continue;
    }
    const pins = partPins(p);
    for (const q of pins) g.fixed.add(at(q.x, q.y));
    // an IC's body: the points between its rows of pins
    if (d?.kind === 'ic' && pins.length > 2) {
      const x0 = Math.min(...pins.map((q) => q.x)), x1 = Math.max(...pins.map((q) => q.x)), y0 = Math.min(...pins.map((q) => q.y)), y1 = Math.max(...pins.map((q) => q.y));
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (!g.fixed.has(key(x * GRID, y * GRID))) g.inner.add(key(x * GRID, y * GRID));
    }
  }
  const paint = (pts) => {
    for (const p of pts) bump(g.vtx, key(p.x, p.y));
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], hz = a.y === b.y;
      if (hz === (a.x === b.x)) continue;   // (a slanted one: its ends only)
      const n = Math.abs(hz ? b.x - a.x : b.y - a.y) / GRID, s = Math.sign(hz ? b.x - a.x : b.y - a.y);
      for (let j = 1; j < n; j++) bump(hz ? g.h : g.v, hz ? key(a.x + s * j * GRID, a.y) : key(a.x, a.y + s * j * GRID));
    }
  };
  for (const w of m.wires) { const pts = w.points.map(([x, y]) => ({ x: x * GRID, y: y * GRID })); paint(pts); for (const p of pts) { xs.push(p.x); ys.push(p.y); } }
  const M = 10 * GRID;
  g.bounds = xs.length ? { x0: Math.min(...xs) - M, x1: Math.max(...xs) + M, y0: Math.min(...ys) - M, y1: Math.max(...ys) + M } : { x0: -M, x1: M, y0: -M, y1: M };
  return g;
}

/** The orthogonal route of a wire through the grid points pts (A, waypoints, B): { points (its corners, [x, y]),
 *  straight (how many legs had no clear path: drawn straight) }. */
export function routeOrthogonal(m, pts) {
  const g = circuitGrid(m);
  const out = [];
  let straight = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const S = { x: pts[i][0] * GRID, y: pts[i][1] * GRID }, T = { x: pts[i + 1][0] * GRID, y: pts[i + 1][1] * GRID };
    let leg = S.x === T.x && S.y === T.y ? [pts[i]] : routePath(g, S, T, { maxNodes: 60000 })?.map((p) => [p.x / GRID, p.y / GRID]);
    if (!leg) { straight++; leg = [pts[i], pts[i + 1]]; }
    out.push(...(out.length ? leg.slice(1) : leg));
  }
  return { points: cleanPath(out.map(([x, y]) => ({ x, y }))).map((p) => [p.x, p.y]), straight };
}

/** A wire added from a place to a place (A to B, through the places `via`), drawn in the circuit's style: orthogonal,
 *  routed (`via` its waypoints); direct or curved, through them. { model, id, warning? } or { error } (addWire's). */
export function addStyledWire(m, { from, to, via = [], color = 'blue', id } = {}) {
  if (m.wireStyle !== 'orthogonal') return addWire(m, { from, to, via, color, id });
  const a = pointOf(m, from), b = pointOf(m, to);
  if (a.error) return a;
  if (b.error) return b;
  if (!Array.isArray(via) || !via.every((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isInteger))) return { error: 'via: the bends, a list of grid points [[x, y], …]' };
  const r = routeOrthogonal(m, [a, ...via, b]);
  const w = addWire(m, { from: a, to: b, via: r.points.slice(1, -1), color, id });
  return w.error || !r.straight ? w : { ...w, warning: `${w.id}: no clear orthogonal path (the parts' pins and the other wires in the way): drawn straight there` };
}
