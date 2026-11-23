// The servo SG90 (#5347, core/circuit-servo.js): each pulse's width the angle it asks for (0.5 ms 0°, 2.5 ms 180°, linear,
// a whole degree; beyond: its end), its arm moving at 60° in 0.1 s; a width or a period that is no servo's said once; in
// a circuit (its signal a switch's, its pulses timed by the simulation), unpowered still; its checks; its HDL compiled with
// no warnings, the angles it says the live one's in VHDL and in Verilog; an Arduino's Timer1 PWM on D9 moving it through a
// System's circuit node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServo, servoAngle, SERVO_SG90 } from '../core/circuit-servo.js';
import { normalizeCircuit } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { PARTS } from '../core/circuit-parts.js';
import { partInfo } from '../core/circuit-part-info.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';

const MS = 1e6;   // (ns)

test('#5347 a pulse\'s width as an angle: 0.5 ms 0°, 1.5 ms 90°, 2.5 ms 180°, a whole degree, its ends beyond', () => {
  assert.deepEqual([0.5, 1, 1.5, 2, 2.5, 0.2, 3, 1.2345].map(servoAngle), [0, 45, 90, 135, 180, 0, 180, 66]);
});

test('#5347 the servo: its arm moving at 60° in 0.1 s toward each pulse\'s angle; a width and a period that are no servo\'s said once', () => {
  const s = createServo();
  const pulse = (t, w) => { s.edge('1', t); s.edge('0', t + w * MS); };
  assert.deepEqual(s.state(0), { angle: 90, target: 90, width: null, period: null });
  pulse(0, 2.5);   // (to 180°: 150 ms)
  assert.deepEqual([s.state(2.5 * MS).angle, s.state(52.5 * MS).angle, s.state(152.5 * MS).angle, s.state(500 * MS).angle], [90, 120, 180, 180]);
  pulse(500 * MS, 0.5);   // (to 0°, from 180°: 300 ms; its period 500 ms, no servo's)
  assert.deepEqual([s.state(500.5 * MS).target, s.state(650.5 * MS).angle, s.state(500 * MS).period], [0, 90, 500]);
  pulse(520 * MS, 4);
  pulse(540 * MS, 4);
  assert.deepEqual(s.warnings.map((w) => w.text), ['its pulses 500 ms apart: a servo\'s come every 20 ms (10 to 30)', 'a pulse of 4 ms: a servo\'s are 0.5 to 2.5 ms']);
  // (its signal lost: still where it is)
  const r = createServo();
  r.edge('1', 0); r.edge('0', 2.5 * MS); r.stop(52.5 * MS);
  assert.deepEqual([r.state(52.5 * MS).angle, r.state(500 * MS).angle], [120, 120]);
});

// a circuit: the servo powered, its signal a logic switch's (S1), pulses timed by advancing the simulation
const bench = ({ power = true, signal = true } = {}) => normalizeCircuit({ name: 'servo', parts: [{ id: 'P1', type: 'supply', x: -4, y: -10 }, { id: 'M1', type: 'servo-sg90', x: 0, y: 0 },
  ...(signal ? [{ id: 'S1', type: 'logic-switch', x: 2, y: 4 }] : [])],
wires: [...(power ? [{ id: 'wg', points: [[0, 0], [-4, -9]] }, { id: 'wv', points: [[1, 0], [-4, -10]] }] : []), ...(signal ? [{ id: 'ws', points: [[2, 4], [2, 0]] }] : [])] });
const WIDTHS = [2, 2, 1, 0.6, 3.2, 1.5];
// the live one: each pulse every 20 ms, the angles it asks for as they change
function live(m) {
  const sim = createCircuitSim(m);
  sim.run();
  const said = [];
  let last = 90;
  for (const w of WIDTHS) {
    sim.set('S1', true); sim.advance(w * MS); sim.set('S1', false); sim.advance((20 - w) * MS);
    const t = sim.servos().M1.target;
    if (t !== last) { said.push(`M1 to ${t}`); last = t; }
  }
  return { sim, said };
}

test('#5347 the servo in a circuit: its pulses timed, its targets, its arm; no warning but a width that is no servo\'s; unpowered: still', () => {
  const { sim, said } = live(bench());
  assert.deepEqual(said, ['M1 to 135', 'M1 to 45', 'M1 to 9', 'M1 to 180', 'M1 to 90']);
  assert.deepEqual(sim.servoWarnings(), ['M1: a pulse of 3.2 ms: a servo\'s are 0.5 to 2.5 ms']);
  assert.equal(sim.servos().M1.period, 20);
  sim.advance(200 * MS);
  assert.equal(sim.servos().M1.angle, 90);
  // (unpowered: its pulses not read)
  const off = live(bench({ power: false }));
  assert.deepEqual([off.said, off.sim.servos().M1.angle], [[], 90]);
});

