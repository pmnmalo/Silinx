// silinx-pic24 - the UARTs, UART1 to UART6 (#5481, DS30010074 section 19): UxMODE (UARTEN, LPBACK, BRGH, PDSEL,
// STSEL), UxSTA (UTXISEL, URXEN, UTXEN, UTXBF, TRMT, URXISEL, RIDLE, PERR, FERR, OERR, URXDA), the 4-deep transmit and
// receive buffers, the baud from UxBRG (Fcy / (16 · (UxBRG + 1)), or / 4 with BRGH), each character's frame time
// (start, 8 or 9 bits, parity, 1 or 2 stops), the receive, transmit and error interrupts as URXISEL and UTXISEL choose
// them. A character leaves through onTransmit(byte, t) at its frame's end and, through PPS (pps.js), as its bits on
// the UxTX pin; one arrives from outside by receive(byte) (a terminal's), or as its bits on the UxRX pin.
//
// Not modelled: IrDA (IREN), the flow control pins (UxCTS, UxRTS, UEN), auto-baud (ABAUD), the break (UTXBRK), the
// address detect (ADDEN, UxADMD), the polarity inversions (URXINV, UTXINV) on the pins.

const UARTS = [
  { n: 1, base: 0x0398, rx: 11, tx: 12, err: 65 },
  { n: 2, base: 0x03ae, rx: 30, tx: 31, err: 66 },
  { n: 3, base: 0x03c4, rx: 82, tx: 83, err: 81 },
  { n: 4, base: 0x03d0, rx: 88, tx: 89, err: 87 },
  { n: 5, base: 0x03dc, rx: 111, tx: 112, err: 113 },
  { n: 6, base: 0x03e8, rx: 114, tx: 115, err: 116 },
];
const MODE = 0, STA = 2, TXREG = 4, RXREG = 6, BRG = 8, ADMD = 10;
const UARTEN = 0x8000, LPBACK = 0x0040, BRGH = 0x0008;
const URXEN = 0x1000, UTXEN = 0x0400, UTXBF = 0x0200, TRMT = 0x0100, RIDLE = 0x0010, PERR = 0x0008, FERR = 0x0004, OERR = 0x0002, URXDA = 0x0001;

class Uart {
  constructor(mcu, { n, base, rx, tx, err }) {
    Object.assign(this, { mcu, n, base, irq: { rx, tx, err } });
    this.txq = [];
    this.rxq = [];
    this.shifting = null;       // the character in the shift register: { v, end }
    this.listeners = [];        // fn(byte, t): a character sent
    this.bitListeners = [];     // fn(level, t): the TX line's bits (pps.js puts them on a pin)
    mcu.register(base + MODE, { reset: 0, mask: 0xbbff, write: (v, old) => this.writeMode(v, old) });
    mcu.register(base + STA, { reset: TRMT | RIDLE, mask: 0xfce2, read: () => this.status(), write: (v, old) => this.writeSta(v, old) });
    mcu.register(base + TXREG, { reset: 0, mask: 0x01ff, write: (v) => this.write(v) });
    mcu.register(base + RXREG, { reset: 0, mask: 0, read: () => this.read() });
    mcu.register(base + BRG, { reset: 0 });
    mcu.register(base + ADMD, { reset: 0 });
    mcu.attach(this);
  }

  get mode() { return this.mcu.get(this.base + MODE); }
  get sta() { return this.mcu.get(this.base + STA); }
  setSta(v) { this.mcu.set(this.base + STA, v); }
  get enabled() { return (this.mode & UARTEN) !== 0; }
  get name() { return `UART${this.n}`; }

  /** Its baud: Fcy / (16 · (UxBRG + 1)), with BRGH / 4. */
  get baud() { return this.mcu.fpb / ((this.mode & BRGH ? 4 : 16) * (this.mcu.get(this.base + BRG) + 1)); }
  // a frame's bits: the start, 8 (or 9) data, the parity (PDSEL 01, 10), 1 or 2 stops
  get frameBits() { const pd = (this.mode >> 1) & 3; return 1 + (pd === 3 ? 9 : 8) + (pd === 1 || pd === 2 ? 1 : 0) + (this.mode & 1 ? 2 : 1); }
  get bitPs() { return 1e12 / this.baud; }

  /** A character sent: fn(byte, t). */
  onTransmit(fn) { this.listeners.push(fn); }
  /** The TX line's levels: fn(level, t) at each bit (undefined: the line no longer the UART's). */
  onTxBits(fn) { this.bitListeners.push(fn); }

  writeMode(v, old) {
    if (!(v & UARTEN) && old & UARTEN) this.clear();
    this.line();
  }
  writeSta(v, old) {
    // OERR only cleared; UTXEN set: the transmit buffer empty, its interrupt
    if (old & OERR && !(v & OERR)) this.rxq.length = 0;
    this.setSta((v & ~OERR) | (old & v & OERR));
    if (v & UTXEN && !(old & UTXEN) && this.enabled) this.mcu.cpu.raise(this.irq.tx);
    if (!(v & UTXEN) && old & UTXEN) { this.txq.length = 0; this.mcu.cancel(this.shifting?.event); this.shifting = null; }
    this.line();
  }

  // the TX line: idle (1) while UARTEN and UTXEN, else the port's again (undefined)
  line() {
    const on = this.enabled && (this.sta & UTXEN) !== 0;
    if (on === this.lineOn) return;
    this.lineOn = on;
    for (const fn of this.bitListeners) fn(on ? 1 : undefined, this.mcu.time);
  }

