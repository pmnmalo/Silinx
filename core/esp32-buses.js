// Silinx - an ESP32 node's PWM, SPI and I²C as pins (#5495; the node: core/system-sim-esp32.js; the program's side:
// core/esp32-python.js's machine.PWM, SPI and I2C, core/esp32-engine.js's bridge): each step the program asks for (a
// PWM's frequency and duty, an SPI transfer, an I²C START, byte or STOP) becomes its pins' waveforms from the step's
// time, and a step that reads (MISO's bits, an I²C ACK or byte) is given back to the program at its end, read from the
// levels the other end gave the node at each sampling edge. The engine and the node share the steps' times (spiTime,
// i2cStep), so the program waits exactly until its step's end. Behavioural: a master only (no SPI nor I²C peripheral
// mode), one master on an I²C bus (no arbitration, no clock stretching), a PWM's new duty from its time (not at its
// period's end). An I²C line is pulled low (0) or released (null: the bus's pull-up's 1), as the AVR's
// (core/system-sim-avr-twi.js).
//
// Isomorphic ES module, no DOM, no imports.

/** Half of a bus's clock period (ps), its rate in Hz. */
export const halfOf = hz => Math.round(1e12 / hz / 2);

/** An SPI transfer of `n` words' time (ps): each bit a SCK period. */
export const spiTime = (cfg, n) => n * cfg.bits * 2 * halfOf(cfg.baud);

/** An I²C step's waveform from its start, in half periods: { changes: [[k, line, value]…], at: [k…] its sampling
 *  times, end }; `held`: SCL held low (a START after a START or a byte: a repeated START). Its line names 'scl', 'sda'. */
export function i2cStep(op, arg, held) {
  if (op === 'start') return held ? { changes: [[0, 'sda', null], [1, 'scl', null], [2, 'sda', 0], [3, 'scl', 0]], at: [], end: 3 }
    : { changes: [[0, 'scl', null], [0, 'sda', null], [1, 'sda', 0], [2, 'scl', 0]], at: [], end: 2 };
  if (op === 'stop') return { changes: [[0.5, 'sda', 0], [1, 'scl', null], [2, 'sda', null]], at: [], end: 2 };
  // (a byte and its ninth bit: written, the peripheral's ACK read; read, the master's ACK, `arg`, written)
  const byte = op === 'write' ? arg : 0xff, ninth = op === 'write' ? null : arg ? 0 : null, changes = [], at = [];
  for (let i = 0; i < 9; i++) {
    changes.push([2 * i + 0.5, 'sda', i < 8 ? ((byte >> (7 - i)) & 1 ? null : 0) : ninth], [2 * i + 1, 'scl', null], [2 * i + 2, 'scl', 0]);
    at.push(2 * i + 1.5);
  }
  return { changes, at: op === 'write' ? [at[8]] : at.slice(0, 8), end: 18 };
}

// a PWM's edges after `done` up to t (each period's rise at its start, its fall `high` later; a duty of 0 or of the
// whole period: one level from its start)
function pwmEdges(w, t) {
  const out = [];
  if (w.high <= 0 || w.high >= w.period) {
    if (w.done < w.from && w.from <= t) out.push({ t: w.from, value: w.high > 0 ? 1 : 0 });
  } else {
    for (let k = Math.max(0, Math.floor((w.done - w.from) / w.period)); ; k++) {
      const r = w.from + k * w.period, f = r + w.high;
      if (r > t) break;
      if (r > w.done) out.push({ t: r, value: 1 });
      if (f <= t && f > w.done) out.push({ t: f, value: 0 });
    }
  }
  w.done = Math.max(w.done, t);
  return out;
}

