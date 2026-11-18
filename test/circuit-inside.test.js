// The gates inside a gate IC as its datasheet's connection diagram draws them (#4224, core/circuit-inside.js), for every
// gate IC of the parts list: each input's line from its pin to its gate's input side, each output's from the gate's tip
// (its bubble's end) to its pin; horizontal and vertical lines only; no line through another gate's body, nor through its
// own gate's, nor crossing or touching another gate's or pin's line; no two gates overlapping; everything inside the
// package (but the lines' ends on its pins); each gate beside its output's row, facing its output pin. The geometry is the
// same in both standards: the IEEE shape's box (core/symbol-standard.js ieeeGate) and the IEC box (iecGate) on the
// gate's box, their output end the gate's tip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insideLayout } from '../core/circuit-inside.js';
import { CROSSING_ICS } from '../core/circuit-inside-cross.js';
import { ICS } from '../core/circuit-ics.js';
import { MSI } from '../core/circuit-msi.js';
import { SEQ } from '../core/circuit-seq.js';
import { ieeeGate, iecGate } from '../core/symbol-standard.js';

const P = 20;
// a part's pins unturned, in pixels, pin 1 at (0, 0)
const pinsOf = (d) => d.pins.map((q) => ({ n: q.n, x: q.dx * P, y: q.dy * P }));
const segs = (pts) => pts.slice(1).map((b, i) => [pts[i], b]);
const near = (a, b) => Math.abs(a - b) < 1e-6;
// does the segment a–b pass through the open rectangle r (its inside, the edges excluded)
function through([a, b], r) {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])], [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return x1 > r.x + 1e-6 && x0 < r.x + r.w - 1e-6 && y1 > r.y + 1e-6 && y0 < r.y + r.h - 1e-6;
}
// do two orthogonal segments meet (cross, touch or overlap)
function meet([a, b], [c, d]) {
  const box = (p, q) => [Math.min(p[0], q[0]), Math.max(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[1], q[1])];
  const [ax0, ax1, ay0, ay1] = box(a, b), [cx0, cx1, cy0, cy1] = box(c, d);
  return ax0 <= cx1 + 1e-6 && cx0 <= ax1 + 1e-6 && ay0 <= cy1 + 1e-6 && cy0 <= ay1 + 1e-6;
}
// a gate's body with its bubble
// where two orthogonal segments cross at a right angle, each through the other (neither at its end), or null
function crossesAt([a, b], [c, d]) {
  const h1 = near(a[1], b[1]), h2 = near(c[1], d[1]);
  if (h1 === h2) return null;
  const [H, V] = h1 ? [[a, b], [c, d]] : [[c, d], [a, b]], x = V[0][0], y = H[0][1];
  const inside = (v, p, q) => v > Math.min(p, q) + 1e-6 && v < Math.max(p, q) - 1e-6;
  return inside(x, H[0][0], H[1][0]) && inside(y, V[0][1], V[1][1]) ? [x, y] : null;
}
const body = (g) => ({ x: g.flip ? g.x - (g.bubble ? 4 : 0) : g.x, y: g.y, w: g.w + (g.bubble ? 4 : 0), h: g.h });

// (the three-state buffers: their pins' names inside; the AND-OR-INVERTs, their terms and NOR: AOI_ICS, #4498)
// (the 4023, 4025, 4073 and 4075, a gate's inputs on both rows, one past its output: laid out with a crossing, #4505)
const CROSSED = ['74125', '74126', '74240', '74241', '74244', '74365', '74366', '74367', '74368', '74540', '74541', '74242', '74243', '74245'];
const AOI_ICS = ICS.filter((d) => d.gates?.some((g) => g.fn === 'aoi'));
const GATE_ICS = ICS.filter((d) => d.gates && !CROSSED.includes(d.type) && !AOI_ICS.includes(d));

