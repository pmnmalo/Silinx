// A circuit's analog side as an ngspice netlist (#5386, core/circuit-spice.js): a recorded run of the circuit's own
// simulation written as SPICE (its elements, its digital outputs as piecewise linear sources of their volts and their
// conductance), checked against the run itself (the PWL sources' edges at the output's edges, a generator's PWL against
// its own voltage function); ngspice's result read back (a net's waveform, between its points); the errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCircuit } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { partPins } from '../core/circuit-parts.js';
import { generatorVolts } from '../core/circuit-analog-devices.js';
import { spiceNetlist, stepPoints, generatorPoints, readSpiceResult, waveAt, SPICE_EDGE, SPICE_MAX_POINTS } from '../core/circuit-spice.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
function circuit(name, parts, joins) {
  const at = (ref) => { const [id, n] = ref.split('.'); const q = partPins(parts.find((p) => p.id === id)).find((x) => String(x.n) === n); return [q.x, q.y]; };
  const wires = [];
  for (const list of joins) for (const ref of list.slice(1)) wires.push({ id: `w${wires.length + 1}`, points: [at(list[0]), at(ref)] });
  return normalizeCircuit({ name, parts, wires });
}
// a PWL's value at t, linear between its points (as SPICE's)
const pwlAt = (pts, t) => waveAt({ t: pts.map((p) => p[0]) }, pts.map((p) => p[1]), t);
const pwlOf = (line) => { const v = /PWL\(([^)]*)\)/.exec(line)[1].split(' ').map(Number); return v.flatMap((x, i) => (i % 2 ? [] : [[x, v[i + 1]]])); };

test('a 74LS14\'s RC oscillator recorded: its resistor, its capacitor; its output a PWL source whose steps are the output\'s edges', () => {
  const m = circuit('osc', [{ id: 'P1', type: 'supply', x: -20, y: -20 }, { id: 'U1', type: '7414', x: 0, y: 0 }, { id: 'R1', type: 'resistor', x: -10, y: 10, ohms: 1000 }, { id: 'C1', type: 'capacitor', x: -10, y: 20, farads: '1u' }],
    [['P1.1', 'U1.14'], ['P1.2', 'U1.7', 'C1.2'], ['U1.2', 'R1.1'], ['U1.1', 'R1.2', 'C1.1']]);
  const s = createCircuitSim(m);
  s.run();
  s.recordSpice();
  const edges = [];
  let last = s.pin('U1', 2);
  for (let k = 0; k < 6000 && edges.length < 5; k++) { s.advance(1000); if (s.pin('U1', 2) !== last) { last = s.pin('U1', 2); edges.push(s.time * 1e-9); } }
  const rec = s.spiceRecord(), n = spiceNetlist(rec, { title: 'osc' });
  assert.deepEqual(n.warnings, []);
  near(n.tstop, rec.t - rec.t0, 1e-12, 'the run');
  const lines = n.text.trim().split('\n');
  assert.equal(lines[0], '* osc');
  assert.equal(lines.at(-1), '.end');
  assert.equal(lines.at(-2), `.tran ${Number((n.tstop / 1000).toPrecision(9))} ${Number(n.tstop.toPrecision(9))} UIC`);
  assert.equal(lines.filter((l) => /^R\d+ n\d+ n\d+ 1000$/.test(l)).length, 1, 'R1');
  assert.equal(lines.filter((l) => /^C\d+ n\d+ n\d+ \S+ IC=\S+$/.test(l) && Number(l.split(' ')[3]) === 1e-6).length, 1, 'C1 (to the supply\'s GND, a node driven at 0 V)');
  // (the 7414's output, recorded: its volts and its conductance each a PWL source, a behavioural source between them)
  const b = lines.filter((l) => /^B\d+ /.test(l));
  assert.ok(b.length >= 1, 'a driver in time');
  const id = /^B(\d+)/.exec(b[0])[1], volts = pwlOf(lines.find((l) => l.startsWith(`VS${id} `))), siemens = pwlOf(lines.find((l) => l.startsWith(`VC${id} `)));
  // (each output edge recorded is a step of the PWL: the level before it just before, the level after it an edge later)
  const steps = volts.filter((p, i) => i > 0 && Math.abs(p[1] - volts[i - 1][1]) > 1).map((p) => p[0] + rec.t0);
  assert.ok(steps.length >= 4, `the output's steps: ${steps.length}`);
  // (the edges seen a microsecond at a time: each step within the microsecond before)
  for (const [i, t] of steps.slice(0, 4).entries()) assert.ok(t - SPICE_EDGE <= edges[i] && t > edges[i] - 1e-6, `step ${i}: ${t} against ${edges[i]}`);
  // (high 3.4 V through 70 Ω, low 0.1 V through 30 Ω: the 74LS's, core/circuit-analog-parts.js)
  const mid = (steps[1] + steps[2]) / 2 - rec.t0, other = (steps[2] + steps[3]) / 2 - rec.t0;
  assert.deepEqual([pwlAt(volts, mid), pwlAt(volts, other)].map((v) => Math.round(v * 10) / 10).sort(), [0.1, 3.4]);
  assert.ok([1 / 30, 1 / 70].some((g) => Math.abs(pwlAt(siemens, mid) - g) < 1e-9), 'its conductance');
  // (the 74LS14's input: its own current, a constant source through its resistance)
  assert.ok(lines.some((l) => /^V\d+ s\d+ 0 DC 1\.5$/.test(l)), 'the 74LS input\'s source');
  // every node named in the netlist is a node of the circuit, its nets kept
  assert.ok(n.nodes.every((x) => /^n\d+$/.test(x.name) && x.nets.length > 0));
});

