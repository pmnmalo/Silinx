// silinx-pic24 - the A/D converter (#5481, DS30010074 section 25): ADC1, 10 or 12 bits (MODE12), its 24 analog
// inputs AN0-AN23 against AVDD and AVSS (or VREF+, PVCFG); AD1CON1 (ADON, FORM's four formats, SSRC: SAMP by the
// program, Timer3, Timer1, auto-convert; ASAM, SAMP, DONE), AD1CON2 (CSCNA's scan of AD1CSSH:L, SMPI, BUFM, ALTS,
// BUFREGEN), AD1CON3 (ADRC, SAMC, ADCS: TAD = TCY · (ADCS + 1)), AD1CHS (MUX A and B), ADC1BUF0-25, the ADC1
// interrupt (IRQ 13) after SMPI + 1 conversions. An input's voltage is set from outside (setAnalog: the board's
// potentiometer, its TC1047A), else its pin's level (a driven or an outside digital level, 0 or 3.3 V).
//
// Not modelled: the sample-and-hold's charging (the input is sampled at the conversion's start), the threshold
// detect and its compare modes (AD1CON5's ASEN, WM, CM, AD1CHIT), DMA, the band gap and the CTMU's channels (read as
// 0), the conversion's noise and nonlinearity; the internal RC clock's TAD taken as 250 ns.

const AD1CON1 = 0x0746, AD1CON2 = 0x0748, AD1CON3 = 0x074a, AD1CHS = 0x074c, AD1CSSH = 0x074e, AD1CSSL = 0x0750;
const AD1CON4 = 0x0752, AD1CON5 = 0x0754, BUF0 = 0x0712, BUFS = 26, IRQ = 13;
const ADON = 0x8000, MODE12 = 0x0400, ASAM = 0x0004, SAMP = 0x0002, DONE = 0x0001;
// the analog inputs' pins (table 5)
export const AN_PINS = ['RB0', 'RB1', 'RB2', 'RB3', 'RB4', 'RB5', 'RB6', 'RB7', 'RB8', 'RB9', 'RB10', 'RB11', 'RB12', 'RB13', 'RB14', 'RB15',
  'RC4', 'RG6', 'RG7', 'RG8', 'RG9', 'RE9', 'RA7', 'RA6'];
const VDD = 3.3, RC_TAD = 250e-9;

export class Adc {
  constructor(mcu, ports) {
    Object.assign(this, { mcu, ports });
    this.volts = new Map();     // 'AN5' -> V (from outside)
    this.vrefPlus = VDD;         // (VREF+'s, for PVCFG 01)
    this.count = 0;              // conversions since the last interrupt
    this.slot = 0;               // the next buffer's (no BUFREGEN)
    this.scan = 0;               // the next scanned input
    this.useB = false;           // ALTS: MUX B next
    this.event = null;
    mcu.register(AD1CON1, { reset: 0, mask: 0xa7f6, write: (v, old) => this.writeCon1(v, old) });
    mcu.register(AD1CON2, { reset: 0, mask: 0xecff });
    mcu.register(AD1CON3, { reset: 0, mask: 0xffff });
    mcu.register(AD1CHS, { reset: 0, mask: 0xffff });
    mcu.register(AD1CSSH, { reset: 0, mask: 0x00ff });
    mcu.register(AD1CSSL, { reset: 0, mask: 0xffff });
    mcu.register(AD1CON4, { reset: 0, mask: 0x000f });
    mcu.register(AD1CON5, { reset: 0, mask: 0xf30f });
    for (let i = 0; i < BUFS; i++) mcu.register(BUF0 + 2 * i, { reset: 0, mask: 0 });
    mcu.attach(this);
  }

  get con1() { return this.mcu.get(AD1CON1); }
  get bits() { return this.con1 & MODE12 ? 12 : 10; }
  /** TAD (s): TCY · (ADCS + 1), or the internal RC's (ADRC). */
  get tad() { const c3 = this.mcu.get(AD1CON3); return c3 & 0x8000 ? RC_TAD : (1 / this.mcu.fpb) * ((c3 & 0xff) + 1); }

  /** An analog input's voltage from now on ('AN5', 1.65). */
  setAnalog(an, v) {
    if (!/^AN([0-9]|1[0-9]|2[0-3])$/.test(an)) throw new Error(`the PIC24FJ1024GB610 has no analog input '${an}' (AN0-AN23)`);
    this.volts.set(an, Math.max(0, Math.min(VDD, Number(v))));
  }
  // its voltage: set from outside, else its pin's digital level
  vin(n) {
    if (n === 0x1e) return VDD;
    if (n > 23) return 0;
    const v = this.volts.get(`AN${n}`);
    if (v != null) return v;
    const lv = this.ports.level(AN_PINS[n]);
    return lv ? VDD : 0;
  }

