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
const body = (g) => ({ x: g.flip ? g.x - (g.bubble ? 4 : 0) : g.x, y: g.y, w: g.w + (g.bubble ? 4 : 0), h: g.h });

const GATE_ICS = ICS.filter((d) => d.gates);

test('#4224 every gate IC: each gate\'s lines from its pins to its input side, from its tip to its output pin, orthogonal', () => {
  assert.equal(GATE_ICS.length, 23);
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
    L.wires.forEach((w, i) => {
      // (inside the package: but the vertical lines' ends on the pins' rows)
      for (const [x, y] of w.points.slice(1, -1)) assert.ok(x >= inner.x0 && x <= inner.x1 && y >= inner.y0 && y <= inner.y1, `${d.type}: gate ${w.gate + 1} pin ${w.pin}'s bend (${x}, ${y}) outside the package`);
      L.wires.forEach((v, j) => {
        if (j <= i) return;
        for (const a of segs(w.points)) for (const b of segs(v.points)) assert.ok(!meet(a, b), `${d.type}: the lines of gate ${w.gate + 1} pin ${w.pin} and gate ${v.gate + 1} pin ${v.pin} meet`);
      });
    });
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
      if (mixed) assert.equal(mid, -30, `${d.type} gate ${i + 1}: in the middle`);
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

test('#4224 the other ICs (MSI, sequential): no gates, nothing laid out (their pins\' names drawn inside)', () => {
  for (const d of [...MSI, ...SEQ, ...ICS.filter((x) => !x.gates)]) assert.deepEqual(insideLayout(d, pinsOf(d)), { gates: [], wires: [] }, d.type);
});
