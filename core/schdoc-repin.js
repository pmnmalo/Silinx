// A symbol's pins moved or changed (connections are geometric): the wires, I/O markers and net names on a pin that
// stays following it (Update Symbol's way, #1183, out of core/schdoc-modsym.js), and a symbol whose parameters change
// its pins (#1555: a COMP's comparisons, an output each) re-pinned that way, the wires of a pin that goes dropped.
// A wire that follows its pin keeps reaching its other end as it did and stays clear of the pins and bodies (#5278).
// Isomorphic (no DOM). schdoc.js's and schpath.js's names are read inside functions only (an import cycle).
import { GRID, netlist } from './schdoc.js';
import { symbolDef, xform } from './schdoc-symbols.js';
import { untangleWires, wireClashes, wireGrid } from './schpath.js';

const same = (a, b) => a.x === b.x && a.y === b.y;
const at = q => `${q.x},${q.y}`;

/** The pins of the symbols other than s, where they are ('x,y'). */
export function otherPins(doc, s, modules = {}) {
  return new Set(doc.symbols.filter(o => o !== s).flatMap(o => { const d = symbolDef(o, modules); return d.pins.map(p => at(xform(o, d, p.x, p.y))); }));
}

/** The pins that stay and move, carried out on doc (in place): moves maps where a pin was ('x,y') to { from, to, p }.
 *  Each wire end, I/O marker and net name there moved once, a corner added where the run would go slanted; a pin moved
 *  off another symbol's pin it touched (others: otherPins) gets a wire from there to it. When that makes a wire that
 *  followed run over what it did not (wireClashes: a body, a pin, another wire, #5278), a straight wire whose other end
 *  is on a pin or an I/O marker jogs half way between its ends instead (it still leaves the one and reaches the other
 *  as it did), or else the wires that clash are routed again between their ends (untangleWires). What is connected
 *  stays: a way that would join or part nets (a net name the follow left off its wire, on it) is not taken.
 *  modules: the module symbols'. */
export function followPins(doc, moves, others, { modules = {} } = {}) {
  if (!moves.size) return;
  const was = { ...doc, ...copy(doc) }, ids = new Set(doc.wires.map(w => w.id)), fixed = wireGrid(doc, { modules }).fixed;
  // (the clashes the drawing had before stay: only what the wires that followed now run over)
  const known = new Set(wireClashes(was, { modules }).map(clashAt));
  for (const [jogs, untangle] of [[false, false], [true, false], [true, true], [false, true]]) {
    restore(doc, was);
    const followed = follow(doc, moves, others, jogs ? fixed : null);
    const fresh = () => [...new Set(wireClashes(doc, { modules }).filter(c => followed.has(c.wire) && !known.has(clashAt(c))).map(c => c.wire))];
    if (untangle) { const only = fresh(); if (only.length) untangleWires(doc, { modules, only, known }); }
    if ((untangle || !fresh().length) && wireNets(doc, modules, ids) === wireNets(was, modules, new Set(doc.wires.map(w => w.id)))) return;
  }
  restore(doc, was);
  follow(doc, moves, others, null);
}
// (the ports and net names kept as objects: only their places put back)
const restore = (doc, was) => { doc.wires = copy(was).wires; [...doc.ports, ...doc.labels].forEach((o, i) => Object.assign(o, [...was.ports, ...was.labels][i])); };
const copy = doc => ({ wires: doc.wires.map(w => ({ ...w, points: w.points.map(q => ({ ...q })) })), ports: doc.ports.map(o => ({ ...o })), labels: doc.labels.map(o => ({ ...o })) });
const clashAt = c => `${c.kind}@${c.x},${c.y}`;
// (which wires of ids are on one net)
const wireNets = (doc, modules, ids) => netlist(doc, { modules }).nets.map(n => n.wires.filter(id => ids.has(id)).sort().join('+')).filter(Boolean).sort().join('|');

