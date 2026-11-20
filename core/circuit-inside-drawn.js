// ICs whose inside is drawn as its datasheet draws it (#4934, the circuit editor's Show inside): the latches whose units
// share an enable, which the boxes of core/circuit-inside-blocks.js cannot show (they gave them one box): a 7475's four
// D latches as its connection diagram (Texas Instruments', National's), each a box with its D, G, Q (and Q̅), the enable
// of a pair a line down between the two boxes, a dot, into both; a 7477's the same in 14 pins; a 74375's two pairs, a
// pair on each row, their pins straight into the boxes' edges. Lines cross where the datasheet's do: `crossings` says
// so (no dot; a hop-over in the editor). The drawings are data, in pixels at a grid step of 20 from pin 1 (the part
// unturned; pins 1… along the bottom row, the others along the top, 3 steps up); scaled and moved to the part's pins.
// Isomorphic module.
import { wireHops } from './circuit-wires.js';

// a drawing: its boxes { unit, x, y, w, h, ports: [[pin, edge, at, label]] } (at: a side port's y, an edge port's x),
// its lines [pin, [[x, y]…]] (from the pin, or a branch of its line), its dots, its pins left unnamed inside (the supply's)
const B = (unit, x, y, w, h, ports) => ({ unit, x, y, w, h, ports });
export const DRAWN = {
  // Pedro's picture, #4934: latches 1 and 2 at the left, their enable (13) between them; 3 and 4 at the right (4)
  7475: {
    boxes: [B(1, 4, -44, 14, 28, [[16, 'left', -38, 'Q'], [1, 'left', -22, 'Q̅'], [13, 'right', -30, 'G'], [2, 'right', -22, 'D']]),
      B(2, 42, -44, 16, 28, [[14, 'left', -38, 'Q̅'], [13, 'left', -30, 'G'], [3, 'left', -22, 'D'], [15, 'right', -38, 'Q']]),
      B(3, 82, -44, 16, 28, [[10, 'left', -38, 'Q'], [11, 'right', -38, 'Q̅'], [4, 'right', -30, 'G'], [6, 'right', -22, 'D']]),
      B(4, 122, -44, 14, 28, [[4, 'left', -30, 'G'], [7, 'left', -22, 'D'], [9, 'right', -38, 'Q'], [8, 'right', -22, 'Q̅']])],
    lines: [[16, [[0, -60], [0, -38], [4, -38]]], [1, [[0, 0], [0, -22], [4, -22]]], [2, [[20, 0], [20, -22], [18, -22]]],
      [3, [[40, 0], [40, -22], [42, -22]]], [14, [[40, -60], [40, -38], [42, -38]]], [15, [[20, -60], [20, -48], [62, -48], [62, -38], [58, -38]]],
      [13, [[60, -60], [60, -52], [30, -52], [30, -30]]], [13, [[18, -30], [42, -30]]],
      [6, [[100, 0], [100, -22], [98, -22]]], [11, [[100, -60], [100, -38], [98, -38]]], [10, [[120, -60], [120, -48], [78, -48], [78, -38], [82, -38]]],
      [9, [[140, -60], [140, -38], [136, -38]]], [8, [[140, 0], [140, -22], [136, -22]]], [7, [[120, 0], [120, -22], [122, -22]]],
      [4, [[60, 0], [60, -12], [110, -12], [110, -30]]], [4, [[98, -30], [122, -30]]]],
    dots: [[30, -30], [110, -30]], unnamed: [5, 12],
  },
  // the 7477 (14 pins, Q only): 1 and 2 at the left, their enable (12) into both boxes' right sides; 3 and 4 at the
  // right, theirs (3) into 3's left side and round to 4's right side
  7477: {
    boxes: [B(1, 5, -44, 12, 28, [[14, 'left', -38, 'Q'], [1, 'left', -22, 'D'], [12, 'right', -30, 'G']]),
      B(2, 25, -44, 12, 28, [[13, 'left', -38, 'Q'], [2, 'left', -22, 'D'], [12, 'right', -30, 'G']]),
      B(3, 83, -44, 12, 28, [[3, 'left', -30, 'G'], [5, 'left', -22, 'D'], [9, 'right', -38, 'Q']]),
      B(4, 105, -44, 12, 28, [[6, 'left', -22, 'D'], [8, 'right', -38, 'Q'], [3, 'right', -30, 'G']])],
    lines: [[14, [[0, -60], [0, -38], [5, -38]]], [1, [[0, 0], [0, -22], [5, -22]]], [13, [[20, -60], [20, -38], [25, -38]]],
      [2, [[20, 0], [20, -22], [25, -22]]], [12, [[40, -60], [40, -30], [37, -30]]], [12, [[40, -48], [21, -48], [21, -30], [17, -30]]],
      [3, [[40, 0], [40, -30], [83, -30]]], [3, [[40, -12], [121, -12], [121, -30], [117, -30]]], [5, [[80, 0], [80, -22], [83, -22]]],
      [9, [[100, -60], [100, -38], [95, -38]]], [6, [[100, 0], [100, -22], [105, -22]]], [8, [[120, -60], [120, -38], [117, -38]]]],
    dots: [[40, -48], [40, -12]], unnamed: [4, 11],
  },
  // the 74375: latches 1 and 2 along the bottom row, their enable (4) up between them; 4 and 3 along the top, theirs (12)
  // down between them; every other pin straight into its box's edge
  74375: {
    boxes: [B(1, -4, -28, 54, 15, [[1, 'bottom', 0, 'D'], [2, 'bottom', 20, 'Q̅'], [3, 'bottom', 40, 'Q'], [4, 'right', -20.5, 'G']]),
      B(2, 70, -28, 54, 15, [[4, 'left', -20.5, 'G'], [5, 'bottom', 80, 'Q'], [6, 'bottom', 100, 'Q̅'], [7, 'bottom', 120, 'D']]),
      B(4, 14, -47, 56, 15, [[15, 'top', 20, 'D'], [14, 'top', 40, 'Q̅'], [13, 'top', 60, 'Q'], [12, 'right', -39.5, 'G']]),
      B(3, 90, -47, 54, 15, [[12, 'left', -39.5, 'G'], [11, 'top', 100, 'Q'], [10, 'top', 120, 'Q̅'], [9, 'top', 140, 'D']])],
    lines: [[1, [[0, 0], [0, -13]]], [2, [[20, 0], [20, -13]]], [3, [[40, 0], [40, -13]]], [5, [[80, 0], [80, -13]]], [6, [[100, 0], [100, -13]]],
      [7, [[120, 0], [120, -13]]], [4, [[60, 0], [60, -20.5]]], [4, [[50, -20.5], [70, -20.5]]],
      [15, [[20, -60], [20, -47]]], [14, [[40, -60], [40, -47]]], [13, [[60, -60], [60, -47]]], [11, [[100, -60], [100, -47]]],
      [10, [[120, -60], [120, -47]]], [9, [[140, -60], [140, -47]]], [12, [[80, -60], [80, -39.5]]], [12, [[70, -39.5], [90, -39.5]]]],
    dots: [[60, -20.5], [80, -39.5]], unnamed: [8, 16],
  },
};
// a port's IEC label (IEC 60617-12's: the data input 1D controlled by C1, the outputs unlabelled, Q̅ its negation's bubble)
const IEC = { D: '1D', G: 'C1', Q: '', 'Q̅': '' };

