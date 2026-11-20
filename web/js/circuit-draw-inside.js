// The circuit editor's Show inside (#4060, web/js/circuit-draw.js draws the rest): what is inside a part, to wire it more
// easily. A breadboard's strips (the holes joined: each column's a–e and f–j, each power rail, a full board's halves)
// drawn as the metal strips under its holes; a gate IC's gates in its body as its datasheet's connection diagram
// (#4224, core/circuit-inside.js: each gate beside its pins, facing its output pin, wired with horizontal and vertical
// lines into its input side and from its tip; lines, unfilled, #4299), in the standard of Settings ▸ Schematic Symbols (#4113, #4220;
// core/symbol-standard.js): IEEE Std 91-1984's distinctive shape or IEC 60617-12's box (&, ≥1, =1, 1), a bubble on an
// inverting one's output; the pins no gate uses named (VCC, GND); another IC's pins named inside its body. In pixels,
// from the parts' pins.
import { sv } from './dom.js';
import { partHoles } from '/core/circuit-parts.js';
import { iecQualifier, ieeeGate } from '/core/symbol-standard.js';
import { insideLayout } from '/core/circuit-inside.js';
import { blocksLayout } from '/core/circuit-inside-blocks.js';
import { drawnLayout } from '/core/circuit-inside-drawn.js';
import { getSymbolStandard } from './symbol-standard.js';
import { wireHops, hopD } from '/core/circuit-wires.js';

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
 *  the grid (unturned: the part is turned whole), `box` theirs. `hops`: a crossing of its lines a hop-over, as the
 *  circuit's wires (#4505). */
export function icInside(g, d, pins, box, std = getSymbolStandard(), { hops = false } = {}) {
  const at = new Map(pins.map((q) => [q.n, [px(q.x), px(q.y)]]));
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  // (its rows along the longer side)
  const across = box.x1 - box.x0 >= box.y1 - box.y0 ? 1 : 0;
  // (its gates drawn: their pins' names left out; a gate IC its layout cannot draw, a 4023, #4397: every pin named)
  const L = d.gates ? insideLayout(d, pins.map((q) => ({ n: q.n, x: px(q.x), y: px(q.y) }))) : null;
  // (an IC with no gates, #4508: its functions' boxes, core/circuit-inside-blocks.js)
  // (a latch whose units share an enable, #4934: as its datasheet draws it, core/circuit-inside-drawn.js)
  const B = d.gates ? null : drawnLayout(d, pins.map((q) => ({ n: q.n, x: px(q.x), y: px(q.y) }))) ?? blocksLayout(d, pins.map((q) => ({ n: q.n, x: px(q.x), y: px(q.y) })));
  const used = new Set(L?.gates.length ? d.gates.flatMap((x) => [...x.ins, x.out, ...(x.en || []).map(([n]) => n)]) : B ? [...B.boxes.flatMap((b) => b.pins.map((q) => q.n)), ...(B.unnamed ?? [])] : []);
  for (const q of pins) {
    if (q.name === String(q.n) || used.has(q.n) || q.name === 'NC') continue;
    const [x, y] = at.get(q.n);
    const t = across ? [x, y + Math.sign(cy - y) * 11] : [x + Math.sign(cx - x) * 11, y];
    g.append(sv('text', { x: t[0], y: t[1] + 2.5, 'text-anchor': 'middle', class: 'circ-pin-name', 'data-no-i18n': 'true' }, q.name));
  }
  if (B) blocksInside(g, B, std, hops);
  if (!L) return;
  // (a crossing IC's lines, #4505: crossing as the circuit's wires do, Wire crossings: a hop-over, or plain; no dot)
  const hop = hops && L.crossings?.length ? wireHops(L.wires.map((w, i) => ({ id: i, pts: w.points }))) : new Map();
  L.wires.forEach((w, i) => {
    const pin = w.pin != null ? { 'data-pin': w.pin } : {};
    g.append(hop.has(i) ? sv('path', { d: hopD(w.points, hop.get(i), 2.5), fill: 'none', class: 'circ-gate-line circ-gate-hop', ...pin })
      : sv('polyline', { points: w.points.map((q) => q.join(',')).join(' '), fill: 'none', class: 'circ-gate-line', ...pin }));
  });
  for (const gt of L.gates) g.append(...(std === 'iec' ? iecInside(gt) : [ieeeInside(gt)]));
  // (a three-state IC's, #4505: its lines' branches' dots, its active-low enables' bubbles)
  for (const [cx, cy] of L.dots ?? []) g.append(sv('circle', { cx, cy, r: 1.5, class: 'circ-gate-dot' }));
  for (const [cx, cy] of L.bubbles ?? []) g.append(sv('circle', { cx, cy, r: 2, class: 'circ-gate-bubble circ-gate-en' }));
}

// (a gate facing left: drawn facing right in its box, mirrored about the box's middle; an AND-OR-INVERT's term facing up
// or down, #4498: drawn facing right in its box turned back, then turned about its middle)
const mirror = (gt) => (gt.flip ? { transform: `translate(${2 * gt.x + gt.w} 0) scale(-1 1)` } : {});
const turn = (gt) => {
  const cx = gt.x + gt.w / 2, cy = gt.y + gt.h / 2;
  return { box: { x: cx - gt.h / 2, y: cy - gt.w / 2, w: gt.h, h: gt.w }, attrs: { transform: `rotate(${gt.rot} ${cx} ${cy})` } };
};

