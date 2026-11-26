// The circuit editor's drawing of an oscilloscope (#5383, core/circuit-scope.js): its case above its two probes' leads
// (CH1 yellow, CH2 cyan), its screen of 10 × 8 divisions with its traces from its trigger (its level a mark at the
// screen's left, its time a mark at the top), its settings under it (the time base and the scale, each between a − and a
// +; the trigger's source, edge, level and mode, each a click: data-input scope-*), its cursors (a click on the screen
// sets one, then the other: their Δt and 1/Δt, each channel's volts at them) and each channel's measurements (its
// frequency f, its period T, its duty cycle D, its Vpp, its mean Vavg). While not trying it: its settings, an empty screen. Its look:
// web/css/circuit-editor.css.
import { sv } from './dom.js';
import { DIVS, measureText } from '/core/scope.js';
import { scopeSettings } from '/core/circuit-scope.js';
import { formatSi } from '/core/circuit-analog-parts.js';

const P = 20, W = 12 * P, H = 0.8 * W, ROWS = 8, CASE_H = H + 6.8 * P;
const txt = (x, y, s, cls = 'circ-scope-text', anchor = 'start') => sv('text', { x, y, 'text-anchor': anchor, class: cls, 'data-no-i18n': 'true' }, s);
const btn = (x, y, label, input, w = P * 0.8) => sv('g', { class: 'circ-temp-btn circ-scope-btn', 'data-input': input },
  sv('rect', { x: x - w / 2, y: y - P * 0.5, width: w, height: P * 0.7, rx: 2 }), sv('text', { x, y: y + 1, 'text-anchor': 'middle', 'data-no-i18n': 'true' }, label));

/** A time said as the scope says it: 1 ms, 500 µs. */
const sec = (s) => formatSi(s, 's');

/** The body of an oscilloscope, appended to g (its pins are circuit-draw.js's); `live` while trying it: { screen, settings,
 *  cursors: [t…] (s, from the screen's start) }, else none. */
