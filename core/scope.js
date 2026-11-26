// An oscilloscope (#5383, the analog and digital roadmap #5387): its channels' voltages against time, recorded as they
// change (a logic net's at its events, a step; an analog net's at the solver's steps, a line between them), shown from
// its trigger (a channel's edge through a level: auto, normal or single) over its time base (seconds a division, ten
// divisions), its cursors, and its measurements of a channel: its period and frequency, its duty cycle, its minimum,
// maximum and peak-to-peak, its mean, its rise and fall times (10 % to 90 %). Isomorphic module: the circuit editor's
// Try it (web/js/circuit-scope.js) and the MCP server's simulate_drawing use it.

export const DIVS = 10;                                  // (divisions across its screen)
/** Its time bases (s a division): 1-2-5 from 1 µs to 1 s. */
export const TIMEBASES = [1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2, 2e-2, 5e-2, 0.1, 0.2, 0.5, 1];
/** Its vertical scales (V a division), 8 divisions high. */
export const VSCALES = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
export const TRIGGER_MODES = ['auto', 'normal', 'single'];

/**
 * A trace: [t (s)…] and [v (V)…], each sample kept while the voltage changes (`step`: a logic net's, its value held to
 * the next sample; else a line between samples). add(t, v) appends; at(t) its voltage then; window(t0, t1) its samples
 * between them (the one before t0 first).
 */
