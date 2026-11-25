// The Processes pane of a System project's rows (#5414, #5416's phase 2): its System's row (View/Edit, Check, Emulate
// System, as the row's menu) and each node's (its node in the System editor; an FPGA node's module checked and its RTL
// schematic; its Synthesize, Implement Design and Generate Programming File on its own board, #5446), and its FPGA nodes'
// modules' (#5443: the same, no flow on the project's default device); the System's Implement System; an Arduino node's
// Compile Firmware (#5503: its sketch to its .hex by the local server's arduino-cli); the System's Build Plan and Build All
// (#5489: the nodes not up to date built, the FPGAs first), Connected Boards and Program All; an FPGA or Arduino node's
// Program Node (#5489's part 3, #5447: on its board, matched by its USB id). Emulate System runs the nodes its Emulation
// Properties tick, a node's Emulate Node that node alone (#5581).
import { findDoc } from './app.js';
import { openSystem } from './system-open.js';
import { systemTop } from './design-system.js';
import { openView } from './drawings.js';
import { firmwareRefusal } from '/core/avr-compile.js';
import { RUN_KINDS } from '/core/system-alone.js';
import { nodeConstraintsProcs } from './system-constraints-ui.js';
import { nodeModelProcs } from './system-emulate-ui.js';

// a node's (or the System's, '*') implementation on its own board, #5446: web/js/system-implement-ui.js
const impl = (node, steps, label) => async () => (await import('./system-implement-ui.js')).runNodeImpl(node, steps, label);
const FLOW = [['node-synth', 'Synthesize', ['synth']], ['node-impl', 'Implement Design', ['synth', 'translate', 'map', 'par']], ['node-bitgen', 'Generate Programming File', ['synth', 'translate', 'map', 'par', 'trce', 'bitgen']]];

// a node's (or every node's, '*') Program on its board, #5489: web/js/system-program-ui.js
const program = node => async () => (await import('./system-program-ui.js')).runProgramNodes(node);

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
    // (the nodes its Simulation Properties tick, for their time, their stimulus file applied, #5581: web/js/system-simulate-ui.js)
    { id: 'sys-simulate', label: 'Simulate System', ico: 'sim', run: async () => (await import('./system-simulate-ui.js')).simulateSystem() },
    { id: 'sys-sim-props', label: 'Simulation Properties…', ico: 'process', run: async () => (await import('./system-simulate-ui.js')).simulationProperties() },
    // (the nodes its Emulation Properties tick, #5581: web/js/system-emulate-ui.js)
    { id: 'sys-emulate', label: 'Emulate System', ico: 'emulate', run: async () => (await import('./system-emulate-ui.js')).emulateSystem() },
    { id: 'sys-emu-props', label: 'Emulation Properties…', ico: 'process', run: async () => (await import('./system-emulate-ui.js')).emulationProperties() },
    { id: 'sys-impl', label: 'Implement System', ico: 'process', run: impl('*', FLOW[2][2], 'Implement System') },
    // (its build plan and Build All, the FPGA nodes first, #5489: web/js/system-build-ui.js)
    { id: 'sys-plan', label: 'Build Plan', ico: 'process', run: async () => (await import('./system-build-ui.js')).runBuildPlan() },
    { id: 'sys-build', label: 'Build All', ico: 'process', run: async () => (await import('./system-build-ui.js')).runBuildAll(sel.file) },
    // (its nodes' boards by their USB id, #5489's part 2)
    { id: 'sys-boards', label: 'Connected Boards', ico: 'board', run: async () => (await import('./system-build-ui.js')).runConnectedBoards() },
    // (every node on its board, the FPGAs first, #5489: web/js/system-program-ui.js)
    { id: 'sys-program', label: 'Program All', ico: 'board', run: program('*') },
  ];
  if (sel.type !== 'node') return null;
  return [
    editSystem(sel.file),
    // (its User Constraints: its constraints file, #5581)
    ...(sel.kind === 'fpga' ? [nodeConstraintsProcs({ id: sel.node })] : []),
    ...(sel.kind === 'fpga' && sel.module ? [
      { id: 'check', label: 'Check Syntax', ico: 'process', run: () => check(sel.module) },
      { id: 'rtl', label: 'View RTL Schematic', ico: 'schematic', run: () => rtl(sel.module) },
      ...FLOW.map(([id, label, steps]) => ({ id, label, ico: 'process', run: impl(sel.node, steps, label) })),
      { id: 'node-program', label: 'Program Node', ico: 'board', run: program(sel.node) },   // (on its board over JTAG, #5447)
    ] : []),
    // (an Arduino node's C or C++, #5503: web/js/system-firmware-ui.js)
    ...(sel.kind === 'mcu' && !firmwareRefusal({ id: sel.node, kind: sel.kind, board: sel.board, lang: sel.lang }) ? [
      { id: 'node-firmware', label: 'Compile Firmware', ico: 'process', run: async () => (await import('./system-firmware-ui.js')).runNodeFirmware(sel.node, sel.file) },
      // (its .hex by arduino-cli upload on its board, #5489)
      { id: 'node-program', label: 'Program Node', ico: 'board', run: program(sel.node) },
    ] : []),
    // (the node alone in the System Emulator, #5581; a terminal runs with what it is linked to)
    // (the node alone in the System editor's Try it panel, #5581)
    ...(RUN_KINDS.includes(sel.kind) ? [{ id: 'node-simulate', label: 'Simulate Node', ico: 'sim', run: async () => (await import('./system-simulate-ui.js')).simulateNode(sel.file, sel.node) }] : []),
    // (an FPGA node's models under it, #5612: web/js/system-emulate-ui.js nodeModelProcs)
    ...(RUN_KINDS.includes(sel.kind) ? [{ ...(sel.kind === 'fpga' ? { children: nodeModelProcs(sel.file, { id: sel.node, kind: sel.kind, board: sel.board, variant: sel.variant }) } : {}), id: 'node-emulate', label: 'Emulate Node', ico: 'emulate', run: async () => (await import('./system-emu-open.js')).openSystemEmulator(sel.file, null, { nodes: [sel.node] }) }] : []),
  ];
}
