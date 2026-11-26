// ngspice's worker thread (#5386, server/ngspice.js): eecircuit-engine's module (workerData.module, the file checked by
// ngspiceModule) started once, then each netlist received run in turn: { id, netlist } → { id, result, errors, info } or
// { id, error }.
import { parentPort, workerData } from 'node:worker_threads';

const { Simulation } = await import(workerData.module);
const sim = new Simulation();
await sim.start();
let queue = Promise.resolve();
parentPort.on('message', ({ id, netlist }) => {
  queue = queue.then(async () => {
    try {
      sim.setNetList(netlist);
      const r = await sim.runSim();
      parentPort.postMessage({ id, result: { dataType: r.dataType, data: r.data.map((d) => ({ name: d.name, values: d.values })) }, errors: sim.getError(), info: sim.getInfo() });
    } catch (e) {
      parentPort.postMessage({ id, error: e?.message ?? String(e) });
    }
  });
});
