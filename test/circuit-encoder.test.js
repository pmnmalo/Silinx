// A rotary encoder, a KY-040 (#5451, core/circuit-encoder.js): its 5 pins (CLK, DT, SW, +, GND), its inputs A, B and SW
// (each a port of the HDL); its pull-ups holding CLK and DT high, a turn joining them to GND in quadrature (A leading
// clockwise, B anticlockwise), 4 quarters a detent; its switch joining SW to GND, no pull-up of its own (floating
// released); its checks and its Part info; its HDL in VHDL and in Verilog, compiled, elaborated and simulated with no
// warnings; an Arduino counting its detents through a System's circuit node (CLK on D2, DT on D3: on CLK's falling
// edge, DT high clockwise), turned as the System Emulator turns it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROTARY_ENCODER, encoderTurn, ENCODER_STEP_NS, ENCODER_DETENTS } from '../core/circuit-encoder.js';
import { PARTS, PART_ORDER } from '../core/circuit-parts.js';
import { normalizeCircuit, circuitPorts } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { partInfo } from '../core/circuit-part-info.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { setBuildChannel } from '../core/build-channel.js';

setBuildChannel('dev');
const lines = (ds) => ds.map((d) => `${d.severity}: ${d.message}`);

test('#5451 the encoder: its pins, its inputs (each a port of the HDL), its contacts and pull-ups; the library, its info', () => {
  assert.equal(PARTS['rotary-encoder'], ROTARY_ENCODER);
  assert.deepEqual(ROTARY_ENCODER.pins.map((p) => `${p.n} ${p.name} ${p.dir} ${p.dx},${p.dy}`), ['1 CLK weak 0,0', '2 DT weak 1,0', '3 SW pass 2,0', '4 + pass 3,0', '5 GND pass 4,0']);
  assert.deepEqual([ENCODER_STEP_NS, ENCODER_DETENTS], [1e6, 20]);
  const m = normalizeCircuit({ name: 'e', parts: [{ id: 'ENC1', type: 'rotary-encoder', x: 0, y: 0 }] });
  assert.deepEqual(circuitPorts(m).inputs.map((x) => x.name), ['ENC1_A', 'ENC1_B', 'ENC1_SW']);
  assert.equal(PART_ORDER.indexOf('rotary-encoder'), PART_ORDER.indexOf('keypad-4x4') + 1);
  assert.match(partInfo('rotary-encoder').about, /^A rotary encoder module \(KY-040\)/);
  assert.deepEqual(lines(checkCircuit(m)), ['warning: ENC1 (Rotary encoder (KY-040)) joins nothing']);
});

test('#5451 a turn: the quadrature sequence, 4 quarters a detent, clockwise A first, anticlockwise B first, each detent both open', () => {
  assert.deepEqual(encoderTurn(1), [[true, false], [true, true], [false, true], [false, false]]);
  assert.deepEqual(encoderTurn(-1), [[false, true], [true, true], [true, false], [false, false]]);
  assert.deepEqual([encoderTurn(3).length, encoderTurn(-2).length, encoderTurn(0), encoderTurn('x')], [12, 8, [], []]);
  // (a Gray code: one contact changes at a time)
  const seq = [[false, false], ...encoderTurn(2), ...encoderTurn(-2)];
  for (let i = 1; i < seq.length; i++) assert.equal(Number(seq[i][0] !== seq[i - 1][0]) + Number(seq[i][1] !== seq[i - 1][1]), 1, `step ${i}`);
});

// an encoder, its GND on a supply's −, CLK, DT and SW each on a probe
function bench() {
  return normalizeCircuit({ name: 'en', parts: [{ id: 'V1', type: 'supply', x: -4, y: 0 }, { id: 'ENC1', type: 'rotary-encoder', x: 0, y: 10 },
    ...[0, 1, 2].map((i) => ({ id: `P${i + 1}`, type: 'probe', x: i, y: 4 }))],
  wires: [{ id: 'g', points: [[4, 10], [-4, 1]] }, ...[0, 1, 2].map((i) => ({ id: `w${i}`, points: [[i, 10], [i, 4]] }))] });
}

