// Silinx - an AVR node's I²C master (#5214; the node: core/system-sim-avr.js): the ATmega328P's TWI (avr8js's AVRTWI, its
// registers TWBR, TWSR, TWDR, TWCR) made pins, as its SPI is: each step the program asks for (a START, a repeated
// START, an address, a byte written, a byte read, a STOP) becomes SCL's and SDA's waveforms (A5, A4) at the TWI's SCL
// rate (TWBR, its prescaler), each line pulled low (0) or released (null: the bus's pull-up's 1); SDA is read at the
// middle of each SCL high from the levels the other end gave it (the peripheral's ACK, the bytes it sends), the step's
// result given back to the program (TWINT, its status) at its end. A bit's SDA set in the middle of SCL low. The master
// only (the TWI's slave mode is not emulated), one master on the bus (no arbitration), and no clock stretching: the
// peripheral answers in time.
//
// Isomorphic ES module, no DOM.

const TWEN = 0x04;

export class AvrTwi {
  /** node: the AvrNode; lib: avr8js's names; hz: the CPU's clock; cyclePs: a cycle's time (ps); pins: its board's
   *  { scl, sda }. */
  constructor(node, { AVRTWI, twiConfig }, hz, cyclePs, { scl = 'A5', sda = 'A4' } = {}) {
    this.node = node;
    this.config = twiConfig;
    this.cyclePs = cyclePs;
    this.scl = scl;
    this.sda = sda;
    this.twi = new AVRTWI(node.cpu, twiConfig, hz);
    this.twi.eventHandler = this;
    this.events = [];                      // SCL's and SDA's changes to come: [{ t, pin, value }]
    this.levels = { [scl]: null, [sda]: null };
    this.sdaIn = [{ t: 0, value: null }];  // SDA's levels the other end gave: [{ t, value }], the first the level before them
  }

  /** Whether the TWI drives SCL and SDA now: enabled. */
  get on() { return !!(this.node.cpu.data[this.config.TWCR] & TWEN); }
  drives(pin) { return (pin === this.scl || pin === this.sda) && this.on; }
  /** SCL's or SDA's level now: 0 pulled low, null released. */
  level(pin) { return this.levels[pin]; }

  // half of SCL's period (ps), from TWBR and the prescaler (fosc / (16 + 2 TWBR 4^TWPS))
  half() { return (this.node.cpu.data[this.config.TWBR] * this.twi.prescaler + 8) * this.cyclePs; }

  // the changes from t (ps from now), and the step's end at `end` (half periods from now): done()
  plan(changes, end, done) {
    const h = this.half(), t0 = this.node.time;
    for (const [k, pin, value] of changes) this.events.push({ t: t0 + k * h, pin, value });
    this.events.sort((a, b) => a.t - b.t);
    this.node.cpu.addClockEvent(() => done(t0, h), Math.max(1, Math.round((end * h) / this.cyclePs)));
  }

  // a byte's 8 bits and its ninth (its ACK) from now, SDA set at a quarter of each bit (SCL low), SCL high at its half:
  // [k, pin, value]…, the bits' sampling times (half periods), SDA's level of the ninth
  bits(byte, ninth) {
    const out = [], at = [];
    for (let i = 0; i < 9; i++) {
      const v = i < 8 ? ((byte >> (7 - i)) & 1 ? null : 0) : ninth;
      out.push([2 * i + 0.5, this.sda, v], [2 * i + 1, this.scl, null], [2 * i + 2, this.scl, 0]);
      at.push(2 * i + 1.5);
    }
    return { changes: out, at };
  }

  // SDA's level at t: the other end's (released: the pull-up's 1), with the master's own released while it reads
  sdaAt(t) {
    let v = this.sdaIn[0].value;
    for (const s of this.sdaIn) if (s.t <= t) v = s.value;
    return v === 0 ? 0 : 1;
  }
  // a step's sampled levels read, the levels before the last one no longer needed
  read(t0, h, at) {
    const v = at.map(k => this.sdaAt(t0 + k * h));
    const last = this.sdaIn.findLastIndex(s => s.t <= t0 + at.at(-1) * h);
    if (last > 0) this.sdaIn.splice(0, last);
    return v;
  }

  /** SDA's level got at t (the node's setPin). */
  gotSda(t, value) { this.sdaIn.push({ t, value }); }

  // avr8js's TWIEventHandler: each step's waveform, then its result
  start(repeated) {
    // (from SCL low, a repeated START: SDA and SCL released first)
    const c = repeated ? [[0, this.sda, null], [1, this.scl, null], [2, this.sda, 0], [3, this.scl, 0]] : [[0, this.scl, null], [0, this.sda, null], [1, this.sda, 0], [2, this.scl, 0]];
    this.plan(c, repeated ? 3 : 2, () => this.twi.completeStart());
  }
  stop() { this.plan([[0.5, this.sda, 0], [1, this.scl, null], [2, this.sda, null]], 2, () => this.twi.completeStop()); }
  connectToSlave(addr, write) { this.send((addr << 1) | (write ? 0 : 1), ack => this.twi.completeConnect(ack)); }
  writeByte(value) { this.send(value, ack => this.twi.completeWrite(ack)); }
  readByte(ack) {
    const { changes, at } = this.bits(0xff, ack ? 0 : null);
    this.plan(changes, 18, (t0, h) => this.twi.completeRead(this.read(t0, h, at.slice(0, 8)).reduce((b, v) => (b << 1) | v, 0)));
  }
  // a byte sent, the peripheral's ACK read (SDA low at the ninth bit)
  send(byte, done) {
    const { changes, at } = this.bits(byte, null);
    this.plan(changes, 18, (t0, h) => done(this.read(t0, h, [at[8]])[0] === 0));
  }

  /** SCL's and SDA's changes up to t, in time order (the node's output changes while the TWI drives them). */
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
