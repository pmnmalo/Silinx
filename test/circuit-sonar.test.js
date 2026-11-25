// An ultrasonic range sensor, an HC-SR04 (#5456, core/circuit-sonar.js): a trigger of 10 µs or more, its echo 0.46 ms
// after it falls, 58.3 µs a centimetre (38 ms out of its range); a short trigger said once, one while it measures not seen;
// in a circuit (its Trig a switch's, its own wake-ups timing its echo), unpowered its Echo open; its distance set while
// running, in its range; saved, normalized and edited; its checks; its HDL compiled with no warnings, its echo where the
// live one's is in VHDL and in Verilog; an Arduino triggering it and timing its echo with Timer1 through a System's
// circuit node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSonar, echoNs, HC_SR04, SONAR } from '../core/circuit-sonar.js';
import { normalizeCircuit } from '../core/circuit.js';
import { setPartProps } from '../core/circuit-edit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { PARTS, PART_ORDER } from '../core/circuit-parts.js';
import { partInfo } from '../core/circuit-part-info.js';
import { EXPORTED_PARTS } from '../core/kicad-export.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';

const US = 1000;   // (ns)

test('#5456 the sensor: its echo\'s width (58.3 µs a cm, 38 ms out of 2..400 cm); a trigger, its burst, its echo; a short one said once; one while measuring not seen', () => {
  assert.deepEqual([echoNs(2), echoNs(50), echoNs(400), echoNs(1), echoNs(401)], [116618, 2915450, 23323600, 38e6, 38e6]);
  const s = createSonar({ cm: 50 });
  assert.deepEqual(s.state(), { cm: 50, measuring: false, echo: null });
  // (5 µs: too short, said once; nothing measured)
  assert.equal(s.trig('1', 0), null);
  assert.equal(s.trig('0', 5 * US), null);
  s.trig('1', 10 * US); s.trig('0', 13 * US);
  assert.deepEqual(s.warnings.map((w) => w.text), ['a trigger of 5 µs: an HC-SR04\'s is 10 µs or more']);
  // (12 µs: its echo at the fall + 460 µs, for 2915.45 µs)
  s.trig('1', 100 * US);
  const due = s.trig('0', 112 * US);
  assert.equal(due, 112 * US + SONAR.burst);
  assert.deepEqual([s.state().measuring, s.wake(due - 1)], [true, { echo: null, next: due }]);
  // (a trigger while it measures: not seen)
  s.trig('1', 200 * US);
  assert.equal(s.trig('0', 220 * US), null);
  const w = s.wake(due);
  assert.deepEqual(w, { echo: '1', next: due + 2915450 });
  assert.deepEqual(s.wake(w.next), { echo: '0', next: null });
  assert.deepEqual(s.state(), { cm: 50, measuring: false, echo: 2915.4 });
  // (out of its range: 38 ms)
  const far = createSonar({ cm: 1 });
  far.trig('1', 0);
  const d2 = far.trig('0', 10 * US);
  assert.equal(far.wake(d2).next, d2 + 38e6);
  assert.deepEqual(far.warnings, []);
});

// a circuit: the sensor powered (or not), its Trig a logic switch's (S1), its Echo lighting an LED (D1)
const bench = ({ power = true, cm = 50 } = {}) => normalizeCircuit({ name: 'son', parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 }, { id: 'US1', type: 'hc-sr04', x: 0, y: 0, cm },
  { id: 'S1', type: 'logic-switch', x: 1, y: 6 }, { id: 'D1', type: 'led', x: 2, y: 4 }],
wires: [{ id: 'wt', points: [[1, 6], [1, 0]] }, { id: 'we', points: [[2, 0], [2, 4]] }, { id: 'wk', points: [[3, 4], [3, 3], [-10, 3], [-10, -13]] },
  ...(power ? [{ id: 'wv', points: [[0, 0], [-12, 0], [-12, -14], [-10, -14]] }, { id: 'wg', points: [[3, 0], [4, 0], [4, 2], [-11, 2], [-11, -13], [-10, -13]] }] : [])] });