test('#5451 its pins live: CLK and DT pulled high, a turn\'s quarters on them; SW low pressed, floating released', () => {
  const sim = createCircuitSim(bench());
  const pins = () => { sim.run(); return [1, 2, 3].map((n) => sim.pin('ENC1', n)).join(''); };
  assert.equal(pins(), '11Z', 'at a detent: CLK and DT high, SW floating');
  const seen = [];
  for (const [a, b] of encoderTurn(1)) { sim.set('ENC1', a, 0); sim.set('ENC1', b, 1); seen.push(pins().slice(0, 2)); }
  assert.deepEqual(seen, ['01', '00', '10', '11'], 'clockwise: CLK falls first');
  seen.length = 0;
  for (const [a, b] of encoderTurn(-1)) { sim.set('ENC1', a, 0); sim.set('ENC1', b, 1); seen.push(pins().slice(0, 2)); }
  assert.deepEqual(seen, ['10', '00', '01', '11'], 'anticlockwise: DT falls first');
  sim.set('ENC1', true, 2);
  assert.equal(pins(), '110', 'pressed: SW on GND');
  sim.set('ENC1', false, 2);
  assert.equal(pins(), '11Z');
});

// CLK and DT each lighting an LED; SW pulled up, lighting a third
function hdlBench() {
  return normalizeCircuit({ name: 'enhdl', parts: [{ id: 'V1', type: 'supply', x: -4, y: 0 }, { id: 'ENC1', type: 'rotary-encoder', x: 0, y: 10 },
    { id: 'R1', type: 'pull-up', x: 2, y: 6 }, ...[0, 1, 2].map((i) => ({ id: `D${i + 1}`, type: 'led', x: 10 + 3 * i, y: 4 }))],
  wires: [{ id: 'g', points: [[4, 10], [-4, 1]] }, { id: 'a1', points: [[0, 10], [10, 4]] }, { id: 'a2', points: [[1, 10], [13, 4]] },
    { id: 's', points: [[2, 10], [2, 6]] }, { id: 'a3', points: [[2, 6], [16, 4]] }, ...[0, 1, 2].map((i) => ({ id: `k${i}`, points: [[11 + 3 * i, 4], [-4, 1]] }))] });
}

