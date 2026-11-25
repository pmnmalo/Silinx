// silinx-pic24 - the capture / compare / PWM / timer modules (#5529, DS30010074 section 16, DS30003035): MCCP1-3
// (six outputs, OCMxA-F, on fixed pins) and SCCP4-7 (one output, OCMxA, through PPS). Each has a time base
// (timebase.js) counting its clock (CLKSEL: the system clock Fosc / 2, the SOSC, twice the peripheral clock) through
// TMRPS's prescaler (1, 4, 16, 64), and a mode:
// - Timer (CCSEL 0, MOD 0000): two 16-bit timers, CCPxTMRL against CCPxPRL (CCTxIF) and CCPxTMRH against CCPxPRH
//   (CCPxIF), a period register 0 holding its timer; or one 32-bit timer (T32), CCPxTMRH:L against CCPxPRH:L (CCTxIF);
// - Output compare (MOD 0001 high, 0010 low, 0011 toggle on a match of CCPxRA, CCPxRBL:CCPxRAL with T32): the output
//   low at the start (high for 0010) changes one clock after the match, SCEVT and CCPxIF;
// - Dual edge compare, PWM (MOD 0100, 0101 buffered): the output high one clock after CCPxRA's match, low one clock
//   after CCPxRB's, CCPxIF on the falling edge; buffered, CCPxRA and CCPxRB written take effect at the next period;
//   the output steered to the OCMxA-F enabled in CCPxCON2H (OCxEN), its polarity by CCPxCON3H's POLACE and POLBDF;
// - Input capture (CCSEL 1, MOD 0000 every edge, no overflow; 0001 rising, 0010 falling, 0011 both, 0100 every 4th
//   rising, 0101 every 16th rising): the free-running timer (16 or 32 bits) written to a FIFO of four (two with
//   T32) read through CCPxBUFL (CCPxBUFH with T32), ICBNE, ICOV (an event when full lost, the captures stopped until
//   the FIFO is emptied or ICOV cleared), CCPxIF every OPS + 1 captures; its input the module's ICMx pin.
// In the timer and compare modes the timer counts to CCPxPRL (16 bits) and starts again, or runs free (32-bit
// compare); CCTxIF every OPS + 1 periods (OPSSRC 0). SYNC selects another module's period (SYNC 00010-01000): this
// module's timer starts again at each of its ends; 00000 and 11111 are its own period.
//
// Not modelled: center-aligned PWM (MOD 0110), variable frequency (0111), the external input source mode (1111), the
// output modes other than steerable single output (OUTM: push-pull, half bridge, brush DC, scan), dead time
// (CCPxCON3L), auto-shutdown (CCPxCON2L, ASEVT), triggered operation (TRIGEN, TRSET, TRCLR, ONESHOT), gating
// (ICGSM, ICDIS), the special event trigger and the auxiliary output (AUXOUT: the A/D's and the CTMU's), the sync
// sources other than the CCP modules (INTx, CLC, the comparators, the A/D), the clocks other than the system clock,
// the SOSC and 2x (the reference clock, the CLCs, the PLL, TCKIA / TCKIB: the system clock used, with a warning), the
// capture inputs other than ICMx (ICS), TMRSYNC's delay; a period register written while running restarts the
// period's count when the count is past it, and CCPxRA / CCPxRB written mid-period (unbuffered) apply from now on.
// Asleep a module stops (CCPSLP: on, on the SOSC), in Idle with CCPSIDL.

import { Timebase } from './timebase.js';

const BASES = [0x026c, 0x0290, 0x02b4, 0x0300, 0x0324, 0x0348, 0x036c];
const IRQ_CCP = [63, 64, 94, 95, 22, 23, 73], IRQ_CCT = [101, 102, 43, 44, 47, 48, 51];
const CON1L = 0x00, CON1H = 0x02, CON2L = 0x04, CON2H = 0x06, CON3L = 0x08, CON3H = 0x0a, STATL = 0x0c, STATH = 0x0e;
const TMRL = 0x10, TMRH = 0x12, PRL = 0x14, PRH = 0x16, RAL = 0x18, RAH = 0x1a, RBL = 0x1c, RBH = 0x1e, BUFL = 0x20, BUFH = 0x22;
const CCPON = 0x8000, CCSEL = 0x0010, T32 = 0x0020, SCEVT = 0x0008, ICOV = 0x0002, ICBNE = 0x0001;
const PRESCALE = [1, 4, 16, 64], SOSC_HZ = 32768;
const LETTERS = 'ABCDEF';

