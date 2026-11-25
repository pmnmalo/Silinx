// The PIC24FJ1024GB610's oscillator and watchdog (#5481, packages/silinx-pic24/src/osc.js, wdt.js, mcu.js): the
// clock at reset as FOSCSEL selects it (Fcy = Fosc / 2), CLKDIV's CPDIV and DOZE, OSCDIV's divided FRC, the clock
// switch through OSCCON's unlock sequences as FOSC's FCKSM allows it, IOLOCK, the time in ps across a change of the
// clock; the watchdog's period (FWPSA, WDTPS), its reset (RCON's WDTO), CLRWDT, its software enable, its window, its
// wake-up from Sleep; RCON's reset flags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceWith, runUntil } from './pic24-lib.mjs';

const FRCPLL = 0xfffc09;          // FNOSC 001, PLLMODE 0001: the 96 MHz USB PLL from the 8 MHz FRC
const PRI = 0xfffc7a;             // FNOSC 010, no PLL
const FOSC_SWITCH = 0xffff7d;     // FCKSM 01 (switching on), IOL1WAY, POSCMD 01 (XT, the 8 MHz crystal)
const WDT_OFF = 0xffff9f;
const OSCCON = 0x100, CLKDIV = 0x102, RCON = 0x110;

// OSCCON's high byte (NOSC) then its low byte (OSWEN), as XC16's __builtin_write_OSCCONH and L do
const SWITCH_TO = (nosc) => [
  'mov #0x0101, w0', 'mov #0x78, w1', 'mov #0x9a, w2', `mov #${nosc}, w3`, 'mov.b w1, [w0]', 'mov.b w2, [w0]', 'mov.b w3, [w0]',
  'mov #0x0100, w0', 'mov #0x46, w1', 'mov #0x57, w2', 'mov #1, w3', 'mov.b w1, [w0]', 'mov.b w2, [w0]', 'mov.b w3, [w0]',
];

