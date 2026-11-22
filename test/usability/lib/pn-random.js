// Usability tests (#5206, phase 3): the Petri net's vocabulary of random actions (lib/draw-random.js), on the lock
// example's net (examples/lock, src/alarm.pn.json): a place or a transition added with its tool where nothing is; an arc
// drawn from a place to a transition or back (an inhibitor arc from a place), one between two places or two transitions
// refused; a node dragged to where nothing is; a node renamed, a transition's guard, a place's tokens and capacity, an
// arc's weight set in Properties; a node (with its arcs) or an arc deleted; Undo, Redo. A name is one nothing of the net
// has (its nodes, its ports); a guard tests the inputs.
import { PLACE_R } from '../../../core/petri.js';
import { arcGeometry } from '../../../core/petri-geometry.js';
import { vocabulary, freshName, segDist } from './draw-random.js';

const AREA = { x0: 60, y0: 60, x1: 780, y1: 440 };
const GUARDS = ['fail', 'opened', '!opened', 'fail & !opened', 'fail | opened', ''];
const NAMES = ['idle', 'busy', 'ready', 'hold', 'armed', 'calm', 'wait', 'cool'];
const PORTS = ['fail', 'opened', 'fails', 'alarm', 'alarm_pn'];

/** A net's model: its places (names, places, tokens, capacities), its transitions (names, places, guards), its arcs. */
export function pnModel(d) {
  return {
    places: d.places.map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, tokens: p.tokens, capacity: p.capacity })),
    transitions: d.transitions.map((t) => ({ id: t.id, name: t.name, x: t.x, y: t.y, guard: t.guard ?? '' })),
    arcs: d.arcs.map((a) => ({ id: a.id, from: a.from, to: a.to, weight: a.weight, inhibitor: !!a.inhibitor })),
  };
}

const nodes = (m) => [...m.places, ...m.transitions];
const nodeOf = (m, id) => nodes(m).find((n) => n.id === id);

/** Whether a node at p is clear of every node (but `self`) and of every arc (but `self`'s, which follow it), and its own
 *  arcs from there clear of the other nodes. */
function free(m, p, self = null) {
  if (p.x < AREA.x0 || p.x > AREA.x1 || p.y < AREA.y0 || p.y > AREA.y1) return false;
  if (nodes(m).some((n) => n.id !== self && Math.hypot(n.x - p.x, n.y - p.y) < 100)) return false;
  for (const a of m.arcs) {
    const [u, v] = [nodeOf(m, a.from), nodeOf(m, a.to)];
    if (a.from === self || a.to === self) {
      const o = a.from === self ? v : u;
      if (nodes(m).some((n) => n.id !== self && n !== o && segDist(n, p, o) < PLACE_R + 16)) return false;
    } else if (segDist(p, u, v) < PLACE_R + 24) return false;
  }
  return true;
}
/** Whether an arc's line from `a` to `b` passes clear of the other nodes, and no arc goes from `a` to `b` yet (one back,
 *  from `b` to `a`, may: the two are drawn apart, #5266). */
const clearArc = (m, a, b) => !m.arcs.some((x) => x.from === a.id && x.to === b.id)
  && !nodes(m).some((n) => n !== a && n !== b && segDist(n, a, b) < PLACE_R + 16);
/** An arc as drawn (core/petri-geometry.js): points along it, its line's or its curve's. */
function arcPoints(m, arc) {
  const g = arcGeometry(m, arc);
  return Array.from({ length: 9 }, (_, i) => i / 8).map((s) => ({ x: (1 - s) ** 2 * g.p1.x + 2 * s * (1 - s) * g.c.x + s * s * g.p2.x,
    y: (1 - s) ** 2 * g.p1.y + 2 * s * (1 - s) * g.c.y + s * s * g.p2.y }));
}
/** Whether an arc's middle, where a click selects it, is clear of the nodes and of the other arcs. */
function clickable(m, arc) {
  const { mid } = arcGeometry(m, arc);
  if (nodes(m).some((n) => Math.hypot(n.x - mid.x, n.y - mid.y) < PLACE_R + 12)) return false;
  return !m.arcs.some((x) => x !== arc && arcPoints(m, x).some((p, i, ps) => i && segDist(mid, ps[i - 1], p) < 12));
}
const names = (m) => [...nodes(m).map((n) => n.name), ...PORTS];
const grid = (rng, lo, hi) => rng.int(Math.ceil(lo / 20), Math.floor(hi / 20)) * 20;
/** A place and a transition an arc may join (one way at least none yet, its line clear). */
const pair = (m, rng) => rng.pick(m.places.flatMap((p) => m.transitions.filter((t) => clearArc(m, p, t) || clearArc(m, t, p)).map((t) => [p, t]))) ?? null;

