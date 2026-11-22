// Silinx - the co-design system's link decoders (#4699, docs/CODESIGN.md): a link's traffic decoded from the pins the
// co-simulation scheduler exchanges (core/system-sim.js: a link's changes, [t, value, t, value…] in ps). A UART's bytes
// at a baud and a frame (data bits 5 to 8, parity N / E / O, stop bits 1 or 2, a System document's `8N1`), each with its
// time; a framing error (a stop bit at 0) and a parity error are the decoder's warnings, as the console says them. SPI
// and I²C come with their links (phase 2). Isomorphic ES module, no DOM.

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
