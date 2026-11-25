// The Emulate task of a System project (#5581, docs/SYSTEMS.md, Emulation): its panel's tree (web/js/processes.js draws
// it, as an FPGA project's User Constraints and Emulate on Board): the System's row, its Emulation Properties (the nodes
// that run: silinx.json's system.emulate.nodes, core/system-alone.js) and Emulate System (the ticked nodes); then a row
// per node, its processes by its kind: an Arduino's or a PIC24's firmware and Compile Firmware, a circuit's circuit, and
// each node's Emulate Node (that node alone, in the same System Emulator); a terminal runs with what it is linked to.
import { S, openFile } from './app.js';
import { h, dialog } from './ui.js';
import { logError, log } from './console.js';
import { shownSystem } from './design-system.js';
import { saveProjectJson } from './design.js';
import { openView } from './drawings.js';
import { firmwareRefusal } from '/core/avr-compile.js';
import { mcuBoard } from '/core/system-doc.js';
import { runnableNodes, emulateNodesOf, withEmulateNodes } from '/core/system-alone.js';

const emulate = async (file, nodes) => (await import('./system-emu-open.js')).openSystemEmulator(file, null, { nodes });
// a node as its row says it: its id and its board's name
const boardName = n => (n.kind === 'mcu' ? mcuBoard(n.board)?.name : S.devices?.boards?.find(b => b.id === n.board)?.name) || n.board;

/** Emulate System: the nodes the Emulation Properties tick (every node when none is ticked off). */
export function emulateSystem() {
  const s = shownSystem();
  if (!s?.system) { logError(`Emulate System: ${s ? `${s.file} is not read` : 'the project has no System'}`); return; }
  return emulate(s.file, emulateNodesOf(S.project, s.system));
}

// a node's processes in Emulate
function nodeProcesses(file, n) {
  const kids = [];
  if (n.kind === 'mcu' && n.firmware) kids.push({ id: `emu-fw-${n.id}`, label: `Firmware: ${n.firmware.split('/').pop()}`, ico: 'file', run: () => openFile(n.firmware) });
  if (n.kind === 'mcu' && !firmwareRefusal({ id: n.id, kind: n.kind, board: n.board, lang: n.lang })) kids.push({ id: `emu-compile-${n.id}`, label: 'Compile Firmware', ico: 'process', run: async () => (await import('./system-firmware-ui.js')).runNodeFirmware(n.id, file) });
  if (n.kind === 'circuit' && n.circuit) kids.push({ id: `emu-circ-${n.id}`, label: `Circuit: ${n.circuit.split('/').pop()}`, ico: 'circuit', run: () => openView(n.circuit) });
  kids.push({ id: `emu-node-${n.id}`, label: 'Emulate Node', ico: 'board', run: () => emulate(file, [n.id]) });
  const board = n.board ? boardName(n) : null;
  return { id: `emu-n-${n.id}`, label: board ? `${n.id} (${board})` : n.id, ico: n.kind === 'fpga' ? 'chip' : n.kind === 'circuit' ? 'circuit' : 'board', children: kids };
}

/** The Emulate panel's tree of the open System project, or null (no System read). */
export function systemEmulateProcesses() {
  const s = shownSystem();
  if (!s?.system) return null;
  const sys = s.system, run = runnableNodes(sys);
  return [{ id: 'emu-system', label: `${sys.name} (System)`, ico: 'system', children: [
    { id: 'emu-props', label: 'Emulation Properties…', ico: 'process', run: () => emulationProperties() },
    { id: 'emu-system-run', label: 'Emulate System', ico: 'board', run: () => emulateSystem() },
    ...sys.nodes.filter(n => run.includes(n.id)).map(n => nodeProcesses(s.file, n)),
    ...sys.nodes.filter(n => n.kind === 'terminal').map(n => ({ id: `emu-n-${n.id}`, label: `${n.id} (terminal)`, ico: 'system', disabled: true, title: `${n.id} runs with the nodes it is linked to` })),
  ] }];
}

/** Emulation Properties…: the nodes Emulate System runs, a check box each; saved in the project (silinx.json). */
export async function emulationProperties() {
  const s = shownSystem();
  if (!s?.system) return;
  const sys = s.system, on = emulateNodesOf(S.project, sys);
  const boxes = runnableNodes(sys).map(id => h('input', { type: 'checkbox', value: id, checked: on == null || on.includes(id) }));
  const why = h('div', { class: 'dlg-err', hidden: true }, 'Tick at least one node');   // (beside its fields, docs/UI-GUIDELINES.md)
  const body = h('div', { class: 'sys-emu-props' }, h('label', {}, 'The nodes Emulate System runs:'),
    ...boxes.map(b => h('label', { class: 'check' }, b, h('span', { 'data-no-i18n': '' }, b.value))), why);
  const ok = await dialog({ title: 'Emulation Properties', body, buttons: [
    { label: 'OK', primary: true, value: true, validate: () => { why.hidden = boxes.some(b => b.checked); return why.hidden; } },
    { label: 'Cancel', value: null }] });
  if (!ok) return;
  const pj = withEmulateNodes(S.project, sys, boxes.filter(b => b.checked).map(b => b.value));
  if (pj.error) { logError(`Emulation Properties: ${pj.error}`); return; }
  S.project = pj;
  await saveProjectJson();
  const ids = emulateNodesOf(S.project, sys);
  log(`Emulation Properties: Emulate System runs ${ids ? ids.join(', ') : 'every node'}`);
}
