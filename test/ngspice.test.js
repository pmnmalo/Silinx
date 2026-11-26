// ngspice itself (#5386, server/ngspice.js: eecircuit-engine 1.9.0, downloaded on first use and kept, its SHA-256
// checked): an RC's step against its exponential; a circuit's run recorded and written as a netlist (core/circuit-spice.js),
// the 74LS14's RC oscillator, its capacitor's voltage in ngspice against the circuit's own solver at the same instants
// (one way: the output's edges as recorded), its range the Schmitt trigger's thresholds; a netlist ngspice refuses, said.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCircuit } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { partPins } from '../core/circuit-parts.js';
import { spiceNetlist, readSpiceResult, waveAt } from '../core/circuit-spice.js';
import { createNgspice } from '../server/ngspice.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
const ng = await createNgspice();
after(() => ng.close());

test('ngspice: an RC\'s step (1 kΩ, 100 nF, 0 to 3.3 V at 1 µs) against 3.3 (1 − e^(−t/τ))', async () => {
  const { result, errors } = await ng.run('RC\nV1 in 0 PWL(0 0 1u 0 1.001u 3.3 1m 3.3)\nR1 in out 1k\nC1 out 0 100n\n.tran 1u 500u\n.end\n');
  assert.deepEqual(errors, []);
  const w = readSpiceResult(result, [{ name: 'out', nets: ['out'] }]);
  for (const t of [50e-6, 100e-6, 300e-6]) near(waveAt(w, w.byNet.get('out'), t), 3.3 * (1 - Math.exp(-(t - 1.0005e-6) / 1e-4)), 2e-3, `at ${t}`);
});

test('ngspice: the 74LS14\'s RC oscillator recorded, one way: its capacitor in ngspice as in the circuit\'s own solver, between the thresholds', async () => {
  const parts = [{ id: 'P1', type: 'supply', x: -20, y: -20 }, { id: 'U1', type: '7414', x: 0, y: 0 }, { id: 'R1', type: 'resistor', x: -10, y: 10, ohms: 1000 }, { id: 'C1', type: 'capacitor', x: -10, y: 20, farads: '1u' }];
  const at = (ref) => { const [id, n] = ref.split('.'); const q = partPins(parts.find((p) => p.id === id)).find((x) => String(x.n) === n); return [q.x, q.y]; };
  const wires = [];
  for (const l of [['P1.1', 'U1.14'], ['P1.2', 'U1.7', 'C1.2'], ['U1.2', 'R1.1'], ['U1.1', 'R1.2', 'C1.1']]) for (const r of l.slice(1)) wires.push({ id: `w${wires.length + 1}`, points: [at(l[0]), at(r)] });
  const s = createCircuitSim(normalizeCircuit({ name: 'osc', parts, wires }));
  s.run();
  s.recordSpice();
  const t0 = s.time * 1e-9, own = [];
  for (let k = 0; k < 3000; k++) { s.advance(1000); own.push([s.time * 1e-9 - t0, s.pinVolts('U1', 1)]); }
  const n = spiceNetlist(s.spiceRecord());
  const { result, errors } = await ng.run(n.text);
  assert.deepEqual(errors, []);
  // (the capacitor's node: the one that never passes 1.7 V, the output's swings to 3.3 V, the GND's stays at 0)
  const w = readSpiceResult(result, n.nodes), v = n.nodes.map((x) => w.byNet.get(x.nets[0])).find((vs) => Math.max(...vs) < 1.7 && Math.max(...vs) > 1.5);
  assert.ok(v, 'the capacitor\'s node');
  let worst = 0;
  for (const [t, x] of own) worst = Math.max(worst, Math.abs(waveAt(w, v, t) - x));
  assert.ok(worst < 1e-3, `ngspice against the circuit's solver: ${worst} V at worst`);
  // (once oscillating: between the 74LS14's thresholds, 0.8 V and 1.6 V)
  const late = w.t.reduce((a, t, i) => (t > 1e-3 ? [...a, v[i]] : a), []);
  near(Math.min(...late), 0.8, 0.02, 'its low');
  near(Math.max(...late), 1.6, 0.02, 'its high');
});

test('ngspice: a netlist it refuses, said', async () => {
  const r = await ng.run('bad\nR1 a\n.tran 1u 10u\n.end\n').catch((e) => e);
  assert.ok(r instanceof Error ? /ngspice/.test(r.message) : r.errors.length > 0, JSON.stringify(r?.errors ?? r?.message));
});
