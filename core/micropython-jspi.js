// Silinx - Silinx's MicroPython build for the ESP32 node's JSPI back end (#5658; built by scripts/micropython-wasm/ and
// .github/workflows/micropython-wasm.yml, published as a release of Silinx's repository): its files, where they are and
// their SHA-256. Not in node_modules nor in the release zip: the local server downloads each once, checks it and keeps it
// (server/micropython-jspi.js), and serves it to the page (/vendor/micropython-jspi/<file>). MicroPython: MIT; its
// module silinx_jspi and silinx-api.js: AGPL-3.0-only.
//
// Isomorphic ES module, no DOM, no imports.

/** The release the files are taken from. */
export const MICROPYTHON_JSPI_RELEASE = 'micropython-wasm-v1.29.0-1';
const URL_OF = file => `https://github.com/pmnmalo/Silinx/releases/download/${MICROPYTHON_JSPI_RELEASE}/${file}`;

/** The files: { file (as served), url, sha256, what }. */
export const MICROPYTHON_JSPI_FILES = [
  { file: 'micropython.mjs', url: URL_OF('micropython.mjs'), sha256: '53e8ff623952fcd3e680148c56fb4c26f3ad5609854886fb50f3b6941a774bee', what: 'Silinx\'s MicroPython v1.29.0 for JSPI (its module)' },
  { file: 'micropython.wasm', url: URL_OF('micropython.wasm'), sha256: 'abe8bd4c5e59bfb25954217433b1e102bc9ba0d81524eb710b0594d60cd49580', what: 'Silinx\'s MicroPython v1.29.0 for JSPI (its WebAssembly)' },
];

/** The pins (#5649, scripts/check-pins.mjs): each file's SHA-256 against what its address serves. */
export const PINNED = MICROPYTHON_JSPI_FILES.map(f => ({ kind: 'sha256', name: `${f.what}, ${MICROPYTHON_JSPI_RELEASE}`, url: f.url, sha256: f.sha256,
  update: 'a new build: the workflow micropython-wasm run by hand on main with the next build number, then MICROPYTHON_JSPI_RELEASE and the SHA-256s here (its SHA256SUMS), the ESP32 node\'s tests' }));
