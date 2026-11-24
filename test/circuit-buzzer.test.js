// A buzzer (#5454, core/circuit-buzzer.js): driven steadily it sounds at its own tone (2.3 kHz), with a square wave at the
// wave's frequency (from rise to rise), silent at 0; a tone a person cannot hear said once; in a circuit (its + a switch's,
// the wave timed by the simulation), its − off GND silent; its checks; its HDL compiled with no warnings, what it says the
// live one's in VHDL and in Verilog; an Arduino's Timer1 toggling OC1A (D9) at 440 Hz through a System's circuit node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBuzzer, BUZZER, BUZZER_HZ } from '../core/circuit-buzzer.js';
import { normalizeCircuit } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { PARTS, PART_ORDER } from '../core/circuit-parts.js';
import { partInfo } from '../core/circuit-part-info.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';

const MS = 1e6;   // (ns)

test('#5454 the buzzer: silent, on (its own tone), a wave\'s tone from rise to rise, steady again after it; an unheard tone said once', () => {
  const b = createBuzzer();
  assert.deepEqual(b.state(0), { sounding: false, hz: null, how: 'off' });
  b.edge('1', 0);
  assert.deepEqual(b.state(10 * MS), { sounding: true, hz: BUZZER_HZ, how: 'on' });
  // (a 440 Hz square wave: a rise every 2.2727 ms)
  const half = 1e9 / 440 / 2;
  for (let k = 1; k < 20; k++) b.edge(k % 2 ? '0' : '1', 10 * MS + k * half);
  assert.deepEqual(b.state(10 * MS + 20 * half), { sounding: true, hz: 440, how: 'tone' });
  // (stopped at 0: silent once 50 ms passed; at 1: its own tone)
  b.edge('0', 60 * MS);
  assert.deepEqual([b.state(61 * MS).how, b.state(200 * MS).how], ['tone', 'off']);
  b.edge('1', 300 * MS);
  assert.deepEqual(b.state(301 * MS).how, 'on');
  // (10 Hz and 25 kHz: said once)
  const u = createBuzzer();
  for (let k = 0; k < 6; k++) u.edge(k % 2 ? '0' : '1', k * 20 * MS);
  for (let k = 0; k < 6; k++) u.edge(k % 2 ? '0' : '1', 200 * MS + k * 20000);
  assert.deepEqual(u.warnings.map((w) => w.text), ['a tone of 25000 Hz: a person hears 20 Hz to 20 kHz']);
  // (a 10 Hz wave: rises 100 ms apart, past its 50 ms: on, then on again, no tone)
  assert.equal(createBuzzer().state(0).hz, null);
});

// a circuit: the buzzer's + a logic switch's (S1), its − on GND (or not)
const bench = ({ gnd = true } = {}) => normalizeCircuit({ name: 'buzz', parts: [{ id: 'P1', type: 'supply', x: -4, y: -10 }, { id: 'BZ1', type: 'buzzer', x: 0, y: 0 },
  { id: 'S1', type: 'logic-switch', x: 0, y: 4 }],
wires: [{ id: 'ws', points: [[0, 4], [0, 0]] }, ...(gnd ? [{ id: 'wg', points: [[3, 0], [-4, -9]] }] : [])] });
// the live one: on for 100 ms, then a 1 kHz wave for 20 ms, then 0
function live(m) {
  const sim = createCircuitSim(m);
  sim.run();
  const seen = [];
  sim.set('S1', true); sim.run(); sim.advance(100 * MS); seen.push(sim.buzzers().BZ1);
  for (let k = 0; k < 40; k++) { sim.set('S1', k % 2 === 1); sim.advance(0.5 * MS); }
  seen.push(sim.buzzers().BZ1);
  sim.set('S1', false); sim.advance(100 * MS); seen.push(sim.buzzers().BZ1);
  return { sim, seen };
}

test('#5454 the buzzer in a circuit: on, a 1 kHz tone, silent; its − off GND: silent', () => {
  assert.deepEqual(live(bench()).seen, [{ sounding: true, hz: 2300, how: 'on' }, { sounding: true, hz: 1000, how: 'tone' }, { sounding: false, hz: null, how: 'off' }]);
  assert.deepEqual(live(bench({ gnd: false })).seen.map((s) => s.how), ['off', 'off', 'off']);
});

