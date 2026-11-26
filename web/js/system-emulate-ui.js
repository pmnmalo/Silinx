// The Emulate task of a System project (#5581, docs/SYSTEMS.md, Emulation): its panel's tree (web/js/processes.js draws
// it, as an FPGA project's I/O Pin Planning and Emulate on Board): the System's row, its Emulation Properties (the nodes
// that run: silinx.json's system.emulate.nodes, core/system-alone.js) and Emulate System (the ticked nodes); then a row
// per node, its emulation's options and runs only (#5597: no source file, no compiling, the Design's and Implement's):
// each node's Emulate Node (that node alone, in the same System Emulator); a terminal runs with what it is linked to.
import { S } from './app.js';
import { h, dialog } from './ui.js';
import { logError, log } from './console.js';
import { shownSystem } from './design-system.js';
import { saveProjectJson } from './design.js';
import { nodeConstraintsProcs } from './system-constraints-ui.js';
import { mcuBoard } from '/core/system-doc.js';
import { runnableNodes, emulateNodesOf, withEmulateNodes } from '/core/system-alone.js';
import { MODEL_NAMES, nodeModels, emulateModelsOf, withEmulateModels } from '/core/system-models.js';

const emulate = async (file, nodes, models) => (await import('./system-emu-open.js')).openSystemEmulator(file, null, { nodes, models });
// a node as its row says it: its id and its board's name
const boardName = n => (n.kind === 'mcu' ? mcuBoard(n.board)?.name : S.devices?.boards?.find(b => b.id === n.board)?.name) || n.board;

/** Emulate System: the nodes the Emulation Properties tick (every node when none is ticked off). */
export function emulateSystem() {
  const s = shownSystem();
  if (!s?.system) { logError(`Emulate System: ${s ? `${s.file} is not read` : 'the project has no System'}`); return; }
  return emulate(s.file, emulateNodesOf(S.project, s.system));
}

/** An FPGA node's Emulate on each of its models (#5612): its RTL, those its board's toolchain makes; the node alone. */
export const nodeModelProcs = (file, n) => ['rtl', ...nodeModels(n)].map(m => ({ id: `emu-node-${n.id}-${m}`, label: m === 'rtl' ? 'Emulate Behavioral Model (RTL)' : `Emulate ${MODEL_NAMES[m]} Model`, ico: 'emulate',
  run: () => emulate(file, [n.id], { [n.id]: m }) }));

// a node's processes in Emulate: its emulation's options and its run only (#5597: its sources, its firmware, and their
// compiling are the Design's and Implement's)
function nodeProcesses(file, n) {
  // (an FPGA node's I/O Pin Planning (#5642: opened in Emulate), its emulation's options: its board's pins, its constraints file, #5581)
  // (an FPGA node's models under its Emulate Node, as an FPGA project's under Emulate on Board, #5612: the node run on
  // that one; Emulate Node, on the Emulation Properties')
  const models = n.kind === 'fpga' ? nodeModelProcs(file, n) : [];
  const kids = [...(n.kind === 'fpga' ? [nodeConstraintsProcs(n, 'emu')] : []), { id: `emu-node-${n.id}`, label: 'Emulate Node', ico: 'emulate', run: () => emulate(file, [n.id]), ...(models.length ? { children: models } : {}) }];
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
    { id: 'emu-system-run', label: 'Emulate System', ico: 'emulate', run: () => emulateSystem() },
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
  // (each FPGA node's model, #5612: its RTL or one its board's toolchain makes)
  const chosen = emulateModelsOf(S.project, sys);
  const selects = sys.nodes.filter(n => n.kind === 'fpga').map(n => h('select', { class: 'sys-emu-model', 'data-node': n.id },
    ...['rtl', ...nodeModels(n)].map(m => h('option', { value: m, selected: (chosen[n.id] ?? 'rtl') === m }, MODEL_NAMES[m]))));
  const why = h('div', { class: 'dlg-err', hidden: true }, 'Tick at least one node');   // (beside its fields, docs/UI-GUIDELINES.md)
  const body = h('div', { class: 'sys-emu-props' }, h('label', {}, 'The nodes Emulate System runs:'),
    ...boxes.map(b => h('label', { class: 'check' }, b, h('span', { 'data-no-i18n': '' }, b.value))),
    ...(selects.length ? [h('label', {}, 'Each FPGA node\'s model:'), ...selects.map(x => h('label', { class: 'sys-emu-model-row' }, h('span', { 'data-no-i18n': '' }, x.dataset.node), x))] : []), why);
  const ok = await dialog({ title: 'Emulation Properties', body, buttons: [
    { label: 'OK', primary: true, value: true, validate: () => { why.hidden = boxes.some(b => b.checked); return why.hidden; } },
    { label: 'Cancel', value: null }] });
  if (!ok) return;
  let pj = withEmulateNodes(S.project, sys, boxes.filter(b => b.checked).map(b => b.value));
  if (!pj.error) pj = withEmulateModels(pj, sys, Object.fromEntries(selects.map(x => [x.dataset.node, x.value])));
  if (pj.error) { logError(`Emulation Properties: ${pj.error}`); return; }
  S.project = pj;
  await saveProjectJson();
  const ids = emulateNodesOf(S.project, sys), mods = emulateModelsOf(S.project, sys);
  log(`Emulation Properties: Emulate System runs ${ids ? ids.join(', ') : 'every node'}${Object.keys(mods).length ? `; ${Object.entries(mods).map(([id, m]) => `${id} on its ${MODEL_NAMES[m]} model`).join(', ')}` : ''}`);
}
