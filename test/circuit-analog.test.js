// A circuit's analog side (#5382, core/circuit-analog.js, core/circuit-analog-parts.js): the analog parts ('resistor',
// 'capacitor', 'potentiometer', 'ldr', 'thermistor', 'diode', 'voltmeter') solved with the digital ones at the pins,
// against circuits computed by hand and closed forms: an LED's current through its resistor (Shockley's equation by
// bisection), one with no resistor said once; a divider read by a voltmeter, a potentiometer turned, an LDR's and a
// thermistor's curves; a 74LS input's thresholds (its forbidden zone X, a pull-down too large to read 0); a 74LS14's RC
// oscillator's period against its exponentials; a button's RC through a Schmitt trigger; the checks (a pull-up resistor
// drives its net); the HDL (a pull-up resistor a pull, a series one a link) compiled and simulated in VHDL and Verilog
// as the engine runs it; a circuit with no analog part as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCircuit, circuitPorts } from '../core/circuit.js';
import { createCircuitSim, runMessages } from '../core/circuit-sim.js';
import { partPins } from '../core/circuit-parts.js';
import { checkCircuit } from '../core/circuit-check.js';
import { setPartProps } from '../core/circuit-edit.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { ldrOhms, ntcOhms, ledModel, readVolts, INPUT_SPEC } from '../core/circuit-analog-parts.js';
import { isAnalogCircuit } from '../core/circuit-analog.js';
import { halfAdder, circuitBench } from './circuit-helpers.mjs';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
const VT = 0.025852;

/** A circuit of `parts` (each its place), its pins joined by wires: `joins` lists of pins ('R1.1', 'P1.1'), each list one
 *  net (a wire from its first pin to each other). */
function circuit(name, parts, joins) {
  const at = (ref) => { const [id, n] = ref.split('.'); const q = partPins(parts.find((p) => p.id === id)).find((x) => String(x.n) === n); return [q.x, q.y]; };
  const wires = [];
  for (const list of joins) for (const ref of list.slice(1)) wires.push({ id: `w${wires.length + 1}`, points: [at(list[0]), at(ref)] });
  return normalizeCircuit({ name, parts, wires });
}
// an LED's current through R from V by bisection: (V − Vd − I Rs) / R = I, I = is (e^(Vd / n vt) − 1)
function ledRef(V, R, color = 'red') {
  const L = ledModel(color);
  let lo = 0, hi = V / R;
  for (let k = 0; k < 200; k++) { const i = (lo + hi) / 2, vd = L.n * VT * Math.log(i / L.is + 1); if (V - vd - i * L.rs - i * R > 0) lo = i; else hi = i; }
  return lo;
}

test('an LED through a resistor: its current by Ohm\'s and Shockley\'s laws; lit, and as bright as it is; none: said once', () => {
  const make = (ohms) => circuit('led', [{ id: 'P1', type: 'supply', x: 0, y: 0 }, { id: 'R1', type: 'resistor', x: 10, y: 0, ohms }, { id: 'D1', type: 'led', x: 20, y: 0, color: 'red' }],
    [['P1.1', 'R1.1'], ['R1.2', 'D1.1'], ['D1.2', 'P1.2']]);
  for (const ohms of [220, 330, 1000, 10e3]) {
    const s = createCircuitSim(make(ohms));
    const r = s.run();
    // (the supply's 0.05 Ω each side, in series)
    near(s.lampCurrents().D1 / 1000, ledRef(5, ohms + 0.1), 1e-7, `${ohms} Ω`);
    assert.deepEqual([s.analog, s.leds().D1, runMessages(s, r), s.servoWarnings()], [true, 'on', [], []], `${ohms} Ω: lit, no warnings`);
  }
  // with no resistor (a wire): ~300 mA, said once
  const m = circuit('led', [{ id: 'P1', type: 'supply', x: 0, y: 0 }, { id: 'R1', type: 'resistor', x: 10, y: 5 }, { id: 'D1', type: 'led', x: 20, y: 0, color: 'red' }],
    [['P1.1', 'D1.1'], ['D1.2', 'P1.2'], ['R1.1', 'P1.1'], ['R1.2', 'P1.2']]);
  const s = createCircuitSim(m);
  s.run(); s.run();
  near(s.lampCurrents().D1 / 1000, ledRef(5, 0.1), 1e-4, 'no resistor (R1 across the supply draws 5 mA through its 0.05 Ω too)');
  assert.deepEqual(s.servoWarnings(), ['D1: 313 mA through it, more than an LED takes (20 mA): a current-limiting resistor is missing in series (about 210 Ω from 5 V)']);
  // (a blue LED's forward voltage higher: less current through the same resistor)
  const blue = make(220); blue.parts[2].color = 'blue';
  const sb = createCircuitSim(blue); sb.run();
  near(sb.lampCurrents().D1 / 1000, ledRef(5, 220.1, 'blue'), 1e-7, 'a blue LED');
  assert.ok(sb.lampCurrents().D1 < 10);
});