test('#5454 the buzzer\'s checks: its − off GND, its + driven by nothing, joined to nothing; the library\'s part, its details', () => {
  const lines = (m) => checkCircuit(m).map((x) => `${x.severity}: ${x.message}`);
  assert.deepEqual(lines(bench()), []);
  assert.deepEqual(lines(bench({ gnd: false })).filter((l) => /BZ1/.test(l)), ['warning: BZ1 (Buzzer (active, 5 V)): its − (pin 2) is not on the supply\'s −: it never sounds']);
  const alone = normalizeCircuit({ name: 'c', parts: [{ id: 'P1', type: 'supply', x: -4, y: -10 }, { id: 'BZ1', type: 'buzzer', x: 0, y: 0 }], wires: [{ id: 'wg', points: [[3, 0], [-4, -9]] }] });
  assert.deepEqual(lines(alone), ['warning: BZ1\'s + (pin 1) is driven by nothing: it stays silent']);
  assert.deepEqual(lines(normalizeCircuit({ name: 'c', parts: [{ id: 'BZ1', type: 'buzzer', x: 0, y: 0 }] })), ['warning: BZ1 (Buzzer (active, 5 V)) joins nothing']);
  assert.deepEqual([PARTS.buzzer, BUZZER.pins.map((p) => `${p.name} ${p.dir}`), PART_ORDER.indexOf('buzzer') > 0], [BUZZER, ['+ in', '− gnd'], true]);
  assert.match(partInfo('buzzer').about, /^An active buzzer/);
});

// the circuit's HDL simulated with a test bench setting the switch as the live run does: what it says
function hdlLines(lang) {
  const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
  const L = ['`timescale 1ns / 1ps', 'module tb;', '  reg S1;', '  integer k;', '  buzz dut (.S1(S1));', '  initial begin', `    S1 = 0; #100; S1 = 1; #${100 * MS};`,
    `    for (k = 0; k < 40; k = k + 1) begin S1 = k % 2; #${0.5 * MS}; end`, `    S1 = 0; #${100 * MS};`, '    $finish;', '  end', 'endmodule'];
  const r = simulate([{ path, text: g.code }, { path: 'tb.v', text: L.join('\n') }], 'tb', { until: 1e13 });
  assert.deepEqual(r.errors, [], lang);
  return r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^BZ1 /.test(x));
}

test('#5454 the buzzer in the circuit\'s HDL: compiled with no warnings; it says it is on, then its tone, in VHDL and in Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    const lib = compile([{ path, text: g.code }]), e = elaborate(lib, 'buzz');
    assert.deepEqual([...lib.errors, ...e.diags, ...designChecks(lib, e, { lint: true })].map((x) => `${x.severity}: ${x.message}`), [], `${lang}: no warnings`);
    assert.deepEqual(hdlLines(lang), ['BZ1 on', 'BZ1 1000 Hz'], lang);
  }
});

test('#5454 an Arduino\'s Timer1 toggling OC1A (D9) at 440 Hz (CTC, prescaler 8) sounding the buzzer through a System\'s circuit node', async () => {
  const { normalizeSystem } = await import('../core/system-doc.js');
  const { systemInputs, systemFromInputs, systemReport } = await import('../core/system-run.js');
  const { loadAvr8js } = await import('../core/system-sim-avr.js');
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  await loadAvr8js();
  const uno = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return [q.dx, q.dy]; };
  const circ = normalizeCircuit({ name: 'bench', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'BZ1', type: 'buzzer', x: 30, y: 30 }],
    wires: [{ id: 's', points: [uno('D9'), [30, 30]] }, { id: 'g', points: [uno('GND'), [33, 30]] }] });
  // Timer1 CTC (mode 4), OC1A toggled on compare (COM1A0), prescaler 8 (2 MHz): OCR1A 2272 (a half period of 440 Hz: 1136 µs
  // is 2272 counts, 2273 a period's half: 439.9 Hz, said 440)
  const prog = ['ldi r16, 0x08', 'sts 0x89, r16', 'ldi r16, 0xe0', 'sts 0x88, r16', 'ldi r16, 0x40', 'sts 0x80, r16', 'ldi r16, 0x0a', 'sts 0x81, r16',
    'ldi r16, 0x02', 'out 0x04, r16', 'end:', 'rjmp end'];
  const sys = normalizeSystem({ format: 'silinx-system', version: 1, name: 's', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/tone.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] }], links: [] });
  const inputs = await systemInputs(sys, { firmware: async () => intelHex(avrAssemble(prog)), circuit: async () => JSON.stringify(circ), netlist: () => null });
  const r = systemFromInputs(sys, inputs);
  r.sim.run(100e9);
  assert.deepEqual(r.sim.nodes.get('bench').buzzers().BZ1, { sounding: true, hz: 440, how: 'tone' });
  const rep = systemReport(r);
  assert.equal(rep.lines.find((l) => l.startsWith('circuit bench: BZ1')), 'circuit bench: BZ1 sounds at 440 Hz');
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});
