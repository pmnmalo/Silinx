// The circuit editor's drawing of the bench's instruments and Pmods of #5384 (core/circuit-analog-devices.js,
// core/circuit-pmod.js): a function generator (its case over its OUT and COM terminals, its wave, its frequency and
// levels, its duty cycle between a − and a +: a click while trying it, data-input sense-down / sense-up) and the Pmod DA2
// and AD1 (a Digilent board, its J1 and J2, its chips; while trying it, each DAC's code and volts, each ADC's last code).
// Its look: web/css/circuit-editor.css.
import { sv } from './dom.js';
import { formatSi } from '/core/circuit-analog-parts.js';
import { generatorOf } from '/core/circuit-analog-devices.js';

const P = 20;
const txt = (x, y, s, cls = 'circ-bench-text', anchor = 'middle') => sv('text', { x, y, 'text-anchor': anchor, class: cls, 'data-no-i18n': 'true' }, s);
const WAVE = { square: (x, y, w, d) => `M${x},${y + 6}h${w * d}v-12h${w * (1 - d)}v12`, sine: (x, y, w) => `M${x},${y}q${w / 4},-14 ${w / 2},0t${w / 2},0`, triangle: (x, y, w) => `M${x},${y + 6}l${w / 2},-12l${w / 2},12` };

/** The body of a generator or a Pmod, appended to g; false when the part is neither. `live` while trying it:
 *  { sensed(id, prop), pmods (sim.pmods()) }. */
export function drawBench(g, p, box, live) {
  const ox = p.x * P, oy = p.y * P;
  if (p.type === 'function-generator') {
    const s = generatorOf(p), duty = live ? live.sensed(p.id, 'duty') : s.duty;
    g.append(sv('path', { d: `M${ox},${oy}V${oy - P * 0.6}M${ox + P},${oy}V${oy - P * 0.6}`, class: 'circ-an-lead' }),
      sv('rect', { x: ox - 3.6 * P, y: oy - 3.4 * P, width: 8.2 * P, height: 2.8 * P, rx: 4, class: 'circ-bench-case' }),
      sv('circle', { cx: ox, cy: oy - P * 0.9, r: P * 0.22, class: 'circ-post circ-post-plus' }), sv('circle', { cx: ox + P, cy: oy - P * 0.9, r: P * 0.22, class: 'circ-post circ-post-minus' }),
      sv('path', { d: WAVE[s.wave](ox - 3.2 * P, oy - 2.6 * P, 1.6 * P, duty / 100), class: 'circ-bench-wave' }),
      txt(ox - 0.4 * P, oy - 2.4 * P, `${formatSi(s.hz, 'Hz')}  ${formatSi(s.vlow, 'V')}…${formatSi(s.vhigh, 'V')}`, 'circ-bench-text', 'start'),
      txt(ox + 0.5 * P, oy - 3.7 * P, p.id, 'circ-label'));
    if (s.wave === 'square') {
      const btn = (dx, label, input) => sv('g', { class: 'circ-temp-btn circ-bench-btn', 'data-input': input, 'data-lever': 0 },
        sv('rect', { x: ox + dx - P * 0.35, y: oy - P * 1.75, width: P * 0.7, height: P * 0.6, rx: 2 }), sv('text', { x: ox + dx, y: oy - P * 1.3, 'text-anchor': 'middle', 'data-no-i18n': 'true' }, label));
      g.append(btn(-2.8 * P, '−', 'sense-down'), txt(ox - 1.6 * P, oy - 1.3 * P, `D ${duty} %`, 'circ-an-val'), btn(-0.4 * P, '+', 'sense-up'));
    }
    return true;
  }
  if (p.type === 'pmod-da2' || p.type === 'pmod-ad1') {
    const da = p.type === 'pmod-da2', st = live?.pmods?.[p.id];
    g.append(sv('rect', { x: ox - 0.6 * P, y: oy - 5.6 * P, width: 6.2 * P, height: 6.2 * P, rx: 3, class: 'circ-pmod-board' }),
      sv('rect', { x: ox - 0.45 * P, y: oy - 0.45 * P, width: 5.9 * P, height: 0.9 * P, rx: 1, class: 'circ-pmod-header' }),
      sv('rect', { x: ox - 0.45 * P, y: oy - 5.45 * P, width: 2.9 * P, height: 0.9 * P, rx: 1, class: 'circ-pmod-header' }),
      txt(ox + 2.5 * P, oy - 3.2 * P, da ? 'PmodDA2' : 'PmodAD1', 'circ-pmod-name'),
      txt(ox + 2.5 * P, oy - 2.4 * P, da ? '2 × DAC121S101' : '2 × AD7476A', 'circ-pmod-chip'), txt(ox + 2.5 * P, oy - 6, p.id, 'circ-label'));
    if (st) st.forEach((c, k) => g.append(txt(ox + 2.5 * P, oy - (1.6 - 0.55 * k) * P, `${da ? 'DAC' : 'ADC'}${'AB'[k]} ${c.code}${da ? ` ${formatSi(3.3 * c.code / 4096, 'V')}` : ''}`, 'circ-pmod-chip')));
    return true;
  }
  return false;
}
