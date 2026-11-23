// A 4×4 matrix keypad (#5364, core/circuit-keypad.js): its 8 pins (R1..R4, C1..C4) and 16 keys, each an input of the
// HDL (KP1_1 … KP1_star, KP1_hash, KP1_D); a key joins its row to its column while pressed (one key, two in a column, the
// ghost of three keys at a rectangle's corners, as a real keypad's); a scan; its checks (a column floating while no key
// is pressed, through a 74LS input) and its Part info; its HDL in VHDL and in Verilog, compiled, elaborated and simulated
// with no warnings; an Arduino scanning it through a System's circuit node (its rows driven low one at a time, its
// columns pulled up by the AVR and read), its keys pressed as the System Emulator presses them; an FPGA's scanner (VHDL,
// on a Basys2's JA and JB, its columns pulled up in the circuit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEYPAD_4X4, KEYPAD_KEYS } from '../core/circuit-keypad.js';
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

test('#5364 the keypad: its pins, its keys (each an input of the HDL), a key joining its row to its column; the library, its info', () => {
  assert.equal(PARTS['keypad-4x4'], KEYPAD_4X4);
  assert.deepEqual(KEYPAD_4X4.pins.map((p) => `${p.n} ${p.name} ${p.dir} ${p.dx},${p.dy}`), ['1 R1 pass 0,0', '2 R2 pass 1,0', '3 R3 pass 2,0', '4 R4 pass 3,0', '5 C1 pass 4,0', '6 C2 pass 5,0', '7 C3 pass 6,0', '8 C4 pass 7,0']);
  assert.deepEqual(KEYPAD_KEYS.join(' '), '1 2 3 A 4 5 6 B 7 8 9 C * 0 # D');
  // (key 6: row 2, column 3; # row 4, column 3)
  assert.deepEqual([KEYPAD_4X4.contacts[6], KEYPAD_4X4.contacts[14]], [{ a: 2, b: 7, input: 6, when: true }, { a: 4, b: 7, input: 14, when: true }]);
  const m = normalizeCircuit({ name: 'k', parts: [{ id: 'KP1', type: 'keypad-4x4', x: 0, y: 0 }] });
  assert.deepEqual(circuitPorts(m).inputs.map((x) => x.name).join(' '), 'KP1_1 KP1_2 KP1_3 KP1_A KP1_4 KP1_5 KP1_6 KP1_B KP1_7 KP1_8 KP1_9 KP1_C KP1_star KP1_0 KP1_hash KP1_D');
  assert.ok(PART_ORDER.indexOf('keypad-4x4') === PART_ORDER.indexOf('dip-8') + 1);
  const info = partInfo('keypad-4x4');
  assert.match(info.about, /^A membrane keypad, 16 keys in 4 rows and 4 columns/);
  assert.deepEqual(lines(checkCircuit(m)), ['warning: KP1 (Keypad 4×4 (matrix)) joins nothing']);
});

// a keypad with every row and column on a probe each; a supply; R1 held low by a wire to the supply's −, C1..C4 pulled up
function bench() {
  const probes = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: `P${i + 1}`, type: 'probe', x: i, y: 4 }));
  return normalizeCircuit({ name: 'kp', parts: [{ id: 'V1', type: 'supply', x: -4, y: 0 }, { id: 'KP1', type: 'keypad-4x4', x: 0, y: 10 }, ...probes,
    ...[4, 5, 6, 7].map((i) => ({ id: `R${i - 3}`, type: 'pull-up', x: i, y: 7 }))],
  wires: [{ id: 'g', points: [[0, 10], [-4, 1]] }, ...[0, 1, 2, 3].map((i) => ({ id: `w${i}`, points: [[i, 10], [i, 4]] })),
    ...[4, 5, 6, 7].flatMap((i) => [{ id: `w${i}`, points: [[i, 10], [i, 7]] }, { id: `u${i}`, points: [[i, 7], [i, 4]] }])] });
}

test('#5364 a key joins its row to its column: one key, two in a column, the ghost of three keys; released, the column pulled up', () => {
  const sim = createCircuitSim(bench());
  const cols = () => { sim.run(); return [5, 6, 7, 8].map((n) => sim.pin('KP1', n)).join(''); };
  assert.equal(cols(), '1111', 'no key: the columns pulled up');
  const key = (k, on) => sim.set('KP1', on, KEYPAD_KEYS.indexOf(k));
  key('2', true);
  assert.equal(cols(), '1011', 'key 2: R1 (low) on C2');
  key('2', false); key('6', true);
  assert.equal(cols(), '1111', 'key 6: R2 floats, nothing on C3');
  // (the ghost: 1, 2 and 5 pressed join R2 to C2 through R1 and C1: R2 low, as if 5's neighbour 6… a real keypad's)
  key('6', false); key('1', true); key('4', true); key('5', true);
  sim.run();
  assert.deepEqual([sim.pin('KP1', 2), cols()], ['0', '0011'], 'R2 low through 4 and 1; C2 low through 5');
  for (const k of KEYPAD_KEYS) key(k, false);
  assert.equal(cols(), '1111');
});

