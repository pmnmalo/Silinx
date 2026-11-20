// The circuit editor's wire handles (#4930, #4931; core/circuit-wire-edit.js, edit_circuit's reconnect and reshape): the
// selected wire's end dragged to another hole, pin or grid point (it joins what is there), a bend dragged, a segment's
// middle dragged out into a new bend, a bend double-clicked away; shown as it will be while dragged, one edit (Undo) at
// the end.
import { dragWireHandle, removeWireBend } from '/core/circuit-wire-edit.js';

/** A drag of the selected wire's handle under the pointer event e: { kind: 'wire', id, handle, base, moved }, or null. */
export function wireDragStart(e, sel, M) {
  const el = e.target.closest?.('[data-handle]');
  if (!el || sel?.kind !== 'wire' || el.closest('[data-kind=wire]')?.dataset.id !== sel.id) return null;
  const [kind, index] = el.dataset.handle.split(':');
  return { kind: 'wire', id: sel.id, handle: { kind, index: Number(index) }, base: M, at: null, moved: false };
}

/** The circuit with the drag's handle on the grid point g (from the circuit it started on), or null (no move, or refused:
 *  the wire's two ends on one point). */
export function wireDragTo(d, g) {
  if (d.at && d.at[0] === g[0] && d.at[1] === g[1]) return null;
  d.at = g;
  const r = dragWireHandle(d.base, d.id, d.handle, g);
  if (r.error) return null;
  d.moved = true;
  return r.model;
}

/** A double click on the grid point g: { model } with the selected wire's bend there removed, or null (by the point: the
 *  clicked handle drawn again since). */
export function bendRemoved(g, sel, M) {
  const w = sel?.kind === 'wire' ? M.wires.find((x) => x.id === sel.id) : null;
  const k = w ? w.points.slice(1, -1).findIndex(([x, y]) => x === g[0] && y === g[1]) : -1;
  if (k < 0) return null;
  const r = removeWireBend(M, sel.id, k);
  return r.error ? null : r;
}
