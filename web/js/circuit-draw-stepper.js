// The circuit editor's drawing of a stepper motor, a 28BYJ-48 on its ULN2003 board (#5476, core/circuit-stepper.js): its
// board over its pins (their names printed), its ULN2003, its four LEDs A to D (lit while their coil is on); above it the
// motor (its can, its ears, its cable) and its shaft, off its middle as the real one's, its arm at the shaft's angle, the
// angle under it. Its look: web/css/circuit-editor.css.
import { sv } from './dom.js';

const P = 20;

/** The body of a stepper motor, appended to g (its pins are circuit-draw.js's); `s` its state while trying it
 *  (sim.steppers()'s: { steps, angle, coils }) or none. */
export function drawStepper(g, p, s) {
  const ox = p.x * P, oy = p.y * P, cx = ox + 3 * P, top = oy - 8.6 * P;
  g.append(sv('rect', { x: ox - 1.5 * P, y: top, width: 9 * P, height: 8 * P, rx: 3, class: 'circ-step-board' }),
    sv('rect', { x: cx - 2.6 * P, y: top + 3.2 * P, width: 5.2 * P, height: 1.6 * P, rx: 2, class: 'circ-step-chip' }),
    sv('text', { x: cx, y: top + 4.2 * P, 'text-anchor': 'middle', class: 'circ-step-chip-text', 'data-no-i18n': 'true' }, 'ULN2003'));
  ['A', 'B', 'C', 'D'].forEach((k, i) => {
    const x = ox + (i - 0.5) * 1.6 * P + 0.4 * P, y = top + 1.4 * P;
    g.append(sv('circle', { cx: x, cy: y, r: 0.4 * P, class: `circ-step-led${s?.coils?.[i] ? ' on' : ''}` }), sv('text', { x, y: y + 1.2 * P, 'text-anchor': 'middle', class: 'circ-step-pin', 'data-no-i18n': 'true' }, k));
  });
  ['IN1', 'IN2', 'IN3', 'IN4', '', '−', '+'].forEach((name, i) => { if (name) g.append(sv('text', { x: ox + i * P, y: oy - 1.1 * P, 'text-anchor': 'middle', class: 'circ-step-pin', 'data-no-i18n': 'true' }, name)); });
  // (the motor: its can with its ears, its cable to the board, its shaft off its middle, its arm)
  const my = top - 7 * P, r = 5.2 * P, sy = my - 2.4 * P, a = ((s?.angle ?? 0) - 90) * Math.PI / 180;
  g.append(sv('path', { d: `M${cx + r},${my + 2 * P}C${cx + r + 2 * P},${my + 4 * P} ${cx + 4 * P},${top - 1 * P} ${cx + 2.4 * P},${top}`, class: 'circ-step-cable' }),
    sv('rect', { x: cx - r - 2 * P, y: my - 0.8 * P, width: 2 * r + 4 * P, height: 1.6 * P, rx: 0.8 * P, class: 'circ-step-ears' }),
    sv('circle', { cx, cy: my, r, class: 'circ-step-can' }),
    sv('circle', { cx, cy: sy, r: 1.3 * P, class: 'circ-step-boss' }),
    sv('path', { d: `M${cx},${sy}L${cx + Math.cos(a) * 3 * P},${sy + Math.sin(a) * 3 * P}`, class: 'circ-step-arm' }),
    sv('circle', { cx, cy: sy, r: 0.45 * P, class: 'circ-step-shaft' }),
    sv('text', { x: cx, y: my + 3 * P, 'text-anchor': 'middle', class: 'circ-step-angle', 'data-no-i18n': 'true' }, `${s?.angle ?? 0}°`),
    sv('text', { x: cx, y: my - r - 6, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, p.label || p.id));
}
