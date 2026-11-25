// silinx-pic24 - the SPI modules, SPI1 to SPI3 (#5481, DS30010074 section 16), in master mode: SPIxCON1L (SPIEN,
// MODE32 / MODE16: 8, 16 or 32 bits, MSTEN, CKP, CKE, ENHBUF), SPIxBRGL (Fsck = Fpb / (2 · (BRG + 1))), SPIxBUF, SPIxSTATL
// (SPIRBF, SPITBF, SPITBE, SPIRBE, SPIROV, SPIBUSY), a word written to the buffer shifted out at the clock's rate and
// the word shifted in at its end; the receive (SPI1 IRQ 58, SPI2 59, SPI3 60), transmit (10, 33, 91) and general (9,
// 32, 90, with SPIxIMSK1's SPIRBFEN and SPITBEN) interrupts. A device on the bus (the Explorer 16/32's 25LC256,
// spi.onTransfer) answers each word with its reply: the program's PPS mapping and the device's chip select decide
// whether it hears it.
//
// Not modelled: the slave mode, the framed and audio modes, the enhanced buffer's FIFOs beyond one word (ENHBUF's
// 8 deep: one word at a time), the clock's and the data's waveforms on the pins (a word is one transaction),
// SPIxURDT, the sign extension.

const SPIS = [
  { n: 1, base: 0x03f4, rx: 58, tx: 10, gen: 9 },
  { n: 2, base: 0x0410, rx: 59, tx: 33, gen: 32 },
  { n: 3, base: 0x042c, rx: 60, tx: 91, gen: 90 },
];
const CON1L = 0x0, CON1H = 0x2, CON2L = 0x4, STATL = 0x8, STATH = 0xa, BUFL = 0xc, BUFH = 0xe, BRGL = 0x10, IMSK1 = 0x14, IMSK2 = 0x16;
const SPIEN = 0x8000, MSTEN = 0x0020, SPIRBF = 0x0001, SPITBF = 0x0002, SPITBE = 0x0008, SPIRBE = 0x0020, SPIROV = 0x0040, SPIBUSY = 0x0800;

class Spi {
  constructor(mcu, { n, base, rx, tx, gen }) {
    Object.assign(this, { mcu, n, base, irq: { rx, tx, gen } });
    this.devices = [];      // fn(word, bits) -> reply, or undefined (not selected)
    this.rxWord = 0;
    this.busy = null;
    mcu.register(base + CON1L, { reset: 0, mask: 0xbf7f, write: (v, old) => { if (!(v & SPIEN) && old & SPIEN) this.stop(); } });
    mcu.register(base + CON1H, { reset: 0 });
    mcu.register(base + CON2L, { reset: 0, mask: 0x001f });
    mcu.register(base + STATL, { reset: SPITBE | SPIRBE, mask: SPIROV, read: () => this.status() });
    mcu.register(base + STATH, { reset: 0, mask: 0 });
    mcu.register(base + BUFL, { reset: 0, read: () => this.read(0), write: (v) => this.write(v, 0) });
    mcu.register(base + BUFH, { reset: 0, read: () => this.read(1), write: (v) => this.write(v, 1) });
    mcu.register(base + BRGL, { reset: 0, mask: 0x1fff });
    mcu.register(base + IMSK1, { reset: 0 });
    mcu.register(base + IMSK2, { reset: 0 });
    mcu.attach(this);
  }

  get con() { return this.mcu.get(this.base + CON1L); }
  get bits() { const m = (this.con >> 10) & 3; return m >= 2 ? 32 : m ? 16 : 8; }
  /** The clock's frequency: Fpb / (2 · (SPIxBRGL + 1)). */
  get sck() { return this.mcu.fpb / (2 * (this.mcu.get(this.base + BRGL) + 1)); }
  get name() { return `SPI${this.n}`; }

  /** A device on the bus: fn(word, bits) -> its reply, or undefined when it does not hear the word. */
  onTransfer(fn) { this.devices.push(fn); }

  status() {
    let s = this.mcu.get(this.base + STATL) & SPIROV;
    if (this.full) s |= SPIRBF; else s |= SPIRBE;
    if (this.busy) s |= SPITBF | SPIBUSY; else s |= SPITBE;
    return s;
  }

  // a word to the buffer (its 32 bits in BUFH:BUFL: the write of BUFL starts an 8- or 16-bit word, of BUFH a 32-bit
  // one): shifted out over its bits' time, the reply in at the end
  write(v, half) {
    if (!(this.con & SPIEN) || !(this.con & MSTEN)) return;
    if (this.bits === 32 && half === 0) { this.lowHalf = v; return; }
    if (this.busy) { this.mcu.cpu.say('warning', `${this.name}: SPIxBUF written while a word is shifting (SPITBF): the word is lost`, `${this.name}-tbf`); return; }
    const bits = this.bits, word = bits === 32 ? ((v << 16) | (this.lowHalf ?? 0)) >>> 0 : v & (bits === 16 ? 0xffff : 0xff);
    const end = this.mcu.time + bits / this.sck * 1e12;
    this.busy = this.mcu.schedule(end, () => this.done(word, bits));
  }

  done(word, bits) {
    this.busy = null;
    let reply;
    for (const fn of this.devices) { const r = fn(word, bits); if (r !== undefined) reply = r; }
    // (no device: the SDI pin floating, read as ones)
    const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
    if (this.full) this.mcu.set(this.base + STATL, this.mcu.get(this.base + STATL) | SPIROV);
    else { this.rxWord = (reply ?? mask) >>> 0; this.full = true; }
    const cpu = this.mcu.cpu, imsk = this.mcu.get(this.base + IMSK1);
    cpu.raise(this.irq.rx);
    cpu.raise(this.irq.tx);
    if (imsk & 0x0009) cpu.raise(this.irq.gen);
  }

  // SPIxBUF read: the word received (BUFL its low half; a 32-bit word's read ends at BUFH)
  read(half) {
    const v = half ? this.rxWord >>> 16 : this.rxWord & 0xffff;
    if (this.bits !== 32 || half) this.full = false;
    return v;
  }

  stop() { this.mcu.cancel(this.busy); this.busy = null; this.full = false; }
  reset() { this.stop(); this.lowHalf = 0; }
}

/** The three SPI modules. */
export function createSpis(mcu) { return SPIS.map((s) => new Spi(mcu, s)); }
