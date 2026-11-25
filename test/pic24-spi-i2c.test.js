// The PIC24FJ1024GB610's SPI and I²C masters (#5481, packages/silinx-pic24/src/spi.js, i2c.js) and the Explorer
// 16/32's 25LC256 EEPROM (eeprom25lc.js): an SPI word's time at Fsck = Fpb / (2 · (BRG + 1)), its reply, SPIRBF,
// SPIROV, the 16-bit mode, the interrupts; the EEPROM's instructions; a program writing and reading it through SPI2
// mapped by PPS to its pins; I²C's start, address, data, acknowledge and stop with their times and the master
// interrupt, an address nobody answers, a read with its NACK. At Fcy = 16 MHz (forced).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceWith, runUntil } from './pic24-lib.mjs';
import { Explorer1632, Eeprom25lc256 } from '../packages/silinx-pic24/src/index.js';

const FWDT_OFF = { FWDT: 0xffff9f };
const SPI1 = { CON1L: 0x03f4, STATL: 0x03fc, BUFL: 0x0400, BRGL: 0x0404 };
const I2C1 = { RCV: 0x0494, TRN: 0x0496, BRG: 0x0498, CON1: 0x049a, STAT: 0x049e };
const dev16 = (lines = ['bra $'], opts = {}) => deviceWith(lines, { config: FWDT_OFF, fcy: 16e6, ...opts });
const flag = (mcu, irq) => (mcu.get(0x0088 + 2 * (irq >> 4)) >> (irq & 15)) & 1;

test('#5481 SPI1 master, 8 bits: a word over 8 clocks at Fpb / (2 · (BRG + 1)), its device\'s reply, SPIRBF, SPIROV; 16 bits', async () => {
  const { dev, mcu, cpu } = await dev16();
  const spi = dev.spis[0], heard = [];
  spi.onTransfer((w, bits) => { heard.push([w, bits]); return w ^ 0xff; });
  cpu.wr(SPI1.BRGL, 7, 0);                 // 1 MHz: 8 µs a byte
  cpu.wr(SPI1.CON1L, 0x8020, 0);           // SPIEN, MSTEN
  assert.equal(spi.sck, 1e6);
  cpu.wr(SPI1.BUFL, 0x5a, 0);
  assert.equal(cpu.rd(SPI1.STATL, 0) & 0x0802, 0x0802, 'SPIBUSY, SPITBF');
  const t0 = mcu.time;
  while (!(cpu.rd(SPI1.STATL, 0) & 1)) cpu.step();
  assert.ok(mcu.time - t0 >= 8e6 - 1e5 && mcu.time - t0 < 8.3e6);
  assert.deepEqual([cpu.rd(SPI1.BUFL, 0), heard, flag(mcu, 58)], [0xa5, [[0x5a, 8]], 1]);
  cpu.wr(SPI1.BUFL, 1, 0); mcu.runTo(mcu.time + 10e6);
  cpu.wr(SPI1.BUFL, 2, 0); mcu.runTo(mcu.time + 10e6);
  assert.equal(cpu.rd(SPI1.STATL, 0) & 0x40, 0x40, 'SPIROV: the second word with the first not read');
  // 16 bits (MODE16)
  const d = await dev16();
  d.dev.spis[0].onTransfer((w, bits) => (bits === 16 ? 0x1234 : undefined));
  d.cpu.wr(SPI1.CON1L, 0x8420, 0);
  d.cpu.wr(SPI1.BUFL, 0xabcd, 0);
  d.mcu.runTo(d.mcu.time + 3e6);
  assert.equal(d.cpu.rd(SPI1.BUFL, 0), 0x1234);
  // no device: ones
  const e = await dev16();
  e.cpu.wr(SPI1.CON1L, 0x8020, 0); e.cpu.wr(SPI1.BUFL, 0, 0); e.mcu.runTo(e.mcu.time + 2e6);
  assert.equal(e.cpu.rd(SPI1.BUFL, 0), 0xff);
});

test('#5481 the 25LC256: WREN, a page WRITE begun at CS\'s rise (5 ms WIP), WEL cleared; READ; RDSR', () => {
  const clock = { t: 0 }, e = new Eeprom25lc256({ now: () => clock.t });
  const op = (...bytes) => { e.select(); const r = bytes.map((b) => e.transfer(b)); e.end(); return r; };
  op(0x02, 0, 0x10, 0x41);
  assert.equal(e.mem[0x10], 0xff, 'no WREN: not written');
  op(0x06);
  assert.equal(op(0x05, 0)[1] & 2, 2, 'WEL');
  op(0x02, 0, 0x3e, 1, 2, 3);                      // across the page's end: wraps to its start
  assert.deepEqual([e.mem[0x3e], e.mem[0x3f], e.mem[0x00]], [1, 2, 3]);
  assert.equal(op(0x05, 0)[1] & 3, 1, 'WIP, WEL cleared');
  clock.t += 5e9;
  assert.equal(op(0x05, 0)[1] & 3, 0);
  assert.deepEqual(op(0x03, 0, 0x3e, 0, 0, 0).slice(3), [1, 2, 0xff]);
});

