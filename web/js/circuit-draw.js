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
import { drawBoard } from './circuit-draw-board.js';
import { drawLcd } from './circuit-draw-lcd.js';
import { drawOled } from './circuit-draw-oled.js';
import { drawLm75 } from './circuit-draw-lm75.js';
import { drawServo } from './circuit-draw-servo.js';
import { drawKeypad } from './circuit-draw-keypad.js';
import { drawEncoder } from './circuit-draw-encoder.js';
import { drawBuzzer } from './circuit-draw-buzzer.js';
import { drawSonar } from './circuit-draw-sonar.js';
import { drawPir } from './circuit-draw-pir.js';
import { drawDht } from './circuit-draw-dht.js';
import { icInside, stripsSvg } from './circuit-draw-inside.js';
import { wirePaths } from '/core/circuit-wires.js';
import { wireHandles } from '/core/circuit-wire-edit.js';
import { wireStyleOf } from '/core/wire-style.js';
import { routeOrthogonal } from '/core/circuit-route.js';
import { shapePath } from '/core/kicad-mod.js';
import { ledColour } from '/core/circuit-kicad.js';

export const P = 20;   // pixels per grid step
const px = (v) => v * P;

/** The circuit drawn: a <g> of its breadboards, wires and parts. `levels(partId, pin)`: a pin's level while simulating;
 *  `inside`: the ICs' gates or pin names and the breadboards' strips shown (#4060); `hops`: the wires' hop-overs (#4064). */
