// The PIC24FJ1024GB610's input capture and output compare modules with dedicated timers (#5529,
// packages/silinx-pic24/src/icoc.js): OC1-6's and IC1-6's registers at reset; OC's edge-aligned PWM on its own period
// (OCxRS + 1) and synchronised to Timer2 on Timer2's clock (the classic set-up), its period and duty on its pin at
// their times, the values latched at the next period; the compare modes (single shot high and low, toggle, a pulse once
// and every period), OCxIF, OCINV, OCTRIS; IC's captures on the system clock (every rising, the 4th, the FIFO and
// ICOV, ICI) and on Timer3's clock synchronised to it (ICxTMR follows TMR3), its interrupt-only mode asleep; the
// warnings of what is not emulated. A program: OC1's PWM measured by IC1 on the same pin (PPS). At Fcy = 1 MHz
// (forced): a count of the system clock is 1 µs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceWith } from './pic24-lib.mjs';

const FWDT_OFF = { FWDT: 0xffff9f };
const IFS0 = 0x0088, US = 1e6;
const LOOP = ['top: repeat #16383', 'nop', 'bra top'];
const OC = (n, r) => 0x0230 + 0x0a * (n - 1) + { CON1: 0, CON2: 2, RS: 4, R: 6, TMR: 8 }[r];
const IC = (n, r) => 0x0200 + 8 * (n - 1) + { CON1: 0, CON2: 2, BUF: 4, TMR: 6 }[r];
const T2CON = 0x01a0, PR2 = 0x019c, T3CON = 0x01a2, PR3 = 0x019e, TMR3 = 0x019a;
const RPOR1 = 0x07d6, RPINR7 = 0x079e;
async function dev1(lines = LOOP) {
  const d = await deviceWith(lines, { config: FWDT_OFF, fcy: 1e6 });
  d.mcu.runTo(10 * US);
  return d;
}
const flag = (mcu, irq) => (mcu.get(IFS0 + 2 * (irq >> 4)) >> (irq & 15)) & 1;
function edges(dev, pin) {
  const list = [];
  dev.ports.onChange((p, d) => { if (p === pin) list.push([dev.mcu.time, d]); });
  list.from = (t0) => list.map(([t, l]) => [Math.round((t - t0) / US), l]);
  return list;
}

test('#5529 OC1-6 and IC1-6 at reset: OCxCON2 0x000C (Timer2\'s sync), ICxCON2 0x000D (Timer3\'s), the rest 0; their pins left', async () => {
  const { cpu, dev } = await dev1();
  for (let n = 1; n <= 6; n++) {
    assert.deepEqual([cpu.rd(OC(n, 'CON1'), 0), cpu.rd(OC(n, 'CON2'), 0), cpu.rd(OC(n, 'R'), 0)], [0, 0x000c, 0], `OC${n}`);
    assert.deepEqual([cpu.rd(IC(n, 'CON1'), 0), cpu.rd(IC(n, 'CON2'), 0)], [0, 0x000d], `IC${n}`);
  }
  assert.deepEqual(['RD6', 'RD7', 'RF0'].map((p) => dev.ports.driven(p)), [1, 1, 1].map(() => null));
  assert.deepEqual(cpu.log, []);
});

test('#5529 OC4\'s edge-aligned PWM on its own period (SYNCSEL 11111) on RD6: high from the period\'s start for OCxR counts, OC4IF each period', async () => {
  const { mcu, cpu, dev } = await dev1();
  const list = edges(dev, 'RD6');
  cpu.wr(OC(4, 'RS'), 999, 0);
  cpu.wr(OC(4, 'R'), 250, 0);
  cpu.wr(OC(4, 'CON2'), 0x001f, 0);
  cpu.wr(OC(4, 'CON1'), 0x1c06, 0);   // the system clock, PWM
  const t0 = dev.ocs[3].tb.tp;
  mcu.runTo(t0 + 2100 * US);
  assert.deepEqual(list.from(t0), [[0, 1], [250, 0], [1000, 1], [1250, 0], [2000, 1]]);
  assert.equal(flag(mcu, 26), 1, 'OC4IF');
  // the duty written mid-period: from the next period
  cpu.wr(OC(4, 'R'), 600, 0);
  mcu.runTo(t0 + 3700 * US);
  assert.deepEqual(list.from(t0).slice(5), [[2250, 0], [3000, 1], [3600, 0]]);
  assert.deepEqual(cpu.log, []);
});

