// The gate ICs whose inside cannot be drawn without a crossing (#4505, core/circuit-inside.js lays out the others): the
// 4023, 4025, 4073 and 4075, whose first gate takes 1A and 1B from the lower row and 1C (pin 8) from the upper one, past
// its output 1Y (pin 9). Its gate lies in the body's middle, a little lower than a 3-input gate's height, its other two
// gates as core/circuit-inside.js lays them out; 1C's line comes over it from the right, crossing 1Y's once, at a right
// angle (drawn as the circuit's wires cross: a hop-over or a plain crossing, Wire crossings). CROSSING_ICS: the ICs a
// crossing is allowed in, by name (test/circuit-inside.test.js holds every other IC to none). In pixels, from the
// part's pins unturned: written for a DIP-14 (pin 1 at (0, 0), its rows 20 pixels a step, 60 apart). Isomorphic module.
import { invertsOutput } from './symbol-standard.js';

/** The ICs whose inside has a crossing (#4505), each by name: a new one is added here. */
export const CROSSING_ICS = ['4023', '4025', '4073', '4075'];

const KEY = '1,2,8>9;3,4,5>6;11,12,13>10';
const keyOf = (d) => d.gates.map((g) => `${g.ins.join(',')}>${g.out}`).join(';');
// the first gate: its box (14 by 9, its inputs 2.25 apart), the lane of 1C's line over it, its column left of the gate
const G = { x: 28, y: -32, w: 14, h: 9 }, LANE = -34.5, ROUND = 24;

/** The layout of a crossing IC's inside ({ gates, wires } as insideLayout's; `crossings`: [[x, y]] where two lines
 *  cross), or null when it is not one of these pinouts. `others(d)`: the layout of an IC of the other gates alone. */
export function crossLayout(d, pins, others) {
  if (keyOf(d) !== KEY) return null;
  const p1 = pins.find((q) => q.n === 1), p2 = pins.find((q) => q.n === 2);
  const s = (p2.x - p1.x) / 20, T = ([x, y]) => [p1.x + x * s, p1.y + y * s];
  const rest = others({ ...d, gates: d.gates.slice(1) });
  const g = d.gates[0], inv = invertsOutput(g.fn), cy = G.y + G.h / 2;
  const slot = (i) => G.y + ((i + 1) * G.h) / 4;
  const tip = G.x + G.w + (inv ? 4 : 0);
  // (1A into the middle input, 1B the lower; 1C the upper, over the gate from the right)
  const at = [slot(1), slot(2), slot(0)];
  const wires = [
    { gate: 0, pin: g.ins[0], kind: 'in', points: [[0, 0], [0, at[0]], [G.x, at[0]]] },
    { gate: 0, pin: g.ins[1], kind: 'in', points: [[20, 0], [20, at[1]], [G.x, at[1]]] },
    { gate: 0, pin: g.ins[2], kind: 'in', points: [[120, -60], [120, LANE], [ROUND, LANE], [ROUND, at[2]], [G.x, at[2]]] },
    { gate: 0, pin: g.out, kind: 'out', points: [[tip, cy], [100, cy], [100, -60]] }].map((w) => ({ ...w, points: w.points.map(T) }));
  const first = { fn: g.fn, x: T([G.x, 0])[0], y: T([0, G.y])[1], w: G.w * s, h: G.h * s, flip: false, tip: T([tip, cy]),
    ins: at.map((y) => T([G.x, y])), bubble: inv ? T([G.x + G.w + 2, cy]) : null };
  return { gates: [first, ...rest.gates], wires: [...wires, ...rest.wires.map((w) => ({ ...w, gate: w.gate + 1 }))], crossings: [T([100, LANE])] };
}