// the live one: S1 on 12 µs, off, then on 3 µs (too short) after its echo: the echo's rise and fall, and what it said
function live(m) {
  const sim = createCircuitSim(m), seen = [];
  const at = () => sim.pin('US1', 3);
  sim.run();
  seen.push(at());
  sim.advance(1 * US); sim.set('S1', true); sim.run(); sim.advance(12 * US); sim.set('S1', false); sim.run();
  for (let k = 0; k < 2; k++) { const t = sim.nextWake(); if (t == null) break; sim.advance(t - sim.time); seen.push([sim.time, at(), sim.leds().D1]); }
  sim.advance(1000 * US); sim.set('S1', true); sim.run(); sim.advance(3 * US); sim.set('S1', false); sim.run();
  seen.push(sim.nextWake());
  return { sim, seen };
}

test('#5456 the sensor in a circuit: its echo timed by its wake-ups, lighting an LED; a short trigger said; unpowered its Echo open', () => {
  const { sim, seen } = live(bench());
  assert.deepEqual(seen, ['0', [473000, '1', 'on'], [3388450, '0', 'off'], null]);
  assert.deepEqual(sim.servoWarnings(), ['US1: a trigger of 3 µs: an HC-SR04\'s is 10 µs or more']);
  assert.deepEqual(sim.sonars(), { US1: { cm: 50, measuring: false, echo: 2915.4 } });
  // (its distance set while running: 120 cm, its next echo 6997 µs; out of range refused)
  sim.setSensed('US1', 'cm', 120);
  assert.equal(sim.sensed('US1', 'cm'), 120);
  assert.throws(() => sim.setSensed('US1', 'cm', 500), /^Error: US1's cm: from 2 to 400 cm$/);
  assert.throws(() => sim.setSensed('S1', 'cm', 50), /^Error: S1 senses no cm in the circuit$/);
  sim.set('S1', true); sim.run(); sim.advance(20 * US); sim.set('S1', false); sim.run();
  sim.advance(sim.nextWake() - sim.time); sim.advance(sim.nextWake() - sim.time);
  assert.deepEqual(sim.sonars().US1, { cm: 120, measuring: false, echo: 6997.1 });
  // (unpowered: its Echo open, no measure)
  const off = live(bench({ power: false }));
  assert.deepEqual(off.seen, ['Z', null]);
});

test('#5456 the sensor saved: its distance normalized (in its range, whole cm, else 100), edited in its range; its checks; the library\'s part', () => {
  const cmOf = (cm) => normalizeCircuit({ name: 'c', parts: [{ id: 'US1', type: 'hc-sr04', x: 0, y: 0, cm }] }).parts[0].cm;
  assert.deepEqual([cmOf(undefined), cmOf(57.4), cmOf(1), cmOf(999), cmOf('x')], [100, 57, 2, 400, 100]);
  const m = bench();
  assert.equal(setPartProps(m, 'US1', { cm: 75 }).error ?? null, null);
  assert.match(setPartProps(bench(), 'US1', { cm: 401 }).error, /^cm: .* from 2 to 400 cm$/);
  const lines = (c) => checkCircuit(c).map((x) => `${x.severity}: ${x.message}`);
  assert.deepEqual(lines(bench()), []);
  assert.deepEqual(lines(bench({ power: false })), ['warning: US1 (Ultrasonic range sensor (HC-SR04)) is not powered: its VCC (pin 1) is not on the supply\'s + and its GND (pin 4) is not on the supply\'s −']);
  const noTrig = normalizeCircuit({ ...bench(), wires: bench().wires.filter((w) => w.id !== 'wt'), parts: bench().parts.filter((p) => p.id !== 'S1') });
  assert.deepEqual(lines(noTrig), ['warning: US1\'s Trig (pin 2) is driven by nothing: it never measures']);
  assert.deepEqual(lines(normalizeCircuit({ name: 'c', parts: [{ id: 'US1', type: 'hc-sr04', x: 0, y: 0 }] })), ['warning: US1 (Ultrasonic range sensor (HC-SR04)) joins nothing']);
  assert.deepEqual([PARTS['hc-sr04'], HC_SR04.pins.map((p) => `${p.name} ${p.dir}`), PART_ORDER.indexOf('hc-sr04') > 0, EXPORTED_PARTS.includes('hc-sr04')], [HC_SR04, ['VCC vcc', 'Trig in', 'Echo out', 'GND gnd'], true, false]);
  assert.match(partInfo('hc-sr04').about, /^An ultrasonic range sensor/);
});

// the circuit's HDL simulated with a test bench setting the switch as the live run does: the LED's changes
function hdlLines(lang) {
  const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
  const L = ['`timescale 1ns / 1ps', 'module tb;', '  reg S1;', '  wire D1;', '  son dut (.S1(S1), .D1(D1));', '  always @(D1) $display("D1=%b at %0t", D1, $time);', '  initial begin',
    `    S1 = 0; #${US}; S1 = 1; #${12 * US}; S1 = 0; #${5000 * US}; S1 = 1; #${3 * US}; S1 = 0; #${1000 * US};`, '    $finish;', '  end', 'endmodule'];
  const r = simulate([{ path, text: g.code }, { path: 'tb.v', text: L.join('\n') }], 'tb', { until: 1e13 });
  assert.deepEqual(r.errors, [], lang);
  return r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^D1=/.test(x) && !/=x/.test(x));
}

