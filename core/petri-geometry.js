// Where a Petri net's arcs are drawn (#5266: out of web/js/petri-draw.js): from the rim of one node to the rim of the
// other, a straight line; two arcs between the same place and transition, one each way, are each bent to its side (as
// a state diagram's two transitions each way between two states are), so that each is seen, clicked and weighted apart.
import { PLACE_R, TRANS_H, TRANS_W } from './petri.js';

export const ARC_BEND = 16;         // how far a two-way arc's middle is from the straight line (drawing units)

/** Where a line from node n toward a point meets it: the rim of a place, the edge of a transition's bar. */
export function rim(n, toward, isPlace) {
  const dx = toward.x - n.x, dy = toward.y - n.y, d = Math.hypot(dx, dy) || 1;
  if (isPlace) return { x: n.x + dx / d * PLACE_R, y: n.y + dy / d * PLACE_R };
  const sx = Math.abs(dx) > 1e-6 ? (TRANS_W / 2 + 2) / Math.abs(dx) : Infinity, sy = Math.abs(dy) > 1e-6 ? (TRANS_H / 2 + 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: n.x + dx * s, y: n.y + dy * s };
}

/** An arc's bend: ARC_BEND when the net has an arc back between its two nodes, else 0 (a straight line). */
export const arcBend = (m, arc) => (m.arcs.some(a => a !== arc && a.from === arc.to && a.to === arc.from) ? ARC_BEND : 0);

/**
 * An arc's drawing: { d, hit, p1, c, p2, end, mid, lab }: its SVG path (a line, or a quadratic curve through c) and
 * the one that takes its clicks (to the rim), its ends on the nodes' rims, the end of its line (5 units short of p2
 * for an inhibitor's circle), its middle and its weight's place (beside its middle, on its outer side); null when a
 * node is missing.
 */
export function arcGeometry(m, arc) {
  const node = id => m.places.find(p => p.id === id) || m.transitions.find(t => t.id === id) || null;
  const A = node(arc.from), B = node(arc.to);
  if (!A || !B) return null;
  const isPlace = n => m.places.includes(n);
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
  const n = { x: -dy / L, y: dx / L };          // the normal, to the arc's left: the arc back has the other one
  const bend = arcBend(m, arc);
  // (the control point at twice the bend, so the curve's middle is bend away from the line)
  const c = { x: (A.x + B.x) / 2 + n.x * bend * 2, y: (A.y + B.y) / 2 + n.y * bend * 2 };
  const p1 = rim(A, bend ? c : B, isPlace(A)), p2 = rim(B, bend ? c : A, isPlace(B));
  const tan = bend ? { x: p2.x - c.x, y: p2.y - c.y } : { x: p2.x - p1.x, y: p2.y - p1.y }, tl = Math.hypot(tan.x, tan.y) || 1;
  const end = arc.inhibitor ? { x: p2.x - tan.x / tl * 5, y: p2.y - tan.y / tl * 5 } : p2;
  const mid = bend ? { x: 0.25 * p1.x + 0.5 * c.x + 0.25 * p2.x, y: 0.25 * p1.y + 0.5 * c.y + 0.25 * p2.y } : { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  // (a straight arc's weight above its middle, as before; a bent one's on its own side, out of the other's way)
  const lab = bend ? { x: mid.x + n.x * 10 - 3, y: mid.y + n.y * 10 + 4 } : { x: mid.x + 6, y: mid.y - 6 };
  const path = q => (bend ? `M${p1.x},${p1.y} Q${c.x},${c.y} ${q.x},${q.y}` : `M${p1.x},${p1.y} L${q.x},${q.y}`);
  return { d: path(end), hit: path(p2), p1, c, p2, end, mid, lab };
}
