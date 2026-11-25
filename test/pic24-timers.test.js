// The PIC24FJ1024GB610's Timer1-Timer5 (#5481, packages/silinx-pic24/src/timers.js): TMRx against PRx (its period
// PRx + 1 counts, its interrupt flag at the reset to 0), the prescalers, Timer1 on the SOSC (a second of 32768
// counts), the 32-bit pairs (TMR3:TMR2 against PR3:PR2, Timer3's interrupt, TMR3HLD), a value past PRx running to the
// end then wrapping, Sleep and Idle; an interrupt-driven program counting Timer1's periods. At Fcy = 1 MHz (forced):
// a count of the peripheral clock is 1 µs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceWith } from './pic24-lib.mjs';

const FWDT_OFF = { FWDT: 0xffff9f };
const T1CON = 0x0194, TMR1 = 0x0190, PR1 = 0x0192, IFS0 = 0x0088;
const dev1 = (lines = ['bra $'], opts = {}) => deviceWith(lines, { config: FWDT_OFF, fcy: 1e6, ...opts });
const at = (mcu, us) => mcu.runTo(us * 1e6);
const flag = (mcu, irq) => (mcu.get(IFS0 + 2 * (irq >> 4)) >> (irq & 15)) & 1;

test('#5481 Timer1: TMR1 counts Fcy\'s periods up to PR1, then 0 and T1IF (a period of PR1 + 1); its prescalers', async () => {
  const { mcu, cpu } = await dev1();
  cpu.wr(PR1, 99, 0);
  cpu.wr(T1CON, 0x8000, 0);
  const t0 = mcu.time;
  at(mcu, 50);
  assert.equal(mcu.cpu.rd(TMR1, 0), Math.floor((mcu.time - t0) / 1e6));
  assert.equal(flag(mcu, 3), 0);
  mcu.runTo(t0 + 100e6);
  assert.equal(flag(mcu, 3), 1, 'T1IF at 100 µs');
  assert.ok(cpu.rd(TMR1, 0) < 3);
  // 1:8 and 1:256: TMR1 a count per 8, per 256 µs
  for (const [tckps, k] of [[1, 8], [3, 256]]) {
    const d = await dev1();
    d.cpu.wr(T1CON, 0x8000 | (tckps << 4), 0);
    const s = d.mcu.time;
    d.mcu.runTo(s + 10 * k * 1e6 + 1);
    assert.equal(d.cpu.rd(TMR1, 0), 10, `1:${k}`);
  }
});

test('#5481 Timer1 on the SOSC (TCS, TECS 00): 32768 counts a second, PR1 32767 a 1 s period; on the LPRC 31 kHz', async () => {
  const { mcu, cpu } = await dev1();
  cpu.wr(PR1, 32767, 0);
  cpu.wr(T1CON, 0x8002, 0);
  const t0 = mcu.time;
  mcu.runTo(t0 + 0.999e12);
  assert.equal(flag(mcu, 3), 0);
  mcu.runTo(t0 + 1.0001e12);
  assert.equal(flag(mcu, 3), 1);
  const l = await dev1();
  l.cpu.wr(T1CON, 0x8202, 0);
  const s = l.mcu.time;
  l.mcu.runTo(s + 1e9);   // 1 ms: 31 counts
  assert.equal(l.cpu.rd(TMR1, 0), 31);
});

test('#5481 a value past PR runs to 0xFFFF and wraps (no flag), then counts to PR; TMR written restarts from its value', async () => {
  const { mcu, cpu, dev } = await dev1();
  cpu.wr(PR1, 10, 0);
  cpu.wr(TMR1, 0xfffe, 0);
  cpu.wr(T1CON, 0x8000, 0);
  const t1 = dev.timers.t1, t0 = t1.t0;
  assert.deepEqual([1, 2, 3, 12, 13, 14].map((k) => t1.value(t0 + k * 1e6)), [0xffff, 0, 1, 10, 0, 1]);
  mcu.runTo(t0 + 11e6);   // (its last instruction may end a cycle past)
  assert.equal(flag(mcu, 3), 0);
  mcu.runTo(t0 + 13.5e6);
  assert.equal(flag(mcu, 3), 1, 'at 2 (the wrap) + 11 counts');
});