export function createTrace({ step = false, keep = 200000 } = {}) {
  const t = [], v = [];
  return {
    step, t, v,
    add(time, volts) {
      const n = t.length;
      if (n && time < t[n - 1]) return;
      if (n && v[n - 1] === volts && (step || (n > 1 && v[n - 2] === volts))) { if (!step) t[n - 1] = time; return; }   // (flat: the last sample moved on)
      if (n && time === t[n - 1]) { v[n - 1] = volts; return; }
      t.push(time); v.push(volts);
      if (t.length > keep * 1.25) { t.splice(0, t.length - keep); v.splice(0, v.length - keep); }   // (its oldest dropped, a quarter at a time)
    },
    at(time) {
      const i = before(t, time);
      if (i < 0) return NaN;
      if (step || i === t.length - 1) return v[i];
      const f = (time - t[i]) / (t[i + 1] - t[i]);
      return v[i] + f * (v[i + 1] - v[i]);
    },
    window(t0, t1) {
      const i = Math.max(0, before(t, t0)), j = before(t, t1);
      return { t: t.slice(i, j + 2), v: v.slice(i, j + 2) };
    },
    get end() { return t.length ? t[t.length - 1] : NaN; },
    clear() { t.length = 0; v.length = 0; },
  };
}
// the index of the last sample at or before `time`, -1 none
function before(t, time) {
  let lo = 0, hi = t.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (t[m] <= time) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

/** The times a trace crosses `level` between t0 and t1, rising (+1) or falling (-1): [{ t, dir }], each interpolated
 *  (a step's at its sample). */
export function crossings(tr, level, t0 = -Infinity, t1 = Infinity) {
  const out = [];
  for (let i = 1; i < tr.t.length; i++) {
    const a = tr.v[i - 1], b = tr.v[i];
    if (!Number.isFinite(a) || !Number.isFinite(b) || (a < level) === (b < level)) continue;
    const t = tr.step ? tr.t[i] : tr.t[i - 1] + (level - a) / (b - a) * (tr.t[i] - tr.t[i - 1]);
    if (t >= t0 && t <= t1) out.push({ t, dir: b > a ? 1 : -1 });
  }
  return out;
}

/**
 * The trigger's time: the last `edge` ('rise', 'fall') of `tr` through `level` at least a screen before `now` (so that
 * the screen after it is recorded), or null (none: auto shows the last screen, normal and single wait).
 */
export function triggerTime(tr, { level, edge = 'rise' }, now, span) {
  const w = tr.window ? tr.window(now - 20 * span, now) : tr;   // (the last twenty screens searched)
  const xs = crossings({ ...w, step: tr.step }, level, -Infinity, now - span).filter((x) => x.dir === (edge === 'fall' ? -1 : 1));
  return xs.length ? xs[xs.length - 1].t : null;
}

/**
 * A channel's measurements over [t0, t1]: { min, max, vpp, mean, period, frequency, duty, rise, fall } (s, Hz, %, V;
 * null what cannot be measured: a period needs two rising crossings of the middle, a rise its 10 % and 90 %).
 */
export function measure(tr, t0, t1) {
  const w = tr.window(t0, t1);
  const sub = { t: w.t.map((x) => Math.min(t1, Math.max(t0, x))), v: w.v, step: tr.step };
  const vs = sub.v.filter(Number.isFinite);
  if (!vs.length) return { min: null, max: null, vpp: null, mean: null, period: null, frequency: null, duty: null, rise: null, fall: null };
  const min = Math.min(...vs), max = Math.max(...vs), vpp = max - min;
  // the mean: the trace's integral over the window (a step's held, a line's trapezoid) over its length
  let area = 0;
  for (let i = 0; i < sub.t.length; i++) {
    const a = Math.max(t0, sub.t[i]), b = i + 1 < sub.t.length ? sub.t[i + 1] : t1;
    if (b <= a) continue;
    const va = sub.v[i], vb = tr.step || i + 1 >= sub.t.length ? va : sub.v[i + 1];
    area += (b - a) * (va + vb) / 2;
  }
  const mean = t1 > t0 ? area / (t1 - t0) : vs[0];
  const out = { min, max, vpp, mean, period: null, frequency: null, duty: null, rise: null, fall: null };
  if (vpp < 1e-3) return out;
  const mid = min + vpp / 2, lo = min + vpp * 0.1, hi = min + vpp * 0.9;
  const tr2 = { t: w.t, v: w.v, step: tr.step };   // (the crossings at their own times, those in the window kept)
  const ups = crossings(tr2, mid, t0, t1).filter((x) => x.dir > 0).map((x) => x.t), downs = crossings(tr2, mid, t0, t1).filter((x) => x.dir < 0).map((x) => x.t);
  if (ups.length >= 2) {
    out.period = (ups[ups.length - 1] - ups[0]) / (ups.length - 1);
    out.frequency = 1 / out.period;
    const d = downs.find((x) => x > ups[0]);
    if (d != null && d < ups[1]) out.duty = (d - ups[0]) / (ups[1] - ups[0]) * 100;
  }
  // a rise: from its 10 % to its 90 % (the first one in the window); a fall the other way
  const edges = (level, dir) => crossings(tr2, level, t0, t1).filter((x) => x.dir === dir).map((x) => x.t);
  const l1 = edges(lo, 1), h1 = edges(hi, 1), h2 = edges(hi, -1), l2 = edges(lo, -1);
  const pair = (a, b) => { for (const x of a) { const y = b.find((z) => z >= x); if (y != null) return y - x; } return null; };
  out.rise = pair(l1, h1);
  out.fall = pair(h2, l2);
  return out;
}

/** A measurement said: 1.25 ms, 800 Hz, 50 %, 3.3 V. */
export function measureText(m) {
  const si = (v, u) => { if (v == null) return '–'; const a = Math.abs(v); const [p, f] = a >= 1e6 ? ['M', 1e6] : a >= 1e3 ? ['k', 1e3] : a >= 1 || a === 0 ? ['', 1] : a >= 1e-3 ? ['m', 1e-3] : a >= 1e-6 ? ['µ', 1e-6] : ['n', 1e-9]; return `${Number((v / f).toPrecision(3))} ${p}${u}`; };
  return { vpp: si(m.vpp, 'V'), min: si(m.min, 'V'), max: si(m.max, 'V'), mean: si(m.mean, 'V'), period: si(m.period, 's'), frequency: si(m.frequency, 'Hz'),
    duty: m.duty == null ? '–' : `${Number(m.duty.toPrecision(3))} %`, rise: si(m.rise, 's'), fall: si(m.fall, 's') };
}
