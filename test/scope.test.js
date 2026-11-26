// The oscilloscope (#5383, core/scope.js, core/circuit-scope.js): its traces (held steps, lines), their crossings, its
// trigger, its measurements against closed forms (a square wave's period, frequency, duty cycle, Vpp and mean; an RC's
// 10–90 % rise and fall, τ ln 9; a sine's Vpp and mean); a circuit's scope recorded while it runs: a 74LS14's RC
// oscillator's frequency and duty cycle against its exponentials, its trigger's modes (auto, normal waiting, single
// frozen); its settings normalized and refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrace, crossings, triggerTime, measure, measureText } from '../core/scope.js';
import { createScopeRecorder, scopeSettings, scopeSettingError } from '../core/circuit-scope.js';
import { normalizeCircuit } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { partPins } from '../core/circuit-parts.js';
import { setPartProps } from '../core/circuit-edit.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);

test('a square wave: its period, frequency, duty cycle, Vpp, mean; its crossings and trigger', () => {
  // 1 kHz, 25 % high, 0 / 3.3 V, from t = 0.1 ms
  const tr = createTrace({ step: true });
  for (let k = 0; k < 20; k++) { const t = 1e-4 + k * 1e-3; tr.add(t, 3.3); tr.add(t + 0.25e-3, 0); }
  const m = measure(tr, 2e-3, 12e-3);
  near(m.period, 1e-3, 1e-12, 'period'); near(m.frequency, 1000, 1e-6, 'frequency'); near(m.duty, 25, 1e-9, 'duty');
  near(m.vpp, 3.3, 1e-12, 'Vpp'); near(m.mean, 3.3 * 0.25, 1e-9, 'mean'); assert.deepEqual([m.min, m.max], [0, 3.3]);
  assert.equal(m.rise, 0, 'a step\'s rise: none');
  assert.deepEqual(crossings(tr, 1.65, 0, 2.2e-3), [{ t: 3.5e-4, dir: -1 }, { t: 1.1e-3, dir: 1 }, { t: 1.35e-3, dir: -1 }, { t: 2.1e-3, dir: 1 }]);
  // the trigger: the last rising edge a screen before now
  near(triggerTime(tr, { level: 1.65, edge: 'rise' }, 10e-3, 5e-3), 4.1e-3, 1e-12, 'rise');
  near(triggerTime(tr, { level: 1.65, edge: 'fall' }, 10e-3, 5e-3), 4.35e-3, 1e-12, 'fall');
  assert.equal(triggerTime(tr, { level: 5, edge: 'rise' }, 10e-3, 5e-3), null, 'never through 5 V');
  assert.deepEqual(measureText(m), { vpp: '3.3 V', min: '0 V', max: '3.3 V', mean: '825 mV', period: '1 ms', frequency: '1 kHz', duty: '25 %', rise: '0 s', fall: '0 s' });
});

test('an RC\'s rise and fall, 10 % to 90 %: τ ln 9; a sine\'s Vpp and mean; a flat trace no period', () => {
  const tau = 1e-3, tr = createTrace();
  // (charged for 15 τ, settled, then discharged for 15 τ)
  for (let k = 0; k <= 6000; k++) { const t = k * 5e-6; tr.add(t, t < 15e-3 ? 5 * (1 - Math.exp(-t / tau)) : 5 * (1 - Math.exp(-15)) * Math.exp(-(t - 15e-3) / tau)); }
  const m = measure(tr, 0, 30e-3);
  near(m.rise, tau * Math.log(9), 1e-5, 'rise');
  near(m.fall, tau * Math.log(9), 1e-5, 'fall');
  const sine = createTrace();
  for (let k = 0; k <= 1000; k++) sine.add(k * 1e-5, 2.5 + 2 * Math.sin(2 * Math.PI * 500 * k * 1e-5));
  const s = measure(sine, 0, 1e-2);
  near(s.vpp, 4, 1e-3, 'sine Vpp'); near(s.mean, 2.5, 1e-3, 'sine mean'); near(s.frequency, 500, 0.5, 'sine frequency');
  const flat = createTrace({ step: true }); flat.add(0, 1.2);
  assert.deepEqual(measure(flat, 0, 1), { min: 1.2, max: 1.2, vpp: 0, mean: 1.2, period: null, frequency: null, duty: null, rise: null, fall: null });
  assert.deepEqual(measure(createTrace(), 0, 1).vpp, null, 'nothing recorded');
  // (a flat run kept as two samples, its last moved on; a step's equal value not added)
  const t2 = createTrace(); t2.add(0, 1); t2.add(1, 1); t2.add(2, 1);
  assert.deepEqual([t2.t, t2.v], [[0, 2], [1, 1]]);
});

/** The 74LS14 oscillator (core/circuit-analog's test's) with a scope: CH1 on its output, CH2 on its capacitor. */
function oscillator(scope = {}) {
  const parts = [{ id: 'P1', type: 'supply', x: -20, y: -20 }, { id: 'U1', type: '7414', x: 0, y: 0 }, { id: 'R1', type: 'resistor', x: -10, y: 10, ohms: 1000 },
    { id: 'C1', type: 'capacitor', x: -10, y: 20, farads: 1e-6 }, { id: 'OSC1', type: 'oscilloscope', x: 10, y: 20, ...scope }];
  const at = (ref) => { const [id, n] = ref.split('.'); const q = partPins(parts.find((p) => p.id === id)).find((x) => String(x.n) === n); return [q.x, q.y]; };
  const joins = [['P1.1', 'U1.14'], ['P1.2', 'U1.7', 'C1.2'], ['U1.2', 'R1.1', 'OSC1.1'], ['U1.1', 'R1.2', 'C1.1', 'OSC1.2']], wires = [];
  for (const list of joins) for (const r of list.slice(1)) wires.push({ id: `w${wires.length + 1}`, points: [at(list[0]), at(r)] });
  const m = normalizeCircuit({ name: 'osc', parts, wires });
  const rec = createScopeRecorder(m);
  let sim = null;
  sim = createCircuitSim(m, { onUpdate: (t) => sim && rec.sample(sim, t) });
  sim.run();
  rec.sample(sim, sim.time);
  return { m, sim, rec };
}

