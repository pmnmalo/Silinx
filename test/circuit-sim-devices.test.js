// The devices of a circuit's live simulation (#5357, core/circuit-sim-devices.js, moved from createCircuitSim as they
// were): each device's setup (its state, the nets it reads, its drivers) and none for another part; its evaluation (a
// device's, true; another part's, false: the simulation's own); the views (lcds, oleds, servos, servoWarnings, sensors,
// setTemp) as createCircuitSim shows them, on a circuit with one of each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDevice, evaluateDevice, deviceViews } from '../core/circuit-sim-devices.js';
import { partDef } from '../core/circuit-parts.js';
import { normalizeCircuit } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';

test('#5357 setupDevice: an LCD, an OLED, a servo, a sensor, each its state, its reads and its drivers; another part none', () => {
  const drivers = [];
  const ctx = (d) => ({ at: (name) => d.pins.find((q) => q.name === name).n * 10, addDriver: (net, value) => { drivers.push([net, value]); return { net, value }; }, level: () => '0' });
  const of = (type) => { const d = partDef(type); return setupDevice({ id: 'X1', type, temp: 30 }, d, ctx(d)); };
  assert.deepEqual(of('lcd-1602').reads, [20, 10, 60]);
  assert.deepEqual(of('oled-ssd1306').reads, [20, 10, 30, 40]);
  assert.deepEqual(of('servo-sg90').reads, [20, 10, 30]);
  const s = of('lm75');
  assert.deepEqual([s.reads, s.ic.lm75.state().temp], [[80, 40, 20, 10], 30]);
  assert.deepEqual(drivers, [[40, 'Z'], [10, 'Z'], [30, 'Z']], 'the OLED\'s SDA; the sensor\'s SDA and OS: nothing at first');
  assert.equal(of('7400'), null);
  assert.equal(of('led'), null);
  assert.equal(evaluateDevice({ part: { id: 'U1' } }, {}), false, 'not a device: the simulation\'s own');
});

test('#5357 the devices in a circuit as createCircuitSim shows them: one of each, their views; setTemp\'s refusal', () => {
  const m = normalizeCircuit({ name: 'c', parts: [{ id: 'P1', type: 'supply', x: -6, y: -10 }, { id: 'LCD1', type: 'lcd-1602', x: 0, y: 0 }, { id: 'OLED1', type: 'oled-ssd1306', x: 0, y: 20 },
    { id: 'M1', type: 'servo-sg90', x: 10, y: 20 }, { id: 'U1', type: 'lm75', x: 20, y: 20, temp: 21 }],
  wires: [{ id: 'a', points: [[1, 0], [-6, -10]] }, { id: 'b', points: [[0, 0], [-6, -9]] }] });
  const sim = createCircuitSim(m);
  sim.run();
  assert.deepEqual(Object.keys(sim.lcds()), ['LCD1']);
  assert.deepEqual([Object.keys(sim.oleds()), sim.servos(), sim.servoWarnings(), sim.sensors().U1.temp], [['OLED1'], { M1: { angle: 90, target: 90, width: null, period: null } }, [], 21]);
  sim.setTemp('U1', 40);
  assert.equal(sim.sensors().U1.temp, 40);
  assert.throws(() => sim.setTemp('M1', 40), /M1 is not a temperature sensor of the circuit/);
  // (the views alone: on a list of devices)
  const v = deviceViews([], { now: () => 0, evaluate: () => {}, update: () => {} });
  assert.deepEqual([v.lcds(), v.oleds(), v.servos(), v.servoWarnings(), v.sensors()], [{}, {}, {}, [], {}]);
});
