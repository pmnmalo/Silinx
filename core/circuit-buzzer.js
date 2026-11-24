// A buzzer, an active one (12 mm, 5 V) (#5454, part of #3902; docs/CIRCUITS.md): the circuit's part (its pins + and −,
// 0.3 inch apart) and its behaviour: driven steadily (+ at 1, − at 0) it sounds at its own tone, about 2.3 kHz; driven with
// a square wave (an Arduino's tone(), a PWM, an FPGA's divider) it sounds at that wave's frequency, measured from rise to
// rise in the simulation's time (ns); at 0 or floating, silent. A tone a person cannot hear (under 20 Hz, over 20 kHz)
// said, once. Isomorphic module.

export const BUZZER = {
  type: 'buzzer', title: 'Buzzer (active, 5 V)', kind: 'buzzer', prefix: 'BZ',
  pins: [{ n: 1, name: '+', dir: 'in', dx: 0, dy: 0 }, { n: 2, name: '−', dir: 'gnd', dx: 3, dy: 0 }],
  size: { x0: -0.6, y0: -4.4, x1: 3.6, y1: 0.4 },
};
/** Its own tone (Hz), driven steadily; the time after its last edge it is steady again (ns); what a person hears (Hz). */
export const BUZZER_HZ = 2300, BUZZER_HOLD_NS = 50e6, HEARD = [20, 20000];

/** A buzzer, silent: edge(level, t) at each change of its + ('1', '0'; t in ns; its − at 0), stop(t) (its − not at 0),
 *  state(t): { sounding, hz (its tone, null silent), how ('on' its own tone, 'tone' a wave's, 'off') }, warnings (each
 *  once). */
export function createBuzzer() {
  let level = '0', last = null, rise = null, period = null;
  const warnings = [];
  const warn = (k, text) => { if (!warnings.some((w) => w.kind === k)) warnings.push({ kind: k, text }); };
  return {
    warnings,
    edge(v, t) {
      if (v === level) return;
      if (v === '1') {
        if (rise != null && t - rise < BUZZER_HOLD_NS) {
          period = t - rise;
          const hz = 1e9 / period;
          if (hz < HEARD[0] || hz > HEARD[1]) warn('heard', `a tone of ${Math.round(hz)} Hz: a person hears ${HEARD[0]} Hz to ${HEARD[1] / 1000} kHz`);
        } else period = null;
        rise = t;
      }
      level = v; last = t;
    },
    stop(t) { if (level !== '0') { level = '0'; last = t; } rise = null; period = null; },
    state(t) {
      const toggling = last != null && period != null && t - last <= Math.max(BUZZER_HOLD_NS, 2 * period);
      if (toggling) return { sounding: true, hz: Math.round(1e9 / period), how: 'tone' };
      return level === '1' ? { sounding: true, hz: BUZZER_HZ, how: 'on' } : { sounding: false, hz: null, how: 'off' };
    },
  };
}
