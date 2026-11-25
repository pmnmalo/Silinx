// The PIC24FJ1024GB610's peripheral pin select (#5481, packages/silinx-pic24/src/pps.js): RPINRx's input functions on
// their RPn / RPIn pins (63: none), RPORx's output functions overriding the pins' latches, IOLOCK's lock; the UARTs'
// bits on their pins through it (UART5 and 6 on their fixed pins); the Explorer 16/32's USB-UART (RF4, RF5) as a
// terminal (serial.js) with a program echoing what it types.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceWith, runUntil } from './pic24-lib.mjs';
import { Explorer1632, RP_PINS } from '../packages/silinx-pic24/src/index.js';

const FWDT_OFF = { FWDT: 0xffff9f };
const RPINR19 = 0x07b6, RPOR8 = 0x07e4;
const dev16 = (lines = ['bra $'], opts = {}) => deviceWith(lines, { config: FWDT_OFF, fcy: 16e6, ...opts });
// U2RX on RP10 (RF4), U2TX on RP17 (RF5): the Explorer 16/32's USB-UART
const MAP_U2 = ['mov #0x3f0a, w0', 'mov w0, 0x07b6', 'mov #0x0500, w0', 'mov w0, 0x07e4'];

test('#5481 PPS at reset: every input function on none (63), every RPn without an output; the RP pins', async () => {
  const { dev, mcu } = await dev16();
  assert.deepEqual([mcu.get(RPINR19), mcu.get(RPOR8), dev.pps.inputPin('U2RX'), dev.pps.input('U2RX')], [0x3f3f, 0, null, 0]);
  assert.deepEqual([RP_PINS[10], RP_PINS[17], RP_PINS[29], RP_PINS[43], RP_PINS.length], ['RF4', 'RF5', 'RB15', 'RD14', 44]);
  assert.throws(() => dev.pps.inputPin('U9RX'), /no PPS input function 'U9RX'/);
});

test('#5481 an input function on its pin (U2RX on RP10, RF4); an output function overriding its pin\'s latch (U2TX on RP17, RF5)', async () => {
  const { dev, cpu, labels } = await dev16([...MAP_U2, 'done: bra done']);
  runUntil(cpu, labels.done);
  assert.equal(dev.pps.inputPin('U2RX'), 'RF4');
  dev.ports.setInput('RF4', 1);
  assert.equal(dev.pps.input('U2RX'), 1);
  assert.deepEqual(dev.pps.outputPins('U2TX'), ['RF5']);
  assert.equal(dev.ports.driven('RF5'), null, 'UART2 off: not driven');
  cpu.wr(0x03ae, 0x8000, 0); cpu.wr(0x03b0, 0x0400, 0);
  assert.equal(dev.ports.driven('RF5'), 1, 'UARTEN and UTXEN: the line idle, 1, though TRISF5 is an input');
  cpu.wr(0x03b0, 0, 0);
  assert.equal(dev.ports.driven('RF5'), null);
});

test('#5481 IOLOCK: the PPS registers locked (a write unchanged, said once), unlocked again (IOL1WAY clear)', async () => {
  const { dev, mcu, cpu, labels } = await dev16([
    'mov #0x0100, w1', 'mov #0x46, w2', 'mov #0x57, w3', 'mov.b w2, [w1]', 'mov.b w3, [w1]', 'bset 0x0100, #6',
    ...MAP_U2, 'locked: nop',
    'mov.b w2, [w1]', 'mov.b w3, [w1]', 'bclr 0x0100, #6', ...MAP_U2, 'done: bra done',
  ], { config: { ...FWDT_OFF, FOSC: 0xffffdf } });
  runUntil(cpu, labels.locked);
  assert.deepEqual([mcu.get(RPINR19), mcu.get(RPOR8), dev.osc.ioLocked], [0x3f3f, 0, true]);
  assert.deepEqual(cpu.log.map((l) => l.text), ['a PPS register written while OSCCON\'s IOLOCK is set: unchanged']);
  runUntil(cpu, labels.done);
  assert.deepEqual([mcu.get(RPINR19), mcu.get(RPOR8)], [0x3f0a, 0x0500]);
});

test('#5481 UART2\'s frames on RF5 through PPS, decoded by the board\'s USB-UART at 9600 baud', async () => {
  const { dev, mcu, cpu, labels } = await dev16([...MAP_U2,
    'mov #103, w0', 'mov w0, 0x03b6', 'mov #0x8000, w0', 'mov w0, 0x03ae', 'mov #0x0400, w0', 'mov w0, 0x03b0',
    'mov #0x4f, w0', 'mov w0, 0x03b2', 'mov #0x4b, w0', 'mov w0, 0x03b2', 'done: bra done']);
  const term = new Explorer1632(dev).usbUart(9600);
  runUntil(cpu, labels.done);
  mcu.runTo(mcu.time + 2.5e9);
  assert.equal(term.text, 'OK');
  assert.deepEqual(cpu.log, []);
});

test('#5481 a program echoing the USB-UART\'s terminal: its frames on RF4 received by UART2 through PPS, sent back on RF5', async () => {
  const { dev, mcu, cpu } = await dev16([...MAP_U2,
    'mov #103, w0', 'mov w0, 0x03b6', 'mov #0x8000, w0', 'mov w0, 0x03ae', 'mov #0x1400, w0', 'mov w0, 0x03b0',
    'loop: btss 0x03b0, #0', 'bra loop', 'mov 0x03b4, w0', 'mov w0, 0x03b2', 'bra loop']);
  const term = new Explorer1632(dev).usbUart(9600);
  mcu.runTo(1e9);
  term.type('Hello, PIC24!');
  mcu.runTo(1e9 + 16e9);
  assert.equal(term.text, 'Hello, PIC24!');
  assert.deepEqual([cpu.log, cpu.rd(0x03b0, 0) & 0x0e], [[], 0], 'no error');
});

test('#5481 UART5 on its fixed pins (U5TX RD1, U5RX RD6), no PPS', async () => {
  const { dev, cpu } = await dev16();
  cpu.wr(0x03dc, 0x8000, 0); cpu.wr(0x03de, 0x0400, 0);
  assert.equal(dev.ports.driven('RD1'), 1);
});

test('#5481 the external interrupts: INT1 on RD9 (RP4) through PPS, its edge as INTCON2\'s INT1EP; INT0 on RD0', async () => {
  const { dev, mcu, cpu } = await dev16();
  cpu.wr(0x0790, 0x043f, 0);               // RPINR0: INT1 on RP4 (RD9)
  dev.ports.setInput('RD9', 1);
  cpu.wr(0x008a, 0, 0);
  dev.ports.setInput('RD9', 0);
  assert.equal((mcu.get(0x008a) >> 4) & 1, 0, 'a falling edge, INT1EP 0 (rising): nothing');
  dev.ports.setInput('RD9', 1);
  assert.equal((mcu.get(0x008a) >> 4) & 1, 1, 'INT1IF');
  cpu.wr(0x008a, 0, 0); cpu.wr(0x0082, 0x8002, 0);   // INT1EP 1: the falling edge
  dev.ports.setInput('RD9', 0);
  assert.equal((mcu.get(0x008a) >> 4) & 1, 1);
  // INT0 on RD0, fixed
  dev.ports.setInput('RD0', 0); dev.ports.setInput('RD0', 1);
  assert.equal(mcu.get(0x0088) & 1, 1, 'INT0IF');
});
