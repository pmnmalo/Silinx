// A circuit's edits (#3897, docs/CIRCUITS.md), the editor's and the MCP server's edit_circuit's: one function each, the
// same checks and messages. A place is a grid point [x, y], a breadboard's hole ('BB1.f10'), or a part's pin ('U1.3',
// 'S1.out', 'D1.A'). Each edit returns { model } (a new one) or { error }. Isomorphic module.
import { partDef, partPins, partHoles, LED_COLORS, WIRE_COLORS, CLOCK_HZ } from './circuit-parts.js';
import { normalizeCircuit, newId } from './circuit.js';
import { clone } from './util.js';

/** A place's grid point: [x, y], or { error }. */
export function pointOf(m, at) {
  if (Array.isArray(at) && at.length === 2 && at.every(Number.isInteger)) return at;
  const s = String(at ?? '');
  const r = /^([^.\s]+)\.([^.\s]+)$/.exec(s);
  if (!r) return { error: `'${s}': a place is a grid point [x, y], a breadboard's hole (BB1.f10) or a part's pin (U1.3, S1.out)` };
  const p = m.parts.find((x) => x.id.toLowerCase() === r[1].toLowerCase());
  if (!p) return { error: `'${s}': no part ${r[1]} in the circuit` };
  if (partDef(p.type)?.kind === 'breadboard') {
    const h = partHoles(p).find((x) => x.name.toLowerCase() === r[2].toLowerCase());
    const n = partDef(p.type).cols;   // (a full breadboard's 63, #3974)
    return h ? [h.x, h.y] : { error: `'${s}': ${p.id} has no hole ${r[2]} (a1 to j${n}, its rails tp, tn, bn, bp 1 to ${n})` };
  }
  const q = partPins(p).find((x) => String(x.n) === r[2] || x.name.toLowerCase() === r[2].toLowerCase());
  return q ? [q.x, q.y] : { error: `'${s}': ${p.id} (${p.type}) has no pin ${r[2]} (its pins: ${partPins(p).map((x) => (String(x.n) === x.name ? x.name : `${x.n} ${x.name}`)).join(', ')})` };
}

const edit = (m, f) => { const c = clone(normalizeCircuit(m)); const e = f(c); return e ? { error: e } : { model: normalizeCircuit(c) }; };
const partIn = (c, id) => c.parts.find((p) => p.id.toLowerCase() === String(id ?? '').toLowerCase());

/** A part added: its type, its pin 1 at `at` (a breadboard's: its hole a1), turned `rot` quarter turns; { model, id }. */
export function addPart(m, { type, at, rot = 0, label, id } = {}) {
  const d = partDef(type);
  if (!d) return { error: `no part '${type}' in the library` };
  let pid = null;
  const r = edit(m, (c) => {
    const pt = pointOf(c, at ?? [0, 0]);
    if (pt.error) return pt.error;
    pid = id || newId(c, type);
    if (partIn(c, pid) || c.wires.some((w) => w.id.toLowerCase() === pid.toLowerCase())) return `${pid}: the circuit has a part or a wire named so`;
    const p = { id: pid, type, x: pt[0], y: pt[1], ...(rot ? { rot } : {}), ...(label ? { label } : {}) };
    if (d.kind === 'breadboard' && rot) return 'a breadboard is not turned';
    c.parts.push(p);
    return null;
  });
  return r.error ? r : { ...r, id: pid };
}

/** A part moved: its pin 1 to `at`. */
export const movePart = (m, id, at) => edit(m, (c) => {
  const p = partIn(c, id);
  if (!p) return `no part ${id} in the circuit`;
  const pt = pointOf(c, at);
  if (pt.error) return pt.error;
  [p.x, p.y] = pt;
  return null;
});