const SPECS = [
  ...['place', 'transition'].map((kind) => ({
    name: kind === 'place' ? 'addPlace' : 'addTransition', weight: 1.5,
    gen(m, rng) {
      const p = { x: grid(rng, AREA.x0, AREA.x1), y: grid(rng, AREA.y0, AREA.y1) };
      return nodes(m).length < 14 && free(m, p) ? p : null;
    },
    // (a new place: p1, p2… the first no place is named, no token, a capacity of 1; a new transition: t1…, no guard)
    apply(m, { x, y }, c) {
      if (kind === 'place') m.places.push({ id: c.id('p'), name: freshName('p', m.places.map((p) => p.name), 1, 'p'), x, y, tokens: 0, capacity: 1 });
      else m.transitions.push({ id: c.id('t'), name: freshName('t', m.transitions.map((t) => t.name), 1, 't'), x, y, guard: '' });
      return m;
    },
    act: (a, { x, y }) => (kind === 'place' ? a.addPlace(x, y) : a.addTransition(x, y)),
  })),
  {
    // a place to a transition or a transition to a place (with the Arc tool), a place to a transition with the
    // Inhibitor tool
    name: 'arc', weight: 3,
    gen(m, rng) {
      const pt = pair(m, rng);
      if (!pt) return null;
      // (the way no arc goes yet: either when both are free; an arc back beside one, drawn apart, #5266)
      const fwd = clearArc(m, pt[0], pt[1]), bk = clearArc(m, pt[1], pt[0]);
      const inhibitor = fwd && rng.next() < 0.2, back = !inhibitor && (fwd && bk ? rng.next() < 0.5 : bk);
      return { from: (back ? pt[1] : pt[0]).id, to: (back ? pt[0] : pt[1]).id, inhibitor };
    },
    apply(m, { from, to, inhibitor }, c) { m.arcs.push({ id: c.id('a'), from, to, weight: 1, inhibitor }); return m; },
    act: (a, { from, to, inhibitor }) => a.arc(from, to, { inhibitor }),
  },
  {
    // two places or two transitions: refused (said in the console), nothing changes
    name: 'refusedArc', weight: 0.5, changes: false,
    gen(m, rng) {
      const list = rng.next() < 0.5 ? m.places : m.transitions;
      const a = rng.pick(list), b = rng.pick(list);
      return a && b && a !== b && clearArc(m, a, b) ? { from: a.id, to: b.id } : null;
    },
    apply: (m) => m,
    act: (a, { from, to }) => a.arc(from, to),
  },
  {
    name: 'move', weight: 2,
    gen(m, rng) {
      const n = rng.pick(nodes(m)), dx = rng.int(-4, 4) * 20, dy = rng.int(-4, 4) * 20;
      return n && (dx || dy) && free(m, { x: n.x + dx, y: n.y + dy }, n.id) ? { id: n.id, dx, dy } : null;
    },
    apply: (m, { id, dx, dy }) => { const n = nodeOf(m, id); n.x += dx; n.y += dy; return m; },
    act: (a, { id, dx, dy }) => a.move(id, dx, dy),
  },
  {
    name: 'rename', weight: 1.5,
    gen(m, rng) {
      const n = rng.pick(nodes(m)), name = rng.pick(NAMES);
      return n && !names(m).some((x) => x.toLowerCase() === name) ? { id: n.id, name } : null;
    },
    apply: (m, { id, name }) => { nodeOf(m, id).name = name; return m; },
    act: async (a, { id, name }) => { await a.select(id); await a.field('Name', name); },
  },
  {
    name: 'guard', weight: 1.5,
    gen(m, rng) { const t = rng.pick(m.transitions), guard = rng.pick(GUARDS); return t && t.guard !== guard ? { id: t.id, guard } : null; },
    apply: (m, { id, guard }) => { nodeOf(m, id).guard = guard; return m; },
    act: async (a, { id, guard }) => { await a.select(id); await a.field('Guard', guard); },
  },
  {
    // a place's initial tokens (its capacity raised to them) or its capacity (its tokens lowered to it)
    name: 'tokens', weight: 1.5,
    gen(m, rng) {
      const p = rng.pick(m.places), field = rng.pick(['Initial tokens', 'Capacity']), v = rng.int(field === 'Capacity' ? 1 : 0, 3);
      return p && v !== (field === 'Capacity' ? p.capacity : p.tokens) ? { id: p.id, field, value: v } : null;
    },
    apply(m, { id, field, value }) {
      const p = nodeOf(m, id);
      if (field === 'Capacity') { p.capacity = value; p.tokens = Math.min(p.tokens, value); } else { p.tokens = value; p.capacity = Math.max(p.capacity, value); }
      return m;
    },
    act: async (a, { id, field, value }) => { await a.select(id); await a.field(field, value); },
  },
  {
    name: 'weight', weight: 1,
    gen(m, rng) { const x = rng.pick(m.arcs.filter((y) => clickable(m, y))), w = rng.int(1, 3); return x && x.weight !== w ? { id: x.id, weight: w } : null; },
    apply: (m, { id, weight }) => { m.arcs.find((x) => x.id === id).weight = weight; return m; },
    act: async (a, { id, weight }) => { await a.selectArc(id); await a.field('Weight', weight); },
  },
  {
    name: 'deleteNode', weight: 1,
    gen(m, rng) { const n = rng.pick(nodes(m)); return n && nodes(m).length > 5 ? { id: n.id } : null; },
    apply(m, { id }) {
      m.places = m.places.filter((p) => p.id !== id); m.transitions = m.transitions.filter((t) => t.id !== id);
      m.arcs = m.arcs.filter((x) => x.from !== id && x.to !== id);
      return m;
    },
    act: async (a, { id }) => { await a.select(id); await a.del(); },
  },
  {
    name: 'deleteArc', weight: 1,
    gen(m, rng) { const x = rng.pick(m.arcs.filter((y) => clickable(m, y))); return x ? { id: x.id } : null; },
    apply: (m, { id }) => { m.arcs = m.arcs.filter((x) => x.id !== id); return m; },
    act: async (a, { id }) => { await a.selectArc(id); await a.del(); },
  },
];

export const PN_VOCAB = vocabulary(pnModel, SPECS);
