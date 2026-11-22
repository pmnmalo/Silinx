// Usability tests (#5148): the circuit's vocabulary of random actions (lib/random.js), on the breadboard example: an IC
// (7404, 7408) placed across the channel in the free columns, powered (its VCC and GND wired to the rails from free holes
// of their columns), an IC's output linked to a new IC's input (a wire between free holes of their columns), a new IC
// moved along the row, a new IC or a new wire deleted, Undo, Redo. Each action's arguments are drawn so that the person's
// step is a sound one (a lead in a free hole, a wire between free holes, no short circuit): what is left is the editor's
// doing. An IC not powered yet is an error the steps make (the session tolerates it).
import assert from 'node:assert/strict';
import { partPins, partHoles } from '../../../core/circuit-parts.js';

// the free columns of the breadboard example's board, right of its 7486 (columns 47 to 63: x 46 to 62)
const FREE = { x0: 46, x1: 62 };
const ICS = { 7404: { pins: 14, vcc: 14, gnd: 7 }, 7408: { pins: 14, vcc: 14, gnd: 7 } };
const k = (x, y) => `${x},${y}`;

/** The board's holes by point, and the points taken (a lead or a wire's end on them). */
function board(m) {
  const bb = m.parts.find((p) => p.type.startsWith('breadboard'));
  const holes = new Map(partHoles(bb).map((h) => [k(h.x, h.y), h]));
  const taken = new Set([...m.parts.filter((p) => p !== bb).flatMap((p) => partPins(p)).map((q) => k(q.x, q.y)),
    ...m.wires.flatMap((w) => [w.points[0], w.points.at(-1)]).map((p) => k(p[0], p[1]))]);
  return { holes, taken };
}
/** A free hole of a strip (a column's five holes, a rail): the first, from `ys`, nothing is on. */
function freeHole(b, x, ys) {
  for (const y of ys) if (b.holes.has(k(x, y)) && !b.taken.has(k(x, y))) return [x, y];
  return null;
}
const isNew = (p) => ICS[p.type] && p.x >= FREE.x0 - 1;
const pinOf = (p, n) => partPins(p).find((q) => q.n === n);
const upper = [3, 2, 1, 0], lower = [8, 9, 10, 11];   // (a column's holes from the channel out: a–e above it, f–j below)
const holesOf = (q) => (q.y <= 4 ? upper : lower);
/** Whether an IC at (x, 7) would have its leads in free holes, its columns clear of other leads. */
function fits(m, b, type, x, self = null) {
  if (x < FREE.x0 || x + ICS[type].pins / 2 - 1 > FREE.x1) return false;
  const p = { id: '?', type, x, y: 7 };
  const own = self ? new Set(partPins(self).map((q) => k(q.x, q.y))) : new Set();
  const others = m.parts.filter((o) => o !== self && ICS[o.type]).flatMap((o) => partPins(o)).map((q) => q.x);
  // (each lead in a free hole, its column's half with no other IC's lead and no wire: a wire left there by a part
  // deleted joins the lead to what it goes to, a rail perhaps)
  const wired = (q) => m.wires.some((w) => [w.points[0], w.points.at(-1)].some((e) => e[0] === q.x && holesOf(q).includes(e[1])));
  return partPins(p).every((q) => b.holes.has(k(q.x, q.y)) && (own.has(k(q.x, q.y)) || !b.taken.has(k(q.x, q.y))) && !others.includes(q.x) && (self || !wired(q)));
}
const powered = (m, b, p) => [ICS[p.type].vcc, ICS[p.type].gnd].every((n) => {
  const q = pinOf(p, n);
  return m.wires.some((w) => [w.points[0], w.points.at(-1)].some((e) => e[0] === q.x && holesOf(q).includes(e[1])));
});

