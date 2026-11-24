// An SD card on SPI, a microSD module with an SDHC card in it (#5477, part of #3902; docs/CIRCUITS.md): its pins GND,
// VCC, MISO, MOSI, SCK and CS on the 0.1 inch grid, at 5 V (its level shifter), MISO released while CS is high. SPI mode
// 0: MOSI read on SCK's rise, MISO set on its fall, a byte's MSB first. The SD protocol's SPI commands a host's library
// sends: after 74 clocks or more with CS high, CMD0 (idle), CMD8 (its echo), CMD55 + ACMD41 (idle, then ready), CMD58
// (OCR: SDHC), CMD16, CMD13, CMD17 (a block read: its token, 512 bytes, their CRC16) and CMD24 (a block written: its
// data response, then busy); CMD0's and CMD8's CRC7 checked; another command illegal; 32 MB, 512-byte blocks, addressed
// by block. Its blocks empty (zeros) at first, those written kept while it runs. Isomorphic module.

const PINS = ['GND', 'VCC', 'MISO', 'MOSI', 'SCK', 'CS'];
const DIR = { GND: 'gnd', VCC: 'vcc', MISO: 'out', MOSI: 'in', SCK: 'in', CS: 'in' };
export const SD_CARD = {
  type: 'sd-card', title: 'SD card module (SPI, microSD)', kind: 'sd', prefix: 'SD',
  pins: PINS.map((name, i) => ({ n: i + 1, name, dir: DIR[name], dx: i, dy: 0 })),
  // (its board, 0.9 x 1.7 inch, its card's slot over it, over its pins: the editor's Fit and print)
  size: { x0: -1.5, y0: -17.6, x1: 6.5, y1: 0.6 },
};

/** Its blocks (512 bytes; 32 MB); the clocks it needs with CS high before its first command; the bytes busy after a write. */
export const SD = { blocks: 65536, size: 512, clocks: 74, busy: 8 };
/** Its R1 bits: idle, illegal command, CRC error, address error, parameter error. */
export const R1 = { idle: 0x01, illegal: 0x04, crc: 0x08, address: 0x20, parameter: 0x40 };

/** A block's first bytes as text (32 at most, up to its first 0; others as dots), quoted: what a System and the MCP say. */
export function sdText(b) {
  const z = b.indexOf(0), n = Math.min(32, z < 0 ? b.length : z);
  return `"${String.fromCharCode(...[...b.slice(0, n)].map((c) => (c >= 32 && c < 127 ? c : 46)))}${n < b.length && z !== n ? '…' : ''}"`;
}

/** CRC7 of bytes (a command's 5 first), as its last byte carries it: (crc << 1) | 1. */
export function crc7(bytes) {
  let c = 0;
  for (const b of bytes) for (let k = 7; k >= 0; k--) { const bit = ((b >> k) & 1) ^ ((c >> 6) & 1); c = (c << 1) & 0x7f; if (bit) c ^= 0x09; }
  return (c << 1) | 1;
}
/** CRC16-CCITT (XMODEM: polynomial 0x1021, from 0) of a block, as its data's 2 last bytes carry it. */
export function crc16(bytes) {
  let c = 0;
  for (const b of bytes) { c ^= b << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; }
  return c;
}

/** A card, its blocks empty: exchange(byte) for each byte the host sends (CS low) returns the byte it sends back in the
 *  next exchange's place, as the bus has it: the answer to what came before; clocks(n) the clocks with CS high;
 *  deselect(); powerOff(); state(): { stage ('off', 'idle', 'ready'), written (blocks written, in order), last ({ block, op }, or
 *  null) }; block(n) its bytes; warnings (each once). */