// followPins's moves (fixed: the pins' and markers' points, for the jogs; null: none); returns the ids of the wires
// that followed
function follow(doc, moves, others, fixed) {
  const followed = new Set();
  for (const w of doc.wires) {
    const ends = [0, w.points.length - 1].map(e => ({ e, mv: moves.get(at(w.points[e])) }));
    for (const { e, mv } of ends.reverse()) {   // (the last end first: the first one's index stays)
      if (!mv) continue;
      followed.add(w.id);
      const { to } = mv, pt = w.points[e], next = w.points[e === 0 ? 1 : e - 1];
      // the end moved to the pin; a corner where the run would go slanted, the wire still reaching the pin as it did
      // (along x or along y: a pin turned, #5156, moves both ways)
      const corner = next.y === pt.y && next.x !== pt.x ? { x: next.x, y: to.y } : { x: to.x, y: next.y };
      const jog = fixed?.has(at(next)) && w.points.length === 2 && !moves.has(at(next)) ? jogAt(to, pt, next) : null;
      const run = jog || (!same(corner, to) && !same(corner, next) ? [corner, { ...to }] : [{ ...to }]);
      if (e === 0) w.points.splice(0, 1, ...run.reverse()); else w.points.splice(e, 1, ...run);
    }
    w.points = w.points.filter((q, i) => i === 0 || !same(q, w.points[i - 1]));
  }
  doc.wires = doc.wires.filter(w => w.points.length >= 2);
  for (const o of [...doc.ports, ...doc.labels]) { const mv = moves.get(at(o)); if (mv) { o.x = mv.to.x; o.y = mv.to.y; } }
  for (const { from, to, p } of moves.values()) {
    if (!others.has(at(from))) continue;
    const w = { id: `W${doc.wires.length + 1}`, points: [{ ...from }, { ...to }] };
    while (doc.wires.some(x => x.id === w.id)) w.id += '_';
    if ((p.width || 1) > 1) w.bus = true;
    doc.wires.push(w);
    followed.add(w.id);
  }
  return followed;
}

// a straight wire from pt to next (a pin or a marker), pt moved to `to` across the run: its points from next's side to
// `to`, the jog half way (on the grid), the run still reaching next as it did; null when there is no room
function jogAt(to, pt, next) {
  const hz = pt.y === next.y && pt.x !== next.x;
  if (hz ? to.y === next.y : to.x === next.x) return null;
  const d = hz ? next.x - to.x : next.y - to.y;
  if (Math.sign(d) !== Math.sign(hz ? next.x - pt.x : next.y - pt.y) || Math.abs(d) < 2 * GRID) return null;
  const m = (hz ? to.x : to.y) + Math.sign(d) * Math.floor(Math.abs(d) / 2 / GRID) * GRID;
  return hz ? [{ x: m, y: next.y }, { x: m, y: to.y }, { ...to }] : [{ x: next.x, y: m }, { x: to.x, y: m }, { ...to }];
}

/** The symbol s (in doc) changed by change(s), its parameters making other pins (#1555): a pin that stays (by name, or
 *  the name rename gives its old one: { O: 'EQ' }) keeps its wires, I/O markers and net names, following it; the wires
 *  with an end on a pin that goes are dropped. doc changed in place. Returns { removed: [old pin names] }. */
export function repinSymbol(doc, s, change, { modules = {}, rename = {} } = {}) {
  const oldDef = symbolDef(s, modules), oldAt = new Map(oldDef.pins.map(p => [p.name, xform(s, oldDef, p.x, p.y)]));
  const others = otherPins(doc, s, modules);
  change(s);
  const newDef = symbolDef(s, modules);
  const target = n => rename[n] ?? n;
  const kept = new Set(newDef.pins.map(p => p.name));
  const removed = oldDef.pins.map(p => p.name).filter(n => !kept.has(target(n)));
  const gone = new Set(removed.map(n => at(oldAt.get(n))));
  doc.wires = doc.wires.filter(w => !gone.has(at(w.points[0])) && !gone.has(at(w.points[w.points.length - 1])));
  const moves = new Map();
  for (const q of oldDef.pins) {
    const p = newDef.pins.find(x => x.name === target(q.name));
    if (!p) continue;
    const from = oldAt.get(q.name), to = xform(s, newDef, p.x, p.y);
    if (!same(from, to)) moves.set(at(from), { from, to, p });
  }
  followPins(doc, moves, others, { modules });
  return { removed };
}
