// silinx-pic24 - the oscillator (#5481, DS30010074 section 9): the clock sources (FRC 8 MHz, the primary
// oscillator, the SOSC, the LPRC, the DCO), the PLLs (the 96 MHz USB PLL and its 32 MHz branch through CPDIV, the
// 4x / 6x / 8x PLL), the divided FRC (OSCFDIV: RCDIV's source over OSCDIV), DOZE; OSCCON with its unlock sequences
// (0x78, 0x9A to its high byte for NOSC; 0x46, 0x57 to its low byte for OSWEN, IOLOCK, CLKLOCK), the clock switch as
// FOSC's FCKSM allows it. The device's time follows Fosc: Fcy = Fosc / 2 (the CPU's, over DOZE's ratio when DOZEN).
//
// Not modelled: the oscillators' start-up and the PLL's lock times (a switch completes at once, LOCK set), OSCTUN's
// and the FRC's self-tune (the FRC is 8 MHz), the Fail-Safe Clock Monitor and CF, the reference clock output (REFO),
// two-speed start-up (IESO).

const SOURCES = ['FRC', 'FRCPLL', 'PRI', 'PRIPLL', 'SOSC', 'LPRC', 'DCO', 'FRCDIV'];
const OSCCON = 0x0100, CLKDIV = 0x0102, OSCTUN = 0x0106, DCOCON = 0x010a, OSCDIV = 0x010c, OSCFDIV = 0x010e;
const FRC_HZ = 8e6, LPRC_HZ = 31e3, SOSC_HZ = 32768;
const DOZE = [1, 2, 4, 8, 16, 32, 64, 128];
// CLKDIV's RCDIV: OSCFDIV's source (register 9-2)
const RCDIV_SOURCE = ['FRC', 'FRCPLL', 'PRI', 'PRIPLL', 'SOSC', 'LPRC', 'DCO', null];

export class Oscillator {
  constructor(mcu) {
    this.mcu = mcu;
    this.unlock = { hi: 0, lo: 0 };
    mcu.register(OSCCON, { reset: 0, mask: 0, write: (v, old, bytes, written) => this.writeOsccon(written, old, bytes) });
    mcu.register(CLKDIV, { reset: 0x3000, mask: 0xffe0, write: () => this.update() });
    mcu.register(OSCTUN, { reset: 0, mask: 0xbf3f });
    mcu.register(DCOCON, { reset: 0x0700, mask: 0x2f00, write: () => this.update() });
    mcu.register(OSCDIV, { reset: 0x0001, mask: 0x7fff, write: () => this.update() });
    mcu.register(OSCFDIV, { reset: 0, mask: 0xff80 });
    mcu.attach(this);
  }

  get words() { return this.mcu.config.words; }

  // the reset: COSC = NOSC = FOSCSEL's FNOSC; SOSCEN from FOSC's SOSCSEL (the PIM's 32.768 kHz crystal)
  reset() {
    const fnosc = this.words.FOSCSEL & 7;
    this.mcu.set(OSCCON, (fnosc << 12) | (fnosc << 8) | (this.isPll(fnosc) ? 0x20 : 0));
    this.unlock = { hi: 0, lo: 0 };
    this.update();
  }

  isPll(s) { return s === 1 || s === 3; }
  get cosc() { return (this.mcu.get(OSCCON) >> 12) & 7; }
  get source() { return SOURCES[this.cosc]; }
  /** Whether clock switching is enabled (FOSC's FCKSM: 0x clock switching on). */
  get canSwitch() { return !((this.words.FOSC >> 7) & 1); }

  // a source's frequency (Hz); null when it gives no clock (the primary oscillator disabled by POSCMD)
  hz(name) {
    const clkdiv = this.mcu.get(CLKDIV), pllmode = (this.words.FOSCSEL >> 3) & 15;
    const primary = (this.words.FOSC & 3) === 3 ? null : this.mcu.primaryHz ?? 8e6;
    const pll = (input) => {
      if (input == null) return null;
      // the 96 MHz USB PLL (PLLMODE 0xxx): its 32 MHz branch over CPDIV; else 4x, 6x, 8x
      if (pllmode < 8) return 32e6 / (1 << ((clkdiv >> 6) & 3));
      return input * ({ 12: 4, 13: 6, 14: 8 }[pllmode] ?? 1);
    };
    switch (name) {
      case 'FRC': return FRC_HZ;
      case 'FRCPLL': return pll(FRC_HZ);
      case 'PRI': return primary;
      case 'PRIPLL': return pll(primary);
      case 'SOSC': return SOSC_HZ;
      case 'LPRC': return LPRC_HZ;
      case 'DCO': { const k = (this.mcu.get(DCOCON) >> 8) & 15; return k < 8 ? (k + 1) * 1e6 : null; }   // (DCOFSEL: 1-8 MHz)
      default: {
        const src = RCDIV_SOURCE[(clkdiv >> 8) & 7], f = src && src !== 'FRCDIV' ? this.hz(src) : null, div = this.mcu.get(OSCDIV) & 0x7fff;
        return f == null ? null : div ? f / (2 * div) : f;
      }
    }
  }

