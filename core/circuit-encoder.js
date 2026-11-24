// A rotary encoder, a KY-040 module (#5451, part of #3902; docs/CIRCUITS.md): its header's 5 pins CLK (A), DT (B), SW, +
// and GND on the 0.1 inch grid under its board. Its 10 kΩ pull-ups hold CLK and DT high; turning it joins A, then B, to
// GND and lets them go, in quadrature (A leading clockwise), 20 detents a turn, each detent both open; its push switch
// joins SW to GND (no pull-up of its own: the program's, an Arduino's INPUT_PULLUP). Its inputs are the levels of its two
// contacts and its switch, each a port of the HDL (ENC1_A, ENC1_B, ENC1_SW), as the keypad's keys are; a turn is their
// quadrature sequence, a quarter at a time, ENCODER_STEP_NS apart, so that a program polling it sees every edge.
// Isomorphic module.

/** The time between two quarters of a detent's quadrature (ns): 1 ms, a quick hand's. */
export const ENCODER_STEP_NS = 1_000_000;
/** The detents of a turn: the knob's angle a detent's 360 / 20 = 18°. */
export const ENCODER_DETENTS = 20;

export const ROTARY_ENCODER = {
  type: 'rotary-encoder', title: 'Rotary encoder (KY-040)', kind: 'input', prefix: 'ENC',
  pins: [['CLK', 'weak'], ['DT', 'weak'], ['SW', 'pass'], ['+', 'pass'], ['GND', 'pass']].map(([name, dir], i) => ({ n: i + 1, name, dir, dx: i, dy: 0 })),
  // (A and B: its contacts' levels, set by a turn; SW: its push switch, held while pressed)
  inputs: [{ k: 'A', kind: 'level' }, { k: 'B', kind: 'level' }, { k: 'SW', kind: 'momentary' }],
  contacts: [{ a: 1, b: 5, input: 0, when: true }, { a: 2, b: 5, input: 1, when: true }, { a: 3, b: 5, input: 2, when: true }],
  pulls: [{ pin: 1, value: '1' }, { pin: 2, value: '1' }],
  // (its board, 0.75 x 1.05 inch over its header, its knob above: the editor's Fit and print)
  size: { x0: -1.6, y0: -10.5, x1: 5.6, y1: 0.6 },
};

// a detent's quarters from a detent (both open): clockwise A closes, B closes, A opens, B opens; anticlockwise B first
const CW = [[true, false], [true, true], [false, true], [false, false]];
const CCW = [[false, true], [true, true], [true, false], [false, false]];

/**
 * The levels of A and B (each contact closed: true) of a turn of `detents` from a detent (positive clockwise,
 * negative anticlockwise): [[a, b], …], four a detent, the last both open.
 */
export function encoderTurn(detents) {
  const n = Math.trunc(Number(detents)) || 0, out = [];
  for (let k = 0; k < Math.abs(n); k++) out.push(...(n > 0 ? CW : CCW).map(([a, b]) => [a, b]));
  return out;
}
