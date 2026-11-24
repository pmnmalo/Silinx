// An ultrasonic range sensor, an HC-SR04 (#5456, part of #3902; docs/CIRCUITS.md): its pins VCC, Trig, Echo and GND on
// the 0.1 inch grid under its board, at 5 V. A trigger pulse of 10 µs or more on Trig starts a measure: about 0.46 ms
// after the trigger falls (its eight 40 kHz pulses sent), Echo goes high for as long as the sound takes to go to the
// object and back, 58.3 µs a centimetre (343 m/s); its range 2 to 400 cm, out of it its echo 38 ms; a trigger while it
// measures not seen, a shorter one said once. The object's distance is the student's, set while running (the part's
// `cm`: its `sense`, which the Properties panel, Try it's − and +, the System Emulator and the MCP read). Isomorphic
// module.

/** What it senses, set while running (#5456): the property, its words, its unit, its range and step, its default. */
const SENSE = [{ prop: 'cm', label: 'Distance (cm)', unit: 'cm', min: 2, max: 400, step: 1, default: 100 }];

export const HC_SR04 = {
  type: 'hc-sr04', title: 'Ultrasonic range sensor (HC-SR04)', kind: 'sonar', prefix: 'US', sense: SENSE,
  pins: [['VCC', 'vcc'], ['Trig', 'in'], ['Echo', 'out'], ['GND', 'gnd']].map(([name, dir], i) => ({ n: i + 1, name, dir, dx: i, dy: 0 })),
  // (its board, 1.8 x 0.8 inch over its header, its two transducers: the editor's Fit and print)
  size: { x0: -7.5, y0: -8.6, x1: 10.5, y1: 0.6 },
};

/** Its timings (ns): the trigger's least, the burst before the echo, an out-of-range echo; a centimetre's echo. */
export const SONAR = { trigger: 10_000, burst: 460_000, none: 38_000_000, perCm: 58_309 };

/** The echo's width (ns) for an object at `cm`: 58.3 µs a centimetre, 38 ms out of its range. */
export const echoNs = (cm) => (cm < SENSE[0].min || cm > SENSE[0].max ? SONAR.none : Math.round(cm * SONAR.perCm));

/** A sensor, idle, its object at `cm`: trig(level, t) at each change of Trig (t in ns) returns the time it wants to be
 *  woken at, or null; wake(t) returns { echo ('1', '0' or null: no change), next (its next wake-up, or null) }; reset();
 *  state(): { cm, measuring, echo (its last echo's width once it ended, µs) }; warnings (each once). */
export function createSonar({ cm = SENSE[0].default } = {}) {
  let phase = 'idle', rise = null, level = '0', due = null, start = null, width = null;
  const warnings = [];
  const warn = (k, text) => { if (!warnings.some((w) => w.kind === k)) warnings.push({ kind: k, text }); };
  const s = {
    cm, warnings,
    trig(v, t) {
      if (v === level) return null;
      level = v;
      if (v === '1') { rise = t; return null; }
      const w = rise == null ? 0 : t - rise;
      if (phase !== 'idle' || w <= 0) return null;
      if (w < SONAR.trigger) { warn('trigger', `a trigger of ${+(w / 1000).toFixed(1)} µs: an HC-SR04's is 10 µs or more`); return null; }
      phase = 'burst'; due = t + SONAR.burst;
      return due;
    },
    wake(t) {
      if (due == null || t < due) return { echo: null, next: due };
      if (phase === 'burst') { phase = 'echo'; start = t; due = t + echoNs(s.cm); return { echo: '1', next: due }; }
      phase = 'idle'; due = null; width = t - start;
      return { echo: '0', next: null };
    },
    reset() { phase = 'idle'; rise = null; level = '0'; due = null; },
    state: () => ({ cm: s.cm, measuring: phase !== 'idle', echo: width == null ? null : +(width / 1000).toFixed(1) }),
  };
  return s;
}
