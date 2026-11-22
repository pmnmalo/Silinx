// Silinx - an AVR node's SPI master (#5214; the node: core/system-sim-avr.js): the ATmega328P's SPI (avr8js's AVRSPI, its
// registers SPCR, SPSR, SPDR) made pins, as its USART is: a byte the program writes to SPDR becomes SCK's and MOSI's
// waveforms (D13, D11) at its clock divider and mode (CPOL, CPHA; MSB or LSB first), and MISO (D12) is read at each
// sampling edge from the levels it got, the byte given back to the program at the transfer's end (SPIF). SS (D10) is
// the program's own pin, as on the board. The master only (the SPI's peripheral mode, MSTR clear, is not emulated).
//
// Isomorphic ES module, no DOM.

const SPE = 0x40, MSTR = 0x10;

export class AvrSpi {
  /** node: the AvrNode; lib: avr8js's names; hz: the CPU's clock; cyclePs: a cycle's time (ps). */
  constructor(node, { AVRSPI, spiConfig }, hz, cyclePs) {
    this.node = node;
    this.config = spiConfig;
    this.cyclePs = cyclePs;
    this.spi = new AVRSPI(node.cpu, spiConfig, hz);
    this.events = [];                    // SCK's and MOSI's changes to come: [{ t, pin, value }]
    this.levels = { D13: null, D11: null };
    this.miso = [];                      // D12's levels got: [{ t, value }], the first the level before them
    this.spi.onByte = (byte) => this.start(byte);
  }

  /** Whether the SPI drives SCK and MOSI now: enabled, a master. */
  get on() { const c = this.node.cpu.data[this.config.SPCR]; return !!(c & SPE) && !!(c & MSTR); }
  drives(pin) { return (pin === 'D13' || pin === 'D11') && this.on; }
  /** SCK's or MOSI's level now (SCK at rest: its CPOL). */
  level(pin) { return this.levels[pin] ?? (pin === 'D13' ? this.spi.spiMode >> 1 : 0); }

  // a byte written to SPDR: SCK's 8 cycles and MOSI's bits from now, MISO sampled on the mode's edges
  start(byte) {
    const half = (this.spi.clockDivider / 2) * this.cyclePs, t0 = this.node.time;
    const mode = this.spi.spiMode, cpol = mode >> 1, cpha = mode & 1, msb = this.spi.dataOrder === 'msbFirst';
    const samples = [];
    for (let i = 0; i < 8; i++) {
      const bit = (byte >> (msb ? 7 - i : i)) & 1, lead = t0 + (2 * i + 1) * half, trail = t0 + (2 * i + 2) * half;
      // (CPHA 0: the bit out before the leading edge, read on it; CPHA 1: out on the leading edge, read on the trailing)
      this.events.push({ t: cpha ? lead : t0 + 2 * i * half, pin: 'D11', value: bit }, { t: lead, pin: 'D13', value: 1 - cpol }, { t: trail, pin: 'D13', value: cpol });
      samples.push(cpha ? trail : lead);
    }
    this.events.sort((a, b) => a.t - b.t);
    this.node.cpu.addClockEvent(() => this.finish(samples, msb), this.spi.transferCycles);
  }

  // the transfer's end: MISO's bits as they were at their edges, the byte to SPDR
  finish(samples, msb) {
    let byte = 0;
    samples.forEach((t, i) => { if (this.misoAt(t) === 1) byte |= 1 << (msb ? 7 - i : i); });
    // (the levels before the last edge no longer needed: the last one kept, as the level before what comes)
    const last = this.miso.findLastIndex(m => m.t <= samples.at(-1));
    if (last > 0) this.miso.splice(0, last);
    this.spi.completeTransfer(byte);
  }
  misoAt(t) {
    let v = this.miso[0]?.value ?? null;
    for (const m of this.miso) if (m.t <= t) v = m.value;
    return v;
  }

  /** D12's level got at t (the node's setPin). */
  gotMiso(t, value) { this.miso.push({ t, value }); }

  /** SCK's and MOSI's changes up to t, in time order (the node's output changes while the SPI drives them). */
  take(t) {
    const out = [];
    while (this.events.length && this.events[0].t <= t) {
      const e = this.events.shift();
      this.levels[e.pin] = e.value;
      out.push(e);
    }
    return out;
  }
}
