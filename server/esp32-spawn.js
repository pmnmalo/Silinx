// Silinx - where an ESP32 node's MicroPython runs in Node (#5495): a worker_threads Worker (server/esp32-worker.js), its
// start waited for (its MicroPython loaded), not keeping the process alive. Imported for its effect, as
// server/rp2040-firmware.js is, by what runs a System here (the MCP server's simulations, the tests).
import { Worker } from 'node:worker_threads';
import { setEsp32Spawner } from '../core/system-sim-esp32.js';

setEsp32Spawner(async (sab) => {
  const w = new Worker(new URL('./esp32-worker.js', import.meta.url), { workerData: { sab } });
  await new Promise((ok, fail) => { w.once('message', ok); w.once('error', fail); });
  w.unref();
  return { terminate: () => w.terminate() };
});