test('#4224 every gate IC: each gate\'s lines from its pins to its input side, from its tip to its output pin, orthogonal', () => {
  assert.equal(GATE_ICS.length, 50);   // (23 of them KiCad's other gates, #4397; the 4023, 4025, 4073, 4075, #4505)
  for (const t of CROSSED) assert.deepEqual(insideLayout(ICS.find((d) => d.type === t), pinsOf(ICS.find((d) => d.type === t))), { gates: [], wires: [] }, t);
  for (const d of GATE_ICS) {
    const pins = pinsOf(d), at = new Map(pins.map((q) => [q.n, [q.x, q.y]]));
    const L = insideLayout(d, pins);
    assert.equal(L.gates.length, d.gates.length, d.type);
    assert.equal(L.wires.length, d.gates.reduce((s, g) => s + g.ins.length + 1, 0), d.type);
    for (const w of L.wires) {
      const what = `${d.type} gate ${w.gate + 1} pin ${w.pin}`, g = L.gates[w.gate], gd = d.gates[w.gate];
      for (const [a, b] of segs(w.points)) assert.ok(near(a[0], b[0]) || near(a[1], b[1]), `${what}: a slanted line ${a} ${b}`);
      if (w.kind === 'in') {
        assert.deepEqual(w.points[0], at.get(w.pin), `${what}: from its pin`);
        const end = w.points.at(-1);
        assert.deepEqual(end, g.ins[gd.ins.indexOf(w.pin)], `${what}: to its input`);
        // (on the input side: the box's left, or its right when it faces left; between its top and its bottom)
        assert.ok(near(end[0], g.flip ? g.x + g.w : g.x) && end[1] > g.y && end[1] < g.y + g.h, `${what}: on the input side`);
        // (it arrives horizontally, from outside the gate)
        const prev = w.points.at(-2);
        assert.ok(near(prev[1], end[1]) && (g.flip ? prev[0] > end[0] : prev[0] < end[0]), `${what}: into the input side`);
      } else {
        assert.equal(w.pin, gd.out);
        assert.deepEqual(w.points[0], g.tip, `${what}: from the tip`);
        assert.deepEqual(w.points.at(-1), at.get(w.pin), `${what}: to its pin`);
        // (the tip: the box's right, past the bubble when it inverts; facing its pin)
        assert.ok(near(g.tip[0], g.flip ? g.x - (g.bubble ? 4 : 0) : g.x + g.w + (g.bubble ? 4 : 0)), `${what}: the tip`);
        assert.ok(g.flip ? at.get(w.pin)[0] < g.tip[0] : at.get(w.pin)[0] > g.tip[0], `${what}: facing its pin`);
      }
    }
  }
});

test('#4224 every gate IC: no line through a gate, no two lines meeting, no gates overlapping, all inside the package', () => {
  for (const d of GATE_ICS) {
    const pins = pinsOf(d), ys = pins.map((q) => q.y), xs = pins.map((q) => q.x);
    const inner = { x0: Math.min(...xs) - 8, x1: Math.max(...xs) + 8, y0: Math.min(...ys) + 7, y1: Math.max(...ys) - 7 };
    const L = insideLayout(d, pins);
    L.gates.forEach((g, i) => {
      for (const w of L.wires) for (const sg of segs(w.points)) assert.ok(!through(sg, body(g)), `${d.type}: gate ${w.gate + 1} pin ${w.pin}'s line through gate ${i + 1}`);
      L.gates.forEach((o, j) => { if (j > i) assert.ok(!through([[body(o).x + 0.01, body(o).y + 0.01], [body(o).x + body(o).w - 0.01, body(o).y + 0.01]], body(g)) && !through([[body(o).x + 0.01, body(o).y + body(o).h - 0.01], [body(o).x + body(o).w - 0.01, body(o).y + body(o).h - 0.01]], body(g)), `${d.type}: gates ${i + 1} and ${j + 1} overlap`); });
      assert.ok(g.x >= inner.x0 && g.x + g.w <= inner.x1 && g.y >= inner.y0 && g.y + g.h <= inner.y1, `${d.type}: gate ${i + 1} inside the package`);
    });
    const crossed = [];
    L.wires.forEach((w, i) => {
      // (inside the package: but the vertical lines' ends on the pins' rows)
      for (const [x, y] of w.points.slice(1, -1)) assert.ok(x >= inner.x0 && x <= inner.x1 && y >= inner.y0 && y <= inner.y1, `${d.type}: gate ${w.gate + 1} pin ${w.pin}'s bend (${x}, ${y}) outside the package`);
      L.wires.forEach((v, j) => {
        if (j <= i) return;
        // (a crossing IC's, #4505: two lines meeting only where they cross at a right angle, neither at its end or bend)
        for (const a of segs(w.points)) for (const b of segs(v.points)) if (meet(a, b)) { assert.ok(CROSSING_ICS.includes(d.type) && crossesAt(a, b), `${d.type}: the lines of gate ${w.gate + 1} pin ${w.pin} and gate ${v.gate + 1} pin ${v.pin} meet`); crossed.push(crossesAt(a, b)); }
      });
    });
    assert.deepEqual(crossed, L.crossings ?? [], `${d.type}: its crossings`);
  }
});

