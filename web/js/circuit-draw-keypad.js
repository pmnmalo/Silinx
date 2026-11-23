// The circuit editor's drawing of a 4×4 matrix keypad (#5364, core/circuit-keypad.js): the membrane as large as the real
// one (2.7 x 3 inch), its 16 keys in 4 rows (1 2 3 A / 4 5 6 B / 7 8 9 C / * 0 # D: the letters red, * and # blue, as
// the common one's), each a press while trying it (data-input key, data-lever its index: held while the mouse is down,
// drawn down then), its ribbon's 8 traces to its pins (R1..R4, C1..C4, named on it), its id. Its look:
// web/css/circuit-editor.css.
import { sv } from './dom.js';

const P = 20;

/** The body of a keypad, appended to g (its pins are circuit-draw.js's); `down` its keys' states (sim.inputs()'s) or none. */
export function drawKeypad(g, p, d, down) {
  const ox = p.x * P, oy = p.y * P, at = (v, o) => o + v * P;
  g.append(sv('rect', { x: at(-10, ox), y: at(-33, oy), width: 27 * P, height: 30 * P, rx: 8, class: 'circ-keypad-body' }),
    // (its ribbon: its 8 traces down to its pins, their names on it)
    sv('rect', { x: at(-0.5, ox), y: at(-3, oy), width: 8 * P, height: 2.6 * P, class: 'circ-keypad-ribbon' }),
    ...d.pins.flatMap((q) => [sv('line', { x1: at(q.dx, ox), y1: at(-3, oy), x2: at(q.dx, ox), y2: oy, class: 'circ-keypad-trace' }),
      sv('text', { x: at(q.dx, ox), y: at(-1.6, oy), 'text-anchor': 'middle', class: 'circ-keypad-pin', 'data-no-i18n': 'true' }, q.name)]),
    sv('text', { x: at(16.6, ox), y: at(-33.6, oy), 'text-anchor': 'end', class: 'circ-label', 'data-no-i18n': 'true' }, p.label || p.id));
  // (its keys: 4.6 x 5 steps each, 5.75 and 6.5 apart)
  d.keys.forEach((k, i) => {
    const x = at(-8 + (i % 4) * 5.75, ox), y = at(-31 + Math.floor(i / 4) * 6.5, oy), on = Array.isArray(down) && down[i];
    const look = /[A-D]/.test(k) ? ' circ-key-letter' : /[*#]/.test(k) ? ' circ-key-sym' : '';
    g.append(sv('g', { class: `circ-key${look}${on ? ' down' : ''}`, 'data-input': 'key', 'data-lever': String(i), 'data-key': k },
      sv('rect', { x, y, width: 4.6 * P, height: 5 * P, rx: 6 }),
      sv('text', { x: x + 2.3 * P, y: y + 3.1 * P, 'text-anchor': 'middle', class: 'circ-key-text', 'data-no-i18n': 'true' }, k)));
  });
}
