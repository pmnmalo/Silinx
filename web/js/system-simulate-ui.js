// The Simulate task of a System project (#5581's part 3, docs/SYSTEMS.md, Simulating everything together): its panel's
// tree (web/js/processes.js draws it, as Emulate's): the System's row, its Simulation Properties (silinx.json's
// system.simulate: the nodes Simulate System runs, its run's time, its stimulus file: core/system-alone.js,
// core/system-stimulus.js) and Simulate System; a row per node, its simulation's runs only (as Emulate's, #5597): an FPGA
// node's test benches (its folder's sim/, each simulated as an FPGA project's) and each node's Simulate Node (that node
// alone, in the System editor's Try it panel, its links' open ends as Emulate Node's). A run goes on for its time.
import { S, app } from './app.js';
import { h, dialog } from './ui.js';
import { logError, log } from './console.js';
import { shownSystem } from './design-system.js';
import { saveProjectJson } from './design.js';
import { designState } from './state-design.js';
import { filesState } from './state-files.js';
import { api } from './api.js';
import { mcuBoard } from '/core/system-doc.js';
import { relInNode } from '/core/system-layout.js';
import { runnableNodes, simulateSettingsOf, withSimulateSettings } from '/core/system-alone.js';
import { isStimulusFile, newStimulus } from '/core/system-stimulus.js';

// a node as its row says it: its id and its board's name
const boardName = n => (n.kind === 'mcu' ? mcuBoard(n.board)?.name : S.devices?.boards?.find(b => b.id === n.board)?.name) || n.board;

// the System `file` simulated in a document of its own (web/js/system-sim-open.js), for its time: the nodes `nodes`
// (undefined: the Simulation Properties')
async function simulate(file, nodes) {
  const view = await (await import('./system-sim-open.js')).openSystemSimulation(file, { nodes });
  const s = shownSystem();
  await view?.runFor(simulateSettingsOf(S.project, s?.system).ms * 1e9);
}

/** Simulate Node: the node `id` of the System `file` alone, for the Simulation Properties' time. */
export const simulateNode = (file, id) => simulate(file, [id]);
/** Simulate Node of a board with its shield (#5898: core/processor-shield.js withShield): those nodes. */
export const simulateNodes = (file, ids) => simulate(file, ids);

/** Simulate System: the nodes the Simulation Properties tick, for their time, their stimulus file applied. */
export function simulateSystem() {
  const s = shownSystem();
  if (!s?.system) { logError(`Simulate System: ${s ? `${s.file} is not read` : 'the project has no System'}`); return; }
  return simulate(s.file, undefined);
}

// a node's test benches: the simulation sources of its folder (their modules)
const benchesOf = id => (designState.modules || []).filter(m => m.role === 'sim' && relInNode(m.file, id) != null).map(m => m.name).sort();

// a node's processes in Simulate: its simulation's runs
function nodeProcesses(file, n) {
  const kids = [
    ...(n.kind === 'fpga' ? benchesOf(n.id).map(b => ({ id: `sim-tb-${n.id}-${b}`, label: b, ico: 'sim',
      run: async () => { await app.setTop(b, true); return app.runSimulation(b); } })) : []),
    { id: `sim-node-${n.id}`, label: 'Simulate Node', ico: 'sim', run: () => simulateNode(file, n.id) },
  ];
  const board = n.board ? boardName(n) : null;
  return { id: `sim-n-${n.id}`, label: board ? `${n.id} (${board})` : n.id, ico: n.kind === 'fpga' ? 'chip' : n.kind === 'circuit' ? 'circuit' : 'board', children: kids };
}

/** The Simulate panel's tree of the open System project, or null (no System read). */
export function systemSimulateProcesses() {
  const s = shownSystem();
  if (!s?.system) return null;
  const sys = s.system, run = runnableNodes(sys);
  return [{ id: 'sim-system', label: `${sys.name} (System)`, ico: 'system', children: [
    { id: 'sim-props', label: 'Simulation Properties…', ico: 'process', run: () => simulationProperties() },
    { id: 'sim-system-run', label: 'Simulate System', ico: 'sim', run: () => simulateSystem() },
    ...sys.nodes.filter(n => run.includes(n.id)).map(n => nodeProcesses(s.file, n)),
  ] }];
}

/** Simulation Properties…: the nodes Simulate System runs, its run's time, its stimulus file (one of the project's, none,
 *  or a new one); saved in the project (silinx.json). */
export async function simulationProperties() {
  const s = shownSystem();
  if (!s?.system) return;
  const sys = s.system, cur = simulateSettingsOf(S.project, sys);
  const boxes = runnableNodes(sys).map(id => h('input', { type: 'checkbox', value: id, checked: cur.nodes == null || cur.nodes.includes(id) }));
  const time = h('input', { type: 'number', min: '1', max: '10000', step: '1', value: String(cur.ms), class: 'sys-sim-ms' });
  const made = `${sys.name}.stim.json`;
  const files = (filesState.fileTree || []).filter(isStimulusFile).sort();
  const stim = h('select', { class: 'sys-sim-stimulus' }, h('option', { value: '' }, '(none)'),
    ...files.map(f => h('option', { value: f, selected: f === cur.stimulus, 'data-no-i18n': '' }, f)),
    ...(files.includes(made) ? [] : [h('option', { value: `new:${made}` }, `New: ${made}`)]));
  // (what is wrong, beside its fields, docs/UI-GUIDELINES.md)
  const why = h('div', { class: 'dlg-err', hidden: true });
  const body = h('div', { class: 'sys-sim-props' }, h('label', {}, 'The nodes Simulate System runs:'),
    ...boxes.map(b => h('label', { class: 'check' }, b, h('span', { 'data-no-i18n': '' }, b.value))),
    h('label', {}, 'Run time (ms):'), time, h('label', {}, 'Stimulus file:'), stim, why);
  const check = () => {
    why.textContent = !boxes.some(b => b.checked) ? 'Tick at least one node' : !(Number(time.value) > 0 && Number(time.value) <= 10000) ? 'The run time: from 1 to 10000 ms' : '';
    why.hidden = !why.textContent;
    return why.hidden;
  };
  const ok = await dialog({ title: 'Simulation Properties', body, buttons: [{ label: 'OK', primary: true, value: true, validate: check }, { label: 'Cancel', value: null }] });
  if (!ok) return;
  let stimulus = stim.value || null;
  if (stimulus?.startsWith('new:')) {
    stimulus = stimulus.slice(4);
    await api.writeFile(S.project.name, stimulus, newStimulus());
    await app.reloadProject();
    log(`Simulation Properties: ${stimulus} made, the System's stimulus file (its controls and the text typed, at their times).`);
  }
  const pj = withSimulateSettings(S.project, sys, { nodes: boxes.filter(b => b.checked).map(b => b.value), ms: Number(time.value), stimulus }, filesState.fileTree || []);
  if (pj.error) { logError(`Simulation Properties: ${pj.error}`); return; }
  S.project = pj;
  await saveProjectJson();
  const now = simulateSettingsOf(S.project, sys);
  log(`Simulation Properties: Simulate System runs ${now.nodes ? now.nodes.join(', ') : 'every node'} for ${now.ms} ms${now.stimulus ? `, its stimulus ${now.stimulus}` : ''}`);
  if (stimulus && stim.value.startsWith('new:')) app.openFile(stimulus);
}
