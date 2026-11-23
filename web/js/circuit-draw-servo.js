// The circuit editor's drawing of a servo, an SG90 (#5347, core/circuit-servo.js): its body above its 3 wires' pins (GND,
// VCC, its signal), its horn's pivot and its arm at its angle (0° to the right, 180° to the left, its target's while not
// trying it: 90°), its id and angle. Its look: web/css/circuit-editor.css.
import { sv } from './dom.js';

const P = 20;

/** The body of a servo, appended to g (its pins are circuit-draw.js's); `s` its state (sim.servos()'s) or none. */
export function drawServo(g, p, s) {
  const ox = p.x * P, oy = p.y * P, cx = ox + P * 3, cy = oy - P * 5;
  const a = ((s?.angle ?? 90) * Math.PI) / 180, len = P * 3;
  g.append(sv('rect', { x: ox - P, y: oy - P * 8, width: P * 8, height: P * 6.5, rx: 3, class: 'circ-servo-body' }),
    sv('line', { x1: ox, y1: oy, x2: ox, y2: oy - P * 1.5, class: 'circ-servo-lead' }), sv('line', { x1: ox + P, y1: oy, x2: ox + P, y2: oy - P * 1.5, class: 'circ-servo-lead' }),
    sv('line', { x1: ox + P * 2, y1: oy, x2: ox + P * 2, y2: oy - P * 1.5, class: 'circ-servo-lead' }),
    sv('line', { x1: cx, y1: cy, x2: cx + len * Math.cos(a), y2: cy - len * Math.sin(a), class: 'circ-servo-arm', 'data-angle': String(s?.angle ?? 90) }),
    sv('circle', { cx, cy, r: P * 0.6, class: 'circ-servo-hub' }),
    sv('text', { x: ox + P * 3, y: oy - P * 8.4, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, `${p.label || p.id}  ${Math.round(s?.angle ?? 90)}°`));
}
