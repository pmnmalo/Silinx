// The circuit editor's Show inside (#4060, web/js/circuit-draw.js draws the rest): what is inside a part, to wire it more
// easily. A breadboard's strips (the holes joined: each column's a–e and f–j, each power rail, a full board's halves)
// drawn as the metal strips under its holes; a gate IC's gates in its body as its datasheet's connection diagram
// (#4224, core/circuit-inside.js: each gate beside its pins, facing its output pin, wired with horizontal and vertical
// lines into its input side and from its tip), in the standard of Settings ▸ Schematic Symbols (#4113, #4220;
// core/symbol-standard.js): IEEE Std 91-1984's distinctive shape or IEC 60617-12's box (&, ≥1, =1, 1), a bubble on an
// inverting one's output; the pins no gate uses named (VCC, GND); another IC's pins named inside its body. In pixels,
// from the parts' pins.
import { sv } from './dom.js';
import { partHoles } from '/core/circuit-parts.js';
import { iecQualifier, ieeeGate } from '/core/symbol-standard.js';
import { insideLayout } from '/core/circuit-inside.js';
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

/** An IC's inside drawn into g: its gates (d.gates) in the standard `std` (ieee, iec) as its datasheet's connection
 *  diagram (core/circuit-inside.js), the pins no gate uses named (VCC, GND), or else its pins' names; `pins` its pins on
 *  the grid (unturned: the part is turned whole), `box` theirs. */
export function icInside(g, d, pins, box, std = getSymbolStandard()) {
  const at = new Map(pins.map((q) => [q.n, [px(q.x), px(q.y)]]));
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  // (its rows along the longer side)
  const across = box.x1 - box.x0 >= box.y1 - box.y0 ? 1 : 0;
  const used = new Set((d.gates || []).flatMap((x) => [...x.ins, x.out]));
  for (const q of pins) {
    if (q.name === String(q.n) || used.has(q.n) || q.name === 'NC') continue;
    const [x, y] = at.get(q.n);
    const t = across ? [x, y + Math.sign(cy - y) * 11] : [x + Math.sign(cx - x) * 11, y];
    g.append(sv('text', { x: t[0], y: t[1] + 2.5, 'text-anchor': 'middle', class: 'circ-pin-name', 'data-no-i18n': 'true' }, q.name));
  }
  if (!d.gates) return;
  const L = insideLayout(d, pins.map((q) => ({ n: q.n, x: px(q.x), y: px(q.y) })));
  for (const w of L.wires) g.append(sv('polyline', { points: w.points.map((q) => q.join(',')).join(' '), class: 'circ-gate-line', 'data-pin': w.pin }));
  for (const gt of L.gates) g.append(...(std === 'iec' ? iecInside(gt) : [ieeeInside(gt)]));
}

// (a gate facing left: drawn facing right in its box, mirrored about the box's middle)
const mirror = (gt) => (gt.flip ? { transform: `translate(${2 * gt.x + gt.w} 0) scale(-1 1)` } : {});

// an IEEE distinctive shape in the gate's box, its bubble at its tip
function ieeeInside(gt) {
  const { paths, bubble } = ieeeGate(gt.fn, { x: gt.x, y: gt.y, w: gt.w, h: gt.h, r: 2 });
  const g = sv('g', { class: 'circ-gate-ieee', 'data-fn': gt.fn, ...mirror(gt) });
  paths.forEach((d, k) => g.append(sv('path', { d, class: k ? 'circ-gate circ-gate-back' : 'circ-gate' })));
  if (bubble) g.append(sv('circle', { cx: bubble.cx, cy: bubble.cy, r: bubble.r, class: 'circ-gate-bubble' }));
  return g;
}

// an IEC box with its qualifier (upright: not mirrored) and its bubble at its tip
function iecInside(gt) {
  const box = sv('rect', { x: gt.x, y: gt.y, width: gt.w, height: gt.h, rx: 1, class: 'circ-gate', 'data-fn': gt.fn });
  const label = sv('text', { x: gt.x + gt.w / 2, y: gt.y + gt.h / 2 + 3, 'text-anchor': 'middle', class: 'circ-gate-text', 'data-no-i18n': 'true' }, iecQualifier(gt.fn) ?? gt.fn);
  return [box, label, ...(gt.bubble ? [sv('circle', { cx: gt.bubble[0], cy: gt.bubble[1], r: 2, class: 'circ-gate-bubble' })] : [])];
}
