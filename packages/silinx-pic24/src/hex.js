// silinx-pic24 - XC16's Intel HEX (#5480): its records (data, end of file, extended linear and segment addresses),
// their checksums, and the program words they hold. In it a program address is twice its byte address over two:
// each instruction word takes four bytes, its low, middle and high bytes and a phantom 0, so the HEX's byte
// address is the program address * 2.

import { FLASH_WORDS, FLASH_END, ERASED } from './device.js';

/** The HEX's program words: { program (the flash's words, erased where it has none), config (the words at or above
 *  0x800000 by address), words (how many it set), warnings }. Throws on a malformed record. */
export function parseHex(text) {
  const bytes = new Map();
  let base = 0, ended = false, line = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    line++;
    const s = raw.trim();
    if (!s) continue;
    if (ended) throw new Error(`line ${line}: a record after the end of file`);
    if (s[0] !== ':' || s.length < 11 || s.length % 2 === 0 || !/^:[0-9A-Fa-f]+$/.test(s)) throw new Error(`line ${line}: not an Intel HEX record`);
    const rec = [];
    for (let i = 1; i < s.length; i += 2) rec.push(parseInt(s.slice(i, i + 2), 16));
    const [len, ah, al, type] = rec;
    if (rec.length !== len + 5) throw new Error(`line ${line}: its length is ${len}, its data ${rec.length - 5} bytes`);
    if (rec.reduce((a, b) => a + b, 0) & 0xff) throw new Error(`line ${line}: a wrong checksum`);
    const data = rec.slice(4, 4 + len);
    switch (type) {
      case 0: for (let i = 0; i < len; i++) bytes.set(base + ((ah << 8) | al) + i, data[i]); break;
      case 1: ended = true; break;
      case 2: base = ((data[0] << 8) | data[1]) << 4; break;
      case 4: base = ((data[0] << 8) | data[1]) * 0x10000; break;
      case 3: case 5: break;   // (a start address: the PIC24 starts at 0)
      default: throw new Error(`line ${line}: an unknown record type ${type}`);
    }
  }
  if (!ended) throw new Error('no end-of-file record');
  // the bytes by word: four HEX bytes a program word (the fourth, the phantom byte, ignored)
  const program = new Uint32Array(FLASH_WORDS).fill(ERASED), config = new Map(), warnings = [];
  const seen = new Map();
  for (const [a, b] of bytes) {
    const word = Math.floor(a / 4), k = a % 4;
    if (k === 3) continue;
    seen.set(word, ((seen.get(word) ?? ERASED) & ~(0xff << (8 * k))) | (b << (8 * k)));
  }
  let outside = 0;
  for (const [word, v] of seen) {
    const addr = word * 2;
    if (addr <= FLASH_END) program[word] = v >>> 0;
    else if (addr >= 0x800000) config.set(addr, v >>> 0);
    else outside++;
  }
  if (outside) warnings.push(`${outside} program word(s) beyond the flash's end (0x${FLASH_END.toString(16).toUpperCase()}) ignored`);
  return { program, config, words: seen.size, warnings };
}

/** Program words written as XC16's Intel HEX (four bytes a word, 16 a record), from program address `base`. */
export function writeHex(words, base = 0) {
  const lines = [], h2 = (v) => v.toString(16).toUpperCase().padStart(2, '0');
  let upper = -1;
  const bytes = [];
  for (let i = 0; i < words.length; i++) { const w = words[i]; bytes.push(w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, 0); }
  const start = base * 2;
  for (let i = 0, n; i < bytes.length; i += n) {
    const a = start + i;
    if (Math.floor(a / 0x10000) !== upper) {
      upper = Math.floor(a / 0x10000);
      const r = [2, 0, 0, 4, (upper >> 8) & 0xff, upper & 0xff];
      lines.push(`:${r.map(h2).join('')}${h2(-r.reduce((x, y) => x + y, 0) & 0xff)}`);
    }
    n = Math.min(16, 0x10000 - (a & 0xffff));   // (a record within its 64K page)
    const chunk = bytes.slice(i, i + n), r = [chunk.length, (a >> 8) & 0xff, a & 0xff, 0, ...chunk];
    lines.push(`:${r.map(h2).join('')}${h2(-r.reduce((x, y) => x + y, 0) & 0xff)}`);
  }
  return `${[...lines, ':00000001FF'].join('\n')}\n`;
}
