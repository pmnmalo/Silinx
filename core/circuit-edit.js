// A circuit's edits (#3897, docs/CIRCUITS.md), the editor's and the MCP server's edit_circuit's: one function each, the
// same checks and messages. A place is a grid point [x, y], a breadboard's hole ('BB1.f10'), or a part's pin ('U1.3',
// 'S1.out', 'D1.A'). Each edit returns { model } (a new one) or { error }. Isomorphic module.
import { partDef, partPins, partHoles, LED_COLORS, WIRE_COLORS, CLOCK_HZ } from './circuit-parts.js';
import { normalizeCircuit, newId } from './circuit.js';
import { clone } from './util.js';
import { WIRE_STYLES, isWireStyle, setWireStyle as setStyleOf } from './wire-style.js';

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
    c.parts.push(p);
    return null;
  });
  return r.error ? r : { ...r, id: pid };
}

// ------------------------------------------------------------------ moves that keep the connections (#4059, #4065)
// a part and what it carries: a breadboard's, the parts with a pin in one of its holes
function carried(c, p) {
  if (partDef(p.type)?.kind !== 'breadboard') return [p];
  const holes = new Set(partHoles(p).map((q) => `${q.x},${q.y}`));
  return [p, ...c.parts.filter((x) => x !== p && partDef(x.type)?.kind !== 'breadboard' && partPins(x).some((q) => holes.has(`${q.x},${q.y}`)))];
}
// the parts `ps` moved by f (a grid point's new place), `rot` quarter turns more; the wires' ends on their pins and holes
// follow when `keep` (a wire with both ends there moved whole, its bends too, kept or not: it goes with them)
function carry(c, ps, f, rot, keep) {
  const on = new Set(ps.flatMap((p) => [...partPins(p), ...partHoles(p)]).map((q) => `${q.x},${q.y}`));
  for (const p of ps) { [p.x, p.y] = f([p.x, p.y]); if (rot) p.rot = (((p.rot || 0) + rot) % 4 + 4) % 4; }
  for (const w of c.wires) {
    const ends = [w.points[0], w.points[w.points.length - 1]].map(([x, y]) => on.has(`${x},${y}`));
    if (ends[0] && ends[1]) w.points = w.points.map(f);
    else if (keep && ends[0]) w.points[0] = f(w.points[0]);
    else if (keep && ends[1]) w.points[w.points.length - 1] = f(w.points[w.points.length - 1]);
  }
}

/** A part moved: its pin 1 to `at`; a breadboard with the parts on it; `keep` (default): its wires' ends with it. */
export const movePart = (m, id, at, { keep = true } = {}) => edit(m, (c) => {
  const p = partIn(c, id);
  if (!p) return `no part ${id} in the circuit`;
  const pt = pointOf(c, at);
  if (pt.error) return pt.error;
  const dx = pt[0] - p.x, dy = pt[1] - p.y;
  carry(c, carried(c, p), ([x, y]) => [x + dx, y + dy], 0, keep);
  return null;
});

/** A part turned a quarter clockwise (`by` quarter turns), about its pin 1; a breadboard with the parts on it; `keep`
 *  (default): its wires' ends with it. */
export const rotatePart = (m, id, by = 1, { keep = true } = {}) => edit(m, (c) => {
  const p = partIn(c, id);
  if (!p) return `no part ${id} in the circuit`;
  const k = ((by % 4) + 4) % 4, ox = p.x, oy = p.y;
  const f = ([x, y]) => { let dx = x - ox, dy = y - oy; for (let i = 0; i < k; i++) [dx, dy] = [-dy, dx]; return [ox + dx, oy + dy]; };
  carry(c, carried(c, p), f, k, keep);
  return null;
});

// ------------------------------------------------------------------ copy and paste (#4066)
/** What a copy of the part `id` holds: { parts, wires } (a breadboard's: the parts on it and the wires between them). */
export function copyParts(m, id) {
  const c = clone(normalizeCircuit(m)), p = partIn(c, id);
  if (!p) return { error: `no part ${id} in the circuit` };
  const ps = carried(c, p);
  const on = new Set(ps.flatMap((x) => [...partPins(x), ...partHoles(x)]).map((q) => `${q.x},${q.y}`));
  const wires = c.wires.filter((w) => [w.points[0], w.points[w.points.length - 1]].every(([x, y]) => on.has(`${x},${y}`)));
  return { parts: ps, wires };
}

/** A copy pasted, moved by [dx, dy] (default: 2 steps right and down), each part and wire a new id, a label taken left
 *  out: { model, ids }. */
export function pasteParts(m, clip, by = [2, 2]) {
  if (!Array.isArray(clip?.parts) || !clip.parts.length) return { error: 'nothing to paste' };
  const ids = [];
  const r = edit(m, (c) => {
    if (!Array.isArray(by) || by.length !== 2 || !by.every(Number.isInteger)) return 'by: a move [dx, dy] in grid steps';
    for (const q of clip.parts) {
      if (!partDef(q.type)) return `no part '${q.type}' in the library`;
      const p = { ...clone(q), id: newId(c, q.type), x: q.x + by[0], y: q.y + by[1] };
      // (a label another part has left out: its ports named by its id)
      if (p.label && c.parts.some((x) => String(x.label ?? '').toLowerCase() === p.label.toLowerCase())) delete p.label;
      c.parts.push(p);
      ids.push(p.id);
    }
    for (const w of clip.wires || []) c.wires.push({ ...clone(w), id: newId(c, 'wire'), points: w.points.map(([x, y]) => [x + by[0], y + by[1]]) });
    return null;
  });
  return r.error ? r : { ...r, ids };
}

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

/** A wire's properties set (#4121): its colour, as its Properties' Colour. */
export const setWireProps = (m, id, props = {}) => edit(m, (c) => {
  const w = c.wires.find((x) => x.id.toLowerCase() === String(id ?? '').toLowerCase());
  if (!w) return `no wire ${id} in the circuit`;
  for (const [k, v] of Object.entries(props)) {
    if (k !== 'color') return `wire ${w.id} has no property '${k}' (color)`;
    if (!WIRE_COLORS.includes(v)) return `color: one of ${WIRE_COLORS.join(', ')}`;
    w.color = v;
  }
  return null;
});

/** A part's or a wire's properties set (edit_circuit's set): setPartProps' or setWireProps'. */
export function setProps(m, id, props = {}) {
  const c = normalizeCircuit(m);
  if (partIn(c, id)) return setPartProps(m, id, props);
  if (c.wires.some((w) => w.id.toLowerCase() === String(id ?? '').toLowerCase())) return setWireProps(m, id, props);
  return { error: `no part or wire ${id} in the circuit` };
}

/** How the circuit's wires are drawn (#4064, #4080; core/wire-style.js, the schematic's, its default direct): 'direct'
 *  (straight from point to point), 'orthogonal' (horizontal and vertical segments) or 'curved' (smooth curves). */
export const setWireStyle = (m, style) => edit(m, (c) => {
  if (!isWireStyle(style)) return `style: ${WIRE_STYLES.map((s) => s.id).join(', ')}`;
  setStyleOf(c, style, 'direct');
  return null;
});
