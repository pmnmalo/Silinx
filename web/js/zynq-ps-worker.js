// Web Worker: a Zynq PS's program (#4689, the Worker + Atomics back end): the engine (core/zynq-ps-engine.js) on the
// shared buffer its node sends; `ready` once it waits for its program. Made by core/system-sim-zynq.js before the run
// (prepareZynqPs), in a page cross-origin isolated (SharedArrayBuffer).
import { runZynqPsEngine } from '/core/zynq-ps-engine.js';

self.onmessage = (e) => {
  self.onmessage = null;
  runZynqPsEngine({ sab: e.data.sab, ready: () => self.postMessage('ready') });
};
