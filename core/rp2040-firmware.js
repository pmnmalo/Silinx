// Silinx - the RP2040 node's firmware (#5494, docs/SYSTEMS.md): MicroPython's own firmware for the Raspberry Pi Pico
// (its .uf2, MIT, micropython.org's) and the RP2040's bootrom (Raspberry Pi's, revision B1; BSD-3-Clause but its float
// library, mufplib, Mark Owen's: for the RP2040 alone or under GPLv2). Silinx does not ship them: the local server
// downloads each once from its pinned address, checks its SHA-256, keeps it (server/rp2040-firmware.js) and serves it to
// the page (/vendor/rp2040/<file>). The bootrom comes as rp2040js's copy (a TypeScript array of its 32-bit words).
//
// Isomorphic ES module, no DOM, no imports.

/** The files: { file (as served), url, sha256 (of what is downloaded), what, licence, words (a TypeScript Uint32Array
 *  to read into bytes) }. */
export const RP2040_FILES = [
  { file: 'micropython-rpi-pico-v1.24.1.uf2', url: 'https://micropython.org/resources/firmware/RPI_PICO-20241129-v1.24.1.uf2',
    sha256: 'a41b7dbadfe4f399a10bd344002b365427ad033de993cf372c29c884b33a4cdf', what: 'MicroPython v1.24.1 for the Raspberry Pi Pico', licence: 'MIT (MicroPython, with the Pico SDK\'s BSD-3-Clause and TinyUSB\'s MIT)' },
  { file: 'rp2040-bootrom-b1.bin', url: 'https://raw.githubusercontent.com/wokwi/rp2040js/f9becba867f6d7afbf99551270cc9a2e841742eb/demo/bootrom.ts',
    sha256: '99f8a1f813ce3aa9415884de3fb6c5b962d3c6fa0394b05413ad3c7b3c39ec62', what: 'the RP2040\'s bootrom, revision B1 (Raspberry Pi\'s pico-bootrom)', licence: 'BSD-3-Clause; its mufplib for the RP2040 alone or GPL-2.0', words: true },
];

/** The file `file` of RP2040_FILES, or null. */
export const rp2040File = file => RP2040_FILES.find(f => f.file === file) || null;

/** A TypeScript array of 32-bit words (`new Uint32Array([0x…, …])`) as its bytes (little-endian), or null. */
export function wordsBytes(text) {
  const body = /new Uint32Array\(\[([\s\S]*?)\]\)/.exec(String(text))?.[1];
  if (!body) return null;
  const words = [...body.matchAll(/0x[0-9a-f]+/gi)].map(m => parseInt(m[0], 16));
  return new Uint8Array(Uint32Array.from(words).buffer);
}
