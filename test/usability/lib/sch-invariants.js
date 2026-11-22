// Usability tests (#5148): a schematic's invariants, checked after every step of a scenario. Each check gives the
// list of what is wrong, as sentences that say where ("wire W7's end (310, 400) on nothing"); [] when it holds.
// Built on core's own functions (netlist, wireClashes, symbolPins, symbolBox, generateHdl, compile, elaborate).
import { netlist, normalizeDoc, onSeg, key } from '../../../core/schdoc.js';
import { symbolPins, symbolBox } from '../../../core/schdoc-symbols.js';
import { wireClashes } from '../../../core/schpath.js';
import { generateHdl } from '../../../core/schdoc-hdl.js';
import { compile, elaborate } from '../../../core/compile.js';

const pt = (p) => `(${p.x}, ${p.y})`;

/** The points a wire's end may be on: the symbols' pins, the I/O markers. */
function pinPoints(doc, modules) {
  const at = new Set();
  for (const s of doc.symbols) for (const p of symbolPins(s, modules)) at.add(key(p.x, p.y));
  for (const p of doc.ports) at.add(key(p.x, p.y));
  return at;
}

/** The wires' ends on nothing ([{ wire, end: 0 | 1, at, text }]): every wire's end on a pin, an I/O marker or another wire (its corner or its segment); a wire with a net name on it
 *  may end on nothing (joined by its name to the other wires of that name). */
export function danglingEnds(doc, { modules = {} } = {}) {
  const pins = pinPoints(doc, modules);
  const out = [];
  for (const w of doc.wires) {
    for (const end of [w.points[0], w.points.at(-1)]) {
      if (pins.has(key(end.x, end.y))) continue;
      const onWire = doc.wires.some((o) => o !== w && o.points.some((p, i) => i > 0 && onSeg(end, o.points[i - 1], p)));
      // (a wire's end on its own segment: a loop, joined)
      const onSelf = w.points.some((p, i) => i > 1 && i < w.points.length - 1 && onSeg(end, w.points[i - 1], p));
      const named = (doc.labels || []).some((l) => w.points.some((p, i) => i > 0 && onSeg(l, w.points[i - 1], p)));
      if (!onWire && !onSelf && !named) out.push({ wire: w.id, end: end === w.points[0] ? 0 : 1, at: end, text: `wire ${w.id}'s end ${pt(end)} on nothing` });
    }
  }
  return out;
}

/** Where a wire's end is: 'pin' (a pin or an I/O marker), 'wire' (on another wire), 'free'. */
function endsOf(doc, modules) {
  const pins = pinPoints(doc, modules);
  const m = new Map();
  for (const w of doc.wires) {
    m.set(w.id, [w.points[0], w.points.at(-1)].map((end) => (pins.has(key(end.x, end.y)) ? 'pin'
      : doc.wires.some((o) => o !== w && o.points.some((p, i) => i > 0 && onSeg(end, o.points[i - 1], p))) ? 'wire' : 'free')));
  }
  return m;
}

/** The wires' ends attached before a step and free after it (`except`: the wires the step may free, e.g. a deleted
 *  symbol's): "wires still attached". */
export function detachedEnds(before, after, { modules = {}, except = [] } = {}) {
  const [b, a] = [endsOf(normalizeDoc(before, { modules }), modules), endsOf(normalizeDoc(after, { modules }), modules)];
  const out = [];
  for (const [id, ends] of a) {
    if (except.includes(id) || !b.has(id)) continue;
    ends.forEach((e, i) => { if (e === 'free' && b.get(id)[i] !== 'free') out.push(`wire ${id}'s ${i ? 'last' : 'first'} end came off its ${b.get(id)[i]}`); });
  }
  return out;
}

/** No wire of fewer than two points, no zero-length or diagonal segment (in the orthogonal style). */
export function badSegments(doc) {
  const out = [];
  for (const w of doc.wires) {
    if (w.points.length < 2) { out.push(`wire ${w.id} has ${w.points.length} point`); continue; }
    w.points.forEach((p, i) => {
      if (!i) return;
      const a = w.points[i - 1];
      if (a.x === p.x && a.y === p.y) out.push(`wire ${w.id}: a segment of no length at ${pt(p)}`);
      else if (a.x !== p.x && a.y !== p.y) out.push(`wire ${w.id}: a diagonal segment ${pt(a)} to ${pt(p)}`);
    });
  }
  return out;
}

