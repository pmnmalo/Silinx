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
import { icInside, stripsSvg } from './circuit-draw-inside.js';
import { wirePaths } from '/core/circuit-wires.js';
import { wireStyleOf } from '/core/wire-style.js';
import { routeOrthogonal } from '/core/circuit-route.js';

export const P = 20;   // pixels per grid step
const px = (v) => v * P;

/** The circuit drawn: a <g> of its breadboards, wires and parts. `levels(partId, pin)`: a pin's level while simulating;
 *  `inside`: the ICs' gates or pin names and the breadboards' strips shown (#4060); `hops`: the wires' hop-overs (#4064). */
export function drawCircuit(m, { sel = null, levels = null, leds = null, inputs = null, draft = null, ghost = null, inside = false, hops = false } = {}) {
  const g = sv('g', { class: `circ-drawing${inside ? ' circ-inside' : ''}` });
  const isSel = (id) => sel?.id === id;
  for (const p of m.parts) if (partDef(p.type)?.kind === 'breadboard') g.append(breadboardSvg(p, isSel(p.id), inside));
  // (direct, orthogonal or curved, hopping over the wires drawn before them: core/circuit-wires.js)
  const d = wirePaths(m.wires.map((w) => ({ id: w.id, pts: w.points.map(([x, y]) => [px(x), px(y)]) })), { style: wireStyleOf(m, 'direct'), hops });
  for (const w of m.wires) g.append(wireSvg(w, isSel(w.id), d[w.id]));
  for (const p of m.parts) if (partDef(p.type) && partDef(p.type).kind !== 'breadboard') g.append(partSvg(p, isSel(p.id), { levels, leds, inputs, inside }));
  if (draft?.length >= 2) g.append(draftSvg(m, draft));
  if (ghost) { const e = partSvg(ghost, false, {}); e.classList.add('circ-ghost'); g.append(e); }
  return g;
}

// (turned, #4065: drawn unturned, then turned about its hole a1)
/** The wire being drawn through the grid points pts (A, the clicks, the pointer), as it will be made in the circuit's
 *  style (#4083): straight, routed orthogonally (core/circuit-route.js) or curved. */
export function draftSvg(m, pts) {
  const style = wireStyleOf(m, 'direct');
  const at = style === 'orthogonal' ? routeOrthogonal(m, pts).points : pts;
  return sv('path', { class: 'circ-wire circ-draft', d: wirePaths([{ id: 'draft', pts: at.map(([x, y]) => [px(x), px(y)]) }], { style: style === 'curved' ? 'curved' : 'direct' }).draft });
}

function breadboardSvg(turned, selected, inside) {
  const p = { ...turned, rot: 0 }, d = partDef(p.type), cols = d.cols || BB_COLS;
  const x0 = px(p.x) - P, y0 = px(p.y + BB_RAILS.tp) - P, w = px(cols + 1), hgt = px(BB_RAILS.bp - BB_RAILS.tp + 2);
  const g = sv('g', { class: `circ-bb${selected ? ' circ-sel' : ''}`, 'data-kind': 'part', 'data-id': p.id },
    sv('rect', { x: x0, y: y0, width: w, height: hgt, rx: 6, class: 'circ-bb-body' }),
    sv('rect', { x: x0 + 6, y: px(p.y + BB_ROWS.e) + P * 0.5, width: w - 12, height: px(BB_ROWS.f - BB_ROWS.e) - P, class: 'circ-bb-channel' }));
  // the rails' lines: red the +, blue the −
  // (a full breadboard's rails split after its column `split`: two lines each)
  const spans = d.split ? [[x0 + 8, px(p.x + d.split - 1) + P / 2 - 4], [px(p.x + d.split) - P / 2 + 4, x0 + w - 8]] : [[x0 + 8, x0 + w - 8]];
  for (const [r, y] of Object.entries(BB_RAILS)) {
    const ly = px(p.y + y) + (r === 'tp' || r === 'bn' ? -P / 2 : P / 2);
    for (const [a, b] of spans) g.append(sv('line', { x1: a, x2: b, y1: ly, y2: ly, class: r.endsWith('p') ? 'circ-rail-plus' : 'circ-rail-minus' }));
  }
  if (inside) g.append(stripsSvg(p, d));   // (its strips, under its holes, #4060)
  for (const hle of partHoles(p)) g.append(sv('rect', { x: px(hle.x) - 3.5, y: px(hle.y) - 3.5, width: 7, height: 7, rx: 1.5, class: 'circ-hole' }));
  // the rows' letters and every fifth column's number
  for (const [r, y] of Object.entries(BB_ROWS)) g.append(sv('text', { x: x0 + P / 2, y: px(p.y + y) + 3.5, class: 'circ-bb-label' }, r));
  for (let c = 1; c <= cols; c += c === 1 ? 4 : 5) g.append(sv('text', { x: px(p.x + c - 1), y: px(p.y) - P * 0.55, class: 'circ-bb-label', 'text-anchor': 'middle' }, String(c)));
  return turnWhole(g, turned);
}

