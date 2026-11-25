// The PIC24FJ1024GB610's MCCP1-3 and SCCP4-7 (#5529, packages/silinx-pic24/src/ccp.js): the registers' resets and
// STATL's clearable bits; the timer modes (two 16-bit timers, CCTxIF and CCPxIF; one 32-bit; OPS's postscale; the
// prescaler); single edge compare (high, low, toggle one clock after the match, SCEVT); the dual edge PWM, its period
// and duty on its pin at their times (MCCP3's OCM3D on RA0, SCCP4's OCM4 through PPS), the buffered mode's values at
// the next period, the polarity, the steering; a module synchronised to another's period; input capture (the
// timestamps of the edges, every 4th rising, the FIFO's four, ICOV, 32 bits, OPS); Sleep; the warnings of what is not
// emulated. Programs on the Explorer 16/32: LED D3 dimmed by MCCP3's PWM, and an input's period measured by SCCP5's
// capture. At Fcy = 1 MHz (forced): a tick of the system clock is 1 µs. The programs loop on a repeated NOP (a cycle
// each, a BRA's two every 16 ms), so that a clock event's change is seen at its own cycle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceWith } from './pic24-lib.mjs';
import { Explorer1632 } from '../packages/silinx-pic24/src/index.js';

const FWDT_OFF = { FWDT: 0xffff9f };
const BASES = [0x026c, 0x0290, 0x02b4, 0x0300, 0x0324, 0x0348, 0x036c];
const OFF = { CON1L: 0, CON1H: 2, CON2L: 4, CON2H: 6, CON3L: 8, CON3H: 0xa, STATL: 0xc, TMRL: 0x10, TMRH: 0x12, PRL: 0x14, PRH: 0x16, RAL: 0x18, RBL: 0x1c, BUFL: 0x20, BUFH: 0x22 };
const IFS0 = 0x0088, US = 1e6;
const LOOP = ['top: repeat #16383', 'nop', 'bra top'];
// the device, its program past the reset's GOTO (two cycles) and in its loop
async function dev1(lines = LOOP, opts = {}) {
  const d = await deviceWith(lines, { config: FWDT_OFF, fcy: 1e6, ...opts });
  d.mcu.runTo(10 * US);
  return d;
}
const reg = (n, r) => BASES[n - 1] + OFF[r];
const wr = (cpu, n, r, v) => cpu.wr(reg(n, r), v, 0);
const rd = (cpu, n, r) => cpu.rd(reg(n, r), 0);
const flag = (mcu, irq) => (mcu.get(IFS0 + 2 * (irq >> 4)) >> (irq & 15)) & 1;
const clear = (mcu, irq) => mcu.set(IFS0 + 2 * (irq >> 4), mcu.get(IFS0 + 2 * (irq >> 4)) & ~(1 << (irq & 15)));
// the changes of a pin's driven level: [time (ps), level]; from(t0): [µs from t0, level]
function edges(dev, pin) {
  const list = [];
  dev.ports.onChange((p, d) => { if (p === pin) list.push([dev.mcu.time, d]); });
  list.from = (t0) => list.map(([t, l]) => [Math.round((t - t0) / US), l]);
  return list;
}

test('#5529 the registers at reset: CON2H 0x0100 (OCAEN), PRL / PRH 0xFFFF, the rest 0; unimplemented bits read 0', async () => {
  const { cpu } = await dev1();
  for (let n = 1; n <= 7; n++) {
    assert.deepEqual(['CON1L', 'CON1H', 'CON2H', 'PRL', 'PRH', 'RAL', 'STATL'].map((r) => rd(cpu, n, r)), [0, 0, 0x0100, 0xffff, 0xffff, 0, 0], `CCP${n}`);
    wr(cpu, n, 'CON2H', 0xffff);
    wr(cpu, n, 'CON3H', 0xffff);
    wr(cpu, n, 'CON1L', 0x4000);
    assert.deepEqual([rd(cpu, n, 'CON2H'), rd(cpu, n, 'CON3H'), rd(cpu, n, 'CON1L')], n <= 3 ? [0xbfdf, 0xf73f, 0] : [0x81df, 0xf02c, 0], `CCP${n}'s masks`);
  }
  assert.deepEqual(cpu.log, []);
});

