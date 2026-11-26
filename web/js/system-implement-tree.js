// The Implement task of a System project (#5581's part 4, docs/SYSTEMS.md, Implementation together): its panel's tree
// (web/js/processes.js draws it, as Emulate's and Simulate's): the System's row, its Build Plan, Connected Boards, Build
// All and Program All (#5489: the FPGA nodes first, then the microcontrollers); a row per node of the plan, its build
// plan's state its mark (✓ up to date or given, ! out of date) and its plan's line its tip; an FPGA node's User
// Constraints, Synthesize, Implement Design and Generate Programming File (its Build Node, #5446) and Program Node; an
// Arduino node's Compile Firmware (its Build Node, #5503) and Program Node; a PIC24 node's firmware (given) and a
// MicroPython node's program, their Program Node disabled, its tip why (MPLAB IPE, mpremote). The plan is the local
// server's (GET /projects/:p/build-plan), asked again once the design or a build changed it.
import { S, app } from './app.js';
import { api } from './api.js';
import { shownSystem } from './design-system.js';
import { nodeConstraintsProcs } from './system-constraints-ui.js';
import { mcuBoard } from '/core/system-doc.js';
import { PLAN_KINDS, planLine } from '/core/system-plan.js';
import { programRefusal } from '/core/system-program.js';
import { firmwareRefusal } from '/core/avr-compile.js';

// a node's (or the System's, '*') steps, as the Processes panel's (web/js/system-processes.js)
const FLOW = [['synth', 'Synthesize', ['synth']], ['impl', 'Implement Design', ['synth', 'translate', 'map', 'par']], ['bitgen', 'Generate Programming File', ['synth', 'translate', 'map', 'par', 'trce', 'bitgen']]];
const impl = (node, steps, label) => async () => (await import('./system-implement-ui.js')).runNodeImpl(node, steps, label);
const program = node => async () => (await import('./system-program-ui.js')).runProgramNodes(node);
const build = async () => (await import('./system-build-ui.js'));

// the plan of the open project, as the server last said it: { project, nodes } (nodes null: not asked yet, or failed)
let plan = { project: null, nodes: null }, asking = null;

/** The plan to be asked again (the design or a build changed it; `draw`: the tree drawn again now, then once it is). */
export function planChanged({ draw = false } = {}) { plan = { project: null, nodes: null }; if (draw) app.renderProcesses(); }
addEventListener('silinx:design-changed', () => planChanged());
addEventListener('silinx:project-opened', () => planChanged());

// the plan's entries of the open project ({ id: entry }), asked for once (the tree drawn again then), or {} meanwhile
function entries() {
  const name = S.project?.name;
  if (!name || api.standalone) return {};
  if (plan.project === name) return Object.fromEntries((plan.nodes || []).map(e => [e.id, e]));
  if (asking !== name) {
    asking = name;
    api.buildPlan(name).then(p => { plan = { project: name, nodes: p.nodes }; }, () => { plan = { project: name, nodes: null }; })
      .finally(() => { asking = null; if (S.project?.name === name) app.renderProcesses(); });
  }
  return {};
}

// a plan's state as its node's mark (#5581: ✓ up to date, ! out of date)
const MARK = { 'up to date': 'ok', given: 'ok', 'out of date': 'stale' };
// a node as its row says it: its id and its board's name
const boardName = n => (n.kind === 'mcu' ? mcuBoard(n.board)?.name : S.devices?.boards?.find(b => b.id === n.board)?.name) || n.board;

// what a microcontroller node is programmed by: its plan's entry's programmer, else its board's and language's
const programmerOf = (n, e) => e?.programmer || (n.lang === 'micropython' || ['rp2040', 'esp32'].includes(mcuBoard(n.board)?.arch) ? 'repl' : mcuBoard(n.board)?.arch === 'pic24' ? 'pickit' : 'avrdude');

/** Why Silinx does not program the node `n` yet (a PIC24's, a MicroPython node's: core/system-program.js), its plan's
 *  entry `e` if known, or null: its Program Node disabled, its tip this. */
export function unprogrammed(n, e) {
  const by = n.kind === 'mcu' ? programmerOf(n, e) : 'jtag';
  return ['pickit', 'repl'].includes(by) ? `${n.id}: ${programRefusal({ programmer: by, image: e?.image || n.firmware || null })}` : null;
}

// a node's processes in Implement: its build's and its programming's
function nodeProcesses(file, n, e) {
  const id = n.id;
  const by = n.kind === 'mcu' ? programmerOf(n, e) : 'jtag';
  // (a node Silinx does not program yet: its Program Node disabled, said why)
  const refused = unprogrammed(n, e);
  const given = e ? (e.state === 'given' ? e.image : null) : by === 'pickit' ? n.firmware || null : null;
  const kids = [
    ...(n.kind === 'fpga' ? [nodeConstraintsProcs(n), ...(n.module ? FLOW.map(([step, label, steps]) => ({ id: `impl-${step}-${id}`, label, ico: 'process', run: impl(id, steps, label) })) : [])] : []),
    // (a firmware given, made outside Silinx: nothing to build, its file said; else an Arduino's sketch compiled, a PIC24's C, #5482)
    ...(given ? [{ id: `impl-given-${id}`, label: `Firmware: ${given.split('/').pop()}`, ico: 'process', disabled: true, title: `${id}: its firmware ${given}, made outside Silinx: nothing to build` }]
      : ['avrdude', 'pickit'].includes(by) && !firmwareRefusal(n) ? [{ id: `impl-firmware-${id}`, label: 'Compile Firmware', ico: 'process', run: async () => (await import('./system-firmware-ui.js')).runNodeFirmware(id, file, n.board) }] : []),
    { id: `impl-program-${id}`, label: 'Program Node', ico: 'board', ...(refused ? { disabled: true, title: refused } : { run: program(id) }) },
  ];
  const board = n.board ? boardName(n) : null;
  return { id: `impl-n-${id}`, label: board ? `${id} (${board})` : id, ico: n.kind === 'fpga' ? 'chip' : 'board', children: kids,
    ...(e ? { status: MARK[e.state] || null, title: planLine(e) } : {}) };
}

/** The Implement panel's tree of the open System project, or null (no System read). */
export function systemImplementProcesses() {
  const s = shownSystem();
  if (!s?.system) return null;
  const sys = s.system, plan = entries();
  return [{ id: 'impl-system', label: `${sys.name} (System)`, ico: 'system', children: [
    { id: 'impl-plan', label: 'Build Plan', ico: 'process', run: async () => (await build()).runBuildPlan() },
    { id: 'impl-boards', label: 'Connected Boards', ico: 'board', run: async () => (await build()).runConnectedBoards() },
    { id: 'impl-build', label: 'Build All', ico: 'process', run: () => buildAll(s.file) },   // (the project read again after it: its plan too)
    { id: 'impl-program', label: 'Program All', ico: 'board', run: () => programAll() },
    // (in the plan's order: the FPGA nodes first, then the microcontrollers)
    ...PLAN_KINDS.flatMap(k => sys.nodes.filter(n => n.kind === k)).map(n => nodeProcesses(s.file, n, plan[n.id])),
  ] }];
}

/** Build All: every node not up to date, the FPGAs first (the Implement bar's and the tree's). */
export const buildAll = async (file = shownSystem()?.file) => (await build()).runBuildAll(file);
/** Program All: every node on its board, the FPGAs first. */
export const programAll = () => program('*')();
