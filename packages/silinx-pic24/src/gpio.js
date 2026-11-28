// silinx-pic24 - the I/O ports (#5481, DS30010074 section 11): PORTA to PORTG of the 100-pin device, each with TRIS,
// PORT, LAT, ODC, ANS (but PORTF) and the interrupt-on-change's IOCP, IOCN, IOCF, IOCPU, IOCPD; PADCON's IOCON and
// IOCSTAT; the IOC interrupt (IRQ 19). A pin's level: a peripheral's output when one drives it (pps.js, the PMP…),
// else its latch when TRIS makes it an output (an open drain's 1 released), else what drives it from outside
// (setInput), else its weak pull-up or pull-down, else floating (it reads as 0). An analog pin (ANS) reads as 0.
// The JTAG port, on while FICD's JTAGEN is (an erased FICD's, #6027), takes RA0, RA1, RA4 and RA5 (TMS, TCK, TDI,
// TDO on the 100-pin device's pin diagram): the port drives none of them (no debugger shifting TDO), a warning said the
// first time the program makes one an output.
//
// Not modelled: the pins' electrical levels and currents (a 5 V input on a 3.3 V pin), the input's Schmitt trigger
// and its synchronisation delay (a read sees the level at once), the PMP's TTL buffers (PADCON's PMPTTL).

const PORTS = 'ABCDEFG';
const BASE = 0x0662, STRIDE = 0x14;   // TRISA at 0x0662, TRISB at 0x0676…
const OFF = { TRIS: 0, PORT: 2, LAT: 4, ODC: 6, ANS: 8, IOCP: 10, IOCN: 12, IOCF: 14, IOCPU: 16, IOCPD: 18 };
// the pins of the 100-pin TQFP (table 5), and the analog ones (registers 11-1 to 11-6; RD13's ANS bit reads 1)
const PINS = { A: 0xc6ff, B: 0xffff, C: 0xf01e, D: 0xffff, E: 0x03ff, F: 0x31bf, G: 0xf3cf };
const ANALOG = { A: 0x06c0, B: 0xffff, C: 0x6010, D: 0x00c0, E: 0x0210, F: 0, G: 0x03c0 };
const PADCON = 0x065e, IOCSTAT = 0x0660, IOC_IRQ = 19;
const JTAG_PINS = { RA0: 'TMS', RA1: 'TCK', RA4: 'TDI', RA5: 'TDO' };

export class Ports {
  constructor(mcu) {
    this.mcu = mcu;
    this.inputs = new Map();     // pin -> its level from outside (0, 1, null)
    this.overrides = new Map();  // pin -> { owner, value } (a peripheral's output)
    this.last = new Map();       // pin -> its level last seen (the IOC's edges, the outputs' changes)
    this.listeners = [];         // fn(pin, driven): an output's change (driven: 0, 1, null when released)
    this.levelListeners = [];    // fn(pin, level): a pin's level changed (an input's, PPS's)
    this.jtag = mcu.config?.jtag ? JTAG_PINS : {};   // the pins the JTAG port takes: pin -> its signal
    PORTS.split('').forEach((p, k) => {
      const at = (r) => BASE + k * STRIDE + OFF[r], pins = PINS[p];
      mcu.register(at('TRIS'), { reset: pins, mask: pins, write: () => this.update(p) });
      mcu.register(at('PORT'), { reset: 0, mask: 0, read: () => this.readPort(p), write: (v, old, bytes, w) => this.writeLat(p, w, bytes) });
      mcu.register(at('LAT'), { reset: 0, mask: pins, write: () => this.update(p) });
      mcu.register(at('ODC'), { reset: 0, mask: pins, write: () => this.update(p) });
      if (p !== 'F') mcu.register(at('ANS'), { reset: ANALOG[p] | (p === 'D' ? 0x2000 : 0), mask: ANALOG[p] });
      mcu.register(at('IOCP'), { reset: 0, mask: pins });
      mcu.register(at('IOCN'), { reset: 0, mask: pins });
      mcu.register(at('IOCF'), { reset: 0, mask: pins, write: (v, old) => this.writeFlags(p, v, old) });
      mcu.register(at('IOCPU'), { reset: 0, mask: pins, write: () => this.update(p) });
      mcu.register(at('IOCPD'), { reset: 0, mask: pins, write: () => this.update(p) });
    });
    mcu.register(PADCON, { reset: 0, mask: 0x8001 });
    mcu.register(IOCSTAT, { reset: 0, mask: 0 });
    mcu.attach(this);
  }

  reg(p, r) { return this.mcu.get(BASE + PORTS.indexOf(p) * STRIDE + OFF[r]); }
  setReg(p, r, v) { this.mcu.set(BASE + PORTS.indexOf(p) * STRIDE + OFF[r], v); }

