// silinx-pic24 - the enhanced parallel master port, EPMP (#5481, DS30010074 section 21), in its master mode (PMCON1's
// MODE 11): the CPU's reads and writes of the EDS above the RAM (DSRPAG / DSWPAG 2 and up) become bus cycles on its
// chip selects' regions (PMCS1BS, PMCS2BS, PMCON2's RADDR the end), their offsets on PMA, a byte on PMD[7:0] (an
// 8-bit port, PMCSxCF's PTSZ; a word two cycles), the interrupt (IRQ 45) at a cycle's end with IRQM 01. A device on
// the bus (the Explorer 16/32's LCD, pmp.attach) answers its cycles: write(address, byte), read(address).
//
// Not modelled: the strobes' and address latches' waveforms on the pins (PMRD, PMWR, PMENB, PMALL…: a cycle is one
// transaction), the wait states' timing (DWAITB, DWAITM, DWAITE, AWAITM: a cycle takes no time), PMACK, the 4- and
// 16-bit ports, the multiplexed address modes (ADRMUX), the slave modes (PSP) and PMSTAT, PMDOUT / PMDIN.

const PMCON1 = 0x0128, PMCON2 = 0x012a, PMCON3 = 0x012c, PMCON4 = 0x012e;
const CS = [{ CF: 0x0130, BS: 0x0132, MD: 0x0134 }, { CF: 0x0136, BS: 0x0138, MD: 0x013a }];
const PMDOUT1 = 0x013c, PMDOUT2 = 0x013e, PMDIN1 = 0x0140, PMDIN2 = 0x0142, PMSTAT = 0x0144, IRQ = 45;

export class Pmp {
  constructor(mcu) {
    this.mcu = mcu;
    this.devices = [];   // { cs (1, 2), write, read }
    mcu.register(PMCON1, { reset: 0, mask: 0xbbf7 });
    mcu.register(PMCON2, { reset: 0, mask: 0x00ff });
    mcu.register(PMCON3, { reset: 0, mask: 0xf7ff });
    mcu.register(PMCON4, { reset: 0, mask: 0xffff });
    for (const c of CS) {
      mcu.register(c.CF, { reset: 0, mask: 0xf760 });
      mcu.register(c.BS, { reset: 0, mask: 0xff88 });
      mcu.register(c.MD, { reset: 0, mask: 0xf8ff });
    }
    for (const a of [PMDOUT1, PMDOUT2, PMDIN1, PMDIN2]) mcu.register(a, { reset: 0 });
    mcu.register(PMSTAT, { reset: 0x008f, mask: 0 });
    mcu.cpu.edsRead = (a, B) => this.access(a, B, null);
    mcu.cpu.edsWrite = (a, v, B) => this.access(a, B, v);
    mcu.attach(this);
  }

  get enabled() { const c = this.mcu.get(PMCON1); return (c & 0x8000) !== 0 && ((c >> 8) & 3) === 3; }
  base(k) { const bs = this.mcu.get(CS[k].BS); return ((bs >> 7) << 15) | ((bs >> 3) & 1) << 11; }

  /** A device on chip select cs (1, 2, or 'any': a device with no chip select, its strobe any cycle's): its
   *  write(address, byte) and read(address) -> byte. */
  attach(cs, device) { this.devices.push({ cs, ...device }); }

  // the EDS address's chip select (2 from its base, else 1 from its) and its offset; null outside both
  decode(a) {
    const b1 = this.base(0), b2 = this.base(1), raddr = this.mcu.get(PMCON2) & 0xff, end = raddr ? (raddr << 16) - 1 : 0xffffff;
    if (a > end) return null;
    if (b2 > b1 && a >= b2) return { cs: 2, offset: a - b2 };
    if (a >= b1) return { cs: 1, offset: a - b1 };
    return null;
  }

  // a CPU access of the EDS above the RAM: a byte cycle (a word two, its low byte first)
  access(a, B, v) {
    if (!this.enabled) {
      this.mcu.cpu.say('warning', `an EDS access at 0x${a.toString(16).toUpperCase().padStart(6, '0')} with the EPMP off (PMCON1's PMPEN, MODE 11): nothing there`, 'pmp-off');
      return 0;
    }
    const d = this.decode(a);
    if (!d) return 0;
    if (B) return this.cycle(d.cs, d.offset, v);
    const lo = this.cycle(d.cs, d.offset, v == null ? null : v & 0xff);
    const hi = this.cycle(d.cs, d.offset + 1, v == null ? null : (v >> 8) & 0xff);
    return lo | (hi << 8);
  }

  cycle(cs, offset, v) {
    let r = 0;
    for (const dev of this.devices) if (dev.cs === cs || dev.cs === 'any') {
      if (v == null) r = dev.read?.(offset) ?? 0; else dev.write?.(offset, v);
    }
    if ((this.mcu.get(PMCON1) & 3) === 1) this.mcu.cpu.raise(IRQ);
    return r & 0xff;
  }
}