export const CIRC_VOCAB = [
  {
    name: 'place', weight: 2,
    gen(m, rng) {
      if (m.parts.filter(isNew).length >= 2) return null;
      const type = rng.pick(Object.keys(ICS));
      const x = rng.int(FREE.x0, FREE.x1);
      return fits(m, board(m), type, x) ? { part: type, x, y: 7 } : null;
    },
    run: (s, { part, x, y }) => s.step('place', { part, x, y }, () => s.a.place(part, x, y), { expect: (d, b) => assert.equal(d.parts.length, b.parts.length + 1) }),
  },
  {
    // a new IC's VCC to the top + rail, or its GND to the bottom − rail, from a free hole of its column
    name: 'power', weight: 3,
    gen(m, rng) {
      const b = board(m);
      const p = rng.pick(m.parts.filter(isNew));
      if (!p) return null;
      const pin = rng.pick([ICS[p.type].vcc, ICS[p.type].gnd]);
      const q = pinOf(p, pin);
      if (m.wires.some((w) => [w.points[0], w.points.at(-1)].some((e) => e[0] === q.x && holesOf(q).includes(e[1])))) return null;
      const from = freeHole(b, q.x, holesOf(q));
      const to = freeHole(b, q.x, pin === ICS[p.type].vcc ? [-4] : [14]);
      return from && to ? { part: p.id, pin, points: [from, to] } : null;
    },
    run: (s, { part, pin, points }) => s.step('power', { part, pin, points }, () => s.a.addWire(points), { expect: (d, b) => assert.equal(d.wires.length, b.wires.length + 1) }),
  },
  {
    // an output of a powered IC (the example's or a new one) to a new powered IC's input with nothing on it yet
    name: 'link', weight: 3,
    gen(m, rng) {
      const b = board(m);
      const ics = m.parts.filter((p) => ICS[p.type] || /^74/.test(p.type));
      const outs = ics.filter((p) => !isNew(p) || powered(m, b, p)).flatMap((p) => partPins(p).filter((q) => q.dir === 'out').map((q) => ({ p, q })));
      const ins = m.parts.filter((p) => isNew(p) && powered(m, b, p)).flatMap((p) => partPins(p).filter((q) => q.dir === 'in').map((q) => ({ p, q })))
        .filter(({ q }) => !m.wires.some((w) => [w.points[0], w.points.at(-1)].some((e) => e[0] === q.x && holesOf(q).includes(e[1]))));
      const o = rng.pick(outs), i = rng.pick(ins);
      if (!o || !i || o.p === i.p) return null;
      const from = freeHole(b, o.q.x, holesOf(o.q)), to = freeHole(b, i.q.x, holesOf(i.q));
      return from && to ? { from: `${o.p.id}.${o.q.n}`, to: `${i.p.id}.${i.q.n}`, points: [from, to] } : null;
    },
    run: (s, { from, to, points }) => s.step('link', { from, to, points }, () => s.a.addWire(points), { expect: (d, b) => assert.equal(d.wires.length, b.wires.length + 1) }),
  },
  {
    // a new IC moved along its row (its leads into other free holes; the wires in the holes stay, as on the bench)
    name: 'movePart', weight: 2,
    gen(m, rng) {
      const p = rng.pick(m.parts.filter(isNew));
      if (!p) return null;
      const dx = rng.pick([-2, -1, 1, 2]);
      // (only an IC with no wire in its columns, now or there: a wired one moved is joined to other strips, a lead of it
      // perhaps to a rail's wire, as on the bench)
      const cols = new Set(partPins(p).flatMap((q) => [q.x, q.x + dx]));
      if (m.wires.some((w) => [w.points[0], w.points.at(-1)].some((e) => cols.has(e[0]) && e[1] >= 0 && e[1] <= 11))) return null;
      return fits(m, board(m), p.type, p.x + dx, p) ? { id: p.id, dx } : null;
    },
    run: (s, { id, dx }) => s.step('movePart', { id, dx }, () => s.a.movePart(id, dx, 0), { expect: (d) => assert.ok(d.parts.some((p) => p.id === id)) }),
  },
  {
    name: 'deletePart', weight: 1,
    gen: (m, rng) => { const p = rng.pick(m.parts.filter(isNew)); return p ? { id: p.id } : null; },
    run: (s, { id }) => s.step('deletePart', { id }, () => s.a.deletePart(id), { frees: (after) => after.wires.map((w) => w.id), expect: (d, b) => assert.equal(d.parts.length, b.parts.length - 1) }),
  },
  {
    name: 'deleteWire', weight: 1,
    gen: (m, rng) => { const w = rng.pick(m.wires.filter((x) => +x.id.replace(/\D/g, '') > 61)); return w ? { id: w.id } : null; },
    run: (s, { id }) => s.step('deleteWire', { id }, () => s.a.deleteWire(id), {
      expect: (d, b) => assert.deepEqual(b.wires.filter((w) => !d.wires.some((x) => x.id === w.id)).map((w) => w.id), [id], 'the wire deleted, it alone'),
    }),
  },
  { name: 'undo', weight: 2, gen: (m, rng) => (rng.next() < 0.9 ? {} : null), run: (s) => s.undo() },
  { name: 'redo', weight: 1, gen: () => ({}), run: (s) => s.redo() },
];
