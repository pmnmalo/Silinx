// Silinx - a microcontroller node's firmware (#4698, docs/CODESIGN.md): an AVR's program memory read from a given file,
// an Intel HEX (`.hex`, the Arduino IDE's Export Compiled Binary) or an ELF (`.elf`, avr-gcc's), no compiler. Its errors
// (not a program, a broken record, too big for the flash) as the console says them. Isomorphic ES module, no DOM.

/** The ATmega328P's flash (bytes): 32 KB. */
export const FLASH_BYTES = 32768;
// avr-gcc's addresses of the data memory (an ELF's segment there is the RAM's, not the flash's)
const DATA_ORIGIN = 0x800000;
const EM_AVR = 83;

const hexByte = (s, i) => parseInt(s.slice(i, i + 2), 16);

/** An Intel HEX's bytes: { bytes: Uint8Array (the flash's), size (the highest address + 1) } or { error }. */
export function readIntelHex(text, flash = FLASH_BYTES) {
  const bytes = new Uint8Array(flash);
  let base = 0, size = 0, data = 0, ended = false;
  const lines = String(text).split(/\r?\n/);
  for (let n = 0; n < lines.length && !ended; n++) {
    const line = lines[n].trim();
    if (!line) continue;
    if (!/^:([0-9A-Fa-f]{2})+$/.test(line) || line.length < 11) return { error: `line ${n + 1} is not an Intel HEX record` };
    const len = hexByte(line, 1), addr = (hexByte(line, 3) << 8) | hexByte(line, 5), type = hexByte(line, 7);
    if (line.length !== 11 + 2 * len) return { error: `line ${n + 1}: its record's length is not ${len} bytes` };
    let sum = 0;
    for (let i = 1; i < line.length; i += 2) sum += hexByte(line, i);
    if (sum & 0xff) return { error: `line ${n + 1}: its checksum is wrong` };
    if (type === 0) {
      const at = base + addr;
      if (at + len > flash) return { error: `too big for the flash: it reaches ${at + len} bytes, the flash has ${flash}` };
      for (let i = 0; i < len; i++) bytes[at + i] = hexByte(line, 9 + 2 * i);
      size = Math.max(size, at + len);
      data += len;
    } else if (type === 1) ended = true;
    else if (type === 2) base = ((hexByte(line, 9) << 8) | hexByte(line, 11)) << 4;
    else if (type === 4) base = ((hexByte(line, 9) << 8) | hexByte(line, 11)) << 16;
    else if (type !== 3 && type !== 5) return { error: `line ${n + 1}: no Intel HEX record of type ${type}` };
  }
  if (!data) return { error: 'no program in it (no data record)' };
  return { bytes, size };
}

/** An AVR ELF's flash: { bytes, size } or { error } (its loadable segments at their physical addresses in the flash). */
export function readAvrElf(buf, flash = FLASH_BYTES) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length < 52 || b[0] !== 0x7f || b[1] !== 0x45 || b[2] !== 0x4c || b[3] !== 0x46) return { error: 'not an ELF file' };
  if (b[4] !== 1 || b[5] !== 1) return { error: 'not a 32-bit little-endian ELF (an AVR\'s)' };
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const machine = dv.getUint16(18, true);
  if (machine !== EM_AVR) return { error: `not an AVR program (its machine is ${machine}, an AVR's is ${EM_AVR})` };
  const phoff = dv.getUint32(28, true), phsize = dv.getUint16(42, true), phnum = dv.getUint16(44, true);
  const bytes = new Uint8Array(flash);
  let size = 0, data = 0;
  for (let i = 0; i < phnum; i++) {
    const p = phoff + i * phsize;
    if (p + 32 > b.length) return { error: 'its program headers are cut short' };
    const type = dv.getUint32(p, true), offset = dv.getUint32(p + 4, true), paddr = dv.getUint32(p + 12, true), filesz = dv.getUint32(p + 16, true);
    if (type !== 1 || !filesz || paddr >= DATA_ORIGIN) continue;   // (PT_LOAD in the flash only)
    if (offset + filesz > b.length) return { error: 'a segment is cut short' };
    if (paddr + filesz > flash) return { error: `too big for the flash: it reaches ${paddr + filesz} bytes, the flash has ${flash}` };
    bytes.set(b.subarray(offset, offset + filesz), paddr);
    size = Math.max(size, paddr + filesz);
    data += filesz;
  }
  if (!data) return { error: 'no program in it (no segment in the flash)' };
  return { bytes, size };
}

/**
 * A firmware file read (`name` its path: .hex or .elf; `data` its text or bytes): { program: Uint16Array (the flash's
 * words, as avr8js runs them), size } or { error: 'name: why' }.
 */
export function readFirmware(name, data, flash = FLASH_BYTES) {
  let r;
  if (/\.hex$/i.test(name)) r = readIntelHex(typeof data === 'string' ? data : new TextDecoder().decode(data), flash);
  else if (/\.elf$/i.test(name)) r = typeof data === 'string' ? { error: 'not an ELF file' } : readAvrElf(data, flash);
  else r = { error: 'a firmware is a .hex or an .elf' };
  if (r.error) return { error: `${name}: ${r.error}` };
  return { program: new Uint16Array(r.bytes.buffer), size: r.size };
}
