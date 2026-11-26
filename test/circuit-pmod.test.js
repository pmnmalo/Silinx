// The analog instruments and chips of #5384 (core/circuit-pmod.js, core/circuit-analog-devices.js): the Pmod DA2's
// DAC121S101 ('pmod-da2') and the Pmod AD1's AD7476A ('pmod-ad1') against their datasheets' SPI frames (written and read
// independently, bit by bit); in a circuit, a word sent by switches to the DA2 measured by a voltmeter, a potentiometer
// read by the AD1; a 'function-generator''s PWM through an RC (its mean D × V and its ripple against the steady state's
// closed form); an R-2R ladder's voltages; an 'lm393' squaring a sine (its duty cycle ½ + asin(…)/π).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDac121, createAd7476, dacOutput } from '../core/circuit-pmod.js';
import { generatorVolts, generatorEdge } from '../core/circuit-analog-devices.js';
import { normalizeCircuit } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { partPins } from '../core/circuit-parts.js';
import { checkCircuit } from '../core/circuit-check.js';
import { createScopeRecorder } from '../core/circuit-scope.js';
import { measure } from '../core/scope.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
function circuit(name, parts, joins) {
  const at = (ref) => { const [id, n] = ref.split('.'); const q = partPins(parts.find((p) => p.id === id)).find((x) => String(x.n) === n); return [q.x, q.y]; };
  const wires = [];
  for (const list of joins) for (const ref of list.slice(1)) wires.push({ id: `w${wires.length + 1}`, points: [at(list[0]), at(ref)] });
  return normalizeCircuit({ name, parts, wires });
}
// a 16-bit SPI word's level changes, MSB first: [sync/cs, sclk, data] after each step (the clock idle high, data set
// while it is high, read as it falls)
function frame(word, n = 16) {
  const out = [['1', '1', '0'], ['0', '1', '0']];
  for (let k = n - 1; k >= 0; k--) { const b = (word >> k) & 1 ? '1' : '0'; out.push(['0', '1', b], ['0', '0', b]); }
  out.push(['0', '1', '0'], ['1', '1', '0']);
  return out;
}

test('a DAC121S101: a word\'s code and power-down bits at its 16th falling edge; SYNC high before it aborts', () => {
  const dac = createDac121();
  for (const [s, c, d] of frame(0x0abc)) dac.step(s, c, d);
  assert.deepEqual(dac.state(), { code: 0xabc, pd: 0, writes: 1 });
  near(dacOutput(dac.state(), 3.3).volts, 3.3 * 0xabc / 4096, 1e-12, 'VOUT');
  for (const [s, c, d] of frame(0xcfff)) dac.step(s, c, d);   // (its 2 top bits ignored)
  assert.deepEqual(dac.state(), { code: 0xfff, pd: 0, writes: 2 });
  for (const [s, c, d] of frame(0x2123)) dac.step(s, c, d);   // (PD 10: 100 kΩ to GND)
  assert.deepEqual([dac.state().pd, dacOutput(dac.state())], [2, { volts: 0, ohms: 1e5 }]);
  const cut = frame(0x0555).slice(0, 20);   // (SYNC high after 9 bits: aborted)
  for (const [s, c, d] of [...cut, ['1', '1', '0']]) dac.step(s, c, d);
  assert.equal(dac.state().writes, 3);
});

test('an AD7476A: CS falling samples, its 4 zeros and 12 bits on SCK\'s falling edges, released after the 16th', () => {
  const adc = createAd7476();
  const read = (vin, vcc = 3.3) => {
    const bits = [];
    let r = adc.step('1', '1', vin, vcc);
    r = adc.step('0', '1', vin, vcc); bits.push(r.out);
    for (let k = 0; k < 16; k++) { adc.step('0', '0', vin, vcc); r = adc.step('0', '1', vin, vcc); bits.push(r.out); }
    adc.step('1', '1', vin, vcc);
    return bits;
  };
  // 1.65 V of 3.3: 2048, 0000 1000 0000 0000, then released
  assert.deepEqual(read(1.65).join(''), '0000100000000000Z'.replace('Z', '') + 'Z');
  assert.equal(adc.state().code, 2048);
  for (const [v, code] of [[0, 0], [3.3, 4095], [5, 4095], [-1, 0], [1, Math.floor(4096 / 3.3)], [2.5, Math.floor(2.5 * 4096 / 5)]]) {
    const bits = read(v, v === 2.5 ? 5 : 3.3).slice(0, 16).join('');
    assert.equal(parseInt(bits, 2), code, `${v} V`);
  }
  assert.equal(adc.state().out, 'Z', 'CS high: released');
});

