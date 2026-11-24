// A motion sensor, a PIR HC-SR501 (#5463, core/circuit-pir.js): someone moving sets OUT for its hold time; retriggering,
// for its hold time after the last movement; single, its hold time from the rise; blind 2.5 s after, retriggered then if
// they still move; unpowered, OUT open; in a circuit (its input someone moving, its own wake-ups timing OUT); its hold time
// and jumper saved, normalized and edited; its checks; its HDL compiled with no warnings, its OUT where the live one's is
// in VHDL and in Verilog, in both modes; an Arduino reading it on D2 and lighting its LED through a System's circuit node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPir, HC_SR501, PIR_BLOCK } from '../core/circuit-pir.js';
import { normalizeCircuit, circuitPorts } from '../core/circuit.js';
import { setPartProps } from '../core/circuit-edit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { PARTS, PART_ORDER } from '../core/circuit-parts.js';
import { partInfo } from '../core/circuit-part-info.js';
import { EXPORTED_PARTS } from '../core/kicad-export.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';

const S = 1e9;   // (ns)

test('#5463 the sensor: retriggering, its hold time after the last movement; single, from the rise; blind 2.5 s, retriggered then', () => {
  const p = createPir({ hold: 3 });
  assert.deepEqual(p.step(0, false), { out: '0', next: null });
  assert.deepEqual(p.step(1 * S, true), { out: '1', next: 4 * S });
  assert.deepEqual(p.step(2 * S, true), { out: '1', next: 5 * S }, 'still moving: its end later');
  assert.deepEqual(p.step(3 * S, false), { out: '1', next: 6 * S }, 'the last movement');
  assert.deepEqual(p.step(4 * S, false), { out: '1', next: null }, 'an early wake-up: nothing');
  assert.deepEqual(p.step(6 * S, false), { out: '0', next: 6 * S + PIR_BLOCK });
  assert.deepEqual(p.state(), { moving: false, out: false, blind: true });
  assert.deepEqual(p.step(7 * S, true), { out: '0', next: null }, 'blind');
  assert.deepEqual(p.step(8.5 * S, true), { out: '1', next: 11.5 * S }, 'still moving after: on again');
  // (single: its hold time from the rise, whatever they do)
  const q = createPir({ hold: 5, retrigger: false });
  q.step(0, true);
  assert.deepEqual([q.step(2 * S, false), q.step(3 * S, true), q.step(5 * S, true)], [{ out: '1', next: null }, { out: '1', next: null }, { out: '0', next: 5 * S + PIR_BLOCK }]);
  q.reset();
  assert.deepEqual(q.state(), { moving: false, out: false, blind: false });
});

// a circuit: the sensor powered (or not), its OUT lighting an LED (D1)
const bench = ({ power = true, retrigger = true, hold = 3 } = {}) => normalizeCircuit({ name: 'pir', parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 },
  { id: 'PIR1', type: 'hc-sr501', x: 0, y: 0, hold, retrigger }, { id: 'D1', type: 'led', x: 1, y: 4 }],
wires: [{ id: 'o', points: [[1, 0], [1, 4]] }, { id: 'k', points: [[2, 4], [3, 4], [3, 3], [-10, 3], [-10, -13]] },
  ...(power ? [{ id: 'v', points: [[0, 0], [-12, 0], [-12, -14], [-10, -14]] }, { id: 'g', points: [[2, 0], [4, 0], [4, 2], [-11, 2], [-11, -13], [-10, -13]] }] : [])] });
// the live one, as the test bench below: moving 1 s to 3 s, then 13 s to 21 s; the LED's changes
function live(m) {
  const sim = createCircuitSim(m), seen = [];
  let lit = null;
  const look = () => { const v = sim.leds().D1; if (v !== lit) { seen.push(`D1=${v === 'on' ? 1 : 0} at ${sim.time}`); lit = v; } };
  const until = (t) => { for (;;) { const w = sim.nextWake(); if (w == null || w > t) break; sim.advance(w - sim.time); look(); } sim.advance(t - sim.time); look(); };
  sim.run(); look();
  for (const [t, v] of [[1 * S, true], [3 * S, false], [13 * S, true], [21 * S, false]]) { until(t); sim.set('PIR1', v); sim.run(); look(); }
  until(31 * S);
  return { sim, seen };
}
const RETRIG = ['D1=0 at 0', 'D1=1 at 1000000000', 'D1=0 at 6000000000', 'D1=1 at 13000000000', 'D1=0 at 24000000000'];
const SINGLE = ['D1=0 at 0', 'D1=1 at 1000000000', 'D1=0 at 4000000000', 'D1=1 at 13000000000', 'D1=0 at 16000000000', 'D1=1 at 18500000000', 'D1=0 at 21500000000'];

test('#5463 the sensor in a circuit: its input someone moving, its OUT lighting an LED at its own times, in both modes; unpowered, its OUT open', () => {
  assert.deepEqual(live(bench()).seen, RETRIG);
  assert.deepEqual(live(bench({ retrigger: false })).seen, SINGLE);
  const off = createCircuitSim(bench({ power: false }));
  off.run(); off.set('PIR1', true); off.run();
  assert.deepEqual([off.pin('PIR1', 2), off.nextWake(), off.pirs().PIR1], ['Z', null, { moving: false, out: false, blind: false }]);
  assert.deepEqual(circuitPorts(bench()).inputs.map((x) => x.name), ['PIR1']);
});

