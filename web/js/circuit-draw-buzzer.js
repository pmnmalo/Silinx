// The circuit editor's drawing of a buzzer, an active one (#5454, core/circuit-buzzer.js): its black body seen from above
// (12 mm, its sound hole in the middle, its + marked), its two legs to its pins; while sounding, its waves and its tone
// (its own, or a wave's: `440 Hz`), its id. Its look: web/css/circuit-editor.css.
import { sv } from './dom.js';

const P = 20;

/** The body of a buzzer, appended to g (its pins are circuit-draw.js's); `s` its state while trying it ({ sounding, hz })
 *  or none. */
export function drawBuzzer(g, p, s) {
  const ox = p.x * P, oy = p.y * P, cx = ox + 1.5 * P, cy = oy - 2.2 * P, r = 1.9 * P, on = !!s?.sounding;
  g.append(sv('path', { d: `M${ox},${oy}V${cy} M${ox + 3 * P},${oy}V${cy}`, class: 'circ-buzz-leg' }),
    sv('circle', { cx, cy, r, class: `circ-buzz-body${on ? ' on' : ''}` }),
    sv('circle', { cx, cy, r: r * 0.62, class: 'circ-buzz-ring' }),
    sv('circle', { cx, cy, r: r * 0.16, class: 'circ-buzz-hole' }),
    sv('text', { x: cx - r * 0.62, y: cy - r * 0.55, 'text-anchor': 'middle', class: 'circ-buzz-plus', 'data-no-i18n': 'true' }, '+'),
    sv('text', { x: cx, y: cy - r - 6, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, p.label || p.id));
  if (!on) return;
  // (its waves on either side, its tone under it)
  for (const side of [-1, 1]) for (const k of [1, 2]) {
    const rr = r + k * 0.45 * P;
    g.append(sv('path', { d: `M${cx + side * rr * Math.cos(0.6)},${cy - rr * Math.sin(0.6)}A${rr},${rr} 0 0 ${side > 0 ? 1 : 0} ${cx + side * rr * Math.cos(0.6)},${cy + rr * Math.sin(0.6)}`, class: 'circ-buzz-wave' }));
  }
  g.append(sv('text', { x: cx, y: oy + 0.9 * P, 'text-anchor': 'middle', class: 'circ-buzz-hz', 'data-no-i18n': 'true' }, `${s.hz} Hz`));
}