/** A part turned a quarter clockwise (`by` quarter turns), about its pin 1. */
export const rotatePart = (m, id, by = 1) => edit(m, (c) => {
  const p = partIn(c, id);
  if (!p) return `no part ${id} in the circuit`;
  if (partDef(p.type)?.kind === 'breadboard') return 'a breadboard is not turned';
  p.rot = (((p.rot || 0) + by) % 4 + 4) % 4;
  return null;
});

/** A part or a wire deleted (a part's wires stay, as on the bench). */
export const deleteItem = (m, id) => edit(m, (c) => {
  const n = c.parts.length + c.wires.length;
  c.parts = c.parts.filter((p) => p.id.toLowerCase() !== String(id).toLowerCase());
  c.wires = c.wires.filter((w) => w.id.toLowerCase() !== String(id).toLowerCase());
  return c.parts.length + c.wires.length === n ? `no part or wire ${id} in the circuit` : null;
});

/** A wire added from a place to a place, through `via` bends (grid points); { model, id }. */
export function addWire(m, { from, to, via = [], color = 'blue', id } = {}) {
  let wid = null;
  const r = edit(m, (c) => {
    const a = pointOf(c, from), b = pointOf(c, to);
    if (a.error) return a.error;
    if (b.error) return b.error;
    if (!Array.isArray(via) || !via.every((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isInteger))) return 'via: the bends, a list of grid points [[x, y], …]';
    if (a[0] === b[0] && a[1] === b[1] && !via.length) return 'a wire joins two different places';
    if (!WIRE_COLORS.includes(color)) return `color: one of ${WIRE_COLORS.join(', ')}`;
    wid = id || newId(c, 'wire');
    if (partIn(c, wid) || c.wires.some((w) => w.id.toLowerCase() === wid.toLowerCase())) return `${wid}: the circuit has a part or a wire named so`;
    c.wires.push({ id: wid, points: [a, ...via, b], color });
    return null;
  });
  return r.error ? r : { ...r, id: wid };
}

/**
 * A part's properties set: its label (its ports' name), an LED's or a display's colour, a switch's position as saved (`on`:
 * a DIP switch's list of its levers, or { lever: k, on }), a clock's frequency (`hz`, in real time).
 */
export const setPartProps = (m, id, props = {}) => edit(m, (c) => {
  const p = partIn(c, id);
  if (!p) return `no part ${id} in the circuit`;
  const d = partDef(p.type);
  const levels = (d?.inputs || []).filter((x) => x.kind === 'level').length;
  const has = ['label', ...(d?.kind === 'output' ? ['color'] : []), ...(levels ? ['on'] : []), ...(d?.type === 'clock' ? ['hz'] : [])];
  for (const [k, v] of Object.entries(props)) {
    const named = d?.inputs || d?.lamps || d?.kind === 'probe';   // (a probe's label: its row's name in the waveforms)
    if (!has.includes(k) || (k === 'label' && !named)) return `${p.id} (${p.type}) has no property '${k}' (${has.filter((x) => x !== 'label' || named).join(', ') || 'none'})`;
    if (k === 'label') { if (v == null || v === '') delete p.label; else p.label = String(v); }
    else if (k === 'color') { if (!LED_COLORS.includes(v)) return `color: one of ${LED_COLORS.join(', ')}`; p.color = v; }
    else if (k === 'hz') { const hz = Number(v); if (!Number.isFinite(hz) || hz < CLOCK_HZ.min || hz > CLOCK_HZ.max) return `hz: a frequency from ${CLOCK_HZ.min} to ${CLOCK_HZ.max} Hz`; p.hz = hz; }
    else if (levels === 1) p.on = !!v;
    else if (Array.isArray(v)) { if (v.length !== levels) return `on: a list of ${levels} levers' positions`; p.on = v.map(Boolean); }
    else if (v && typeof v === 'object' && Number.isInteger(v.lever) && v.lever >= 1 && v.lever <= levels) { p.on = [...(p.on || [])]; p.on[v.lever - 1] = !!v.on; }
    else return `on: a list of ${levels} levers' positions, or { lever: 1 to ${levels}, on }`;
  }
  return null;
});
