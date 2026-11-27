// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// An ELF32 executable read (#4687): a Zynq's PS program, as arm-none-eabi-gcc links it, loaded over JTAG into the on-chip
// memory. Its header checked (ELF32, little-endian, ARM, an executable), its entry point, and the segments to load (the
// program headers' PT_LOAD: their physical address, their bytes; the rest of their memory, a .bss, zeroed by the program's
// startup). The ELF's layout as the System V ABI's and the ARM ELF's (ARM IHI 0044). Isomorphic module (browser + Node).

const PT_LOAD = 1;
const EM_ARM = 40;
const ET_EXEC = 2;

/**
 * The ELF executable `bytes` (a Uint8Array): { entry, segments: [{ addr, bytes, memsz }] (PT_LOAD's, by address), size
 * (the bytes loaded), memsz (the memory they take, a .bss included) } or { error }.
 */
export function readElf32(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (b.length < 52 || b[0] !== 0x7f || b[1] !== 0x45 || b[2] !== 0x4c || b[3] !== 0x46) return { error: 'not an ELF file' };
  if (b[4] !== 1) return { error: 'not a 32-bit ELF (ELFCLASS32)' };
  if (b[5] !== 1) return { error: 'not a little-endian ELF' };
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const h16 = o => v.getUint16(o, true), h32 = o => v.getUint32(o, true);
  if (h16(18) !== EM_ARM) return { error: `not an ARM program (its machine ${h16(18)})` };
  if (h16(16) !== ET_EXEC) return { error: 'not an executable (an object or a shared library: link it)' };
  const phoff = h32(28), phentsize = h16(42), phnum = h16(44);
  if (phentsize < 32 || phoff + phnum * phentsize > b.length) return { error: 'its program headers are cut short' };
  const segments = [];
  for (let i = 0; i < phnum; i++) {
    const o = phoff + i * phentsize;
    if (h32(o) !== PT_LOAD) continue;
    const off = h32(o + 4), paddr = h32(o + 12), filesz = h32(o + 16), memsz = h32(o + 20);
    if (off + filesz > b.length) return { error: `its segment at 0x${paddr.toString(16)} is cut short` };
    if (memsz) segments.push({ addr: paddr, bytes: b.slice(off, off + filesz), memsz });
  }
  segments.sort((x, y) => x.addr - y.addr);
  return { entry: h32(24), segments, size: segments.reduce((s, x) => s + x.bytes.length, 0), memsz: segments.reduce((s, x) => s + x.memsz, 0) };
}
