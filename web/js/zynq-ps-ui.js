// A Zynq board's PS program compiled from the interface (#4687, part 2): Compile PS Program, a process of a System's Zynq
// node's row, of its PS row and of a Board project's on a Zynq board (its PS row, its ps/ files), the local server's job
// (server/zynq-ps-compile.js, arm-none-eabi-gcc: POST /projects/:p/ps with { node }, none in a Board project), its errors
// and warnings in the console as a run of its own, by file and line; its ELF in the build folder, which #4687's next part
// loads over JTAG: Run PS Program, the local server's OpenOCD (server/zynq-ps-run.js, POST /projects/:p/ps-run), loaded
// and started on CPU 0. The browser edition has no compiler (#5904): it says a server is needed.
import { S } from './app.js';
import { api, followJob } from './api.js';
import { logError, startRun } from './console.js';
import { runState } from './state-run.js';
import { procState } from './state-proc.js';
import { saveAll } from './processes.js';
import { isPsPath, psOfBoard } from '/core/zynq-ps.js';

const RUNS = {
  compile: { name: 'Compile PS Program', call: (p, n) => api.psProgram(p, n),
    browser: 'a Zynq\'s PS program is compiled by arm-none-eabi-gcc on the local server or its ISE machine (the browser edition has no compiler): run Silinx\'s server' },
  run: { name: 'Run PS Program', call: (p, n) => api.psRun(p, n),
    browser: 'a Zynq\'s PS program is loaded and started by the local server\'s OpenOCD for now (the browser edition has no compiler): run Silinx\'s server' },
};
const cls = line => (/^ERROR/.test(line) ? 'err' : /^WARNING/.test(line) ? 'warn' : '');

/** The PS program a selection of the Design pane compiles: { node } (a System's Zynq node's id, or null: a Board
 *  project's), or null: its PS row, a Zynq node's row, a Board project's ps/ file on a Zynq board. */
function psTarget(sel) {
  if (sel?.type === 'ps') return { node: sel.node ?? null };
  if (sel?.type === 'node' && sel.kind === 'fpga' && psOfBoard(sel.board, sel.variant)) return { node: sel.node };
  if (sel?.type === 'file' && !S.project?.kind && psOfBoard(S.project?.board) && isPsPath(sel.file)) return { node: null };
  return null;
}

/** Its process (Compile PS Program), or none. */
export const psProcesses = sel => {
  const t = psTarget(sel);
  return t ? [{ id: 'ps-compile', label: RUNS.compile.name, ico: 'process', run: () => runPs(t.node, 'compile') },
    { id: 'ps-run', label: RUNS.run.name, ico: 'board', run: () => runPs(t.node, 'run') }] : [];
};

/** The PS program of the node `node` (a System's Zynq node's id; null: a Board project's) compiled ('compile') or
 *  loaded and started ('run'); whether it ended well. One run at a time, as an implementation. */
async function runPs(node = null, kind = 'compile') {
  const { name: NAME, call, browser } = RUNS[kind];
  if (procState.busy) { logError('A process is already running (use Stop to cancel it)'); return false; }
  if (api.standalone) {
    logError(`${NAME}: ${browser}`);
    return false;
  }
  // (the program as the editor shows it: saved first)
  if (!await saveAll()) return false;
  procState.busy = true;
  const what = node ? `${NAME} (System node ${node})` : NAME;
  const R = startRun({ process: what, source: 'impl' });
  try {
    const { job } = await call(S.project.name, node);
    runState.currentJob = job;
    runState.stopRequested = false;
    const res = await followJob(job, line => R.log(line, cls(line)));
    if (runState.stopRequested) { R.log('\nProcess stopped by the user.', 'info'); return false; }
    const ok = res.status === 'ok';
    if (ok) R.log(`\nProcess "${what}" completed successfully`, 'ok');
    else R.log(`\nProcess failed: ${res.error || 'see log'}`, 'err', { diag: !!res.error });
    return ok;
  } catch (e) {
    R.log(`Process "${what}" failed: ${e.message}`, 'err');
    return false;
  } finally {
    procState.busy = false; runState.currentJob = null;
  }
}
