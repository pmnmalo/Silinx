// The co-design system's AVR node (core/system-sim-avr.js, #4698): an Arduino Uno's ATmega328P run by avr8js from a
// given .hex / .elf. The reference program (test/avr-asm.mjs echoProgram) against avr8js run alone (its USART's bytes
// and their times, its port B's writes); D0's frames received, D2 copied on D7, a pin's levels; a framing error and a
// wrong baud; a firmware in error; an AVR and the `uart` example's FPGA exchanging bytes in one system, the same at
// every run, no warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPU, avrInstruction, AVRIOPort, AVRUSART, AVRTimer, portBConfig, portDConfig, usart0Config, timer0Config } from 'avr8js';
import { AvrNode, CYCLE_PS, AVR_HZ, avrPin, loadAvr8js } from '../core/system-sim-avr.js';
import { SystemSim } from '../core/system-sim.js';
import { UartDecoder, uartFrames } from '../core/uart.js';
import { avrElf, echoProgram, intelHex } from './avr-asm.mjs';
import { bytesOf, uartNode } from './system-sim-lib.mjs';

await loadAvr8js();   // (avr8js, before an AvrNode is made: core/system-sim-avr.js, #4701)

const BIT = 1664 * CYCLE_PS;   // 9600 baud: UBRR 103, 16 cycles a bit
const hexNode = (o = {}) => new AvrNode({ firmware: { name: 'fw/echo.hex', data: intelHex(echoProgram(o)) } });

// the node's D1 decoded, its frames' starts (ps), and every other pin's changes
function runNode(node, until, feed = () => {}) {
  const dec = new UartDecoder(BIT), starts = [], pins = [];
  let level = 1, busy = -Infinity;
  dec.feed([0, 1]);
  const take = (ch) => {
    for (const c of ch) {
      if (c.pin !== 'D1') { pins.push([c.pin, c.t, c.value]); continue; }
      if (level === 1 && c.value === 0 && c.t >= busy) { starts.push(c.t); busy = c.t + 9.5 * BIT; }
      level = c.value;
      dec.feed([c.t, c.value]);
    }
  };
  feed(node, take);
  take(node.advanceTo(until));
  dec.flush(until);
  return { bytes: dec.bytes(), starts, pins };
}

test('the reference program against avr8js run alone: its bytes at its USART\'s times, its port B\'s writes', () => {
  // avr8js alone: the bytes written to UDR0 and their cycles, port B's values and their cycles
  const cpu = new CPU(echoProgram(), 2048), usart = new AVRUSART(cpu, usart0Config, AVR_HZ);
  const portB = new AVRIOPort(cpu, portBConfig);
  new AVRIOPort(cpu, portDConfig); new AVRTimer(cpu, timer0Config);
  const sent = [], portBs = [];
  usart.onByteTransmit = (b) => sent.push([b, cpu.cycles]);
  portB.addListener((v) => portBs.push([v, cpu.cycles]));
  while (cpu.cycles < 4e9 / CYCLE_PS) { avrInstruction(cpu); cpu.tick(); }
  assert.deepEqual(sent.map(([b]) => b), [72, 105], 'H, i');
  // the node: the same bytes, each frame starting when the program wrote it (the second after the first's 10 bits)
  const { bytes, starts, pins } = runNode(hexNode(), 4e9);
  assert.deepEqual(bytes, [{ byte: 72, error: false }, { byte: 105, error: false }]);
  assert.deepEqual(starts, [sent[0][1] * CYCLE_PS, Math.max(sent[1][1] * CYCLE_PS, sent[0][1] * CYCLE_PS + 10 * BIT)]);
  assert.equal(starts[0], sent[0][1] * CYCLE_PS);
  // port B's writes (DDRB: D8..D13 outputs at 0)
  const at = portBs[0][1] * CYCLE_PS;
  assert.deepEqual(pins.filter(([p]) => /^D(8|9|1[0-3])$/.test(p)), ['D8', 'D9', 'D10', 'D11', 'D12', 'D13'].map((p) => [p, at, 0]));
  // the ELF: the same run
  const elf = runNode(new AvrNode({ firmware: { name: 'fw/echo.elf', data: avrElf(echoProgram()) } }), 4e9);
  assert.deepEqual(elf, { bytes, starts, pins });
  // its program's words given: the same run
  assert.deepEqual(runNode(new AvrNode({ firmware: { program: echoProgram() } }), 4e9), { bytes, starts, pins });
});

