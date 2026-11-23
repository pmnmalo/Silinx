// The circuit editor's drawing of a graphic OLED 128×64 (#5336, core/circuit-oled.js): the module as large as the common
// 0.96" board (27 × 27 mm, its 4 pins along its top edge), its black glass with its 128×64 pixels as its controller
// shows them (one path of the lit ones), its id. While not simulated, or while its display is off, its glass dark. Its
// look: web/css/circuit-editor.css.
import { sv } from './dom.js';

const P = 20;
const DOT = 0.06;   // (a pixel's side, in grid steps: 128 of them across the glass, 7.7 steps)

/** The body of a graphic OLED, appended to g (its pins are circuit-draw.js's); `oled` its display (sim.oleds()'s) or none. */
export function drawOled(g, p, d, oled) {
  const ox = p.x * P, oy = p.y * P, at = (v, o) => o + v * P;
  const gx = -2.85, gy = 2.4, w = d.cols * DOT, h = d.rows * DOT;
  g.append(sv('rect', { x: at(d.size.x0, ox), y: at(0.6, oy), width: (d.size.x1 - d.size.x0) * P, height: (d.size.y1 - 0.6) * P, rx: 4, class: 'circ-oled-body' }),
    sv('rect', { x: at(gx - 0.2, ox), y: at(gy - 0.2, oy), width: (w + 0.4) * P, height: (h + 0.4) * P, class: 'circ-oled-glass' }),
    sv('text', { x: at(d.size.x1 - 0.3, ox), y: at(10.4, oy), 'text-anchor': 'end', class: 'circ-label', 'data-no-i18n': 'true' }, p.label || p.id));
  if (!oled?.on) return;
  // (each row's runs of lit pixels, one path)
  const s = DOT * P, parts = [];
  oled.rows.forEach((row, y) => {
    for (const m of row.matchAll(/1+/g)) parts.push(`M${(at(gx, ox) + m.index * s).toFixed(2)} ${(at(gy, oy) + y * s).toFixed(2)}h${(m[0].length * s).toFixed(2)}v${s.toFixed(2)}h${(-m[0].length * s).toFixed(2)}z`);
  });
  if (parts.length) g.append(sv('path', { d: parts.join(''), class: 'circ-oled-px' }));
}
