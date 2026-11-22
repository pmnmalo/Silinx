// Silinx - the co-design system's link decoders (#4699, docs/CODESIGN.md): a link's traffic decoded from the pins the
// co-simulation scheduler exchanges (core/system-sim.js: a link's changes, [t, value, t, value…] in ps). A UART's bytes
// at a baud and a frame (data bits 5 to 8, parity N / E / O, stop bits 1 or 2, a System document's `8N1`), each with its
// time; a framing error (a stop bit at 0) and a parity error are the decoder's warnings, as the console says them. An
// SPI bus's transfers from its four lines (#5214: a byte each way, MOSI's and MISO's, at the mode's sampling edges while
// SS is low); a SCK faster than its interface says, a warning. An I²C bus's transfers from SCL and SDA (#5214: its
// address, read or write, its bytes, each ACK), SDA low while either end pulls it low; a SCL faster than its interface
// says and an address no peripheral acknowledged, its warnings. Isomorphic ES module, no DOM.

/** A frame's text read ('8N1', '7E2'): { bits, parity: 'N' | 'E' | 'O', stop }, or null. */
export function parseFrame(frame) {
  const m = /^([5-8])([NEO])([12])$/i.exec(String(frame ?? ''));
  return m ? { bits: Number(m[1]), parity: m[2].toUpperCase(), stop: Number(m[3]) } : null;
}

// a time in ps as the console says it (µs, three decimals)
export const usText = (ps) => `${(ps / 1e6).toFixed(3)} µs`;
const hex = (b) => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`;

/**
 * A UART receiver on a line's changes (ps): feed([t, level, t, level…]) in time order, flush(now), then take() the
 * bytes: [{ t (the start bit's), byte, error: null | 'framing' | 'parity' }]. It samples each bit in its middle from the
 * start bit's falling edge; a start bit back at 1 in its middle is a glitch, not a frame; the first change is the line's
 * level at the start (a line low from the start, a break: nothing until it rises and falls). A level unknown (null) is
 * read as 1, the line's idle.
 */
export class UartLinkDecoder {
  constructor({ baud, frame = '8N1' }) {
    const f = parseFrame(frame);
    if (!(baud > 0)) throw new Error(`a UART's baud above 0, not '${baud}'`);
    if (!f) throw new Error(`'${frame}' is not a UART frame (8N1: data bits 5 to 8, parity N, E or O, stop bits 1 or 2)`);
    Object.assign(this, f, { baud, bit: 1e12 / baud, level: null, start: null, k: 0, v: 0, ones: 0, perr: false, out: [] });
    this.n = 1 + f.bits + (f.parity === 'N' ? 0 : 1) + f.stop;   // (the frame's bits, its start bit's too)
  }

  next() { return this.start == null ? null : this.start + (this.k + 0.5) * this.bit; }

  // the samples up to t (excluded), at the line's level before t
  sampleTo(t) {
    for (let s = this.next(); s != null && s < t; s = this.next()) {
      const L = this.level, k = this.k, parityAt = 1 + this.bits;
      if (k === 0) {
        if (L) { this.start = null; break; }   // (a glitch)
      } else if (k <= this.bits) { this.v |= L << (k - 1); this.ones += L; }
      else if (this.parity !== 'N' && k === parityAt) this.perr = ((this.ones + L) & 1) !== (this.parity === 'O' ? 1 : 0);
      else if (!L) { this.done('framing'); break; }   // (a stop bit at 0)
      if (k === this.n - 1) { this.done(this.perr ? 'parity' : null); break; }
      this.k++;
    }
  }

  done(error) {
    this.out.push({ t: this.start, byte: this.v, error });
    this.start = null;
  }

  feed(changes) {
    for (let i = 0; i + 1 < changes.length; i += 2) {
      const t = changes[i], L = changes[i + 1] === 0 ? 0 : 1;
      if (this.level == null) { this.level = L; continue; }
      this.sampleTo(t);
      if (this.start == null && this.level === 1 && L === 0) Object.assign(this, { start: t, k: 0, v: 0, ones: 0, perr: false });
      this.level = L;
    }
  }

  flush(now) { this.sampleTo(now + 1); }
  take() { return this.out.splice(0); }
}

