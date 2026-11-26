// Silinx - an ESP32 node's MicroPython in a Node Worker (#5495: the MCP server's simulations, the tests): the engine
// (core/esp32-engine.js) on the shared buffer the node gave, MicroPython's WebAssembly port (its settrace build) from
// node_modules; `ready` said to the node once it is loaded. The spawner (setEsp32Spawner) is server/esp32-spawn.js.
import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { runEsp32Engine } from '../core/esp32-engine.js';

const require = createRequire(import.meta.url);
const PKG = '@micropython/micropython-webassembly-pyscript';
runEsp32Engine({
  sab: workerData.sab,
  load: async () => ({ loadMicroPython: (await import(PKG)).loadMicroPython, url: require.resolve(`${PKG}/micropython-settrace.wasm`) }),
  ready: () => parentPort.postMessage('ready'),
});
