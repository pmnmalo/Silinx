// The circuit editor's drawing of the analog parts (#5382, core/circuit-analog-parts.js): a resistor (its body and its
// colour bands, its value's), a capacitor (a ceramic disc, an electrolytic's can from 1 µF), a potentiometer (a trimmer,
// its slot turned to its position), a light-dependent resistor, a thermistor, a diode (its band on the cathode's side)
// and a voltmeter (its reading, to the millivolt). What a part senses (a potentiometer's position, the light, the temperature) between a
// − and a + (a click while trying it: data-input sense-down / sense-up), its saved value while not trying it. Its look:
// web/css/circuit-editor.css.
import { sv } from './dom.js';
import { partDef } from '/core/circuit-parts.js';
import { formatSi } from '/core/circuit-analog-parts.js';

const P = 20;
const BAND = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];
/** A resistance's four colour bands: its two digits, its multiplier, gold (5 %). */
export function resistorBands(ohms) {
  const e = Math.floor(Math.log10(Math.max(ohms, 1))) - 1, d = Math.round(ohms / 10 ** e);
  const [a, b, x] = d >= 100 ? [1, 0, e + 1] : [Math.floor(d / 10), d % 10, e];
  return [BAND[a], BAND[b], x >= 0 ? BAND[x] : x === -1 ? 'gold' : 'silver', 'gold'];
}
const label = (x, y, text) => sv('text', { x, y, 'text-anchor': 'middle', class: 'circ-label', 'data-no-i18n': 'true' }, text);
const shown = (x, v) => `${Number(v).toFixed(String(x.step).split('.')[1]?.length ?? 0)} ${x.unit}`;

/** The body of an analog part, appended to g; false when the part is not one. `live` while trying it: { volts (a
 *  voltmeter's reading), sensed(id, prop) }. */
