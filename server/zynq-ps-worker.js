// Silinx - a Zynq PS's program in a Node Worker (#4689: the MCP server's simulations, the tests): the engine
// (core/zynq-ps-engine.js) on the shared buffer the node gave; `ready` said to the node once it waits for its program.
// The spawner (setZynqPsSpawner) is server/zynq-ps-spawn.js.
import { parentPort, workerData } from 'node:worker_threads';
import { runZynqPsEngine } from '../core/zynq-ps-engine.js';

runZynqPsEngine({ sab: workerData.sab, ready: () => parentPort.postMessage('ready') });
