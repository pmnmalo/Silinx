// silinx-pic24 - the watchdog (#5481, DS30010074 section 30.4): enabled by FWDT's FWDTEN (always, never, in software
// by RCON's SWDTEN, or while not asleep), its period from the 31 kHz LPRC through FWPSA's prescaler (32 or 128) and
// WDTPS's postscaler (1:1 to 1:32,768: 1 ms to 131 s); CLRWDT, PWRSAV, a clock switch, a wake-up and a reset clear it;
// its time-out resets the device (RCON's WDTO) or, asleep or idle, wakes it where PWRSAV left it. In its windowed
// mode (FWDT's WINDIS clear) a CLRWDT before the window (WDTWIN: its last 25 %, 37.5 %, 50 % or 75 %) resets it too.
//
// Not modelled: its clock sources other than the LPRC (FWDT's WDTCMX, WDTCLK), the LPRC's tolerance (31 kHz exactly).

import { RCON_BITS } from './mcu.js';

const LPRC_HZ = 31e3;
const WINDOW = [0.75, 0.5, 0.375, 0.25];   // (WDTWIN[1:0]: the window, a share of the period)

export class Watchdog {
  constructor(mcu) {
    this.mcu = mcu;
    this.start = 0;        // the cycle its count started at
    this.event = null;
    const cpu = mcu.cpu;
    cpu.onClrwdt = () => this.clear(true);
    mcu.attach(this);
    // RCON's SWDTEN written: the software's enable
    const rcon = mcu.regs.get(0x0110), w = rcon.write;
    rcon.write = (v, old, ...rest) => { w(v, old, ...rest); if ((v ^ old) & RCON_BITS.SWDTEN) this.restart(); };
  }

  get fwdt() { return this.mcu.config.words.FWDT; }
  /** Its period (s): the prescaler's 32 or 128 LPRC periods, times the postscaler's 2^WDTPS. */
  get period() { return ((this.fwdt >> 4) & 1 ? 128 : 32) * (1 << (this.fwdt & 15)) / LPRC_HZ; }
  get enabled() {
    switch ((this.fwdt >> 5) & 3) {
      case 3: return true;
      case 2: return (this.mcu.rcon & RCON_BITS.SWDTEN) !== 0;
      case 1: return !this.mcu.cpu.sleeping;
      default: return false;
    }
  }

  reset() { this.restart(); }

  // PWRSAV: RCON's SLEEP or IDLE, the count cleared; and again on the wake-up
  sleep(mode) {
    this.mcu.rcon |= mode === 'sleep' ? RCON_BITS.SLEEP : RCON_BITS.IDLE;
    this.mcu.set(0x0110, this.mcu.rcon);
    this.restart();
  }
  wake() { this.restart(); }

  // its count from 0 now, its time-out scheduled (in cycles at the current Fcy)
  restart() {
    const cpu = this.mcu.cpu;
    if (this.event) { cpu.clearClockEvent(this.event); this.event = null; }
    this.start = cpu.cycles;
    if (!this.enabled) return;
    this.event = cpu.addClockEvent(() => this.timeout(), Math.max(1, Math.round(this.mcu.cyclesIn(this.period))));
  }

  // CLRWDT: before the window (the windowed mode) a reset, else the count cleared
  clear(instruction) {
    if (instruction && this.enabled && !((this.fwdt >> 7) & 1)) {
      const elapsed = (this.mcu.cpu.cycles - this.start) / this.mcu.cyclesIn(this.period);
      if (elapsed < 1 - WINDOW[(this.fwdt >> 8) & 3]) { this.expire('CLRWDT before the watchdog\'s window'); return; }
    }
    this.restart();
  }

  timeout() {
    this.event = null;
    const cpu = this.mcu.cpu;
    if (cpu.sleeping) {
      this.mcu.rcon |= RCON_BITS.WDTO;
      this.mcu.set(0x0110, this.mcu.rcon);
      cpu.wake();
      return;
    }
    this.expire('the watchdog timed out');
  }

  expire(why) {
    this.mcu.cpu.say('warning', `${why} (${(this.period * 1e3).toFixed(this.period < 0.01 ? 2 : 0)} ms): the device resets`);
    this.mcu.cpu.reset('watchdog');
    this.mcu.cpu.npc = 0;
  }

  /** The clock changed: its time-out rescheduled for the remaining time. */
  clockChanged() { this.restart(); }
}