/** No two symbols' bodies overlapping. */
export function overlaps(doc, { modules = {} } = {}) {
  const boxes = doc.symbols.map((s) => ({ s, b: symbolBox(s, modules) }));
  const out = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i].b, boxes[j].b];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push(`symbols ${boxes[i].s.name} and ${boxes[j].s.name} overlap`);
    }
  }
  return out;
}

/** The points where a junction dot belongs: three branches or more meeting, wires' and a pin's (a T, a cross of joined
 *  wires, two wires on a pin). */
export function junctionPoints(doc, { modules = {} } = {}) {
  const deg = new Map();
  const add = (p, n) => deg.set(key(p.x, p.y), (deg.get(key(p.x, p.y)) || 0) + n);
  const vertices = new Set(doc.wires.flatMap((w) => w.points.map((p) => key(p.x, p.y))));
  for (const k of pinPoints(doc, modules)) if (vertices.has(k)) deg.set(k, 1);
  for (const w of doc.wires) {
    w.points.forEach((p, i) => add(p, i === 0 || i === w.points.length - 1 ? 1 : 2));
  }
  // a wire's end in the middle of another's segment: that segment's two branches
  for (const w of doc.wires) {
    for (const end of [w.points[0], w.points.at(-1)]) {
      for (const o of doc.wires) {
        if (o === w) continue;
        o.points.forEach((p, i) => {
          if (!i) return;
          const a = o.points[i - 1];
          if (onSeg(end, a, p) && !(end.x === a.x && end.y === a.y) && !(end.x === p.x && end.y === p.y)) add(end, 2);
        });
      }
    }
  }
  return [...deg].filter(([k, n]) => n >= 3 && vertices.has(k)).map(([k]) => k).sort();
}

/** The nets as sets of endpoints ('U1.O', 'port:sw'), sorted: what a move must not change. */
export function nets(doc, { modules = {} } = {}) {
  const nl = netlist(normalizeDoc(doc, { modules }), { modules });
  const names = new Map(doc.symbols.map((s) => [s.id, s.name]));
  const ports = new Map(doc.ports.map((p) => [p.id, p.name]));
  return nl.nets.map((n) => n.endpoints.map((e) => (e.kind === 'pin' ? `${names.get(e.sym) ?? e.sym}.${e.pin}` : `port:${ports.get(e.port) ?? e.port}`)).sort().join(' '))
    .filter((s) => s).sort();
}

/** The netlist's diagnostics ('warning: …'), as Check Schematic says them. */
export function diagnostics(doc, { modules = {} } = {}) {
  return netlist(normalizeDoc(doc, { modules }), { modules }).diagnostics.map((d) => `${d.severity}: ${d.message}`);
}

/** The HDL generated from the drawing, in VHDL and in Verilog, compiled and elaborated: the errors ([] when none). */
export function hdlErrors(doc, { modules = {}, langs = ['vhdl', 'verilog'] } = {}) {
  const out = [];
  for (const lang of langs) {
    const g = generateHdl({ ...doc, lang }, { modules, lang });
    for (const d of g.diagnostics.filter((x) => x.severity === 'error')) out.push(`${lang}: generated: ${d.message}`);
    const lib = compile([{ path: g.filename, lang, text: g.code }]);
    for (const e of lib.errors.filter((x) => x.severity === 'error')) out.push(`${lang}: compile: ${e.message}`);
    if (lib.errors.some((x) => x.severity === 'error')) continue;
    for (const e of elaborate(lib, doc.name).diags.filter((x) => x.severity === 'error')) out.push(`${lang}: elaborate: ${e.message}`);
  }
  return out;
}

/** All of the drawing's invariants (but its loose wire ends, which a person may leave: the session checks the new ones):
 *  { check: [what is wrong] } of those that do not hold ({} when all do). */
export function schInvariants(doc, { modules = {}, hdl = true } = {}) {
  const d = normalizeDoc(doc, { modules });
  const res = {
    'bad segments': badSegments(d),
    'wires over pins or bodies': wireClashes(d, { modules }).map((c) => `wire ${c.wire}: ${c.kind} at ${pt(c)}`),
    'overlapping symbols': overlaps(d, { modules }),
    'errors': diagnostics(d, { modules }).filter((m) => m.startsWith('error')),
    ...(hdl ? { 'HDL': hdlErrors(d, { modules }) } : {}),
  };
  return Object.fromEntries(Object.entries(res).filter(([, v]) => v.length));
}
