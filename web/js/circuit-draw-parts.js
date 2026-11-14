// The circuit editor's drawing of phase 2's parts (#3899, web/js/circuit-draw.js draws the rest): a slide switch (its
// lever toward A or B), a DIP switch (its levers, each a click while trying it: data-input="dip", data-lever), a clock
// source (its frequency, its level), a pull-up or -down, a 7-segment display (its segments lit) and an LED bar (its
// lights). `box` is the part's pins' bounding box (pixels), `on` its inputs (a level, or a DIP switch's list), `lamps`
// its lamps' states (on, off, x).
import { sv } from './dom.js';
import { portName } from '/core/circuit.js';

const P = 20;
const label = (x, y, text) => sv('text', { x, y, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, text);

/** The body of a phase 2 part, appended to g; false when the part is not one of them. */
export function drawPart2(g, p, box, { on, lamps }) {
  const w = box.x1 - box.x0, cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  switch (p.type) {
    case 'spdt': {
      g.dataset.input = 'switch';
      g.append(sv('rect', { x: box.x0 - P * 0.4, y: box.y0 - P * 1.3, width: w + P * 0.8, height: P * 1, rx: 3, class: 'circ-sw-body' }),
        sv('rect', { x: (on ? box.x1 - P * 0.6 : box.x0 - P * 0.2), y: box.y0 - P * 1.2, width: P * 0.8, height: P * 0.8, rx: 2, class: `circ-sw-knob${on ? ' on' : ''}` }),
        label(cx, box.y0 - P * 1.5, portName(p)));
      return true;
    }
    case 'dip-4': case 'dip-8': {
      const n = Array.isArray(on) ? on.length : 0;
      // (its body between its two rows of pins; lever k over pin k, toward the upper row while on)
      g.append(sv('rect', { x: box.x0 - P * 0.4, y: box.y0 + P * 0.4, width: w + P * 0.8, height: P * 2.2, rx: 2, class: 'circ-dip-body' }));
      for (let k = 0; k < n; k++) {
        const x = box.x0 + k * P;
        g.append(sv('rect', { x: x - P * 0.3, y: box.y0 + P * 0.6, width: P * 0.6, height: P * 1.8, rx: 1, class: 'circ-dip-slot', 'data-input': 'dip', 'data-lever': String(k) }),
          sv('rect', { x: x - P * 0.25, y: on[k] ? box.y0 + P * 0.65 : box.y0 + P * 1.6, width: P * 0.5, height: P * 0.75, rx: 1, class: `circ-dip-lever${on[k] ? ' on' : ''}`, 'data-input': 'dip', 'data-lever': String(k) }));
      }
      g.append(label(cx, box.y0 - P * 0.5, portName(p)));
      return true;
    }
    case 'clock': {
      g.append(sv('rect', { x: box.x0 - P * 2.6, y: box.y0 - P * 0.7, width: P * 2.3, height: P * 1.4, rx: 3, class: 'circ-supply-body' }),
        sv('path', { d: `M${box.x0 - P * 2.3},${box.y0 + 4}h5v-8h7v8h7v-8h5`, class: `circ-clock-wave${on ? ' on' : ''}` }),
        label(box.x0 - P * 1.45, box.y0 - P * 0.95, `${portName(p)} ${p.hz ?? 1} Hz`));
      return true;
    }
    case 'pull-up': case 'pull-down': {
      const up = p.type === 'pull-up';
      g.append(sv('rect', { x: box.x0 - P * 0.35, y: up ? box.y0 - P * 1.4 : box.y0 + P * 0.3, width: P * 0.7, height: P * 1.1, rx: 2, class: 'circ-pull-body' }),
        sv('text', { x: box.x0, y: up ? box.y0 - P * 0.65 : box.y0 + P * 1.05, 'text-anchor': 'middle', class: 'circ-pull-text' }, up ? '↑' : '↓'));
      return true;
    }
    case 'seg7-cc': case 'seg7-ca': {
      g.append(sv('rect', { x: box.x0 - P * 0.4, y: box.y0 + P * 0.4, width: w + P * 0.8, height: box.y1 - box.y0 - P * 0.8, rx: 3, class: 'circ-seg-body' }));
      const s = Array.isArray(lamps) ? lamps : [];
      const x0 = cx - P * 0.8, x1 = cx + P * 0.6, y0 = box.y0 + P * 1.1, ym = cy, y1 = box.y1 - P * 1.1, t = 3;
      // a … g, dp: their bars (a slant of a real display's left out)
      const bars = [[x0, y0, x1, y0], [x1, y0, x1, ym], [x1, ym, x1, y1], [x0, y1, x1, y1], [x0, ym, x0, y1], [x0, y0, x0, ym], [x0, ym, x1, ym]];
      bars.forEach(([a, b, c, d], i) => g.append(sv('line', { x1: a, y1: b, x2: c, y2: d, 'stroke-width': t * 2, class: `circ-seg circ-led-${p.color || 'red'}${s[i] === 'on' ? ' lit' : s[i] === 'x' ? ' unknown' : ''}`, 'data-seg': 'abcdefg'[i] })));
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
    default: return false;
  }
}
