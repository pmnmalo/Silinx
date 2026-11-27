// An ELF32 ARM executable written (#4687's tests: core/elf32.js read against it; the stand-in for arm-none-eabi-gcc's
// output): its header, one program header per segment ({ addr, bytes, memsz, type }: a PT_LOAD by default), then the
// segments' bytes, as the System V ABI lays them out. Options: entry, machine (40, ARM), type (2, an executable), cls (1,
// 32-bit), data (1, little-endian).
export function writeElf32(segments, { entry = 0, machine = 40, type = 2, cls = 1, data = 1 } = {}) {
  const ph = 52, phsize = 32, start = ph + phsize * segments.length;
  const size = start + segments.reduce((s, x) => s + x.bytes.length, 0);
  const b = new Uint8Array(size), v = new DataView(b.buffer);
  b.set([0x7f, 0x45, 0x4c, 0x46, cls, data, 1]);
  v.setUint16(16, type, true); v.setUint16(18, machine, true); v.setUint32(20, 1, true);
  v.setUint32(24, entry, true); v.setUint32(28, ph, true); v.setUint16(40, 52, true);
  v.setUint16(42, phsize, true); v.setUint16(44, segments.length, true);
  let off = start;
  segments.forEach((s, i) => {
    const o = ph + i * phsize;
    v.setUint32(o, s.type ?? 1, true); v.setUint32(o + 4, off, true); v.setUint32(o + 8, s.addr, true); v.setUint32(o + 12, s.addr, true);
    v.setUint32(o + 16, s.bytes.length, true); v.setUint32(o + 20, s.memsz ?? s.bytes.length, true); v.setUint32(o + 24, 7, true);
    b.set(s.bytes, off); off += s.bytes.length;
  });
  return b;
}