test('#5481 a program on the Explorer 16/32: SPI2 mapped to the 25LC256 (SCK RG6, SDO RG8, SDI RG7), CS RD12; a byte written, read back', async () => {
  // PPS: SDI2 (RPINR22 low) on RP26 (RG7), SDO2 (10) on RP19 (RG8, RPOR9 high), SCK2OUT (11) on RP21 (RG6, RPOR10 high)
  const XFER = (b) => [`mov #${b}, w0`, 'call xfer'];
  const { dev, cpu, labels } = await dev16([
    'mov #0x0900, w15', 'mov #0x3f1a, w0', 'mov w0, 0x07bc', 'mov #0x0a00, w0', 'mov w0, 0x07e6', 'mov #0x0b00, w0', 'mov w0, 0x07e8',
    'bclr 0x06a2, #12', 'bset 0x06a2, #12', 'bclr 0x069e, #12',          // RD12 an output, high (CS released)
    'mov #3, w0', 'mov w0, 0x0420', 'mov #0x8020, w0', 'mov w0, 0x0410',  // SPI2: 2 MHz, master
    'bclr 0x06a2, #12', ...XFER(0x06), 'bset 0x06a2, #12',                // WREN
    'bclr 0x06a2, #12', ...XFER(0x02), ...XFER(0x01), ...XFER(0x23), ...XFER(0x5a), 'bset 0x06a2, #12',   // WRITE 0x0123
    'wip: bclr 0x06a2, #12', ...XFER(0x05), ...XFER(0), 'bset 0x06a2, #12', 'btsc w0, #0', 'bra wip',
    'bclr 0x06a2, #12', ...XFER(0x03), ...XFER(0x01), ...XFER(0x23), ...XFER(0), 'bset 0x06a2, #12', 'mov w0, w8',
    'done: bra done',
    'xfer: mov w0, 0x041c', 'wait: btss 0x0418, #0', 'bra wait', 'mov 0x041c, w0', 'return',
  ]);
  const board = new Explorer1632(dev);
  assert.ok(runUntil(cpu, labels.done, 5e6));
  assert.deepEqual([board.eeprom.mem[0x123], cpu.W(8)], [0x5a, 0x5a]);
  assert.deepEqual(cpu.log, []);
});

test('#5481 I2C1 master: start, the address with W acknowledged, a byte, stop; each event\'s time and the master interrupt', async () => {
  const { dev, mcu, cpu } = await dev16();
  const got = [];
  dev.i2cs[0].attach(0x48, { start: (r) => got.push(['start', r]), write: (b) => { got.push(b); return true; }, stop: () => got.push('stop') });
  cpu.wr(I2C1.BRG, 158, 0);                 // Fscl = 16 MHz / 160 = 100 kHz: 10 µs a bit
  cpu.wr(I2C1.CON1, 0x8000, 0);
  const step = (bit, us) => {
    cpu.wr(I2C1.CON1, cpu.rd(I2C1.CON1, 0) | bit, 0);
    const t0 = mcu.time;
    while (cpu.rd(I2C1.CON1, 0) & bit) cpu.step();
    assert.ok(Math.abs(mcu.time - t0 - us * 1e6) < 0.3e6, `${(mcu.time - t0) / 1e6} µs`);
  };
  const send = (b) => { cpu.wr(I2C1.TRN, b, 0); const t0 = mcu.time; while (cpu.rd(I2C1.STAT, 0) & 0x4000) cpu.step(); assert.ok(mcu.time - t0 >= 89e6); };
  step(0x01, 10);
  assert.equal(cpu.rd(I2C1.STAT, 0) & 0x08, 0x08, 'S');
  send(0x90);
  assert.equal(cpu.rd(I2C1.STAT, 0) & 0x8000, 0, 'ACKSTAT 0: acknowledged');
  send(0x2a);
  step(0x04, 10);
  assert.deepEqual(got, [['start', false], 0x2a, 'stop']);
  assert.equal(flag(mcu, 17), 1, 'MI2C1IF');
  // an address nobody answers: not acknowledged
  step(0x01, 10); send(0x92);
  assert.equal(cpu.rd(I2C1.STAT, 0) & 0x8000, 0x8000);
});

test('#5481 I2C1 master read: the address with R, RCEN\'s byte in I2CxRCV (RBF), the NACK and the stop', async () => {
  const { dev, mcu, cpu } = await dev16();
  const acks = [];
  dev.i2cs[0].attach(0x50, { read: () => 0xc3, ack: (a) => acks.push(a) });
  cpu.wr(I2C1.BRG, 38, 0); cpu.wr(I2C1.CON1, 0x8000, 0);
  const wait = (bit) => { while (cpu.rd(I2C1.CON1, 0) & bit) cpu.step(); };
  cpu.wr(I2C1.CON1, 0x8001, 0); wait(1);
  cpu.wr(I2C1.TRN, 0xa1, 0); while (cpu.rd(I2C1.STAT, 0) & 0x4000) cpu.step();
  assert.equal(cpu.rd(I2C1.STAT, 0) & 0x0004, 0x0004, 'R_W');
  cpu.wr(I2C1.CON1, 0x8008, 0); wait(8);
  assert.equal(cpu.rd(I2C1.STAT, 0) & 2, 2, 'RBF');
  assert.equal(cpu.rd(I2C1.RCV, 0), 0xc3);
  assert.equal(cpu.rd(I2C1.STAT, 0) & 2, 0, 'RBF cleared by the read');
  cpu.wr(I2C1.CON1, 0x8030, 0); wait(0x10);   // ACKDT 1: NACK
  cpu.wr(I2C1.CON1, 0x8004, 0); wait(4);
  assert.deepEqual([acks, cpu.rd(I2C1.STAT, 0) & 0x10], [[false], 0x10]);
});
