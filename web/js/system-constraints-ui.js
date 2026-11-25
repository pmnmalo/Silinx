// A System's FPGA node's User Constraints in the interface (#5581's part 2, core/system-constraints.js): its constraints
// file in its folder (`fpga/uart.ucf`), as an FPGA project's: I/O Pin Planning on its board, Edit Constraints (Text) (the
// file made when it has none yet) and Check Constraints, for its module; the node told its file (its `constraints` in
// the System document) once it has one. The nodes' constraints files are read with the project's drawings
// (web/js/project.js, designState.viewTexts): the System's check and its runs read each node's pins from them
// (nodePinsHere). A System document of before, its pins in it, has them moved into the files when the project opens.
import { S, app, findDoc, openDoc, closeDoc, setDirty, openFile } from './app.js';
import { api } from './api.js';
import { appLog, commandError } from './console.js';
import { designState } from './state-design.js';
import { filesState } from './state-files.js';
import { following } from './collab-state.js';
import { elaborate } from '/core/compile.js';
import { ucfPort } from '/core/board-constraints.js';
import { isSystemFile, readSystem, writeSystem } from '/core/system-doc.js';
import { changeNode } from '/core/system-edit.js';
import { nodeBoard } from '/core/system-node.js';
import { constraintsPaths, nodeConstraintsPath, pinsText, pinsToConstraints, withNodePins } from '/core/system-constraints.js';

/** The System `sys` with its FPGA nodes' pins read from their constraints files (as the project read them). */
export const nodePinsHere = sys => withNodePins(sys, designState.viewTexts || {});
/** The nodes' constraints files' texts of the System `sys`, as the project read them ({ path: text }). */
export const constraintsHere = sys => Object.fromEntries(constraintsPaths(sys).filter(p => designState.viewTexts?.[p] != null).map(p => [p, designState.viewTexts[p]]));

// a module's ports, as the constraints read them (null: it does not elaborate)
function portsOf(mod) {
  try { const d = elaborate(designState.lib, mod); return d?.top ? d.top.ports.map(ucfPort) : null; } catch { return null; }
}

// the System document of the open project: { file, system } (its text as last read), or null
function projectSystemDoc() {
  const file = (filesState.fileTree || []).find(isSystemFile);
  const r = file ? readSystem(designState.viewTexts?.[file] ?? '') : null;
  return r?.system ? { file, system: r.system } : null;
}

// the System document written (`system`), its open editor's model too (refused while it has unsaved changes); whether done
async function writeSystemDoc(file, system, title) {
  const doc = findDoc(`sys:${file}`);
  if (doc?.dirty) { commandError(title, `${file} has unsaved changes: save it first`); return false; }
  const text = writeSystem(system);
  await api.writeFile(S.project.name, file, text);
  designState.viewTexts = { ...designState.viewTexts, [file]: text };
  if (doc?.systemEditor) { doc.systemEditor.setModel(system); doc.systemEditor.savedAs(); setDirty(doc, false); }
  return true;
}

// the node `id` told its constraints file `path`, when it has not been yet
async function recordConstraints(id, path, title) {
  const s = projectSystemDoc();
  const n = s?.system.nodes.find(x => x.id === id);
  if (!n || n.constraints === path) return true;
  const r = changeNode(s.system, id, { constraints: path });
  if (r.error) { commandError(title, r.error); return false; }
  return writeSystemDoc(s.file, r.system, title);
}

// the node `id` of the open System, as its document says it
const nodeOf = id => projectSystemDoc()?.system.nodes.find(x => x.id === id && x.kind === 'fpga') ?? null;