/** An ESP32 node's PWM outputs and SPI and I²C masters: their pins' waveforms, the levels it read. */
export class Esp32Buses {
  /** node: the Esp32Node (its log, its pending inputs to the program, its pins' input levels, what the program drives). */
  constructor(node) {
    this.node = node;
    this.edges = new Map();   // (a pin a bus drives: its changes to come [{ t, value }])
    this.levels = new Map();  // (its level now)
    this.pwms = new Map();    // (a PWM's pin: { from, period, high, done })
    this.spis = new Map();    // (key -> { sck, mosi, miso, baud, polarity, phase, bits, lsb })
    this.i2cs = new Map();    // (key -> { scl, sda, freq, held })
    this.hist = new Map();    // (a pin read at sampling edges: its levels [{ t, value }], the first the level before them)
    this.steps = [];          // (a step's result due at its end: { end, bus, read })
  }

  /** Whether a bus or a PWM drives the pin. */
  drives(P) { return this.levels.has(P) || this.pwms.has(P); }

  /** The level the bus drives on a pin at t. */
  levelOf(P, t) {
    const w = this.pwms.get(P);
    if (w) return w.high <= 0 ? 0 : w.high >= w.period ? 1 : t < w.from ? this.levels.get(P) ?? 0 : ((t - w.from) % w.period) < w.high ? 1 : 0;
    let v = this.levels.get(P);
    for (const e of this.edges.get(P) ?? []) if (e.t <= t) v = e.value;
    return v;
  }

  /** A pin the program drives as a GPIO again (Pin): no bus's. */
  release(P) { this.levels.delete(P); this.edges.delete(P); this.pwms.delete(P); }

  // a pin taken for a bus: its level from t
  claim(P, t, value) {
    this.node.drive.delete(P);
    this.pwms.delete(P);
    if (!this.levels.has(P)) this.levels.set(P, this.node.last.get(P) ?? null);
    this.put(P, t, value);
  }
  put(P, t, value) {
    const q = this.edges.get(P) ?? this.edges.set(P, []).get(P);
    q.push({ t, value });
    if (q.length > 1 && q.at(-2).t > t) q.sort((a, b) => a.t - b.t);
  }
  watch(P) { if (!this.hist.has(P)) this.hist.set(P, [{ t: -Infinity, value: this.node.inVals.get(P) }]); }

  /** An input pin's level got at t (the node's setPin): kept where a bus reads it. */
  got(P, t, value) { this.hist.get(P)?.push({ t, value }); }

  // a read pin's level at t (released: the pull-up's 1)
  at(P, t) {
    let v = null;
    for (const s of this.hist.get(P)) if (s.t <= t) v = s.value;
    return v === 0 ? 0 : 1;
  }

  /** What the program did: a PWM, an SPI or I²C bus set up, a step on it. */
  took(e) {
    const gp = n => `GPIO${n}`;
    if (e.kind === 'pwm') {
      const P = e.pin, old = this.pwms.get(P);
      // (the old one's edges up to the change, then the new one from its time)
      if (old) for (const x of pwmEdges(old, e.t)) if (x.t < e.t) this.put(P, x.t, x.value);
      if (!this.levels.has(P)) this.levels.set(P, this.node.last.get(P) ?? null);
      this.node.drive.delete(P);
      if (!e.freq) { this.pwms.delete(P); this.put(P, e.t, 0); return; }
      const period = 2 * halfOf(e.freq);
      this.pwms.set(P, { from: e.t, period, high: Math.round(period * e.duty / 65535), done: e.t - 1 });
    } else if (e.kind === 'spi-init') {
      const c = { sck: gp(e.sck), mosi: gp(e.mosi), miso: gp(e.miso), baud: e.baud, polarity: e.polarity, phase: e.phase, bits: e.bits, lsb: !!e.lsb };
      this.spis.set(e.key, c);
      this.claim(c.sck, e.t, c.polarity);
      this.claim(c.mosi, e.t, 0);
      this.watch(c.miso);
    } else if (e.kind === 'spi') this.spi(e);
    else if (e.kind === 'i2c-init') {
      const c = { scl: gp(e.scl), sda: gp(e.sda), freq: e.freq, held: false };
      this.i2cs.set(e.key, c);
      this.claim(c.scl, e.t, null);
      this.claim(c.sda, e.t, null);
      this.watch(c.sda);
    } else if (e.kind === 'i2c') this.i2c(e);
  }