test('#5529 OC1\'s PWM synchronised to Timer2 on Timer2\'s clock (OCTSEL 000, SYNCSEL 01100), through PPS: Timer2\'s period, its 1:8 prescale', async () => {
  const { mcu, cpu, dev } = await dev1();
  cpu.wr(RPOR1, 13, 0);   // RP2 (RD8): OC1
  const list = edges(dev, 'RD8');
  cpu.wr(OC(1, 'R'), 100, 0);
  cpu.wr(OC(1, 'CON1'), 0x0006, 0);
  cpu.wr(PR2, 499, 0);
  cpu.wr(T2CON, 0x8010, 0);   // on, 1:8: a count every 8 µs, a period of 4 ms
  const t0 = dev.timers.pairs[0].lo.t0;
  mcu.runTo(t0 + 8100 * US);
  const got = list.from(t0).filter(([t]) => t > 0);
  assert.deepEqual(got, [[800, 0], [4000, 1], [4800, 0], [8000, 1]]);
  assert.equal(cpu.rd(OC(1, 'TMR'), 0), cpu.rd(0x0196, 0), 'OC1TMR follows TMR2');
  assert.deepEqual(cpu.log, []);
});

test('#5529 OC\'s compare modes: single shot high and low, a toggle each match, a pulse once and every period; OCxIF; OCINV, OCTRIS', async () => {
  const run = async (con1, con2, r, rs, us = 350) => {
    const { mcu, cpu, dev } = await dev1();
    const list = edges(dev, 'RF0');   // OC6
    cpu.wr(OC(6, 'R'), r, 0); cpu.wr(OC(6, 'RS'), rs, 0);
    cpu.wr(OC(6, 'CON2'), con2, 0);
    cpu.wr(OC(6, 'CON1'), con1, 0);
    const t0 = dev.ocs[5].tb.tp;
    mcu.runTo(t0 + us * US);
    assert.deepEqual(cpu.log, []);
    return { got: list.from(t0), flag: flag(mcu, 42), dev, cpu };
  };
  assert.deepEqual((await run(0x1c01, 0, 20, 0)).got, [[0, 0], [21, 1]], '001: high once');
  assert.deepEqual((await run(0x1c02, 0, 20, 0)).got, [[0, 1], [21, 0]], '010: low once');
  const toggle = await run(0x1c03, 0x001f, 20, 99);
  assert.deepEqual(toggle.got, [[0, 0], [21, 1], [121, 0], [221, 1], [321, 0]], '011: toggled each period of OCxRS + 1');
  assert.equal(toggle.flag, 1);
  assert.deepEqual((await run(0x1c04, 0, 10, 30)).got, [[0, 0], [11, 1], [31, 0]], '100: a pulse once');
  assert.deepEqual((await run(0x1c05, 0x001f, 10, 49, 120)).got, [[0, 0], [11, 1], [50, 0], [61, 1], [100, 0], [111, 1]], '101: every period');
  const inv = await run(0x1c04, 0x1000, 10, 30);
  assert.deepEqual(inv.got, [[0, 1], [11, 0], [31, 1]], 'OCINV');
  inv.cpu.wr(OC(6, 'CON2'), 0x1020, 0);
  assert.equal(inv.dev.ports.driven('RF0'), null, 'OCTRIS: the pin left');
});

