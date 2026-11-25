// A stepper motor, a 28BYJ-48 on its ULN2003 board (#5476, core/circuit-stepper.js): its coils' patterns in order turn
// it, half steps and full steps, either way (4096 half steps a turn); a jump it cannot follow and a step too soon not
// followed, said once; no coil or three: still; in a circuit (its inputs four switches, its board's power) unpowered it
// does not turn; its checks; its HDL compiled with no warnings, where it stops the live one's in VHDL and in Verilog; an
// Arduino stepping it 512 half steps (45°) through a System's circuit node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStepper, STEPPER_28BYJ48, STEPPER } from '../core/circuit-stepper.js';
import { normalizeCircuit } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { PARTS, PART_ORDER } from '../core/circuit-parts.js';
import { partInfo } from '../core/circuit-part-info.js';
import { EXPORTED_PARTS } from '../core/kicad-export.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';

const MS = 1e6;   // (ns)
const HALF = [1, 3, 2, 6, 4, 12, 8, 9], FULL = [1, 2, 4, 8];

test('#5476 the motor: half and full steps either way; a jump and a step too soon not followed, said once; no coil or three: still', () => {
  const m = createStepper();
  let t = 0;
  for (let i = 1; i <= 16; i++) m.coils(HALF[i % 8], (t += 2 * MS));
  assert.deepEqual(m.state(), { steps: 16, angle: 1.4, coils: [true, false, false, false] });
  // (full steps: two half steps each, back)
  for (let i = 3; i >= 0; i--) m.coils(FULL[i], (t += 2 * MS));
  assert.equal(m.state().steps, 16 - 2 * 4);
  // (the opposite coil: not followed; 0.5 ms after: stalled; neither moves it)
  assert.equal(m.coils(4, (t += 2 * MS)), false);
  assert.equal(m.coils(3, (t += 2 * MS)), true);
  assert.equal(m.coils(2, t + 0.5 * MS), false);
  assert.deepEqual(m.warnings.map((w) => w.text), ['a jump of 4 half steps: its rotor cannot follow it (in order: A, AB, B, BC, C, CD, D, DA)', 'steps 0.5 ms apart: a 28BYJ-48 follows one every 1 ms at most, it stalls']);
  // (no coil, three coils: still)
  assert.deepEqual([m.coils(0, (t += 2 * MS)), m.coils(7, (t += 2 * MS)), m.state().steps], [false, false, 9]);
  // (a whole turn: 4096 half steps, back at 0°)
  const n = createStepper();
  for (let i = 1; i <= STEPPER.turn; i++) n.coils(HALF[i % 8], i * MS);
  assert.deepEqual([n.state().steps, n.state().angle], [4096, 0]);
});

// a circuit: the motor's IN1..IN4 four switches, its board powered (or not)
const bench = ({ power = true } = {}) => normalizeCircuit({ name: 'st', parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 }, { id: 'M1', type: 'stepper-28byj48', x: 0, y: 0 },
  ...[0, 1, 2, 3].map((k) => ({ id: `S${k + 1}`, type: 'logic-switch', x: k, y: 4 }))],
wires: [...[0, 1, 2, 3].map((k) => ({ id: `w${k}`, points: [[k, 4], [k, 0]] })), { id: 'g', points: [[5, 0], [-10, -13]] }, ...(power ? [{ id: 'v', points: [[6, 0], [-10, -14]] }] : [])] });
// the steps: 40 forward 2 ms apart, 50 ms, 16 back, 50 ms; its switches set as each pattern
const PLAN = (() => { const p = []; let t = MS; for (let i = 1; i <= 40; i++) { p.push([t, HALF[i % 8]]); t += 2 * MS; } t += 50 * MS; for (let i = 39; i >= 24; i--) { p.push([t, HALF[i % 8]]); t += 2 * MS; } return { p, end: t + 50 * MS }; })();
function live(m) {
  const sim = createCircuitSim(m), put = (b) => { for (let k = 0; k < 4; k++) sim.set(`S${k + 1}`, !!(b & (1 << k))); sim.run(); };
  sim.run(); put(1);
  const seen = [];
  let last = 0;
  for (const [at, b] of PLAN.p) {
    if (at - last > 20 * MS && sim.steppers().M1.steps !== (seen.at(-1) ?? 0)) seen.push(sim.steppers().M1.steps);
    sim.advance(at - sim.time); put(b); last = at;
  }
  seen.push(sim.steppers().M1.steps);
  return { sim, seen };
}

