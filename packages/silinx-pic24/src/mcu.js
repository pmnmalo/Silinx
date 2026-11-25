// silinx-pic24 - the PIC24FJ1024GB610 as a device (#5481): the core (cpu.js) with its peripherals' SFRs, its clock
// (the oscillator's, osc.js) and so its time in ps, its resets (RCON's flags), its pins (gpio.js). A peripheral is a
// module of its own that registers its SFRs here: their reset values, their writable bits, their read and write
// hooks, as the data sheet's SFR maps (DS30010074 tables 4-4 to 4-11) give them.

import { CPU } from './cpu.js';
import { readConfig } from './config.js';

// RCON's reset flags (DS30010074 register 7-1), by the reset's cause
const RCON = 0x0110;
export const RCON_BITS = { TRAPR: 0x8000, IOPUWR: 0x4000, CM: 0x0200, EXTR: 0x0080, SWR: 0x0040, SWDTEN: 0x0020, WDTO: 0x0010, SLEEP: 0x0008, IDLE: 0x0004, BOR: 0x0002, POR: 0x0001 };
const CAUSE_FLAG = (cause) => {
  if (cause === 'power-on') return RCON_BITS.POR | RCON_BITS.BOR;
  if (cause === 'RESET instruction') return RCON_BITS.SWR;
  if (cause === 'watchdog') return RCON_BITS.WDTO;
  if (cause === 'MCLR') return RCON_BITS.EXTR;
  if (/^illegal instruction|address pointer before it was written/.test(cause)) return RCON_BITS.IOPUWR;
  return 0;
};

export class Pic24Mcu {
  /** program: the program words (index = address / 2); config: the configuration space's words (a HEX's); fcy: the
   *  instruction clock forced (Hz), else the oscillator's; primaryHz: the primary oscillator's crystal. */
  constructor({ program = [], config = new Map(), primaryHz, log } = {}) {
    this.cpu = new CPU(program, { log });
    for (const [a, v] of config) this.cpu.configSpace.set(a, v);
    this.config = readConfig((a) => this.cpu.progWord(a), { primaryHz });
    this.primaryHz = primaryHz;
    this.regs = new Map();      // addr -> { reset, mask, read, write, keep }
    this.peripherals = [];
    this.rcon = 0;
    // the time: ps at the last change of the clock, and since then cyclePs a cycle
    this.base = { cycle: 0, ps: 0 };
    this.cyclePs = 1e12 / this.config.oscillator.fcy;
    this.register(RCON, { reset: 0, mask: 0x3bff, write: (v) => { this.rcon = v; } });
    this.cpu.onReset = (cause) => this.resetSfrs(cause);
    // PWRSAV's Sleep or Idle and the wake-up from it, to every peripheral (sleep(mode), wake(mode))
    this.cpu.onPwrsav = (mode) => { for (const p of this.peripherals) p.sleep?.(mode); };
    this.cpu.onWake = (mode) => { for (const p of this.peripherals) p.wake?.(mode); };
  }

  /** A peripheral's SFR: its reset value, its writable bits (mask), read() -> value (undefined: the stored one),
   *  write(value, old, bytes, written) after the store (bytes: the bytes written, 0x00FF, 0xFF00 or 0xFFFF;
   *  written: the value as written, its read-only bits too). */
  register(addr, { reset = 0, mask = 0xffff, read, write } = {}) {
    const r = { reset, mask, read, write };
    this.regs.set(addr, r);
    const cpu = this.cpu;
    cpu.writeHooks[addr] = (nv, old, a, bytes) => {
      const v = (nv & r.mask) | (old & ~r.mask & 0xffff);
      cpu.mem[addr >> 1] = v;
      r.write?.(v, old, bytes, nv);
      return true;
    };
    if (read) cpu.readHooks[addr] = () => read();
    cpu.mem[addr >> 1] = reset;
    return r;
  }

  /** A peripheral attached: its reset(cause) on every reset, after the SFRs'; its clockChanged() after a change of
   *  the clock. */
  attach(p) { this.peripherals.push(p); return p; }
  clockChanged() { for (const p of this.peripherals) p.clockChanged?.(); }

  get(addr) { return this.cpu.mem[addr >> 1]; }
  set(addr, v) { this.cpu.mem[addr >> 1] = v & 0xffff; }

  resetSfrs(cause) {
    for (const [addr, r] of this.regs) this.cpu.mem[addr >> 1] = r.reset;
    // RCON's flags kept through a reset (but a power-on's), its cause's flag set; SWDTEN cleared
    this.rcon = (cause === 'power-on' ? 0 : this.rcon & ~RCON_BITS.SWDTEN) | CAUSE_FLAG(cause);
    this.cpu.mem[RCON >> 1] = this.rcon;
    for (const p of this.peripherals) p.reset?.(cause);
  }

  /** The device's power-on: its SFRs and peripherals to their reset values. */
  powerOn() { this.cpu.reset('power-on'); }

  // ---- the time
  get cycles() { return this.cpu.cycles; }
  get time() { return this.base.ps + (this.cpu.cycles - this.base.cycle) * this.cyclePs; }
  /** The instruction clock changed (a clock switch, CLKDIV): the time so far kept, the cycles from now at fcy. */
  setFcy(fcy) {
    this.base = { cycle: this.cpu.cycles, ps: this.time };
    this.cyclePs = 1e12 / fcy;
  }
  get fcy() { return 1e12 / this.cyclePs; }
  /** The peripherals' clock (Hz): Fosc / 2 (the CPU's but for DOZE). */
  get fpb() { return this.periphHz ?? this.fcy; }

  /** fn() at time t (ps), at the instruction boundary that reaches it (eventTime its t meanwhile): its handle, for
   *  cancel(). */
  schedule(t, fn) {
    const run = () => { const was = this.eventAt; this.eventAt = t; try { fn(); } finally { this.eventAt = was; } };
    return this.cpu.addClockEvent(run, Math.max(0, Math.ceil((t - this.time) / this.cyclePs - 1e-9)));
  }
  /** The time (ps) of the clock event being run, its own (the instruction that reaches it may end later), else now:
   *  an edge's time, for a capture. */
  get eventTime() { return this.eventAt ?? this.time; }
  cancel(handle) { if (handle) this.cpu.clearClockEvent(handle); }

  /** The cycles in a duration (s) at the current Fcy. */
  cyclesIn(seconds) { return seconds * 1e12 / this.cyclePs; }

  /** Runs to time t (ps; the last instruction may end past it). */
  runTo(t) {
    const cpu = this.cpu;
    while (this.time < t) cpu.step();
  }
}
