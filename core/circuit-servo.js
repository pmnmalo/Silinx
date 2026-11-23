// A hobby servo, an SG90 (#5347, part of #3902; docs/CIRCUITS.md): the circuit's part (its 3 wires: GND, VCC, its signal)
// and its behaviour: each pulse on its signal measured, from its rising to its falling edge in the simulation's time
// (ns), its width the angle it goes to (0.5 ms 0°, 2.5 ms 180°, linear, rounded to a degree; beyond: held at its end), its
// arm moving to it at the SG90's speed (0.1 s per 60°); a width that is no servo's (under 0.3 ms, over 3 ms), a period
// that is no servo's (from a rise to the next: under 10 ms, over 30 ms) said, once each; unpowered: still, its pulses
// not read. Isomorphic module.

const PIN_NAMES = ['GND', 'VCC', 'SIG'];
const DIR = { GND: 'gnd', VCC: 'vcc', SIG: 'in' };
export const SERVO_SG90 = {
  type: 'servo-sg90', title: 'Servo (SG90, PWM)', kind: 'servo', prefix: 'M',
  pins: PIN_NAMES.map((name, i) => ({ n: i + 1, name, dir: DIR[name], dx: i, dy: 0 })), size: { x0: -1, y0: -9, x1: 7, y1: 0 },
};
// its pulses (ms) and its speed (° per ms): the SG90's
const SERVO = { min: 0.5, max: 2.5, speed: 60 / 100, width: [0.3, 3], period: [10, 30] };

/** A pulse's width (ms) as the angle it asks for: 0 to 180°, a whole degree. */
export const servoAngle = (ms) => Math.round(Math.min(180, Math.max(0, ((ms - SERVO.min) / (SERVO.max - SERVO.min)) * 180)));

/** A servo at rest at 90°: edge(level, t) at each change of its signal ('1', '0'; t in ns), state(t): { angle (where its
 *  arm is at t), target, width (its last pulse, ms), period (ms) }, warnings (each once). */
export function createServo() {
  let rise = null, target = 90, from = 90, since = 0, width = null, period = null;
  const warnings = [];
  const warn = (k, text) => { if (!warnings.some((w) => w.kind === k)) warnings.push({ kind: k, text }); };
  // its arm at t: from `from` at `since`, toward target at its speed
  const angleAt = (t) => {
    const d = target - from, run = ((t - since) / 1e6) * SERVO.speed;
    return Math.abs(d) <= run ? target : from + Math.sign(d) * run;
  };
  return {
    warnings,
    edge(level, t) {
      if (level === '1') {
        if (rise != null) {
          period = (t - rise) / 1e6;
          if (period < SERVO.period[0] || period > SERVO.period[1]) warn('period', `its pulses ${+period.toFixed(3)} ms apart: a servo's come every 20 ms (10 to 30)`);
        }
        rise = t;
      } else if (level === '0' && rise != null) {
        const w = (t - rise) / 1e6;
        if (w <= 0) return;
        width = w;
        if (w < SERVO.width[0] || w > SERVO.width[1]) warn('width', `a pulse of ${+w.toFixed(3)} ms: a servo's are 0.5 to 2.5 ms`);
        const a = servoAngle(w);
        if (a !== target) { from = angleAt(t); since = t; target = a; }
      }
    },
    /** its signal lost (unpowered): still where it is */
    stop(t) { from = angleAt(t); since = t; target = from; rise = null; },
    state: (t) => ({ angle: Math.round(angleAt(t) * 10) / 10, target, width, period }),
  };
}