export function drawCircuit(m, { sel = null, levels = null, leds = null, lcds = null, oleds = null, sensors = null, servos = null, buzzers = null, sonars = null, pirs = null, dhts = null, inputs = null, encoders = null, draft = null, ghost = null, inside = false, hops = false, handles = false } = {}) {
  const g = sv('g', { class: `circ-drawing${inside ? ' circ-inside' : ''}` });
  const isSel = (id) => sel?.id === id;
  for (const p of m.parts) if (partDef(p.type)?.kind === 'breadboard') g.append(breadboardSvg(p, isSel(p.id), inside));
  // (a board, #5215: under the wires too, as large as it is)
  for (const p of m.parts) if (partDef(p.type)?.kind === 'board') g.append(partSvg(p, isSel(p.id), { levels }));
  // (direct, orthogonal or curved, hopping over the wires drawn before them: core/circuit-wires.js)
  const d = wirePaths(m.wires.map((w) => ({ id: w.id, pts: w.points.map(([x, y]) => [px(x), px(y)]) })), { style: wireStyleOf(m, 'direct'), hops });
  for (const w of m.wires) g.append(wireSvg(w, isSel(w.id), d[w.id]));
  for (const p of m.parts) if (partDef(p.type) && !['breadboard', 'board'].includes(partDef(p.type).kind)) g.append(partSvg(p, isSel(p.id), { levels, leds, lcds, oleds, sensors, servos, buzzers, sonars, pirs, dhts, inputs, encoders, inside, hops }));
  // (the selected wire's handles while editing, #4930, #4931: over the parts, an end on a pin)
  const hw = handles && sel?.kind === 'wire' ? m.wires.find((w) => w.id === sel.id) : null;
  if (hw) g.append(handlesSvg(hw));
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
  // (a board's drawing turned as it is, its silkscreen too: circuit-draw-board.js)
  for (const t of [...g.querySelectorAll('text')].filter((e) => !e.closest('.circ-board-art'))) {
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
  const own = (sel) => [...g.querySelectorAll(sel)].filter((e) => !e.closest('.circ-board-art'));
  for (const e of own('rect')) add(n(e, 'x'), n(e, 'y'), n(e, 'x') + n(e, 'width'), n(e, 'y') + n(e, 'height'));
  for (const e of own('circle')) add(n(e, 'cx') - n(e, 'r'), n(e, 'cy') - n(e, 'r'), n(e, 'cx') + n(e, 'r'), n(e, 'cy') + n(e, 'r'));
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
}

function wireSvg(w, selected, d) {
  const [a, b] = [w.points[0], w.points[w.points.length - 1]];
  return sv('g', { class: `circ-wire-g${selected ? ' circ-sel' : ''}`, 'data-kind': 'wire', 'data-id': w.id },
    sv('path', { d, class: 'circ-wire-hit' }),
    sv('path', { d, class: `circ-wire circ-w-${w.color}` }),
    ...[a, b].map(([x, y]) => sv('circle', { cx: px(x), cy: px(y), r: 3.2, class: `circ-wire-end circ-w-${w.color}` })));
}

// a selected wire's handles (#4930, #4931): its ends and bends dragged, a segment's middle dragged out into a new bend;
// a group of the wire's own (its data-kind and data-id), drawn last
function handlesSvg(w) {
  return sv('g', { class: 'circ-wire-handles', 'data-kind': 'wire', 'data-id': w.id }, ...wireHandles(w).map((h) => sv(h.kind === 'bend' ? 'rect' : 'circle', {
    ...(h.kind === 'bend' ? { x: px(h.at[0]) - 3.5, y: px(h.at[1]) - 3.5, width: 7, height: 7 } : { cx: px(h.at[0]), cy: px(h.at[1]), r: h.kind === 'end' ? 4.5 : 3 }),
    class: `circ-wire-handle circ-handle-${h.kind}`, 'data-handle': `${h.kind}:${h.index}` })));
}

// A project's KiCad part drawn only (#4281), or modelled by a module of the project (#4283): its footprint's drawing to
// scale (#4315: its F.Fab layer, the body seen from above; its closed shapes the body, its filled ones and its lines the
// marks on it), else a body round its pins (a DIP's between its rows); its outline dashed when drawn only, whole when
// modelled. Its name and part number over the body when they fit, else above it; both in its tip. One that behaves as
// the library's LED, slide switch or button (#4349): its outline whole, an LED's body lit or not in its colour (lamp:
// on, off, x), a switch's lever toward A or B and a button's cap (on: its input), each a click while trying it.
function kicadBody(g, p, d, box, { lamp = null, on = false } = {}) {
  const acts = d.kind === 'input' || d.kind === 'output';
  const cls = d.kind === 'model' ? 'circ-model-body' : acts ? 'circ-kicad-body' : 'circ-drawn-body', name = `${acts ? portName(p) : p.id}  ${d.kicad.value}`;
  const how = d.kind === 'model' ? `its module ${d.module}` : acts ? `as the ${partDef(d.behaves).title} of the library` : 'drawn only, not simulated';
  g.append(sv('title', {}, `${name}: ${how}`));
  // (an LED of the library's: lit or not; drawn only, its colour as it is)
  const ledCls = d.lamps ? ` circ-led circ-led-${d.color}${lamp === 'on' ? ' lit' : lamp === 'x' ? ' unknown' : ''}` : (() => { const c = ledColour(d.kicad); return c ? ` circ-led-${c}` : ''; })();
  let body;
  if (d.look) {
    const pt = ([x, y]) => [px(p.x + x), px(p.y + y)];
    const xs = [], ys = [];
    for (const sh of d.look.shapes) for (const [x, y] of sh.k === 'circle' ? [[sh.c[0] - sh.r, sh.c[1] - sh.r], [sh.c[0] + sh.r, sh.c[1] + sh.r]] : sh.pts) { xs.push(px(p.x + x)); ys.push(px(p.y + y)); }
    body = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    // (no closed shape to be its body: a box round its drawing)
    if (!d.look.shapes.some((sh) => !sh.fill && (sh.k === 'poly' || sh.k === 'circle'))) g.append(sv('rect', { ...body, rx: 2, class: `${cls}${ledCls}` }));
    const fp = sv('g', { class: 'circ-fp' });
    for (const sh of d.look.shapes) {
      const closed = sh.k === 'poly' || sh.k === 'circle';
      fp.append(sv('path', { d: shapePath(sh, pt, P), 'stroke-width': Math.max(0.8, Math.round(sh.w * P * 10) / 10),
        class: sh.fill ? 'circ-fp-fill' : closed ? `circ-fp-body ${cls}${ledCls}` : 'circ-fp-line' }));
    }
    g.append(fp);
  } else {
    const dipRows = d.dip && box.y1 - box.y0 > P;
    body = dipRows ? { x: box.x0 - P * 0.4, y: box.y0 + P * 0.35, width: box.x1 - box.x0 + P * 0.8, height: box.y1 - box.y0 - P * 0.7 }
      : { x: box.x0 - P * 0.5, y: box.y0 - P * 0.5, width: box.x1 - box.x0 + P, height: box.y1 - box.y0 + P };
    g.append(sv('rect', { ...body, rx: 2, class: `${cls}${ledCls}` }));
  }
  if (d.inputs) {
    // (its input: a slide switch's lever between its common and A (off) or B (on); a button's cap, down while pressed)
    const at = (nm) => { const q = d.pins.find((x) => x.name === nm); return [px(p.x + q.dx), px(p.y + q.dy)]; };
    g.dataset.input = d.inputs[0].kind === 'momentary' ? 'button' : 'switch';
    if (d.contacts.length > 1) {
      const [c, e] = [at('C'), at(on ? 'B' : 'A')];
      g.append(sv('rect', { x: (c[0] + e[0]) / 2 - P * 0.35, y: (c[1] + e[1]) / 2 - P * 0.35, width: P * 0.7, height: P * 0.7, rx: 2, class: `circ-sw-knob${on ? ' on' : ''}` }));
    } else g.append(sv('circle', { cx: body.x + body.width / 2, cy: body.y + body.height / 2, r: Math.min(P * 0.55, body.width / 3, body.height / 3), class: `circ-btn-cap${on ? ' down' : ''}` }));
  }
  // (bold 10 px monospace: 6 px a character)
  const fits = name.length * 6 + 6 <= body.width && body.height >= 14;
  g.append(fits ? sv('text', { x: body.x + body.width / 2, y: body.y + body.height / 2 + 4, 'text-anchor': 'middle', class: 'circ-ic-text', 'data-no-i18n': 'true' }, name)
    : sv('text', { x: body.x + body.width / 2, y: body.y - 4, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, name));
}

const LEVEL_CLS = { 0: 'lv0', 1: 'lv1', Z: 'lvz', X: 'lvx' };
/** A part in neither the library nor the project drawn as the canvas draws a part drawn only, unturned at 0, 0, with its
 *  pins (#4346: a KiCad catalogue's part before it is imported, d its core/kicad-catalogue.js catalogueDrawing). */
export function drawnPartSvg(d) {
  const g = sv('g', { class: 'circ-part circ-drawn' });
  const xs = d.pins.map((q) => px(q.dx)), ys = d.pins.map((q) => px(q.dy));
  kicadBody(g, { id: '', x: 0, y: 0 }, d, { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
  for (const q of d.pins) g.append(sv('circle', { cx: px(q.dx), cy: px(q.dy), r: 3.4, class: 'circ-pin' }));
  return g;
}

// (turned, #4114: drawn unturned, then turned whole about its place)
function partSvg(turned, selected, { levels, leds, lcds = null, oleds = null, sensors = null, servos = null, buzzers = null, sonars = null, pirs = null, dhts = null, inputs, encoders = null, inside = false, hops = false }) {
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
    if (inside) { g.append(sv('title', {}, `${p.id}  ${chip}`)); icInside(g, d, pins, box, undefined, { hops }); }
    else g.append(sv('text', { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 + 4, 'text-anchor': 'middle', class: 'circ-ic-text', 'data-no-i18n': 'true' }, `${p.id}  ${chip}`));
  } else if (d.kicad) {
    // (a project's KiCad part not an IC, #4281, #4283, #4349)
    kicadBody(g, p, d, box, { lamp: leds?.[p.id], on: inputs ? inputs[p.id] : d.inputs?.[0].kind === 'momentary' ? false : p.on });
  } else if (d.type === 'logic-switch') {
    const on = inputs ? inputs[p.id] : p.on;
    g.dataset.input = 'switch';
    // (a slide switch, #5367: its metal frame, its slot, its black lever toward its pin while on)
    g.append(sv('rect', { x: box.x0 - P * 1.6, y: box.y0 - P * 0.6, width: P * 1.4, height: P * 1.2, rx: 2, class: 'circ-sw-body' }),
      sv('rect', { x: box.x0 - P * 1.5, y: box.y0 - P * 0.35, width: P * 1.2, height: P * 0.7, rx: 1, class: 'circ-sw-slot' }),
      sv('rect', { x: box.x0 - P * (on ? 0.95 : 1.5), y: box.y0 - P * 0.45, width: P * 0.55, height: P * 0.9, rx: 2, class: `circ-sw-knob${on ? ' on' : ''}` }),
      sv('text', { x: box.x0 - P * 0.9, y: box.y0 - P * 0.8, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, portName(p)));
  } else if (d.type === 'button') {
    const down = inputs ? inputs[p.id] : false;
    g.dataset.input = 'button';
    // (a 6 mm tactile switch, #5367: its black base over its legs, its metal plate and its four studs, its round cap)
    const bx = (box.x0 + box.x1) / 2, s = P * 1.3;
    g.append(sv('rect', { x: bx - s, y: box.y0 - s, width: 2 * s, height: 2 * s, rx: 2, class: 'circ-btn-body' }),
      sv('rect', { x: bx - s * 0.82, y: box.y0 - s * 0.82, width: 1.64 * s, height: 1.64 * s, rx: 1, class: 'circ-btn-plate' }),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) => sv('circle', { cx: bx + i * s * 0.62, cy: box.y0 + j * s * 0.62, r: P * 0.13, class: 'circ-btn-stud' })),
      sv('circle', { cx: bx, cy: box.y0, r: P * 0.6, class: `circ-btn-cap${down ? ' down' : ''}` }),
      sv('text', { x: bx, y: box.y0 - s - P * 0.3, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, portName(p)));
  } else if (d.type === 'led') {
    const st = leds?.[p.id];   // (on, off, x)
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    // (a 5 mm LED seen from its side, #5367: its two legs, the anode's bent, its rim flat on the cathode's side, its dome
    // lit in its colour)
    const r = P * 0.85, yb = cy - P * 0.9, yt = yb - P * 1.9, c = p.color || 'red';
    g.append(sv('path', { d: `M${cx - r},${yb}V${yt + r}a${r},${r} 0 0 1 ${2 * r},0V${yb}z`, class: `circ-led circ-led-${c}${st === 'on' ? ' lit' : st === 'x' ? ' unknown' : ''}` }),
      sv('path', { d: `M${box.x0},${box.y0}v${-P * 0.35}l${P * 0.3},${-P * 0.25}V${yb} M${box.x1},${box.y1}V${yb}`, class: 'circ-led-leg' }),
      sv('path', { d: `M${cx - r - P * 0.12},${yb}h${2 * r + P * 0.02}v${P * 0.22}h${-2 * r - P * 0.02}z`, class: `circ-led-rim circ-led-${c}` }),
      sv('path', { d: `M${cx - r * 0.55},${yb - P * 0.2}V${yt + r}a${r * 0.55},${r * 0.55} 0 0 1 ${r * 0.4},${-r * 0.45}`, class: 'circ-led-shine' }),
      sv('text', { x: cx, y: yt - P * 0.3, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, portName(p)));
  } else if (d.kind === 'board') drawBoard(g, p, d);
  else if (d.kind === 'lcd') drawLcd(g, p, d, lcds?.[p.id]);   // (#5330)
  else if (d.kind === 'oled') drawOled(g, p, d, oleds?.[p.id]);   // (#5336)
  else if (d.kind === 'sensor') drawLm75(g, p, box, sensors?.[p.id]);   // (#5342)
  else if (d.kind === 'servo') drawServo(g, p, servos?.[p.id]);   // (#5347)
  else if (d.kind === 'buzzer') drawBuzzer(g, p, buzzers?.[p.id]);   // (#5454)
  else if (d.kind === 'sonar') drawSonar(g, p, sonars?.[p.id]);   // (#5456)
  else if (d.kind === 'pir') drawPir(g, p, pirs?.[p.id]);   // (#5463)
  else if (d.kind === 'dht') drawDht(g, p, dhts?.[p.id]);   // (#5470)
  else if (d.type === 'keypad-4x4') drawKeypad(g, p, d, inputs?.[p.id]);   // (#5364)
  else if (d.type === 'rotary-encoder') drawEncoder(g, p, d, inputs?.[p.id], encoders?.[p.id]);   // (#5451)
  else if (d.kind === 'supply') {
    // (a bench supply's terminals, #5367: its red + and its black −, each a binding post)
    g.append(sv('rect', { x: box.x0 - P * 2.6, y: box.y0 - P * 0.5, width: P * 2.3, height: box.y1 - box.y0 + P, rx: 3, class: 'circ-supply-body' }),
      sv('circle', { cx: box.x0 - P * 0.6, cy: box.y0, r: P * 0.28, class: 'circ-post circ-post-plus' }), sv('circle', { cx: box.x0 - P * 0.6, cy: box.y1, r: P * 0.28, class: 'circ-post circ-post-minus' }),
      sv('text', { x: box.x0 - P * 1.55, y: box.y0 + 4, 'text-anchor': 'middle', class: 'circ-supply-text' }, '+5V'),
      sv('text', { x: box.x0 - P * 1.55, y: box.y1 + 4, 'text-anchor': 'middle', class: 'circ-supply-text' }, 'GND'));
  }
  // the pins (their levels while simulating), an IC's numbered on hover (their names in the tip)
  for (const q of pins) {
    const lv = levels?.(p.id, q.n);
    g.append(sv('circle', { cx: px(q.x), cy: px(q.y), r: ['ic', 'drawn', 'model'].includes(d.kind) ? 3.4 : 3, class: `circ-pin${lv ? ` ${LEVEL_CLS[lv]}` : ''}` },
      sv('title', {}, `${p.id} pin ${q.n}${String(q.n) === q.name ? '' : ` (${q.name})`}${lv ? `: ${lv}` : ''}`)));
  }
  return turnWhole(g, turned, true);
}