export function createSd() {
  const blocks = new Map(), written = [], log = [];
  let stage = 'off', clocks = 0, cmd = [], out = [], app = false, inits = 0, rx = null, last = null;
  const warnings = [];
  const warn = (k, text) => { if (!warnings.some((w) => w.kind === k)) warnings.push({ kind: k, text }); };
  const block = (n) => blocks.get(n) ?? new Uint8Array(SD.size);
  // a command answered: its R1 after one byte (Ncr), and what follows it
  function command(c) {
    const index = c[0] & 0x3f, arg = ((c[1] << 24) | (c[2] << 16) | (c[3] << 8) | c[4]) >>> 0, acmd = app;
    app = false;
    if (stage === 'off') {
      if (clocks < SD.clocks) { warn('power', `only ${clocks} clocks with CS high before its first command: an SD card needs ${SD.clocks} or more`); return; }
      stage = 'idle';
    }
    const r1 = (v) => out.push(0xff, v | (stage === 'idle' ? R1.idle : 0));
    if ((index === 0 || index === 8) && c[5] !== crc7(c.slice(0, 5))) { r1(R1.crc); return; }
    if (index === 0) { stage = 'idle'; inits = 0; r1(0); return; }
    if (index === 8) { r1(0); out.push(0, 0, (arg >> 8) & 0x0f, arg & 0xff); return; }
    if (index === 55) { app = true; r1(0); return; }
    if (acmd && index === 41) { if (++inits >= 2 && stage === 'idle') { stage = 'ready'; log.push('ready'); } r1(0); return; }
    if (index === 58) { r1(0); out.push(stage === 'ready' ? 0xc0 : 0x80, 0xff, 0x80, 0x00); return; }
    if (index === 16) { r1(arg === SD.size ? 0 : R1.parameter); return; }
    if (index === 13) { r1(0); out.push(0); return; }
    if (index === 17 || index === 24) {
      if (stage !== 'ready') { r1(R1.illegal); return; }
      if (arg >= SD.blocks) { r1(R1.address); return; }
      r1(0);
      if (index === 17) { const b = block(arg), crc = crc16(b); out.push(0xff, 0xfe, ...b, crc >> 8, crc & 0xff); last = { block: arg, op: 'read' }; log.push(`read block ${arg}`); }
      else rx = { block: arg, data: null };
      return;
    }
    r1(R1.illegal);
  }
  const s = {
    warnings,
    clocks(n) { if (stage === 'off') clocks += n; },
    /** unpowered: its blocks kept (its flash), its stage off again */
    powerOff() { stage = 'off'; clocks = 0; cmd = []; out = []; app = false; inits = 0; rx = null; },
    deselect() { cmd = []; },
    exchange(byte) {
      // (a block being written: its token, its 512 bytes, its CRC; its data response, then busy)
      if (rx) {
        if (rx.data == null) { if (byte === 0xfe) rx.data = []; return out.shift() ?? 0xff; }
        rx.data.push(byte);
        if (rx.data.length === SD.size + 2) {
          blocks.set(rx.block, Uint8Array.from(rx.data.slice(0, SD.size)));
          if (!written.includes(rx.block)) written.push(rx.block);
          last = { block: rx.block, op: 'write' };
          log.push(`wrote block ${rx.block}`);
          rx = null;
          out.push(0xe5, ...new Array(SD.busy).fill(0));
          return out.shift();
        }
        return 0xff;
      }
      if (cmd.length || (byte & 0xc0) === 0x40) { cmd.push(byte); if (cmd.length === 6) { const c = cmd; cmd = []; command(c); } }
      return out.shift() ?? 0xff;
    },
    block,
    state: () => ({ stage, written: [...written], last }),
    /** what it did, as its HDL says it: ready, wrote block <n>, read block <n> */
    log: () => [...log],
  };
  return s;
}

/** The card's SPI side: edge(sck, mosi, cs) at each change of SCK or CS (levels '0' / '1') returns MISO's level now
 *  ('0', '1', or 'Z' while CS is high); the card's. */
export function createSdSpi(card = createSd()) {
  let sck = '0', cs = '1', bits = 0, rx = 0, tx = 0xff, next = 0xff, miso = 'Z';
  const bit = () => ((tx >> (7 - (bits % 8))) & 1 ? '1' : '0');
  return {
    card,
    /** unpowered: MISO released, the bus at rest, the card off */
    off() { sck = '0'; cs = '1'; bits = 0; next = 0xff; miso = 'Z'; card.powerOff(); },
    edge(c, mosi, sel) {
      if (sel !== cs) {
        cs = sel;
        if (cs === '1') { card.deselect(); miso = 'Z'; } else { bits = 0; tx = next; miso = bit(); }
      }
      if (c !== sck) {
        sck = c;
        if (cs === '1') { if (c === '1') card.clocks(1); return miso; }
        if (c === '1') { rx = ((rx << 1) | (mosi === '1' ? 1 : 0)) & 0xff; bits++; if (bits % 8 === 0) next = card.exchange(rx); }
        else { if (bits % 8 === 0) tx = next; miso = bit(); }
      }
      return miso;
    },
  };
}