test('#5451 its HDL, in VHDL and in Verilog: its inputs ports, CLK and DT pulled up; compiled, elaborated, simulated with no warnings: a turn on the LEDs', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(hdlBench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    const lib = compile([{ path, text: g.code }]), e = elaborate(lib, 'enhdl');
    assert.deepEqual([...lib.errors, ...e.diags, ...designChecks(lib, e, { lint: true })].map((x) => `${x.severity}: ${x.message}`), [], `${lang}: no warnings`);
    const show = (what) => `$display("${what} D=%b%b%b", D1, D2, D3);`;
    const tb = ['`timescale 1ns / 1ps', 'module tb;', '  reg ENC1_A, ENC1_B, ENC1_SW;', '  wire D1, D2, D3;',
      '  enhdl dut (.ENC1_A(ENC1_A), .ENC1_B(ENC1_B), .ENC1_SW(ENC1_SW), .D1(D1), .D2(D2), .D3(D3));',
      `  initial begin {ENC1_A, ENC1_B, ENC1_SW} = 0; #10 ${show('detent')}`,
      ...encoderTurn(1).map(([a, b], q) => `    ENC1_A = ${Number(a)}; ENC1_B = ${Number(b)}; #10 ${show(`q${q}`)}`),
      `    ENC1_SW = 1; #10 ${show('pressed')}`, '    $finish;', '  end', 'endmodule'].join('\n');
    const r = simulate([{ path, text: g.code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors, [], lang);
    assert.deepEqual(r.sim.log.map((x) => String(x.text).trim()).filter((x) => /D=/.test(x)), ['detent D=111', 'q0 D=011', 'q1 D=001', 'q2 D=101', 'q3 D=111', 'pressed D=110'], lang);
  }
});

test('#5451 its checks: its switch floating into an input while released; a short while turned, named', () => {
  const circuit = (extra) => normalizeCircuit({ name: 'ck', parts: [{ id: 'V1', type: 'supply', x: -4, y: 0 }, { id: 'ENC1', type: 'rotary-encoder', x: 0, y: 10 }, { id: 'U1', type: '7404', x: 10, y: 4 }],
    wires: [{ id: 'g', points: [[4, 10], [-4, 1]] }, { id: 's', points: [[2, 10], [10, 4]] }, { id: 'v', points: [[-4, 0], [10, 1]] }, { id: 'n', points: [[-4, 1], [16, 4]] },
      { id: 'y', points: [[11, 4], [20, 4]] }, { id: 'k', points: [[21, 4], [-4, 1]] }, ...extra] });
  // (SW on a 74LS04's input, no pull-up: floating while released)
  assert.deepEqual(lines(checkCircuit(circuit([]))).filter((l) => /U1 pin 1/.test(l)), ['warning: U1 pin 1 (1A) floats while the switch of ENC1 is released: a 74LS input reads high']);
  // (CLK on the supply's +: a short while turned)
  assert.deepEqual(lines(checkCircuit(circuit([{ id: 'p', points: [[0, 10], [-4, 0]] }]))).filter((l) => l.startsWith('error')),
    ['error: Short circuit while ENC1 is turned (its A contact closed): it joins the supply\'s + and −']);
});

test('#5451 an Arduino counting the encoder\'s detents through a System\'s circuit node: CLK on D2, DT on D3, its count on D8..D13', async () => {
  const { normalizeSystem } = await import('../core/system-doc.js');
  const { systemInputs, systemFromInputs, systemReport } = await import('../core/system-run.js');
  const { loadAvr8js } = await import('../core/system-sim-avr.js');
  const { emulationBoards, setBoardInput } = await import('../core/system-emu.js');
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  await loadAvr8js();
  const uno = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return [q.dx, q.dy]; };
  // CLK, DT, SW, + and GND on D2, D3, D4, 5V and GND
  const circ = normalizeCircuit({ name: 'bench', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'ENC1', type: 'rotary-encoder', x: 0, y: 60 }],
    wires: ['D2', 'D3', 'D4', '5V', 'GND'].map((d, i) => ({ id: `w${i}`, points: [uno(d), [i, 60]] })) });
  // D8..D13 outputs (PORTB the count), D4's pull-up; on CLK's falling edge (PIND bit 2, 1 then 0), DT (bit 3) high: one
  // more, else one less; CLK's level kept from the same read (r21: bit 2 of r17)
  const prog = ['ldi r16, 0x3f', 'out 0x04, r16', 'ldi r16, 0x10', 'out 0x0b, r16', 'ldi r20, 0', 'ldi r21, 0x04',
    'loop:', 'in r17, 0x09', 'sbrs r21, 2', 'rjmp save', 'sbrc r17, 2', 'rjmp save', 'sbrs r17, 3', 'rjmp ccw', 'inc r20', 'rjmp show',
    'ccw:', 'dec r20', 'show:', 'out 0x05, r20', 'save:', 'ldi r21, 0', 'sbrc r17, 2', 'ldi r21, 0x04', 'rjmp loop'];
  const sys = normalizeSystem({ format: 'silinx-system', version: 2, name: 's', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/count.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] }], links: [] });
  const inputs = await systemInputs(sys, { firmware: async () => intelHex(avrAssemble(prog)), circuit: async () => JSON.stringify(circ), netlist: () => null });
  assert.equal(inputs.error, undefined);
  const r = systemFromInputs(sys, inputs);
  const board = emulationBoards(sys, inputs).find((b) => b.id === 'bench');
  assert.deepEqual(board.inputs.map((x) => x.pin), ['ENC1:1', 'ENC1:2', 'ENC1:3']);
  const count = () => parseInt(['D13', 'D12', 'D11', 'D10', 'D9', 'D8'].map((p) => r.sim.nodes.get('uno').value(p)).join(''), 2);
  let t = 10e9;
  r.sim.run(t);
  assert.equal(count(), 0);
  // (turned as the System Emulator turns it: its A and B, a quarter each ENCODER_STEP_NS)
  const turn = (n) => { for (const [a, b] of encoderTurn(n)) { setBoardInput(r.sim, board, 'ENC1:1', a ? 1 : 0); setBoardInput(r.sim, board, 'ENC1:2', b ? 1 : 0); r.sim.run(t += ENCODER_STEP_NS * 1000); } };
  turn(3);
  assert.equal(count(), 3, 'three detents clockwise');
  turn(-1);
  assert.equal(count(), 2, 'one back');
  assert.deepEqual([systemReport(r).warnings, systemReport(r).errors], [[], []]);
});
