// The PIC24FJ1024GB610's I/O ports (#5481, packages/silinx-pic24/src/gpio.js) and the Explorer 16/32's LEDs and
// buttons (explorer1632.js): TRIS, LAT, PORT (its reads the pins' levels, its writes the latch's), ODC (an open
// drain), ANS (an analog pin reads 0: RD6 and RD7, S3's and S6's, are analog at reset), the weak pull-ups and
// pull-downs, the interrupt-on-change (IOCP / IOCN, IOCF, IOCSTAT, PADCON's IOCON, IRQ 19), the outputs' changes as
// the node's events; a program lighting the LEDs from the buttons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceWith, runUntil } from './pic24-lib.mjs';
import { Explorer1632, EXPLORER_1632, Pic24Node } from '../packages/silinx-pic24/src/index.js';
import { pic24Assemble } from './pic24-asm.mjs';

const WDT_OFF = 0xffff9f;
const A = { TRIS: 0x0662, PORT: 0x0664, LAT: 0x0666, ODC: 0x0668, ANS: 0x066a };
const D = { TRIS: 0x069e, PORT: 0x06a0, LAT: 0x06a2, ANS: 0x06a6, IOCP: 0x06a8, IOCN: 0x06aa, IOCF: 0x06ac, IOCPU: 0x06ae, IOCPD: 0x06b0 };
const dev0 = async (lines = ['bra $']) => deviceWith(lines, { config: { FWDT: WDT_OFF } });

test('#5481 the ports\' reset values: TRIS all inputs (the pins the device has), LAT 0, ANS its analog pins; the pins\' names', async () => {
  const { mcu, dev } = await dev0();
  assert.deepEqual([mcu.get(A.TRIS), mcu.get(A.LAT), mcu.get(A.ANS), mcu.get(D.ANS), mcu.get(0x06ba), mcu.get(0x06e2)], [0xc6ff, 0, 0x06c0, 0x20c0, 0x0210, 0x03c0]);
  assert.equal(dev.ports.names.length, 84, 'the 100-pin TQFP\'s port pins (table 5)');
  assert.throws(() => dev.ports.pin('RA8'), /the PIC24FJ1024GB610 has no pin 'RA8'/);
});

test('#5481 an output: TRIS 0, LAT\'s value on the pin and read back by PORT; a PORT write is LAT\'s; ODC releases a 1', async () => {
  const { mcu, cpu, dev, labels } = await dev0(['clr 0x0662', 'mov #0x00a5, w0', 'mov w0, 0x0666', 'mov 0x0664, w1', 'mov #0x5a, w0', 'mov.b wreg, 0x0664', 'done: bra done']);
  runUntil(cpu, labels.done);
  // (RA7 and RA6 analog at reset, ANSA: read 0 though RA7 drives a 1)
  assert.deepEqual([cpu.W(1), mcu.get(A.LAT), dev.ports.driven('RA0'), dev.ports.driven('RA1'), dev.ports.driven('RA7')], [0x0025, 0x005a, 0, 1, 0]);
  mcu.set(A.ODC, 0x0002);
  dev.ports.update('A');
  assert.deepEqual([dev.ports.driven('RA1'), dev.ports.level('RA1')], [null, null], 'an open drain\'s 1: released, floating');
  dev.ports.setInput('RA1', 0);
  assert.equal(dev.ports.level('RA1'), 0);
});

test('#5481 an input: what drives it from outside, else its pull-up or pull-down, else floating (read 0); an analog pin reads 0', async () => {
  const { mcu, dev } = await dev0();
  const read = () => dev.ports.readPort('D') & 0xc0;
  dev.ports.setInput('RD6', 1);
  assert.equal(read(), 0, 'RD6 analog at reset (ANSD): reads 0');
  mcu.cpu.wr(D.ANS, 0, 0);
  assert.equal(read(), 0x40);
  assert.equal(dev.ports.level('RD7'), null, 'floating');
  mcu.cpu.wr(D.IOCPU, 0x80, 0);
  assert.equal(read(), 0xc0, 'RD7 pulled up');
  mcu.cpu.wr(D.IOCPU, 0, 0); mcu.cpu.wr(D.IOCPD, 0x40, 0); dev.ports.setInput('RD6', null);
  assert.equal(read(), 0, 'RD6 pulled down, RD7 floating');
});

