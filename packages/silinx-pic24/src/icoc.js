// silinx-pic24 - the input capture and output compare modules with dedicated timers (#5529, DS30010074 sections 14
// and 15, DS70000352, DS70005159): IC1-6 and OC1-6, each counting its own 16-bit timer (timebase.js) on the clock
// ICTSEL / OCTSEL select: the system clock (Fosc / 2), or Timer1-5's prescaled clock while that timer runs.
// SYNCSEL gives its period: its own (an OC's 11111: OCxRS + 1 counts), a timer's match (Timer1-3), another OC's or
// a CCP module's period, else free-running to 0xFFFF (00000).
// - OC (OCM): 001 low, then high one count after OCxR's match (once); 010 high, then low (once); 011 toggled at
//   each match of OCxR; 100 a pulse, high one count after OCxR's match, low after OCxRS's (once); 101 that pulse every
//   period; 110 edge-aligned PWM, high from the period's start for OCxR counts (OCxR, OCxRS latched at each period's
//   start); OCxIF at OCxR's match (001-011), OCxRS's (100, 101), each period's start (110); OCINV inverts the output,
//   OCTRIS leaves the pin. OC1-3 drive their pins through PPS, OC4-6 their fixed pins RD6, RD7, RF0.
// - IC (ICM): the timer's value written to a FIFO of four at 001 every edge, 010 every falling, 011 every rising,
//   100 every 4th rising, 101 every 16th rising edge; ICBNE, ICOV (a capture when full lost); ICxIF every ICI + 1
//   captures (every one in 001); 111 the input an interrupt (its rising edge) while the device sleeps or idles. IC1-3
//   read their inputs through PPS, IC4-6 their fixed pins RE5, RE6, RE7.
//
// Not modelled: the cascaded 32-bit modes (OC32, IC32) and Trigger mode (OCTRIG, ICTRIG, TRIGSTAT, TRIGMODE: taken as
// Sync), said when set; center-aligned PWM (OCM 111), said; the sync sources other than those above (the IC and CCP
// interrupts, the comparators, the A/D, the CTMU: free-running, said); the Faults (ENFLT, OCFLT, FLTOUT, FLTMD), DCB's
// fine edge; a timer's change of clock while it runs applies from now on. Asleep the modules stop (but ICM 111); in
// Idle with OCSIDL / ICSIDL.

import { Timebase } from './timebase.js';

const OC_BASE = 0x0230, OC_STRIDE = 0x0a, IC_BASE = 0x0200, IC_STRIDE = 8;
const OC_IRQ = [2, 6, 25, 26, 41, 42], IC_IRQ = [1, 5, 37, 38, 39, 40];
// ICTSEL / OCTSEL: the clock's timer (111 the system clock)
const IC_CLOCK = ['T3', 'T2', 'T4', 'T5', 'T1'], OC_CLOCK = ['T2', 'T3', 'T4', 'T5', 'T1'];
const ICOV = 0x0010, ICBNE = 0x0008;

// a SYNCSEL's source: { timer: 'T1' } | { oc: n } | { ccp: n } | null (none, free-running) | undefined (not emulated)
function syncOf(s, self) {
  if (s === 0) return null;
  if (s >= 1 && s <= 3) return { oc: s };
  if (s >= 4 && s <= 0x0a) return { ccp: s - 3 };
  if (s >= 0x0b && s <= 0x0d) return { timer: `T${s - 0x0a}` };
  if (s === 0x1f && self === 'oc') return { own: true };
  return undefined;
}
const bin = (v, n) => v.toString(2).padStart(n, '0');

// the part both share: a timer on its clock, its period from SYNCSEL
class Dedicated {
  constructor(mcu, timers, kind, n) {
    Object.assign(this, { mcu, timers, kind, n, sync: null });
    this.tb = new Timebase(mcu, { onPeriod: (t, first) => this.period(first) });
    this.listeners = [];
  }
  get name() { return `${this.kind.toUpperCase()}${this.n}`; }

  // the clock's tick (ps), or null: its timer off
  tickPs(sel, table) {
    if (sel === 7) return 1e12 / this.mcu.fpb;
    const c = this.timers.clock(table[sel]);
    return c && c.running ? c.tickPs : null;
  }