test('#5529 dual 16-bit timers: CCPxTMRL to PRL (CCTxIF), CCPxTMRH to PRH (CCPxIF); a period register 0 holds its timer', async () => {
  const { mcu, cpu } = await dev1();
  wr(cpu, 1, 'PRL', 99);
  wr(cpu, 1, 'PRH', 49);
  wr(cpu, 1, 'CON1L', 0x8000);
  const t0 = mcu.time;
  mcu.runTo(t0 + 30 * US);
  assert.deepEqual([rd(cpu, 1, 'TMRL'), rd(cpu, 1, 'TMRH')], [30, 30]);
  mcu.runTo(t0 + 50 * US);
  assert.deepEqual([flag(mcu, 101), flag(mcu, 63)], [0, 1], 'CCP1IF at 50 µs, the secondary timer\'s period');
  assert.equal(rd(cpu, 1, 'TMRH'), 0);
  mcu.runTo(t0 + 100 * US);
  assert.deepEqual([flag(mcu, 101), rd(cpu, 1, 'TMRL')], [1, 0], 'CCT1IF at 100 µs');
  // PRH 0: the secondary timer held at 0, no CCPxIF
  const d = await dev1();
  wr(d.cpu, 4, 'PRL', 9); wr(d.cpu, 4, 'PRH', 0);
  wr(d.cpu, 4, 'CON1L', 0x8000);
  d.mcu.runTo(d.mcu.time + 50 * US);
  assert.deepEqual([rd(d.cpu, 4, 'TMRH'), flag(d.mcu, 95), flag(d.mcu, 44)], [0, 0, 1]);
  assert.deepEqual([cpu.log, d.cpu.log], [[], []]);
});

test('#5529 a 32-bit timer (T32): TMRH:TMRL to PRH:PRL, CCTxIF; OPS: CCTxIF every OPS + 1 periods; TMRPS 1:4, 1:64', async () => {
  const { mcu, cpu, dev } = await dev1();
  wr(cpu, 2, 'PRL', 0x0000); wr(cpu, 2, 'PRH', 0x0001);   // 65537 ticks
  wr(cpu, 2, 'CON1L', 0x8020);
  const t0 = mcu.time, tb = dev.ccps[1].tb;
  assert.deepEqual([tb.value(t0 + 65536 * US), tb.value(t0 + 65537 * US)], [65536, 0]);
  mcu.runTo(t0 + 65536 * US);
  assert.deepEqual([rd(cpu, 2, 'TMRL'), rd(cpu, 2, 'TMRH'), flag(mcu, 102)], [0, 1, 0]);
  mcu.runTo(t0 + 65537 * US);
  assert.equal(flag(mcu, 102), 1);
  // OPS 2: every 3rd period
  const d = await dev1();
  wr(d.cpu, 5, 'PRL', 9);
  wr(d.cpu, 5, 'CON1H', 0x0200);
  wr(d.cpu, 5, 'CON1L', 0x8000);
  const s = d.mcu.time;
  d.mcu.runTo(s + 25 * US);
  assert.equal(flag(d.mcu, 47), 0, 'not after 2 periods');
  d.mcu.runTo(s + 30 * US);
  assert.equal(flag(d.mcu, 47), 1, 'after the 3rd');
  // the prescalers
  for (const [ps, k] of [[1, 4], [3, 64]]) {
    const e = await dev1();
    wr(e.cpu, 6, 'PRL', 0xffff);
    wr(e.cpu, 6, 'CON1L', 0x8000 | (ps << 6));
    e.mcu.runTo(e.mcu.time + 10 * k * US + 0 * US);
    assert.equal(rd(e.cpu, 6, 'TMRL'), 10, `1:${k}`);
  }
  assert.deepEqual(cpu.log, []);
});

test('#5529 single edge compare: high, low, toggle one clock after CCPxRA\'s match; SCEVT and CCPxIF; SCEVT cleared by the program', async () => {
  // MCCP1's OCM1A on RG6, the toggle every period of 100 µs
  const { mcu, cpu, dev } = await dev1();
  const list = edges(dev, 'RG6');
  wr(cpu, 1, 'PRL', 99);
  wr(cpu, 1, 'RAL', 20);
  wr(cpu, 1, 'CON1L', 0x8003);
  const t0 = dev.ccps[0].tb.tp;
  mcu.runTo(t0 + 350 * US);
  assert.deepEqual(list.from(t0), [[0, 0], [21, 1], [121, 0], [221, 1], [321, 0]]);
  assert.equal(rd(cpu, 1, 'STATL') & 8, 8, 'SCEVT');
  assert.equal(flag(mcu, 63), 1, 'CCP1IF');
  wr(cpu, 1, 'STATL', 0);
  assert.equal(rd(cpu, 1, 'STATL'), 0);
  // high on the match, then high; low, then low
  for (const [mod, after] of [[1, 1], [2, 0]]) {
    const d = await dev1(), l = edges(d.dev, 'RG6');
    wr(d.cpu, 1, 'PRL', 99); wr(d.cpu, 1, 'RAL', 5);
    wr(d.cpu, 1, 'CON1L', 0x8000 | mod);
    const s = d.dev.ccps[0].tb.tp;
    d.mcu.runTo(s + 250 * US);
    assert.deepEqual(l.from(s), mod === 1 ? [[0, 0], [6, 1]] : [[0, 1], [6, 0]], `MOD ${mod}`);
    assert.equal(d.dev.ports.driven('RG6'), after);
  }
  assert.deepEqual(cpu.log, []);
});

