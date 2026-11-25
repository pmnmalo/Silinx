// The PIC24FJ1024GB610's UARTs (#5481, packages/silinx-pic24/src/uart.js), at the characters' level (their pins, PPS's,
// in pic24-pps): the baud from UxBRG and BRGH, each frame's time (8N1, 8E1, 9N2), the 4-deep buffers (UTXBF, TRMT,
// URXDA, OERR and its error interrupt), the interrupts as UTXISEL and URXISEL choose, the loopback, a program sending
// a line and a program echoing what it receives, as a terminal sees them. At Fcy = 16 MHz (forced).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceWith, runUntil } from './pic24-lib.mjs';

const FWDT_OFF = { FWDT: 0xffff9f };
const U2 = { MODE: 0x03ae, STA: 0x03b0, TX: 0x03b2, RX: 0x03b4, BRG: 0x03b6 };
const dev16 = (lines = ['bra $'], opts = {}) => deviceWith(lines, { config: FWDT_OFF, fcy: 16e6, ...opts });
const flag = (mcu, irq) => (mcu.get(0x0088 + 2 * (irq >> 4)) >> (irq & 15)) & 1;

// UART2 on, 115200 baud nominal (BRGH, UxBRG 34: 16 MHz / (4 · 35) = 114286), receive and transmit enabled
const ON = ['mov #34, w0', 'mov w0, 0x03b6', 'mov #0x8008, w0', 'mov w0, 0x03ae', 'mov #0x1400, w0', 'mov w0, 0x03b0'];

test('#5481 the baud: Fcy / (16 · (UxBRG + 1)), or / 4 with BRGH; a frame\'s bits (8N1 10, 8E1 11, 9N2 12)', async () => {
  const { dev, cpu } = await dev16();
  const u = dev.uarts[1];
  cpu.wr(U2.BRG, 103, 0);
  assert.equal(u.baud, 16e6 / (16 * 104));
  cpu.wr(U2.MODE, 0x8008, 0);
  assert.equal(u.baud, 16e6 / (4 * 104));
  assert.equal(u.frameBits, 10);
  cpu.wr(U2.MODE, 0x800a, 0);
  assert.equal(u.frameBits, 11);
  cpu.wr(U2.MODE, 0x800f, 0);
  assert.equal(u.frameBits, 12);
});

test('#5481 a program sending "Hi!\\n" (UTXBF polled): each character out at its frame\'s end, 10 bits apart; TRMT at the end', async () => {
  const { dev, mcu, cpu, labels } = await dev16([...ON,
    'mov #0x1000, w1', 'next: mov.b [w1++], w0', 'cp0.b w0', 'bra z, done', 'wait: btsc 0x03b0, #9', 'bra wait', 'mov w0, 0x03b2', 'bra next',
    'done: btss 0x03b0, #8', 'bra done', 'end: bra end',
  ]);
  // the message in RAM at 0x1000, as a C string
  const text = 'Hi!\n';
  [...text, '\0'].forEach((ch, i) => cpu.wr(0x1000 + i, ch.charCodeAt(0), 1));
  const seen = [];
  dev.uarts[1].onTransmit((b, t) => seen.push([String.fromCharCode(b), t]));
  assert.ok(runUntil(cpu, labels.end, 1e5));
  assert.deepEqual(seen.map(([c]) => c).join(''), text);
  const bit = 1e12 / dev.uarts[1].baud;
  for (let i = 1; i < seen.length; i++) assert.ok(Math.abs(seen[i][1] - seen[i - 1][1] - 10 * bit) < 1e6, `${seen[i][1] - seen[i - 1][1]}`);
  assert.ok(mcu.time >= seen[3][1]);
  assert.deepEqual(cpu.log, []);
});

test('#5481 the transmit buffer: the shift register and 4 more, UTXBF then; a sixth character lost, said', async () => {
  const { dev, cpu } = await dev16();
  cpu.wr(U2.BRG, 34, 0); cpu.wr(U2.MODE, 0x8008, 0); cpu.wr(U2.STA, 0x1400, 0);
  for (let i = 0; i < 5; i++) cpu.wr(U2.TX, 0x41 + i, 0);
  assert.equal(cpu.rd(U2.STA, 0) & 0x0300, 0x0200, 'UTXBF, not TRMT');
  cpu.wr(U2.TX, 0x46, 0);
  assert.deepEqual(cpu.log.map((l) => l.text), ['UART2: UxTXREG written with its buffer full (UTXBF): the character is lost']);
  const out = [];
  dev.uarts[1].onTransmit((b) => out.push(b));
  dev.mcu.runTo(dev.mcu.time + 6 * 10 * 1e12 / dev.uarts[1].baud);
  assert.deepEqual(out, [0x41, 0x42, 0x43, 0x44, 0x45]);
  assert.equal(cpu.rd(U2.STA, 0) & 0x0100, 0x0100, 'TRMT');
});