  // the time base from 0 on its clock, its period its own (pr), a source's or the width's
  startTimer(sel, table, syncsel, pr) {
    const tb = this.tb;
    tb.stop();
    tb.held = 0;
    let sync = syncOf(syncsel, this.kind);
    if (sync === undefined) {
      this.mcu.cpu.say('warning', `${this.name}'s sync source (SYNCSEL ${bin(syncsel, 5)}) is not emulated: free-running`, `${this.kind}-sync`);
      sync = null;
    }
    this.sync = sync;
    if (sel > 4 && sel !== 7) return;
    const tickPs = this.tickPs(sel, table);
    if (tickPs == null) return;
    tb.start({ tickPs, pr: sync?.own ? pr : 0xffff, external: !!sync && !sync.own });
  }

  /** A source's period ended (a timer's match, another module's period): this timer from 0, if it follows it. */
  synced(src) {
    const s = this.sync;
    if (!s || s.own || !this.tb.running) return;
    if ((s.timer && s.timer === src.timer) || (s.oc && s.oc === src.oc) || (s.ccp && s.ccp === src.ccp)) this.tb.sync();
  }
}

class OutputCompare extends Dedicated {
  constructor(mcu, timers, n, drive) {
    super(mcu, timers, 'oc', n);
    this.drive = drive;
    this.base = OC_BASE + OC_STRIDE * (n - 1);
    this.irq = OC_IRQ[n - 1];
    this.pending = new Set();
    this.out = 0;
    this.r = this.rs = 0;
    const b = this.base, conf = () => this.configure();
    mcu.register(b, { mask: 0x3fff, write: conf });
    mcu.register(b + 2, { reset: 0x000c, mask: 0xf7ff, write: (v, old) => { if ((v ^ old) & 0x00ff || (v ^ old) & 0x0100) conf(); else this.drivePin(); } });
    mcu.register(b + 4, { write: () => this.compareWritten() });   // OCxRS
    mcu.register(b + 6, { write: () => this.compareWritten() });   // OCxR
    mcu.register(b + 8, { read: () => this.tb.value(), write: (v) => { this.tb.write(v); this.replan(); } });
    mcu.attach(this);
  }
  get con1() { return this.mcu.get(this.base); }
  get con2() { return this.mcu.get(this.base + 2); }
  get ocm() { return this.con1 & 7; }
  get regR() { return this.mcu.get(this.base + 6); }
  get regRS() { return this.mcu.get(this.base + 4); }

  configure() {
    this.cancelPending();
    const ocm = this.ocm, c2 = this.con2, say = (t, k) => this.mcu.cpu.say('warning', t, k);
    if (!ocm) { this.tb.stop(); this.tb.held = 0; this.out = 0; this.drivePin(); return; }
    if (c2 & 0x0100) say(`${this.name}'s cascaded 32-bit mode (OC32) is not emulated: a 16-bit module`, 'oc32');
    if (c2 & 0x0080) say(`${this.name}'s Trigger mode (OCTRIG) is not emulated: synchronised to its source`, 'octrig');
    if (ocm === 7) say(`${this.name}'s center-aligned PWM (OCM 111) is not emulated: no output`, 'oc-center');
    this.r = this.regR; this.rs = this.regRS;
    this.out = ocm === 2 || (ocm === 6 && this.r > 0) ? 1 : 0;
    this.drivePin();
    this.startTimer((this.con1 >> 10) & 7, OC_CLOCK, c2 & 0x1f, this.rs);
  }

  // a period's start: its end the sync out (to the modules following it); PWM's values latched, its rise, OCxIF
  period(first) {
    if (!first) for (const fn of this.listeners) fn();
    const ocm = this.ocm;
    if (ocm === 6) {
      this.r = this.regR; this.rs = this.regRS;
      if (this.sync?.own) { this.tb.pr = this.rs; this.tb.schedule(); }
      if (!first) this.mcu.cpu.raise(this.irq);
      this.out = this.r > 0 ? 1 : 0;
      this.drivePin();
    }
    if (ocm === 3 || ocm === 5 || ocm === 6 || first) this.plan();
  }

