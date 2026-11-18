// The three-state buffers inside their ICs (#4505, core/circuit-inside.js lays out the other gate ICs), as their
// datasheets' connection diagrams draw them: a buffer whose input and output are on one row lies flat beside them in
// that row's half, facing its output (the 74125's, 74367's); one whose input and output face each other across the body
// stands between them, pointing to its output's row (the 74244's, a transceiver's two directions side by side). Each
// enable pin feeds its buffers through a bus, a branch into each one's side (a bubble where it is active low, a dot
// where it branches). The buses cross the data lines at right angles (drawn as the circuit's wires cross: Wire
// crossings); a transceiver's pin is one buffer's input and the other's output, their lines joined by a dot. Only the
// ICs whose buffers have one enable each (the 74365's, 74540's, 74245's combined enables: not laid out). In pixels,
// from the part's pins unturned: rows 60 apart, pins 20 a step. Isomorphic module.
import { invertsOutput } from './symbol-standard.js';

const H = { w: 10, h: 10, cy: 18, bus: 27 };           // a flat buffer: its box, its middle and its bus from its row
const V = { len: 8, across: 6, base: 25, bus: 22, jogIn: 19, jogOut: 43, joined: 16, off: 6 };   // a standing one, from its input's row
const BUBBLE = 2;

/** The layout of a three-state IC's inside ({ gates, wires, crossings } as insideLayout's; wires of kind 'en' from an
 *  enable pin, `dots`: where a line branches, `bubbles`: an active-low enable's, on its buffer's side), or null when a
 *  buffer has more than one enable. */