test('in a circuit: switches send a word to a Pmod DA2 (a voltmeter on VOUTA); a Pmod AD1 reads a potentiometer', () => {
  // the 5 V supply its VCC (its reference); logic switches on SYNC, DINA, SCLK
  const m = circuit('da2', [{ id: 'P1', type: 'supply', x: -20, y: -20 }, { id: 'DA1', type: 'pmod-da2', x: 0, y: 0 }, { id: 'S1', type: 'logic-switch', x: -10, y: 5, on: true },
    { id: 'S2', type: 'logic-switch', x: -10, y: 7 }, { id: 'S3', type: 'logic-switch', x: -10, y: 9, on: true }, { id: 'VM1', type: 'voltmeter', x: 10, y: -10 },
    { id: 'AD1', type: 'pmod-ad1', x: 20, y: 0 }, { id: 'RV1', type: 'potentiometer', x: 20, y: -12, pos: 25 }, { id: 'S4', type: 'logic-switch', x: 10, y: 5, on: true }, { id: 'S5', type: 'logic-switch', x: 10, y: 7, on: true }],
  [['P1.1', 'DA1.6', 'AD1.6', 'RV1.1'], ['P1.2', 'DA1.5', 'VM1.2', 'AD1.5', 'RV1.3'], ['S1.1', 'DA1.1'], ['S2.1', 'DA1.2'], ['S3.1', 'DA1.4'], ['DA1.7', 'VM1.1'],
    ['RV1.2', 'AD1.7'], ['S4.1', 'AD1.1'], ['S5.1', 'AD1.4']]);
  assert.deepEqual(checkCircuit(m).filter((d) => d.severity === 'error'), []);
  const s = createCircuitSim(m);
  s.run();
  for (const [sync, sclk, din] of frame(0x0800)) { s.set('S1', sync === '1'); s.set('S2', din === '1'); s.set('S3', sclk === '1'); s.run(); }
  assert.deepEqual(s.pmods().DA1, [{ code: 0x800, pd: 0, writes: 1 }, { code: 0, pd: 0, writes: 1 }], 'DINB open: its DAC takes a word of zeros');
  near(s.meters().VM1, 5 * 2048 / 4096, 5e-3, 'VOUTA: half of its 5 V VCC (less the supply\'s drop)');
  // the AD1: CS low, 16 SCK falling edges, D0 read after each
  s.set('S4', false); s.run();
  const bits = [s.pin('AD1', 2)];
  for (let k = 0; k < 15; k++) { s.set('S5', false); s.run(); s.set('S5', true); s.run(); bits.push(s.pin('AD1', 2)); }
  const code = parseInt(bits.join(''), 2);
  assert.equal(code, Math.floor(s.pinVolts('AD1', 7) * 4096 / s.pinVolts('AD1', 6)), 'its code: the wiper\'s volts of its VCC');
  near(code, 4096 * 0.75, 8, 'the wiper at 25 % from +5 V: 3/4 of it');
  s.set('S5', false); s.run();
  assert.equal(s.pin('AD1', 2), 'Z', 'released after the 16th falling edge');
});

test('a function generator\'s PWM through an RC: its mean D × V, its ripple the steady state\'s; its waves', () => {
  const g = { wave: 'square', hz: 1000, vhigh: 5, vlow: 0, duty: 25 };
  assert.deepEqual([generatorVolts(g, 0), generatorVolts(g, 0.2e-3), generatorVolts(g, 0.3e-3), generatorEdge(g, 0), generatorEdge(g, 0.25e-3), generatorEdge(g, 0.3e-3)], [5, 5, 0, 0.25e-3, 1e-3, 1e-3]);
  near(generatorVolts({ ...g, wave: 'sine' }, 0.25e-3), 5, 1e-12, 'sine top'); near(generatorVolts({ ...g, wave: 'triangle' }, 0.25e-3), 2.5, 1e-12, 'triangle');
  assert.equal(generatorEdge({ ...g, wave: 'sine' }, 0), Infinity);
  // FG1 1 kHz 25 % through R1 10 kΩ into C1 1 µF; OSC1 on the capacitor
  const m = circuit('pwm', [{ id: 'FG1', type: 'function-generator', x: 0, y: 0, hz: 1000, duty: 25 }, { id: 'R1', type: 'resistor', x: 5, y: 0, ohms: 10e3 },
    { id: 'C1', type: 'capacitor', x: 12, y: 0, farads: 1e-6 }, { id: 'OSC1', type: 'oscilloscope', x: 20, y: 0 }],
  [['FG1.1', 'R1.1'], ['R1.2', 'C1.1', 'OSC1.1'], ['FG1.2', 'C1.2']]);
  const rec = createScopeRecorder(m);
  let s = null;
  s = createCircuitSim(m, { onUpdate: (t) => s && rec.sample(s, t) });
  s.run();
  s.advance(150e6);   // (15 τ: settled)
  const r = measure(rec.scopes[0].ch[0], 0.140, 0.150);
  const tau = (10e3 + 50) * 1e-6, T = 1e-3, D = 0.25;
  near(r.mean, D * 5, 0.01, 'its mean: D × V');
  const ripple = 5 * (1 - Math.exp(-D * T / tau)) * (1 - Math.exp(-(1 - D) * T / tau)) / (1 - Math.exp(-T / tau));
  near(r.vpp, ripple, 0.02 * ripple, 'its ripple');
  near(r.frequency, 1000, 1, 'its ripple\'s frequency');
});