test('D0\'s frames received at the USART\'s baud: each byte on port B and sent back plus one; a wrong baud, garbage', () => {
  const sendOn = (bytes, from, bit = BIT) => (n, take) => {
    take(n.advanceTo(from));
    for (const s of uartFrames(bytes, bit)) { take(n.advanceTo(from + s.dt)); n.setPin('D0', s.level); }
  };
  const n = hexNode();
  n.setPin('D0', 1);
  const r = runNode(n, 9e9, sendOn([0x41, 0x2a], 3e9));
  assert.deepEqual(r.bytes.map((b) => b.byte), [72, 105, 0x42, 0x2b]);
  assert.equal(r.bytes.some((b) => b.error), false);
  assert.deepEqual(['D8', 'D9', 'D10', 'D11', 'D12', 'D13'].map((p) => n.value(p)), [0, 1, 0, 1, 0, 1], '0x2a on D8..D13');
  assert.deepEqual(n.messages(), [], 'no warnings');
  // at 19200 baud the node, at 9600, receives garbage, as a real board
  const w = hexNode();
  w.setPin('D0', 1);
  const g = runNode(w, 9e9, sendOn([0x41], 3e9, BIT / 2));
  assert.notDeepEqual(g.bytes.slice(2).map((b) => b.byte), [0x42]);
});

test('a framing error, a byte not read: their warnings', () => {
  const n = hexNode();
  n.setPin('D0', 1);
  n.advanceTo(3e9);
  for (const [i, v] of [0, 1, 0, 0, 0, 0, 0, 1, 0, 0].entries()) { n.advanceTo(3e9 + i * BIT); n.setPin('D0', v); }   // (its stop bit at 0)
  n.advanceTo(3e9 + 12 * BIT);
  n.setPin('D0', 1);
  n.advanceTo(5e9);
  assert.deepEqual(n.messages().map((m) => [m.kind, m.text]), [['warning', 'D0 (RX): a framing error (no stop bit) at 9615 baud']]);   // (16 MHz / (16 × 104): UBRR 103's rate)
  // a program that never reads UDR0: the second byte loses the first
  const deaf = new AvrNode({ firmware: { program: Uint16Array.from([...echoProgram().slice(0, 18), 0xcfff]) } });   // (the USART and the ports set, then rjmp to itself)
  deaf.setPin('D0', 1);
  runNode(deaf, 9e9, (x, take) => { take(x.advanceTo(1e9)); for (const s of uartFrames([1, 2], BIT)) { take(x.advanceTo(1e9 + s.dt)); x.setPin('D0', s.level); } });
  assert.deepEqual(deaf.messages().map((m) => m.text), ['D0 (RX): a byte lost (the one before it not read)']);
});