test('#5364 its checks: a 74LS input on a column floats while no key is pressed; a short while a key is pressed', () => {
  const ic = normalizeCircuit({ name: 'c', parts: [{ id: 'V1', type: 'supply', x: -4, y: 0 }, { id: 'KP1', type: 'keypad-4x4', x: 0, y: 10 }, { id: 'U1', type: '7404', x: 10, y: 4 }],
    wires: [{ id: 'g', points: [[0, 10], [-4, 1]] }, { id: 'c', points: [[4, 10], [10, 4]] }, { id: 'v', points: [[-4, 0], [10, 1]] }, { id: 'n', points: [[-4, 1], [16, 4]] },
      { id: 'y', points: [[11, 4], [20, 4]] }, { id: 'k', points: [[21, 4], [-4, 1]] }] });
  assert.deepEqual(lines(checkCircuit(ic)).filter((l) => /U1 pin 1/.test(l)), ['warning: U1 pin 1 (1A) floats while no key of KP1 is pressed: a 74LS input reads high']);
  const short = normalizeCircuit({ name: 's', parts: [{ id: 'V1', type: 'supply', x: -4, y: 0 }, { id: 'KP1', type: 'keypad-4x4', x: 0, y: 10 }],
    wires: [{ id: 'g', points: [[0, 10], [-4, 1]] }, { id: 'v', points: [[4, 10], [-4, 0]] }] });
  assert.deepEqual(lines(checkCircuit(short)), ['error: Short circuit while KP1 is pressed (its key 1): it joins the supply\'s + and −']);
});

// its HDL: its rows driven by the switches S1..S4, each column pulled up and lighting an LED (D1..D4, their cathodes on −):
// a column's LED darkened by a key of the row held low
function hdlBench() {
  return normalizeCircuit({ name: 'kphdl', parts: [{ id: 'V1', type: 'supply', x: -4, y: 0 }, { id: 'KP1', type: 'keypad-4x4', x: 0, y: 10 },
    ...[0, 1, 2, 3].map((i) => ({ id: `S${i + 1}`, type: 'logic-switch', x: i * 3 - 12, y: 20 })),
    ...[0, 1, 2, 3].map((i) => ({ id: `R${i + 1}`, type: 'pull-up', x: 4 + i, y: 6 })), ...[0, 1, 2, 3].map((i) => ({ id: `D${i + 1}`, type: 'led', x: 10 + 3 * i, y: 4 }))],
  wires: [...[0, 1, 2, 3].map((i) => ({ id: `ws${i}`, points: [[i * 3 - 12, 20], [i, 10]] })),
    ...[0, 1, 2, 3].flatMap((i) => [{ id: `c${i}`, points: [[4 + i, 10], [4 + i, 6]] }, { id: `a${i}`, points: [[4 + i, 6], [10 + 3 * i, 4]] }, { id: `k${i}`, points: [[11 + 3 * i, 4], [-4, 1]] }])] });
}

