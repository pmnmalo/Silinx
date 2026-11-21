// The checks of an HDL file as one types in a Web Worker (#4773, web/js/hdl-check-worker.js): the page answers while
// the project is compiled and the file's modules elaborated, and the worker keeps the parses from one check to the
// next. A newer check of the same file makes the older one's answer unused. Where no worker starts (a worker that
// failed, a browser without them), the check runs in the page.
import { hdlCheck } from '/core/hdl-check.js';

let worker = null, failed = false, nextId = 1;
const waiting = new Map();   // id -> resolve
const latest = new Map();    // path -> the id of its last check

function workerOf() {
  if (worker || failed) return worker;
  try {
    // (the standalone edition's, from a Blob: a classic worker, which a page opened from file:// can start, #512)
    const src = globalThis.SILINX_HDL_WORKER_SRC;
    worker = src ? new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))) : new Worker('/js/hdl-check-worker.js', { type: 'module' });
  } catch { failed = true; return null; }
  worker.onmessage = ({ data }) => { const r = waiting.get(data.id); waiting.delete(data.id); r?.(data); };
  worker.onerror = e => {
    e.preventDefault?.();
    failed = true; worker?.terminate(); worker = null;
    for (const r of waiting.values()) r({ inPage: true });
    waiting.clear();
  };
  return worker;
}

/** hdlCheck(job) in the worker (job: { path, sources, lint, clean }, plain data): its { diags, info }, or null when a
 *  newer check of job.path was asked meanwhile. */
export async function checkLive(job) {
  const id = nextId++;
  latest.set(job.path, id);
  const w = workerOf();
  let r = w ? await new Promise(resolve => { waiting.set(id, resolve); w.postMessage({ id, job }); }) : { inPage: true };
  if (latest.get(job.path) !== id) return null;
  if (r.inPage) r = hdlCheck(job);
  if (r.error) throw new Error(r.error);
  return { diags: r.diags, info: r.info };
}