test('a divider read by a voltmeter; a potentiometer turned; an LDR\'s and a thermistor\'s curves', () => {
  const m = circuit('div', [{ id: 'P1', type: 'supply', x: 0, y: 0 }, { id: 'R1', type: 'resistor', x: 10, y: 0, ohms: '4k7' }, { id: 'R2', type: 'resistor', x: 10, y: 4, ohms: 2200 },
    { id: 'VM1', type: 'voltmeter', x: 20, y: 0 }, { id: 'RV1', type: 'potentiometer', x: 10, y: 10, ohms: '10k', pos: 25 }, { id: 'VM2', type: 'voltmeter', x: 20, y: 10 },
    { id: 'LDR1', type: 'ldr', x: 10, y: 15, lux: 10 }, { id: 'R3', type: 'resistor', x: 10, y: 20, ohms: 10e3 }, { id: 'VM3', type: 'voltmeter', x: 20, y: 15 },
    { id: 'TH1', type: 'thermistor', x: 10, y: 25 }, { id: 'R4', type: 'resistor', x: 10, y: 30, ohms: 10e3 }, { id: 'VM4', type: 'voltmeter', x: 20, y: 25 }],
  [['P1.1', 'R1.1', 'RV1.1', 'LDR1.1', 'TH1.1'], ['R1.2', 'R2.1', 'VM1.1'], ['P1.2', 'R2.2', 'VM1.2', 'RV1.3', 'VM2.2', 'R3.2', 'VM3.2', 'R4.2', 'VM4.2'], ['RV1.2', 'VM2.1'], ['LDR1.2', 'R3.1', 'VM3.1'], ['TH1.2', 'R4.1', 'VM4.1']]);
  assert.deepEqual([m.parts[1].ohms, m.parts[4].ohms, m.parts[4].pos], [4700, 10000, 25], 'its values as written, normalized');
  const s = createCircuitSim(m);
  s.run();
  const sup = 5 * 0.05 / 0.05;   // (the supply's own resistance, 0.05 Ω each side, a few µV here)
  const div = (r1, r2) => sup * r2 / (r1 + r2);
  const v = s.meters();
  near(v.VM1, div(4700, 2200), 2e-4, 'a divider');
  near(v.VM2, div(2500, 7500), 2e-4, 'a potentiometer at 25 %: its wiper 3/4 of the way from its end 3');
  near(v.VM3, div(10e3, 10e3), 2e-4, 'an LDR at 10 lux: 10 kΩ');
  near(v.VM4, div(10e3, 10e3), 2e-4, 'a thermistor at 25 °C: 10 kΩ');
  // turned, lit, warmed: the readings follow
  s.setSensed('RV1', 'pos', 0); s.setSensed('LDR1', 'lux', 1000); s.setSensed('TH1', 'temp', 0);
  s.run();
  const w = s.meters();
  near(w.VM2, sup, 2e-3, 'its wiper at its end 1');
  near(w.VM3, div(10e3 * 100 ** -0.7, 10e3), 2e-4, 'brighter: less resistance');
  near(w.VM4, div(10e3 * Math.exp(3950 * (1 / 273.15 - 1 / 298.15)), 10e3), 2e-4, 'colder: more resistance');
  assert.equal(s.sensed('LDR1', 'lux'), 1000);
  assert.throws(() => s.setSensed('RV1', 'pos', 101), /^Error: RV1's pos: from 0 to 100 %$/);
  // (the curves: the datasheets' points)
  near(ldrOhms(10), 10e3, 1e-6, 'LDR 10 lux'); near(ldrOhms(0), 1e6, 0, 'LDR dark');
  near(ntcOhms(25), 10e3, 1e-6, 'NTC 25 °C'); near(ntcOhms(0), 33620, 50, 'NTC 0 °C (B 3950: 33.6 kΩ)'); near(ntcOhms(100), 697.5, 1, 'NTC 100 °C');
});

test('a 74LS input\'s thresholds: under 0.8 V a 0, over 2 V a 1, between them X; a 10 kΩ pull-down too large, 1 kΩ reads 0', () => {
  assert.deepEqual([0.5, 0.8, 1.2, 2.0, 3].map((v) => readVolts(v, INPUT_SPEC.ttl)), ['0', '0', 'X', '1', '1']);
  assert.deepEqual([[1.2, '1'], [1.2, '0'], [1.7, '0'], [0.7, '1'], [1.3, null]].map(([v, p]) => readVolts(v, INPUT_SPEC.ttl, true, p)), ['1', '0', '1', '0', '1']);
  // a 7404's input to GND through a resistor: its own current through it (1.5 V through 4 kΩ inside)
  const make = (ohms) => circuit('pd', [{ id: 'P1', type: 'supply', x: -20, y: -20 }, { id: 'U1', type: '7404', x: 0, y: 0 }, { id: 'R1', type: 'resistor', x: -10, y: 10, ohms },
    { id: 'VM1', type: 'voltmeter', x: -10, y: 15 }], [['P1.1', 'U1.14'], ['P1.2', 'U1.7', 'R1.2', 'VM1.2'], ['U1.1', 'R1.1', 'VM1.1']]);
  for (const [ohms, lv] of [[10e3, 'X'], [1000, '0'], [100, '0']]) {
    const s = createCircuitSim(make(ohms));
    s.run();
    near(s.meters().VM1, 1.5 * ohms / (ohms + 4000), 1e-3, `${ohms} Ω`);
    assert.equal(s.pin('U1', 1), lv, `${ohms} Ω: ${lv}`);
    assert.equal(s.pin('U1', 2), { X: 'X', 0: '1' }[lv], 'its output');
  }
  // (open: it floats, as the digital simulation says, high)
  const open = circuit('op', [{ id: 'P1', type: 'supply', x: -20, y: -20 }, { id: 'U1', type: '7404', x: 0, y: 0 }, { id: 'R1', type: 'resistor', x: -10, y: 10 }],
    [['P1.1', 'U1.14'], ['P1.2', 'U1.7', 'R1.2'], ['U1.1', 'R1.1']]);
  open.wires = open.wires.filter((w) => w.id !== 'w4');
  const so = createCircuitSim(open); so.run();
  assert.deepEqual([so.pin('U1', 2), so.pin('U1', 1)], ['0', 'Z']);
});

test('a 74LS14\'s RC oscillator: its period against its exponentials (its output\'s 3.4 V through 70 Ω, its low through 30, its input\'s own current)', () => {
  const m = circuit('osc', [{ id: 'P1', type: 'supply', x: -20, y: -20 }, { id: 'U1', type: '7414', x: 0, y: 0 }, { id: 'R1', type: 'resistor', x: -10, y: 10, ohms: 1000 }, { id: 'C1', type: 'capacitor', x: -10, y: 20, farads: '1u' }],
    [['P1.1', 'U1.14'], ['P1.2', 'U1.7', 'C1.2'], ['U1.2', 'R1.1'], ['U1.1', 'R1.2', 'C1.1']]);
  const s = createCircuitSim(m);
  s.run();
  const edges = [];
  let last = s.pin('U1', 2);
  for (let k = 0; k < 6000 && edges.length < 7; k++) { s.advance(1000); if (s.pin('U1', 2) !== last) { last = s.pin('U1', 2); edges.push(s.time); } }
  // the capacitor charges toward (3.4 V / 1070 Ω + 1.5 V / 4 kΩ) / (1/1070 + 1/4000) from 0.8 V to 1.6 V, discharges
  // toward (0.1 V / 1030 + 1.5 V / 4000) / (1/1030 + 1/4000) from 1.6 V to 0.8 V
  const th = (vh, rh) => { const g = 1 / rh + 1 / 4000; return { v: (vh / rh + 1.5 / 4000) / g, tau: 1e-6 / g }; };
  const hi = th(3.4, 1070), lo = th(0.1, 1030);
  const up = hi.tau * Math.log((hi.v - 0.8) / (hi.v - 1.6)), down = lo.tau * Math.log((1.6 - lo.v) / (0.8 - lo.v));
  const widths = edges.slice(1).map((t, i) => (t - edges[i]) * 1e-9);
  assert.equal(widths.length, 6);
  // (from its first edge, its halves in turn: low (discharging) and high (charging), or the other way)
  const first = Math.abs(widths[0] - up) < Math.abs(widths[0] - down) ? [up, down] : [down, up];
  for (const [i, w] of widths.entries()) near(w, first[i % 2], 0.01 * first[i % 2], `half period ${i}`);
  near(widths[1] + widths[2], up + down, 0.01 * (up + down), 'a period');
});

test('the check: a resistor\'s pull-up drives its net (no floating input); the HDL: a pull-up resistor a pull, a series one a link, as the engine', () => {
  // a 7408: its 1A pulled up by R1 (a button to GND), its 1B from a switch through R2; its 1Y through R3 to an LED to GND
  const m = circuit('pulls', [{ id: 'P1', type: 'supply', x: -30, y: -20 }, { id: 'U1', type: '7408', x: 0, y: 0 }, { id: 'R1', type: 'resistor', x: -20, y: 5 },
    { id: 'B1', type: 'button', x: -20, y: 10, label: 'b' }, { id: 'S1', type: 'logic-switch', x: -30, y: 15, label: 'a' }, { id: 'R2', type: 'resistor', x: -20, y: 15, ohms: 470 },
    { id: 'R3', type: 'resistor', x: 10, y: 15, ohms: 330 }, { id: 'D1', type: 'led', x: 20, y: 15, label: 'y' }],
  [['P1.1', 'U1.14', 'R1.1'], ['P1.2', 'U1.7', 'B1.2', 'D1.2'], ['U1.1', 'R1.2', 'B1.1'], ['S1.1', 'R2.1'], ['R2.2', 'U1.2'], ['U1.3', 'R3.1'], ['R3.2', 'D1.1']]);
  assert.equal(isAnalogCircuit(m), true);
  assert.deepEqual(checkCircuit(m).map((d) => `${d.severity}: ${d.message}`), [], 'no warnings: 1A pulled up, 1B driven through R2');
  const vectors = [{ a: 0, b: 0 }, { a: 1, b: 0 }, { a: 1, b: 1 }, { a: 0, b: 1 }];
  const s = createCircuitSim(m); s.run();
  const engine = vectors.map((v) => { s.set('S1', v.a === 1); s.set('B1', v.b === 1); s.run(); return s.outputs().y; });
  assert.deepEqual(engine, ['0', '1', '0', '0'], 'y = a AND NOT b (the button pulls 1A low)');
  const { inputs, outputs } = circuitPorts(m), ins = inputs.map((x) => x.name), outs = outputs.map((x) => x.name);
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(m, lang), f = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    const lib = compile([{ path: f, text: g.code }]), d = elaborate(lib, m.name);
    assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => `${e.severity}: ${e.message}`), [], `${lang}: no errors, no warnings`);
    assert.match(g.code, lang === 'vhdl' ? /-- through R2/ : /\/\/ through R2/, 'the series resistor a link');
    assert.match(g.code, /pulled up/, 'the pull-up resistor a pull');
    const r = simulate([{ path: f, text: g.code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins, outs }) }], 'tb', { until: 1e9 });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz]+$/.test(x)), engine, `${lang} as the engine`);
  }
});