test('#5529 IC4 on RE5 on the system clock: the timer\'s value at each rising edge, every 4th, ICI, the FIFO of four and ICOV', async () => {
  const { mcu, cpu, dev } = await dev1();
  dev.ports.setInput('RE5', 0);
  cpu.wr(IC(4, 'CON2'), 0, 0);   // free-running
  cpu.wr(IC(4, 'CON1'), 0x1c23, 0);   // the system clock, ICI 01 (every second), every rising edge
  const t0 = dev.ics[3].tb.tp;
  const pulseAt = (us) => { mcu.runTo(t0 + us * US); dev.ports.setInput('RE5', 1); mcu.runTo(t0 + (us + 20) * US); dev.ports.setInput('RE5', 0); };
  pulseAt(100);
  assert.equal(flag(mcu, 38), 0, 'not after one');
  pulseAt(350);
  assert.equal(flag(mcu, 38), 1, 'IC4IF after the second');
  assert.equal(cpu.rd(IC(4, 'CON1'), 0) & 0x18, 0x08, 'ICBNE');
  const a = cpu.rd(IC(4, 'BUF'), 0), b = cpu.rd(IC(4, 'BUF'), 0);
  assert.ok(Math.abs(a - 100) <= 1 && b - a === 250, `${a}, ${b}`);
  assert.equal(cpu.rd(IC(4, 'CON1'), 0) & 0x18, 0, 'empty');
  for (const us of [1000, 1100, 1200, 1300, 1400]) pulseAt(us);
  assert.equal(cpu.rd(IC(4, 'CON1'), 0) & 0x18, 0x18, 'ICOV, ICBNE');
  assert.equal(dev.ics[3].fifo.length, 4);
  // every 4th rising
  const d = await dev1();
  d.dev.ports.setInput('RE6', 0);
  d.cpu.wr(IC(5, 'CON2'), 0, 0);
  d.cpu.wr(IC(5, 'CON1'), 0x1c04, 0);
  for (let i = 0; i < 9; i++) { d.mcu.runTo(d.mcu.time + 5 * US); d.dev.ports.setInput('RE6', 1); d.mcu.runTo(d.mcu.time + 5 * US); d.dev.ports.setInput('RE6', 0); }
  assert.equal(d.dev.ics[4].fifo.length, 2);
  assert.deepEqual([cpu.log, d.cpu.log], [[], []]);
});

test('#5529 IC1 through PPS on Timer3\'s clock, synchronised to it (the reset\'s ICTSEL 000, SYNCSEL 01101): its captures TMR3\'s values; Timer3 off, no count', async () => {
  const { mcu, cpu, dev } = await dev1();
  cpu.wr(RPINR7, 2, 0);   // IC1 from RP2 (RD8)
  dev.ports.setInput('RD8', 0);
  cpu.wr(IC(1, 'CON1'), 0x0003, 0);
  mcu.runTo(mcu.time + 50 * US);
  assert.equal(cpu.rd(IC(1, 'TMR'), 0), 0, 'Timer3 off: IC1TMR stopped');
  cpu.wr(PR3, 99, 0);
  cpu.wr(T3CON, 0x8000, 0);
  mcu.runTo(mcu.time + 230 * US);
  const tmr3 = cpu.rd(TMR3, 0);
  dev.ports.setInput('RD8', 1);
  assert.equal(cpu.rd(IC(1, 'BUF'), 0), tmr3, 'the capture TMR3\'s count');
  assert.equal(cpu.rd(IC(1, 'TMR'), 0), cpu.rd(TMR3, 0));
  assert.deepEqual(cpu.log, []);
});

