// A stepper motor, a 28BYJ-48 on its ULN2003 board (#5476, part of #3902; docs/CIRCUITS.md): one part, its board's pins
// IN1..IN4 (a coil each, A to D: its LED lit while it is on, IN at 1) and its power (GND, VCC) on the 0.1 inch grid. The
// coils on pull its rotor to their place, 8 a cycle in half steps: A, AB, B, BC, C, CD, D, DA; in that order (IN1 to
// IN4) its shaft turns clockwise, the other way anticlockwise; 4096 half steps a turn of its shaft (32 a turn of its
// rotor, its gearbox's 1:64). A jump it cannot follow (3 or 4 half steps: the opposite coil) is not followed, and a step
// sooner than 1 ms after the last stalls; each said once. No coil, or three: it stays where it is. Isomorphic module.

const PINS = [['IN1', 'in'], ['IN2', 'in'], ['IN3', 'in'], ['IN4', 'in'], null, ['GND', 'gnd'], ['VCC', 'vcc']];
export const STEPPER_28BYJ48 = {
  type: 'stepper-28byj48', title: 'Stepper motor (28BYJ-48, ULN2003 board)', kind: 'stepper', prefix: 'M',
  pins: PINS.flatMap((x, i) => (x ? [{ name: x[0], dir: x[1], dx: i, dy: 0 }] : [])).map((p, k) => ({ n: k + 1, ...p })),
  // (its board, 0.9 x 0.8 inch drawn, over its pins; its motor and its ears above it: the editor's Fit and print)
  size: { x0: -4.5, y0: -22, x1: 10.5, y1: 0.6 },
};

/** Its half steps a turn of its shaft; the least time between two steps it follows (ns). */
export const STEPPER = { turn: 4096, every: 1_000_000 };
// a pattern of its coils (A..D: bits 0..3) as its place in the cycle, half steps: one coil or two neighbours
const PLACE = { 1: 0, 3: 1, 2: 2, 6: 3, 4: 4, 12: 5, 8: 6, 9: 7 };

/** A motor at rest at 0: coils(bits, t) at each change of its inputs (bits: A..D on, t in ns); state(): { steps (half
 *  steps from the start, clockwise positive), angle (its shaft's, 0 to 360°, a tenth), coils (A..D on) }; warnings
 *  (each once). */
export function createStepper() {
  let steps = 0, last = -Infinity, coils = 0;
  const warnings = [];
  const warn = (k, text) => { if (!warnings.some((w) => w.kind === k)) warnings.push({ kind: k, text }); };
  const s = {
    warnings,
    coils(bits, t) {
      coils = bits;
      const to = PLACE[bits];
      if (to == null) return false;
      let d = (((to - steps) % 8) + 8) % 8;
      if (d > 4) d -= 8;
      if (d === 0) return false;
      if (Math.abs(d) > 2) { warn('jump', `a jump of ${Math.abs(d)} half steps: its rotor cannot follow it (in order: A, AB, B, BC, C, CD, D, DA)`); return false; }
      if (t - last < STEPPER.every) { warn('fast', `steps ${+((t - last) / 1e6).toFixed(3)} ms apart: a 28BYJ-48 follows one every 1 ms at most, it stalls`); return false; }
      steps += d;
      last = t;
      return true;
    },
    reset() { coils = 0; },
    state: () => ({ steps, angle: Math.round((((steps % STEPPER.turn) + STEPPER.turn) % STEPPER.turn) * 3600 / STEPPER.turn) / 10, coils: [0, 1, 2, 3].map((k) => !!(coils & (1 << k))) }),
  };
  return s;
}
