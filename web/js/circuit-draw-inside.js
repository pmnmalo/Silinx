// The circuit editor's Show inside (#4060, web/js/circuit-draw.js draws the rest): what is inside a part, to wire it more
// easily. A breadboard's strips (the holes joined: each column's a–e and f–j, each power rail, a full board's halves)
// drawn as the metal strips under its holes; a gate IC's gates in its body, joined to its pins, in the standard of
// Settings ▸ Schematic Symbols (#4113, #4220; core/symbol-standard.js): IEEE Std 91-1984's distinctive shape, its
// output turned toward its output pin, or IEC 60617-12's box (&, ≥1, =1, 1), upright; a bubble on an inverting one's
// output; another IC's pins named inside its body. In pixels, from the parts' pins.
import { sv } from './dom.js';
import { partHoles } from '/core/circuit-parts.js';
import { iecQualifier, ieeeGate, invertsOutput } from '/core/symbol-standard.js';
import { getSymbolStandard } from './symbol-standard.js';

const P = 20;
const px = (v) => v * P;

/** A breadboard's strips, unturned (its group turns it): a <g> of a line through each strip's holes. */
export function stripsSvg(p) {
  const strips = new Map();
  for (const h of partHoles(p)) { if (!strips.has(h.strip)) strips.set(h.strip, []); strips.get(h.strip).push(h); }
  const g = sv('g', { class: 'circ-strips' });
  for (const hs of strips.values()) {
    const xs = hs.map((h) => px(h.x)), ys = hs.map((h) => px(h.y));
    g.append(sv('line', { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys), class: 'circ-strip' }));
  }
  return g;
}

/** An IC's inside drawn into g: its gates (d.gates) in the standard `std` (ieee, iec), or else its pins' names; `pins`
 *  its pins on the grid, `box` theirs. */
export function icInside(g, d, pins, box, std = getSymbolStandard()) {
  const at = new Map(pins.map((q) => [q.n, [px(q.x), px(q.y)]]));
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  // (its rows along the longer side: a gate's box moved off the middle toward its own pins' row)
  const across = box.x1 - box.x0 >= box.y1 - box.y0 ? 1 : 0;
  if (!d.gates) {
    for (const q of pins) {
      if (q.name === String(q.n)) continue;
      const [x, y] = at.get(q.n);
      const t = across ? [x, y + Math.sign(cy - y) * 11] : [x + Math.sign(cx - x) * 11, y];
      g.append(sv('text', { x: t[0], y: t[1] + 2.5, 'text-anchor': 'middle', class: 'circ-pin-name', 'data-no-i18n': 'true' }, q.name));
    }
    return;
  }
  for (const gate of d.gates) {
    const ps = [...gate.ins, gate.out].map((n) => at.get(n));
    const mx = ps.reduce((s, q) => s + q[0], 0) / ps.length, my = ps.reduce((s, q) => s + q[1], 0) / ps.length;
    const c = across ? [mx, cy + Math.sign(Math.round(my - cy)) * 11] : [cx + Math.sign(Math.round(mx - cx)) * 11, my];
    const lines = ps.map(([x, y]) => sv('line', { x1: x, y1: y, x2: c[0], y2: c[1], class: 'circ-gate-line' }));
    if (std !== 'iec') { g.append(...lines, ieeeInside(gate.fn, c, at.get(gate.out))); continue; }
    const box2 = sv('rect', { x: c[0] - 8, y: c[1] - 6, width: 16, height: 12, rx: 1.5, class: 'circ-gate' });
    const label = sv('text', { x: c[0], y: c[1] + 3, 'text-anchor': 'middle', class: 'circ-gate-text', 'data-no-i18n': 'true' }, iecQualifier(gate.fn) ?? gate.fn);
    g.append(...lines, box2, label);
    if (invertsOutput(gate.fn)) {
      // (its bubble on the box's edge toward the output pin)
      const o = at.get(gate.out), v = [o[0] - c[0], o[1] - c[1]], k = Math.min(8 / (Math.abs(v[0]) || 1e-9), 6 / (Math.abs(v[1]) || 1e-9));
      const len = Math.hypot(...v) || 1;
      g.append(sv('circle', { cx: c[0] + v[0] * k + (v[0] / len) * 2, cy: c[1] + v[1] * k + (v[1] / len) * 2, r: 2, class: 'circ-gate-bubble' }));
    }
  }
}

// a distinctive shape 16 by 12 about c, its output turned (by a quarter turn) toward the output pin at o
function ieeeInside(fn, c, o) {
  const v = [o[0] - c[0], o[1] - c[1]];
  const turn = Math.abs(v[0]) >= Math.abs(v[1]) ? (v[0] >= 0 ? 0 : 180) : (v[1] >= 0 ? 90 : 270);
  const { paths, bubble } = ieeeGate(fn, { x: c[0] - 8, y: c[1] - 6, w: 16, h: 12, r: 2 });
  const g = sv('g', { class: 'circ-gate-ieee', 'data-fn': fn, ...(turn ? { transform: `rotate(${turn} ${c[0]} ${c[1]})` } : {}) });
  paths.forEach((d, k) => g.append(sv('path', { d, class: k ? 'circ-gate circ-gate-back' : 'circ-gate' })));
  if (bubble) g.append(sv('circle', { cx: bubble.cx, cy: bubble.cy, r: bubble.r, class: 'circ-gate-bubble' }));
  return g;
}