export class Ccp {
  /** n: 1-7 (1-3 the MCCPs); drive(letter, level): OCMx<letter> driven (0, 1) or left (undefined). */
  constructor(mcu, n, drive) {
    const base = BASES[n - 1], mccp = n <= 3;
    Object.assign(this, { mcu, n, base, mccp, drive, irq: IRQ_CCP[n - 1], cct: IRQ_CCT[n - 1] });
    this.tb = new Timebase(mcu, { onPeriod: (t, first) => this.period(first) });
    this.tb2 = new Timebase(mcu, { onPeriod: (t, first) => { if (!first) mcu.cpu.raise(this.irq); } });
    this.listeners = [];        // fn() at each of this module's periods' ends (its sync out)
    this.pending = new Set();   // the compare events of the current period
    this.out = 0;               // the output's level before polarity
    this.driving = false;
    this.fifo = [];
    this.ra = this.rb = 0;      // the compare values in use (the buffered PWM's latched at a period's start)
    const reg = (off, o = {}) => mcu.register(base + off, o);
    const reconf = () => this.configure();
    reg(CON1L, { mask: 0xbfff, write: reconf });
    reg(CON1H, { mask: 0xcfff, write: reconf });
    reg(CON2L, { mask: 0xd8ff });
    reg(CON2H, { reset: 0x0100, mask: mccp ? 0xbfdf : 0x81df, write: () => this.drivePins() });
    reg(CON3L, { mask: mccp ? 0x003f : 0 });
    reg(CON3H, { mask: mccp ? 0xf73f : 0xf02c, write: () => { this.outputMode(); this.drivePins(); } });
    reg(STATL, { mask: 0x00ff, write: (v, old) => this.writeStat(v, old) });
    reg(STATH, { mask: 0 });
    reg(TMRL, { read: () => this.timerRead(false), write: (v) => this.timerWrite(false, v) });
    reg(TMRH, { read: () => this.timerRead(true), write: (v) => this.timerWrite(true, v) });
    reg(PRL, { reset: 0xffff, write: () => this.periodWritten() });
    reg(PRH, { reset: 0xffff, write: () => this.periodWritten() });
    for (const off of [RAL, RBL]) reg(off, { write: () => this.compareWritten() });
    for (const off of [RAH, RBH]) reg(off);
    reg(BUFL, { read: () => this.bufRead(false) });
    reg(BUFH, { read: () => this.bufRead(true) });
    mcu.attach(this);
  }

  get name() { return this.mccp ? `MCCP${this.n}` : `SCCP${this.n}`; }
  r(off) { return this.mcu.get(this.base + off); }
  setR(off, v) { this.mcu.set(this.base + off, v); }
  get con() { return this.r(CON1L); }
  get mod() { return this.con & 15; }
  get on() { return (this.con & CCPON) !== 0; }
  get capture() { return (this.con & CCSEL) !== 0; }
  get wide() { return (this.con & T32) !== 0; }
  // compare: MOD 0001-0111 with CCSEL 0
  get compare() { return this.on && !this.capture && this.mod !== 0; }
  get dual() { return this.mod === 4 || this.mod === 5; }