test('#5529 PWM (dual edge compare): MCCP3\'s OCM3D on RA0, a period of PRL + 1, high from CCPxRA + 1 to CCPxRB + 1, CCP3IF at the fall', async () => {
  const { mcu, cpu, dev } = await dev1();
  const list = edges(dev, 'RA0');
  wr(cpu, 3, 'PRL', 999);
  wr(cpu, 3, 'RAL', 0);
  wr(cpu, 3, 'RBL', 250);
  wr(cpu, 3, 'CON2H', 0x0800);   // OCDEN only
  wr(cpu, 3, 'CON1L', 0x8004);
  const start = dev.ccps[2].tb.tp;
  mcu.runTo(start + 3100 * US);
  assert.deepEqual(list.from(start), [[0, 0], [1, 1], [251, 0], [1001, 1], [1251, 0], [2001, 1], [2251, 0], [3001, 1]]);
  assert.equal(flag(mcu, 94), 1, 'CCP3IF');
  assert.equal(dev.ports.driven('RB5'), null, 'OCM3A not enabled: its pin the port\'s');
  // the polarity (POLBDF for D): inverted
  wr(cpu, 3, 'CON3H', 0x0010);
  assert.equal(dev.ports.driven('RA0'), 0, 'high before: low now');
  // off: the pin the port's again
  wr(cpu, 3, 'CON1L', 0);
  assert.equal(dev.ports.driven('RA0'), null);
  assert.deepEqual(cpu.log, []);
});

test('#5529 buffered PWM (MOD 0101): CCPxRB written mid-period takes effect at the next period; unbuffered (0100) at once', async () => {
  for (const [mod, expect] of [[5, [[0, 0], [1, 1], [41, 0], [101, 1], [161, 0]]], [4, [[0, 0], [1, 1], [61, 0], [101, 1], [161, 0]]]]) {
    const { mcu, cpu, dev } = await dev1();
    const start = { t: 0 };
    cpu.wr(0x07d6, 16, 0);   // RPOR1's low byte: RP2 (RD8) = OCM4, SCCP4's output
    const l2 = edges(dev, 'RD8');
    wr(cpu, 4, 'PRL', 99);
    wr(cpu, 4, 'RAL', 0);
    wr(cpu, 4, 'RBL', 40);
    wr(cpu, 4, 'CON1L', 0x8000 | mod);
    start.t = dev.ccps[3].tb.tp;
    mcu.runTo(start.t + 20 * US);
    wr(cpu, 4, 'RBL', 60);
    mcu.runTo(start.t + 170 * US);
    assert.deepEqual(l2.from(start.t).slice(-5), expect, `MOD ${mod}`);
    assert.deepEqual(cpu.log, []);
  }
});

test('#5529 a module synchronised to another\'s period (SYNC 00010: MCCP1): its timer starts again at each of MCCP1\'s ends', async () => {
  const { mcu, cpu, dev } = await dev1();
  wr(cpu, 1, 'PRL', 49);
  wr(cpu, 2, 'PRL', 0xffff);
  wr(cpu, 2, 'CON1H', 0x0002);
  wr(cpu, 2, 'CON1L', 0x8000);
  wr(cpu, 1, 'CON1L', 0x8000);
  const t0 = dev.ccps[0].tb.tp;
  mcu.runTo(t0 + 70 * US);
  assert.deepEqual([rd(cpu, 1, 'TMRL'), rd(cpu, 2, 'TMRL')], [20, 20]);
  assert.equal(flag(mcu, 102), 1, 'CCT2IF at the sync');
  assert.deepEqual(cpu.log, []);
});

