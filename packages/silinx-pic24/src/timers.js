// silinx-pic24 - Timer1 to Timer5 (#5481, DS30010074 sections 12 and 13): TMRx counting the peripheral clock (Fosc / 2)
// or, with TCS, the SOSC's 32.768 kHz or the LPRC's 31 kHz (TECS), through TCKPS's prescaler (1, 8, 64, 256); at
// TMRx = PRx the next count resets it to 0 and sets its interrupt's flag (T1 IRQ 3, T2 7, T3 8, T4 27, T5 28);
// Timer2 / 3 and Timer4 / 5 as one 32-bit timer with T2CON's (T4CON's) T32: TMR3:TMR2 against PR3:PR2, Timer3's
// interrupt, a read of TMR2 latching TMR3 in TMR3HLD, a write of TMR2 taking TMR3HLD's. A timer counts lazily: its
// value from the time since it started, its period's end scheduled as a clock event (and told to the ADC's trigger).
//
// Not modelled: the external clock inputs (T1CK, TxCK, TECS's 01 and 11), the gated time accumulation (TGATE),
// TSYNC's synchronisation delay; asleep, only Timer1 on the SOSC unsynchronised (TSYNC = 0) counts, as the data sheet
// says; TSIDL stops a timer in Idle.

const SOSC_HZ = 32768, LPRC_HZ = 31e3;
const PRESCALE = [1, 8, 64, 256];
const T1 = { TMR: 0x0190, PR: 0x0192, CON: 0x0194 };
const PAIRS = [
  { lo: 2, hi: 3, TMRlo: 0x0196, HLD: 0x0198, TMRhi: 0x019a, PRlo: 0x019c, PRhi: 0x019e, CONlo: 0x01a0, CONhi: 0x01a2, irqLo: 7, irqHi: 8 },
  { lo: 4, hi: 5, TMRlo: 0x01a4, HLD: 0x01a6, TMRhi: 0x01a8, PRlo: 0x01aa, PRhi: 0x01ac, CONlo: 0x01ae, CONhi: 0x01b0, irqLo: 27, irqHi: 28 },
];

// a counter: its value at t0 (ps), its rate, its period (PR) and width, its interrupt
class Counter {
  constructor(mcu, irq, width, name) {
    Object.assign(this, { mcu, irq, width, name, running: false, paused: false, t0: 0, count0: 0, tickPs: 1, pr: 0xffff, event: null });
  }
  get max() { return this.width === 32 ? 0xffffffff : 0xffff; }
  ticksAt(t) { return Math.floor((t - this.t0) / this.tickPs + 1e-6); }

  // the value now: from count0, up to PR then 0 (a value past PR runs to the width's end, wraps, then up to PR)
  value(t = this.mcu.time) {
    if (!this.running || this.paused) return this.count0;
    const n = this.ticksAt(t), c = this.count0, pr = this.pr;
    if (c <= pr) return (c + n) % (pr + 1);
    const toWrap = this.max - c + 1;
    return n < toWrap ? c + n : (n - toWrap) % (pr + 1);
  }

  // a new origin: count0 now (the value written, or the one reached), its period's end scheduled
  origin(count = this.value()) {
    this.count0 = count;
    this.t0 = this.mcu.time;
    this.schedule();
  }

  schedule() {
    this.mcu.cancel(this.event);
    this.event = null;
    if (!this.running || this.paused) return;
    const c = this.count0, pr = this.pr;
    const ticks = c <= pr ? pr - c + 1 : this.max - c + 1 + pr + 1;
    const at = this.t0 + ticks * this.tickPs;
    this.event = this.mcu.schedule(at, () => {
      this.event = null;
      this.t0 = at;
      this.count0 = 0;
      this.mcu.cpu.raise(this.irq);
      this.mcu.timerPeriod?.(this.name);
      this.schedule();
    });
  }

  stop() { this.count0 = this.value(); this.running = false; this.schedule(); }
}

export class Timers {
  constructor(mcu) {
    this.mcu = mcu;
    this.t1 = new Counter(mcu, 3, 16, 'T1');
    mcu.register(T1.TMR, { reset: 0, read: () => this.t1.value(), write: (v) => this.t1.origin(v) });
    mcu.register(T1.PR, { reset: 0xffff, write: (v) => { this.t1.count0 = this.t1.value(); this.t1.t0 = mcu.time; this.t1.pr = v; this.t1.schedule(); } });
    mcu.register(T1.CON, { reset: 0, mask: 0xa376, write: () => this.configure1() });
    this.pairs = PAIRS.map((p) => this.pair(p));
    mcu.attach(this);
  }

  // Timer1's TCS and TECS: the peripheral clock, the SOSC or the LPRC; its prescaler
  configure1() {
    const con = this.mcu.get(T1.CON), c = this.t1, was = c.value();
    c.tickPs = 1e12 / this.clockOf(con) * PRESCALE[(con >> 4) & 3];
    c.pr = this.mcu.get(T1.PR);
    c.async = (con & 2) !== 0 && ((con >> 8) & 3) === 0 && !(con & 4);
    c.running = (con & 0x8000) !== 0;
    c.origin(was);
  }