  // a tick (ps): CLKSEL's clock through TMRPS
  tickPs() {
    const sel = (this.con >> 8) & 7, mcu = this.mcu;
    let hz = mcu.fpb;
    if (sel === 2) hz = SOSC_HZ;
    else if (sel === 4) hz = 2 * mcu.fpb;
    else if (sel !== 0) mcu.cpu.say('warning', `${this.name}'s clock (CLKSEL ${sel.toString(2).padStart(3, '0')}) is not emulated: the system clock is used`, 'ccp-clock');
    return 1e12 / hz * PRESCALE[(this.con >> 6) & 3];
  }
  // SYNC: another module's period (2-8: CCP1-7), else its own
  syncSource() {
    const s = this.r(CON1H) & 0x1f;
    if (s === 0 || s === 1 || s === 0x1f) return 0;
    if (s >= 2 && s <= 8) return s - 1 === this.n ? 0 : s - 1;
    this.mcu.cpu.say('warning', `${this.name}'s sync source (SYNC ${s.toString(2).padStart(5, '0')}) is not emulated: its own period is used`, 'ccp-sync');
    return 0;
  }

  // the module set up again (CCPxCON1L / CON1H written): its time bases from 0, its output low, its FIFO empty
  configure() {
    const tb = this.tb, tb2 = this.tb2;
    tb.stop(); tb2.stop(); tb.held = tb2.held = 0;
    this.cancelPending();
    this.ops = 0;
    this.edges = 0;
    this.extern = 0;
    if (!this.on || !this.capture) this.clearFifo();
    if (!this.on) { this.driving = false; this.drivePins(); return; }
    const tickPs = this.tickPs();
    if (this.capture) {
      this.driving = false;
      this.drivePins();
      if (this.mod > 5) this.mcu.cpu.say('warning', `${this.name}'s capture mode ${this.mod.toString(2).padStart(4, '0')} is reserved: no capture`, 'ccp-mode');
      tb.width = this.wide ? 32 : 16;
      tb.start({ tickPs, pr: tb.max });
      return;
    }
    const mod = this.mod;
    if (mod >= 6) this.mcu.cpu.say('warning', `${this.name}'s mode ${mod.toString(2).padStart(4, '0')} (${mod === 6 ? 'center-aligned PWM' : mod === 7 ? 'variable frequency' : 'external input'}) is not emulated: no output`, 'ccp-mode');
    this.extern = this.syncSource();
    this.ra = this.r(RAL);
    this.rb = this.r(RBL);
    if (mod === 0) {
      this.driving = false;
      this.drivePins();
      if (this.wide) {
        tb.width = 32;
        const pr = ((this.r(PRH) << 16) | this.r(PRL)) >>> 0;
        if (pr) tb.start({ tickPs, pr });
      } else {
        tb.width = 16;
        if (this.r(PRL)) tb.start({ tickPs, pr: this.r(PRL), external: this.extern !== 0 });
        if (this.r(PRH)) tb2.start({ tickPs, pr: this.r(PRH) });
      }
      return;
    }
    this.outputMode();
    this.out = mod === 2 ? 1 : 0;   // low on the match: high until it
    this.driving = mod <= 5;
    this.drivePins();
    tb.width = this.wide && mod <= 3 ? 32 : 16;
    tb.start({ tickPs, pr: tb.width === 32 ? tb.max : this.r(PRL), external: this.extern !== 0 });
  }

  // OUTM other than the steerable single output: said, taken as it
  outputMode() {
    const outm = (this.r(CON3H) >> 8) & 7;
    if (this.mccp && outm && this.compare) this.mcu.cpu.say('warning', `${this.name}'s output mode (OUTM ${outm.toString(2).padStart(3, '0')}) is not emulated: a single output steered to the enabled pins`, 'ccp-outm');
  }

  // a period's start: CCTxIF at the end of the one before (every OPS + 1), the modules synchronised to this one told;
  // the buffered PWM's compare values latched, this period's compare events scheduled
  period(first) {
    if (!first) {
      if (!this.capture && ++this.ops > ((this.r(CON1H) >> 8) & 15)) { this.ops = 0; this.mcu.cpu.raise(this.cct); }
      if (this.capture) this.mcu.cpu.raise(this.cct);
      for (const fn of this.listeners) fn();
    }
    if (!this.compare) return;
    if (this.mod === 5) { this.ra = this.r(RAL); this.rb = this.r(RBL); }
    this.plan();
  }