/** I/O Pin Planning of the FPGA node `id`: its module's ports on its board, written to its constraints file. */
export async function openNodePins(id) {
  const title = 'I/O Pin Planning', n = nodeOf(id);
  if (!n?.module) return commandError(title, `${id}: an FPGA node with no module`);
  const board = nodeBoard(n);
  if (!board) return commandError(title, `${id}: no FPGA board '${n.board}'`);
  const path = nodeConstraintsPath(n), docId = `pins:${id}`;
  const { mountPinPlanner } = await import('./pinplanner.js');
  const old = findDoc(docId);
  if (old) await closeDoc(old);
  openDoc({ id: docId, title: `I/O Pin Planning (${id})`, icon: 'pins', create: (el, d) => mountPinPlanner(el, d, n.module, {
    board: n.board, device: board.device, constraints: path,
    saved: async () => { await recordConstraints(id, path, title); await app.reloadProject(); },
  }) });
}

/** Edit Constraints (Text) of the FPGA node `id`: its constraints file opened (made first when it has none: no pin yet). */
export async function openNodeConstraints(id) {
  const title = 'Edit Constraints (Text)', n = nodeOf(id);
  if (!n) return commandError(title, `no FPGA node '${id}' in the System`);
  if (!nodeBoard(n)) return commandError(title, `${id}: no FPGA board '${n.board}'`);
  const path = nodeConstraintsPath(n);
  if (!(filesState.fileTree || []).includes(path)) {
    await api.writeFile(S.project.name, path, pinsText(n, null, {}, portsOf(n.module) || []));
    if (!await recordConstraints(id, path, title)) return;
    await app.reloadProject();
    appLog(`${title}: ${path} made, ${id}'s constraints file.`, 'info');
  } else if (!await recordConstraints(id, path, title)) return;
  openFile(path);
}

/** Check Constraints of the FPGA node `id`: its constraints file against its module's ports and its board. */
async function checkNodeConstraints(id) {
  const n = nodeOf(id);
  if (!n) return commandError('Check Constraints', `no FPGA node '${id}' in the System`);
  const path = nodeConstraintsPath(n);
  if (!(filesState.fileTree || []).includes(path)) return commandError('Check Constraints', `${id}: no constraints file ${path} yet (its I/O Pin Planning or Edit Constraints (Text) makes it)`);
  const { checkUcfFile } = await import('./implement.js');
  return checkUcfFile(path, { target: { top: n.module, board: n.board, device: nodeBoard(n)?.device } });
}

/** The User Constraints of the FPGA node `n` (a process group, as an FPGA project's). */
export const nodeConstraintsProcs = n => ({ id: `uc-${n.id}`, label: 'User Constraints', ico: 'procGroup', children: [
  { id: `uc-pins-${n.id}`, label: 'I/O Pin Planning', ico: 'pins', run: () => openNodePins(n.id) },
  { id: `uc-edit-${n.id}`, label: 'Edit Constraints (Text)', ico: 'ucf', run: () => openNodeConstraints(n.id) },
  { id: `uc-check-${n.id}`, label: 'Check Constraints', ico: 'process', run: () => checkNodeConstraints(n.id) },
] });

/** A System document of before (its FPGA nodes' pins in it) made one of now as the project opens: the pins moved into
 *  the nodes' constraints files, said in the console. Whether it changed anything. */
export async function movePinsOnOpen() {
  if (following()) return false;   // (a followed project's: its owner's to move, #3181)
  const s = projectSystemDoc();
  if (!s || !s.system.nodes.some(n => n.kind === 'fpga' && n.pins && Object.keys(n.pins).length)) return false;
  const r = pinsToConstraints(s.system, { texts: constraintsHere(s.system), portsOf });
  if (!r.writes.length) return false;
  for (const w of r.writes) await api.writeFile(S.project.name, w.path, w.text);
  const text = writeSystem(r.system);
  await api.writeFile(S.project.name, s.file, text);
  designState.viewTexts = { ...designState.viewTexts, [s.file]: text, ...Object.fromEntries(r.writes.map(w => [w.path, w.text])) };
  for (const l of r.lines) appLog(`${s.file}: ${l} (a System's pins are in its FPGA nodes' constraints files now).`, 'info');
  return true;
}