test('#5529 input capture: the timer\'s value at each edge (rising, falling, both, every 4th rising), ICBNE, the FIFO of four, ICOV', async () => {
  // SCCP5's ICM5 on RD8
  const { mcu, cpu, dev } = await dev1();
  dev.ports.setInput('RD8', 0);
  wr(cpu, 5, 'CON1L', 0x8011);   // every rising
  const t0 = dev.ccps[4].tb.tp;
  const square = (k) => { for (let i = 0; i < k; i++) { mcu.runTo(t0 + (100 * i + 10) * US); dev.ports.setInput('RD8', 1); mcu.runTo(t0 + (100 * i + 60) * US); dev.ports.setInput('RD8', 0); } };
  square(3);
  assert.equal(rd(cpu, 5, 'STATL') & 1, 1, 'ICBNE');
  const got = [rd(cpu, 5, 'BUFL'), rd(cpu, 5, 'BUFL'), rd(cpu, 5, 'BUFL')];
  assert.ok(got.every((v, i) => v >= 100 * i + 10 && v <= 100 * i + 11), `${got} near 10, 110, 210`);
  assert.deepEqual([got[1] - got[0], got[2] - got[1]], [100, 100], 'a period of 100 µs');
  assert.equal(rd(cpu, 5, 'STATL') & 1, 0, 'the FIFO empty');
  assert.equal(flag(mcu, 22), 1, 'CCP5IF');
  // five rising edges: four kept, the fifth lost (ICOV); ICOV cleared empties the FIFO
  const pulseAt = (us) => { mcu.runTo(t0 + us * US); dev.ports.setInput('RD8', 1); mcu.runTo(t0 + (us + 20) * US); dev.ports.setInput('RD8', 0); };
  for (const us of [1000, 1100, 1200, 1300, 1400]) pulseAt(us);
  assert.equal(rd(cpu, 5, 'STATL') & 3, 3, 'ICOV, ICBNE');
  assert.equal(dev.ccps[4].fifo.length, 4);
  assert.ok(Math.abs(rd(cpu, 5, 'BUFL') - 1000) <= 1, 'the first of the five');
  wr(cpu, 5, 'STATL', 0);
  assert.deepEqual([rd(cpu, 5, 'STATL') & 3, dev.ccps[4].fifo.length], [0, 0]);
  // every 4th rising, both edges, 32 bits (two levels, BUFH popping)
  const d = await dev1();
  d.dev.ports.setInput('RD8', 0);
  wr(d.cpu, 5, 'CON1L', 0x8014);
  for (let i = 0; i < 8; i++) { d.mcu.runTo(d.mcu.time + 5 * US); d.dev.ports.setInput('RD8', 1); d.mcu.runTo(d.mcu.time + 5 * US); d.dev.ports.setInput('RD8', 0); }
  assert.equal(d.dev.ccps[4].fifo.length, 2, 'the 4th and the 8th');
  const e = await dev1();
  e.dev.ports.setInput('RD8', 0);
  wr(e.cpu, 5, 'CON1L', 0x8033);   // T32, both edges
  const s = e.dev.ccps[4].tb.tp;
  e.mcu.runTo(s + 70000 * US); e.dev.ports.setInput('RD8', 1);
  e.mcu.runTo(s + 70100 * US); e.dev.ports.setInput('RD8', 0);
  e.mcu.runTo(s + 70200 * US); e.dev.ports.setInput('RD8', 1);
  assert.equal(rd(e.cpu, 5, 'STATL') & 3, 3, 'two levels in 32 bits: the third ICOV');
  const lo = rd(e.cpu, 5, 'BUFL'), hi = rd(e.cpu, 5, 'BUFH');
  assert.ok(Math.abs(((hi << 16) | lo) - Math.floor((e.mcu.time - s) / US) + 200) <= 2, 'the first capture at 70000');
  assert.deepEqual([cpu.log, d.cpu.log, e.cpu.log], [[], [], []]);
});

test('#5529 OPS in capture: CCPxIF every OPS + 1 captures', async () => {
  const { mcu, cpu, dev } = await dev1();
  dev.ports.setInput('RD3', 0);   // SCCP7's ICM7
  wr(cpu, 7, 'CON1H', 0x0100);
  wr(cpu, 7, 'CON1L', 0x8011);
  const pulse = () => { mcu.runTo(mcu.time + 5 * US); dev.ports.setInput('RD3', 1); mcu.runTo(mcu.time + 5 * US); dev.ports.setInput('RD3', 0); };
  pulse();
  assert.equal(flag(mcu, 73), 0);
  pulse();
  assert.equal(flag(mcu, 73), 1);
  assert.deepEqual(cpu.log, []);
});

