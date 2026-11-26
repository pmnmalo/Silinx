// A System's nodes programmed on their boards, from the interface (#5489's part 3, #5447): the System row's Program All
// and a node's Program Node. The steps first (GET /projects/:p/program-plan: each node's board matched by its USB id);
// a node whose board is missing or not told apart from another asks which connected board it is (why, in the console
// with the job's plan), the user's choice an
// override of the match (Skip: not programmed); then the local server's job (POST /projects/:p/program-system,
// server/system-program.js), its lines in the console as a run of their own. An Arduino node is loaded over Web Serial
// in the browser (#5448, web/js/system-serial-program.js): in the browser edition, and in the local server's Program
// Node when the user chooses Web Serial for its board; the browser edition's FPGA nodes are programmed by the local
// server for now, said.
import { S } from './app.js';
import { api, followJob } from './api.js';
import { logError, startRun } from './console.js';
import { runState } from './state-run.js';
import { procState } from './state-proc.js';
import { filesState } from './state-files.js';
import { dialog, h } from './ui.js';
import { deviceText } from '/core/system-usb.js';
import { programRefusal } from '/core/system-program.js';
import { systemBuildPlan } from '/core/system-plan.js';
import { shownSystem } from './design-system.js';
import { hasWebSerial, programOverWebSerial } from './system-serial-program.js';

const cls = line => (/^ERROR/.test(line) ? 'err' : /^WARNING/.test(line) ? 'warn' : '');

// the board of the step `s` picked by the user among `devices`: its serial number or port, WEB_SERIAL (an Arduino's, over
// Web Serial in the browser, `webSerial`), or null (skipped)
const WEB_SERIAL = Symbol('Web Serial');
async function pickBoard(s, devices, webSerial = false) {
  const keyed = devices.filter(d => d.serial || d.port);
  if (!keyed.length && !webSerial) return null;
  const sel = keyed.length ? h('select', { class: 'sys-pick-board' }, ...keyed.map(d => h('option', { value: d.serial || d.port }, deviceText(d)))) : null;
  const v = await dialog({
    title: 'Choose the Board',
    body: h('div', {}, h('p', {}, `The board to program the node ${s.id} on:`), sel || h('p', {}, 'No connected board was found by the local server.')),
    buttons: [...(sel ? [{ label: 'Program', value: 'pick', primary: true }] : []), ...(webSerial ? [{ label: 'Web Serial…', value: 'web', primary: !sel }] : []), { label: 'Skip', value: null }],
  });
  return v === 'web' ? WEB_SERIAL : v ? sel.value : null;
}

// the Arduino nodes `ids` loaded over Web Serial, one after another (`images`: each one's firmware; `refused`: { id:
// why } the others of the run, said first), as a run of its own named `name`; whether all ended well
async function overWebSerial(name, ids, images, refused = {}) {
  const sys = shownSystem()?.system;
  procState.busy = true;
  const R = startRun({ process: name, source: 'impl' });
  try {
    const done = [], failed = [], log = (l, c) => R.log(l, c ?? cls(l));
    for (const [id, why] of Object.entries(refused)) log(`ERROR: System node ${id}: not programmed: ${why}`);
    for (const id of ids) {
      const node = sys?.nodes.find(n => n.id === id);
      if (node && await programOverWebSerial({ project: S.project.name, node, image: images[id], log })) done.push(id); else failed.push(id);
    }
    const no = [...failed, ...Object.keys(refused)];
    log(`Program: ${done.length} node(s) programmed${done.length ? ` (${done.join(', ')})` : ''}, ${failed.length} failed${failed.length ? ` (${failed.join(', ')})` : ''}, ${Object.keys(refused).length} not programmed${Object.keys(refused).length ? ` (${Object.keys(refused).join(', ')})` : ''}.`);
    if (!no.length) { R.log(`\nProcess "${name}" completed successfully`, 'ok'); return true; }
    R.log(`\nProcess failed: the System node(s) ${no.join(', ')} not programmed`, 'err');
    return false;
  } finally { procState.busy = false; }
}

// the browser edition's Program All / Program Node: the Arduino nodes over Web Serial, the others refused (an FPGA's by
// the local server for now; a PIC24's and a MicroPython node's not by Silinx yet; a CircuitPython node's copied by hand, #5697)
async function inBrowser(name, node) {
  const sys = shownSystem()?.system;
  if (!sys) { logError(`${name}: the System is not open`); return false; }
  const plan = systemBuildPlan(sys, { files: filesState.fileTree || [] });
  const steps = plan.nodes.filter(e => node === '*' || e.id === node);
  if (!steps.length) { logError(`${name}: no node '${node}' to program in the System`); return false; }
  const refused = {}, ids = [], images = {};
  for (const e of steps) {
    const why = e.kind === 'fpga' ? 'an FPGA node of a System is programmed by the local server for now (the browser edition programs an FPGA project\'s board)'
      : e.programmer === 'circuitpy' ? programRefusal(e) || `the browser edition writes no drive: copy ${e.image} as code.py, with its folder's other .py files, to the Pico's CIRCUITPY drive` : programRefusal(e);
    if (why) refused[e.id] = why; else { ids.push(e.id); images[e.id] = e.image; }
  }
  return overWebSerial(name, ids, images, refused);
}

/** The node `node` (its id), or every node of the System ('*'), programmed on its board; whether it ended well. One run
 *  at a time, as an implementation. */
export async function runProgramNodes(node = '*') {
  const name = node === '*' ? 'Program All' : `Program Node (System node ${node})`;
  if (procState.busy) { logError('A process is already running (use Stop to cancel it)'); return false; }
  if (api.standalone) return inBrowser(name, node);
  let plan;
  try { plan = await api.programPlan(S.project.name, node); } catch (e) { logError(`${name}: ${e.message}`); return false; }
  // (an Arduino's Program Node whose board the local server does not see: Web Serial offered, #5448)
  const lone = node !== '*' && plan.steps[0];
  const web = !!lone && lone.kind === 'mcu' && lone.programmer === 'avrdude' && !!lone.image && (lone.choose || /has no serial port/.test(lone.refused || '')) && hasWebSerial();
  if (web && !lone.choose) {
    if (await pickBoard(lone, [], true) === WEB_SERIAL) return overWebSerial(name, [lone.id], { [lone.id]: lone.image });
    return false;
  }
  const chosen = {};
  for (const s of plan.steps.filter(x => x.choose)) {
    const key = await pickBoard(s, plan.devices, web);
    if (key === WEB_SERIAL) return overWebSerial(name, [s.id], { [s.id]: s.image });
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
