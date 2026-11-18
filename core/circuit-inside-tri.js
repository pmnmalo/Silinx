// The three-state buffers inside their ICs (#4505, core/circuit-inside.js lays out the other gate ICs), as their
// datasheets' connection diagrams draw them: a buffer whose input and output are on one row lies flat beside them in
// that row's half, facing its output (the 74125's, 74367's); one whose input and output face each other across the body
// stands between them, pointing to its output's row (the 74244's, a transceiver's two directions side by side). Each
// enable pin feeds its buffers through a bus, a branch into each one's side (a bubble where it is active low, a dot
// where it branches). The buses cross the data lines at right angles (drawn as the circuit's wires cross: Wire
// crossings); a transceiver's pin is one buffer's input and the other's output, their lines joined by a dot. Only the
// enables a buffer has combined by a gate as its datasheet draws it (the 74365's and 74540's G1̅ and G2̅ by a NOR, the
// 74245's DIR and OE̅ by an AND and a NOR, one a direction), its output the bus (COMBINE). In pixels, from the part's
// pins unturned: rows 60 apart, pins 20 a step. Isomorphic module.
import { invertsOutput } from './symbol-standard.js';

const H = { w: 10, h: 10, cy: 18, bus: 27 };           // a flat buffer: its box, its middle and its bus from its row
const V = { len: 8, across: 6, base: 25, bus: 22, jogIn: 19, jogOut: 43, joined: 16, off: 6 };   // a standing one, from its input's row
const BUBBLE = 2;

// the gates combining a buffer's enables, by the enables of the IC's buffers ([pin, active] lists, JSON): each gate's
// function, box, the enables it serves (`for`) and its output's line to its bus (`out`, the bus along its last point's
// y); its inputs' bubbles (an active-low input of an AND); the enable pins' lines (`lines`: a trunk, then branches from
// a point on it, a dot there)
const third = (y, h, i) => y + (i * h) / 3;
const COMBINE = {
  // G1̅ (pin 1) and G2̅ (pin 15, 19): a NOR left of the buffers, its output the bus
  '[[1,"0"],[15,"0"]]': { gates: [{ fn: 'nor', x: 4, y: -34, w: 10, h: 8, for: '[[1,"0"],[15,"0"]]', out: [[18, -30]] }],
    lines: [{ pin: 15, points: [[20, -60], [20, -38], [2, -38], [2, third(-34, 8, 1)], [4, third(-34, 8, 1)]] }, { pin: 1, points: [[0, 0], [0, third(-34, 8, 2)], [4, third(-34, 8, 2)]] }] },
  '[[1,"0"],[19,"0"]]': { gates: [{ fn: 'nor', x: 4, y: -34, w: 10, h: 8, for: '[[1,"0"],[19,"0"]]', out: [[18, -30], [18, -22]] }],
    lines: [{ pin: 19, points: [[20, -60], [20, -38], [2, -38], [2, third(-34, 8, 1)], [4, third(-34, 8, 1)]] }, { pin: 1, points: [[0, 0], [0, third(-34, 8, 2)], [4, third(-34, 8, 2)]] }] },
  // DIR (pin 1) and OE̅ (pin 19): A to B while DIR is 1 and OE̅ 0 (an AND, OE̅'s input bubbled), B to A while both are 0 (a NOR)
  '[[19,"0"],[1,"0"]]|[[19,"0"],[1,"1"]]': {
    gates: [{ fn: 'and', x: 8, y: -26, w: 8, h: 8, for: '[[19,"0"],[1,"1"]]', out: [[16, -22]], bubbles: [[6, third(-26, 8, 2)]] },
      { fn: 'nor', x: 8, y: -42, w: 8, h: 8, for: '[[19,"0"],[1,"0"]]', out: [[20, -38]] }],
    lines: [{ pin: 1, points: [[0, 0], [0, third(-42, 8, 1)], [8, third(-42, 8, 1)]] }, { pin: 1, points: [[0, third(-26, 8, 1)], [8, third(-26, 8, 1)]], dot: true },
      { pin: 19, points: [[20, -60], [20, -46], [2, -46], [2, third(-26, 8, 2)], [4, third(-26, 8, 2)]] }, { pin: 19, points: [[2, third(-42, 8, 2)], [8, third(-42, 8, 2)]], dot: true }] },
};