// A part drawn unturned turned as a whole by its rot quarter turns clockwise about its place (x, y), as its pins and
// holes are (core/circuit-parts.js partPins, partHoles); its texts kept upright, each turned back about its middle; a
// part's name, beside the part once turned, starts away from it (named: from the middle of its rectangles and circles).
function turnWhole(g, p, named = false) {
  const rot = (((p.rot || 0) % 4) + 4) % 4;
  if (!rot) return g;
  const c = named ? middle(g) : null;
  g.setAttribute('transform', `rotate(${90 * rot} ${px(p.x)} ${px(p.y)})`);
  for (const t of g.querySelectorAll('text')) {
    const x = Number(t.getAttribute('x')), y = Number(t.getAttribute('y'));
    t.setAttribute('transform', `rotate(${-90 * rot} ${x} ${y - 3.5})`);
    if (!c || !t.classList.contains('circ-label')) continue;
    let [vx, vy] = [x - c[0], y - c[1]];
    for (let k = rot; k > 0; k--) [vx, vy] = [-vy, vx];
    if (Math.abs(vx) > Math.abs(vy)) t.setAttribute('text-anchor', vx > 0 ? 'start' : 'end');
  }
  return g;
}

// the middle of a drawing's rectangles and circles (its attributes: not yet on the page), pixels
function middle(g) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  const add = (x0, y0, x1, y1) => { b.x0 = Math.min(b.x0, x0); b.y0 = Math.min(b.y0, y0); b.x1 = Math.max(b.x1, x1); b.y1 = Math.max(b.y1, y1); };
  const n = (e, a) => Number(e.getAttribute(a));
  for (const e of g.querySelectorAll('rect')) add(n(e, 'x'), n(e, 'y'), n(e, 'x') + n(e, 'width'), n(e, 'y') + n(e, 'height'));
  for (const e of g.querySelectorAll('circle')) add(n(e, 'cx') - n(e, 'r'), n(e, 'cy') - n(e, 'r'), n(e, 'cx') + n(e, 'r'), n(e, 'cy') + n(e, 'r'));
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
}

function wireSvg(w, selected, d) {
  const [a, b] = [w.points[0], w.points[w.points.length - 1]];
  return sv('g', { class: `circ-wire-g${selected ? ' circ-sel' : ''}`, 'data-kind': 'wire', 'data-id': w.id },
    sv('path', { d, class: 'circ-wire-hit' }),
    sv('path', { d, class: `circ-wire circ-w-${w.color}` }),
    ...[a, b].map(([x, y]) => sv('circle', { cx: px(x), cy: px(y), r: 3.2, class: `circ-wire-end circ-w-${w.color}` })));
}

const LEVEL_CLS = { 0: 'lv0', 1: 'lv1', Z: 'lvz', X: 'lvx' };
// (turned, #4114: drawn unturned, then turned whole about its place)
function partSvg(turned, selected, { levels, leds, inputs, inside = false }) {
  const p = { ...turned, rot: 0 }, d = partDef(p.type);
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
    // (shown inside, #4060: its gates or its pins' names in its body, its name in its tip)
    // (a project's KiCad part, #4281: its own part number)
    const chip = d.kicad?.value ?? d.chip;
    if (inside) { g.append(sv('title', {}, `${p.id}  ${chip}`)); icInside(g, d, pins, box); }
    else g.append(sv('text', { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 + 4, 'text-anchor': 'middle', class: 'circ-ic-text', 'data-no-i18n': 'true' }, `${p.id}  ${chip}`));
  } else if (d.kind === 'drawn') {
    // a project's KiCad part drawn only (#4281): a body round its pins (a DIP's between its rows), its outline dashed
    const dipRows = d.dip && box.y1 - box.y0 > P;
    const body = dipRows ? { x: box.x0 - P * 0.4, y: box.y0 + P * 0.35, width: box.x1 - box.x0 + P * 0.8, height: box.y1 - box.y0 - P * 0.7 }
      : { x: box.x0 - P * 0.5, y: box.y0 - P * 0.5, width: box.x1 - box.x0 + P, height: box.y1 - box.y0 + P };
    g.append(sv('rect', { ...body, rx: 2, class: 'circ-drawn-body' }), sv('title', {}, `${p.id}  ${d.kicad.value}: drawn only, not simulated`),
      sv('text', { x: body.x + body.width / 2, y: body.y + body.height / 2 + 4, 'text-anchor': 'middle', class: 'circ-ic-text', 'data-no-i18n': 'true' }, `${p.id}  ${d.kicad.value}`));
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
    g.append(sv('circle', { cx: px(q.x), cy: px(q.y), r: d.kind === 'ic' || d.kind === 'drawn' ? 3.4 : 3, class: `circ-pin${lv ? ` ${LEVEL_CLS[lv]}` : ''}` },
      sv('title', {}, `${p.id} pin ${q.n}${String(q.n) === q.name ? '' : ` (${q.name})`}${lv ? `: ${lv}` : ''}`)));
  }
  return turnWhole(g, turned, true);
}