test('the pins: the board\'s, each an input and an output; a pull-up, a floating input, an input copied', () => {
  const n = hexNode();
  assert.deepEqual(n.outputs, ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5']);
  assert.deepEqual(n.inputs, n.outputs);
  assert.deepEqual(new AvrNode({ board: 'arduino-nano', firmware: { program: echoProgram() } }).outputs, n.outputs, 'the Nano\'s A6, A7: analog inputs only');
  assert.deepEqual([avrPin('D7'), avrPin('d8'), avrPin('A5'), avrPin('D14'), avrPin('A6'), avrPin('x')], [{ port: 'D', bit: 7 }, { port: 'B', bit: 0 }, { port: 'C', bit: 5 }, null, null, null]);
  assert.equal(n.value('D2'), null, 'an input floating before the program sets its pull-up');
  assert.equal(n.value('D1'), null, 'D1 floating before the USART is enabled');
  n.advanceTo(0.7e6);
  assert.equal(n.value('D1'), 1, 'the USART\'s TX idle once enabled (its 12th cycle)');
  n.advanceTo(2e6);
  assert.equal(n.value('D2'), 1, 'its pull-up');
  n.advanceTo(3e9);   // ('Hi' sent: the program's loop)
  assert.equal(n.value('D7'), 1, 'D2 floating: its pull-up, 1, copied on D7');
  n.setPin('D2', 0); n.advanceTo(3.001e9);
  assert.equal(n.value('D7'), 0, 'D2 low: D7 low');
  assert.equal(n.value('D2'), 1, 'D2\'s value: its pull-up (what the AVR drives), not the other end\'s');
  n.setPin('D2', 1); n.advanceTo(3.002e9);
  assert.equal(n.value('D7'), 1);
  n.setPin('D2', null); n.advanceTo(3.003e9);
  assert.equal(n.value('D7'), 1, 'floating again: its pull-up');
  assert.equal(n.value('A0'), null);
  n.setPin('A0', 1);
  assert.equal(n.value('A0'), 1, 'an input: the value set');
  assert.throws(() => n.setPin('D14', 1), /'D14' is not a pin of the Arduino Uno/);
  assert.throws(() => n.value('B3'), /no pin 'B3'/);
  assert.throws(() => n.advanceTo(1e6), /the node is at 3003000000 ps, not back at 1000000/);
  assert.throws(() => new AvrNode({ board: 'esp32', firmware: { program: echoProgram() } }), /no microcontroller board 'esp32'/);
  let fired = null;
  n.at(4e9, (x) => { fired = x.now; });
  assert.equal(n.nextEventTime(), 4e9);
  n.advanceTo(5e9);
  assert.equal(fired, 4e9);
  assert.equal(n.nextEventTime(), Infinity);
});

test('a firmware in error: the node stops at once, its message the console\'s', () => {
  const n = new AvrNode({ firmware: { name: 'fw/sketch.bin', data: 'x' } });
  assert.equal(n.finished, 'error');
  assert.deepEqual(n.messages(), [{ kind: 'error', time: 0, text: 'fw/sketch.bin: a firmware is a .hex or an .elf' }]);
  assert.deepEqual(n.advanceTo(1e9), []);
  const sys = new SystemSim();
  sys.addNode('uno', new AvrNode({ firmware: { name: 'fw/echo.hex', data: ':00000001FF\n' } }));
  assert.deepEqual(sys.run(1e9).finished, { node: 'uno', why: 'error' });
  assert.deepEqual(sys.messages('error'), ['uno: fw/echo.hex: no program in it (no data record)']);
});

test('an AVR and the uart example\'s FPGA by UART: each byte echoed and answered plus one, the same at every run, no warnings', async () => {
  const run = async () => {
    const sys = new SystemSim();
    sys.addNode('uno', hexNode());
    sys.addNode('fpga', await uartNode('compiled', { hz: 50e6, baud: 9600 }));
    // (a fixed latency, the default of docs/CODESIGN.md: exact at every quantum)
    sys.link({ name: 'tx', from: 'uno.D1', to: 'fpga.rx', kind: 'uart', baud: 9600, latency: 1e6 });
    sys.link({ name: 'rx', from: 'fpga.tx', to: 'uno.D0', kind: 'uart', baud: 9600, latency: 1e6 });
    const end = 8e9;
    sys.run(end);
    const l = sys.links;
    return { avr: bytesOf(l.get('tx').sent, 9600, end), fpga: bytesOf(l.get('rx').sent, 9600, end), warnings: sys.messages('warning'), errors: sys.messages('error') };
  };
  const a = await run();
  // the AVR: H, i, then each byte the FPGA echoes plus one; the FPGA: the AVR's bytes back
  assert.deepEqual(a.avr.slice(0, 6).map((b) => String.fromCharCode(b.byte)).join(''), 'HiIjJk');
  assert.deepEqual(a.fpga.slice(0, 5).map((b) => String.fromCharCode(b.byte)).join(''), 'HiIjJ');
  assert.equal([...a.avr, ...a.fpga].some((b) => b.error), false);
  assert.deepEqual(a.warnings, []);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(await run(), a, 'deterministic');
});
