// silinx-pic24 - a 25LC256 serial EEPROM (#5481): the Explorer 16/32's, on SPI. 32 Kbytes, its instructions READ (03h),
// WRITE (02h, a 64-byte page), WRDI (04h), WREN (06h), RDSR (05h: WIP, WEL, BP1, BP0, WPEN), WRSR (01h); its 16-bit
// address; a write cycle of 5 ms (WIP set) begun when CS rises, WEL then cleared; an instruction a selection (CS low).
// Its bytes are its own (erased 0xFF), kept across the device's resets.
//
// Not modelled: the block protection's effect (BP, WPEN stored only), the WP and HOLD pins.

const SIZE = 0x8000, PAGE = 64, WRITE_PS = 5e9;

export class Eeprom25lc256 {
  constructor({ now }) {
    this.now = now;
    this.mem = new Uint8Array(SIZE).fill(0xff);
    this.status = 0;           // WEL (bit 1), BP (3-2), WPEN (7)
    this.busyUntil = 0;
    this.end();
  }

  get wip() { return this.now() < this.busyUntil; }

  /** CS low: a new instruction. */
  select() { this.cmd = null; this.bytes = []; this.addr = 0; this.page = []; }

  /** A byte from the master (its SI): the byte back (its SO). */
  transfer(b) {
    if (this.cmd == null) {
      this.cmd = b;
      if (b === 0x06 && !this.wip) this.status |= 2;
      if (b === 0x04 && !this.wip) this.status &= ~2;
      return 0xff;
    }
    switch (this.cmd) {
      case 0x05: return (this.status & 0x8e) | (this.wip ? 1 : 0);
      case 0x01: if (!this.wip && this.status & 2) this.newStatus = b & 0x8c; return 0xff;
      case 0x03: {
        if (this.bytes.length < 2) { this.bytes.push(b); if (this.bytes.length === 2) this.addr = ((this.bytes[0] << 8) | this.bytes[1]) & (SIZE - 1); return 0xff; }
        if (this.wip) return 0xff;
        const v = this.mem[this.addr];
        this.addr = (this.addr + 1) & (SIZE - 1);
        return v;
      }
      case 0x02: {
        if (this.bytes.length < 2) { this.bytes.push(b); if (this.bytes.length === 2) this.addr = ((this.bytes[0] << 8) | this.bytes[1]) & (SIZE - 1); return 0xff; }
        this.page.push(b);
        return 0xff;
      }
      default: return 0xff;
    }
  }

  /** CS high: a WRITE's page (wrapping within its 64 bytes) or a WRSR written, its 5 ms cycle begun. */
  end() {
    if (this.cmd === 0x02 && this.page?.length && !this.wip && this.status & 2) {
      const base = this.addr & ~(PAGE - 1);
      this.page.forEach((b, i) => { this.mem[base + ((this.addr + i) % PAGE)] = b; });
      this.busyUntil = this.now() + WRITE_PS;
      this.status &= ~2;
    } else if (this.cmd === 0x01 && this.newStatus != null) {
      this.status = (this.status & 2) | this.newStatus;
      this.busyUntil = this.now() + WRITE_PS;
      this.status &= ~2;
    }
    this.cmd = null;
    this.newStatus = null;
    this.page = [];
  }
}