  // a conversion's code in FORM's format
  convert(n) {
    const bits = this.bits, full = 1 << bits, vref = (this.mcu.get(AD1CON2) >> 14) & 1 ? this.vrefPlus : VDD;
    const code = Math.max(0, Math.min(full - 1, Math.round(this.vin(n) / vref * full)));
    switch ((this.con1 >> 8) & 3) {
      case 0: return code;
      case 1: return (code - full / 2) & 0xffff;
      case 2: return (code << (16 - bits)) & 0xffff;
      default: return ((code - full / 2) << (16 - bits)) & 0xffff;
    }
  }

  // the input to convert: the next scanned one (CSCNA), else MUX A's (or B's, ALTS) CH0SA / CH0SB
  channel() {
    const c2 = this.mcu.get(AD1CON2), chs = this.mcu.get(AD1CHS);
    if (c2 & 0x0400) {
      const sel = ((this.mcu.get(AD1CSSH) << 16) | this.mcu.get(AD1CSSL)) >>> 0;
      if (sel) for (let k = 0; k < 32; k++) { const n = (this.scan + k) % 32; if ((sel >>> n) & 1) { this.scan = n + 1; return n; } }
    }
    const b = c2 & 1 && this.useB;
    if (c2 & 1) this.useB = !this.useB;
    return b ? (chs >> 8) & 0x1f : chs & 0x1f;
  }

  writeCon1(v, old) {
    if (!(v & ADON)) { this.mcu.cancel(this.event); this.event = null; return; }
    const ssrc = (v >> 4) & 15;
    if (!(old & ADON)) { this.count = 0; this.slot = 0; this.scan = 0; }
    // SAMP set (or ASAM): sampling; in auto-convert for SAMC TADs, then the conversion
    if ((v & SAMP && !(old & SAMP)) || (v & ASAM && !(old & ASAM))) this.sample();
    // SAMP cleared by the program (SSRC 0): the conversion starts
    if (ssrc === 0 && old & SAMP && !(v & SAMP)) this.start();
  }

  // sampling: SAMP set, DONE cleared; auto-convert's sampling time, else a trigger or the program ends it
  sample() {
    const mcu = this.mcu;
    mcu.set(AD1CON1, (this.con1 | SAMP) & ~DONE);
    if (((this.con1 >> 4) & 15) === 7) {
      const samc = (mcu.get(AD1CON3) >> 8) & 0x1f;
      this.mcu.cancel(this.event);
      this.event = mcu.schedule(mcu.time + Math.max(1, samc) * this.tad * 1e12, () => { this.event = null; this.start(); });
    }
  }

  /** A trigger's source (SSRC 0010 Timer3, 0101 / 0110 Timer1): its period's end ends the sampling. */
  trigger(source) {
    const ssrc = (this.con1 >> 4) & 15;
    if (!(this.con1 & ADON) || !(this.con1 & SAMP)) return;
    if ((source === 'T3' && ssrc === 2) || (source === 'T1' && (ssrc === 5 || ssrc === 6))) this.start();
  }

  // the conversion: SAMP cleared, the input held now, its result after 12 TADs (14 for 12 bits)
  start() {
    const mcu = this.mcu;
    if (!(this.con1 & ADON)) return;
    mcu.set(AD1CON1, this.con1 & ~SAMP);
    const n = this.channel(), result = this.convert(n), t = (this.bits === 12 ? 14 : 12) * this.tad * 1e12;
    this.mcu.cancel(this.event);
    this.event = mcu.schedule(mcu.time + t, () => { this.event = null; this.done(n, result); });
  }

  // the result to its buffer (ADC1BUFn of its input with BUFREGEN, else the next one), DONE; the interrupt after
  // SMPI + 1 of them (the buffers' pointer back to 0, or to the other half with BUFM); ASAM samples again
  done(n, result) {
    const mcu = this.mcu, c2 = mcu.get(AD1CON2), smpi = (c2 >> 2) & 0x1f;
    const at = c2 & 0x0800 ? n : this.slot;
    if (at < BUFS) mcu.set(BUF0 + 2 * at, result);
    this.slot++;
    mcu.set(AD1CON1, this.con1 | DONE);
    if (++this.count > smpi) {
      this.count = 0;
      this.slot = c2 & 2 ? (this.slot >= BUFS / 2 ? 0 : 13) : 0;
      this.scan = 0;
      mcu.cpu.raise(IRQ);
    }
    if (this.con1 & ASAM) this.sample();
  }

  reset() { this.mcu.cancel(this.event); this.event = null; this.count = this.slot = this.scan = 0; this.useB = false; }
}