test('a generator\'s PWL against its own voltage: a square wave\'s edges, a triangle\'s corners, a sine\'s points; a duty cycle turned', () => {
  for (const wave of ['square', 'triangle', 'sine']) {
    const g = { wave, hz: 1000, vhigh: 5, vlow: 0, duty: 30 };
    const pts = generatorPoints([{ t: 0, v: g }], 0, 3e-3);
    for (let k = 1; k < 60; k++) {
      const t = k * 0.049e-3 + 1e-7;   // (off the edges)
      near(pwlAt(pts, t), generatorVolts(g, t), wave === 'sine' ? 5 * (1 - Math.cos(Math.PI / 64)) + 1e-9 : 1e-9, `${wave} at ${t}`);
    }
    assert.ok(pts.every((p, i) => i === 0 || p[0] > pts[i - 1][0]), `${wave}: its times increasing`);
  }
  // (its duty cycle turned from 30 % to 70 % at 2 ms)
  const a = { wave: 'square', hz: 1000, vhigh: 5, vlow: 0, duty: 30 }, b = { ...a, duty: 70 };
  const pts = generatorPoints([{ t: 0, v: a }, { t: 2e-3, v: b }], 0, 4e-3);
  assert.equal(pwlAt(pts, 1.5e-3), 0);
  assert.equal(pwlAt(pts, 2.5e-3), 5);
  // (a value's changes as steps: at a change, the old value, an edge later the new one; its last kept to the run's end)
  assert.deepEqual(stepPoints([{ t: 1, v: 2 }, { t: 1.5, v: 4 }], 1, 3), [[0, 2], [0.5, 2], [0.5 + SPICE_EDGE, 4], [2, 4]]);
});

test('ngspice\'s result read: a net\'s waveform by its node, between its points; the errors', () => {
  const nodes = [{ name: 'n0', nets: [3, 5] }, { name: 'n1', nets: [7] }];
  const r = readSpiceResult({ dataType: 'real', data: [{ name: 'time', values: [0, 1e-3, 2e-3] }, { name: 'V(n0)', values: [0, 1, 2] }, { name: 'v(n1)', values: [5, 5, 5] }, { name: 'i(v1)', values: [0, 0, 0] }] }, nodes);
  assert.deepEqual([...r.t], [0, 1e-3, 2e-3]);
  assert.equal(r.byNet.get(5), r.byNet.get(3));
  near(waveAt(r, r.byNet.get(3), 1.5e-3), 1.5, 1e-12, 'between its points');
  assert.equal(waveAt(r, r.byNet.get(3), 9), 2);
  assert.equal(waveAt(r, r.byNet.get(7), -1), 5);
  assert.throws(() => readSpiceResult({ dataType: 'complex', data: [] }, nodes), /no transient analysis/);
  assert.throws(() => readSpiceResult({ dataType: 'real', data: [{ name: 'v(n0)', values: [] }] }, nodes), /no time/);
  assert.throws(() => readSpiceResult({ dataType: 'real', data: [{ name: 'time', values: [] }] }, nodes), /no voltage of n0/);
});

test('the netlist\'s refusals: nothing recorded, no time run, a run too long for its sources; a switch while recorded said', () => {
  assert.throws(() => spiceNetlist(null), /nothing recorded/);
  const empty = { nodes: [], inner: [], els: [], series: new Map(), gens: [], t0: 1, t: 1, regrouped: null };
  assert.throws(() => spiceNetlist(empty), /run the circuit for a while/);
  const e = { kind: 'VR', a: 0, b: -1, volts: 0, ohms: 50 }, set = { wave: 'sine', hz: 1e6, vhigh: 1, vlow: 0, duty: 50 };
  const long = { ...empty, nodes: [[1]], els: [e], gens: [{ e, set }], series: new Map([[{}, []]]), t: 1 + 10e-3 };
  assert.throws(() => spiceNetlist(long), new RegExp(`more than ${SPICE_MAX_POINTS} points`));
  const r = { ...empty, nodes: [[1]], els: [{ kind: 'R', a: 0, b: -1, ohms: 10 }], t: 2, regrouped: 1.5 };
  assert.deepEqual(spiceNetlist(r).warnings, ['the circuit\'s connections changed at 500 ms (a switch, a wire): ngspice ran on them as they are now']);
  assert.match(spiceNetlist(r).text, /^R0 n0 0 10$/m);
});

test('#5386 a long run\'s PWL sources: their times to the picosecond, strictly increasing however far from the start', () => {
  // (a driver changing twice a nanosecond apart at 2.5 s, then 2 ns later: 9 significant digits would merge them)
  const e = { kind: 'VR', a: 0, b: -1, volts: 0, ohms: 50 };
  const series = new Map([[e, [{ t: 0, v: [0, 50] }, { t: 2.5, v: [3.3, 50] }, { t: 2.5 + 1e-9, v: [0, 50] }, { t: 2.5 + 3e-9, v: [3.3, 50] }]]]);
  const n = spiceNetlist({ nodes: [[1]], inner: [], els: [e], series, gens: [], t0: 0, t: 3, regrouped: null });
  for (const name of ['VS0', 'VC0']) {
    const ts = /PWL\(([^)]*)\)/.exec(n.text.split('\n').find((l) => l.startsWith(`${name} `)))[1].split(' ').filter((_, i) => i % 2 === 0).map(Number);
    assert.ok(ts.every((t, i) => i === 0 || t > ts[i - 1]), `${name}: ${ts.join(' ')}`);
    assert.ok(ts.includes(2.500000001), `${name}: the change at 2.5 s + 1 ns kept`);
  }
});