test('#5481 Timer2 / 3 as one 32-bit timer (T2CON\'s T32): TMR3:TMR2 against PR3:PR2, T3IF; TMR2 read latches TMR3HLD', async () => {
  const { mcu, cpu } = await dev1();
  cpu.wr(0x019c, 0x0000, 0); cpu.wr(0x019e, 0x0002, 0);   // PR3:PR2 = 0x00020000: 131073 counts
  cpu.wr(0x01a0, 0x8008, 0);
  const t0 = mcu.time;
  mcu.runTo(t0 + 70000e6);
  const n = Math.floor((mcu.time - t0) / 1e6), lo = cpu.rd(0x0196, 0);
  assert.deepEqual([cpu.mem[0x0198 >> 1], lo], [n >>> 16, n & 0xffff], 'TMR3HLD the high word (about 70000 = 0x11170)');
  assert.equal(n >>> 16, 1);
  assert.equal(flag(mcu, 8), 0);
  mcu.runTo(t0 + 131073e6 + 1);
  assert.deepEqual([flag(mcu, 8), flag(mcu, 7)], [1, 0], 'T3IF, not T2IF');
  // TMR3HLD then TMR2 written: the 32-bit value
  cpu.wr(0x0198, 0x1234, 0); cpu.wr(0x0196, 0x5678, 0);
  cpu.rd(0x0196, 0);
  assert.equal(cpu.mem[0x0198 >> 1], 0x1234);
});

test('#5481 Timer4 and Timer5 as two 16-bit timers: each its own period and flag (T4IF IRQ 27, T5IF 28)', async () => {
  const { mcu, cpu } = await dev1();
  cpu.wr(0x01aa, 9, 0); cpu.wr(0x01ac, 19, 0);
  cpu.wr(0x01ae, 0x8000, 0); cpu.wr(0x01b0, 0x8000, 0);
  const t0 = mcu.time;
  mcu.runTo(t0 + 10.5e6);
  assert.deepEqual([flag(mcu, 27), flag(mcu, 28)], [1, 0]);
  mcu.runTo(t0 + 20.5e6);
  assert.equal(flag(mcu, 28), 1);
});

test('#5481 asleep: Timer1 on the Fcy stops; on the SOSC unsynchronised it counts on and its interrupt wakes the device', async () => {
  const { mcu, cpu, labels } = await dev1(['pwrsav #0', 'woke: inc w5, w5', 'bra $']);
  cpu.wr(PR1, 99, 0); cpu.wr(T1CON, 0x8000, 0);
  cpu.wr(0x0098, 1 << 3, 0);   // T1IE
  cpu.step(); cpu.step();
  mcu.runTo(mcu.time + 1000e6);
  assert.deepEqual([cpu.sleeping, flag(mcu, 3)], ['sleep', 0]);
  const s = await dev1(['pwrsav #0', 'woke: inc w5, w5', 'bra $']);
  s.cpu.wr(PR1, 3, 0); s.cpu.wr(T1CON, 0x8002, 0); s.cpu.wr(0x0098, 1 << 3, 0);
  s.cpu.wr(0x0042, 7 << 5, 0);   // the IPL 7: woken, no vector
  s.cpu.step(); s.cpu.step();
  s.mcu.runTo(s.mcu.time + 200e6);
  assert.deepEqual([s.cpu.sleeping, s.cpu.W(5) & 0xff], [null, 1]);
  void labels;
});

test('#5481 an interrupt-driven program: Timer1 every 250 µs (PR1 249), its ISR counting; 10 periods in 2.6 ms', async () => {
  const { mcu, cpu } = await deviceWith([
    'mov #0x0900, w15', 'clr w5', 'mov #249, w0', 'mov w0, 0x0192', 'bset 0x0098, #3', 'mov #0x8000, w0', 'mov w0, 0x0194',
    'idle: bra idle',
    't1: inc w5, w5', 'bclr 0x0088, #3', 'retfie',
  ], { config: FWDT_OFF, fcy: 1e6, vectors: { 3: 't1' } });
  mcu.runTo(2.6e9);
  assert.deepEqual([cpu.W(5), cpu.log], [10, []]);
});