test('#5481 receiving: URXDA, UxRXREG in order; a fifth character with 4 waiting overruns (OERR, the error interrupt); OERR cleared', async () => {
  const { dev, mcu, cpu } = await dev16();
  cpu.wr(U2.MODE, 0x8000, 0); cpu.wr(U2.STA, 0x1000, 0);
  const u = dev.uarts[1];
  for (const c of 'abcd') assert.equal(u.receive(c.charCodeAt(0)), true);
  assert.deepEqual([cpu.rd(U2.STA, 0) & 1, flag(mcu, 30)], [1, 1], 'URXDA, U2RXIF');
  assert.equal(u.receive(0x65), false);
  assert.deepEqual([cpu.rd(U2.STA, 0) & 2, flag(mcu, 66)], [2, 1], 'OERR, U2EIF');
  assert.deepEqual([0, 1, 2, 3].map(() => cpu.rd(U2.RX, 0)), [0x61, 0x62, 0x63, 0x64]);
  assert.equal(u.receive(0x66), false, 'OERR set: nothing received');
  cpu.wr(U2.STA, 0x1000, 0);
  assert.equal(u.receive(0x66), true);
  // URXISEL 10: the interrupt at 3 characters
  const d = await dev16();
  d.cpu.wr(U2.MODE, 0x8000, 0); d.cpu.wr(U2.STA, 0x1080, 0);
  const v = d.dev.uarts[1];
  v.receive(1); v.receive(2);
  assert.equal(flag(d.mcu, 30), 0);
  v.receive(3);
  assert.equal(flag(d.mcu, 30), 1);
});

test('#5481 UTXISEL: 00 a character into the shift register, 01 the last one out, 10 the buffer emptied; LPBACK', async () => {
  for (const [sta, at] of [[0x1400, 'start'], [0x3400, 'end'], [0x9400, 'start']]) {
    const { mcu, cpu } = await dev16();
    cpu.wr(U2.BRG, 34, 0); cpu.wr(U2.MODE, 0x8008, 0); cpu.wr(U2.STA, sta, 0);
    cpu.wr(0x008a, 0, 0);   // (UTXEN's own interrupt cleared)
    cpu.wr(U2.TX, 0x55, 0);
    assert.equal(flag(mcu, 31), at === 'start' ? 1 : 0, `${sta.toString(16)} at once`);
    mcu.runTo(mcu.time + 11e12 / 114286);
    assert.equal(flag(mcu, 31), 1, `${sta.toString(16)} after`);
  }
  const { dev, mcu, cpu } = await dev16();
  cpu.wr(U2.BRG, 34, 0); cpu.wr(U2.MODE, 0x8048, 0); cpu.wr(U2.STA, 0x1400, 0);
  cpu.wr(U2.TX, 0x5a, 0);
  mcu.runTo(mcu.time + 11e12 / dev.uarts[1].baud);
  assert.equal(cpu.rd(U2.RX, 0), 0x5a, 'looped back');
});

test('#5481 a program echoing what a terminal sends, from U2RX\'s interrupt', async () => {
  const { dev, mcu } = await dev16([
    'mov #0x0900, w15', ...ON, 'bset 0x009a, #14', 'idle: bra idle',
    'rx: push w0', 'mov 0x03b4, w0', 'mov w0, 0x03b2', 'bclr 0x008a, #14', 'pop w0', 'retfie',
  ], { vectors: { 30: 'rx' } });
  const u = dev.uarts[1], out = [];
  u.onTransmit((b) => out.push(String.fromCharCode(b)));
  mcu.runTo(10e6);
  for (const [i, c] of [...'hello'].entries()) mcu.schedule(20e6 + i * 100e6, () => u.receive(c.charCodeAt(0)));
  mcu.runTo(700e6);
  assert.equal(out.join(''), 'hello');
  assert.deepEqual(dev.cpu.log, []);
});
