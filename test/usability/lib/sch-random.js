// Usability tests (#5148): the schematic's vocabulary of random actions (lib/random.js), on the gates example: move an
// inverter, drag a wire's inner segment, place an inverter in the free corner, wire two of the new ones, change a new
// one's width, delete one, Undo, Redo. Each action's arguments are drawn so that the person's step is a sound one
// (no symbol dropped on another, no segment dragged onto another wire: what is left is the editor's doing). The known
// bugs' cases are not drawn (their issues say which), so that a failure is a new one.
import assert from 'node:assert/strict';
import { symbolPins, symbolBox } from '../../../core/schdoc-symbols.js';
import { nets } from './sch-invariants.js';

// the free strip of the gates example's sheet (1700 by 1100), under the LEDs' join, where new inverters go
const FREE = { x0: 1260, y0: 1030, x1: 1640, y1: 1080 };
const MARGIN = 20;
const sameNets = (d, b) => assert.deepEqual(nets(d), nets(b), 'the nets changed');

const boxOf = (s) => symbolBox(s);
const hits = (a, b, m = MARGIN) => a.x - m < b.x + b.w && b.x - m < a.x + a.w && a.y - m < b.y + b.h && b.y - m < a.y + a.h;
/** Whether a box is clear of every symbol (but `except`) and every wire's point and segment. */
function clear(doc, box, except = null) {
  if (doc.symbols.some((s) => s.id !== except && hits(box, boxOf(s)))) return false;
  const inBox = (p) => p.x >= box.x - MARGIN && p.x <= box.x + box.w + MARGIN && p.y >= box.y - MARGIN && p.y <= box.y + box.h + MARGIN;
  const own = except ? new Set(symbolPins(doc.symbols.find((s) => s.id === except)).map((p) => `${p.x},${p.y}`)) : new Set();
  // (a wire through the box, its own wires apart: those on its pins follow it)
  return !doc.wires.some((w) => !w.points.some((p) => own.has(`${p.x},${p.y}`)) && w.points.some((p, i) => {
    if (inBox(p)) return true;
    if (!i) return false;
    const a = w.points[i - 1];
    const [lo, hi] = a.x === p.x ? [Math.min(a.y, p.y), Math.max(a.y, p.y)] : [Math.min(a.x, p.x), Math.max(a.x, p.x)];
    return a.x === p.x ? p.x >= box.x - MARGIN && p.x <= box.x + box.w + MARGIN && lo <= box.y + box.h + MARGIN && hi >= box.y - MARGIN
      : p.y >= box.y - MARGIN && p.y <= box.y + box.h + MARGIN && lo <= box.x + box.w + MARGIN && hi >= box.x - MARGIN;
  }));
}
const onSheet = (d, b) => b.x >= 10 && b.y >= 10 && b.x + b.w <= (d.sheet?.w ?? 1700) - 10 && b.y + b.h <= (d.sheet?.h ?? 1100) - 10;
const isNew = (s) => /^inst_\d+$/.test(s.name);
const inverters = (d) => d.symbols.filter((s) => s.type === 'inv');
const pinAt = (d, s, name) => symbolPins(s).find((p) => p.name === name);
const wiredAt = (d, p) => d.wires.some((w) => w.points.some((q) => q.x === p.x && q.y === p.y));

