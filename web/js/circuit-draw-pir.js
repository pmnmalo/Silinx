// The circuit editor's drawing of a motion sensor, a PIR HC-SR501 (#5463, core/circuit-pir.js): its green board over its
// three pins (their names printed), its white dome and its Fresnel lens's facets (held while trying it: someone moving in
// front of it, data-input button, as a button's press), its id; while someone moves, their waves beside it; while its OUT
// is at 1, its dome lit. Its look: web/css/circuit-editor.css.
import { sv } from './dom.js';

const P = 20;

/** The body of a motion sensor, appended to g (its pins are circuit-draw.js's); `s` its state while trying it
 *  (sim.pirs()'s: { moving, out, blind }) or none. */
export function drawPir(g, p, s) {
  const ox = p.x * P, oy = p.y * P, cx = ox + P, top = oy - 10.6 * P, cy = oy - 5.4 * P, r = 4.2 * P;
  g.append(sv('rect', { x: ox - 5.5 * P, y: top, width: 13 * P, height: 10 * P, rx: 4, class: 'circ-pir-board' }),
    sv('text', { x: cx, y: top - 6, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, p.label || p.id));
  ['VCC', 'OUT', 'GND'].forEach((name, i) => g.append(sv('text', { x: ox + i * P, y: oy - 0.7 * P, 'text-anchor': 'middle', class: 'circ-pir-pin', 'data-no-i18n': 'true' }, name)));
  // (its dome: held, someone moving)
  const dome = sv('g', { class: 'circ-pir-dome-btn', 'data-input': 'button' }, sv('circle', { cx, cy, r, class: `circ-pir-dome${s?.out ? ' on' : ''}` }));
  for (const k of [0.33, 0.66]) dome.append(sv('circle', { cx, cy, r: r * k, class: 'circ-pir-facet' }));
  for (const a of [0, 60, 120]) { const dx = r * Math.cos(a * Math.PI / 180), dy = r * Math.sin(a * Math.PI / 180); dome.append(sv('path', { d: `M${cx - dx},${cy - dy}L${cx + dx},${cy + dy}`, class: 'circ-pir-facet' })); }
  g.append(dome);
  // (someone moving: their waves on either side)
  if (s?.moving) for (const side of [-1, 1]) for (const k of [1, 2]) {
    const rr = r + k * 0.5 * P;
    g.append(sv('path', { d: `M${cx + side * rr * Math.cos(0.6)},${cy - rr * Math.sin(0.6)}A${rr},${rr} 0 0 ${side > 0 ? 1 : 0} ${cx + side * rr * Math.cos(0.6)},${cy + rr * Math.sin(0.6)}`, class: 'circ-pir-wave' }));
  }
}