  // this period's events still to come
  plan() {
    const tb = this.tb, ocm = this.ocm, last = tb.periodTicks;
    const at = (k, fn) => {
      if (k > last || !tb.running) return;
      const t = tb.timeOf(k);
      if (t <= this.mcu.time) return;
      const h = this.mcu.schedule(t, () => { this.pending.delete(h); fn(); });
      this.pending.add(h);
    };
    const set = (v, irq) => () => { this.out = v === 't' ? this.out ^ 1 : v; this.drivePin(); if (irq) this.mcu.cpu.raise(this.irq); };
    if (ocm >= 1 && ocm <= 3) {
      if (this.fired && ocm !== 3) return;
      at(this.r + 1, () => { this.fired = ocm !== 3; set(ocm === 1 ? 1 : ocm === 2 ? 0 : 't', true)(); });
    } else if (ocm === 4 || ocm === 5) {
      if (this.fired && ocm === 4) return;
      at(this.r + 1, set(1));
      at(this.rs + 1, () => { this.fired = ocm === 4; set(0, true)(); });
    } else if (ocm === 6 && this.r > 0) at(this.r, set(0));
  }
  cancelPending() { for (const h of this.pending) this.mcu.cancel(h); this.pending.clear(); this.fired = false; }
  replan() { if (this.ocm && this.ocm !== 7) { const f = this.fired; for (const h of this.pending) this.mcu.cancel(h); this.pending.clear(); this.fired = f; this.plan(); } }

  // OCxR / OCxRS written: the compare modes' events again from now (PWM's at its next period)
  compareWritten() {
    if (!this.ocm || this.ocm >= 6) return;
    this.r = this.regR; this.rs = this.regRS;
    if (this.sync?.own) this.tb.pr = this.rs;
    this.replan();
  }

  // the pin: OCINV's polarity, OCTRIS (or the module off, its center-aligned mode): left
  drivePin() {
    const c2 = this.con2, ocm = this.ocm;
    this.drive(ocm && ocm !== 7 && !(c2 & 0x0020) ? this.out ^ ((c2 >> 12) & 1) : undefined);
  }

  reset() { this.tb.stop(); this.tb.held = 0; this.cancelPending(); this.out = 0; this.paused = false; this.drivePin(); }
  sleep(mode) {
    if (!this.ocm || (mode === 'idle' && !(this.con1 & 0x2000))) return;
    this.paused = this.tb.running;
    this.tb.stop();
    for (const h of this.pending) this.mcu.cancel(h);
    this.pending.clear();
  }
  wake() {
    if (!this.paused) return;
    this.paused = false;
    this.tb.start({ tickPs: this.tb.tickPs, pr: this.tb.pr, external: this.tb.external, count: this.tb.held });
    this.plan();
  }
  /** Its clock's timer changed (on, off, its prescaler): its tick again, its count kept. */
  clockChanged() {
    if (!this.ocm) return;
    const t = this.tickPs((this.con1 >> 10) & 7, OC_CLOCK), tb = this.tb;
    if (t == null) { if (tb.running) { tb.stop(); this.replan(); } return; }
    if (!tb.running) { tb.start({ tickPs: t, pr: this.sync?.own ? this.rs : 0xffff, external: !!this.sync && !this.sync.own, count: tb.held }); this.replan(); return; }
    if (t !== tb.tickPs) { const v = tb.value(); tb.tickPs = t; tb.write(v); this.replan(); }
  }
}

class InputCapture extends Dedicated {
  constructor(mcu, timers, n) {
    super(mcu, timers, 'ic', n);
    this.base = IC_BASE + IC_STRIDE * (n - 1);
    this.irq = IC_IRQ[n - 1];
    this.fifo = [];
    const b = this.base;
    mcu.register(b, { mask: 0x3c67, write: () => this.configure() });
    mcu.register(b + 2, { reset: 0x000d, mask: 0x01df, write: () => this.configure() });
    mcu.register(b + 4, { mask: 0, read: () => this.bufRead() });
    mcu.register(b + 6, { read: () => this.tb.value(), write: (v) => this.tb.write(v) });
    mcu.attach(this);
  }
  get con1() { return this.mcu.get(this.base); }
  get icm() { return this.con1 & 7; }
  setStat(bits, on) { const c = this.con1; this.mcu.set(this.base, on ? c | bits : c & ~bits); }