test('an R-2R ladder (3 bits, 10 kΩ and 20 kΩ) from switches: Vout = 5 V × code / 8; an LM393 squaring a sine', () => {
  // b0, b1, b2 (MSB) each through 2R (RB0..RB2) into the nodes n0, n1, n2 (the output); R (RL1, RL2) from n0 to n1 and
  // n1 to n2; n0 to GND through 2R (RT)
  const parts = [{ id: 'P1', type: 'supply', x: -20, y: -20 }, { id: 'VM1', type: 'voltmeter', x: 30, y: 0 }, { id: 'RT', type: 'resistor', x: 10, y: -4, ohms: 20e3 },
    { id: 'RL1', type: 'resistor', x: 10, y: 6, ohms: 10e3 }, { id: 'RL2', type: 'resistor', x: 10, y: 10, ohms: 10e3 }];
  for (let k = 0; k < 3; k++) parts.push({ id: `S${k}`, type: 'logic-switch', x: -10, y: 4 * k }, { id: `RB${k}`, type: 'resistor', x: 0, y: 4 * k, ohms: 20e3 });
  const m = circuit('r2r', parts, [['P1.2', 'VM1.2', 'RT.2'], ['S0.1', 'RB0.1'], ['S1.1', 'RB1.1'], ['S2.1', 'RB2.1'],
    ['RB0.2', 'RT.1', 'RL1.1'], ['RB1.2', 'RL1.2', 'RL2.1'], ['RB2.2', 'RL2.2', 'VM1.1']]);
  const s = createCircuitSim(m);
  s.run();
  for (let code = 0; code < 8; code++) {
    for (let k = 0; k < 3; k++) s.set(`S${k}`, !!((code >> k) & 1));
    s.run();
    near(s.meters().VM1, 5 * code / 8, 0.02, `code ${code}`);
  }
  // an LM393: a 1 kHz sine 0–5 V on 1IN+, 1.25 V on 1IN− (a divider), its 1OUT pulled up: high while the sine is above
  // 1.25 V: ½ + asin(0.5)/π of the period
  const c = circuit('cmp', [{ id: 'P1', type: 'supply', x: -20, y: -20 }, { id: 'U1', type: 'lm393', x: 0, y: 0 }, { id: 'FG1', type: 'function-generator', x: -12, y: 6, wave: 'sine' },
    { id: 'R1', type: 'resistor', x: -12, y: 12, ohms: 30e3 }, { id: 'R2', type: 'resistor', x: -12, y: 16, ohms: 10e3 }, { id: 'R3', type: 'resistor', x: 6, y: 6, ohms: 10e3 }, { id: 'OSC1', type: 'oscilloscope', x: 14, y: 6 }],
  [['P1.1', 'U1.8', 'R1.1', 'R3.1'], ['P1.2', 'U1.4', 'FG1.2', 'R2.2'], ['FG1.1', 'U1.3'], ['R1.2', 'R2.1', 'U1.2'], ['U1.1', 'R3.2', 'OSC1.1']]);
  assert.deepEqual(checkCircuit(c).map((d) => d.message), []);
  const rec = createScopeRecorder(c);
  let sc = null;
  sc = createCircuitSim(c, { onUpdate: (t) => sc && rec.sample(sc, t) });
  sc.run();
  sc.advance(10e6);
  const r = measure(rec.scopes[0].ch[0], 0.004, 0.010);
  near(r.frequency, 1000, 2, 'its output\'s frequency');
  near(r.duty, 100 * (0.5 + Math.asin(0.5) / Math.PI), 1, 'its duty cycle');
});
