// The circuit editor's drawing of a character LCD 16×2 (#5330, core/circuit-lcd.js): the module as large as the real one
// (80 × 36 mm), its header of 16 pins along its top edge, its glass with two lines of 16 characters as its controller
// shows them (lit while its display is on; its cursor an underline), its id. While not simulated, its glass dark. Its
// look: web/css/circuit-editor.css.
import { sv } from './dom.js';

const P = 20;
const CELL = 1.5;   // (a character's width, in grid steps: 16 of them across the glass)

/** The body of a character LCD, appended to g (its pins are circuit-draw.js's); `lcd` its display (sim.lcds()'s) or none. */
export function drawLcd(g, p, d, lcd) {
  const ox = p.x * P, oy = p.y * P, at = (v, o) => o + v * P;
  g.append(sv('rect', { x: at(-1.5, ox), y: at(0.6, oy), width: 31.5 * P, height: 13.4 * P, rx: 4, class: 'circ-lcd-body' }),
    sv('rect', { x: at(1.5, ox), y: at(3.4, oy), width: (d.cols * CELL + 1.2) * P, height: 7.2 * P, rx: 2, class: `circ-lcd-glass${lcd?.on ? ' on' : ''}` }),
    sv('text', { x: at(28.8, ox), y: at(2.4, oy), 'text-anchor': 'end', class: 'circ-label', 'data-no-i18n': 'true' }, p.label || p.id));
  const lines = lcd?.lines ?? [];
  for (let r = 0; r < d.rows; r++) {
    const y = at(5.9 + r * 3, oy);
    for (const [c, ch] of [...(lines[r] || '')].entries()) {
      if (ch !== ' ') g.append(sv('text', { x: at(2.1 + c * CELL + CELL / 2, ox), y, 'text-anchor': 'middle', class: 'circ-lcd-char', 'data-no-i18n': 'true', 'data-row': String(r), 'data-col': String(c) }, ch));
    }
  }
  if (lcd?.cursor) g.append(sv('rect', { x: at(2.1 + lcd.cursor.col * CELL + 0.15, ox), y: at(6.4 + lcd.cursor.row * 3, oy), width: (CELL - 0.3) * P, height: 3, class: `circ-lcd-cursor${lcd.blink ? ' blink' : ''}` }));
}