test('#5347 the servo\'s checks: powered, its signal driven, joined to nothing; the library\'s part, its details', () => {
  const lines = (m) => checkCircuit(m).map((x) => `${x.severity}: ${x.message}`);
  assert.deepEqual(lines(bench()), []);
  assert.deepEqual(lines(bench({ power: false })).filter((l) => /M1/.test(l)), ['warning: M1 (Servo (SG90, PWM)) is not powered: its VCC (pin 2) is not on the supply\'s + and its GND (pin 1) is not on the supply\'s −']);
  assert.deepEqual(lines(bench({ signal: false })), ['warning: M1\'s signal (pin 3) is driven by nothing: its arm stays where it is']);
  assert.deepEqual(lines(normalizeCircuit({ name: 'c', parts: [{ id: 'M1', type: 'servo-sg90', x: 0, y: 0 }] })), ['warning: M1 (Servo (SG90, PWM)) joins nothing']);
  // (its signal an Arduino's pin: its program's, in a System)
  const uno = normalizeCircuit({ name: 'c', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0 }, { id: 'M1', type: 'servo-sg90', x: 30, y: 30 }],
    wires: [{ id: 'g', points: [[3, 0], [30, 30]] }, { id: 'v', points: [[5, 19], [31, 30]] }, { id: 's', points: [[8, 0], [32, 30]] }] });
  assert.deepEqual(lines(uno), []);
  assert.deepEqual([PARTS['servo-sg90'].kind, SERVO_SG90.pins.map((p) => `${p.name} ${p.dir}`)], ['servo', ['GND gnd', 'VCC vcc', 'SIG in']]);
  assert.match(partInfo('servo-sg90').about, /^Its arm at the angle its signal's pulses ask for/);
});

// the circuit's HDL simulated with a test bench setting the switch as the live run does: the angles it says
function hdlLines(lang) {
  const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
  const L = ['`timescale 1ns / 1ps', 'module tb;', '  reg S1;', '  servo dut (.S1(S1));', '  initial begin', '    S1 = 0; #100;'];
  for (const w of WIDTHS) L.push(`    S1 = 1; #${w * MS} S1 = 0; #${(20 - w) * MS};`);
  L.push('    $finish;', '  end', 'endmodule');
  const r = simulate([{ path, text: g.code }, { path: 'tb.v', text: L.join('\n') }], 'tb', { until: 1e13 });
  assert.deepEqual(r.errors, [], lang);
  return r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^M1 /.test(x));
}

test('#5347 the servo in the circuit\'s HDL: compiled with no warnings, the angles it says the live one\'s, in VHDL and in Verilog', () => {
  const { said } = live(bench());
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    const lib = compile([{ path, text: g.code }]), e = elaborate(lib, 'servo');
    assert.deepEqual([...lib.errors, ...e.diags, ...designChecks(lib, e, { lint: true })].map((x) => `${x.severity}: ${x.message}`), [], `${lang}: no warnings`);
    assert.deepEqual(hdlLines(lang), said, lang);
  }
});

test('#5347 an Arduino\'s Timer1 PWM on D9 (fast PWM, 20 ms, 2 ms pulses) moving the servo through a System\'s circuit node to 135°', async () => {
  const { normalizeSystem } = await import('../core/system-doc.js');
  const { systemInputs, systemFromInputs, systemReport } = await import('../core/system-run.js');
  const { loadAvr8js } = await import('../core/system-sim-avr.js');
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  const { analyzeSystem } = await import('../core/system-check.js');
  await loadAvr8js();
  const uno = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return [q.dx, q.dy]; };
  const circ = normalizeCircuit({ name: 'bench', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'M1', type: 'servo-sg90', x: 30, y: 30 }],
    wires: [{ id: 'g', points: [uno('GND'), [30, 30]] }, { id: 'v', points: [uno('5V'), [31, 30]] }, { id: 's', points: [uno('D9'), [32, 30]] }] });
  // Timer1: fast PWM to ICR1 (mode 14), prescaler 8 (2 MHz), ICR1 39999 (20 ms), OCR1A 3999 (2 ms), OC1A (D9) an output
  const prog = ['ldi r16, 0x9c', 'sts 0x87, r16', 'ldi r16, 0x3f', 'sts 0x86, r16', 'ldi r16, 0x0f', 'sts 0x89, r16', 'ldi r16, 0x9f', 'sts 0x88, r16',
    'ldi r16, 0x82', 'sts 0x80, r16', 'ldi r16, 0x1a', 'sts 0x81, r16', 'ldi r16, 0x02', 'out 0x04, r16', 'end:', 'rjmp end'];
  const sys = normalizeSystem({ format: 'silinx-system', version: 1, name: 's', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/servo.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] }], links: [] });
  assert.deepEqual(analyzeSystem(sys, { modules: {}, files: ['fw/servo.hex', 'src/bench.circ.json'], circuits: { 'src/bench.circ.json': circ } }).diags, [], 'checked: no warnings');
  const inputs = await systemInputs(sys, { firmware: async () => intelHex(avrAssemble(prog)), circuit: async () => JSON.stringify(circ), netlist: () => null });
  const r = systemFromInputs(sys, inputs);
  r.sim.run(200e9);
  const s = r.sim.nodes.get('bench').servos().M1, rep = systemReport(r);
  // (its pulse 4000 counts at 2 MHz, seen through the circuit node's wires: 2 ms to a microsecond)
  assert.deepEqual([s.target, s.angle, Math.round(s.width * 1000) / 1000, Math.round(s.period * 1000) / 1000], [135, 135, 2, 20]);
  assert.equal(rep.lines.find((l) => l.startsWith('circuit bench: M1')), 'circuit bench: M1 at 135°, its last pulse 2 ms');
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});
