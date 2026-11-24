// The circuit editor's drawing of an SD card module (#5477, core/circuit-sd.js): its board over its six pins (their names
// printed), its microSD socket and the card in it, its level shifter; while trying it, its state (off, idle, ready), the
// blocks written and its last read or write (in the interface's language: an SVG's text is not translated in place). Its look: web/css/circuit-editor.css.
import { sv } from './dom.js';
import { t } from './i18n.js';

const P = 20;

/** The body of an SD card module, appended to g (its pins are circuit-draw.js's); `s` its state while trying it
 *  (sim.sds()'s: { stage, written, last }) or none. */
export function drawSd(g, p, s) {
  const ox = p.x * P, oy = p.y * P, cx = ox + 2.5 * P, top = oy - 17.4 * P;
  g.append(sv('rect', { x: ox - 1.5 * P, y: top, width: 8 * P, height: 16.8 * P, rx: 3, class: 'circ-sd-board' }),
    // (its socket, the card in it, its notch, its print)
    sv('rect', { x: cx - 3.2 * P, y: top + 0.6 * P, width: 6.4 * P, height: 7.2 * P, rx: 2, class: 'circ-sd-socket' }),
    sv('path', { d: `M${cx - 2.6 * P},${top + 1.2 * P}H${cx + 2.6 * P}V${top + 6.8 * P}H${cx - 1.6 * P}L${cx - 2.6 * P},${top + 5.8 * P}Z`, class: `circ-sd-card${s?.stage === 'ready' ? ' ready' : ''}` }),
    sv('text', { x: cx, y: top + 4.4 * P, 'text-anchor': 'middle', class: 'circ-sd-card-text', 'data-no-i18n': 'true' }, 'microSD'),
    sv('rect', { x: cx - 1.6 * P, y: top + 9 * P, width: 3.2 * P, height: 1.4 * P, rx: 1, class: 'circ-sd-chip' }),
    sv('text', { x: cx, y: top - 6, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, p.label || p.id));
  ['GND', 'VCC', 'MISO', 'MOSI', 'SCK', 'CS'].forEach((name, i) => g.append(sv('text', { x: ox + i * P, y: oy - 1.2 * P, 'text-anchor': 'middle', class: 'circ-sd-pin', 'data-no-i18n': 'true' }, name)));
  // (while trying it: its state, the blocks written, its last access)
  if (!s) return;
  const line = (k, text) => g.append(sv('text', { x: cx, y: top + (11.8 + k * 1.1) * P, 'text-anchor': 'middle', class: 'circ-sd-state', 'data-no-i18n': 'true' }, t(text)));
  line(0, `card ${s.stage}`);
  line(1, `${s.written.length} written`);
  if (s.last) line(2, `${s.last.op === 'read' ? 'read' : 'wrote'} block ${s.last.block}`);
}
