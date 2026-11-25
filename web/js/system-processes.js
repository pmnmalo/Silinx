// The Processes pane of a System project's rows (#5414, #5416's phase 2): its System's row (View/Edit, Check, Emulate
// System, as the row's menu) and each node's (its node in the System editor; an FPGA node's module checked and its RTL
// schematic; its Synthesize, Implement Design and Generate Programming File on its own board, #5446), and its FPGA nodes'
// modules' (#5443: the same, no flow on the project's default device); the System's Implement System; an Arduino node's
// Compile Firmware (#5503: its sketch to its .hex by the local server's arduino-cli); the System's Build Plan and Build All
// (#5489: the nodes not up to date built, the FPGAs first). A node's Program: #5489's part 3, it joins this list.
import { findDoc } from './app.js';
import { openSystem } from './system-open.js';
import { systemTop } from './design-system.js';
import { openView } from './drawings.js';
import { firmwareRefusal } from '/core/avr-compile.js';

// a node's (or the System's, '*') implementation on its own board, #5446: web/js/system-implement-ui.js
const impl = (node, steps, label) => async () => (await import('./system-implement-ui.js')).runNodeImpl(node, steps, label);
const FLOW = [['node-synth', 'Synthesize', ['synth']], ['node-impl', 'Implement Design', ['synth', 'translate', 'map', 'par']], ['node-bitgen', 'Generate Programming File', ['synth', 'translate', 'map', 'par', 'trce', 'bitgen']]];

const editSystem = file => ({ id: 'sys-open', label: 'View/Edit System', ico: 'system', run: () => openSystem(file) });

/** The processes of the selection `sel` if it is a System's row or a node's ({ type: 'file', system } or { type:
 *  'node' }), else null; `check` and `rtl` an FPGA node's module's Check Syntax and RTL schematic. */
export function systemProcesses(sel, view, { check, rtl }) {
  // (a module of a System's FPGA node, its System the project's top, #5443: what works on its node now; implementing it on
  // its node's board is docs/SYSTEMS.md's phase 3, not the project's default device's flow)
  if (sel.type === 'module' && view !== 'sim' && systemTop()) return [
    ...(sel.sch ? [{ id: 'sch-open', label: 'View/Edit Drawing', ico: 'schematic', run: () => openView(sel.sch) }] : []),
    { id: 'check', label: 'Check Syntax', ico: 'process', run: () => check(sel.module) },
    { id: 'rtl', label: 'View RTL Schematic', ico: 'schematic', run: () => rtl(sel.module) },
  ];
  if (sel.type === 'file' && sel.system) return [
    editSystem(sel.file),
    { id: 'sys-check', label: 'Check System', ico: 'process', run: async () => { await openSystem(sel.file); findDoc(`sys:${sel.file}`)?.checkSystem?.(); } },
    { id: 'sys-emulate', label: 'Emulate System', ico: 'board', run: async () => (await import('./system-emu-open.js')).openSystemEmulator(sel.file) },
    { id: 'sys-impl', label: 'Implement System', ico: 'process', run: impl('*', FLOW[2][2], 'Implement System') },
    // (its build plan and Build All, the FPGA nodes first, #5489: web/js/system-build-ui.js)
    { id: 'sys-plan', label: 'Build Plan', ico: 'process', run: async () => (await import('./system-build-ui.js')).runBuildPlan() },
    { id: 'sys-build', label: 'Build All', ico: 'process', run: async () => (await import('./system-build-ui.js')).runBuildAll(sel.file) },
    // (its nodes' boards by their USB id, #5489's part 2)
    { id: 'sys-boards', label: 'Connected Boards', ico: 'board', run: async () => (await import('./system-build-ui.js')).runConnectedBoards() },
  ];
  if (sel.type !== 'node') return null;
  return [
    editSystem(sel.file),
    ...(sel.kind === 'fpga' && sel.module ? [
      { id: 'check', label: 'Check Syntax', ico: 'process', run: () => check(sel.module) },
      { id: 'rtl', label: 'View RTL Schematic', ico: 'schematic', run: () => rtl(sel.module) },
      ...FLOW.map(([id, label, steps]) => ({ id, label, ico: 'process', run: impl(sel.node, steps, label) })),
    ] : []),
    // (an Arduino node's C or C++, #5503: web/js/system-firmware-ui.js)
    ...(sel.kind === 'mcu' && !firmwareRefusal({ id: sel.node, kind: sel.kind, board: sel.board, lang: sel.lang }) ? [
      { id: 'node-firmware', label: 'Compile Firmware', ico: 'process', run: async () => (await import('./system-firmware-ui.js')).runNodeFirmware(sel.node, sel.file) },
    ] : []),
  ];
}
