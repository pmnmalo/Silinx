// A System built by its plan, from the interface (#5489, roadmap #5479's phase 2): the System row's Build Plan (each
// node's build, image, programmer and state, one line a node, the FPGA nodes first: GET /projects/:p/build-plan) and
// Build All (the nodes not up to date built in that order: POST /projects/:p/build with { node: '*' },
// server/system-build-all.js), and Connected Boards (the boards matched to the nodes by their USB id, #5489's part 2),
// their lines in the console as a run of their own. The browser edition says a System is built
// by the local server for now.
import { S } from './app.js';
import { api, followJob } from './api.js';
import { logError, startRun } from './console.js';
import { runState } from './state-run.js';
import { procState } from './state-proc.js';
import { saveAll } from './processes.js';
import { refreshSystem } from './system-firmware-ui.js';
import { planLines } from '/core/system-plan.js';

const cls = line => (/^ERROR/.test(line) ? 'err' : /^WARNING/.test(line) ? 'warn' : '');
const LOCAL = name => `${name}: a System is built by the local server for now (the browser edition implements an FPGA project and takes a node's .hex made elsewhere)`;

/** The System's build plan said in the console. */
export async function runBuildPlan() {
  const name = 'Build Plan';
  if (api.standalone) { logError(LOCAL(name)); return false; }
  // (the sources as the editors show them: saved first, so that the plan reads them)
  if (!await saveAll()) return false;
  const R = startRun({ process: name, source: 'impl' });
  try {
    const plan = await api.buildPlan(S.project.name);
    const lines = planLines(plan);
    for (const l of lines.length ? lines : ['The System has no FPGA or microcontroller node to build.']) R.log(l);
    R.log(`\nProcess "${name}" completed successfully`, 'ok');
    return true;
  } catch (e) {
    R.log(`Process "${name}" failed: ${e.message}`, 'err');
    return false;
  }
}

/** The connected boards matched to the System's nodes by their USB id, said in the console (#5489's part 2: GET
 *  /projects/:p/boards, server/usb-devices.js): each device, then each node's board, or why it has none. */
export async function runConnectedBoards() {
  const name = 'Connected Boards';
  if (api.standalone) { logError(`${name}: the local server lists the boards connected to its computer (the browser edition sees only a board it was given, when it programs it)`); return false; }
  if (!await saveAll()) return false;
  const R = startRun({ process: name, source: 'impl' });
  try {
    const r = await api.connectedBoards(S.project.name);
    for (const l of r.lines) R.log(l, cls(l));
    const missing = r.nodes.filter(n => !n.device).length;
    R.log(`\nProcess "${name}" completed successfully${missing ? ` with ${missing} warning(s)` : ''}`, 'ok');
    return true;
  } catch (e) {
    R.log(`Process "${name}" failed: ${e.message}`, 'err');
    return false;
  }
}

/** Every node of the System not up to date built (`node`: one node's id, built whatever its state), its document `file`;
 *  whether it ended well. One run at a time, as an implementation. */
export async function runBuildAll(file, node = '*') {
  const name = node === '*' ? 'Build All' : `Build (System node ${node})`;
  if (procState.busy) { logError('A process is already running (use Stop to cancel it)'); return false; }
  if (api.standalone) { logError(LOCAL(name)); return false; }
  if (!await saveAll()) return false;
  procState.busy = true;
  const R = startRun({ process: name, source: 'impl' });
  let ok = false;
  try {
    const { job } = await api.buildSystem(S.project.name, node);
    runState.currentJob = job;
    runState.stopRequested = false;
    const res = await followJob(job, line => R.log(line, cls(line)));
    if (runState.stopRequested) { R.log('\nProcess stopped by the user.', 'info'); return false; }
    ok = res.status === 'ok';
    if (ok) R.log(`\nProcess "${name}" completed successfully`, 'ok');
    else R.log(`\nProcess failed: ${res.error || 'see log'}`, 'err', { diag: !!res.error });
    return ok;
  } catch (e) {
    R.log(`Process "${name}" failed: ${e.message}`, 'err');
    return false;
  } finally {
    procState.busy = false; runState.currentJob = null;
    // (a firmware made: a file of the project, the System's firmware set when it had none)
    await refreshSystem(file);
  }
}
