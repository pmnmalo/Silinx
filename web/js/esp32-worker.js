// Web Worker: an ESP32 node's MicroPython (#5495, the Worker + Atomics back end): the engine (core/esp32-engine.js) on
// the shared buffer its node sends, MicroPython's WebAssembly port (its settrace build) where the server serves it;
// `ready` once it is loaded. Made by core/system-sim-esp32.js before the run (prepareEsp32), in a page cross-origin
// isolated (#5648: SharedArrayBuffer).
import { runEsp32Engine } from '/core/esp32-engine.js';

const PKG = '/vendor/micropython-wasm';
self.onmessage = (e) => {
  self.onmessage = null;
  runEsp32Engine({
    sab: e.data.sab,
    load: async () => ({ loadMicroPython: (await import(`${PKG}/micropython.mjs`)).loadMicroPython, url: `${PKG}/micropython-settrace.wasm` }),
    ready: () => self.postMessage('ready'),
  });
};