export const SCH_VOCAB = [
  {
    // an inverter (the example's or a new one: none carries a net name on its pins, #5154) dragged a few grid steps
    name: 'moveSymbol', weight: 4,
    gen(d, rng) {
      const s = rng.pick(inverters(d));
      if (!s) return null;
      const dx = rng.int(-3, 3) * 10, dy = rng.int(-3, 3) * 10;
      const b = boxOf(s);
      const nb = { ...b, x: b.x + dx, y: b.y + dy };
      if ((!dx && !dy) || !onSheet(d, nb) || !clear(d, nb, s.id)) return null;
      return { name: s.name, dx, dy };
    },
    run: (s, { name, dx, dy }) => s.step('moveSymbol', { name, dx, dy }, () => s.a.moveSymbol(name, dx, dy), { expect: sameNets }),
  },
  {
    // a wire's inner segment (neither its first nor its last) dragged across, onto no other wire (#5155)
    name: 'moveSegment', weight: 4,
    gen(d, rng) {
      const w = rng.pick(d.wires.filter((x) => x.points.length >= 4));
      if (!w) return null;
      const i = rng.int(2, w.points.length - 2);
      const [a, b] = [w.points[i - 1], w.points[i]];
      const vertical = a.x === b.x;
      if (Math.abs(vertical ? a.y - b.y : a.x - b.x) < 20) return null;
      const by = rng.pick([-20, -10, 10, 20]);
      const at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // (its new place clear of other wires, pins and bodies, #5155; the stretch it sweeps of pins and bodies)
      const [na, nb] = vertical ? [{ x: a.x + by, y: a.y }, { x: b.x + by, y: b.y }] : [{ x: a.x, y: a.y + by }, { x: b.x, y: b.y + by }];
      const swept = { x: Math.min(a.x, na.x), y: Math.min(a.y, na.y), w: Math.abs(nb.x - a.x), h: Math.abs(nb.y - a.y) };
      const others = { ...d, wires: d.wires.filter((x) => x.id !== w.id) };
      if (at.x % 10 || at.y % 10 || !clearLine(others, na, nb) || !clearSweep(d, swept)) return null;
      return { wire: w.id, x: at.x, y: at.y, dx: vertical ? by : 0, dy: vertical ? 0 : by };
    },
    run: (s, { wire, x, y, dx, dy }) => s.step('moveSegment', { wire, x, y, dx, dy }, () => s.a.moveSegment(x, y, dx, dy), { expect: sameNets }),
  },
  {
    name: 'place', weight: 2,
    gen(d, rng) {
      if (d.symbols.filter(isNew).length >= 6) return null;
      const x = rng.int(FREE.x0 / 10, FREE.x1 / 10) * 10, y = rng.int(FREE.y0 / 10, FREE.y1 / 10) * 10;
      // (the body placed with its centre at the click: 80 by 20)
      const box = { x: x - 40, y: y - 10, w: 80, h: 20 };
      if (!onSheet(d, box) || !clear(d, box)) return null;
      return { symbol: 'INV', x, y };
    },
    run: (s, { symbol, x, y }) => s.step('place', { symbol, x, y }, () => s.a.place(symbol, x, y), { expect: (d, b) => assert.equal(d.symbols.length, b.symbols.length + 1) }),
  },
  {
    // a new inverter's free output to another's free input to its right: a straight wire on the same row, else one
    // with a bend halfway (two corners), on a clear path
    name: 'addWire', weight: 3,
    gen(d, rng) {
      const outs = d.symbols.filter(isNew).map((s) => pinAt(d, s, 'O')).filter((p) => !wiredAt(d, p));
      const ins = d.symbols.filter(isNew).map((s) => pinAt(d, s, 'I')).filter((p) => !wiredAt(d, p));
      const pairs = outs.flatMap((o) => ins.filter((i) => i.x >= o.x + 40).map((i) => [o, i]));
      if (!pairs.length) return null;
      const [o, i] = rng.pick(pairs);
      const mx = Math.round((o.x + i.x) / 20) * 10;
      const points = o.y === i.y ? [o, i] : [o, { x: mx, y: o.y }, { x: mx, y: i.y }, i];
      // (each stretch clear, and its corners on no pin and no wire)
      const pins = d.symbols.flatMap((x) => symbolPins(x)).concat(d.ports);
      const onWire = (p) => d.wires.some((w) => w.points.some((q, k) => k && Math.min(q.x, w.points[k - 1].x) <= p.x && p.x <= Math.max(q.x, w.points[k - 1].x) && Math.min(q.y, w.points[k - 1].y) <= p.y && p.y <= Math.max(q.y, w.points[k - 1].y)));
      if (points.slice(1, -1).some((p) => pins.some((q) => q.x === p.x && q.y === p.y) || onWire(p))) return null;
      if (!points.every((p, k) => !k || clearLine(d, points[k - 1], p))) return null;
      return { points: points.map((p) => [p.x, p.y]) };
    },
    run: (s, { points }) => s.step('addWire', { points }, () => s.a.addWire(points), { expect: (d, b) => assert.equal(d.wires.length, b.wires.length + 1) }),
  },
  {
    name: 'setParam', weight: 1,
    gen(d, rng) {
      const s = rng.pick(d.symbols.filter(isNew));
      if (!s) return null;
      const width = rng.pick([1, 2, 4].filter((x) => x !== (s.params.width || 1)));
      return { name: s.name, width };
    },
    // (its nets then wider than its neighbours' pins: those width mismatches, which the step makes, are expected)
    run: (s, { name, width }) => s.step('setParam', { name, width }, () => s.a.setParam(name, 'width', width, { fresh: true }), { expect: sameNets, errors: (e) => e.every((m) => /width mismatch/.test(m)) }),
  },
  {
    // a new inverter deleted: the wires on its pins freed
    name: 'deleteSymbol', weight: 1,
    gen(d, rng) {
      const s = rng.pick(d.symbols.filter(isNew));
      return s ? { name: s.name } : null;
    },
    run: (s, { name }) => s.step('deleteSymbol', { name }, () => s.a.deleteSymbol(name), {
      frees: (after, before) => {
        const sym = before.symbols.find((x) => x.name === name);
        const pins = new Set(symbolPins(sym).map((p) => `${p.x},${p.y}`));
        return before.wires.filter((w) => [w.points[0], w.points.at(-1)].some((p) => pins.has(`${p.x},${p.y}`))).map((w) => w.id);
      },
      expect: (d, b) => assert.equal(d.symbols.length, b.symbols.length - 1),
    }),
  },
  { name: 'undo', weight: 2, gen: (d, rng) => (rng.next() < 0.9 ? {} : null), run: (s) => s.undo() },
  { name: 'redo', weight: 1, gen: () => ({}), run: (s) => s.redo() },
];