// an IEEE distinctive shape in the gate's box, its bubble at its tip
function ieeeInside(gt) {
  const t = gt.rot ? turn(gt) : { box: gt, attrs: mirror(gt) };
  const { paths, bubble } = ieeeGate(gt.fn, { x: t.box.x, y: t.box.y, w: t.box.w, h: t.box.h, r: 2 });
  const g = sv('g', { class: 'circ-gate-ieee', 'data-fn': gt.fn, ...(gt.rot ? { 'data-rot': gt.rot } : {}), ...t.attrs });
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

// an IC's functions' boxes (#4508): each box, its pins' lines into it, each pin's name (IEC's label) inside its edge, a
// clock's ▷ (its bubble on a falling edge), an active-low input's bubble (IEC: a barred output's too); a whole IC's IEC qualifier in its middle
// (#4934, a drawing of core/circuit-inside-drawn.js: its pins on a box's sides too, its lines' branches' dots, their
// crossings hop-overs when `hops`)
function blocksInside(g, B, std, hops = false) {
  const hop = hops && B.crossings?.length ? wireHops(B.wires.map((w, i) => ({ id: i, pts: w.points }))) : new Map();
  B.wires.forEach((w, i) => g.append(hop.has(i) ? sv('path', { d: hopD(w.points, hop.get(i), 2.5), fill: 'none', class: 'circ-gate-line circ-gate-hop', 'data-pin': w.pin })
    : sv('polyline', { points: w.points.map((q) => q.join(',')).join(' '), fill: 'none', class: 'circ-gate-line', 'data-pin': w.pin })));
  for (const [cx, cy] of B.dots ?? []) g.append(sv('circle', { cx, cy, r: 1.5, class: 'circ-gate-dot' }));
  for (const b of B.boxes) {
    const box = sv('g', { class: 'circ-block', 'data-unit': b.unit ?? 'all', 'data-std': std });
    box.append(sv('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 1, class: 'circ-gate' }));
    if (std === 'iec' && b.qualifier) box.append(sv('text', { x: b.x + b.w / 2, y: b.y + b.h / 2 + 3, 'text-anchor': 'middle', class: 'circ-block-qual', 'data-no-i18n': 'true' }, b.qualifier));
    for (const p of b.pins) {
      if (p.edge === 'left' || p.edge === 'right') { box.append(...sidePin(p, b, std)); continue; }
      const dir = p.edge === 'top' ? 1 : -1, ey = p.y;
      if (p.clock) box.append(sv('path', { d: `M${p.x - 3},${ey} L${p.x},${ey + dir * 4} L${p.x + 3},${ey}`, fill: 'none', class: 'circ-block-clock' }));
      // (IEC: a barred output's negation too, its label left out: Q̅)
      if (p.low || p.falling || (std === 'iec' && p.out && p.name.includes('\u0305'))) box.append(sv('circle', { cx: p.x, cy: ey - dir * 2, r: 2, class: 'circ-gate-bubble' }));
      const label = std === 'iec' ? p.iec : p.name;
      if (!label) continue;
      const size = Math.min(6.5, (p.anchor === 'middle' ? 17 : 16) / (0.62 * [...label.replace('\u0305', '')].length));
      const y = ey + dir * (p.clock ? 5 : 1) + (dir > 0 ? size * 0.8 : -size * 0.25);
      const x = p.anchor === 'start' ? Math.max(b.x + 1.5, p.x - 5.5) : p.anchor === 'end' ? Math.min(b.x + b.w - 1.5, p.x + 5.5) : p.x;
      box.append(sv('text', { x, y: Math.round(y * 100) / 100, 'text-anchor': p.anchor, class: 'circ-block-pin', 'font-size': Math.round(size * 10) / 10, 'data-pin': p.n, 'data-no-i18n': 'true' }, label));
    }
    g.append(box);
  }
}

// a pin on a box's side (#4934): its name inside the edge; IEC: a barred output's bubble outside it
function sidePin(p, b, std) {
  const dir = p.edge === 'left' ? 1 : -1, out = [];
  if (std === 'iec' && p.out && p.name.includes('\u0305')) out.push(sv('circle', { cx: p.x - dir * 2, cy: p.y, r: 2, class: 'circ-gate-bubble' }));
  const label = std === 'iec' ? p.iec : p.name;
  if (!label) return out;
  const size = Math.min(6.5, (b.w - 2) / (0.62 * [...label.replace('\u0305', '')].length));
  out.push(sv('text', { x: p.x + dir * 1.5, y: Math.round((p.y + size * 0.35) * 100) / 100, 'text-anchor': dir > 0 ? 'start' : 'end', class: 'circ-block-pin', 'font-size': Math.round(size * 10) / 10, 'data-pin': p.n, 'data-no-i18n': 'true' }, label));
  return out;
}
