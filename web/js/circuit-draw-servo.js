// The circuit editor's drawing of a servo, an SG90 (#5347, core/circuit-servo.js): its body above its 3 wires' pins (GND,
// VCC, its signal), its horn's pivot and its arm at its angle (0° to the right, 180° to the left, its target's while not
// trying it: 90°), its id and angle. Its look: web/css/circuit-editor.css.
import { sv } from './dom.js';

const P = 20;

/** The body of a servo, appended to g (its pins are circuit-draw.js's); `s` its state (sim.servos()'s) or none. */
export function drawServo(g, p, s) {
  const ox = p.x * P, oy = p.y * P, cx = ox + P * 3, cy = oy - P * 5;
  const a = ((s?.angle ?? 90) * Math.PI) / 180, len = P * 3;
  const ex = Math.cos(a), ey = -Math.sin(a);
  // (an SG90 as it looks, #5367: its blue case, its two mounting ears, its gear housing round the shaft, its brown, red
  // and orange wires; its white horn, its holes)
  g.append(sv('rect', { x: ox - P, y: oy - P * 8, width: P * 8, height: P * 6.5, rx: 3, class: 'circ-servo-body' }),
    ...[ox - P * 2.4, ox + P * 7].map((x) => sv('rect', { x, y: oy - P * 5.6, width: P * 1.4, height: P * 1.2, rx: 2, class: 'circ-servo-ear' })),
    ...[ox - P * 1.7, ox + P * 7.7].map((x) => sv('circle', { cx: x, cy: oy - P * 5, r: P * 0.22, class: 'circ-mount-hole' })),
    sv('circle', { cx, cy, r: P * 1.5, class: 'circ-servo-top' }),
    sv('text', { x: ox + P * 3, y: oy - P * 2.2, 'text-anchor': 'middle', class: 'circ-servo-text', 'data-no-i18n': 'true' }, 'SG90'),
    ...['gnd', 'vcc', 'sig'].map((w, i) => sv('line', { x1: ox + P * i, y1: oy, x2: ox + P * i, y2: oy - P * 1.5, class: `circ-servo-lead circ-servo-lead-${w}` })),
    sv('line', { x1: cx, y1: cy, x2: cx + len * ex, y2: cy + len * ey, class: 'circ-servo-arm', 'data-angle': String(s?.angle ?? 90) }),
    ...[0.55, 0.75, 0.95].map((f) => sv('circle', { cx: cx + len * f * ex, cy: cy + len * f * ey, r: P * 0.1, class: 'circ-servo-hole' })),
    sv('circle', { cx, cy, r: P * 0.6, class: 'circ-servo-hub' }),
    sv('text', { x: ox + P * 3, y: oy - P * 8.4, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, `${p.label || p.id}  ${Math.round(s?.angle ?? 90)}°`));
}
