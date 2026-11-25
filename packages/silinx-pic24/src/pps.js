// silinx-pic24 - the peripheral pin select (#5481, DS30010074 section 11.4): RPINRx maps an input function (U2RX, SDI1,
// INT1…) to an RPn or RPIn pin (63: none, Vss), RPORx an output function (U2TX 5, SDO1 7…) to an RPn pin, both locked
// while OSCCON's IOLOCK is set (a write then appears to work but changes nothing). A mapped output overrides the
// pin's latch while its peripheral drives it; an input function reads its pin's level and hears its changes.
//
// Not modelled: the Configuration Mismatch Reset of the registers' shadows; a pin mapped to two outputs takes the
// last one's level.

// RPn and RPIn pins (table 5): RP0-RP31 inputs and outputs, RPI32-RPI43 inputs only
export const RP_PINS = [
  'RB0', 'RB1', 'RD8', 'RD10', 'RD9', 'RD15', 'RB6', 'RB7', 'RB8', 'RB9', 'RF4', 'RD0', 'RD11', 'RB2', 'RB14', 'RF8',
  'RF3', 'RF5', 'RB5', 'RG8', 'RD5', 'RG6', 'RD3', 'RD2', 'RD1', 'RD4', 'RG7', 'RG9', 'RB4', 'RB15', 'RF2', 'RF13',
  'RF12', 'RE8', 'RE9', 'RA15', 'RA14', 'RC14', 'RC1', 'RC2', 'RC3', 'RC4', 'RD12', 'RD14',
];
// the input functions: RPINRn and its byte (table 11-3)
const INPUTS = {
  OCTRIG1: [0, 0], INT1: [0, 1], INT2: [1, 0], INT3: [1, 1], INT4: [2, 0], OCTRIG2: [2, 1], T2CK: [3, 0], T3CK: [3, 1],
  T4CK: [4, 0], T5CK: [4, 1], IC1: [7, 0], IC2: [7, 1], IC3: [8, 0], OCFA: [11, 0], OCFB: [11, 1], TCKIA: [12, 0],
  TCKIB: [12, 1], U3RX: [17, 1], U1RX: [18, 0], U1CTS: [18, 1], U2RX: [19, 0], U2CTS: [19, 1], SDI1: [20, 0],
  SCK1IN: [20, 1], SS1IN: [21, 0], U3CTS: [21, 1], SDI2: [22, 0], SCK2IN: [22, 1], SS2IN: [23, 0], TxCK: [23, 1],
  CLCINA: [25, 0], CLCINB: [25, 1], U4RX: [27, 0], U4CTS: [27, 1], SDI3: [28, 0], SCK3IN: [28, 1], SS3IN: [29, 0],
};
// the output functions' numbers (table 11-4)
const OUTPUTS = [
  null, 'C1OUT', 'C2OUT', 'U1TX', 'U1RTS', 'U2TX', 'U2RTS', 'SDO1', 'SCK1OUT', 'SS1OUT', 'SDO2', 'SCK2OUT', 'SS2OUT',
  'OC1', 'OC2', 'OC3', 'OCM4', 'OCM5', 'OCM6', 'U3TX', 'U3RTS', 'U4TX', 'U4RTS', 'SDO3', 'SCK3OUT', 'SS3OUT', 'C3OUT',
  'OCM7', 'REFO', 'CLC1OUT', 'CLC2OUT', 'RTCC',
];
const RPINR0 = 0x0790, RPOR0 = 0x07d4;
// the RPINR registers the device has (its SFR map), their reset values
const RPINRS = { 0: 0x3f3f, 1: 0x3f3f, 2: 0x3f3f, 3: 0x3f3f, 4: 0x3f3f, 5: 0x3f3f, 6: 0x3f3f, 7: 0x3f3f, 8: 0x003f, 11: 0x3f3f, 12: 0x3f3f, 14: 0x3f3f, 15: 0x003f, 17: 0x3f00, 18: 0x3f3f, 19: 0x3f3f, 20: 0x3f3f, 21: 0x3f3f, 22: 0x3f3f, 23: 0x3f3f, 25: 0x3f3f, 27: 0x3f3f, 28: 0x3f3f, 29: 0x003f };

export class Pps {
  constructor(mcu, ports, osc) {
    Object.assign(this, { mcu, ports, osc });
    this.levels = new Map();       // an output function's level (undefined: not driving)
    this.mapped = new Map();       // pin -> its output function
    this.watchers = new Map();     // input function -> [fn(level)]
    for (const [n, reset] of Object.entries(RPINRS)) mcu.register(RPINR0 + 2 * n, { reset, mask: 0x3f3f, write: (v, old) => this.locked(RPINR0 + 2 * n, old) });
    for (let n = 0; n < 16; n++) mcu.register(RPOR0 + 2 * n, { reset: 0, mask: 0x3f3f, write: (v, old) => { if (!this.locked(RPOR0 + 2 * n, old)) this.remap(); } });
    ports.onLevel((pin, level) => {
      for (const [fn, list] of this.watchers) if (this.inputPin(fn) === pin) for (const w of list) w(level);
    });
    mcu.attach(this);
  }

  // IOLOCK set: the write undone (true)
  locked(addr, old) {
    if (!this.osc.ioLocked) return false;
    this.mcu.set(addr, old);
    this.mcu.cpu.say('warning', 'a PPS register written while OSCCON\'s IOLOCK is set: unchanged', 'pps-locked');
    return true;
  }

  /** An input function's pin ('U2RX': 'RF4'), or null (RPINR 63, an unimplemented pin: Vss). */
  inputPin(fn) {
    const at = INPUTS[fn];
    if (!at) throw new Error(`no PPS input function '${fn}'`);
    const n = (this.mcu.get(RPINR0 + 2 * at[0]) >> (8 * at[1])) & 0x3f;
    return RP_PINS[n] ?? null;
  }
  /** An input function's level: its pin's (Vss, 0, when none). */
  input(fn) { const pin = this.inputPin(fn); return pin ? this.ports.level(pin) ?? 0 : 0; }
  /** fn(level) on each change of an input function's pin. */
  watch(fn, cb) { if (!this.watchers.has(fn)) this.watchers.set(fn, []); this.watchers.get(fn).push(cb); }

  /** The pins an output function is mapped to. */
  outputPins(fn) { return [...this.mapped].filter(([, f]) => f === fn).map(([p]) => p); }

  /** An output function's level now (0, 1), or undefined: its peripheral no longer drives it (the latch's again). */
  output(fn, level) {
    if (level === undefined) this.levels.delete(fn); else this.levels.set(fn, level ? 1 : 0);
    for (const pin of this.outputPins(fn)) this.ports.override(pin, fn, this.levels.get(fn));
  }
  /** An output function's level at time t (ps; now or later). */
  outputAt(fn, level, t) {
    if (t <= this.mcu.time) this.output(fn, level);
    else this.mcu.schedule(t, () => this.output(fn, level));
  }

  // RPORx: each RPn's output function
  remap() {
    const before = new Map(this.mapped);
    this.mapped.clear();
    for (let rp = 0; rp < 32; rp++) {
      const f = OUTPUTS[(this.mcu.get(RPOR0 + 2 * (rp >> 1)) >> (8 * (rp & 1))) & 0x3f] ?? null;
      if (f) this.mapped.set(RP_PINS[rp], f);
    }
    for (const [pin] of before) if (!this.mapped.has(pin)) this.ports.override(pin, null, undefined);
    for (const [pin, f] of this.mapped) this.ports.override(pin, f, this.levels.get(f));
  }

  reset() { this.levels.clear(); this.mapped.clear(); }
}
