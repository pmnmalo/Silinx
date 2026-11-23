// The circuit editor's drawing of a temperature sensor LM75 (#5342, core/circuit-lm75.js): a DIP-8 as an IC is drawn (its
// body, its notch, its id and chip), its temperature under it between a − and a + (each a click while trying it: one
// degree less or more, data-input temp-down / temp-up), its saved one while not trying it. Its look:
// web/css/circuit-editor.css.
import { sv } from './dom.js';

const P = 20;

/** The body of a temperature sensor, appended to g (its pins are circuit-draw.js's); `s` its state (sim.sensors()'s) or none. */
export function drawLm75(g, p, box, s) {
  g.append(sv('rect', { x: box.x0 - P * 0.4, y: box.y0 + P * 0.35, width: box.x1 - box.x0 + P * 0.8, height: box.y1 - box.y0 - P * 0.7, rx: 2, class: 'circ-ic-body' }),
    sv('circle', { cx: box.x0 - P * 0.4, cy: (box.y0 + box.y1) / 2, r: P * 0.28, class: 'circ-ic-notch' }),
    sv('text', { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 + 4, 'text-anchor': 'middle', class: 'circ-ic-text', 'data-no-i18n': 'true' }, `${p.id} LM75`));
  const t = s?.temp ?? p.temp ?? 25, cx = (box.x0 + box.x1) / 2, y = box.y1 + P * 1.3;
  const btn = (dx, label, input) => sv('g', { class: 'circ-temp-btn', 'data-input': input },
    sv('rect', { x: cx + dx - P * 0.4, y: y - P * 0.55, width: P * 0.8, height: P * 0.8, rx: 2 }), sv('text', { x: cx + dx, y: y + 1, 'text-anchor': 'middle', 'data-no-i18n': 'true' }, label));
  g.append(btn(-P * 2.2, '−', 'temp-down'), sv('text', { x: cx, y: y + 1, 'text-anchor': 'middle', class: `circ-temp${s?.os ? ' os' : ''}`, 'data-no-i18n': 'true' }, `${t.toFixed(1)} °C`), btn(P * 2.2, '+', 'temp-up'));
}