test('#5463 the sensor saved: its hold time (3..300 s, whole) and jumper normalized and edited; its checks; the library\'s part', () => {
  const of = (p) => normalizeCircuit({ name: 'c', parts: [{ id: 'PIR1', type: 'hc-sr501', x: 0, y: 0, ...p }] }).parts[0];
  assert.deepEqual([of({}), of({ hold: 7.6, retrigger: false }), of({ hold: 1 }), of({ hold: 999 })].map((p) => [p.hold, p.retrigger]), [[3, true], [8, false], [3, true], [300, true]]);
  const m = bench();
  assert.equal(setPartProps(m, 'PIR1', { hold: 10, retrigger: false }).error ?? null, null);
  assert.equal(setPartProps(bench(), 'PIR1', { hold: 2 }).error, 'hold: a time from 3 to 300 s');
  const lines = (c) => checkCircuit(c).map((x) => `${x.severity}: ${x.message}`);
  assert.deepEqual(lines(bench()), []);
  assert.deepEqual(lines(bench({ power: false })), ['warning: PIR1 (Motion sensor (PIR, HC-SR501)) is not powered: its VCC (pin 1) is not on the supply\'s + and its GND (pin 3) is not on the supply\'s −']);
  assert.deepEqual(lines(normalizeCircuit({ name: 'c', parts: [{ id: 'PIR1', type: 'hc-sr501', x: 0, y: 0 }] })), ['warning: PIR1 (Motion sensor (PIR, HC-SR501)) joins nothing']);
  assert.deepEqual([PARTS['hc-sr501'], HC_SR501.pins.map((p) => `${p.name} ${p.dir}`), PART_ORDER.indexOf('hc-sr501') > 0, EXPORTED_PARTS.includes('hc-sr501')], [HC_SR501, ['VCC vcc', 'OUT out', 'GND gnd'], true, false]);
  assert.match(partInfo('hc-sr501').about, /^A motion sensor \(PIR\)/);
});

// the circuit's HDL simulated with a test bench moving in front of it as the live run does: the LED's changes
function hdlLines(m, lang) {
  const g = generateCircuit(m, lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
  const L = ['`timescale 1ns / 1ps', 'module tb;', '  reg PIR1;', '  wire D1;', '  pir dut (.PIR1(PIR1), .D1(D1));', '  always @(D1) if (D1 !== 1\'bx) $display("D1=%b at %0t", D1, $time);',
    `  initial begin PIR1 = 0; #${S}; PIR1 = 1; #${2 * S}; PIR1 = 0; #${10 * S}; PIR1 = 1; #${8 * S}; PIR1 = 0; #${10 * S}; $finish; end`, 'endmodule'];
  const r = simulate([{ path, text: g.code }, { path: 'tb.v', text: L.join('\n') }], 'tb', { until: 1e16 });
  assert.deepEqual(r.errors, [], lang);
  return r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^D1=/.test(x));
}

test('#5463 the sensor in the circuit\'s HDL: compiled with no warnings; its OUT where the live one\'s is, in VHDL and in Verilog, in both modes', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    const lib = compile([{ path, text: g.code }]), e = elaborate(lib, 'pir');
    assert.deepEqual([...lib.errors, ...e.diags, ...designChecks(lib, e, { lint: true })].map((x) => `${x.severity}: ${x.message}`), [], `${lang}: no warnings`);
    assert.deepEqual(hdlLines(bench(), lang), RETRIG, `${lang} retriggering`);
    assert.deepEqual(hdlLines(bench({ retrigger: false }), lang), SINGLE, `${lang} single`);
  }
});

test('#5463 an Arduino reading the sensor\'s OUT on D2 and lighting its LED (D13) through a System\'s circuit node', async () => {
  const { normalizeSystem } = await import('../core/system-doc.js');
  const { systemInputs, systemFromInputs, systemReport } = await import('../core/system-run.js');
  const { loadAvr8js } = await import('../core/system-sim-avr.js');
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  await loadAvr8js();
  const uno = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return [q.dx, q.dy]; };
  const circ = normalizeCircuit({ name: 'bench', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'PIR1', type: 'hc-sr501', x: 30, y: 30 }],
    wires: [{ id: 'v', points: [uno('5V'), [30, 30]] }, { id: 'o', points: [uno('D2'), [31, 30]] }, { id: 'g', points: [uno('GND'), [32, 30]] }] });
  // D13 (PB5) an output; PD2 read again and again, copied to it
  const prog = ['ldi r16, 0x20', 'out 0x04, r16', 'loop:', 'in r16, 0x09', 'sbrs r16, 2', 'rjmp off', 'ldi r17, 0x20', 'out 0x05, r17', 'rjmp loop', 'off:', 'ldi r17, 0x00', 'out 0x05, r17', 'rjmp loop'];
  const sys = normalizeSystem({ format: 'silinx-system', version: 1, name: 's', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/pir.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] }], links: [] });
  const inputs = await systemInputs(sys, { firmware: async () => intelHex(avrAssemble(prog)), circuit: async () => JSON.stringify(circ), netlist: () => null });
  const r = systemFromInputs(sys, inputs);
  const PS = 1e12, led = () => r.sim.nodes.get('uno').value('D13');
  r.sim.run(0.5 * PS);
  const seen = [led()];
  r.sim.nodes.get('bench').setInput('PIR1', true);
  r.sim.run(1 * PS); seen.push(led());
  r.sim.nodes.get('bench').setInput('PIR1', false);
  r.sim.run(3.9 * PS); seen.push(led());
  const rep = systemReport(r);
  assert.equal(rep.lines.find((l) => l.startsWith('circuit bench: PIR1')), 'circuit bench: PIR1 sees movement (OUT 1)');
  r.sim.run(4.1 * PS); seen.push(led());
  assert.deepEqual(seen, [0, 1, 1, 0], 'its 3 s from the last movement, at 1 s');
  assert.equal(systemReport(r).lines.find((l) => l.startsWith('circuit bench: PIR1')), 'circuit bench: PIR1 blind (OUT 0)');
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});
