// A circuit wire's ends and shape edited (#4930, #4931, docs/user/en/circuits.md), the editor's handles' and the MCP
// server's edit_circuit's (reconnect, reshape): one function each, the same checks and messages. A wire's end moved to
// another place (a hole, a pin, a grid point: it joins what is there), its bends set, one moved, added on a segment or
// removed; its colour and id kept. Points are grid points; each edit returns { model } (a new one) or { error }.
// Isomorphic module.
import { normalizeCircuit } from './circuit.js';
import { pointOf } from './circuit-edit.js';
import { clone } from './util.js';

const isPoint = (q) => Array.isArray(q) && q.length === 2 && q.every(Number.isInteger);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
// (a point the same as the one before it dropped: a bend dragged onto its neighbour merged with it)
const dedupe = (pts) => pts.filter((q, i) => !i || !same(q, pts[i - 1]));

// the wire `id` of a copy of the circuit changed by f(wire, circuit) (an error's message, or nothing)
function editWire(m, id, f) {
  const c = clone(normalizeCircuit(m));
  const w = c.wires.find((x) => x.id.toLowerCase() === String(id ?? '').toLowerCase());
  if (!w) return { error: `no wire ${id} in the circuit` };
  const e = f(w, c);
  if (e) return { error: e };
  w.points = dedupe(w.points);
  if (w.points.length < 2) return { error: 'a wire joins two different places' };
  return { model: normalizeCircuit(c) };
}

/** Which end: 0 (its start) or 1 (its end), from 0, 1, 'start', 'end'; or null. */
export const endOf = (end) => (end === 0 || end === 'start' ? 0 : end === 1 || end === 'end' ? 1 : null);

/** A wire's end (`end`: 'start' or 'end', 0 or 1) moved to a place (a grid point, a hole BB1.f10, a pin U1.3): it joins
 *  what is there; its bends stay. */
export const moveWireEnd = (m, id, end, at) => editWire(m, id, (w, c) => {
  const k = endOf(end);
  if (k === null) return 'end: start or end';
  const pt = pointOf(c, at);
  if (pt.error) return pt.error;
  w.points[k ? w.points.length - 1 : 0] = pt;
  return null;
});

/** A wire's bends set (`via`: grid points, from its start to its end; [] a straight wire), its ends kept. */
export const setWireBends = (m, id, via) => editWire(m, id, (w) => {
  if (!Array.isArray(via) || !via.every(isPoint)) return 'via: the bends, a list of grid points [[x, y], …]';
  w.points = [w.points[0], ...via, w.points[w.points.length - 1]];
  return null;
});

/** A wire's handles, as the editor draws the selected one's: its two ends, its bends, each segment's middle (a new bend
 *  dragged out of it): [{ kind: 'end' | 'bend' | 'mid', index, at: [x, y] }]. */
export function wireHandles(w) {
  const p = w.points, n = p.length;
  return [{ kind: 'end', index: 0, at: p[0] }, { kind: 'end', index: 1, at: p[n - 1] },
    ...p.slice(1, -1).map((at, i) => ({ kind: 'bend', index: i, at })),
    ...p.slice(1).map((q, i) => ({ kind: 'mid', index: i, at: [(p[i][0] + q[0]) / 2, (p[i][1] + q[1]) / 2] }))];
}

/** A wire's handle dragged to the grid point `to`: an end reconnected there, a bend moved there, a segment's middle a new
 *  bend there (the segment `index` split). */
export function dragWireHandle(m, id, { kind, index }, to) {
  if (kind === 'end') return moveWireEnd(m, id, index, to);
  return editWire(m, id, (w) => {
    if (!isPoint(to)) return 'to: a grid point [x, y]';
    const n = w.points.length;
    if (!Number.isInteger(index) || index < 0 || index >= (kind === 'bend' ? n - 2 : n - 1)) return `${w.id} has no ${kind === 'bend' ? 'bend' : 'segment'} ${index}`;
    if (kind === 'bend') w.points[index + 1] = to;
    else if (kind === 'mid') w.points.splice(index + 1, 0, to);
    else return `kind: end, bend or mid`;
    return null;
  });
}

/** A wire's bend `index` (0 its first) removed: its neighbours joined straight. */
export const removeWireBend = (m, id, index) => editWire(m, id, (w) => {
  if (!Number.isInteger(index) || index < 0 || index >= w.points.length - 2) return `${w.id} has no bend ${index}`;
  w.points.splice(index + 1, 1);
  return null;
});
