// The circuit editor's drawing (#3897, docs/CIRCUITS.md): a circuit on its SVG, on the 0.1 inch grid (P pixels a step):
// the breadboards (their holes, the channel, the rails), the parts (an IC's body, its notch and its pins numbered, a
// logic switch's slider, a button, an LED lit or not, the supply's terminals), the wires (their colours, their bends),
// the wire being drawn and the part being placed; simulating, each pin's level (0, 1, Z, X) and the LEDs as they are.
// Each part and wire is a group with data-kind and data-id (data-input on a switch or a button: a click while
// simulating). Its look: web/css/circuit-editor.css.
import { sv } from './dom.js';
import { partDef, partPins, partHoles, BB_COLS, BB_ROWS, BB_RAILS } from '/core/circuit-parts.js';
import { portName } from '/core/circuit.js';
import { drawPart2 } from './circuit-draw-parts.js';

export const P = 20;   // pixels per grid step
const px = (v) => v * P;

/** The circuit drawn: a <g> of its breadboards, wires and parts. `levels(partId, pin)`: a pin's level while simulating. */
export function drawCircuit(m, { sel = null, levels = null, leds = null, inputs = null, draft = null, ghost = null } = {}) {
  const g = sv('g', { class: 'circ-drawing' });
  const isSel = (id) => sel?.id === id;
  for (const p of m.parts) if (partDef(p.type)?.kind === 'breadboard') g.append(breadboardSvg(p, isSel(p.id)));
  for (const w of m.wires) g.append(wireSvg(w, isSel(w.id)));
  for (const p of m.parts) if (partDef(p.type) && partDef(p.type).kind !== 'breadboard') g.append(partSvg(p, isSel(p.id), { levels, leds, inputs }));
  if (draft?.length) g.append(sv('polyline', { class: 'circ-wire circ-draft', points: draft.map(([x, y]) => `${px(x)},${px(y)}`).join(' ') }));
  if (ghost) { const e = partSvg(ghost, false, {}); e.classList.add('circ-ghost'); g.append(e); }
  return g;
}

// (turned, #4065: drawn unturned, then turned about its hole a1)
function breadboardSvg(turned, selected) {
  const p = { ...turned, rot: 0 }, d = partDef(p.type), cols = d.cols || BB_COLS;
  const x0 = px(p.x) - P, y0 = px(p.y + BB_RAILS.tp) - P, w = px(cols + 1), hgt = px(BB_RAILS.bp - BB_RAILS.tp + 2);
  const g = sv('g', { class: `circ-bb${selected ? ' circ-sel' : ''}`, 'data-kind': 'part', 'data-id': p.id, ...(turned.rot ? { transform: `rotate(${90 * turned.rot} ${px(p.x)} ${px(p.y)})` } : {}) },
    sv('rect', { x: x0, y: y0, width: w, height: hgt, rx: 6, class: 'circ-bb-body' }),
    sv('rect', { x: x0 + 6, y: px(p.y + BB_ROWS.e) + P * 0.5, width: w - 12, height: px(BB_ROWS.f - BB_ROWS.e) - P, class: 'circ-bb-channel' }));
  // the rails' lines: red the +, blue the −
  // (a full breadboard's rails split after its column `split`: two lines each)
  const spans = d.split ? [[x0 + 8, px(p.x + d.split - 1) + P / 2 - 4], [px(p.x + d.split) - P / 2 + 4, x0 + w - 8]] : [[x0 + 8, x0 + w - 8]];
  for (const [r, y] of Object.entries(BB_RAILS)) {
    const ly = px(p.y + y) + (r === 'tp' || r === 'bn' ? -P / 2 : P / 2);
    for (const [a, b] of spans) g.append(sv('line', { x1: a, x2: b, y1: ly, y2: ly, class: r.endsWith('p') ? 'circ-rail-plus' : 'circ-rail-minus' }));
  }
  for (const hle of partHoles(p)) g.append(sv('rect', { x: px(hle.x) - 3.5, y: px(hle.y) - 3.5, width: 7, height: 7, rx: 1.5, class: 'circ-hole' }));
  // the rows' letters and every fifth column's number
  for (const [r, y] of Object.entries(BB_ROWS)) g.append(sv('text', { x: x0 + P / 2, y: px(p.y + y) + 3.5, class: 'circ-bb-label' }, r));
  for (let c = 1; c <= cols; c += c === 1 ? 4 : 5) g.append(sv('text', { x: px(p.x + c - 1), y: px(p.y) - P * 0.55, class: 'circ-bb-label', 'text-anchor': 'middle' }, String(c)));
  return g;
}

function wireSvg(w, selected) {
  const pts = w.points.map(([x, y]) => `${px(x)},${px(y)}`).join(' ');
  const [a, b] = [w.points[0], w.points[w.points.length - 1]];
  return sv('g', { class: `circ-wire-g${selected ? ' circ-sel' : ''}`, 'data-kind': 'wire', 'data-id': w.id },
    sv('polyline', { points: pts, class: 'circ-wire-hit' }),
    sv('polyline', { points: pts, class: `circ-wire circ-w-${w.color}` }),
    ...[a, b].map(([x, y]) => sv('circle', { cx: px(x), cy: px(y), r: 3.2, class: `circ-wire-end circ-w-${w.color}` })));
}

