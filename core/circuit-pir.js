// A motion sensor, a PIR (passive infrared) HC-SR501 (#5463, part of #3902; docs/CIRCUITS.md): its pins VCC, OUT and GND
// on the 0.1 inch grid under its dome, at 5 V. Someone moving in front of it (its input, as a button's press: held while
// they move; an input of the HDL) sets OUT to 1 for its hold time (its `hold`, 3 to 300 s, its pot); retriggering (its
// jumper at H, its `retrigger`) OUT stays at 1 while they move and for its hold time after; single (L) OUT falls after
// its hold time whatever they do. After OUT falls it is blind for 2.5 s; someone still moving then sets it again. Its
// minute of warming up at power-on is not simulated. Isomorphic module.

/** Its hold time's range and step (s), its default; whether it retriggers by default (its jumper at H). */
export const PIR_HOLD = { min: 3, max: 300, step: 1, default: 3 };
export const PIR_RETRIGGER = true;
/** Its blind time after OUT falls (ns). */
export const PIR_BLOCK = 2_500_000_000;

export const HC_SR501 = {
  type: 'hc-sr501', title: 'Motion sensor (PIR, HC-SR501)', kind: 'pir', prefix: 'PIR',
  // (someone moving: held while they move, as a button's press)
  inputs: [{ kind: 'momentary' }],
  pins: [['VCC', 'vcc'], ['OUT', 'out'], ['GND', 'gnd']].map(([name, dir], i) => ({ n: i + 1, name, dir, dx: i, dy: 0 })),
  // (its board, 1.3 x 1.0 inch, its dome over it, over its header: the editor's Fit and print)
  size: { x0: -5.5, y0: -10.6, x1: 7.5, y1: 0.6 },
};

/** A sensor, idle, its hold time `hold` (s), retriggering or not: step(t, moving) at each change of its input or a
 *  wake-up (t in ns) returns { out ('1' or '0'), next (the time it wants to be woken at, or null) }; reset() (unpowered);
 *  state(): { moving, out, blind }. */
export function createPir({ hold = PIR_HOLD.default, retrigger = PIR_RETRIGGER } = {}) {
  const span = hold * 1e9;
  let phase = 'idle', due = null, was = false, moving = false;
  const s = {
    step(t, m) {
      moving = !!m;
      let next = null;
      if (phase === 'on') {
        // (retriggering: OUT's end its hold time after the last movement seen; single: its hold time after it rose)
        if (retrigger && (moving || was)) { due = t + span; next = due; } else if (t >= due) { phase = 'blind'; due = t + PIR_BLOCK; next = due; }
      } else if (phase === 'blind' && t >= due) { phase = 'idle'; due = null; }
      if (phase === 'idle' && moving) { phase = 'on'; due = t + span; next = due; }
      was = moving;
      return { out: phase === 'on' ? '1' : '0', next };
    },
    reset() { phase = 'idle'; due = null; was = false; moving = false; },
    state: () => ({ moving, out: phase === 'on', blind: phase === 'blind' }),
  };
  return s;
}
