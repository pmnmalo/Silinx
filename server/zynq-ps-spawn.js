// Silinx - where a Zynq PS's program runs in Node (#4689): a worker_threads Worker (server/zynq-ps-worker.js), its start
// waited for, not keeping the process alive. Imported for its effect, as server/esp32-spawn.js is, by what runs a System
// here (the MCP server's simulations, the tests).
import { Worker } from 'node:worker_threads';
import { setZynqPsSpawner } from '../core/system-sim-zynq.js';

setZynqPsSpawner(async (sab) => {
  const w = new Worker(new URL('./zynq-ps-worker.js', import.meta.url), { workerData: { sab } });
  await new Promise((ok, fail) => { w.once('message', ok); w.once('error', fail); });
  w.unref();
  return { terminate: () => w.terminate() };
});