test('#4224 the gates beside their output\'s row, facing it; the 7400 as its datasheet draws it', () => {
  for (const d of GATE_ICS) {
    const pins = pinsOf(d), at = new Map(pins.map((q) => [q.n, [q.x, q.y]]));
    const L = insideLayout(d, pins);
    d.gates.forEach((gd, i) => {
      const g = L.gates[i], o = at.get(gd.out), mixed = gd.ins.some((n) => at.get(n)[1] !== o[1]);
      const mid = g.y + g.h / 2;
      // (in the half on its output's row, or in the middle when its inputs come from both rows)
      // (a crossing IC's first gate a little lower, its 1C's line over it, #4505)
      if (mixed) assert.equal(mid, CROSSING_ICS.includes(d.type) && i === 0 ? -27.5 : -30, `${d.type} gate ${i + 1}: in the middle`);
      else assert.ok(o[1] === 0 ? mid > -30 : mid < -30, `${d.type} gate ${i + 1}: on its output's side`);
      assert.equal(g.flip, o[0] < gd.ins.reduce((a, n) => a + at.get(n)[0], 0) / gd.ins.length, `${d.type} gate ${i + 1}: facing its output`);
    });
  }
  // the 7400 (pins 1–7 left to right along the bottom, 14–8 along the top): the bottom row's gates face right, pin 1
  // entering the upper input, pin 2 the lower one going round the gate (as the datasheet's hook); the top row's too
  const L = insideLayout(ICS.find((d) => d.type === '7400'), pinsOf(ICS.find((d) => d.type === '7400')));
  assert.deepEqual(L.gates.map((g) => [g.fn, g.flip, g.x, g.y, g.w, g.h, g.tip, g.bubble]), [
    ['nand', false, 18, -24, 14, 12, [36, -18], [34, -18]], ['nand', false, 78, -24, 14, 12, [96, -18], [94, -18]],
    ['nand', false, 98, -48, 14, 12, [116, -42], [114, -42]], ['nand', false, 38, -48, 14, 12, [56, -42], [54, -42]]]);
  assert.deepEqual(L.wires.filter((w) => w.gate === 0).map((w) => [w.pin, w.points]), [
    [1, [[0, 0], [0, -20], [18, -20]]],
    [2, [[20, 0], [20, -9], [16, -9], [16, -16], [18, -16]]],
    [3, [[36, -18], [40, -18], [40, 0]]]]);
});

test('#4224 the same geometry in both standards: the IEEE shape and the IEC box on the gate\'s box, their output its tip', () => {
  for (const d of GATE_ICS) {
    for (const g of insideLayout(d, pinsOf(d)).gates) {
      const box = { x: g.x, y: g.y, w: g.w, h: g.h, r: 2 };
      // (drawn facing right in the box, then mirrored about it when the gate faces left: its tip the mirror image)
      const outX = (r) => (g.flip ? 2 * g.x + g.w - r.outX : r.outX);
      assert.equal(outX(ieeeGate(g.fn, box)), g.tip[0], `${d.type} IEEE`);
      assert.equal(outX(iecGate(g.fn, box)), g.tip[0], `${d.type} IEC`);
      assert.equal(ieeeGate(g.fn, box).paths[0].split(' ')[0], `M${g.x},${g.y}`, `${d.type}: the shape from the box's corner`);
    }
  }
});

test('#4224 the other ICs (MSI, sequential): no gates, nothing laid out here (their functions\' boxes: core/circuit-inside-blocks.js, #4508)', () => {
  for (const d of [...MSI, ...SEQ, ...ICS.filter((x) => !x.gates)]) assert.deepEqual(insideLayout(d, pinsOf(d)), { gates: [], wires: [] }, d.type);
});