test('#5529 Sleep stops a module (CCPSLP on the SOSC runs on); Idle with CCPSIDL', async () => {
  const { mcu, cpu, dev } = await dev1(['pwrsav #0', 'bra $']);
  wr(cpu, 1, 'PRL', 0xffff);
  wr(cpu, 1, 'CON1L', 0x8000);
  wr(cpu, 2, 'PRL', 0xffff);
  wr(cpu, 2, 'CON1L', 0x9200);   // CCPSLP, the SOSC
  mcu.runTo(mcu.time + 10 * US);
  const before = [dev.ccps[0].tb.value(), dev.ccps[1].tb.value()];
  mcu.runTo(mcu.time + 1000 * US);
  assert.equal(dev.ccps[0].tb.value(), before[0], 'MCCP1 stopped asleep');
  assert.ok(dev.ccps[1].tb.value() > before[1], 'MCCP2 on the SOSC counts on');
  assert.deepEqual(cpu.log, []);
});

test('#5529 what is not emulated said: center-aligned PWM, another clock, another sync source, an output mode', async () => {
  const { cpu } = await dev1();
  wr(cpu, 1, 'CON1L', 0x8006);
  wr(cpu, 2, 'CON1L', 0x8100 | 0x0004);
  wr(cpu, 3, 'CON1H', 0x0009);
  wr(cpu, 3, 'CON1L', 0x8004);
  wr(cpu, 3, 'CON3H', 0x0100);
  assert.deepEqual(cpu.log.map((m) => m.text), [
    'MCCP1\'s mode 0110 (center-aligned PWM) is not emulated: no output',
    'MCCP2\'s clock (CLKSEL 001) is not emulated: the system clock is used',
    'MCCP3\'s sync source (SYNC 01001) is not emulated: its own period is used',
    'MCCP3\'s output mode (OUTM 001) is not emulated: a single output steered to the enabled pins',
  ]);
});

test('#5529 a program: LED D3 (RA0) dimmed by MCCP3\'s PWM on the Explorer 16/32, a quarter lit', async () => {
  const { mcu, cpu, dev } = await dev1([
    'mov #999, w0', 'mov w0, 0x02c8',       // CCP3PRL: 1 ms
    'clr 0x02cc', 'mov #250, w0', 'mov w0, 0x02d0',   // CCP3RAL 0, CCP3RBL 250
    'mov #0x0800, w0', 'mov w0, 0x02ba',    // CCP3CON2H: OCM3D
    'mov #0x8005, w0', 'mov w0, 0x02b4',    // CCP3CON1L: on, buffered PWM
    ...LOOP,
  ]);
  const board = new Explorer1632(dev);
  mcu.runTo(20 * US);
  let lit = 0;
  for (let k = 0; k < 1000; k++) { mcu.runTo(mcu.time + 10 * US); if (board.leds().D3) lit++; }
  assert.ok(Math.abs(lit - 250) <= 2, `${lit} of 1000 samples lit`);
  assert.deepEqual(cpu.log, []);
});

test('#5529 a program: an input\'s period measured by SCCP5\'s capture (two rising edges\' timestamps subtracted)', async () => {
  const { mcu, cpu, dev, labels } = await dev1([
    'mov #0x8011, w0', 'mov w0, 0x0324',            // CCP5CON1L: on, every rising edge
    'wait1: btss 0x0330, #0', 'bra wait1',                // CCP5STATL's ICBNE
    'mov 0x0344, w2',                               // CCP5BUFL
    'wait2: btss 0x0330, #0', 'bra wait2',
    'mov 0x0344, w3',
    'sub w3, w2, w4',
    'done: bra done',
  ]);
  dev.ports.setInput('RD8', 0);
  let level = 0;
  const toggle = () => { level ^= 1; dev.ports.setInput('RD8', level); mcu.schedule(mcu.eventTime + 370 * US, toggle); };
  mcu.schedule(mcu.time + 100 * US, toggle);
  for (let n = 0; cpu.pc !== labels.done && n < 1e5; n++) cpu.step();
  assert.equal(cpu.pc, labels.done);
  // (its edges clock events: captured at their own times, not at the instructions' ends that see them)
  assert.equal(cpu.W(4), 740, 'a period of 740 µs');
  assert.deepEqual(cpu.log, []);
});