  /** Fosc (Hz), the instruction clock (Fcy = Fosc / 2), the CPU's (over DOZE when DOZEN). */
  get fosc() { return this.hz(this.source) ?? 0; }
  get fcy() { return this.fosc / 2; }
  get doze() { const c = this.mcu.get(CLKDIV); return c & 0x0800 ? DOZE[(c >> 12) & 7] : 1; }

  update() {
    if (this.mcu.forcedFcy) { if (this.mcu.fcy !== this.mcu.forcedFcy) this.mcu.setFcy(this.mcu.forcedFcy); this.mcu.periphHz = this.mcu.forcedFcy; return; }
    const f = this.fosc;
    if (!f) {
      this.mcu.cpu.say('warning', `the oscillator ${this.source} gives no clock (FOSC's POSCMD: the primary oscillator disabled)`, 'no-clock');
      return;
    }
    if (f > 32e6) this.mcu.cpu.say('warning', `Fosc ${f / 1e6} MHz, above the device's 32 MHz`, `fosc-${f}`);
    const cpuFcy = f / 2 / this.doze;
    if (cpuFcy !== this.mcu.fcy || f / 2 !== this.mcu.periphHz) {
      this.mcu.setFcy(cpuFcy);
      this.mcu.periphHz = f / 2;
      this.mcu.clockChanged?.();
    }
  }

  // OSCCON: its high byte (NOSC) after 0x78, 0x9A written to it; its low byte (OSWEN, IOLOCK, CLKLOCK, SOSCEN,
  // POSCEN) after 0x46, 0x57; COSC, LOCK and CF read-only (XC16's __builtin_write_OSCCONH / L write these bytes)
  writeOsccon(v, old, mask) {
    const mcu = this.mcu, hi = (v >> 8) & 0xff, lo = v & 0xff;
    let next = old;
    if (mask & 0xff00) {
      if (this.unlock.hi === 2) { next = (next & ~0x0700) | ((hi & 7) << 8); this.unlock.hi = 0; }
      else this.unlock.hi = hi === 0x78 && this.unlock.hi === 0 ? 1 : hi === 0x9a && this.unlock.hi === 1 ? 2 : 0;
    }
    if (mask & 0x00ff) {
      if (this.unlock.lo === 2) {
        // IOLOCK set once when FOSC's IOL1WAY is; CLKLOCK set until a reset
        const ioOnce = old & 0x40 && (this.words.FOSC >> 5) & 1;
        next = (next & ~0xc7) | ((old | lo) & 0x80) | (ioOnce ? 0x40 : lo & 0x40) | (lo & 0x07);
        this.unlock.lo = 0;
      } else this.unlock.lo = lo === 0x46 && this.unlock.lo === 0 ? 1 : lo === 0x57 && this.unlock.lo === 1 ? 2 : 0;
    }
    mcu.set(OSCCON, next);
    if (next & 1 && !(old & 1)) this.switchClock();
  }

  /** Whether the PPS registers are locked (OSCCON's IOLOCK). */
  get ioLocked() { return (this.mcu.get(OSCCON) & 0x40) !== 0; }

  // OSWEN set: COSC = NOSC (when FCKSM allows it and CLKLOCK does not lock it), OSWEN cleared, LOCK for a PLL
  switchClock() {
    const mcu = this.mcu, o = mcu.get(OSCCON), nosc = (o >> 8) & 7;
    if (!this.canSwitch) {
      mcu.cpu.say('warning', 'OSWEN: clock switching is disabled (FOSC\'s FCKSM)', 'no-switch');
      mcu.set(OSCCON, o & ~1);
      return;
    }
    mcu.set(OSCCON, (o & ~0x7021) | (nosc << 12) | (this.isPll(nosc) ? 0x20 : 0));
    this.update();
    this.onSwitch?.();
  }
}
