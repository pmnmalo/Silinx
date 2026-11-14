// Silinx - I/O markers added at once to every open end of a schematic (#4000): the Add I/O Marker tool's rectangle, the
// MCP's add_markers. An open end is a symbol's pin connected to nothing (no wire, no other pin, no marker, no net name)
// or a wire's end on nothing (no pin, marker or other wire there). Each gets a marker of its direction (a pin's; a wire
// end's, its net's pins': an output pin on it makes it an output, an inout one bidirectional, inputs only an input) and
// width (the pin's, the net's), turned the way the end points (#2926), named with the next free default name: in1,
// in2… for an input, out1… for an output, io1… for a bidirectional one, the first number no marker, net name or
// instance of the drawing takes (case-insensitive: gaps filled first, as freePortName does for one marker, #680). A
// wire end on a named net takes the net's name (its marker joins it). No DOM: unit tested (test/schmarker-many.test.js).
import { netlist, symbolPins, freePortName, portSide } from './schdoc.js';
import { newMarkerDir, newMarkerSide } from './schmarker.js';

const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const ptKey = p => `${p.x},${p.y}`;
// the outward direction of a wire's end: away from the point before it
function endSide(end, prev) {
  if (!prev) return null;
  const dx = end.x - prev.x, dy = end.y - prev.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'W' : 'E';
  return dy < 0 ? 'N' : 'S';
}
const numW = w => (Number.isFinite(+w) && +w >= 1 ? Math.round(+w) : null);

/** The open ends of `doc` inside the rectangle `rect` ({ x, y, w, h }, sheet coordinates) or of the instance named
 *  `instance` (its pins), and the markers they get: { markers: [{ name, dir, width, x, y, side?, at }], skipped: [{ at,
 *  why }] } (at: 'U1.A' for a pin, 'the wire end at 120, 40' for a wire's end). Nothing is changed (addMarkers does). */
export function planMarkers(doc, { rect = null, instance = null, modules = {} } = {}) {
  const nl = netlist(doc, { modules });
  const markers = [], skipped = [];
  const work = { ...doc, ports: [...(doc.ports || [])] };   // (the names taken by the markers planned so far too)
  const netsDone = new Map();   // net id -> the name of its marker planned
  const add = (m, net) => {
    netsDone.set(net.id, m.name);
    const side = m.side;
    const p = { name: m.name, dir: m.dir, width: m.width, x: m.x, y: m.y, ...(side ? { side } : {}), at: m.at };
    markers.push(p); work.ports.push(p);
  };
  const want = instance == null ? null : String(instance).trim().toLowerCase();
  const syms = (doc.symbols || []).filter(s => want == null || String(s.name).toLowerCase() === want);
  const pinAt = new Set(), wireEnds = new Map();
  for (const s of doc.symbols || []) for (const p of symbolPins(s, modules)) pinAt.add(ptKey(p));
  for (const p of doc.ports || []) pinAt.add(ptKey(p));
  for (const w of doc.wires || []) for (const e of [w.points[0], w.points[w.points.length - 1]]) wireEnds.set(ptKey(e), (wireEnds.get(ptKey(e)) || 0) + 1);
  // the symbols' pins, in the drawing's order
  for (const s of syms) {
    for (const p of symbolPins(s, modules)) {
      if (rect && !inRect(p, rect)) continue;
      const net = nl.pinNet.get(`${s.id}/${p.name}`);
      if (!net || net.ports.length || net.wires.length || net.labels.length || net.endpoints.length > 1) continue;   // (connected)
      const dir = newMarkerDir(doc, { pin: p });
      add({ name: freePortName(work, dir), dir, width: numW(p.width) || numW(net.width) || 1, x: p.x, y: p.y, side: newMarkerSide(dir, p), at: `${s.name}.${p.name}` }, net);
    }
  }
  // the wires' open ends (a rectangle's only: an instance's pins are its own)
  if (rect) {
    for (const w of doc.wires || []) {
      const n = w.points.length;
      for (const [end, prev] of [[w.points[0], w.points[1]], [w.points[n - 1], w.points[n - 2]]]) {
        if (!inRect(end, rect) || pinAt.has(ptKey(end)) || wireEnds.get(ptKey(end)) > 1) continue;
        const net = nl.wireNet.get(w.id), at = `the wire end at ${end.x}, ${end.y}`;
        if (!net) continue;
        if (net.ports.length) { skipped.push({ at, why: `its net already has an I/O marker (${doc.ports.find(q => q.id === net.ports[0])?.name})` }); continue; }
        if (netsDone.has(net.id)) { skipped.push({ at, why: `its net already gets a marker (${netsDone.get(net.id)})` }); continue; }
        const pins = net.endpoints.filter(e => e.kind === 'pin' && doc.symbols.find(s => s.id === e.sym)?.type !== 'slice');
        if (!pins.length) { skipped.push({ at, why: 'its direction is unknown (no symbol\'s pin on its net)' }); continue; }
        const dir = pins.some(e => e.dir === 'out') ? 'out' : pins.some(e => e.dir === 'inout') ? 'inout' : 'in';
        const out = endSide(end, prev), side = out && out !== portSide({ dir }) ? out : undefined;
        const named = !net.auto && !net.part && !work.ports.some(q => q.name.toLowerCase() === net.name.toLowerCase());
        add({ name: named ? net.name : freePortName(work, dir), dir, width: numW(net.width) || 1, x: end.x, y: end.y, side, at }, net);
      }
    }
  }
  return { markers, skipped };
}

/** The markers of planMarkers added to `doc` (their ids P<n> after the highest), in place; returns them. */
export function addMarkers(doc, markers) {
  let n = 0;
  for (const p of doc.ports || []) { const m = /^P(\d+)$/.exec(p.id); if (m) n = Math.max(n, +m[1]); }
  const out = [];
  for (const { at, ...m } of markers) { const p = { id: `P${++n}`, ...m }; doc.ports.push(p); out.push(p); }
  return out;
}

/** The console's lines of an addition (the editor's and the MCP's alike): how many were added, then each end skipped. */
export function markersText({ markers, skipped }) {
  const lines = [markers.length ? `${markers.length} I/O marker${markers.length === 1 ? '' : 's'} added: ${markers.map(m => (m.width > 1 ? `${m.name}(${m.width - 1}:0)` : m.name)).join(', ')}`
    : 'No I/O marker added: no open pin or wire end there'];
  for (const s of skipped) lines.push(`WARNING: no I/O marker on ${s.at}: ${s.why}`);
  return lines;
}
