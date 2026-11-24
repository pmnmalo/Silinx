// The circuit editor's drawing of a rotary encoder, a KY-040 module (#5451, core/circuit-encoder.js): its board over its
// header (CLK, DT, SW, + and GND, named on it), the encoder's metal body on it and its knob, its mark at the knob's angle
// (a detent 18°); while trying it, ↺ and ↻ turn it a detent (data-input enc-ccw, enc-cw) and the knob pushes its switch
// (data-input push, data-lever 2: held while the mouse is down, drawn down then), its id. Its look:
// web/css/circuit-editor.css.
import { sv } from './dom.js';
import { ENCODER_DETENTS } from '/core/circuit-encoder.js';

const P = 20;

/** The body of an encoder, appended to g (its pins are circuit-draw.js's); `on` its inputs' states (sim.inputs()'s: A, B,
 *  SW) or none; `detents` its turns from the start while trying it (its knob's angle). */
export function drawEncoder(g, p, d, on, detents = 0) {
  const ox = p.x * P, oy = p.y * P, at = (v, o) => o + v * P;
  const cx = at(2, ox), cy = at(-5.6, oy), down = Array.isArray(on) && on[2];
  const angle = ((detents % ENCODER_DETENTS) * 360) / ENCODER_DETENTS;
  g.append(sv('rect', { x: at(-1.2, ox), y: at(-10.2, oy), width: 6.4 * P, height: 9.6 * P, rx: 3, class: 'circ-enc-board' }),
    // (its header's pins' names, its pull-ups' two resistors)
    ...d.pins.map((q) => sv('text', { x: at(q.dx, ox), y: at(-0.9, oy), 'text-anchor': 'middle', class: 'circ-enc-pin', 'data-no-i18n': 'true' }, q.name)),
    ...[0, 1].map((i) => sv('rect', { x: at(3.9, ox), y: at(-9.6 + i * 0.8, oy), width: 0.9 * P, height: 0.45 * P, class: 'circ-enc-res' })),
    // (the encoder: its square metal body, its knob)
    sv('rect', { x: cx - 2.4 * P, y: cy - 2.4 * P, width: 4.8 * P, height: 4.8 * P, rx: 2, class: 'circ-enc-body' }),
    sv('g', { class: `circ-enc-knob${down ? ' down' : ''}`, 'data-input': 'push', 'data-lever': '2' },
      sv('circle', { cx, cy, r: 1.9 * P }),
      sv('line', { x1: cx, y1: cy, x2: cx, y2: cy - 1.6 * P, class: 'circ-enc-mark', transform: `rotate(${angle} ${cx} ${cy})` })),
    // (its turns, a detent each way)
    ...[['enc-ccw', -1, '↺'], ['enc-cw', 1, '↻']].map(([input, side, glyph]) => sv('g', { class: 'circ-enc-turn', 'data-input': input },
      sv('circle', { cx: cx + side * 3.3 * P, cy: cy - 2.6 * P, r: 0.75 * P }),
      sv('text', { x: cx + side * 3.3 * P, y: cy - 2.6 * P + 5, 'text-anchor': 'middle', 'data-no-i18n': 'true' }, glyph))),
    sv('text', { x: at(5.2, ox), y: at(-10.6, oy), 'text-anchor': 'end', class: 'circ-label', 'data-no-i18n': 'true' }, p.label || p.id));
}