  /** A pin's port and bit ('RD6': D, 6), or null when the device has no such pin. */
  static parse(name) {
    const m = /^R([A-G])(\d{1,2})$/.exec(String(name).toUpperCase());
    if (!m || +m[2] > 15 || !((PINS[m[1]] >> +m[2]) & 1)) return null;
    return { port: m[1], bit: +m[2] };
  }
  /** The device's pins, RA0 to RG15. */
  get names() { return PORTS.split('').flatMap((p) => [...Array(16).keys()].filter((b) => (PINS[p] >> b) & 1).map((b) => `R${p}${b}`)); }

  pin(name) {
    const p = Ports.parse(name);
    if (!p) throw new Error(`the PIC24FJ1024GB610 has no pin '${name}'`);
    return p;
  }

  /** What the device drives on a pin: 0, 1, or null (an input, an open drain's 1). */
  driven(name) {
    if (this.jtag[name]) return null;
    const o = this.overrides.get(name);
    if (o) return o.value;
    const { port, bit } = this.pin(name), m = 1 << bit;
    if (this.reg(port, 'TRIS') & m) return null;
    const lat = (this.reg(port, 'LAT') & m) !== 0;
    if (lat && this.reg(port, 'ODC') & m) return null;
    return lat ? 1 : 0;
  }

  /** A pin's level: driven, else from outside, else its pull-up (1) or pull-down (0), else null (floating). */
  level(name) {
    const d = this.driven(name);
    if (d != null) return d;
    const x = this.inputs.get(name);
    if (x != null) return x;
    const { port, bit } = this.pin(name), m = 1 << bit;
    if (this.reg(port, 'IOCPU') & m) return 1;
    if (this.reg(port, 'IOCPD') & m) return 0;
    return null;
  }

  // PORT: the pins' levels (an analog pin's, a floating pin's 0)
  readPort(p) {
    let v = 0;
    const ans = p === 'F' ? 0 : this.reg(p, 'ANS') & ANALOG[p];
    for (let b = 0; b < 16; b++) if ((PINS[p] >> b) & 1 && !((ans >> b) & 1) && this.level(`R${p}${b}`) === 1) v |= 1 << b;
    return v;
  }

  // a write to PORT writes LAT (its bytes)
  writeLat(p, v, bytes) {
    const lat = this.reg(p, 'LAT');
    this.setReg(p, 'LAT', ((lat & ~bytes) | (v & bytes)) & PINS[p]);
    this.update(p);
  }

  // IOCF: only cleared by the program; its port's flag in IOCSTAT while one is set
  writeFlags(p, v, old) {
    this.setReg(p, 'IOCF', old & v);
    this.updateStatus(p);
  }
  updateStatus(p) {
    const k = PORTS.indexOf(p), s = this.mcu.get(IOCSTAT);
    this.mcu.set(IOCSTAT, this.reg(p, 'IOCF') ? s | (1 << k) : s & ~(1 << k));
  }

  /** A pin driven from outside (0, 1, or null: released). */
  setInput(name, value) {
    this.pin(name);
    this.inputs.set(name, value == null ? null : Number(value) ? 1 : 0);
    this.update(Ports.parse(name).port);
  }

  /** A peripheral drives a pin (value 0 or 1), or leaves it (value undefined): its owner's name, for the messages. */
  override(name, owner, value) {
    this.pin(name);
    if (value === undefined) this.overrides.delete(name); else this.overrides.set(name, { owner, value: value ? 1 : 0 });
    this.update(Ports.parse(name).port);
  }

  onChange(fn) { this.listeners.push(fn); }
  onLevel(fn) { this.levelListeners.push(fn); }

  // a port's pins seen again: their outputs' changes said, the IOC's edges flagged
  update(p) {
    const ioc = (this.mcu.get(PADCON) & 0x8000) !== 0;
    for (let b = 0; b < 16; b++) {
      if (!((PINS[p] >> b) & 1)) continue;
      const name = `R${p}${b}`, d = this.driven(name), lv = this.level(name), was = this.last.get(name);
      if (this.jtag[name] && !(this.reg(p, 'TRIS') & (1 << b))) {
        this.mcu.cpu.say('warning', `${name} is the JTAG port's ${this.jtag[name]} while FICD's JTAGEN is on (an erased FICD): the program's output on it does not reach the pin (#pragma config JTAGEN = OFF)`, `jtag ${name}`);
      }
      if (!was || was.driven !== d) for (const fn of this.listeners) fn(name, d);
      if (was && was.level !== lv) for (const fn of this.levelListeners) fn(name, lv);
      if (was && ioc && was.level != null && lv != null && was.level !== lv) {
        const m = 1 << b, en = lv ? this.reg(p, 'IOCP') : this.reg(p, 'IOCN');
        if (en & m) {
          this.setReg(p, 'IOCF', this.reg(p, 'IOCF') | m);
          this.updateStatus(p);
          this.mcu.cpu.raise(IOC_IRQ);
        }
      }
      this.last.set(name, { driven: d, level: lv });
    }
  }

  reset() {
    this.overrides.clear();
    for (const p of PORTS) this.update(p);
  }
}
