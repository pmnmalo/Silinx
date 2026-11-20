// The ICs drawn inside as their datasheets draw them (core/circuit-inside-drawn.js, #4934: the 7475, 7477, 74375, whose
// units share an enable). Checked against the IC's own pins (core/circuit-ics.js and the others), independently of the
// drawing: each box is one latch, its ports its unit's pins (nD, nQ, nQ̅) and the enable that names it (1C,2C), each
// labelled by its pin's function; every signal pin has a line from it; each port is reached by a line of its pin; lines
// horizontal and vertical, through no box; boxes inside the body, apart; each dot a branch of its pin's lines; the
// crossings counted; the drawing scaled and moved with the pins; a KiCad part behaving as one drawn the same; no other IC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, PART_ORDER } from '../core/circuit-parts.js';
import { DRAWN, drawnLayout } from '../core/circuit-inside-drawn.js';

const pinsOf = (d, s = 1, o = [0, 0]) => d.pins.map((q) => ({ n: q.n, x: o[0] + q.dx * 20 * s, y: o[1] + q.dy * 20 * s }));
const signal = (d) => d.pins.filter((p) => !['vcc', 'gnd', 'nc'].includes(p.dir));
const key = (p) => `${p[0]},${p[1]}`;
// the function of a pin of unit u: its name without the unit (1Q̅ → Q̅), an enable naming u (1C,2C) G
const role = (p, u) => (p.name.includes(',') ? (p.name.split(',').some((x) => x.startsWith(String(u))) ? 'G' : null) : p.name.startsWith(String(u)) ? p.name.slice(1) : null);
// does the segment a–b pass through the box b's inside (not along or onto its edge)?
const through = ([a, c], x) => {
  const lo = (i) => Math.min(a[i], c[i]), hi = (i) => Math.max(a[i], c[i]);
  return lo(0) < x.x + x.w && hi(0) > x.x && lo(1) < x.y + x.h && hi(1) > x.y && !(a[0] === c[0] && (a[0] <= x.x || a[0] >= x.x + x.w)) && !(a[1] === c[1] && (a[1] <= x.y || a[1] >= x.y + x.h));
};

test('#4934 the latches drawn as their datasheets: each box a latch with its own pins and its enable, every line from its pin to its port', () => {
  assert.deepEqual(Object.keys(DRAWN), ['7475', '7477', '74375']);
  for (const t of Object.keys(DRAWN)) {
    const d = PARTS[t], pins = pinsOf(d), at = new Map(pins.map((q) => [q.n, q]));
    const L = drawnLayout(d, pins);
    const xs = pins.map((q) => q.x), ys = pins.map((q) => q.y);
    assert.equal(L.boxes.length, 4, t);
    for (const b of L.boxes) {
      // (its ports: exactly the pins of its unit and its enable, each named by its function)
      const own = d.pins.filter((p) => role(p, b.unit)).map((p) => `${p.n} ${role(p, b.unit)}`).sort();
      assert.deepEqual(b.pins.map((p) => `${p.n} ${p.name}`).sort(), own, `${t} latch ${b.unit}`);
      assert.ok(b.x >= Math.min(...xs) - 7 && b.x + b.w <= Math.max(...xs) + 7 && b.y >= Math.min(...ys) + 7 && b.y + b.h <= Math.max(...ys) - 7, `${t} latch ${b.unit} inside the body`);
      for (const o of L.boxes) if (o !== b) assert.ok(b.x + b.w <= o.x || o.x + o.w <= b.x || b.y + b.h <= o.y || o.y + o.h <= b.y, `${t}: latches ${b.unit} and ${o.unit} apart`);
      // (each port on its edge, reached by a line of its pin; two ports of a side not at one height)
      for (const p of b.pins) {
        const on = p.edge === 'left' ? p.x === b.x : p.edge === 'right' ? p.x === b.x + b.w : p.edge === 'top' ? p.y === b.y : p.y === b.y + b.h;
        assert.ok(on, `${t} pin ${p.n}: on its box's ${p.edge} edge`);
        assert.ok(L.wires.some((w) => w.pin === p.n && w.points.some((q) => q[0] === p.x && q[1] === p.y)), `${t} pin ${p.n}: a line to its port`);
      }
      for (const side of ['left', 'right']) { const hs = b.pins.filter((p) => p.edge === side).map((p) => p.y); assert.equal(new Set(hs).size, hs.length, `${t} latch ${b.unit} ${side}`); }
    }
    for (const p of signal(d)) assert.ok(L.wires.some((w) => w.pin === p.n && key(w.points[0]) === key([at.get(p.n).x, at.get(p.n).y])), `${t} pin ${p.n}: a line from it`);
    for (const w of L.wires) {
      for (let i = 0; i + 1 < w.points.length; i++) {
        const [a, c] = [w.points[i], w.points[i + 1]];
        assert.ok(a[0] === c[0] || a[1] === c[1], `${t} pin ${w.pin}: horizontal and vertical`);
        for (const b of L.boxes) assert.ok(!through([a, c], b), `${t} pin ${w.pin}: through latch ${b.unit}`);
      }
    }
    // (a dot: where three or more ends or bends of its pin's lines meet, or a line's end on another's middle)
    for (const dot of L.dots) {
      const ws = L.wires.filter((w) => w.points.some((q, i) => key(q) === key(dot) || (i && (w.points[i - 1][0] === q[0] ? q[0] === dot[0] && Math.min(q[1], w.points[i - 1][1]) < dot[1] && dot[1] < Math.max(q[1], w.points[i - 1][1]) : q[1] === dot[1] && Math.min(q[0], w.points[i - 1][0]) < dot[0] && dot[0] < Math.max(q[0], w.points[i - 1][0])))));
      assert.ok(ws.length >= 2 && new Set(ws.map((w) => w.pin)).size === 1, `${t} dot ${dot}: a branch of one pin's lines`);
    }
    assert.deepEqual(L.unnamed.map((n) => d.pins.find((p) => p.n === n).dir).sort(), ['gnd', 'vcc'], `${t}: its supply's pins unnamed inside`);
  }
});

test('#4934 the drawings\' crossings (as their datasheets\', no dot), scaled and moved with the pins; a KiCad 74LS75; no other IC', () => {
  const n = (t) => drawnLayout(PARTS[t], pinsOf(PARTS[t])).crossings.length;
  assert.deepEqual([n('7475'), n('7477'), n('74375')], [5, 3, 0]);
  const d = PARTS['7475'], a = drawnLayout(d, pinsOf(d)), b = drawnLayout(d, pinsOf(d, 2, [100, 40]));
  assert.deepEqual(b.boxes.map((x) => [x.x, x.y, x.w, x.h]), a.boxes.map((x) => [100 + 2 * x.x, 40 + 2 * x.y, 2 * x.w, 2 * x.h]));
  assert.deepEqual(b.dots, a.dots.map(([x, y]) => [100 + 2 * x, 40 + 2 * y]));
  // (a KiCad part behaving as the 7475: its type its own, its pins the same)
  assert.deepEqual(drawnLayout({ ...d, type: 'parts/74xx.kicad_sym#74LS75', behaves: '7475' }, pinsOf(d)), a);
  for (const t of PART_ORDER.filter((x) => !Object.hasOwn(DRAWN, x))) assert.equal(drawnLayout(PARTS[t], pinsOf(PARTS[t])), null, t);
  assert.equal(drawnLayout({ ...d, gates: [] }, pinsOf(d)), null);
});