test('#5529 ICM 111: the input an interrupt (its rising edge) only while the device sleeps', async () => {
  const { mcu, cpu, dev } = await dev1(['bra $']);
  dev.ports.setInput('RE7', 0);
  cpu.wr(IC(6, 'CON1'), 0x0007, 0);
  dev.ports.setInput('RE7', 1);
  assert.equal(flag(mcu, 40), 0, 'awake: no interrupt');
  dev.ports.setInput('RE7', 0);
  cpu.sleeping = 'sleep';
  dev.ports.setInput('RE7', 1);
  assert.equal(flag(mcu, 40), 1, 'asleep: IC6IF');
  assert.deepEqual(cpu.log, []);
});

test('#5529 what is not emulated said: OC32, OCTRIG, center-aligned PWM, a sync source, IC32, ICTRIG', async () => {
  const { cpu } = await dev1();
  cpu.wr(OC(1, 'CON2'), 0x0100 | 0x1f, 0); cpu.wr(OC(1, 'CON1'), 0x1c06, 0);
  cpu.wr(OC(2, 'CON2'), 0x0080 | 0x1f, 0); cpu.wr(OC(2, 'CON1'), 0x1c06, 0);
  cpu.wr(OC(3, 'CON2'), 0x001f, 0); cpu.wr(OC(3, 'CON1'), 0x1c07, 0);
  cpu.wr(OC(4, 'CON2'), 0x0010, 0); cpu.wr(OC(4, 'CON1'), 0x1c06, 0);
  cpu.wr(IC(1, 'CON2'), 0x0100, 0); cpu.wr(IC(1, 'CON1'), 0x1c03, 0);
  cpu.wr(IC(2, 'CON2'), 0x0080, 0); cpu.wr(IC(2, 'CON1'), 0x1c03, 0);
  assert.deepEqual(cpu.log.map((m) => m.text), [
    'OC1\'s cascaded 32-bit mode (OC32) is not emulated: a 16-bit module',
    'OC2\'s Trigger mode (OCTRIG) is not emulated: synchronised to its source',
    'OC3\'s center-aligned PWM (OCM 111) is not emulated: no output',
    'OC4\'s sync source (SYNCSEL 10000) is not emulated: free-running',
    'IC1\'s cascaded 32-bit mode (IC32) is not emulated: a 16-bit module',
    'IC2\'s Trigger mode (ICTRIG) is not emulated: synchronised to its source',
  ]);
});

test('#5529 a program: OC1\'s PWM (a period of 1 ms, 300 µs high) on RD8 measured by IC1 on the same pin (PPS), every edge', async () => {
  const { cpu, labels } = await dev1([
    'mov #13, w0', 'mov w0, 0x07d6',                   // RPOR1: RP2 (RD8) OC1
    'mov #2, w0', 'mov w0, 0x079e',                    // RPINR7: IC1 from RP2
    'mov #999, w0', 'mov w0, 0x0234', 'mov #300, w0', 'mov w0, 0x0236',   // OC1RS, OC1R
    'mov #0x001f, w0', 'mov w0, 0x0232', 'mov #0x1c06, w0', 'mov w0, 0x0230',   // OC1: its own period, PWM
    'clr 0x0202', 'mov #0x1c01, w0', 'mov w0, 0x0200',  // IC1: free-running, every edge
    'mov #0x0204, w1',
    'mov #3, w5',
    'next: btss 0x0200, #3', 'bra next',               // ICBNE
    'mov [w1], w0', 'push w0', 'dec w5, w5', 'bra nz, next',
    'pop w3', 'pop w2', 'pop w1',
    'sub w2, w1, w4',                                  // the first two edges: high or low
    'sub w3, w1, w5',                                  // the first and third: a period
    'done: bra done',
  ]);
  for (let n = 0; cpu.pc !== labels.done && n < 1e5; n++) cpu.step();
  assert.equal(cpu.pc, labels.done);
  assert.equal(cpu.W(5), 1000, 'a period of 1000 µs');
  assert.ok([300, 700].includes(cpu.W(4)), `${cpu.W(4)}: 300 µs high, 700 low`);
  assert.deepEqual(cpu.log, []);
});
