// silinx-pic24 - the I²C modules, I2C1 to I2C3 (#5481, DS30010074 section 18), in master mode: I2CxCON1 (I2CEN; the
// events SEN, RSEN, PEN, RCEN, ACKEN with ACKDT), I2CxSTAT (ACKSTAT, TRSTAT, BCL, P, S, R_W, RBF, TBF), I2CxTRN, I2CxRCV,
// I2CxBRG (Fscl = Fcy / (I2CxBRG + 2)); each event's time (a start, a stop, an acknowledge a bit's; a byte nine bits),
// its end clearing its bit and raising the master interrupt (MI2C1 IRQ 17, MI2C2 50, MI2C3 71). The devices on the
// bus (i2c.attach(address, device)) answer by their 7-bit address: start(read), write(byte) -> acknowledged,
// read() -> byte, stop(); a byte to an address nobody answers is not acknowledged (ACKSTAT 1).
//
// Not modelled: the slave mode (I2CxADD, I2CxMSK, the slave interrupt), the 10-bit addresses, the bus collisions (BCL
// never set) and other masters, clock stretching, I2COV, the SDA and SCL waveforms on the pins (an event is one transaction),
// SMBus levels.

const I2CS = [
  { n: 1, base: 0x0494, irq: 17 },
  { n: 2, base: 0x04a4, irq: 50 },
  { n: 3, base: 0x04b4, irq: 71 },
];
const RCV = 0x0, TRN = 0x2, BRG = 0x4, CON1 = 0x6, CON2 = 0x8, STAT = 0xa, ADD = 0xc, MSK = 0xe;
const I2CEN = 0x8000, SEN = 0x01, RSEN = 0x02, PEN = 0x04, RCEN = 0x08, ACKEN = 0x10, ACKDT = 0x20;
const ACKSTAT = 0x8000, TRSTAT = 0x4000, P = 0x0010, S = 0x0008, RW = 0x0004, RBF = 0x0002, TBF = 0x0001;

class I2c {
  constructor(mcu, { n, base, irq }) {
    Object.assign(this, { mcu, n, base, irq });
    this.devices = new Map();   // 7-bit address -> device
    this.target = null;         // the device addressed, and whether it reads
    this.event = null;
    mcu.register(base + RCV, { reset: 0, mask: 0, read: () => { this.setStat(this.stat & ~RBF); return this.mcu.get(base + RCV); } });
    mcu.register(base + TRN, { reset: 0x00ff, mask: 0x00ff, write: (v) => this.transmit(v) });
    mcu.register(base + BRG, { reset: 0 });
    mcu.register(base + CON1, { reset: 0x1000, mask: 0xbfff, write: (v, old) => this.control(v, old) });
    mcu.register(base + CON2, { reset: 0 });
    mcu.register(base + STAT, { reset: 0, mask: 0 });
    mcu.register(base + ADD, { reset: 0 });
    mcu.register(base + MSK, { reset: 0 });
    mcu.attach(this);
  }

  get con() { return this.mcu.get(this.base + CON1); }
  get stat() { return this.mcu.get(this.base + STAT); }
  setStat(v) { this.mcu.set(this.base + STAT, v); }
  get name() { return `I2C${this.n}`; }
  /** Fscl: Fcy / (I2CxBRG + 2). */
  get fscl() { return this.mcu.fpb / (this.mcu.get(this.base + BRG) + 2); }

  /** A device answering at its 7-bit address: start(read), write(byte) -> true (acknowledged), read() -> byte, stop(). */
  attach(address, device) { this.devices.set(address & 0x7f, device); }

  // an event's end after `bits` bit times: its bit cleared (CON1's), the master interrupt
  after(bits, fn) {
    this.mcu.cancel(this.event);
    this.event = this.mcu.schedule(this.mcu.time + bits / this.fscl * 1e12, () => { this.event = null; fn(); this.mcu.cpu.raise(this.irq); });
  }
  clear(bit) { this.mcu.set(this.base + CON1, this.con & ~bit); }

  control(v, old) {
    if (!(v & I2CEN)) { this.mcu.cancel(this.event); this.event = null; return; }
    const set = v & ~old;
    if (set & SEN) this.after(1, () => { this.clear(SEN); this.setStat((this.stat | S) & ~P); this.target = null; this.first = true; });
    else if (set & RSEN) this.after(1, () => { this.clear(RSEN); this.target?.dev.stop?.(); this.target = null; this.first = true; });
    else if (set & PEN) this.after(1, () => { this.clear(PEN); this.target?.dev.stop?.(); this.target = null; this.setStat((this.stat | P) & ~S); });
    else if (set & RCEN) this.after(9, () => {
      this.clear(RCEN);
      const b = this.target?.read ? this.target.dev.read?.() ?? 0xff : 0xff;
      this.mcu.set(this.base + RCV, b & 0xff);
      this.setStat(this.stat | RBF);
    });
    else if (set & ACKEN) this.after(1, () => { this.clear(ACKEN); this.target?.dev.ack?.(!(this.con & ACKDT)); });
  }

  // I2CxTRN written: TBF and TRSTAT while its 8 bits and the acknowledge shift; the first byte after a start the address
  transmit(v) {
    if (!(this.con & I2CEN)) return;
    if (this.stat & TBF) { this.mcu.cpu.say('warning', `${this.name}: I2CxTRN written while a byte is shifting (TBF): ignored`, `${this.name}-tbf`); return; }
    this.setStat(this.stat | TBF | TRSTAT);
    this.after(9, () => {
      let ack = false;
      if (this.first) {
        this.first = false;
        const dev = this.devices.get((v >> 1) & 0x7f), read = (v & 1) === 1;
        if (dev) { this.target = { dev, read }; dev.start?.(read); ack = true; }
        this.setStat((this.stat & ~RW) | (read ? RW : 0));
      } else if (this.target && !this.target.read) ack = !!this.target.dev.write?.(v & 0xff);
      this.setStat((this.stat & ~(TBF | TRSTAT | ACKSTAT)) | (ack ? 0 : ACKSTAT));
    });
  }

  reset() { this.mcu.cancel(this.event); this.event = null; this.target = null; }
}

/** The three I²C modules. */
export function createI2cs(mcu) { return I2CS.map((s) => new I2c(mcu, s)); }
