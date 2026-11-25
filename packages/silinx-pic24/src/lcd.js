// silinx-pic24 - an HD44780-compatible character LCD, 16x2 (#5481): the Explorer 16/32's, on the PMP (pmp.js). Its
// instruction register (RS 0) and its data register (RS 1): clear, home, entry mode (I/D, S), display control (D, C, B),
// cursor or display shift, function set (DL 8 or 4 bits, N lines, F font), the CGRAM's and the DDRAM's addresses;
// the busy flag and the address counter read back; each instruction's time (37 µs, clear and home 1.52 ms at its
// 270 kHz), a write while it is busy ignored and said; the 4-bit mode's two nibbles (D7-D4, the high one first).
// What it shows: lines(), its two rows of 16 characters from the DDRAM through the display's shift.
//
// Not modelled: the power-on's 15 ms before it accepts instructions (it is ready at once), the 5x10 font's display,
// the character ROM's codes above 0x7F (shown as '?'), the contrast.

const BUSY_PS = 37e6, CLEAR_PS = 1520e6, COLS = 16;

export class CharacterLcd {
  /** now(): the time (ps); say(text): a warning. */
  constructor({ now, say }) {
    Object.assign(this, { now, say });
    this.reset();
  }

  reset() {
    this.ddram = new Array(0x80).fill(0x20);
    this.cgram = new Array(64).fill(0);
    this.ac = 0;
    this.cg = false;          // the address counter on the CGRAM
    this.inc = true;          // I/D
    this.shiftOnWrite = false;
    this.on = false;
    this.cursor = false;
    this.blink = false;
    this.shift = 0;           // the display's shift
    this.eightBit = true;
    this.twoLines = false;
    this.nibble = null;       // the 4-bit mode's high nibble, waiting for its low one
    this.busyUntil = 0;
    this.listeners = [];
  }

  onChange(fn) { this.listeners.push(fn); }
  changed() { for (const fn of this.listeners) fn(this.lines()); }
  get busy() { return this.now() < this.busyUntil; }

  /** A bus write: RS (0 an instruction, 1 data), the data lines' byte (D7-D0; in 4-bit mode D7-D4 carry a nibble). */
  write(rs, value) {
    let v = value & 0xff;
    if (!this.eightBit) {
      if (this.nibble == null) { this.nibble = v & 0xf0; return; }
      v = this.nibble | ((v >> 4) & 0x0f);
      this.nibble = null;
    }
    if (this.busy) { this.say?.('the LCD was written while busy (its busy flag set): the write is ignored'); return; }
    if (rs) this.data(v); else this.instruction(v);
    this.changed();
  }

  /** A bus read: RS 0 the busy flag and the address counter, RS 1 the data at the address counter (it moves). */
  read(rs) {
    if (!this.eightBit) {
      // (two reads, the high nibble then the low one, on D7-D4)
      const whole = this.readByte(rs, this.nibble == null);
      if (this.nibble == null) { this.nibble = -1; return whole & 0xf0; }
      this.nibble = null;
      return (whole << 4) & 0xf0;
    }
    return this.readByte(rs, true);
  }
  readByte(rs, first) {
    if (!rs) return (this.busy ? 0x80 : 0) | (this.ac & 0x7f);
    const v = this.cg ? this.cgram[this.ac & 63] : this.ddram[this.ac & 0x7f];
    if (first || this.eightBit) this.move();
    return v;
  }

  instruction(v) {
    let time = BUSY_PS;
    if (v & 0x80) { this.cg = false; this.ac = v & 0x7f; }
    else if (v & 0x40) { this.cg = true; this.ac = v & 0x3f; }
    else if (v & 0x20) { this.eightBit = (v & 0x10) !== 0; this.twoLines = (v & 0x08) !== 0; }
    else if (v & 0x10) {
      const right = (v & 0x04) !== 0;
      if (v & 0x08) this.shift = (this.shift + (right ? -1 : 1) + 40) % 40;
      else this.ac = this.step(this.ac, right);
    } else if (v & 0x08) { this.on = (v & 4) !== 0; this.cursor = (v & 2) !== 0; this.blink = (v & 1) !== 0; }
    else if (v & 0x04) { this.inc = (v & 2) !== 0; this.shiftOnWrite = (v & 1) !== 0; }
    else if (v & 0x02) { this.ac = 0; this.cg = false; this.shift = 0; time = CLEAR_PS; }
    else if (v & 0x01) { this.ddram.fill(0x20); this.ac = 0; this.cg = false; this.shift = 0; this.inc = true; time = CLEAR_PS; }
    this.busyUntil = this.now() + time;
  }

  data(v) {
    if (this.cg) this.cgram[this.ac & 63] = v & 0x1f;
    else this.ddram[this.ac & 0x7f] = v;
    this.move();
    if (this.shiftOnWrite && !this.cg) this.shift = (this.shift + (this.inc ? 1 : -1) + 40) % 40;
    this.busyUntil = this.now() + BUSY_PS;
  }

  // the address counter's next: the DDRAM's two lines (0x00-0x27, 0x40-0x67) or one (0x00-0x4F), the CGRAM's 64
  move() { this.ac = this.cg ? (this.ac + (this.inc ? 1 : -1)) & 63 : this.step(this.ac, this.inc); }
  step(a, up) {
    if (!this.twoLines) return ((a + (up ? 1 : -1)) % 80 + 80) % 80;
    const line = a & 0x40, col = ((a & 0x3f) + (up ? 1 : -1) + 40) % 40;
    const wrapped = up ? (a & 0x3f) === 39 : (a & 0x3f) === 0;
    return wrapped ? (line ^ 0x40) | col : line | col;
  }

  /** The two rows shown (16 characters each; blank while the display is off). */
  lines() {
    if (!this.on) return [' '.repeat(COLS), ' '.repeat(COLS)];
    const row = (base, len) => Array.from({ length: COLS }, (_, i) => {
      const c = this.ddram[base + ((this.shift + i) % len)];
      return c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : c < 8 ? String.fromCharCode(0x2400 + c) : '?';
    }).join('');
    return this.twoLines ? [row(0x00, 40), row(0x40, 40)] : [row(0x00, 80), ' '.repeat(COLS)];
  }
}