  /** The RX line's level changed (the UxRX pin's, through PPS): a start bit (a fall, idle) starts a frame, sampled at
   *  each bit's middle; its stop bit 0 a framing error. rxLevel() reads the line. */
  rxEdge(level) {
    if (level !== 0 || this.rxBusy || !this.enabled || !(this.sta & URXEN) || !this.rxLevel) return;
    this.rxBusy = true;
    this.setSta(this.sta & ~RIDLE);
    const t0 = this.mcu.time, bit = this.bitPs, pd = (this.mode >> 1) & 3, data = pd === 3 ? 9 : 8, par = pd === 1 || pd === 2;
    let v = 0, ones = 0;
    const at = (k, fn) => this.mcu.schedule(t0 + (k + 0.5) * bit, fn);
    at(0, () => { if (this.rxLevel()) { this.rxBusy = false; this.setSta(this.sta | RIDLE); } });   // (a glitch)
    for (let i = 0; i < data; i++) at(i + 1, () => { const b = this.rxLevel() ? 1 : 0; v |= b << i; ones += b; });
    if (par) at(data + 1, () => { ones += this.rxLevel() ? 1 : 0; });
    at(data + 1 + (par ? 1 : 0), () => {
      if (!this.rxBusy) return;
      this.rxBusy = false;
      this.setSta(this.sta | RIDLE);
      if (par && ones % 2 !== (pd === 2 ? 1 : 0)) this.setSta(this.sta | PERR);
      this.receive(v, { framingError: !this.rxLevel() });
    });
  }

  // UxSTA's read-only bits from the buffers
  status() {
    let s = this.sta & ~(UTXBF | TRMT | URXDA);
    if (this.txq.length >= 4) s |= UTXBF;
    if (!this.shifting && !this.txq.length) s |= TRMT;
    if (this.rxq.length) s |= URXDA;
    return s;
  }

  clear() { this.txq.length = 0; this.rxq.length = 0; this.mcu.cancel(this.shifting?.event); this.shifting = null; this.setSta(this.sta & ~(OERR | FERR | PERR)); }

  // a character to UxTXREG: to the buffer (a full one's lost, said), its frame started when the line is idle
  write(v) {
    if (!this.enabled || !(this.sta & UTXEN)) return;
    if (this.txq.length >= 4) { this.mcu.cpu.say('warning', `${this.name}: UxTXREG written with its buffer full (UTXBF): the character is lost`, `${this.name}-txfull`); return; }
    this.txq.push(v & (((this.mode >> 1) & 3) === 3 ? 0x1ff : 0xff));
    if (!this.shifting) this.shift();
  }

  // the next character from the buffer into the shift register: its bits on the line, its end scheduled
  shift() {
    const v = this.txq.shift(), t0 = this.mcu.time, bit = this.bitPs, pd = (this.mode >> 1) & 3;
    const data = pd === 3 ? 9 : 8, bits = [0];
    for (let i = 0; i < data; i++) bits.push((v >> i) & 1);
    if (pd === 1 || pd === 2) bits.push((bits.slice(1).reduce((a, b) => a ^ b, 0)) ^ (pd === 2 ? 1 : 0));
    bits.push(1);
    if (this.mode & 1) bits.push(1);
    bits.forEach((b, i) => { for (const fn of this.bitListeners) fn(b, t0 + i * bit); });
    const end = t0 + bits.length * bit;
    // the TX interrupt: UTXISEL 00 a character into the shift register, 10 the buffer emptied by it, 01 its last
    // character out (below)
    const sel = ((this.sta >> 14) & 2) | ((this.sta >> 13) & 1);
    if (sel === 0 || (sel === 2 && !this.txq.length)) this.mcu.cpu.raise(this.irq.tx);
    this.shifting = { v, end, event: this.mcu.schedule(end, () => this.sent(v, end)) };
  }

  sent(v, t) {
    this.shifting = null;
    for (const fn of this.listeners) fn(v, t);
    if (this.mode & LPBACK) this.receive(v);
    if (this.txq.length) this.shift();
    else if ((((this.sta >> 14) & 2) | ((this.sta >> 13) & 1)) === 1) this.mcu.cpu.raise(this.irq.tx);
  }

  /** A character received (its frame ended now): to the receive buffer, or lost when it is full (OERR). */
  receive(v, { framingError = false } = {}) {
    if (!this.enabled || !(this.sta & URXEN)) return false;
    if (this.sta & OERR) return false;
    if (this.rxq.length >= 4) {
      this.setSta(this.sta | OERR);
      this.mcu.cpu.raise(this.irq.err);
      return false;
    }
    this.rxq.push({ v: v & 0x1ff, ferr: framingError });
    // URXISEL 0x: a character; 10: 3 in the buffer; 11: 4
    const sel = (this.sta >> 6) & 3, n = this.rxq.length;
    if (sel < 2 || (sel === 2 && n === 3) || (sel === 3 && n === 4)) this.mcu.cpu.raise(this.irq.rx);
    if (framingError) this.mcu.cpu.raise(this.irq.err);
    this.flags();
    return true;
  }

  // UxRXREG: the oldest character (FERR its own)
  read() {
    const c = this.rxq.shift();
    this.flags();
    return c ? c.v : this.mcu.get(this.base + RXREG);
  }
  flags() { const top = this.rxq[0]; this.setSta((this.sta & ~FERR) | (top?.ferr ? FERR : 0)); }

  reset() { this.txq.length = 0; this.rxq.length = 0; this.shifting = null; this.rxBusy = false; this.line(); }
}

/** The six UARTs. */
export function createUarts(mcu) { return UARTS.map((u) => new Uart(mcu, u)); }
