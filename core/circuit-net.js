// A circuit's nets (#3897, docs/CIRCUITS.md): its connectivity is geometric, as on the bench. A pin on a breadboard's
// hole is in that hole's strip (a column's a–e, its f–j, a power rail); a wire joins its two ends, and an end joins the
// hole, the pins and the other wires' ends on its point; two wires that cross are not joined. A button joins its two
// nets only while pressed: its nets are kept apart here (core/circuit-sim.js joins them). Isomorphic module.
import { partDef, partPins, partHoles } from './circuit-parts.js';

const key = (x, y) => `${x},${y}`;

/**
 * The circuit's nets: { nets: [{ pins: [{ part, n, name, dir }], holes: [{ part, name }], wires: [id], points: [key] }],
 * pinNet: Map('U1.3' → net index), at: Map(point key → { pins, holes, ends }) (what is on each point), buttons:
 * [{ part, a, b }] (the nets of a button's two pins) }.
 */
export function circuitNets(m) {
  const parent = new Map();
  const find = (k) => { let r = k; while (parent.get(r) !== r) r = parent.get(r); let c = k; while (parent.get(c) !== r) { const n = parent.get(c); parent.set(c, r); c = n; } return r; };
  const node = (k) => { if (!parent.has(k)) parent.set(k, k); return k; };
  const join = (a, b) => { const ra = find(node(a)), rb = find(node(b)); if (ra !== rb) parent.set(ra, rb); };
  const at = new Map();
  const spot = (x, y) => { const k = key(x, y); if (!at.has(k)) at.set(k, { pins: [], holes: [], ends: [] }); node(`p:${k}`); return at.get(k); };

  for (const p of m.parts) {
    for (const h of partHoles(p)) { spot(h.x, h.y).holes.push({ part: p.id, name: h.name }); join(`p:${key(h.x, h.y)}`, `s:${p.id}:${h.strip}`); }
  }
  for (const p of m.parts) {
    for (const q of partPins(p)) { spot(q.x, q.y).pins.push({ part: p.id, n: q.n, name: q.name, dir: q.dir }); join(`p:${key(q.x, q.y)}`, `pin:${p.id}.${q.n}`); }
  }
  for (const w of m.wires) {
    const a = w.points[0], b = w.points[w.points.length - 1];
    spot(a[0], a[1]).ends.push({ wire: w.id, end: 0 });
    spot(b[0], b[1]).ends.push({ wire: w.id, end: 1 });
    join(`p:${key(a[0], a[1])}`, `p:${key(b[0], b[1])}`);
  }

  // one net per class that holds a pin or a wire (the holes no pin or wire reaches are no net)
  const index = new Map(), nets = [], pinNet = new Map();
  const netOf = (k) => {
    const r = find(k);
    if (!index.has(r)) { index.set(r, nets.length); nets.push({ pins: [], holes: [], wires: [], points: [] }); }
    return index.get(r);
  };
  for (const [k, s] of at) {
    if (!s.pins.length && !s.ends.length) continue;
    const n = nets[netOf(`p:${k}`)];
    n.points.push(k);
    n.holes.push(...s.holes);
    for (const q of s.pins) { n.pins.push(q); pinNet.set(`${q.part}.${q.n}`, index.get(find(`p:${k}`))); }
    for (const e of s.ends) if (!n.wires.includes(e.wire)) n.wires.push(e.wire);
  }
  const buttons = m.parts.filter((p) => partDef(p.type)?.type === 'button').map((p) => ({ part: p.id, a: pinNet.get(`${p.id}.1`), b: pinNet.get(`${p.id}.2`) }));
  return { nets, pinNet, at, buttons };
}

/** The supply terminals on a net: { vcc, gnd } (whether a supply's + or − is on it). */
export function netSupply(net) {
  return { vcc: net.pins.some((q) => q.dir === 'vcc' && isSupplyPin(q)), gnd: net.pins.some((q) => q.dir === 'gnd' && isSupplyPin(q)) };
}
// (a supply's terminal: its pins are named + and −; an IC's VCC and GND pins draw from the net, they drive nothing)
const isSupplyPin = (q) => q.name === '+' || q.name === '-';

/** A net's name in a message: its pins ("U1 pin 3 (1Y), D1 A"), at most four. */
export function netText(net) {
  const s = net.pins.slice(0, 4).map((q) => (/^\d/.test(q.name) || q.name === 'VCC' || q.name === 'GND' ? `${q.part} pin ${q.n} (${q.name})` : `${q.part} ${q.name}`));
  return s.join(', ') + (net.pins.length > 4 ? ', …' : '');
}