/** Whether a straight stretch from `a` to `b` (its ends apart) may hold a wire: no pin, wire corner or end, or symbol
 *  body on it, and no other wire along it (crossing one is fine: no junction there). */
function clearLine(d, a, b) {
  const lo = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, hi = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  const on = (p) => p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y && !(p.x === a.x && p.y === a.y) && !(p.x === b.x && p.y === b.y);
  const pins = d.symbols.flatMap((s) => symbolPins(s)).concat(d.ports);
  if (pins.some(on) || d.wires.some((w) => w.points.some(on))) return false;
  if (d.symbols.some((s) => hits({ x: lo.x, y: lo.y, w: hi.x - lo.x, h: hi.y - lo.y }, boxOf(s), 0))) return false;
  const vertical = a.x === b.x;
  return !d.wires.some((w) => w.points.some((p, i) => {
    if (!i) return false;
    const q = w.points[i - 1];
    if (vertical ? !(q.x === p.x && p.x === a.x) : !(q.y === p.y && p.y === a.y)) return false;
    const [u, v] = vertical ? [Math.min(q.y, p.y), Math.max(q.y, p.y)] : [Math.min(q.x, p.x), Math.max(q.x, p.x)];
    return vertical ? u < hi.y && v > lo.y : u < hi.x && v > lo.x;
  }));
}

/** Whether a box swept by a dragged segment holds no pin and no symbol body (wires it crosses are fine). */
function clearSweep(d, box) {
  const pins = d.symbols.flatMap((s) => symbolPins(s)).concat(d.ports);
  if (pins.some((p) => p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h)) return false;
  return !d.symbols.some((s) => hits(box, boxOf(s), 0));
}