test('#5481 the interrupt-on-change: IOCP / IOCN edges flag IOCF and IOCSTAT, raise IRQ 19 (with PADCON\'s IOCON); IOCF only cleared', async () => {
  const { mcu, cpu, dev } = await dev0();
  mcu.cpu.wr(D.ANS, 0, 0);
  mcu.cpu.wr(D.IOCN, 0x0040, 0);   // RD6's falling edge
  dev.ports.setInput('RD6', 1);
  dev.ports.setInput('RD6', 0);
  assert.equal(mcu.get(D.IOCF), 0, 'IOCON clear: nothing');
  mcu.cpu.wr(0x065e, 0x8000, 0);
  dev.ports.setInput('RD6', 1);
  assert.equal(mcu.get(D.IOCF), 0, 'a rising edge, not enabled');
  dev.ports.setInput('RD6', 0);
  assert.deepEqual([mcu.get(D.IOCF), mcu.get(0x0660), (mcu.get(0x008a) >> 3) & 1], [0x40, 0x08, 1], 'IOCFD, IOCPDF, IFS1\'s IOCIF');
  cpu.wr(D.IOCF, 0xffff, 0);
  assert.equal(mcu.get(D.IOCF), 0x40, 'a 1 written does not set it');
  cpu.wr(D.IOCF, 0, 0);
  assert.deepEqual([mcu.get(D.IOCF), mcu.get(0x0660)], [0, 0]);
});

test('#5481 the Explorer 16/32: its buttons\' pins pulled up, a press pulls them to 0; its LEDs lit by RA0-RA7\'s 1s', async () => {
  const { dev, mcu } = await dev0();
  const board = new Explorer1632(dev);
  mcu.cpu.wr(D.ANS, 0, 0);
  assert.equal(dev.ports.readPort('D') & 0x20c0, 0x20c0, 'S3, S4, S6 released');
  board.press('S3');
  assert.equal(dev.ports.readPort('D') & 0x20c0, 0x2080);
  assert.throws(() => board.press('S7'), /the Explorer 16\/32 has no button 'S7' \(S3, S4, S5, S6\)/);
  mcu.cpu.wr(A.TRIS, 0xff00, 0);
  mcu.cpu.wr(A.LAT, 0x0081, 0);
  assert.deepEqual(Object.entries(board.leds()).filter(([, on]) => on).map(([d]) => d), ['D3', 'D10']);
  assert.equal(EXPLORER_1632.buttons.S5, EXPLORER_1632.leds.D10, 'S5 and D10 share RA7');
});

test('#5481 a program on the Explorer 16/32: S3 (RD6) held lights D3, the LEDs\' changes the node\'s outputs at their times', () => {
  const { words } = pic24Assemble([
    'goto main', '.org 0x200',
    'main: clr 0x06a6', 'mov #0xff00, w0', 'mov w0, 0x0662',   // ANSD 0; RA0-RA7 outputs
    'loop: btss 0x06a0, #6', 'bra pressed', 'bclr 0x0666, #0', 'bra loop',
    'pressed: bset 0x0666, #0', 'bra loop',
  ]);
  const node = new Pic24Node({ program: words, fcy: 1e6 });
  new Explorer1632(node.device);
  const { outputs } = node.run(100e6, [{ t: 20e6, pin: 'RD6', value: 0 }, { t: 60e6, pin: 'RD6', value: 1 }]);
  const ra0 = outputs.filter((o) => o.pin === 'RA0');
  assert.deepEqual(ra0.map((o) => o.value), [0, 1, 0]);
  assert.ok(ra0[1].t > 20e6 && ra0[1].t < 30e6 && ra0[2].t > 60e6 && ra0[2].t < 70e6, JSON.stringify(ra0));
  assert.deepEqual(outputs.filter((o) => /^RA[1-7]$/.test(o.pin)).map((o) => o.value), [0, 0, 0, 0, 0, 0, 0]);
});