const LEVEL_CLS = { 0: 'lv0', 1: 'lv1', Z: 'lvz', X: 'lvx' };
function partSvg(p, selected, { levels, leds, inputs }) {
  const d = partDef(p.type);
  const pins = partPins(p);
  const g = sv('g', { class: `circ-part circ-${d.kind}${selected ? ' circ-sel' : ''}`, 'data-kind': 'part', 'data-id': p.id });
  const xs = pins.map((q) => px(q.x)), ys = pins.map((q) => px(q.y));
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  if (drawPart2(g, p, box, { on: inputs ? inputs[p.id] : p.on, lamps: leds?.[p.id], level: levels?.(p.id, 1) })) { /* (phase 2's parts: circuit-draw-parts.js) */ }
  else if (d.kind === 'ic') {
    g.append(sv('rect', { x: box.x0 - P * 0.4, y: box.y0 + P * 0.35, width: box.x1 - box.x0 + P * 0.8, height: box.y1 - box.y0 - P * 0.7, rx: 2, class: 'circ-ic-body' }));
    // its notch on pin 1's short side, its name and chip
    const p1 = pins[0], p14 = pins[pins.length - 1];
    const nx = (px(p1.x) + px(p14.x)) / 2 - (p1.x === p14.x ? 0 : 0), ny = (px(p1.y) + px(p14.y)) / 2;
    const toward = [px(p1.x) - (px(pins[1].x)), px(p1.y) - (px(pins[1].y))];   // (from pin 2 to pin 1: the notch's side)
    g.append(sv('circle', { cx: nx + Math.sign(toward[0]) * P * 0.4, cy: ny + Math.sign(toward[1]) * P * 0.4, r: P * 0.28, class: 'circ-ic-notch' }));
    g.append(sv('text', { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 + 4, 'text-anchor': 'middle', class: 'circ-ic-text', 'data-no-i18n': 'true' }, `${p.id}  ${d.chip}`));
  } else if (d.type === 'logic-switch') {
    const on = inputs ? inputs[p.id] : p.on;
    g.dataset.input = 'switch';
    g.append(sv('rect', { x: box.x0 - P * 1.6, y: box.y0 - P * 0.6, width: P * 1.4, height: P * 1.2, rx: 3, class: 'circ-sw-body' }),
      sv('rect', { x: box.x0 - P * (on ? 0.95 : 1.5), y: box.y0 - P * 0.45, width: P * 0.55, height: P * 0.9, rx: 2, class: `circ-sw-knob${on ? ' on' : ''}` }),
      sv('text', { x: box.x0 - P * 0.9, y: box.y0 - P * 0.8, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, portName(p)));
  } else if (d.type === 'button') {
    const down = inputs ? inputs[p.id] : false;
    g.dataset.input = 'button';
    g.append(sv('rect', { x: box.x0, y: box.y0 - P * 0.8, width: box.x1 - box.x0, height: P * 1.6, rx: 3, class: 'circ-btn-body' }),
      sv('circle', { cx: (box.x0 + box.x1) / 2, cy: box.y0, r: P * 0.55, class: `circ-btn-cap${down ? ' down' : ''}` }),
      sv('text', { x: (box.x0 + box.x1) / 2, y: box.y0 - P * 1, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, portName(p)));
  } else if (d.type === 'led') {
    const st = leds?.[p.id];   // (on, off, x)
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    g.append(sv('circle', { cx, cy: cy - P * 0.6, r: P * 0.55, class: `circ-led circ-led-${p.color || 'red'}${st === 'on' ? ' lit' : st === 'x' ? ' unknown' : ''}` }),
      sv('text', { x: cx, y: cy - P * 1.35, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, portName(p)));
  } else if (d.kind === 'supply') {
    g.append(sv('rect', { x: box.x0 - P * 2.6, y: box.y0 - P * 0.5, width: P * 2.3, height: box.y1 - box.y0 + P, rx: 3, class: 'circ-supply-body' }),
      sv('text', { x: box.x0 - P * 1.45, y: box.y0 + 4, 'text-anchor': 'middle', class: 'circ-supply-text' }, '+5V'),
      sv('text', { x: box.x0 - P * 1.45, y: box.y1 + 4, 'text-anchor': 'middle', class: 'circ-supply-text' }, 'GND'));
  }
  // the pins (their levels while simulating), an IC's numbered on hover (their names in the tip)
  for (const q of pins) {
    const lv = levels?.(p.id, q.n);
    g.append(sv('circle', { cx: px(q.x), cy: px(q.y), r: d.kind === 'ic' ? 3.4 : 3, class: `circ-pin${lv ? ` ${LEVEL_CLS[lv]}` : ''}` },
      sv('title', {}, `${p.id} pin ${q.n}${String(q.n) === q.name ? '' : ` (${q.name})`}${lv ? `: ${lv}` : ''}`)));
  }
  return g;
}