test('a circuit\'s scope: a 74LS14 RC oscillator\'s frequency and duty cycle against its exponentials; the modes', () => {
  const { m, sim, rec } = oscillator({ tdiv: 1e-3 });
  for (let k = 0; k < 12; k++) sim.advance(1e6);
  const g = (vh, rh) => { const x = 1 / rh + 1 / 4000; return { v: (vh / rh + 1.5 / 4000) / x, tau: 1e-6 / x }; };
  const hi = g(3.4, 1070), lo = g(0.1, 1030);
  const up = hi.tau * Math.log((hi.v - 0.8) / (hi.v - 1.6)), down = lo.tau * Math.log((1.6 - lo.v) / (0.8 - lo.v));
  const st = m.parts.find((p) => p.id === 'OSC1');
  const s = rec.screen('OSC1', st, sim.time * 1e-9);
  near(s.t1 - s.t0, 10e-3, 1e-12, 'ten divisions of 1 ms');
  assert.ok(s.trig != null && !s.waiting, 'triggered');
  near(s.t0, s.trig - 1e-3, 1e-12, 'the trigger a division in');
  const [out, cap] = s.m;
  // (its output low while the capacitor charges toward its high, high... : 1Y high while 1A is low)
  near(out.period, up + down, 0.01 * (up + down), 'its period');
  near(out.duty, 100 * up / (up + down), 1.5, 'its duty cycle: high while the capacitor charges');
  // (its levels loaded by R1 to the capacitor: high 3.4 V − 70 Ω × (3.4 − 1.6) / 1070 Ω at most, low 0.1 V + 30 Ω × (0.8 −
  // 0.1) / 1030 Ω at least)
  near(out.max, 3.4 - 70 * 1.8 / 1070, 0.005, 'its high'); near(out.min, 0.1 + 30 * 0.7 / 1030, 0.005, 'its low');
  near(cap.min, 0.8, 0.02, 'the capacitor\'s lowest: the falling threshold'); near(cap.max, 1.6, 0.02, 'its highest: the rising one');
  assert.deepEqual(s.ch.map((c) => c.on), [true, true]);
  // normal, at a level it never reaches: waiting, nothing shown
  const w = rec.screen('OSC1', { ...st, mode: 'normal', level: 4.5 }, sim.time * 1e-9);
  assert.deepEqual([w.waiting, w.ch[0].t.length, w.m], [true, 0, [null, null]]);
  // auto at that level: the last screen, untriggered
  const a = rec.screen('OSC1', { ...st, level: 4.5 }, sim.time * 1e-9);
  assert.deepEqual([a.waiting, a.trig], [false, null]);
  // single: frozen at its first trigger until rearmed
  const one = rec.screen('OSC1', { ...st, mode: 'single' }, sim.time * 1e-9);
  sim.advance(5e6);
  assert.equal(rec.screen('OSC1', { ...st, mode: 'single' }, sim.time * 1e-9), one, 'frozen');
  rec.rearm('OSC1');
  assert.notEqual(rec.screen('OSC1', { ...st, mode: 'single' }, sim.time * 1e-9).trig, one.trig, 'rearmed: a later trigger');
});

test('a scope\'s settings: normalized (the nearest time base and scale), set by edit_circuit\'s set, refused', () => {
  assert.deepEqual(scopeSettings({}), { tdiv: 1e-3, vdiv: 1, source: 1, level: 1.5, edge: 'rise', mode: 'auto' });
  assert.deepEqual(scopeSettings({ tdiv: 0.0013, vdiv: 0.3, source: '2', level: 99, edge: 'fall', mode: 'single' }), { tdiv: 1e-3, vdiv: 0.2, source: 2, level: 20, edge: 'fall', mode: 'single' });
  const { m } = oscillator();
  const r = setPartProps(m, 'OSC1', { tdiv: 5e-4, vdiv: 2, source: 2, level: 1.2, edge: 'fall', mode: 'normal' });
  assert.deepEqual(Object.fromEntries(['tdiv', 'vdiv', 'source', 'level', 'edge', 'mode'].map((k) => [k, r.model.parts.at(-1)[k]])), { tdiv: 5e-4, vdiv: 2, source: 2, level: 1.2, edge: 'fall', mode: 'normal' });
  assert.deepEqual(setPartProps(m, 'OSC1', { tdiv: 3e-3 }), { error: 'tdiv: a time base of 0.000001, 0.000002, 0.000005, 0.00001, 0.00002, 0.00005, 0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1 s a division' });
  assert.deepEqual(setPartProps(m, 'OSC1', { mode: 'once' }), { error: 'mode: auto, normal, single' });
  assert.equal(scopeSettingError('source', 3), 'source: the trigger\'s channel, 1 or 2');
  assert.equal(scopeSettingError('level', 21), 'level: the trigger\'s level from -20 to 20 V');
  assert.equal(scopeSettingError('edge', 'up'), 'edge: rise or fall');
  assert.equal(scopeSettingError('vdiv', 3), 'vdiv: a scale of 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5 V a division');
});