  clockOf(con) {
    if (!(con & 2)) return this.mcu.fpb;
    const tecs = (con >> 8) & 3;
    if (tecs === 0) return SOSC_HZ;
    if (tecs === 2) return LPRC_HZ;
    this.mcu.cpu.say('warning', 'a timer\'s external clock input (TECS 01, 11): not emulated, it counts nothing', 'tecs');
    return 1e-9;
  }

  // Timer2 / 3 (or 4 / 5): two 16-bit counters, or one 32-bit (T32 in the first's TxCON) with the second's interrupt
  pair(p) {
    const mcu = this.mcu, s = { p, lo: new Counter(mcu, p.irqLo, 16, `T${p.lo}`), hi: new Counter(mcu, p.irqHi, 16, `T${p.hi}`), wide: new Counter(mcu, p.irqHi, 32, `T${p.hi}`) };
    const t32 = () => (mcu.get(p.CONlo) & 8) !== 0;
    s.t32 = t32;
    mcu.register(p.TMRlo, { reset: 0, read: () => {
      if (!t32()) return s.lo.value();
      const v = s.wide.value();
      mcu.set(p.HLD, v >>> 16);
      return v & 0xffff;
    }, write: (v) => { if (t32()) s.wide.origin(((mcu.get(p.HLD) << 16) | v) >>> 0); else s.lo.origin(v); } });
    mcu.register(p.HLD, { reset: 0 });
    mcu.register(p.TMRhi, { reset: 0, read: () => (t32() ? s.wide.value() >>> 16 : s.hi.value()), write: (v) => { if (!t32()) s.hi.origin(v); } });
    const prs = () => {
      for (const c of [s.lo, s.hi, s.wide]) { c.count0 = c.value(); c.t0 = mcu.time; }
      s.lo.pr = mcu.get(p.PRlo); s.hi.pr = mcu.get(p.PRhi); s.wide.pr = ((mcu.get(p.PRhi) << 16) | mcu.get(p.PRlo)) >>> 0;
      for (const c of [s.lo, s.hi, s.wide]) c.schedule();
    };
    mcu.register(p.PRlo, { reset: 0xffff, write: prs });
    mcu.register(p.PRhi, { reset: 0xffff, write: prs });
    mcu.register(p.CONlo, { reset: 0, mask: 0xa37a, write: () => this.configure(s) });
    mcu.register(p.CONhi, { reset: 0, mask: 0xa372, write: () => this.configure(s) });
    s.lo.pr = s.hi.pr = 0xffff; s.wide.pr = 0xffffffff;
    return s;
  }

  // a pair's TxCONs: the 32-bit mode from the first (its TON, TCKPS, TCS), else each its own
  configure(s) {
    const mcu = this.mcu, { p } = s, lo = mcu.get(p.CONlo), hi = mcu.get(p.CONhi);
    const set = (c, con) => {
      const was = c.value();
      c.tickPs = 1e12 / this.clockOf(con) * PRESCALE[(con >> 4) & 3];
      c.running = (con & 0x8000) !== 0;
      c.origin(was);
    };
    if (lo & 8) {
      if (!s.wasWide) s.wide.count0 = ((s.hi.value() << 16) | s.lo.value()) >>> 0;
      s.lo.stop(); s.hi.stop();
      s.lo.running = s.hi.running = false;
      set(s.wide, lo);
    } else {
      if (s.wasWide) { const v = s.wide.value(); s.wide.stop(); s.lo.count0 = v & 0xffff; s.hi.count0 = v >>> 16; }
      s.wide.running = false; s.wide.schedule();
      set(s.lo, lo); set(s.hi, hi);
    }
    s.wasWide = (lo & 8) !== 0;
  }

  counters() { return [this.t1, ...this.pairs.flatMap((s) => [s.lo, s.hi, s.wide])]; }

  reset() {
    for (const c of this.counters()) { this.mcu.cancel(c.event); Object.assign(c, { running: false, paused: false, count0: 0, event: null }); }
    this.t1.pr = 0xffff;
    for (const s of this.pairs) { s.lo.pr = s.hi.pr = 0xffff; s.wide.pr = 0xffffffff; s.wasWide = false; }
  }

  // the clock changed: each counter's rate again from its TxCON, its count kept
  clockChanged() {
    this.configure1();
    for (const s of this.pairs) this.configure(s);
  }

  // asleep the synchronous timers stop (Timer1 on the SOSC, unsynchronised, counts on); in Idle those with TSIDL
  sleep(mode) {
    const idleStop = (con) => mode === 'idle' && con & 0x2000;
    const pause = (c, con) => { if (c.running && (mode === 'sleep' ? !c.async : idleStop(con))) { c.count0 = c.value(); c.paused = true; c.schedule(); } };
    pause(this.t1, this.mcu.get(T1.CON));
    for (const s of this.pairs) for (const c of [s.lo, s.hi, s.wide]) pause(c, this.mcu.get(c === s.hi ? s.p.CONhi : s.p.CONlo));
  }
  wake() {
    for (const c of this.counters()) if (c.paused) { c.paused = false; c.t0 = this.mcu.time; c.schedule(); }
  }
}