export function triLayout(d, pins) {
  if (d.gates.some((g) => !g.en || g.en.length !== 1 || g.ins.length !== 1)) return null;
  const p1 = pins.find((q) => q.n === 1), p2 = pins.find((q) => q.n === 2);
  const s = (p2.x - p1.x) / 20, T = ([x, y]) => [p1.x + x * s, p1.y + y * s];
  const at = new Map(pins.map((q) => [q.n, [(q.x - p1.x) / s, (q.y - p1.y) / s]]));
  const top = -60, Y = (row, dy) => (row === 0 ? -dy : top + dy);   // (dy from a row toward the middle)
  const gates = [], wires = [], dots = [], bubbles = [], ctrl = [];
  // (a transceiver's pin both an input and an output: its second line ends on its first, a dot)
  const both = new Set(d.gates.flatMap((g) => g.ins).filter((n) => d.gates.some((g) => g.out === n)));
  d.gates.forEach((g, gi) => {
    const [xi, ri] = at.get(g.ins[0]), [xo, ro] = at.get(g.out), inv = invertsOutput(g.fn);
    if (ri === ro) {
      // flat beside its row, facing its output: its tip 4 before the output's column
      const dir = Math.sign(xo - xi), tip = xo - 4 * dir, xIn = tip - dir * ((inv ? 2 * BUBBLE : 0) + H.w), cy = Y(ri, H.cy);
      gates.push({ fn: g.fn, x: Math.min(xIn, xIn + dir * H.w), y: cy - H.h / 2, w: H.w, h: H.h, flip: dir < 0, tip: [tip, cy], ins: [[xIn, cy]],
        bubble: inv ? [xIn + dir * (H.w + BUBBLE), cy] : null });
      wires.push({ gate: gi, pin: g.ins[0], kind: 'in', points: [[xi, ri], [xi, cy], [xIn, cy]] });
      wires.push({ gate: gi, pin: g.out, kind: 'out', points: [[tip, cy], [xo, cy], [xo, ro]] });
      // (its enable into its side away from the row: the slanted edge's middle)
      const cx = xIn + dir * H.w / 2, edge = cy + (ri === 0 ? -1 : 1) * H.h / 4;
      ctrl.push({ gi, pin: g.en[0][0], low: g.en[0][1] === '0', x: cx, y: edge, from: Y(ri, H.bus), side: ri });
      return;
    }
    // standing between its rows, beside its input's column toward its output's, pointing to its output's row
    const dir = Math.sign(xo - xi), cx = xi + dir * V.off, base = Y(ri, V.base), apex = Y(ri, V.base + V.len), tipY = Y(ri, V.base + V.len + (inv ? 2 * BUBBLE : 0));
    gates.push({ fn: g.fn, x: cx - V.across / 2, y: Math.min(base, apex), w: V.across, h: V.len, flip: false, rot: ri === 0 ? -90 : 90, tip: [cx, tipY], ins: [[cx, base]],
      bubble: inv ? [cx, Y(ri, V.base + V.len + BUBBLE)] : null });
    wires.push({ gate: gi, pin: g.ins[0], kind: 'in', points: [[xi, ri], [xi, Y(ri, V.jogIn)], [cx, Y(ri, V.jogIn)], [cx, base]] });
    // (its output to its pin; a transceiver's onto its pin's other line)
    if (both.has(g.out)) { const j = Y(ro, V.joined); wires.push({ gate: gi, pin: g.out, kind: 'out', points: [[cx, tipY], [cx, j], [xo, j]] }); dots.push([xo, j]); }
    else { const j = Y(ri, V.jogOut); wires.push({ gate: gi, pin: g.out, kind: 'out', points: [[cx, tipY], [cx, j], [xo, j], [xo, ro]] }); }
    // (its enable into its side toward its input's column: the edge's middle)
    const mid = (base + apex) / 2;
    ctrl.push({ gi, pin: g.en[0][0], low: g.en[0][1] === '0', x: cx - dir * V.across / 4, y: mid, from: Y(ri, V.bus), side: ri, standing: true, dir });
  });
  // the buses: an enable pin's line to its bus, along it, a branch into each buffer it enables
  for (const pin of [...new Set(ctrl.map((c) => c.pin))]) {
    const cs = ctrl.filter((c) => c.pin === pin), [xe, re] = at.get(pin);
    const busY = cs.find((c) => c.side === re)?.from ?? cs[0].from;
    // (a standing buffer's branch in its own column, between its input's and its side)
    const xs = cs.map((c) => (c.standing ? c.x - c.dir * 3.5 : c.x));
    const far = xs.reduce((a, x) => (Math.abs(x - xe) > Math.abs(a - xe) ? x : a), xs[0]);
    wires.push({ gate: cs[0].gi, pin, kind: 'en', points: [[xe, re], [xe, busY], [far, busY]] });
    cs.forEach((c, k) => {
      const bx = xs[k];
      const pts = c.standing ? [[bx, busY], [bx, c.y], [c.x, c.y]] : [[bx, busY], [c.x, c.y]];
      wires.push({ gate: c.gi, pin, kind: 'en', points: pts });
      if (bx !== far) dots.push([bx, busY]);
      if (c.low) bubbles.push(c.standing ? [c.x - c.dir * BUBBLE, c.y] : [c.x, c.y + (c.side === 0 ? -BUBBLE : BUBBLE)]);
    });
  }
  const tw = wires.map((w) => ({ ...w, points: w.points.map(T) }));
  return { gates: gates.map((g) => ({ ...g, x: T([g.x, 0])[0], y: T([0, g.y])[1], w: g.w * s, h: g.h * s, tip: T(g.tip), ins: g.ins.map(T), bubble: g.bubble && T(g.bubble) })),
    wires: tw, dots: dots.map(T), bubbles: bubbles.map(T), crossings: crossingsOf(tw) };
}

// where two lines of different pins cross at a right angle, each through the other
function crossingsOf(wires) {
  const out = [];
  const segs = (w) => w.points.slice(1).map((b, i) => [w.points[i], b]);
  wires.forEach((w, i) => wires.slice(i + 1).forEach((v) => {
    if (w.pin === v.pin) return;
    for (const a of segs(w)) for (const b of segs(v)) { const c = crossAt(a, b); if (c) out.push(c); }
  }));
  return out;
}
function crossAt([a, b], [c, d]) {
  const h1 = a[1] === b[1], h2 = c[1] === d[1];
  if (h1 === h2) return null;
  const [Hs, Vs] = h1 ? [[a, b], [c, d]] : [[c, d], [a, b]], x = Vs[0][0], y = Hs[0][1];
  const inside = (v, p, q) => v > Math.min(p, q) + 1e-6 && v < Math.max(p, q) - 1e-6;
  return inside(x, Hs[0][0], Hs[1][0]) && inside(y, Vs[0][1], Vs[1][1]) ? [x, y] : null;
}