/** The layout of a three-state IC's inside ({ gates, wires, crossings } as insideLayout's; wires of kind 'en' from an
 *  enable pin, or from a combining gate's output (no pin, its `net`); a combining gate after the buffers, its `enables`
 *  its pins; `dots`: where a line branches, `bubbles`: an active-low enable's, on its buffer's side or its gate's input),
 *  or null when its buffers' combined enables are none of COMBINE's. */
export function triLayout(d, pins) {
  if (d.gates.some((g) => !g.en || g.ins.length !== 1)) return null;
  const sigs = [...new Set(d.gates.filter((g) => g.en.length > 1).map((g) => JSON.stringify(g.en)))].sort();
  const combine = sigs.length ? COMBINE[sigs.join('|')] : null;
  if (sigs.length && !combine) return null;
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
      ctrl.push({ gi, src: g.en.length > 1 ? JSON.stringify(g.en) : g.en[0][0], low: g.en.length === 1 && g.en[0][1] === '0', x: cx, y: edge, from: Y(ri, H.bus), side: ri });
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
    ctrl.push({ gi, src: g.en.length > 1 ? JSON.stringify(g.en) : g.en[0][0], low: g.en.length === 1 && g.en[0][1] === '0', x: cx - dir * V.across / 4, y: mid, from: Y(ri, V.bus), side: ri, standing: true, dir });
  });
  // the combining gates (#4505): each after the buffers, its enable pins' lines into it
  const fed = new Map();
  for (const c of combine?.gates ?? []) {
    const k = gates.length, h = c.h, slots = [third(c.y, h, 1), third(c.y, h, 2)], inv = invertsOutput(c.fn);
    gates.push({ fn: c.fn, x: c.x, y: c.y, w: c.w, h, flip: false, tip: [c.x + c.w + (inv ? 2 * BUBBLE : 0), c.y + h / 2], ins: slots.map((y) => [c.x, y]),
      bubble: inv ? [c.x + c.w + BUBBLE, c.y + h / 2] : null, enables: JSON.parse(c.for).map(([n]) => n) });
    bubbles.push(...(c.bubbles ?? []));
    fed.set(c.for, { gate: k, start: [gates[k].tip, ...c.out] });
  }
  for (const l of combine?.lines ?? []) {
    const k = gates.findIndex((g) => g.ins?.some((q) => q[0] === l.points.at(-1)[0] && q[1] === l.points.at(-1)[1]) || (g.enables && Math.abs(g.x - l.points.at(-1)[0]) <= 4 && g.ins.some((q) => q[1] === l.points.at(-1)[1])));
    wires.push({ gate: k, pin: l.pin, kind: 'en', points: l.points });
    if (l.dot) dots.push(l.points[0]);
  }
  // the buses: an enable pin's line (or its combining gate's output) to its bus, along it, a branch into each buffer
  for (const src of [...new Set(ctrl.map((c) => c.src))]) {
    const cs = ctrl.filter((c) => c.src === src), f = fed.get(src);
    const pin = f ? null : src, net = f ? `enable ${f.gate + 1}` : undefined;
    const start = f ? f.start : (() => { const [xe, re] = at.get(src); return [[xe, re]]; })();
    const [xe, re] = start.at(-1);
    const busY = f ? re : cs.find((c) => c.side === re)?.from ?? cs[0].from;
    // (a standing buffer's branch in its own column, between its input's and its side)
    const xs = cs.map((c) => (c.standing ? c.x - c.dir * 3.5 : c.x));
    const far = xs.reduce((a, x) => (Math.abs(x - xe) > Math.abs(a - xe) ? x : a), xs[0]);
    const main = [...start, ...(f ? [] : [[xe, busY]]), [far, busY]].filter((q, i, a) => !i || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1]);
    wires.push({ gate: f ? f.gate : cs[0].gi, pin, ...(net ? { net } : {}), kind: 'en', points: main });
    cs.forEach((c, k) => {
      const bx = xs[k];
      const pts = c.standing ? [[bx, busY], [bx, c.y], [c.x, c.y]] : [[bx, busY], [c.x, c.y]];
      wires.push({ gate: c.gi, pin, ...(net ? { net } : {}), kind: 'en', points: pts });
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
    if ((w.net ?? w.pin) === (v.net ?? v.pin)) return;
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