test('#4498 the AND-OR-INVERTs (7451, 74LS54, 7455): each term\'s AND beside its pins, into the NOR facing its output pin; orthogonal lines, none meeting, all inside', () => {
  assert.deepEqual(AOI_ICS.map((d) => d.type), ['7451', '7454', '7455']);
  for (const d of AOI_ICS) {
    const pins = pinsOf(d), at = new Map(pins.map((q) => [q.n, [q.x, q.y]])), ys = pins.map((q) => q.y), xs = pins.map((q) => q.x);
    const inner = { x0: Math.min(...xs) - 8, x1: Math.max(...xs) + 8, y0: Math.min(...ys) + 7, y1: Math.max(...ys) - 7 };
    const L = insideLayout(d, pins);
    // (an AND a term, a NOR a gate: its terms' ANDs, then its NOR)
    assert.deepEqual(L.gates.map((g) => [g.fn, g.of]), d.gates.flatMap((g, i) => [...g.terms.map(() => ['and', i]), ['nor', i]]), d.type);
    for (const g of L.gates.filter((x) => x.fn === 'and')) assert.ok([90, -90].includes(g.rot), `${d.type}: a term faces up or down`);
    assert.equal(L.wires.length, d.gates.reduce((s, g) => s + g.ins.length + g.terms.length + 1, 0), d.type);
    for (const w of L.wires) {
      const what = `${d.type} ${w.kind} ${w.pin ?? `gate ${w.gate + 1}`}`, g = L.gates[w.gate];
      for (const [a, b] of segs(w.points)) assert.ok(near(a[0], b[0]) || near(a[1], b[1]), `${what}: a slanted line ${a} ${b}`);
      if (w.kind === 'in') {
        assert.deepEqual(w.points[0], at.get(w.pin), `${what}: from its pin`);
        const end = w.points.at(-1), gd = d.gates[g.of];
        const term = L.gates.filter((x) => x.of === g.of && x.fn === 'and').indexOf(g), from = gd.terms.slice(0, term).reduce((a, n) => a + n, 0);
        assert.ok(gd.ins.slice(from, from + gd.terms[term]).includes(w.pin), `${what}: its term's pin`);
        assert.deepEqual(end, g.ins[gd.ins.slice(from, from + gd.terms[term]).indexOf(w.pin)], `${what}: to its input`);
        // (on the input side, the box's bottom facing up, its top facing down; arriving vertically from outside)
        assert.ok(near(end[1], g.rot === -90 ? g.y + g.h : g.y) && end[0] > g.x && end[0] < g.x + g.w, `${what}: on the input side`);
        const prev = w.points.at(-2);
        assert.ok(near(prev[0], end[0]) && (g.rot === -90 ? prev[1] > end[1] : prev[1] < end[1]), `${what}: into the input side`);
      } else if (w.kind === 'term') {
        const nor = L.gates[w.to];
        assert.equal(nor.fn, 'nor');
        assert.deepEqual(w.points[0], g.tip, `${what}: from its AND's tip`);
        assert.ok(nor.ins.some((q) => q[0] === w.points.at(-1)[0] && q[1] === w.points.at(-1)[1]) && near(w.points.at(-1)[0], nor.x), `${what}: into a NOR's input`);
      } else {
        assert.equal(g.fn, 'nor');
        assert.equal(w.pin, d.gates[g.of].out);
        assert.deepEqual(w.points[0], g.tip, `${what}: from the tip`);
        assert.deepEqual(w.points.at(-1), at.get(w.pin), `${what}: to its pin`);
        assert.ok(near(g.tip[0], g.x + g.w + 4) && at.get(w.pin)[0] >= g.tip[0], `${what}: the tip past the bubble, facing its pin`);
      }
    }
    // each NOR's inputs fed once, by its own terms
    for (const [i, nor] of L.gates.entries()) if (nor.fn === 'nor') assert.equal(L.wires.filter((w) => w.to === i).length, d.gates[nor.of].terms.length, d.type);
    L.gates.forEach((g, i) => {
      for (const w of L.wires) for (const sg of segs(w.points)) assert.ok(!through(sg, body(g)), `${d.type}: ${w.kind} ${w.pin}'s line through gate ${i + 1}`);
      L.gates.forEach((o, j) => { if (j > i) assert.ok(!through([[body(o).x + 0.01, body(o).y + 0.01], [body(o).x + body(o).w - 0.01, body(o).y + body(o).h - 0.01]], body(g)), `${d.type}: gates ${i + 1} and ${j + 1} overlap`); });
      assert.ok(g.x >= inner.x0 && body(g).x + body(g).w <= inner.x1 && g.y >= inner.y0 && g.y + g.h <= inner.y1, `${d.type}: gate ${i + 1} inside the package`);
    });
    L.wires.forEach((w, i) => {
      for (const [x, y] of w.points.slice(1, -1)) assert.ok(x >= inner.x0 && x <= inner.x1 && y >= inner.y0 && y <= inner.y1, `${d.type}: ${w.kind} ${w.pin}'s bend (${x}, ${y}) outside the package`);
      L.wires.forEach((v, j) => {
        if (j <= i) return;
        for (const a of segs(w.points)) for (const b of segs(v.points)) assert.ok(!meet(a, b), `${d.type}: the lines ${w.kind} ${w.pin ?? w.gate} and ${v.kind} ${v.pin ?? v.gate} meet`);
      });
    });
  }
  // the 7455 as its datasheet: A–D's AND below, E–H's above, the NOR at the right, Y up to pin 8
  const d = ICS.find((x) => x.type === '7455'), L = insideLayout(d, pinsOf(d));
  assert.deepEqual(L.gates.map((g) => [g.fn, g.x, g.y, g.w, g.h, g.rot ?? 0, g.tip]), [['and', 22.5, -22, 15, 8, -90, [30, -22]], ['and', 42.5, -46, 15, 8, 90, [50, -38]], ['nor', 92, -36, 14, 12, 0, [110, -30]]]);
  assert.deepEqual(L.wires.filter((w) => w.kind !== 'in').map((w) => w.points), [[[30, -22], [30, -28], [92, -28]], [[50, -38], [50, -32], [92, -32]], [[110, -30], [120, -30], [120, -60]]]);
  assert.deepEqual(L.wires.find((w) => w.pin === 1).points, [[0, 0], [0, -11], [25.5, -11], [25.5, -14]]);
  // (a KiCad part's other pinout: its pins named, nothing laid out)
  const other = { ...d, gates: [{ ...d.gates[0], ins: [1, 2, 3, 4, 9, 10, 11, 12] }] };
  assert.deepEqual(insideLayout(other, pinsOf(d)), { gates: [], wires: [] });
});