/**
 * The inside of the IC `d` as its datasheet draws it (DRAWN), its pins unturned in pixels ({ n, x, y }): { boxes: [{ x,
 * y, w, h, unit, qualifier: '', pins: [{ n, name, anchor, iec, edge, x, y, clock, falling, low, out }] }], wires: [{ pin,
 * box, points }], dots, crossings, unnamed }, as core/circuit-inside-blocks.js's (its pins on a box's sides too); or null.
 */
export function drawnLayout(d, pins) {
  // (a KiCad part that behaves as one of them: its drawing, #4350)
  const key = [d?.type, d?.behaves].find((t) => t != null && Object.hasOwn(DRAWN, t)), D = key ? DRAWN[key] : null;
  if (!D || d.gates) return null;
  const at = new Map(pins.map((q) => [q.n, q]));
  if (!at.has(1) || !at.has(2)) return null;
  const o = at.get(1), s = (at.get(2).x - o.x) / 20;
  const X = (x) => o.x + x * s, Y = (y) => o.y + y * s;
  const dirOf = new Map(d.pins.map((p) => [p.n, p.dir]));
  const boxes = D.boxes.map((b) => ({ x: X(b.x), y: Y(b.y), w: b.w * s, h: b.h * s, unit: b.unit, qualifier: '',
    pins: b.ports.map(([n, edge, v, name]) => {
      const side = edge === 'left' || edge === 'right';
      // (an edge port's name kept inside the box: near a corner, from it)
      const anchor = side ? (edge === 'left' ? 'start' : 'end') : v <= b.x + 6 ? 'start' : v >= b.x + b.w - 6 ? 'end' : 'middle';
      return { n, name, anchor, iec: IEC[name] ?? name, edge, x: side ? X(edge === 'left' ? b.x : b.x + b.w) : X(v), y: side ? Y(v) : Y(edge === 'top' ? b.y : b.y + b.h),
        clock: false, falling: false, low: false, out: dirOf.get(n) !== 'in' };
    }) }));
  const boxOf = (n) => Math.max(0, boxes.findIndex((b) => b.pins.some((p) => p.n === n)));
  const wires = D.lines.map(([n, pts]) => ({ pin: n, box: boxOf(n), points: pts.map(([x, y]) => [X(x), Y(y)]) }));
  const crossings = [...wireHops(wires.map((w, i) => ({ id: i, pts: w.points }))).values()].flat().map((h) => [h.x, h.y]);
  return { boxes, wires, dots: D.dots.map(([x, y]) => [X(x), Y(y)]), crossings, unnamed: D.unnamed };
}