export function drawScope(g, p, live) {
  const st = live?.settings ?? scopeSettings(p), ox = p.x * P, oy = p.y * P;
  const x0 = ox - 6 * P, y0 = oy - P * 1.2 - CASE_H, sx = x0 + P * 0.6, sy = y0 + P * 1.4, bottom = y0 + CASE_H;
  // its case, its probes' leads
  g.append(sv('path', { d: `M${ox},${oy}V${bottom}M${ox + P},${oy}V${bottom}`, class: 'circ-an-lead' }),
    sv('path', { d: `M${ox},${oy - P * 0.4}v${-P * 0.6}`, class: 'circ-scope-ch1 circ-scope-lead' }), sv('path', { d: `M${ox + P},${oy - P * 0.4}v${-P * 0.6}`, class: 'circ-scope-ch2 circ-scope-lead' }),
    sv('rect', { x: x0, y: y0, width: W + P * 1.2, height: CASE_H, rx: 5, class: 'circ-scope-case' }),
    txt(x0 + P * 0.6, y0 + P * 0.9, `${p.label || p.id}  CH1 CH2`, 'circ-scope-title'));
  // its screen: its grid, its centre lines
  const scr = sv('g', { 'data-input': 'scope-screen' });
  scr.append(sv('rect', { x: sx, y: sy, width: W, height: H, class: 'circ-scope-screen' }));
  for (let k = 1; k < DIVS; k++) scr.append(sv('path', { d: `M${sx + k * W / DIVS},${sy}v${H}`, class: `circ-scope-grid${k === DIVS / 2 ? ' mid' : ''}` }));
  for (let k = 1; k < ROWS; k++) scr.append(sv('path', { d: `M${sx},${sy + k * H / ROWS}h${W}`, class: `circ-scope-grid${k === ROWS / 2 ? ' mid' : ''}` }));
  g.append(scr);
  // (0 V two divisions above the bottom: a logic's 0 to 5 V on 1 V a division fits)
  const yOf = (v) => sy + H - (2 + v / st.vdiv) * H / ROWS;
  const clip = (y) => Math.min(sy + H, Math.max(sy, y));
  const s = live?.screen;
  if (s) {
    const xOf = (t) => sx + (t - s.t0) / (s.t1 - s.t0) * W;
    s.ch.forEach((c, k) => {
      if (!c.on || !c.t.length) return;
      let d = '';
      for (let i = 0; i < c.t.length; i++) {
        const v = c.v[i];
        if (!Number.isFinite(v)) continue;
        const x = Math.max(sx, Math.min(sx + W, xOf(c.t[i]))), y = clip(yOf(v)), xn = i + 1 < c.t.length ? Math.max(sx, Math.min(sx + W, xOf(c.t[i + 1]))) : sx + W;
        d += `${d ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}H${xn.toFixed(1)}`;
      }
      if (d) g.append(sv('path', { d, class: `circ-scope-trace circ-scope-ch${k + 1}` }));
    });
    if (s.trig != null) g.append(sv('path', { d: `M${xOf(s.trig)},${sy}l-4,-6h8z`, class: `circ-scope-mark circ-scope-ch${st.source}` }));
    if (s.waiting) g.append(sv('text', { x: sx + W / 2, y: sy + H / 2, 'text-anchor': 'middle', class: 'circ-scope-wait' }, 'Waiting for the trigger'));
    // the cursors, a line each, and what they read
    (live.cursors ?? []).forEach((t, i) => g.append(sv('path', { d: `M${sx + t / (s.t1 - s.t0) * W},${sy}v${H}`, class: 'circ-scope-cursor' }), txt(sx + t / (s.t1 - s.t0) * W + 2, sy + H - 3, String.fromCharCode(65 + i), 'circ-scope-text')));
  }
  g.append(sv('path', { d: `M${sx},${clip(yOf(st.level))}l-6,-4v8z`, class: `circ-scope-mark circ-scope-ch${st.source}` }));
  // its settings: the time base and the scale, each between − and +; the trigger's source, edge, level, mode
  const by = sy + H + P * 0.9;
  g.append(btn(sx + P * 0.4, by, '−', 'scope-t-down'), txt(sx + P * 2.4, by + 1, `${sec(st.tdiv)}/div`, 'circ-scope-text', 'middle'), btn(sx + P * 4.4, by, '+', 'scope-t-up'),
    btn(sx + P * 5.6, by, '−', 'scope-v-down'), txt(sx + P * 7.5, by + 1, `${formatSi(st.vdiv, 'V')}/div`, 'circ-scope-text', 'middle'), btn(sx + P * 9.4, by, '+', 'scope-v-up'));
  const ty = by + P * 1;
  g.append(btn(sx + P * 1.1, ty, `CH${st.source}`, 'scope-source', P * 2), btn(sx + P * 2.7, ty, st.edge === 'fall' ? '↓' : '↑', 'scope-edge'),
    btn(sx + P * 4.2, ty, '−', 'scope-l-down'), txt(sx + P * 5.8, ty + 1, formatSi(st.level, 'V'), 'circ-scope-text', 'middle'), btn(sx + P * 7.4, ty, '+', 'scope-l-up'),
    btn(sx + P * 9.6, ty, st.mode.toUpperCase(), 'scope-mode', P * 2.6));
  // its readouts: the cursors', each channel's measurements
  const lines = [];
  const cur = live?.cursors ?? [];
  if (s && cur.length === 2) {
    const dt = Math.abs(cur[1] - cur[0]), at = (k, t) => { const c = s.ch[k]; let v = NaN; for (let i = 0; i < c.t.length && c.t[i] <= s.t0 + t; i++) v = c.v[i]; return v; };
    lines.push(`Δt ${sec(dt)} 1/Δt ${dt ? formatSi(1 / dt, 'Hz') : '–'}`, `A→B ${[0, 1].filter((k) => s.ch[k].on).map((k) => `CH${k + 1} ${formatSi(at(k, cur[0]), 'V')} → ${formatSi(at(k, cur[1]), 'V')}`).join(' ')}`);
  }
  if (s) s.m.forEach((m, k) => { if (m && s.ch[k].on) { const x = measureText(m); lines.push(`CH${k + 1} f ${x.frequency} T ${x.period} D ${x.duty} Vpp ${x.vpp} Vavg ${x.mean}`); } });
  lines.forEach((l, i) => g.append(txt(x0 + P * 0.6, ty + P * (1.05 + 0.6 * i), l, `circ-scope-meas${l.startsWith('CH2') ? ' circ-scope-ch2' : l.startsWith('CH1') ? ' circ-scope-ch1' : ''}`)));
}
