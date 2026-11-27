// A System's Arduino node's firmware compiled, from the interface (#5503, roadmap #4695's phase 5), a PIC24's (XC16,
// #5482): its node's row's Compile Firmware, the local server's job (server/avr-compile.js, arduino-cli, or
// server/xc16-compile.js, XC16: POST /projects/:p/firmware with
// { node }), its errors and warnings in the console as a run of its own, by file and line; its .hex in the node's folder,
// the node's firmware, which Emulate System runs. The browser edition assembles an Arduino's .asm itself (#5933: Silinx's
// AVR assembler, as the server does); for a sketch it has no compiler: it says so, and the node takes a .hex made elsewhere
// (the Arduino IDE's Export Compiled Binary).
import { S, findDoc, closeDoc, activateDoc } from './app.js';
import { api, followJob } from './api.js';
import { logError, startRun } from './console.js';
import { runState } from './state-run.js';
import { procState } from './state-proc.js';
import { docsState } from './state-docs.js';
import { saveAll } from './processes.js';
import { reloadProject } from './project.js';
import { mcuBoard, readSystem, writeSystem } from '/core/system-doc.js';
import { changeNode } from '/core/system-edit.js';
import { assembleNode, nodeAssembly } from '/core/avr-compile.js';
import { filesState } from './state-files.js';

const cls = line => (/^ERROR/.test(line) ? 'err' : /^WARNING/.test(line) ? 'warn' : '');

/** The firmware of the node `node` (its id, its board `board`) compiled, its System document `file`; whether it ended
 *  well. One run at a time, as an implementation. */
export async function runNodeFirmware(node, file, board = null) {
  const name = 'Compile Firmware';
  if (procState.busy) { logError('A process is already running (use Stop to cancel it)'); return false; }
  if (api.standalone) {
    // (an Arduino's assembly program assembled here, #5933: Silinx's AVR assembler, as the local server does)
    const asm = mcuBoard(board)?.arch === 'pic24' ? null : await browserAssembly(node, file);
    if (asm) return assembleHere(asm, file);
    // (a PIC24's by XC16, #5482: MPLAB X's build its .hex)
    logError(mcuBoard(board)?.arch === 'pic24'
      ? `${name}: a PIC24 node's firmware is compiled by XC16, on the local server or its ISE machine (the browser edition has no compiler): give the node the .hex MPLAB X built`
      : `${name}: a node's sketch is compiled by the local server's arduino-cli (the browser edition assembles an .asm only): give the node a .hex made elsewhere, the Arduino IDE's Export Compiled Binary`);
    return false;
  }
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

// the node `id` of the System `file` and its .asm in the browser edition (#5933): { node, asm, sys } or null (a sketch, or no .asm)
async function browserAssembly(id, file) {
  const sys = readSystem(await api.readFile(S.project.name, file).catch(() => '')).system;
  const node = sys?.nodes?.find(n => n.id === id);
  const asm = node && nodeAssembly(node, filesState.diskTree || []);
  return asm ? { node, asm, sys } : null;
}

// the .asm assembled in the page (core/avr-compile.js assembleNode, the local server's too): a run of the console, its .hex
// written, the node's firmware set when it had none
async function assembleHere({ node, asm, sys }, file) {
  if (procState.busy) { logError('A process is already running (use Stop to cancel it)'); return false; }
  if (!await saveAll()) return false;
  const what = `Compile Firmware (System node ${node.id})`;
  const R = startRun({ process: what, source: 'impl' });
  try {
    const r = assembleNode(node, asm, await api.readFile(S.project.name, asm.main));
    for (const l of r.lines) R.log(l, cls(l));
    if (!r.ok) { R.log(`ERROR: System node ${node.id}: ${r.error}`, 'err'); R.log(`\nProcess failed: the System node(s) ${node.id} failed`, 'err', { diag: true }); return false; }
    await api.writeFile(S.project.name, asm.hex, r.hex);
    if (!node.firmware) {
      const c = changeNode(sys, node.id, { firmware: asm.hex });
      if (!c.error) { await api.writeFile(S.project.name, file, writeSystem(c.system)); R.log(`System node ${node.id}: its firmware set to ${asm.hex} in ${file}.`); }
    }
    R.log(`\nProcess "${what}" completed successfully`, 'ok');
    await refreshSystem(file);
    return true;
  } catch (e) {
    R.log(`Process "${what}" failed: ${e.message}`, 'err');
    return false;
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
