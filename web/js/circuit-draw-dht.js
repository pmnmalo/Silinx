// The circuit editor's drawing of a temperature and humidity sensor, a DHT11 or a DHT22 (#5470, core/circuit-dht.js): its
// case (a DHT11's blue, a DHT22's white) over its four legs, its grille's slots, its name; under its grille what it
// senses, its temperature and its humidity, each between a − and a + (a click while trying it: a degree, 5 %, less or
// more; data-input sense-down / sense-up, data-lever which), its saved ones while not trying it. Its look:
// web/css/circuit-editor.css.
import { sv } from './dom.js';
import { partDef } from '/core/circuit-parts.js';

const P = 20;
const shown = (x, v) => `${v.toFixed(String(x.step).split('.')[1]?.length ?? 0)} ${x.unit}`;

/** The body of a DHT, appended to g (its pins are circuit-draw.js's); `s` its state while trying it (sim.dhts()'s:
 *  { temp, hum, reads }) or none. */
export function drawDht(g, p, s) {
  const d = partDef(p.type), ox = p.x * P, oy = p.y * P, cx = ox + 1.5 * P, top = oy - 9.4 * P, bottom = oy - 1.2 * P, v = `d${d.variant}`;
  for (let k = 0; k < 4; k++) g.append(sv('path', { d: `M${ox + k * P},${oy}V${bottom}`, class: 'circ-dht-leg' }));
  g.append(sv('rect', { x: ox - 1.5 * P, y: top, width: 6 * P, height: bottom - top, rx: 3, class: `circ-dht-case ${v}` }),
    sv('text', { x: cx, y: top - 6, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, p.label || p.id));
  // (its grille: 3 columns of slots)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.append(sv('rect', { x: ox - 0.9 * P + c * 1.8 * P, y: top + 0.6 * P + r * 1.1 * P, width: 1.4 * P, height: 0.7 * P, rx: 2, class: 'circ-dht-slot' }));
  g.append(sv('text', { x: cx, y: top + 5.6 * P, 'text-anchor': 'middle', class: `circ-dht-name ${v}`, 'data-no-i18n': 'true' }, `DHT${d.variant}`));
  // (what it senses, each between its − and +)
  d.sense.forEach((x, k) => {
    const y = top + 6.6 * P + k * 1.1 * P;
    const btn = (dx, label, input) => sv('g', { class: 'circ-temp-btn circ-dht-btn', 'data-input': input, 'data-lever': k },
      sv('rect', { x: cx + dx - P * 0.35, y: y - P * 0.5, width: P * 0.7, height: P * 0.7, rx: 2 }), sv('text', { x: cx + dx, y: y + 1, 'text-anchor': 'middle', 'data-no-i18n': 'true' }, label));
    g.append(btn(-P * 2.4, '−', 'sense-down'), sv('text', { x: cx, y: y + 1, 'text-anchor': 'middle', class: `circ-dht-val ${v}`, 'data-prop': x.prop, 'data-no-i18n': 'true' }, shown(x, s?.[x.prop] ?? p[x.prop] ?? x.default)), btn(P * 2.4, '+', 'sense-up'));
  });
}