test('#5364 its HDL, in VHDL and in Verilog: each key a port; compiled, elaborated, simulated with no warnings: its rows and columns scanned', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(hdlBench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    const lib = compile([{ path, text: g.code }]), e = elaborate(lib, 'kphdl');
    assert.deepEqual([...lib.errors, ...e.diags, ...designChecks(lib, e, { lint: true })].map((x) => `${x.severity}: ${x.message}`), [], `${lang}: no warnings`);
    const ports = KEYPAD_KEYS.map((k) => `KP1_${{ '*': 'star', '#': 'hash' }[k] ?? k}`);
    // (row 1 low, the others high: key 2 darkens D2; key 6, row 2's, nothing; row 2 low then: key 6 darkens D3)
    const tb = ['`timescale 1ns / 1ps', 'module tb;', `  reg ${ports.join(', ')}, S1, S2, S3, S4;`, '  wire D1, D2, D3, D4;',
      `  kphdl dut (${[...ports, 'S1', 'S2', 'S3', 'S4', 'D1', 'D2', 'D3', 'D4'].map((p) => `.${p}(${p})`).join(', ')});`,
      '  initial begin', `    {${ports.join(', ')}} = 0; {S1, S2, S3, S4} = 4'b0111; #10 $display("released D=%b%b%b%b", D1, D2, D3, D4);`,
      '    KP1_2 = 1; #10 $display("2 pressed D=%b%b%b%b", D1, D2, D3, D4);', '    KP1_2 = 0; KP1_6 = 1; #10 $display("6 pressed D=%b%b%b%b", D1, D2, D3, D4);',
      "    {S1, S2} = 2'b10; #10 $display(\"row 2 low D=%b%b%b%b\", D1, D2, D3, D4);", '    $finish;', '  end', 'endmodule'].join('\n');
    const r = simulate([{ path, text: g.code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors, [], lang);
    assert.deepEqual(r.sim.log.map((x) => String(x.text).trim()).filter((x) => /D=/.test(x)), ['released D=1111', '2 pressed D=1011', '6 pressed D=1111', 'row 2 low D=1101'], lang);
  }
});

test('#5364 an Arduino scanning the keypad through a System\'s circuit node: its rows D4..D7 low one at a time, its columns D8..D11 pulled up and read', async () => {
  const { normalizeSystem } = await import('../core/system-doc.js');
  const { systemInputs, systemFromInputs, systemReport } = await import('../core/system-run.js');
  const { loadAvr8js } = await import('../core/system-sim-avr.js');
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  await loadAvr8js();
  const uno = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return [q.dx, q.dy]; };
  // the keypad's R1..R4 on D4..D7, C1..C4 on D8..D11
  const circ = normalizeCircuit({ name: 'bench', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'KP1', type: 'keypad-4x4', x: 0, y: 60 }],
    wires: ['D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11'].map((d, i) => ({ id: `w${i}`, points: [uno(d), [i, 60]] })) });
  // the scan: D4..D7 outputs, high; D8..D11 inputs with their pull-ups; then for each row k: its pin low, the columns read
  // (PINB's low nibble) into r20+k, about 1 ms after; forever. A0..A3 (PORTC) the row 2's columns, r21's.
  const prog = ['ldi r16, 0xf0', 'out 0x0a, r16', 'out 0x0b, r16', 'ldi r16, 0x0f', 'out 0x05, r16', 'out 0x07, r16',
    'loop:', 'ldi r16, 0xe0', 'out 0x0b, r16', 'rcall wait', 'in r20, 0x03',
    'ldi r16, 0xd0', 'out 0x0b, r16', 'rcall wait', 'in r21, 0x03', 'out 0x08, r21',
    'ldi r16, 0xb0', 'out 0x0b, r16', 'rcall wait', 'in r22, 0x03', 'ldi r16, 0x70', 'out 0x0b, r16', 'rcall wait', 'in r23, 0x03', 'rjmp loop',
    // (about 1 ms: the keypad's levels reach the AVR through the System's links, a window later)
    'wait:', 'ldi r18, 20', 'w1:', 'ldi r19, 255', 'w2:', 'dec r19', 'brne w2', 'dec r18', 'brne w1', 'ret'];
  const sys = normalizeSystem({ format: 'silinx-system', version: 1, name: 's', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/scan.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] }], links: [] });
  const inputs = await systemInputs(sys, { firmware: async () => intelHex(avrAssemble(prog)), circuit: async () => JSON.stringify(circ), netlist: () => null });
  assert.equal(inputs.error, undefined);
  const r = systemFromInputs(sys, inputs);
  const A = () => ['A0', 'A1', 'A2', 'A3'].map((p) => r.sim.nodes.get('uno').value(p)).join('');
  r.sim.run(30e9);
  assert.equal(A(), '1111', 'no key');
  // key 6 (row 2, column 3) pressed as the System Emulator presses it (its pin KP1:7, the 7th key): row 2's columns 1101
  // (A2 low); key 1 (row 1) not seen in row 2's
  const { emulationBoards, setBoardInput } = await import('../core/system-emu.js');
  const board = emulationBoards(sys, inputs).find((b) => b.id === 'bench');
  assert.deepEqual(board.inputs.map((x) => x.pin).slice(0, 8), ['KP1:1', 'KP1:2', 'KP1:3', 'KP1:4', 'KP1:5', 'KP1:6', 'KP1:7', 'KP1:8']);
  setBoardInput(r.sim, board, 'KP1:7', 1);
  r.sim.run(60e9);
  assert.equal(A(), '1101', 'key 6: row 2, column 3');
  setBoardInput(r.sim, board, 'KP1:7', 0);
  r.sim.nodes.get('bench').setInput('KP1', true, KEYPAD_KEYS.indexOf('1'));
  r.sim.run(90e9);
  assert.equal(A(), '1111', 'key 1: row 1, not seen in row 2');
  assert.deepEqual([systemReport(r).warnings, systemReport(r).errors], [[], []]);
});

