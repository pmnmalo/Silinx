// A circuit's analog instruments and chips (#5384, the analog and digital roadmap #5387): a function generator (its
// square wave with its duty cycle: a PWM; a sine; a triangle; between its low and high volts at its frequency, through
// 50 Ω; its COM earthed, the circuit's GND) and an LM393, two comparators (each its output open collector: off while
// IN+ is above IN−, else low, 300 ns later). Their electrical side is core/circuit-analog.js's, the comparators'
// outputs core/circuit-sim.js's drivers. Isomorphic module.

const p = (n, name, dir, dx, dy) => ({ n, name, dir, dx, dy });
/** A function generator: OUT against COM, 50 Ω; its values: frequency, its low and high levels, its duty cycle; its wave. */
export const FUNCTION_GENERATOR = {
  // (its COM earthed, as a bench generator's: the circuit's GND)
  type: 'function-generator', title: 'Function generator', kind: 'analog', prefix: 'FG', pins: [p(1, 'OUT', 'analog', 0, 0), { ...p(2, 'COM', 'gnd', 1, 0), supply: true }],
  values: [{ prop: 'hz', label: 'Frequency (Hz)', unit: 'Hz', min: 0.1, max: 1e6, default: 1000 }, { prop: 'vhigh', label: 'High level (V)', unit: 'V', min: -10, max: 10, default: 5 },
    { prop: 'vlow', label: 'Low level (V)', unit: 'V', min: -10, max: 10, default: 0 }],
  // (its duty cycle turned while running: a PWM's, an LED dimmed)
  sense: [{ prop: 'duty', label: 'Duty cycle (%)', unit: '%', min: 1, max: 99, step: 1, default: 50, nudge: 5 }],
  choices: [{ prop: 'wave', label: 'Wave', options: ['square', 'sine', 'triangle'], default: 'square' }],
  size: { x0: -3.6, y0: -3.4, x1: 4.6, y1: 0.4 },
};
export const GENERATOR_OHMS = 50;
/** An LM393 (DIP-8): 1OUT, 1IN−, 1IN+, GND, 2IN+, 2IN−, 2OUT, VCC. */
export const LM393 = {
  type: 'lm393', title: 'Dual comparator (LM393)', kind: 'analog', prefix: 'U', marking: 'LM393', dip: 8, tpd: 300,
  pins: [p(1, '1OUT', 'oc', 0, 0), p(2, '1IN−', 'analog', 1, 0), p(3, '1IN+', 'analog', 2, 0), p(4, 'GND', 'gnd', 3, 0),
    p(5, '2IN+', 'analog', 3, -3), p(6, '2IN−', 'analog', 2, -3), p(7, '2OUT', 'oc', 1, -3), p(8, 'VCC', 'vcc', 0, -3)],
  comparators: [{ out: 1, minus: 2, plus: 3 }, { out: 7, minus: 6, plus: 5 }],
};

/** A generator's settings (its part's, normalized). */
export const generatorOf = (part) => ({ wave: part.wave ?? 'square', hz: part.hz ?? 1000, vhigh: part.vhigh ?? 5, vlow: part.vlow ?? 0, duty: part.duty ?? 50 });
/** Its voltage at `t` (s): a square's high for its duty cycle of each period, a sine's and a triangle's between its levels. */
export function generatorVolts(g, t) {
  const ph = ((t * g.hz) % 1 + 1) % 1, mid = (g.vhigh + g.vlow) / 2, amp = (g.vhigh - g.vlow) / 2;
  if (g.wave === 'sine') return mid + amp * Math.sin(2 * Math.PI * ph);
  if (g.wave === 'triangle') return g.vlow + (g.vhigh - g.vlow) * (ph < 0.5 ? 2 * ph : 2 - 2 * ph);
  return ph < g.duty / 100 ? g.vhigh : g.vlow;
}
/** A square wave's next edge after `t` (s), or Infinity (another wave). */
export function generatorEdge(g, t) {
  if (g.wave !== 'square') return Infinity;
  const T = 1 / g.hz, k = Math.floor(t / T + 1e-12), rise = k * T, fall = rise + T * g.duty / 100;
  for (const e of [rise, fall, rise + T]) if (e > t + 1e-15) return e;
  return rise + T;
}
