// The gates inside a gate IC as its datasheet's connection diagram draws them (#4224, the circuit editor's Show inside,
// web/js/circuit-draw-inside.js): each gate lying flat beside its pins, in the half of the body on its output pin's row
// (a gate whose inputs come from both rows, the 7410's first, the 7430, in the middle), facing its output pin (the
// 7402's and the 4000s' outputs come first: they face left); its inputs wired into its input side and its output from
// its tip to its pin, with horizontal and vertical lines only. Its inputs nest: the one whose pin is farthest from the
// output enters the gate farthest from the row, so that no two lines cross; a pin under the gate (or past its input
// side) goes round, along a lane between the gate and the row. The same geometry for IEEE Std 91-1984's shapes and
// IEC 60617-12's boxes (core/symbol-standard.js: the gate's box, its bubble). In pixels, from the unturned part's pins.
// Isomorphic module.
import { invertsOutput } from './symbol-standard.js';

const EDGE = 7;      // the body's edge inside its pins' rows (web/js/circuit-draw.js: 0.35 of a grid step)
const GAP = 12;      // a gate's near edge from its row: room for the lanes
const LANE = 2;      // between two lanes, two columns
const R = 2;         // a bubble's radius

/** A gate's width (its body without the bubble): an inverter's or a buffer's triangle narrower. */
const widthOf = (fn) => (/^(not|inv|buf)$/i.test(fn) ? 10 : 14);
/** A gate's height for k inputs: 3 pixels at least between two inputs. */
const heightOf = (k) => Math.max(12, 3 * (k + 1));

/**
 * The layout of a gate IC's inside: `d` its description (d.gates), `pins` its pins unturned, in pixels ({ n, x, y }).
 * { gates: [{ fn, x, y, w, h, flip, tip: [x, y], ins: [[x, y]], bubble: [cx, cy] | null }], wires: [{ gate, pin, kind:
 * 'in' | 'out', points: [[x, y]] }] }: a gate's box (x, y, w, h) its body without its bubble, `flip` it faces left.
 */
export function insideLayout(d, pins) {
  const at = new Map(pins.map((q) => [q.n, [q.x, q.y]]));
  const ys = pins.map((q) => q.y), rowB = Math.max(...ys), rowT = Math.min(...ys), span = rowB - rowT;
  const out = { gates: [], wires: [] };
  for (const [gi, g] of (d.gates || []).entries()) {
    const o = at.get(g.out);
    const home = o[1] === rowB ? 'b' : 't';
    // (the gate's own frame: its output's row at 0, the body toward negative y, facing right; s and Y turn it back)
    const ins = g.ins.map((n) => ({ n, x: at.get(n)[0], far: (at.get(n)[1] === rowB ? 'b' : 't') !== home }));
    const flip = o[0] < ins.reduce((a, q) => a + q.x, 0) / ins.length, s = flip ? -1 : 1;
    const X = (x) => s * x, Y = (ly) => (home === 'b' ? rowB + ly : rowT - ly);
    const k = ins.length, h = heightOf(k), w = widthOf(g.fn), inv = invertsOutput(g.fn);
    const mixed = ins.some((q) => q.far);
    const cy = mixed ? -span / 2 : -GAP - h / 2;
    const tip = X(o[0]) - 4, xIn = tip - (inv ? 2 * R : 0) - w;
    // the input slots, from the far side of the gate to the near one: the far row's inputs first
    const slot = (i) => cy - h / 2 + ((i + 1) * h) / (k + 1);
    const far = ins.filter((q) => q.far).sort((a, b) => X(a.x) - X(b.x)), near = ins.filter((q) => !q.far).sort((a, b) => X(a.x) - X(b.x));
    const ends = new Map();
    // (the far row's: the first in order the slot nearest the home row; the home row's: the first the farthest)
    far.forEach((q, i) => ends.set(q.n, slot(far.length - 1 - i)));
    near.forEach((q, i) => ends.set(q.n, slot(far.length + i)));
    for (const [group, row, edge, dir] of [[near, 0, -EDGE, -1], [far, -span, -span + EDGE, 1]]) {
      // the pins past the input side (less a column each) go round: their lanes farther from the row in turn, their
      // columns nearer the gate
      let nd = 0;
      for (let prev = -1; prev !== nd;) { prev = nd; nd = group.filter((q) => X(q.x) > xIn - LANE * nd - 1).length; }
      const round = group.filter((q) => X(q.x) > xIn - LANE * nd - 1);
      for (const q of group) {
        const px = X(q.x), sy = ends.get(q.n), j = round.indexOf(q);
        const pts = j < 0 ? [[px, row], [px, sy], [xIn, sy]]
          : (() => { const lane = edge + dir * LANE * (j + 1), col = xIn - LANE * (nd - j); return [[px, row], [px, lane], [col, lane], [col, sy], [xIn, sy]]; })();
        out.wires.push({ gate: gi, pin: q.n, kind: 'in', points: pts.map(([x, y]) => [X(x), Y(y)]) });
      }
    }
    out.wires.push({ gate: gi, pin: g.out, kind: 'out', points: [[tip, cy], [X(o[0]), cy], [X(o[0]), 0]].map(([x, y]) => [X(x), Y(y)]) });
    const x0 = Math.min(X(xIn), X(xIn + w));
    out.gates.push({ fn: g.fn, x: x0, y: Math.min(Y(cy - h / 2), Y(cy + h / 2)), w, h, flip, tip: [X(tip), Y(cy)],
      ins: g.ins.map((n) => [X(xIn), Y(ends.get(n))]), bubble: inv ? [X(xIn + w + R), Y(cy)] : null });
  }
  return out;
}
