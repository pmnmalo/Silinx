// A project's KiCad part that behaves as one of the library's other parts (#4349, core/circuit-kicad.js): an LED, a
// slide switch, a push button. It is named by Silinx.Model (one of DISCRETE) or, with none, known by what its symbol
// says (discreteModel): an LED with its anode and cathode, a slide switch SPDT, a push button. Its pins are the library
// part's, matched as that part's pins are named (discretePins): an LED's by their names (A and K, or anode and cathode:
// SparkFun's LED has its cathode as pin 1, Silinx's its anode), a button's by their numbers, a slide switch's by their
// places (three in a line, the middle one its common: KiCad's names say nothing of
// it). Each keeps the library part's number (its lamps', contacts' and inputs' pins) and its own place on the
// footprint. Isomorphic module.
import { pinText } from './kicad-sym.js';

/** The library's parts a KiCad part may behave as, besides its ICs: how its pins are matched. */
// (a display's or a DIP switch's segments and levers would need drawing on its footprint: not yet)
export const DISCRETE = { led: 'name', button: 'number', spdt: 'place' };
// (other names an LED's pins have)
const ALIASES = { a: ['anode', '+'], k: ['cathode', '-'] };

const word = (re) => new RegExp(`(?:^|[^A-Za-z])(?:${re})(?:[^A-Za-z]|$)`, 'i');
const LED = word('LED'), SPDT = word('spdt|single[- ]pole[, ]+double[- ]throw'), SWITCH = word('switch|slide'), RELAY = word('relay');
const BUTTON = word('push ?button|pushbutton|tactile|momentary');

/**
 * The library part a symbol is, by what it says (its name, value, keywords, description), with no Silinx.Model: 'led'
 * (an LED, two pins), 'spdt' (a slide switch single pole double throw, three pins, not a relay), 'button' (a push
 * button, two pins), or null. `pins`: its pins (symbolPins').
 */
export function discreteModel(s, pins) {
  const p = s.properties, text = `${s.name} ${p.Value ?? ''} ${p.ki_keywords ?? ''} ${p.Description ?? ''}`;
  if (RELAY.test(text)) return null;
  if (LED.test(text) && pins.length === 2) return 'led';
  if (SPDT.test(text) && SWITCH.test(text) && pins.length === 3) return 'spdt';
  if (BUTTON.test(text) && pins.length === 2) return 'button';
  return null;
}

// a KiCad pin's names, lower case: its own, and the library's an alias of it stands for (an LED's anode: a)
const namesOf = (k) => {
  const t = (pinText(k.name).text || '').toLowerCase();
  return [t, ...Object.entries(ALIASES).filter(([, a]) => a.includes(t)).map(([n]) => n)];
};

/**
 * The library part `base`'s pins (a PARTS entry) for a symbol's `pins` (symbolPins') at their `places` (Map(number →
 * { dx, dy })): { pins: [{ n, name, dir, dx, dy, kicadN }] } or { error } (why they are not that part's).
 */
export function discretePins(base, pins, places) {
  const how = DISCRETE[base.type];
  if (pins.length !== base.pins.length) return { error: `its ${pins.length} pin(s) are not the ${base.type}'s ${base.pins.length}` };
  const take = (q, k) => (k ? { ...q, dx: places.get(k.number).dx, dy: places.get(k.number).dy, kicadN: k.number } : null);
  let out;
  if (how === 'number') out = base.pins.map((q) => take(q, pins.find((k) => k.number === String(q.n))));
  else if (how === 'name') {
    const used = new Set();
    out = base.pins.map((q) => {
      const k = pins.find((x) => !used.has(x) && namesOf(x).includes(String(q.name).toLowerCase()));
      if (k) used.add(k);
      return take(q, k);
    });
  } else {
    // (a slide switch: three pins in a line, one step apart; the middle one its common, C)
    const at = pins.map((k) => ({ k, ...places.get(k.number) }));
    const line = at.every((x) => x.dx === at[0].dx) ? 'dy' : at.every((x) => x.dy === at[0].dy) ? 'dx' : null;
    if (!line) return { error: 'its three pins are not in a line' };
    at.sort((a, b) => a[line] - b[line]);
    if (at[1][line] - at[0][line] !== 1 || at[2][line] - at[1][line] !== 1) return { error: 'its three pins are not one step apart' };
    const by = { A: at[0].k, C: at[1].k, B: at[2].k };
    out = base.pins.map((q) => take(q, by[q.name]));
  }
  const i = out.findIndex((x) => !x);
  if (i >= 0) { const q = base.pins[i]; return { error: `it has no pin ${how === 'number' ? q.n : q.name} (the ${base.type}'s pin ${q.n})` }; }
  return { pins: out };
}