export function drawAnalog(g, p, box, live) {
  const d = partDef(p.type), cx = (box.x0 + box.x1) / 2, y = box.y0;
  const name = (v) => label(cx, y - P * 0.75, `${p.id}${v ? `  ${v}` : ''}`);
  switch (p.type) {
    case 'resistor': {
      g.append(sv('path', { d: `M${box.x0},${y}H${box.x1}`, class: 'circ-an-lead' }),
        sv('rect', { x: cx - P * 1.1, y: y - P * 0.32, width: P * 2.2, height: P * 0.64, rx: P * 0.28, class: 'circ-res-body' }),
        ...resistorBands(p.ohms ?? 1000).map((b, i) => sv('rect', { x: cx - P * 0.75 + i * P * 0.38 + (i === 3 ? P * 0.2 : 0), y: y - P * 0.32, width: P * 0.16, height: P * 0.64, class: `circ-band circ-band-${b}` })),
        name(formatSi(p.ohms ?? 1000, 'Ω')));
      return true;
    }
    case 'capacitor': {
      const f = p.farads ?? 1e-6, can = f >= 1e-6;
      g.append(sv('path', { d: `M${box.x0},${y}V${y - P * 0.6}M${box.x1},${y}V${y - P * 0.6}`, class: 'circ-an-lead' }),
        can ? sv('rect', { x: cx - P * 0.55, y: y - P * 1.9, width: P * 1.1, height: P * 1.4, rx: 3, class: 'circ-cap-can' })
          : sv('ellipse', { cx, cy: y - P * 1.05, rx: P * 0.6, ry: P * 0.5, class: 'circ-cap-disc' }),
        label(cx, y - P * (can ? 2.15 : 1.75), `${p.id}  ${formatSi(f, 'F')}`));
      return true;
    }
    case 'diode': {
      g.append(sv('path', { d: `M${box.x0},${y}H${box.x1}`, class: 'circ-an-lead' }),
        sv('rect', { x: cx - P * 0.8, y: y - P * 0.28, width: P * 1.6, height: P * 0.56, rx: 3, class: 'circ-diode-body' }),
        sv('rect', { x: cx + P * 0.45, y: y - P * 0.28, width: P * 0.18, height: P * 0.56, class: 'circ-diode-band' }), name(''));
      return true;
    }
    case 'voltmeter': {
      const v = live?.volts?.[p.id];
      g.append(sv('path', { d: `M${box.x0},${y}V${y - P * 0.9}M${box.x1},${y}V${y - P * 0.9}`, class: 'circ-an-lead' }),
        sv('circle', { cx: box.x0, cy: y - P * 0.9, r: P * 0.16, class: 'circ-post circ-post-plus' }), sv('circle', { cx: box.x1, cy: y - P * 0.9, r: P * 0.16, class: 'circ-post circ-post-minus' }),
        sv('rect', { x: cx - P * 1.5, y: y - P * 2.6, width: P * 3, height: P * 1.5, rx: 3, class: 'circ-meter-body' }),
        sv('text', { x: cx, y: y - P * 1.6, 'text-anchor': 'middle', class: 'circ-meter-text', 'data-no-i18n': 'true' }, live ? (Number.isFinite(v) ? formatSi(Math.round(v * 1000) / 1000, 'V') : '– V') : 'V'),
        label(cx, y - P * 2.85, p.id));
      return true;
    }
    case 'potentiometer': case 'ldr': case 'thermistor': {
      const pot = p.type === 'potentiometer', x = d.sense[0], v = live ? live.sensed(p.id, x.prop) : p[x.prop] ?? x.default;
      const top = y - P * 1.8;
      g.append(sv('path', { d: d.pins.map((q, k) => `M${box.x0 + k * P},${y}V${top + P * 0.9}`).join(''), class: 'circ-an-lead' }));
      if (pot) {
        // (a trimmer: its blue body, its slot turned from −135° (0 %) to 135° (100 %))
        const a = (-135 + 2.7 * v) * Math.PI / 180, r = P * 0.55, ky = top + P * 0.3;
        g.append(sv('rect', { x: cx - P * 0.85, y: ky - P * 0.85, width: P * 1.7, height: P * 1.7, rx: 2, class: 'circ-pot-body' }),
          sv('circle', { cx, cy: ky, r, class: 'circ-pot-knob' }),
          sv('path', { d: `M${cx - Math.sin(a) * r * 0.9},${ky + Math.cos(a) * r * 0.9}L${cx + Math.sin(a) * r * 0.9},${ky - Math.cos(a) * r * 0.9}`, class: 'circ-pot-slot' }));
      } else if (p.type === 'ldr') {
        g.append(sv('circle', { cx, cy: top + P * 0.3, r: P * 0.7, class: 'circ-ldr-body' }),
          sv('path', { d: `M${cx - P * 0.45},${top + P * 0.05}h${P * 0.9}l${-P * 0.9},${P * 0.25}h${P * 0.9}`, class: 'circ-ldr-track' }));
      } else g.append(sv('ellipse', { cx, cy: top + P * 0.4, rx: P * 0.42, ry: P * 0.55, class: 'circ-ntc-body' }));
      // (what it senses between its − and +)
      const by = top - P * 0.9;
      const btn = (dx, t, input) => sv('g', { class: 'circ-temp-btn circ-an-btn', 'data-input': input, 'data-lever': 0 },
        sv('rect', { x: cx + dx - P * 0.35, y: by - P * 0.5, width: P * 0.7, height: P * 0.7, rx: 2 }), sv('text', { x: cx + dx, y: by + 1, 'text-anchor': 'middle', 'data-no-i18n': 'true' }, t));
      g.append(btn(-P * 1.9, '−', 'sense-down'), sv('text', { x: cx, y: by + 1, 'text-anchor': 'middle', class: 'circ-an-val', 'data-prop': x.prop, 'data-no-i18n': 'true' }, shown(x, v)), btn(P * 1.9, '+', 'sense-up'),
        label(cx, by - P * 0.75, `${p.id}${pot ? `  ${formatSi(p.ohms ?? 10e3, 'Ω')}` : ''}`));
      return true;
    }
    default: return false;
  }
}
