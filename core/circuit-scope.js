// A circuit's oscilloscope (#5383, the analog and digital roadmap #5387): a part with two probes, CH1 and CH2, each the
// voltage of the net its lead touches against GND (a logic net's at its levels' volts, an analog net's solved:
// core/circuit-analog.js), recorded while trying the circuit (core/scope.js's traces) and shown on its screen from its
// trigger over its time base, its measurements under it. Its settings saved in its Properties: its time base (`tdiv`, s a
// division), its scale (`vdiv`, V a division), its trigger's source (`source`, 1 or 2), level (`level`, V), edge (`edge`,
// rise or fall) and mode (`mode`: auto, normal, single). Each trace a step's (its voltage held to its next sample: a logic
// net's at its events, an analog one's at the solver's steps of 50 mV at most). Isomorphic module.
import { createTrace, triggerTime, measure, TIMEBASES, VSCALES, TRIGGER_MODES, DIVS } from './scope.js';

const pin = (n, name, dx, dy) => ({ n, name, dir: 'analog', dx, dy });
// (its case above its leads, as web/js/circuit-draw-scope.js draws it: `size`, the editor's Fit)
export const OSCILLOSCOPE = { type: 'oscilloscope', title: 'Oscilloscope', kind: 'meter', prefix: 'OSC', pins: [pin(1, 'CH1', 0, 0), pin(2, 'CH2', 1, 0)], size: { x0: -6, y0: -17.6, x1: 7.2, y1: 0 } };
const SCOPE_DEFAULTS = { tdiv: 1e-3, vdiv: 1, source: 1, level: 1.5, edge: 'rise', mode: 'auto' };
const LEVEL_RANGE = { min: -20, max: 20 };

/** A scope's settings normalized: each in its range (a time base and a scale the nearest of theirs), else its default. */
export function scopeSettings(p = {}) {
  const near = (list, v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? list.reduce((a, b) => (Math.abs(Math.log(b / v)) < Math.abs(Math.log(a / v)) ? b : a)) : null);
  const lv = Number(p.level);
  return {
    tdiv: near(TIMEBASES, p.tdiv) ?? SCOPE_DEFAULTS.tdiv, vdiv: near(VSCALES, p.vdiv) ?? SCOPE_DEFAULTS.vdiv,
    source: Number(p.source) === 2 ? 2 : 1, level: Number.isFinite(lv) ? Math.min(LEVEL_RANGE.max, Math.max(LEVEL_RANGE.min, Math.round(lv * 100) / 100)) : SCOPE_DEFAULTS.level,
    edge: p.edge === 'fall' ? 'fall' : 'rise', mode: TRIGGER_MODES.includes(p.mode) ? p.mode : SCOPE_DEFAULTS.mode,
  };
}
/** A setting's refusal (edit_circuit's set, the Properties), or null. */
export function scopeSettingError(k, v) {
  if (k === 'tdiv' && !TIMEBASES.includes(Number(v))) return `tdiv: a time base of ${TIMEBASES.join(', ')} s a division`;
  if (k === 'vdiv' && !VSCALES.includes(Number(v))) return `vdiv: a scale of ${VSCALES.join(', ')} V a division`;
  if (k === 'source' && ![1, 2].includes(Number(v))) return 'source: the trigger\'s channel, 1 or 2';
  if (k === 'level' && !(Number.isFinite(Number(v)) && Number(v) >= LEVEL_RANGE.min && Number(v) <= LEVEL_RANGE.max)) return `level: the trigger's level from ${LEVEL_RANGE.min} to ${LEVEL_RANGE.max} V`;
  if (k === 'edge' && !['rise', 'fall'].includes(v)) return 'edge: rise or fall';
  if (k === 'mode' && !TRIGGER_MODES.includes(v)) return `mode: ${TRIGGER_MODES.join(', ')}`;
  return null;
}
export const SCOPE_PROPS = ['tdiv', 'vdiv', 'source', 'level', 'edge', 'mode'];

/**
 * The circuit's scopes recorded: { scopes: [{ id, ch: [trace, trace] }], sample(sim) (each probe's voltage now, called
 * after each of the simulation's updates: createCircuitSim's onUpdate), screen(id, settings, now) }.
 */
export function createScopeRecorder(m) {
  const scopes = m.parts.filter((p) => p.type === 'oscilloscope').map((p) => ({ id: p.id, part: p, ch: [createTrace({ step: true }), createTrace({ step: true })], frozen: null }));
  const has = (sim, id, n) => { const net = sim.nets.pinNet.get(`${id}.${n}`), x = sim.nets.nets[net]; return x && (x.pins.length > 1 || x.wires.length) ? net : null; };
  let nets = null;
  return {
    scopes,
    sample(sim, ns) {
      nets ??= scopes.map((s) => [has(sim, s.id, 1), has(sim, s.id, 2)]);
      scopes.forEach((s, i) => s.ch.forEach((tr, k) => { const net = nets[i][k]; if (net != null) tr.add(ns * 1e-9, sim.volts(net)); }));
    },
    /**
     * A scope's screen at `now` (s): { t0, t1 (its window), trig (the trigger's time, or null), waiting (normal and single
     * with no trigger yet), ch: [{ t, v, on (its lead joined) }], m: [its measurements over the window] }.
     */
    screen(id, settings, now) {
      const s = scopes.find((x) => x.id === id), st = scopeSettings(settings), span = st.tdiv * DIVS;
      if (s.frozen && st.mode === 'single') return s.frozen;
      const src = s.ch[st.source - 1];
      // (the trigger at the screen's left edge, a tenth in: its last edge a screen before now)
      const trig = triggerTime(src, st, now, span * 0.9);
      let t0 = trig != null ? trig - span * 0.1 : now - span;
      const waiting = trig == null && st.mode !== 'auto';
      if (waiting) t0 = now - span;
      const t1 = t0 + span;
      const out = { t0, t1, trig, waiting, ch: s.ch.map((tr, k) => ({ ...(waiting ? { t: [], v: [] } : tr.window(t0, t1)), on: nets?.[scopes.indexOf(s)]?.[k] != null })),
        m: s.ch.map((tr) => (waiting || !tr.t.length ? null : measure(tr, t0, t1))) };
      if (st.mode === 'single' && trig != null) s.frozen = out;
      return out;
    },
    /** a single sweep armed again */
    rearm(id) { const s = scopes.find((x) => x.id === id); if (s) s.frozen = null; },
  };
}
