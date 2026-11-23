// The circuit editor's drawing of phase 2's parts (#3899, web/js/circuit-draw.js draws the rest): a slide switch (its
// lever toward A or B), a DIP switch (its levers, each a click while trying it: data-input="dip", data-lever), a clock
// source (its frequency, its level), a pull-up or -down, a 7-segment display (its segments lit) and an LED bar (its
// lights). `box` is the part's pins' bounding box (pixels), `on` its inputs (a level, or a DIP switch's list), `lamps`
// its lamps' states (on, off, x).
import { sv } from './dom.js';
import { portName } from '/core/circuit.js';

const P = 20;
// a display's segment from a to b, t thick: a long hexagon, its ends pointed
function segment([ax, ay], [bx, by], t) {
  const l = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / l, uy = (by - ay) / l, nx = -uy * t, ny = ux * t;
  const g = t * 0.9, A = [ax + ux * g, ay + uy * g], B = [bx - ux * g, by - uy * g];
  const pts = [[A[0] - ux * t, A[1] - uy * t], [A[0] + nx, A[1] + ny], [B[0] + nx, B[1] + ny], [B[0] + ux * t, B[1] + uy * t], [B[0] - nx, B[1] - ny], [A[0] - nx, A[1] - ny]];
  return `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}z`;
}
const label = (x, y, text) => sv('text', { x, y, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, text);

/** The body of a phase 2 part, appended to g; false when the part is not one of them. */
export function drawPart2(g, p, box, { on, lamps, level }) {
  const w = box.x1 - box.x0, cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  switch (p.type) {
    case 'spdt': {
      g.dataset.input = 'switch';
      // (#5367: its metal frame, its slot, its black lever)
      g.append(sv('rect', { x: box.x0 - P * 0.4, y: box.y0 - P * 1.3, width: w + P * 0.8, height: P * 1, rx: 2, class: 'circ-sw-body' }),
        sv('rect', { x: box.x0 - P * 0.25, y: box.y0 - P * 1.1, width: w + P * 0.5, height: P * 0.6, rx: 1, class: 'circ-sw-slot' }),
        sv('rect', { x: (on ? box.x1 - P * 0.6 : box.x0 - P * 0.2), y: box.y0 - P * 1.2, width: P * 0.8, height: P * 0.8, rx: 2, class: `circ-sw-knob${on ? ' on' : ''}` }),
        label(cx, box.y0 - P * 1.5, portName(p)));
      return true;
    }
    case 'dip-4': case 'dip-8': {
      const n = Array.isArray(on) ? on.length : 0;
      // (its red body between its two rows of pins, ON beside it, at the levers' on end; lever k, white in its dark slot, over pin k, toward
      // the upper row while on, its number under it; #5367)
      g.append(sv('rect', { x: box.x0 - P * 0.4, y: box.y0 + P * 0.4, width: w + P * 0.8, height: P * 2.2, rx: 2, class: 'circ-dip-body' }));
      for (let k = 0; k < n; k++) {
        const x = box.x0 + k * P;
        g.append(sv('rect', { x: x - P * 0.3, y: box.y0 + P * 0.6, width: P * 0.6, height: P * 1.8, rx: 1, class: 'circ-dip-slot', 'data-input': 'dip', 'data-lever': String(k) }),
          sv('rect', { x: x - P * 0.25, y: on[k] ? box.y0 + P * 0.65 : box.y0 + P * 1.6, width: P * 0.5, height: P * 0.75, rx: 1, class: `circ-dip-lever${on[k] ? ' on' : ''}`, 'data-input': 'dip', 'data-lever': String(k) }),
          sv('text', { x, y: box.y0 + P * 2.55, 'text-anchor': 'middle', class: 'circ-dip-num', 'data-no-i18n': 'true' }, String(k + 1)));
      }
      g.append(sv('text', { x: box.x0 - P * 0.5, y: box.y0 + P * 1.1, 'text-anchor': 'end', class: 'circ-dip-on', 'data-no-i18n': 'true' }, 'ON'));
      g.append(label(cx, box.y0 - P * 0.5, portName(p)));
      return true;
    }
    case 'clock': {
      // (a crystal oscillator's metal can, #5367)
      g.append(sv('rect', { x: box.x0 - P * 2.6, y: box.y0 - P * 0.7, width: P * 2.3, height: P * 1.4, rx: 5, class: 'circ-supply-body circ-osc-body' }),
        sv('path', { d: `M${box.x0 - P * 2.3},${box.y0 + 4}h5v-8h7v8h7v-8h5`, class: `circ-clock-wave${on ? ' on' : ''}` }),
        label(box.x0 - P * 1.45, box.y0 - P * 0.95, `${portName(p)} ${p.hz ?? 1} Hz`));
      return true;
    }
    case 'pull-up': case 'pull-down': {
      const up = p.type === 'pull-up';
      // (a resistor, #5367: its lead, its beige body, its bands 10 kΩ's, brown, black, orange, gold; its arrow beside it)
      const y0 = up ? box.y0 - P * 1.6 : box.y0 + P * 0.3, bands = ['brown', 'black', 'orange', 'gold'];
      g.append(sv('rect', { x: box.x0 - P * 0.3, y: y0, width: P * 0.6, height: P * 1.3, rx: P * 0.25, class: 'circ-pull-body' }),
        sv('line', { x1: box.x0, y1: up ? y0 + P * 1.3 : box.y0, x2: box.x0, y2: up ? box.y0 : y0, class: 'circ-pull-lead' }),
        ...bands.map((b, i) => sv('rect', { x: box.x0 - P * 0.3, y: y0 + P * (0.2 + i * 0.24 + (i === 3 ? 0.1 : 0)), width: P * 0.6, height: P * 0.12, class: `circ-band circ-band-${b}` })),
        sv('text', { x: box.x0 + P * 0.6, y: y0 + P * 0.8, 'text-anchor': 'start', class: 'circ-pull-text' }, up ? '↑' : '↓'));
      return true;
    }
    case 'seg7-cc': case 'seg7-ca': {
      g.append(sv('rect', { x: box.x0 - P * 0.4, y: box.y0 + P * 0.4, width: w + P * 0.8, height: box.y1 - box.y0 - P * 0.8, rx: 3, class: 'circ-seg-body' }));
      const s = Array.isArray(lamps) ? lamps : [];
      const x0 = cx - P * 0.8, x1 = cx + P * 0.6, y0 = box.y0 + P * 1.1, ym = cy, y1 = box.y1 - P * 1.1, t = 3;
      // a … g, dp: their segments, each a long hexagon, slanted as a real display's (#5367)
      const bars = [[x0, y0, x1, y0], [x1, y0, x1, ym], [x1, ym, x1, y1], [x0, y1, x1, y1], [x0, ym, x0, y1], [x0, y0, x0, ym], [x0, ym, x1, ym]];
      const slant = (x, y) => [x + (cy - y) * 0.12, y];
      bars.forEach(([a, b, c, d], i) => g.append(sv('path', { d: segment(slant(a, b), slant(c, d), t), class: `circ-seg circ-led-${p.color || 'red'}${s[i] === 'on' ? ' lit' : s[i] === 'x' ? ' unknown' : ''}`, 'data-seg': 'abcdefg'[i] })));
      g.append(sv('circle', { cx: x1 + P * 0.45, cy: y1, r: t, class: `circ-seg circ-led-${p.color || 'red'}${s[7] === 'on' ? ' lit' : ''}`, 'data-seg': 'dp' }), label(cx, box.y0 - P * 0.5, portName(p)));
      return true;
    }
    case 'led-bar-10': {
      g.append(sv('rect', { x: box.x0 - P * 0.4, y: box.y0 + P * 0.35, width: w + P * 0.8, height: box.y1 - box.y0 - P * 0.7, rx: 2, class: 'circ-seg-body' }));
      const s = Array.isArray(lamps) ? lamps : [];
      for (let k = 0; k < 10; k++) g.append(sv('rect', { x: box.x0 + k * P - P * 0.3, y: box.y0 + P * 0.6, width: P * 0.6, height: box.y1 - box.y0 - P * 1.2, rx: 1, class: `circ-bar circ-led-${p.color || 'red'}${s[k] === 'on' ? ' lit' : s[k] === 'x' ? ' unknown' : ''}` }));
      g.append(label(cx, box.y0 - P * 0.5, portName(p)));
      return true;
    }
    case 'probe': {
      // (a logic probe: its pen, its tip's level H / L / open / X while trying it, #3900)
      const txt = { 1: 'H', 0: 'L', Z: '–', X: 'X' }[level] ?? '';
      g.append(sv('rect', { x: box.x0 - P * 0.35, y: box.y0 - P * 2.6, width: P * 0.7, height: P * 2.2, rx: 3, class: `circ-probe-body${level ? ` lv${{ 1: '1', 0: '0', Z: 'z', X: 'x' }[level]}` : ''}` }),
        sv('text', { x: box.x0, y: box.y0 - P * 1.25, 'text-anchor': 'middle', class: 'circ-probe-text', 'data-no-i18n': 'true' }, txt),
        label(box.x0, box.y0 - P * 2.85, p.label || p.id));
      return true;
    }
    default: return false;
  }
}