test('#5364 an FPGA scanning the keypad (VHDL) through a System\'s circuit node: its rows on the Basys2\'s JA, its columns on JB, pulled up', async () => {
  const { normalizeSystem } = await import('../core/system-doc.js');
  const { systemInputs, systemFromInputs, systemReport } = await import('../core/system-run.js');
  const { netlistOf } = await import('../core/compiled-sim.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  const { designOf } = await import('./compiled-diff.js');
  // its rows low one at a time (a row each 2^12 clocks), the columns of row 2 latched into led at the row's end
  const VHDL = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity kscan is
  port (clk : in std_logic; rows : out std_logic_vector(3 downto 0); cols : in std_logic_vector(3 downto 0); led : out std_logic_vector(3 downto 0));
end kscan;
architecture rtl of kscan is
  signal cnt : unsigned(13 downto 0) := (others => '0');
  signal seen : std_logic_vector(3 downto 0) := (others => '1');
begin
  process (clk) begin
    if rising_edge(clk) then
      cnt <= cnt + 1;
      if cnt(13 downto 12) = "01" and cnt(11 downto 0) = x"fff" then seen <= cols; end if;
    end if;
  end process;
  with cnt(13 downto 12) select rows <= "1110" when "00", "1101" when "01", "1011" when "10", "0111" when others;
  led <= seen;
end rtl;
`;
  const net = await netlistOf(designOf([{ path: 'kscan.vhd', text: VHDL }], 'kscan'), { run: yosysNode });
  const loc = (name) => PARTS['fpga-basys2'].pins.find((p) => p.name === name).loc;
  const at = (name) => { const q = PARTS['fpga-basys2'].pins.find((p) => p.name === name); return [q.dx, q.dy + 30]; };
  const pins = { clk: 'B8', ...Object.fromEntries([0, 1, 2, 3].flatMap((i) => [[`rows<${i}>`, loc(`JA${i + 1}`)], [`cols<${i}>`, loc(`JB${i + 1}`)], [`led<${i}>`, ['M5', 'M11', 'P7', 'P6'][i]]])) };
  // the keypad's R1..R4 on JA1..JA4, C1..C4 on JB1..JB4, each column pulled up
  const circ = normalizeCircuit({ name: 'bench', parts: [{ id: 'F1', type: 'fpga-basys2', x: 0, y: 30, label: 'fpga' }, { id: 'KP1', type: 'keypad-4x4', x: 0, y: 70 },
    ...[0, 1, 2, 3].map((i) => ({ id: `R${i + 1}`, type: 'pull-up', x: 9 + i, y: 50 }))],
  wires: [...[0, 1, 2, 3].map((i) => ({ id: `r${i}`, points: [at(`JA${i + 1}`), [i, 70]] })),
    ...[0, 1, 2, 3].flatMap((i) => [{ id: `c${i}`, points: [at(`JB${i + 1}`), [9 + i, 50]] }, { id: `k${i}`, points: [[9 + i, 50], [4 + i, 70]] }])] });
  const sys = normalizeSystem({ format: 'silinx-system', version: 1, name: 's', nodes: [{ id: 'fpga', kind: 'fpga', module: 'kscan', board: 'basys2', variant: '250', pins, interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] }], links: [] });
  const ports = { kscan: [{ name: 'clk', dir: 'in', width: 1 }, { name: 'rows', dir: 'out', width: 4 }, { name: 'cols', dir: 'in', width: 4 }, { name: 'led', dir: 'out', width: 4 }] };
  const inputs = await systemInputs(sys, { ports, netlist: () => net, firmware: async () => '', circuit: async () => JSON.stringify(circ) });
  assert.equal(inputs.error, undefined);
  const r = systemFromInputs(sys, inputs);
  assert.equal(r.error, undefined);
  const led = () => { const v = r.sim.nodes.get('fpga').value('led'); return [3, 2, 1, 0].map((b) => (v >> b) & 1).join(''); };
  r.sim.run(2e9);
  assert.equal(led(), '1111', 'no key');
  r.sim.nodes.get('bench').setInput('KP1', true, KEYPAD_KEYS.indexOf('6'));
  r.sim.run(4e9);
  assert.equal(led(), '1011', 'key 6: row 2, column 3 (cols(2) low)');
  assert.deepEqual([systemReport(r).warnings, systemReport(r).errors], [[], []]);
});