  // the compare events of the current period still to come: one clock after each match
  plan() {
    const tb = this.tb, mod = this.mod, pr = tb.periodTicks - 1;
    const at = (k, fn) => {
      if (k > pr) return;
      const t = tb.timeOf(k + 1);
      if (t <= this.mcu.time) return;
      const h = this.mcu.schedule(t, () => { this.pending.delete(h); fn(); });
      this.pending.add(h);
    };
    if (mod >= 1 && mod <= 3) {
      const ra = tb.width === 32 ? ((this.r(RBL) << 16) | this.r(RAL)) >>> 0 : this.r(RAL);
      at(ra, () => this.single(mod));
    } else if (this.dual) {
      at(this.ra, () => { this.out = 1; this.drivePins(); });
      at(this.rb, () => { this.out = 0; this.drivePins(); this.mcu.cpu.raise(this.irq); });
    }
  }
  cancelPending() { for (const h of this.pending) this.mcu.cancel(h); this.pending.clear(); }

  // a single edge compare's match: high, low or toggled; SCEVT and CCPxIF
  single(mod) {
    this.out = mod === 1 ? 1 : mod === 2 ? 0 : this.out ^ 1;
    this.drivePins();
    this.setR(STATL, this.r(STATL) | SCEVT);
    this.mcu.cpu.raise(this.irq);
  }

  // the output on each enabled OCMx pin (its polarity: POLACE for A, C, E; POLBDF for B, D, F), the others left
  drivePins() {
    const en = (this.r(CON2H) >> 8) & 0x3f, c3 = this.r(CON3H);
    for (let i = 0; i < (this.mccp ? 6 : 1); i++) {
      const pol = (c3 >> (i & 1 ? 4 : 5)) & 1;
      this.drive(LETTERS[i], this.driving && (en >> i) & 1 ? this.out ^ pol : undefined);
    }
  }

  // CCPxTMRL / H: the primary timer's (the 32-bit one's halves), the secondary's
  timerRead(high) {
    const v = this.tb.value();
    if (this.tb.width === 32) return high ? (v >>> 16) & 0xffff : v & 0xffff;
    return high ? this.tb2.value() : v;
  }
  timerWrite(high, v) {
    const tb = this.tb;
    if (tb.width === 32) {
      const cur = tb.value();
      tb.write(high ? ((v << 16) | (cur & 0xffff)) >>> 0 : ((cur & 0xffff0000) | v) >>> 0);
    } else if (high) this.tb2.write(v);
    else tb.write(v);
    if (this.compare) { this.cancelPending(); this.plan(); }
  }

  // a period register written: from now on (the count past it: a new period)
  periodWritten() {
    if (!this.on || this.capture) return;
    const tb = this.tb, tb2 = this.tb2;
    if (this.mod === 0 && !this.wide) {
      const prl = this.r(PRL), prh = this.r(PRH);
      this.retime(tb, prl);
      this.retime(tb2, prh);
    } else if (this.mod === 0) {
      this.retime(tb, ((this.r(PRH) << 16) | this.r(PRL)) >>> 0);
    } else if (tb.width === 16) {
      this.retime(tb, this.r(PRL));
      this.cancelPending();
      this.plan();
    }
  }
  retime(tb, pr) {
    if (!pr) { tb.stop(); tb.held = 0; return; }
    if (!tb.running) { tb.start({ tickPs: this.tickPs(), pr, external: tb === this.tb && this.extern !== 0 }); return; }
    const cur = tb.value();
    tb.pr = pr;
    tb.write(cur <= pr ? cur : 0);
  }

  // CCPxRA / RB written: the unbuffered modes' events again from now
  compareWritten() {
    if (!this.compare || this.mod === 5) return;
    this.ra = this.r(RAL);
    this.rb = this.r(RBL);
    this.cancelPending();
    this.plan();
  }

  /** Another module's period's end (its sync out): this one's period starts again, if it follows it. */
  synced() { if (this.on && !this.capture && this.extern) { this.cancelPending(); this.tb.sync(); } }

  // ---- input capture