test('#5456 the sensor in the circuit\'s HDL: compiled with no warnings; its echo where the live one\'s is, in VHDL and in Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    const lib = compile([{ path, text: g.code }]), e = elaborate(lib, 'son');
    assert.deepEqual([...lib.errors, ...e.diags, ...designChecks(lib, e, { lint: true })].map((x) => `${x.severity}: ${x.message}`), [], `${lang}: no warnings`);
    assert.deepEqual(hdlLines(lang), ['D1=0 at 0', 'D1=1 at 473000', 'D1=0 at 3388450'], lang);
  }
});

test('#5456 an Arduino triggering the sensor on D8 and timing its echo on D7 with Timer1 (0.5 µs a count) through a System\'s circuit node', async () => {
  const { normalizeSystem } = await import('../core/system-doc.js');
  const { systemInputs, systemFromInputs, systemReport } = await import('../core/system-run.js');
  const { loadAvr8js } = await import('../core/system-sim-avr.js');
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  await loadAvr8js();
  const uno = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return [q.dx, q.dy]; };
  const circ = normalizeCircuit({ name: 'bench', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'US1', type: 'hc-sr04', x: 30, y: 30, cm: 50 }],
    wires: [{ id: 'v', points: [uno('5V'), [30, 30]] }, { id: 't', points: [uno('D8'), [31, 30]] }, { id: 'e', points: [uno('D7'), [32, 30]] }, { id: 'g', points: [uno('GND'), [33, 30]] }] });
  // PB0 (D8) an output, Timer1 at clk/8; Trig 1 for about 13 µs; Echo (PD7) waited for, TCNT1 cleared, its fall waited for,
  // TCNT1 stored at 0x100
  const prog = ['ldi r16, 0x01', 'out 0x04, r16', 'ldi r16, 0x02', 'sts 0x81, r16',
    'ldi r16, 0x01', 'out 0x05, r16', 'ldi r17, 70', 'trig:', 'dec r17', 'brne trig', 'ldi r16, 0x00', 'out 0x05, r16',
    'rise:', 'in r16, 0x09', 'sbrs r16, 7', 'rjmp rise', 'ldi r16, 0x00', 'sts 0x85, r16', 'sts 0x84, r16',
    'fall:', 'in r16, 0x09', 'sbrc r16, 7', 'rjmp fall', 'lds r24, 0x84', 'lds r25, 0x85', 'sts 0x100, r24', 'sts 0x101, r25', 'end:', 'rjmp end'];
  const sys = normalizeSystem({ format: 'silinx-system', version: 2, name: 's', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/sonar.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] }], links: [] });
  const inputs = await systemInputs(sys, { firmware: async () => intelHex(avrAssemble(prog)), circuit: async () => JSON.stringify(circ), netlist: () => null });
  const r = systemFromInputs(sys, inputs);
  r.sim.run(10e9);
  const data = r.sim.nodes.get('uno').cpu.data, counts = data[0x100] | (data[0x101] << 8);
  // (2915.45 µs: 5831 counts, give or take the loop's few cycles; 50 cm)
  assert.ok(Math.abs(counts - 5831) <= 2, `${counts} counts`);
  assert.equal(Math.round(counts / 2 / 58.309), 50);
  const rep = systemReport(r);
  assert.equal(rep.lines.find((l) => l.startsWith('circuit bench: US1')), 'circuit bench: US1 50 cm, its last echo 2915.4 µs');
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});