/** A UART line's bytes ([{ t, byte, error }]) from its changes up to `end` (ps), at baud and frame. */
export function decodeUart(changes, { baud, frame = '8N1', end = Infinity }) {
  const d = new UartLinkDecoder({ baud, frame });
  d.feed(changes);
  d.flush(Number.isFinite(end) ? end : (changes.at(-2) ?? 0) + d.n * d.bit);
  return d.take();
}

/** A link's decoded bytes' warnings (its name `link`): a framing error, a parity error, each with its time. */
export function uartWarnings(link, bytes, { baud, frame = '8N1' }) {
  return bytes.filter((b) => b.error).map((b) => b.error === 'framing'
    ? `${link}: a framing error at ${usText(b.t)} (no stop bit at ${baud} baud, ${frame}): ${hex(b.byte)} received`
    : `${link}: a parity error at ${usText(b.t)} (${frame}): ${hex(b.byte)} received`);
}

/** A byte as the link inspector shows it: its hex, and its character when printable ('0x41 'A''). */
export const byteText = (b) => `${hex(b)}${b >= 0x20 && b < 0x7f ? ` '${String.fromCharCode(b)}'` : ''}`;

/**
 * The traffic of a scheduler's links (sys.links: each its `sent`, the changes at its source), decoded: [{ link, kind,
 * bytes, warnings }], a UART link at its baud and `frames[name]` ('8N1' by default), a wire's changes as they are.
 */
export function linkTraffic(sys, { frames = {}, end = sys.now } = {}) {
  return [...sys.links.values()].map((l) => {
    if (l.kind !== 'uart') return { link: l.name, kind: l.kind, changes: l.sent.length / 2, bytes: [], warnings: [] };
    const frame = frames[l.name] ?? '8N1';
    const bytes = decodeUart(l.sent, { baud: l.baud, frame, end });
    return { link: l.name, kind: 'uart', bytes, warnings: uartWarnings(l.name, bytes, { baud: l.baud, frame }) };
  });
}

// a line's level at t from its changes [t, level, …]
function levelAt(ch, t) {
  let v = null;
  for (let k = 0; k < ch.length && ch[k] <= t; k += 2) v = ch[k + 1];
  return v;
}

/**
 * An SPI bus's transfers from its lines' changes (ps) { sck, mosi, miso, ss } (miso, ss: none, read as 0 and selected):
 * [{ t (its first edge's), mosi, miso }] (bytes, MSB first unless lsbFirst), and its SCK's fastest rate (Hz). The bits
 * are read at the mode's sampling edges (mode 0 and 3 SCK rising, 1 and 2 falling) while SS is low; a transfer of fewer
 * than 8 bits (SS raised before its end) is dropped.
 */
export function decodeSpi({ sck = [], mosi = [], miso = [], ss = null }, { mode = 0, lsbFirst = false } = {}) {
  const cpol = mode >> 1, cpha = mode & 1, edge = cpol ^ cpha ? 0 : 1;   // (the level SCK goes to at a sampling edge)
  const out = [];
  let cur = null, last = null, fastest = 0;
  for (let k = 2; k < sck.length; k += 2) {
    const t = sck[k];
    if (last != null && t > last) fastest = Math.max(fastest, 1e12 / (2 * (t - last)));
    last = t;
    if (sck[k + 1] !== edge) continue;
    if (ss && levelAt(ss, t) !== 0) { cur = null; continue; }
    cur ??= { t, n: 0, mosi: 0, miso: 0 };
    const at = lsbFirst ? 1 << cur.n : 0x80 >> cur.n;
    if (levelAt(mosi, t) === 1) cur.mosi |= at;
    if (levelAt(miso, t) === 1) cur.miso |= at;
    if (++cur.n === 8) { out.push({ t: cur.t, mosi: cur.mosi, miso: cur.miso }); cur = null; }
  }
  return { transfers: out, hz: Math.round(fastest) };
}