  // an SPI transfer: SCK's and MOSI's bits from its time, MISO read at each bit's sampling edge (CPHA 0: SCK's leading
  // edge, MOSI set half a period before it; CPHA 1: its trailing edge, MOSI set at the leading one)
  spi(e) {
    const c = this.spis.get(e.key);
    if (!c) { this.node.log.push({ kind: 'warning', time: e.t, text: `SPI(${e.key}) used before its init` }); return; }
    const h = halfOf(c.baud), idle = c.polarity, at = [];
    let t = e.t;
    for (const word of e.bytes) {
      for (let i = 0; i < c.bits; i++) {
        const bit = (word >> (c.lsb ? i : c.bits - 1 - i)) & 1;
        if (!c.phase) { this.put(c.mosi, t, bit); this.put(c.sck, t + h, 1 - idle); this.put(c.sck, t + 2 * h, idle); }
        else { this.put(c.sck, t, 1 - idle); this.put(c.mosi, t, bit); this.put(c.sck, t + h, idle); }
        at.push(t + h);
        t += 2 * h;
      }
    }
    this.steps.push({ end: e.t + spiTime(c, e.bytes.length), bus: `spi${e.key}`, read: () => {
      const bits = at.map(s => this.at(c.miso, s)), words = [];
      for (let w = 0; w < e.bytes.length; w++) {
        let v = 0;
        for (let i = 0; i < c.bits; i++) v |= bits[w * c.bits + i] << (c.lsb ? i : c.bits - 1 - i);
        words.push(v);
      }
      return words;
    }, pins: [c.miso] });
  }

  // an I²C step: SCL's and SDA's waveform from its time; a byte written its ACK read, a byte read its bits
  i2c(e) {
    const c = this.i2cs.get(e.key);
    if (!c) { this.node.log.push({ kind: 'warning', time: e.t, text: `I2C(${e.key}) used before its init` }); return; }
    const h = halfOf(c.freq), s = i2cStep(e.op, e.arg, c.held);
    c.held = e.op !== 'stop';
    for (const [k, line, value] of s.changes) this.put(c[line], e.t + k * h, value);
    if (!s.at.length) return;
    const at = s.at.map(k => e.t + k * h);
    this.steps.push({ end: e.t + s.end * h, bus: `i2c${e.key}`, read: () => {
      const v = at.map(x => this.at(c.sda, x));
      return e.op === 'write' ? (v[0] === 0 ? 1 : 0) : v.reduce((b, x) => (b << 1) | x, 0);
    }, pins: [c.sda] });
  }

  /** The time of the next step's end (its result read then), Infinity when none. */
  next() { return this.steps.reduce((m, s) => Math.min(m, s.end), Infinity); }

  /** The steps ended by t: their results, to the program at their end: [{ bus, t, value }]. */
  due(t) {
    const done = this.steps.filter(s => s.end <= t);
    if (!done.length) return [];
    this.steps = this.steps.filter(s => s.end > t);
    const out = done.map(s => ({ bus: s.bus, t: s.end, value: s.read() }));
    // (the levels before the last one read no longer needed)
    for (const s of done) for (const P of s.pins) {
      const q = this.hist.get(P), last = q.findLastIndex(x => x.t <= s.end);
      if (last > 0 && !this.steps.some(o => o.pins.includes(P))) q.splice(0, last);
    }
    return out;
  }

  /** The pins' changes up to t: push(pin, t, value) each, in time order per pin. */
  emit(t, push) {
    for (const [P, q] of this.edges) while (q.length && q[0].t <= t) { const e = q.shift(); this.levels.set(P, e.value); push(P, e.t, e.value); }
    for (const [P, w] of this.pwms) for (const e of pwmEdges(w, t)) { this.levels.set(P, e.value); push(P, e.t, e.value); }
  }
}