test('#5476 the motor in a circuit: its switches\' patterns turn it, its LEDs its coils; unpowered still; its checks; the library\'s part', () => {
  const r = live(bench());
  assert.deepEqual(r.seen, [40, 24]);
  assert.deepEqual([r.sim.steppers().M1, r.sim.servoWarnings()], [{ steps: 24, angle: 2.1, coils: [true, false, false, false] }, []]);
  assert.deepEqual(live(bench({ power: false })).sim.steppers().M1, { steps: 0, angle: 0, coils: [false, false, false, false] });
  const lines = (c) => checkCircuit(c).map((x) => `${x.severity}: ${x.message}`);
  assert.deepEqual(lines(bench()), []);
  assert.deepEqual(lines(bench({ power: false })), ['warning: M1 (Stepper motor (28BYJ-48, ULN2003 board)) is not powered: its VCC (pin 6) is not on the supply\'s +']);
  const one = normalizeCircuit({ ...bench(), parts: bench().parts.filter((p) => !['S2', 'S3', 'S4'].includes(p.id)), wires: bench().wires.filter((w) => !['w1', 'w2', 'w3'].includes(w.id)) });
  assert.deepEqual(lines(one), ['warning: M1\'s IN2, IN3, IN4 are driven by nothing: its coils\' cycle is not whole']);
  assert.deepEqual(lines(normalizeCircuit({ name: 'c', parts: [{ id: 'M1', type: 'stepper-28byj48', x: 0, y: 0 }] })), ['warning: M1 (Stepper motor (28BYJ-48, ULN2003 board)) joins nothing']);
  assert.deepEqual([PARTS['stepper-28byj48'], STEPPER_28BYJ48.pins.map((p) => `${p.n} ${p.name} ${p.dx}`), PART_ORDER.indexOf('stepper-28byj48') > 0, EXPORTED_PARTS.includes('stepper-28byj48')],
    [STEPPER_28BYJ48, ['1 IN1 0', '2 IN2 1', '3 IN3 2', '4 IN4 3', '5 GND 5', '6 VCC 6'], true, false]);
  assert.match(partInfo('stepper-28byj48').about, /^A geared stepper motor \(28BYJ-48\) on its ULN2003 board/);
});

// the circuit's HDL simulated with a test bench setting the switches as the live run does: what it says
function hdlLines(lang) {
  const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
  const L = ['`timescale 1ns / 1ps', 'module tb; reg S1, S2, S3, S4; st dut (.S1(S1), .S2(S2), .S3(S3), .S4(S4));', '  initial begin', `    {S4, S3, S2, S1} = 4'b0001; #${MS};`];
  let now = MS;
  for (const [at, b] of PLAN.p) { L.push(`    #${at - now}; {S4, S3, S2, S1} = 4'd${b};`); now = at; }
  L.push(`    #${PLAN.end - now}; $finish;`, '  end', 'endmodule');
  const r = simulate([{ path, text: g.code }, { path: 'tb.v', text: L.join('\n') }], 'tb', { until: 1e16 });
  assert.deepEqual(r.errors, [], lang);
  return r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^M1 /.test(x));
}

test('#5476 the motor in the circuit\'s HDL: compiled with no warnings; where it stops the live one\'s, in VHDL and in Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    const lib = compile([{ path, text: g.code }]), e = elaborate(lib, 'st');
    assert.deepEqual([...lib.errors, ...e.diags, ...designChecks(lib, e, { lint: true })].map((x) => `${x.severity}: ${x.message}`), [], `${lang}: no warnings`);
    assert.deepEqual(hdlLines(lang), live(bench()).seen.map((n) => `M1 at ${n} half steps`), lang);
  }
});

test('#5476 an Arduino stepping the motor on D8..D11, 512 half steps 2 ms apart, its shaft at 45°, through a System\'s circuit node', async () => {
  const { normalizeSystem } = await import('../core/system-doc.js');
  const { systemInputs, systemFromInputs, systemReport } = await import('../core/system-run.js');
  const { loadAvr8js } = await import('../core/system-sim-avr.js');
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  await loadAvr8js();
  const uno = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return [q.dx, q.dy]; };
  const at = (k) => [30 + k, 30];
  const circ = normalizeCircuit({ name: 'bench', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'M1', type: 'stepper-28byj48', x: 30, y: 30 }],
    wires: [...['D8', 'D9', 'D10', 'D11'].map((d, k) => ({ id: `i${k}`, points: [uno(d), at(k)] })), { id: 'g', points: [uno('GND'), at(5)] }, { id: 'v', points: [uno('5V'), at(6)] }] });
  // PB0..PB3 outputs; 64 times the 8 half steps (AB first: each a step), 2 ms apart
  const prog = ['ldi r16, 0x0f', 'out 0x04, r16', 'ldi r21, 64', 'cyc:', ...[3, 2, 6, 4, 12, 8, 9, 1].flatMap((b) => [`ldi r16, ${b}`, 'out 0x05, r16', 'rcall wait']), 'dec r21', 'brne cyc',
    'end:', 'rjmp end', 'wait:', 'ldi r19, 42', 'wa:', 'ldi r20, 255', 'wb:', 'dec r20', 'brne wb', 'dec r19', 'brne wa', 'ret'];
  const sys = normalizeSystem({ format: 'silinx-system', version: 2, name: 's', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/step.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] }], links: [] });
  const inputs = await systemInputs(sys, { firmware: async () => intelHex(avrAssemble(prog)), circuit: async () => JSON.stringify(circ), netlist: () => null });
  const r = systemFromInputs(sys, inputs);
  r.sim.run(1.2e12);
  assert.deepEqual(r.sim.nodes.get('bench').steppers().M1, { steps: 512, angle: 45, coils: [true, false, false, false] });
  const rep = systemReport(r);
  assert.equal(rep.lines.find((l) => l.startsWith('circuit bench: M1')), 'circuit bench: M1 at 512 half steps (45°)');
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});
