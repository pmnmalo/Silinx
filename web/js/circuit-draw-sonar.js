// The circuit editor's drawing of an ultrasonic range sensor, an HC-SR04 (#5456, core/circuit-sonar.js): its blue board
// over its four pins (their names printed), its two transducers (their silver cans, their mesh), its name; between its
// cans the object's distance between a − and a + (each a click while trying it: 5 cm less or more, data-input sense-down
// / sense-up), its saved one while not trying it; while it measures, its sound in front of it. Its look:
// web/css/circuit-editor.css.
import { sv } from './dom.js';

const P = 20;
/** The distance's change of a click on its − or + (cm). */
export const SONAR_NUDGE = 5;

/** The body of an ultrasonic sensor, appended to g (its pins are circuit-draw.js's); `s` its state while trying it
 *  (sim.sonars()'s: { cm, measuring, echo }) or none. */
export function drawSonar(g, p, s) {
  const ox = p.x * P, oy = p.y * P, cx = ox + 1.5 * P, top = oy - 8.6 * P, cy = oy - 4.6 * P, r = 3.1 * P;
  g.append(sv('rect', { x: ox - 7.5 * P, y: top, width: 18 * P, height: 8.2 * P, rx: 4, class: 'circ-sonar-board' }));
  for (const dx of [-5.1, 5.1]) {
    const x = cx + dx * P;
    g.append(sv('circle', { cx: x, cy, r, class: 'circ-sonar-can' }), sv('circle', { cx: x, cy, r: r * 0.78, class: 'circ-sonar-mesh' }),
      sv('text', { x, y: cy + 4, 'text-anchor': 'middle', class: 'circ-sonar-tx', 'data-no-i18n': 'true' }, dx < 0 ? 'T' : 'R'));
  }
  g.append(sv('rect', { x: cx - 0.9 * P, y: cy - 1.1 * P, width: 1.8 * P, height: 0.8 * P, rx: 3, class: 'circ-sonar-xtal' }),
    sv('text', { x: cx, y: top + 0.9 * P, 'text-anchor': 'middle', class: 'circ-sonar-name', 'data-no-i18n': 'true' }, 'HC-SR04'),
    sv('text', { x: cx, y: top - 6, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, p.label || p.id));
  ['Vcc', 'Trig', 'Echo', 'Gnd'].forEach((name, i) => g.append(sv('text', { x: ox + i * P, y: oy - 0.7 * P, 'text-anchor': 'middle', class: 'circ-sonar-pin', 'data-no-i18n': 'true' }, name)));
  // (its sound while it measures: arcs in front of its transducers)
  if (s?.measuring) for (const k of [1, 2, 3]) g.append(sv('path', { d: `M${cx - 6 * P},${top - k * 0.5 * P}Q${cx},${top - k * 0.5 * P - 1.6 * P} ${cx + 6 * P},${top - k * 0.5 * P}`, class: 'circ-sonar-wave' }));
  // (the object's distance, its − and +)
  const cm = s?.cm ?? p.cm ?? 100, y = cy + 1.1 * P;
  const btn = (dx, label, input) => sv('g', { class: 'circ-temp-btn circ-sonar-btn', 'data-input': input },
    sv('rect', { x: cx + dx - P * 0.4, y: y - P * 0.55, width: P * 0.8, height: P * 0.8, rx: 2 }), sv('text', { x: cx + dx, y: y + 1, 'text-anchor': 'middle', 'data-no-i18n': 'true' }, label));
  g.append(btn(-P * 1.45, '−', 'sense-down'), sv('text', { x: cx, y: y + 1, 'text-anchor': 'middle', class: 'circ-sonar-cm', 'data-no-i18n': 'true' }, `${cm} cm`), btn(P * 1.45, '+', 'sense-up'));
}
