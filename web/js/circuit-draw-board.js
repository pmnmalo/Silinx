// The circuit editor's drawing of a board (#5215, core/circuit-boards.js): an Arduino Uno or Nano, an FPGA board, its
// body as large as the board (its part's size, on the grid from its pin 1), its name and id, each pin's name beside it
// toward the body's middle (a header's names turned along it), an FPGA board's Pmod connectors named under them. Drawn
// under the wires, with the breadboards (web/js/circuit-draw.js). Its look: web/css/circuit-editor.css.
import { sv } from './dom.js';

const P = 20;

/** The body of a board part, appended to g (its pins are circuit-draw.js's). */
export function drawBoard(g, p, d) {
  const ox = p.x * P, oy = p.y * P, s = d.size;
  const at = (v, o) => o + v * P;
  const mcu = d.board.startsWith('arduino');
  g.append(sv('rect', { x: at(s.x0, ox), y: at(s.y0, oy), width: (s.x1 - s.x0) * P, height: (s.y1 - s.y0) * P, rx: 6, class: `circ-board-body ${mcu ? 'circ-board-mcu' : 'circ-board-fpga'}` }));
  const mid = (s.y0 + s.y1) / 2;
  // (its name in the middle, its id under it)
  g.append(sv('text', { x: at((s.x0 + s.x1) / 2, ox), y: at(mid, oy), 'text-anchor': 'middle', class: 'circ-board-name', 'data-no-i18n': 'true' }, d.title),
    sv('text', { x: at((s.x0 + s.x1) / 2, ox), y: at(mid, oy) + 16, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, p.label || p.id));
  // (toward the middle, or away from it where a pin of the header's other row is: a 12-pin Pmod's first row)
  const taken = new Set(d.pins.map((q) => `${q.dx},${q.dy}`));
  for (const q of d.pins) {
    const toward = q.dy < mid ? 1 : -1, inward = taken.has(`${q.dx},${q.dy + toward}`) ? -toward : toward;
    const x = at(q.dx, ox), y = at(q.dy, oy) + inward * P * 0.45;
    g.append(sv('text', { x, y, transform: `rotate(-90 ${x} ${y})`, 'text-anchor': inward > 0 ? 'end' : 'start', 'dominant-baseline': 'middle', class: 'circ-board-pin', 'data-no-i18n': 'true' }, q.name));
  }
  // (an FPGA board's connectors: each one's name under its pins' names)
  const last = Math.max(...d.pins.map((q) => q.dy));
  for (const q of d.pins.filter((x) => /^J[A-Z]1$/.test(x.name))) {
    g.append(sv('text', { x: at(q.dx + 2.5, ox), y: at(last + 2.6, oy), 'text-anchor': 'middle', class: 'circ-board-conn', 'data-no-i18n': 'true' }, q.name.slice(0, 2)));
  }
}
