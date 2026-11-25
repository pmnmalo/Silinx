// A System's FPGA node implemented on its own board, from the interface (#5446, roadmap #4695's phase 3): its node's row's
// Synthesize, Implement Design and Generate Programming File, and the System's row's Implement System (every FPGA node,
// one after another): the local server's job (server/system-implement.js, POST /projects/:p/implement with { node }),
// its lines in the console as a run of its own; the browser edition says it is the local server's for now.
import { S } from './app.js';
import { api, followJob } from './api.js';
import { logError, startRun } from './console.js';
import { runState } from './state-run.js';
import { procState } from './state-proc.js';

const cls = line => (/^ERROR/.test(line) ? 'err' : /^WARNING/.test(line) ? 'warn' : '');

/** The node `node` (its id, or '*' every FPGA node) implemented up to `steps`, its process named `name`; whether it ended
 *  well. One run at a time, as the project's own implementation. */
export async function runNodeImpl(node, steps, name) {
  if (procState.busy) { logError('An implementation is already running (use Stop to cancel it)'); return false; }
  if (api.standalone) { logError(`${name}: a System's node is implemented by the local server for now (the browser edition implements an FPGA project)`); return false; }
  procState.busy = true;
  const what = node === '*' ? name : `${name} (System node ${node})`;
  const R = startRun({ process: what, source: 'impl' });
  try {
    const { job } = await api.implement(S.project.name, { steps, node });
    runState.currentJob = job;
    runState.stopRequested = false;
    const res = await followJob(job, line => R.log(line, cls(line)));
    if (runState.stopRequested) { R.log('\nProcess stopped by the user.', 'info'); return false; }
    if (res.status === 'ok') { R.log(`\nProcess "${what}" completed successfully`, 'ok'); return true; }
    R.log(`\nProcess failed: ${res.error || 'see log'}`, 'err', { diag: !!res.error });
    return false;
  } catch (e) {
    R.log(`Process "${what}" failed: ${e.message}`, 'err');
    return false;
  } finally {
    procState.busy = false; runState.currentJob = null;
    // (its node's build plan changed: the Implement tree's marks, #5581)
    (await import('./system-implement-tree.js')).planChanged({ draw: true });
  }
}