test('#4498 every combinational gate IC of the library has its gates drawn inside (the 4023, 4025, 4073, 4075 too, #4505)', () => {
  const drawn = ICS.filter((d) => d.gates && !d.gates.some((g) => g.en));
  assert.deepEqual(drawn.filter((d) => !insideLayout(d, pinsOf(d)).gates.length).map((d) => d.type), []);
});

test('#4505 the crossings: only in the ICs listed by name, each a right angle; the 4023 as laid out, 1C over its gate, across 1Y once', () => {
  // (no IC but the listed has a crossing, and each listed has one: a new one is added to CROSSING_ICS by name)
  const crossing = ICS.filter((d) => d.gates && insideLayout(d, pinsOf(d)).crossings?.length).map((d) => d.type);
  assert.deepEqual(crossing, CROSSING_ICS);
  assert.deepEqual(CROSSING_ICS, ['4023', '4025', '4073', '4075']);
  const d = ICS.find((x) => x.type === '4023'), L = insideLayout(d, pinsOf(d));
  assert.deepEqual([L.gates[0].x, L.gates[0].y, L.gates[0].w, L.gates[0].h, L.gates[0].tip, L.gates[0].bubble], [28, -32, 14, 9, [46, -27.5], [44, -27.5]]);
  assert.deepEqual(L.wires.filter((w) => w.gate === 0).map((w) => [w.pin, w.points]), [
    [1, [[0, 0], [0, -27.5], [28, -27.5]]], [2, [[20, 0], [20, -25.25], [28, -25.25]]],
    [8, [[120, -60], [120, -34.5], [24, -34.5], [24, -29.75], [28, -29.75]]], [9, [[46, -27.5], [100, -27.5], [100, -60]]]]);
  assert.deepEqual(L.crossings, [[100, -34.5]]);
  // (the 4073's AND: no bubble, its tip the box's right)
  const a = insideLayout(ICS.find((x) => x.type === '4073'), pinsOf(d));
  assert.deepEqual([a.gates[0].tip, a.gates[0].bubble], [[42, -27.5], null]);
  // (two segments touching at an end or running along each other are no crossing)
  assert.equal(crossesAt([[0, 0], [10, 0]], [[10, 0], [10, 5]]), null);
  assert.equal(crossesAt([[0, 0], [10, 0]], [[5, 0], [15, 0]]), null);
  assert.deepEqual(crossesAt([[0, 0], [10, 0]], [[5, -5], [5, 5]]), [5, 0]);
});