test('a capacitor and a Schmitt trigger debounce a button: its input rises as RC\'s exponential, its output follows past 1.6 V', () => {
  // +5 V, R1 10 kΩ to 1A of a 74LS14 with C1 1 µF to GND, B1 discharging it through R2 100 Ω
  const m = circuit('rc', [{ id: 'P1', type: 'supply', x: -30, y: -20 }, { id: 'U1', type: '7414', x: 0, y: 0 }, { id: 'R1', type: 'resistor', x: -20, y: 5, ohms: 10e3 },
    { id: 'C1', type: 'capacitor', x: -20, y: 12, farads: 1e-6 }, { id: 'R2', type: 'resistor', x: -20, y: 20, ohms: 100 }, { id: 'B1', type: 'button', x: -30, y: 25 }, { id: 'VM1', type: 'voltmeter', x: -10, y: 12 }],
  [['P1.1', 'U1.14', 'R1.1'], ['P1.2', 'U1.7', 'C1.2', 'B1.2', 'VM1.2'], ['U1.1', 'R1.2', 'C1.1', 'R2.1', 'VM1.1'], ['R2.2', 'B1.1']]);
  const s = createCircuitSim(m);
  s.run();
  assert.equal(s.pin('U1', 2), '1', 'at first the capacitor empty: 1A low, 1Y high');
  // its input toward the Thevenin of 5 V through 10 kΩ and 1.5 V through 4 kΩ (its own current) with τ = (10k ∥ 4k)·1 µF
  const g = 1 / 10e3 + 1 / 4000, vinf = (5 / 10e3 + 1.5 / 4000) / g, tau = 1e-6 / g;
  for (const ms of [0.5, 1, 2]) {
    s.advance(ms * 1e6 - s.time);
    near(s.meters().VM1, vinf * (1 - Math.exp(-s.time * 1e-9 / tau)), 0.01, `at ${ms} ms`);
    assert.equal(s.pin('U1', 2), '1', `at ${ms} ms: still under 1.6 V`);
  }
  const cross = tau * Math.log(vinf / (vinf - 1.6));
  s.advance(Math.max(0, cross * 1e9 - s.time + 10e3));
  assert.equal(s.pin('U1', 2), '0', 'past 1.6 V: 1Y low');
  // pressed: discharged through 100 Ω in a few hundred µs
  s.set('B1', true);
  s.advance(1e6);
  assert.ok(s.meters().VM1 < 0.8, `discharged: ${s.meters().VM1} V`);
  assert.equal(s.pin('U1', 2), '1');
});

