// The FPGA view's model built in a worker thread of the server (#4774, server/fpga-view.js): the routed design read
// and parsed, the device's grid (the Silinx toolchain's routing graph, gunzipped and parsed, ~10 MB; ISE's
// device.xdlrc), so that the server answers its other requests meanwhile. The last grids are kept by their file and
// its time: the same device's next design needs no new parse.
import { parentPort } from 'node:worker_threads';
import fs from 'node:fs/promises';

const KEEP = 2;
const grids = new Map();   // `${file}:${mtimeMs}` -> grid, the oldest first

async function gridOf(file, mtime, load) {
  const key = `${file}:${mtime}`;
  let g = grids.get(key);
  if (g) grids.delete(key);
  else g = await load();
  grids.set(key, g);
  while (grids.size > KEEP) grids.delete(grids.keys().next().value);
  return g;
}

/** job: { source: 'open', xdl, graph, graphMtime } (the Silinx toolchain's routed design and its device's graph) or
 *  { source: 'ise', xdl, xdlrc, xdlrcMtime }: the model ({ available: true, source?, …fpgaModel }). */
export async function buildModel(job) {
  if (job.source === 'open') {
    const { parseXdl, fpgaModel, deviceGrid, loadDeviceCache } = await import('../packages/silinx-fpga/src/node.js');
    const grid = await gridOf(job.graph, job.graphMtime, async () => deviceGrid(loadDeviceCache(job.graph)));
    return { available: true, source: 'open', ...fpgaModel(parseXdl(await fs.readFile(job.xdl, 'utf8')), grid) };
  }
  const { parseXdl, parseXdlrc, fpgaModel } = await import('../packages/silinx-fpga/src/parts.js');
  const device = await gridOf(job.xdlrc, job.xdlrcMtime, async () => parseXdlrc(await fs.readFile(job.xdlrc, 'utf8')));
  return { available: true, ...fpgaModel(parseXdl(await fs.readFile(job.xdl, 'utf8')), device) };
}

parentPort?.on('message', async ({ id, job }) => {
  try { parentPort.postMessage({ id, model: await buildModel(job) }); }
  catch (e) { parentPort.postMessage({ id, error: e.message }); }
});
