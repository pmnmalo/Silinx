// A System's Arduino node's firmware compiled, from the interface (#5503, roadmap #4695's phase 5): its node's row's
// Compile Firmware, the local server's job (server/avr-compile.js, arduino-cli: POST /projects/:p/firmware with
// { node }), its errors and warnings in the console as a run of its own, by file and line; its .hex in the node's folder,
// the node's firmware, which Emulate System runs. The browser edition has no compiler: it says so, and the node takes
// a .hex made elsewhere (the Arduino IDE's Export Compiled Binary).
import { S, findDoc, closeDoc, activateDoc } from './app.js';
import { api, followJob } from './api.js';
import { logError, startRun } from './console.js';
import { runState } from './state-run.js';
import { procState } from './state-proc.js';
import { docsState } from './state-docs.js';
import { saveAll } from './processes.js';
import { reloadProject } from './project.js';

const cls = line => (/^ERROR/.test(line) ? 'err' : /^WARNING/.test(line) ? 'warn' : '');

/** The firmware of the node `node` (its id) compiled, its System document `file`; whether it ended well. One run at a
 *  time, as an implementation. */
export async function runNodeFirmware(node, file) {
  const name = 'Compile Firmware';
  if (procState.busy) { logError('A process is already running (use Stop to cancel it)'); return false; }
  if (api.standalone) { logError(`${name}: a node's firmware is compiled by the local server's arduino-cli (the browser edition has no compiler): give the node a .hex made elsewhere, the Arduino IDE's Export Compiled Binary`); return false; }
  // (the sketch as the editor shows it: saved first)
  if (!await saveAll()) return false;
  procState.busy = true;
  const what = `${name} (System node ${node})`;
  const R = startRun({ process: what, source: 'impl' });
  let ok = false;
  try {
    const { job } = await api.firmware(S.project.name, node);
    runState.currentJob = job;
    runState.stopRequested = false;
    const res = await followJob(job, line => R.log(line, cls(line)));
    if (runState.stopRequested) { R.log('\nProcess stopped by the user.', 'info'); return false; }
    ok = res.status === 'ok';
    if (ok) R.log(`\nProcess "${what}" completed successfully`, 'ok');
    else R.log(`\nProcess failed: ${res.error || 'see log'}`, 'err', { diag: !!res.error });
    return ok;
  } catch (e) {
    R.log(`Process "${what}" failed: ${e.message}`, 'err');
    return false;
  } finally {
    procState.busy = false; runState.currentJob = null;
    // (its .hex a file of the project now, and the System's firmware set when it had none: the open System read again)
    if (ok) await refreshSystem(file);
  }
}

/** The project read again after a build (its .hex a file of it now, the System's firmware set when it had none): the open
 *  System `file` reopened unless it has unsaved edits. */
export async function refreshSystem(file) {
  await reloadProject();
  const d = findDoc(`sys:${file}`);
  if (!d || d.dirty) return;
  const front = docsState.active === d ? null : docsState.active;
  await closeDoc(d);
  await (await import('./system-open.js')).openSystem(file);
  if (front && docsState.docs.includes(front)) activateDoc(front);
}