test('a circuit with no analog part as it was: no analog side, its LEDs by their levels; a voltmeter reads its nets\' levels', () => {
  const m = halfAdder();
  m.parts.push({ id: 'VM1', type: 'voltmeter', x: 40, y: 0 });
  const n = normalizeCircuit(m);
  assert.equal(isAnalogCircuit(n), false);
  const s = createCircuitSim(n);
  s.run();
  assert.deepEqual([s.analog, s.lampCurrents()], [false, {}]);
  s.set('S1', true); s.run();
  assert.deepEqual(s.leds(), { D1: 'on', D2: 'off' });
  assert.equal(s.volts(s.nets.pinNet.get('U1.3')), 3.4, 'a 74LS output\'s 1');
  assert.equal(s.volts(s.nets.pinNet.get('U1.14')), 5, 'the supply\'s +');
  assert.ok(Number.isNaN(s.meters().VM1), 'its leads on nothing');
});

test('edit_circuit\'s set: an analog part\'s values as written, in their ranges; the refusals', () => {
  const m = circuit('e', [{ id: 'R1', type: 'resistor', x: 0, y: 0 }, { id: 'C1', type: 'capacitor', x: 0, y: 5 }, { id: 'RV1', type: 'potentiometer', x: 0, y: 10 }], []);
  assert.deepEqual([m.parts[0].ohms, m.parts[1].farads, m.parts[2].ohms, m.parts[2].pos], [1000, 1e-6, 10e3, 50], 'the defaults');
  let r = setPartProps(m, 'R1', { ohms: '4k7' });
  assert.equal(r.model.parts[0].ohms, 4700);
  r = setPartProps(r.model, 'C1', { farads: '100n' });
  assert.equal(r.model.parts[1].farads, 1e-7);
  r = setPartProps(r.model, 'RV1', { pos: 30, ohms: 1e5 });
  assert.deepEqual([r.model.parts[2].pos, r.model.parts[2].ohms], [30, 1e5]);
  assert.deepEqual(setPartProps(m, 'R1', { ohms: 0 }), { error: 'ohms: resistance from 1 Ω to 10 MΩ (a number, or as 4.7k, 100n)' });
  assert.deepEqual(setPartProps(m, 'C1', { farads: 'lots' }), { error: 'farads: capacitance from 1 pF to 10 mF (a number, or as 4.7k, 100n)' });
  assert.deepEqual(setPartProps(m, 'R1', { farads: 1 }), { error: 'R1 (resistor) has no property \'farads\' (ohms)' });
  assert.deepEqual(setPartProps(m, 'RV1', { pos: 120 }), { error: 'pos: position from 0 to 100 %' });
});
