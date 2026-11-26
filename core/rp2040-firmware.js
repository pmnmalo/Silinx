// Silinx - the RP2040 node's firmware (#5494, docs/SYSTEMS.md): MicroPython's own firmware for the Raspberry Pi Pico
// (its .uf2, MIT, micropython.org's), CircuitPython's (#5697: its .uf2, MIT, Adafruit's) and the RP2040's bootrom
// (Raspberry Pi's, revision B1; BSD-3-Clause but its float library, mufplib, Mark Owen's: for the RP2040 alone or under
// GPLv2). Silinx does not ship them: the local server downloads each once from its pinned address, checks its SHA-256,
// keeps it (server/rp2040-firmware.js) and serves it to the page (/vendor/rp2040/<file>). The bootrom comes as rp2040js's
// copy (a TypeScript array of its 32-bit words).
//
// Isomorphic ES module, no DOM, no imports.

/** The Pico's Python firmwares (#5697): a node's `runtime`, MicroPython when it has none. */
export const RP2040_RUNTIMES = ['micropython', 'circuitpython'];
export const RUNTIME_NAMES = { micropython: 'MicroPython', circuitpython: 'CircuitPython' };

/** The files: { file (as served), url, sha256 (of what is downloaded), what, licence, runtime (a firmware's: one of
 *  RP2040_RUNTIMES), words (a TypeScript Uint32Array to read into bytes), bootOut (CircuitPython's boot_out.txt's first
 *  lines on rp2040js: its version, its board, the UID rp2040js's flash gives) }. */
export const RP2040_FILES = [
  { file: 'micropython-rpi-pico-v1.24.1.uf2', url: 'https://micropython.org/resources/firmware/RPI_PICO-20241129-v1.24.1.uf2', runtime: 'micropython',
    sha256: 'a41b7dbadfe4f399a10bd344002b365427ad033de993cf372c29c884b33a4cdf', what: 'MicroPython v1.24.1 for the Raspberry Pi Pico', licence: 'MIT (MicroPython, with the Pico SDK\'s BSD-3-Clause and TinyUSB\'s MIT)' },
  { file: 'circuitpython-rpi-pico-v10.3.2.uf2', url: 'https://downloads.circuitpython.org/bin/raspberry_pi_pico/en_US/adafruit-circuitpython-raspberry_pi_pico-en_US-10.3.2.uf2', runtime: 'circuitpython',
    sha256: 'e62df4b66a4f2f68c5920dbca151e1a2caccb66bd1de7545e8d3fe19cfc7b913', what: 'CircuitPython 10.3.2 for the Raspberry Pi Pico', licence: 'MIT (CircuitPython, Adafruit\'s, with MicroPython\'s MIT, the Pico SDK\'s BSD-3-Clause and TinyUSB\'s MIT)',
    bootOut: 'Adafruit CircuitPython 10.3.2 on 2026-11-11; Raspberry Pi Pico with rp2040\r\nBoard ID:raspberry_pi_pico\r\nUID:0000000000000000\r\n' },
  { file: 'rp2040-bootrom-b1.bin', url: 'https://raw.githubusercontent.com/wokwi/rp2040js/f9becba867f6d7afbf99551270cc9a2e841742eb/demo/bootrom.ts',
    sha256: '99f8a1f813ce3aa9415884de3fb6c5b962d3c6fa0394b05413ad3c7b3c39ec62', what: 'the RP2040\'s bootrom, revision B1 (Raspberry Pi\'s pico-bootrom)', licence: 'BSD-3-Clause; its mufplib for the RP2040 alone or GPL-2.0', words: true },
];

/** The file `file` of RP2040_FILES, or null. */
export const rp2040File = file => RP2040_FILES.find(f => f.file === file) || null;

/** A runtime's files (one of RP2040_RUNTIMES, MicroPython's when none): { uf2, bootrom } (RP2040_FILES' entries); throws
 *  for another. */
export function runtimeFiles(runtime = 'micropython') {
  const uf2 = RP2040_FILES.find(f => f.runtime === (runtime || 'micropython'));
  if (!uf2) throw new Error(`no RP2040 firmware '${runtime}' (${RP2040_RUNTIMES.join(', ')})`);
  return { uf2, bootrom: RP2040_FILES.find(f => f.words) };
}

// The downloads, followed by the monthly Pins workflow (scripts/check-pins.mjs, #5649): each file's SHA-256 against the
// file served (a new release is a new address: its version, its address and SHA-256 above, and CircuitPython's bootOut
// read from a run: test/system-sim-circuitpython.test.js says it when it is not the firmware's)
const UPDATE = 'a newer release: its file, url and SHA-256 above (CircuitPython\'s bootOut too), then the RP2040 node\'s tests (test/system-sim-rp2040.test.js, test/system-sim-circuitpython.test.js)';
export const PINNED = [
  { kind: 'tag', name: 'the RP2040 node\'s MicroPython', repo: 'micropython/micropython', tag: 'v1.24.1', update: UPDATE },
  { kind: 'tag', name: 'the RP2040 node\'s CircuitPython', repo: 'adafruit/circuitpython', tag: '10.3.2', update: UPDATE },
  ...RP2040_FILES.map(f => ({ kind: 'sha256', name: `the RP2040 node's ${f.what}`, url: f.url, sha256: f.sha256, update: UPDATE })),
];

/** A TypeScript array of 32-bit words (`new Uint32Array([0x…, …])`) as its bytes (little-endian), or null. */
export function wordsBytes(text) {
  const body = /new Uint32Array\(\[([\s\S]*?)\]\)/.exec(String(text))?.[1];
  if (!body) return null;
  const words = [...body.matchAll(/0x[0-9a-f]+/gi)].map(m => parseInt(m[0], 16));
  return new Uint8Array(Uint32Array.from(words).buffer);
}