  configure() {
    const icm = this.icm, c2 = this.mcu.get(this.base + 2), say = (t, k) => this.mcu.cpu.say('warning', t, k);
    this.edges = 0;
    this.count = 0;
    if (!icm || icm === 6) { this.tb.stop(); this.tb.held = 0; this.fifo = []; this.setStat(ICOV | ICBNE, false); return; }
    if (c2 & 0x0100) say(`${this.name}'s cascaded 32-bit mode (IC32) is not emulated: a 16-bit module`, 'ic32');
    if (c2 & 0x0080) say(`${this.name}'s Trigger mode (ICTRIG) is not emulated: synchronised to its source`, 'ictrig');
    this.startTimer((this.con1 >> 10) & 7, IC_CLOCK, c2 & 0x1f, 0xffff);
  }
  period() {}

  /** Its input's level changed (now). */
  input(level) {
    const icm = this.icm;
    if (!icm || icm === 6 || level == null) return;
    const rising = level === 1;
    if (icm === 7) { if (rising && this.mcu.cpu.sleeping) this.mcu.cpu.raise(this.irq); return; }
    if ((icm === 2 && rising) || (icm >= 3 && !rising)) return;
    if (icm === 4 || icm === 5) { if (++this.edges < (icm === 4 ? 4 : 16)) return; this.edges = 0; }
    if (this.fifo.length >= 4) { this.setStat(ICOV, true); return; }
    this.fifo.push(this.tb.value(this.mcu.eventTime));
    this.setStat(ICBNE, true);
    if (icm === 1 || ++this.count > ((this.con1 >> 5) & 3)) { this.count = 0; this.mcu.cpu.raise(this.irq); }
  }

  // ICxBUF: the FIFO's next, popped (empty: ICBNE clear, the last again)
  bufRead() {
    if (this.fifo.length) {
      this.last = this.fifo.shift();
      if (!this.fifo.length) this.setStat(ICBNE | ICOV, false);
    }
    return this.last ?? 0;
  }

  reset() { this.tb.stop(); this.tb.held = 0; this.fifo = []; this.last = 0; this.paused = false; }
  sleep(mode) {
    const icm = this.icm;
    if (!icm || icm === 7 || (mode === 'idle' && !(this.con1 & 0x2000))) return;
    this.paused = this.tb.running;
    this.tb.stop();
  }
  wake() {
    if (!this.paused) return;
    this.paused = false;
    this.tb.start({ tickPs: this.tb.tickPs, pr: 0xffff, external: this.tb.external, count: this.tb.held });
  }
  clockChanged() {
    if (!this.icm || this.icm >= 6) return;
    const t = this.tickPs((this.con1 >> 10) & 7, IC_CLOCK), tb = this.tb;
    if (t == null) { tb.stop(); return; }
    if (!tb.running) { tb.start({ tickPs: t, pr: 0xffff, external: !!this.sync, count: tb.held }); return; }
    if (t !== tb.tickPs) { const v = tb.value(); tb.tickPs = t; tb.write(v); }
  }
}

/** IC1-6 and OC1-6: drive(n, level) OCn's output; their sync wired (OCs' periods to each other, sync(src) from the
 *  timers and the CCP modules). */
export function createIcOc(mcu, timers, drive) {
  const ocs = [1, 2, 3, 4, 5, 6].map((n) => new OutputCompare(mcu, timers, n, (level) => drive(n, level)));
  const ics = [1, 2, 3, 4, 5, 6].map((n) => new InputCapture(mcu, timers, n));
  const all = [...ocs, ...ics];
  const sync = (src) => { for (const m of all) m.synced(src); };
  for (const oc of ocs) oc.listeners.push(() => sync({ oc: oc.n }));
  timers.onChange(() => { for (const m of all) m.clockChanged(); });
  return { ocs, ics, sync };
}