test('#5481 the clock at reset: FOSCSEL\'s FNOSC in COSC and NOSC; erased the FRC / 2 (Fcy 2 MHz), FRCPLL 32 MHz (Fcy 16 MHz)', async () => {
  let { mcu, dev } = await deviceWith(['bra 0x200']);
  assert.deepEqual([dev.osc.source, dev.osc.fosc, mcu.fcy, mcu.get(OSCCON) & 0x7720], ['FRCDIV', 4e6, 2e6, 0x7700]);
  ({ mcu, dev } = await deviceWith(['bra 0x200'], { config: { FOSCSEL: FRCPLL, FWDT: WDT_OFF } }));
  assert.deepEqual([dev.osc.source, mcu.fcy, mcu.get(OSCCON)], ['FRCPLL', 16e6, 0x1120], 'LOCK set with a PLL');
  ({ mcu, dev } = await deviceWith(['bra 0x200'], { config: { FOSCSEL: PRI, FOSC: FOSC_SWITCH, FWDT: WDT_OFF }, primaryHz: 12e6 }));
  assert.deepEqual([dev.osc.source, mcu.fcy], ['PRI', 6e6]);
  // the primary oscillator disabled (FOSC's POSCMD 11): no clock, said
  ({ mcu, dev } = await deviceWith(['bra 0x200'], { config: { FOSCSEL: PRI, FWDT: WDT_OFF } }));
  assert.match(mcu.cpu.log[0].text, /the oscillator PRI gives no clock \(FOSC's POSCMD: the primary oscillator disabled\)/);
});

test('#5481 CLKDIV\'s CPDIV divides the PLL\'s 32 MHz; OSCDIV the FRC; the time in ps kept across the change', async () => {
  const { mcu, cpu } = await deviceWith(['mov #0x0040, w0', 'mov w0, 0x0102', 'loop: bra loop'], { config: { FOSCSEL: FRCPLL, FWDT: WDT_OFF } });
  cpu.step(); cpu.step();   // GOTO (2), MOV (1): 3 cycles at 16 MHz
  const t0 = mcu.time;
  assert.equal(t0, 3 * 62500);
  cpu.step();   // MOV to CLKDIV: CPDIV 01, 16 MHz, Fcy 8 MHz from its end
  assert.equal(mcu.fcy, 8e6);
  const t1 = mcu.time;
  cpu.step();   // BRA: 2 cycles at 8 MHz
  assert.equal(mcu.time - t1, 2 * 125000);
  // the divided FRC: OSCDIV 4, Fosc 8 MHz / 8 = 1 MHz
  const d = await deviceWith(['mov #4, w0', 'mov w0, 0x010c', 'bra $'], { config: { FWDT: WDT_OFF } });
  d.cpu.step(); d.cpu.step(); d.cpu.step();
  assert.deepEqual([d.dev.osc.fosc, d.mcu.fcy], [1e6, 5e5]);
});

test('#5481 DOZE: the CPU at Fcy over its ratio while DOZEN, the peripherals at Fcy', async () => {
  const { mcu, cpu, dev } = await deviceWith(['mov #0x1800, w0', 'mov w0, 0x0102', 'bra $'], { config: { FOSCSEL: FRCPLL, FWDT: WDT_OFF } });
  for (let i = 0; i < 3; i++) cpu.step();
  assert.deepEqual([mcu.fcy, dev.osc.doze, dev.osc.fcy], [8e6, 2, 16e6], 'DOZE 1:2: the CPU at 8 MHz, the peripherals at 16');
});

test('#5481 the clock switch: NOSC after 0x78, 0x9A; OSWEN after 0x46, 0x57; COSC = NOSC, OSWEN cleared, the clock changed', async () => {
  // FNOSC the divided FRC, PLLMODE the 96 MHz USB PLL: Fcy 2 MHz, then FRCPLL's 16 MHz
  const { mcu, cpu, dev, labels } = await deviceWith([...SWITCH_TO(1), 'done: bra done'], { config: { FOSCSEL: 0xfffc0f, FOSC: FOSC_SWITCH, FWDT: WDT_OFF } });
  assert.equal(mcu.fcy, 2e6);
  runUntil(cpu, labels.done);
  assert.deepEqual([dev.osc.source, mcu.fcy, mcu.get(OSCCON) & 0x7721], ['FRCPLL', 16e6, 0x1120]);
  assert.deepEqual(cpu.log, []);
  // without the unlock: NOSC not written
  const n = await deviceWith(['mov #0x0101, w0', 'mov #1, w3', 'mov.b w3, [w0]', 'done: bra done'], { config: { FOSC: FOSC_SWITCH, FWDT: WDT_OFF } });
  runUntil(n.cpu, n.labels.done);
  assert.equal((n.mcu.get(OSCCON) >> 8) & 7, 7);
  // FCKSM 1x (erased): switching disabled, said
  const e = await deviceWith([...SWITCH_TO(1), 'done: bra done'], { config: { FWDT: WDT_OFF } });
  runUntil(e.cpu, e.labels.done);
  assert.deepEqual([e.dev.osc.source, e.mcu.get(OSCCON) & 1], ['FRCDIV', 0]);
  assert.match(e.cpu.log[0].text, /OSWEN: clock switching is disabled \(FOSC's FCKSM\)/);
});

test('#5481 IOLOCK: set after 0x46, 0x57; with FOSC\'s IOL1WAY set once, never cleared', async () => {
  const lock = ['mov #0x0100, w0', 'mov #0x46, w1', 'mov #0x57, w2', 'mov #0x40, w3', 'mov.b w1, [w0]', 'mov.b w2, [w0]', 'mov.b w3, [w0]'];
  const unlock = ['mov.b w1, [w0]', 'mov.b w2, [w0]', 'clr w3', 'mov.b w3, [w0]'];
  for (const [fosc, after] of [[FOSC_SWITCH, true], [FOSC_SWITCH & ~0x20, false]]) {
    const { cpu, dev, labels } = await deviceWith([...lock, 'locked: nop', ...unlock, 'done: bra done'], { config: { FOSC: fosc, FWDT: WDT_OFF } });
    runUntil(cpu, labels.locked);
    assert.equal(dev.osc.ioLocked, true);
    runUntil(cpu, labels.done);
    assert.equal(dev.osc.ioLocked, after, `IOL1WAY ${!!(fosc & 0x20)}`);
  }
});

test('#5481 the watchdog: its period 32 or 128 LPRC periods times 2^WDTPS; its time-out resets the device, WDTO set, said', async () => {
  // FWDTEN 11, FWPSA 0 (32), WDTPS 0: 32 / 31 kHz = 1.03 ms; at Fcy 2 MHz 2065 cycles
  const { mcu, cpu, dev } = await deviceWith(['inc w5, w5', 'loop: bra loop'], { config: { FWDT: 0xffffe0 } });
  assert.equal(dev.wdt.period, 32 / 31e3);
  while (cpu.cycles < 2000) cpu.step();
  assert.equal(cpu.log.length, 0);
  while (cpu.cycles < 2100) cpu.step();
  assert.deepEqual(cpu.log.map((l) => l.text), ['the watchdog timed out (1.03 ms): the device resets']);
  assert.equal(mcu.get(RCON) & 0x0013, 0x0013, 'WDTO, and POR / BOR kept from the power-on');
  assert.equal(cpu.pc < 0x210, true);
  const big = await deviceWith(['bra $'], { config: { FWDT: 0xffffff } });
  assert.equal(big.dev.wdt.period, 128 * 32768 / 31e3, 'erased: 1:128, 1:32,768 (135 s)');
});

test('#5481 CLRWDT keeps the watchdog from its time-out; the software enable (FWDTEN 10, RCON\'s SWDTEN)', async () => {
  const { cpu } = await deviceWith(['loop: clrwdt', 'repeat #500', 'nop', 'bra loop'], { config: { FWDT: 0xffffe0 } });
  while (cpu.cycles < 20000) cpu.step();
  assert.deepEqual(cpu.log, []);
  const s = await deviceWith(['repeat #3000', 'nop', 'on: bset 0x0110, #5', 'loop: bra loop'], { config: { FWDT: 0xffffc0 } });
  while (s.cpu.cycles < 3500) s.cpu.step();
  assert.deepEqual(s.cpu.log, [], 'off until SWDTEN');
  while (s.cpu.cycles < 7000) s.cpu.step();
  assert.equal(s.cpu.log.length, 1);
  assert.equal(s.mcu.get(RCON) & 0x0020, 0, 'SWDTEN cleared by the reset');
});

test('#5481 the windowed watchdog (WINDIS 0): a CLRWDT before its window resets the device', async () => {
  const { cpu } = await deviceWith(['clrwdt', 'bra $'], { config: { FWDT: 0xffff60 } });
  cpu.step(); cpu.step();
  assert.deepEqual(cpu.log.map((l) => l.text), ['CLRWDT before the watchdog\'s window (1.03 ms): the device resets']);
});

test('#5481 asleep, the watchdog\'s time-out wakes the device after PWRSAV, RCON\'s SLEEP and WDTO set', async () => {
  const { mcu, cpu, labels } = await deviceWith(['pwrsav #0', 'woke: inc w5, w5', 'bra $'], { config: { FWDT: 0xffffe0 } });
  cpu.step(); cpu.step();
  assert.equal(cpu.sleeping, 'sleep');
  runUntil(cpu, labels.woke + 2);
  assert.deepEqual([cpu.W(5) & 0xff, mcu.get(RCON) & 0x0018, cpu.log], [1, 0x0018, []]);
  assert.ok(cpu.cycles > 2000);
});

test('#5481 RCON\'s flags: POR and BOR at power-on, SWR after RESET, IOPUWR after an illegal instruction, kept until cleared', async () => {
  const { mcu, cpu } = await deviceWith(['clr 0x0110', 'reset'], { config: { FWDT: WDT_OFF } });
  assert.equal(mcu.get(RCON), 0x0003);
  cpu.step(); cpu.step(); cpu.step();
  assert.equal(mcu.get(RCON), 0x0040);
  const i = await deviceWith(['.word 0xc30000'], { config: { FWDT: WDT_OFF } });
  i.cpu.step(); i.cpu.step();
  assert.equal(i.mcu.get(RCON), 0x4003);
});