  /** The ICMx input's level changed (now). */
  input(level) {
    if (!this.on || !this.capture || level == null) return;
    const mod = this.mod, rising = level === 1;
    if (mod === 1 && !rising || mod === 2 && rising || mod > 5) return;
    if (mod === 4 || mod === 5) {
      if (!rising) return;
      if (++this.edges < (mod === 4 ? 4 : 16)) return;
      this.edges = 0;
    }
    this.captured(this.tb.value(this.mcu.eventTime));
  }

  // a capture: to the FIFO (full: ICOV, lost, but in edge detect mode); CCPxIF every OPS + 1 of them
  captured(v) {
    const depth = this.wide ? 2 : 4, stat = this.r(STATL), edgeDetect = this.mod === 0;
    if (stat & ICOV) { if (!edgeDetect) return; }
    if (this.fifo.length >= depth) {
      if (!edgeDetect) { this.setR(STATL, stat | ICOV); return; }
    } else this.fifo.push(v);
    this.setR(STATL, this.r(STATL) | ICBNE);
    if (++this.ops > ((this.r(CON1H) >> 8) & 15)) { this.ops = 0; this.mcu.cpu.raise(this.irq); }
  }

  // CCPxBUFL (16 bits: the FIFO's next, popped), CCPxBUFL / BUFH (32 bits: its halves, popped by BUFH's read)
  bufRead(high) {
    if (!this.on || !this.capture) return 0;
    const head = this.fifo[0] ?? this.last ?? 0;
    const v = this.wide ? (high ? (head >>> 16) & 0xffff : head & 0xffff) : high ? 0 : head & 0xffff;
    if (this.fifo.length && (this.wide ? high : !high)) {
      this.last = this.fifo.shift();
      if (!this.fifo.length) { this.setR(STATL, this.r(STATL) & ~(ICBNE | ICOV)); this.ops = 0; }
    }
    return v;
  }
  clearFifo() { this.fifo = []; this.last = 0; this.setR(STATL, this.r(STATL) & ~(ICBNE | ICOV)); }

  // CCPxSTATL: ASEVT, SCEVT, ICDIS, ICOV cleared by the program only, ICBNE read only, TRSET / TRCLR read as 0;
  // ICOV cleared empties the FIFO
  writeStat(v, old) {
    const nv = (old & 0x9f & (v | ~0x1e)) & ~0x60;
    this.setR(STATL, nv);
    if (old & ICOV && !(nv & ICOV)) this.clearFifo();
  }

  reset() {
    this.tb.stop(); this.tb2.stop(); this.tb.held = this.tb2.held = 0;
    this.cancelPending();
    Object.assign(this, { out: 0, driving: false, fifo: [], last: 0, ops: 0, edges: 0, extern: 0, paused: null });
    this.drivePins();
  }

  clockChanged() { if (this.on) this.configure(); }

  // asleep it stops (CCPSLP on the SOSC: on), in Idle with CCPSIDL; awake, on from its count
  sleep(mode) {
    if (!this.on) return;
    const runs = mode === 'idle' ? !(this.con & 0x2000) : (this.con & 0x1000) && ((this.con >> 8) & 7) === 2;
    if (runs) return;
    this.paused = true;
    this.tb.stop(); this.tb2.stop();
    this.cancelPending();
  }
  wake() {
    if (!this.paused) return;
    this.paused = false;
    const tickPs = this.tickPs();
    for (const tb of [this.tb, this.tb2]) if (tb.pr && (tb === this.tb || (this.mod === 0 && !this.wide && this.r(PRH)))) {
      if (tb === this.tb2 || this.capture || this.mod !== 0 || this.wide || this.r(PRL)) tb.start({ tickPs, pr: tb.pr, external: tb.external, count: tb.held });
    }
    if (this.compare) this.plan();
  }
}

/** MCCP1-3 and SCCP4-7: drive(module, letter, level) their outputs; the sync outs wired to each other. */
export function createCcps(mcu, drive) {
  const ccps = [1, 2, 3, 4, 5, 6, 7].map((n) => new Ccp(mcu, n, (letter, level) => drive(n, letter, level)));
  for (const c of ccps) c.listeners.push(() => { for (const d of ccps) if (d !== c && d.extern === c.n) d.synced(); });
  return ccps;
}
