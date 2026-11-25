// A System's nodes programmed on their boards, from the interface (#5489's part 3, #5447): the System row's Program All
// and a node's Program Node. The steps first (GET /projects/:p/program-plan: each node's board matched by its USB id);
// a node whose board is missing or not told apart from another asks which connected board it is (why, in the console
// with the job's plan), the user's choice an
// override of the match (Skip: not programmed); then the local server's job (POST /projects/:p/program-system,
// server/system-program.js), its lines in the console as a run of their own. The browser edition says the boards of a
// System are programmed by the local server for now.
import { S } from './app.js';
import { api, followJob } from './api.js';
import { logError, startRun } from './console.js';
import { runState } from './state-run.js';
import { procState } from './state-proc.js';
import { dialog, h } from './ui.js';
import { deviceText } from '/core/system-usb.js';

const cls = line => (/^ERROR/.test(line) ? 'err' : /^WARNING/.test(line) ? 'warn' : '');

// the board of the step `s` picked by the user among `devices`: its serial number or port, or null (skipped)
async function pickBoard(s, devices) {
  const keyed = devices.filter(d => d.serial || d.port);
  if (!keyed.length) return null;
  const sel = h('select', { class: 'sys-pick-board' }, ...keyed.map(d => h('option', { value: d.serial || d.port }, deviceText(d))));
  return dialog({
    title: 'Choose the Board',
    body: h('div', {}, h('p', {}, `The board to program the node ${s.id} on:`), sel),
    buttons: [{ label: 'Program', value: 'pick', primary: true }, { label: 'Skip', value: null }],
  }).then(v => (v ? sel.value : null));
}

/** The node `node` (its id), or every node of the System ('*'), programmed on its board; whether it ended well. One run
 *  at a time, as an implementation. */
export async function runProgramNodes(node = '*') {
  const name = node === '*' ? 'Program All' : `Program Node (System node ${node})`;
  if (procState.busy) { logError('A process is already running (use Stop to cancel it)'); return false; }
  if (api.standalone) { logError(`${name}: a System's boards are programmed by the local server for now (the browser edition programs an FPGA project's board)`); return false; }
  let plan;
  try { plan = await api.programPlan(S.project.name, node); } catch (e) { logError(`${name}: ${e.message}`); return false; }
  const chosen = {};
  for (const s of plan.steps.filter(x => x.choose)) {
    const key = await pickBoard(s, plan.devices);
    if (key != null) chosen[s.id] = key;
  }
  procState.busy = true;
  const R = startRun({ process: name, source: 'impl' });
  try {
    const { job } = await api.programSystem(S.project.name, node, chosen);
    runState.currentJob = job;
    runState.stopRequested = false;
    const res = await followJob(job, line => R.log(line, cls(line)));
    if (runState.stopRequested) { R.log('\nProcess stopped by the user.', 'info'); return false; }
    if (res.status === 'ok') { R.log(`\nProcess "${name}" completed successfully`, 'ok'); return true; }
    R.log(`\nProcess failed: ${res.error || 'see log'}`, 'err', { diag: !!res.error });
    return false;
  } catch (e) {
    R.log(`Process "${name}" failed: ${e.message}`, 'err');
    return false;
  } finally { procState.busy = false; runState.currentJob = null; }
}
