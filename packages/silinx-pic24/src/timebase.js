// silinx-pic24 - a capture / compare module's time base (#5529): a counter of its clock's ticks (tickPs each), from
// 0 at each period's start to PR (its period PR + 1 ticks), or free-running to its width's end; its periods' starts
// scheduled as clock events (or given from outside: another module's period, sync()), each told to onPeriod(t, first)
// so that the module schedules its compare events within the period (first: the start, no period's end before it).
// The counter's value is computed from the time (lazily).

export class Timebase {
  /** onPeriod(t, first): a period starts at t (ps), the counter at 0 (first: the time base's start). */
  constructor(mcu, { onPeriod, width = 16 } = {}) {
    Object.assign(this, { mcu, onPeriod, width });
    this.running = false;
    this.tp = 0;               // the current period's start (ps)
    this.tickPs = 1;
    this.pr = this.max;
    this.external = false;     // its periods given by sync() (a timer's match), not its own PR
    this.held = 0;             // the value while stopped
    this.event = null;
  }

  get max() { return this.width === 32 ? 0xffffffff : 0xffff; }
  get periodTicks() { return this.external ? this.max + 1 : this.pr + 1; }
  get periodPs() { return this.periodTicks * this.tickPs; }

  /** Running from count (0 by default) now, at tickPs a tick, PR (or external periods). */
  start({ tickPs, pr = this.max, external = false, count = 0 }) {
    this.stopEvent();
    Object.assign(this, { tickPs, pr, external, running: true });
    this.tp = this.mcu.time - count * tickPs;
    this.schedule();
    if (count === 0) this.onPeriod?.(this.tp, true);
  }

  stop() { this.held = this.value(); this.running = false; this.stopEvent(); }
  stopEvent() { this.mcu.cancel(this.event); this.event = null; }

  /** The counter now (or at t). */
  value(t = this.mcu.time) {
    if (!this.running) return this.held;
    const n = Math.floor((t - this.tp) / this.tickPs + 1e-6);
    return n % this.periodTicks;
  }

  /** The time (ps) of the tick count k within the current period. */
  timeOf(k) { return this.tp + k * this.tickPs; }

  // the next period's start: its own (PR + 1 ticks), or the width's rollover when external
  schedule() {
    this.stopEvent();
    if (!this.running) return;
    const at = this.tp + this.periodPs;
    this.event = this.mcu.schedule(at, () => {
      this.event = null;
      this.tp = at;
      this.schedule();
      this.onPeriod?.(at);
    });
  }

  /** A period started by an outside event (a timer's match, a sync source) now. */
  sync() {
    if (!this.running) return;
    this.tp = this.mcu.time;
    this.schedule();
    this.onPeriod?.(this.tp);
  }

  /** The counter written (TMR): from that value now. */
  write(v) {
    if (!this.running) { this.held = v; return; }
    this.tp = this.mcu.time - v * this.tickPs;
    this.schedule();
  }
}