/** An SPI bus's warnings: its SCK faster than its interface says (its link's latency set by it). */
export const spiWarnings = (link, { hz, declared }) => (hz > declared * 1.01
  ? [`${link}: SCK at ${hz} Hz, faster than its interface's ${declared} Hz: its MISO may be read late (the interface's SCK rate at least the program's)`] : []);

// two open-drain lines' changes [t, level, …] as the bus's level: low while either end pulls it low (null: released,
// the pull-up's 1)
export function wiredAnd(a = [], b = []) {
  const ts = [...new Set([...a.filter((_, k) => k % 2 === 0), ...b.filter((_, k) => k % 2 === 0)])].sort((x, y) => x - y);
  const out = [];
  for (const t of ts) {
    const v = levelAt(a, t) === 0 || levelAt(b, t) === 0 ? 0 : 1;
    if (out.at(-1) !== v) out.push(t, v);
  }
  return out;
}

/**
 * An I²C bus's transfers from its lines' changes (ps) { scl, sda } (SDA the bus's, both ends': wiredAnd): [{ t (its
 * START's), addr (7 bits), read, ack (the address acknowledged), data: [{ byte, ack }] }] and its SCL's fastest rate
 * (Hz). A transfer is from a START (SDA falling while SCL is high) to the next START or a STOP (SDA rising while SCL is
 * high); each bit read as SCL rises, each byte's ninth bit its ACK (SDA low); a byte cut short is dropped.
 */
export function decodeI2c({ scl = [], sda = [] }) {
  const ev = [];
  for (let k = 0; k < scl.length; k += 2) ev.push([scl[k], 0, scl[k + 1] === 0 ? 0 : 1]);
  for (let k = 0; k < sda.length; k += 2) ev.push([sda[k], 1, sda[k + 1] === 0 ? 0 : 1]);
  ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out = [];
  let c = 1, d = 1, cur = null, bits = [], rise = null, fastest = 0;
  const close = () => { if (cur?.addr != null) out.push(cur); cur = null; };
  for (const [t, line, v] of ev) {
    if (line === 0) {
      if (v === 1 && c === 0) {
        if (rise != null && t > rise) fastest = Math.max(fastest, 1e12 / (t - rise));
        rise = t;
        if (cur) bits.push(d);
        if (cur && bits.length === 9) {
          const byte = bits.slice(0, 8).reduce((b, x) => (b << 1) | x, 0), ack = bits[8] === 0;
          if (cur.addr == null) Object.assign(cur, { addr: byte >> 1, read: !!(byte & 1), ack });
          else cur.data.push({ byte, ack });
          bits = [];
        }
      }
      c = v;
    } else {
      if (c === 1 && d === 1 && v === 0) { close(); cur = { t, addr: null, read: false, ack: false, data: [] }; bits = []; }
      else if (c === 1 && d === 0 && v === 1) close();
      d = v;
    }
  }
  close();
  return { transfers: out, hz: Math.round(fastest) };
}

/** An I²C bus's warnings: its SCL faster than its interface says (its link's latency set by it); an address no
 *  peripheral acknowledged. */
export function i2cWarnings(link, { hz, declared, transfers = [] }) {
  const out = hz > declared * 1.01 ? [`${link}: SCL at ${hz} Hz, faster than its interface's ${declared} Hz: its peripheral's answers may be read late (the interface's SCL rate at least the program's)`] : [];
  const nack = new Map();
  for (const x of transfers) if (!x.ack) nack.set(x.addr, (nack.get(x.addr) ?? 0) + 1);
  for (const [a, n] of nack) out.push(`${link}: no peripheral acknowledged the address 0x${a.toString(16).padStart(2, '0')} (${n} time(s))`);
  return out;
}
