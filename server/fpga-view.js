// The FPGA view's model off the server's thread (#4774): the route GET /projects/:p/fpga-view (server/impl-routes.js)
// asks fpgaViewModel, which builds it in one worker thread (server/fpga-view-worker.js: the routed design and the
// device's grid parsed, the last grids kept), the server's other requests answered meanwhile; the requests for the
// same model while it is built share it (one parse). An idle worker does not keep the process alive (only while a model
// is built); a worker that stops fails its requests and the next one starts another.
import { Worker } from 'node:worker_threads';

let worker = null, nextId = 1;
const waiting = new Map();   // id -> { resolve, reject }
const building = new Map();  // key -> the model's promise

function workerOf() {
  if (worker) return worker;
  const w = worker = new Worker(new URL('./fpga-view-worker.js', import.meta.url));
  const stop = err => {
    if (worker === w) worker = null;
    for (const r of waiting.values()) r.reject(err);
    waiting.clear();
  };
  w.on('message', ({ id, model, error }) => {
    const r = waiting.get(id);
    if (!r) return;
    waiting.delete(id);
    if (!waiting.size) w.unref();
    if (error) r.reject(new Error(error)); else r.resolve(model);
  });
  w.on('error', e => stop(e));
  w.on('exit', code => stop(new Error(`the FPGA view's worker stopped (${code})`)));
  return w;
}

/** The model of a job (server/fpga-view-worker.js buildModel's), built in the worker; key: what makes it the same
 *  model (its files and their times): the requests for a key being built share its promise. */
export function fpgaViewModel(job, key) {
  if (building.has(key)) return building.get(key);
  const p = new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    const w = workerOf();
    w.ref();
    w.postMessage({ id, job });
  }).finally(() => building.delete(key));
  building.set(key, p);
  return p;
}

/** The worker ended (tests; a server closed): the requests in flight fail. */
export async function stopFpgaViewWorker() {
  const w = worker;
  worker = null;
  if (w) await w.terminate();
}
