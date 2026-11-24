// The Processes pane of a System project's rows (#5414, #5416's phase 2): its System's row (View/Edit, Check, Emulate
// System, as the row's menu) and each node's (its node in the System editor; an FPGA node's module checked and its RTL
// schematic). A node's Implement, Program and firmware build are docs/SYSTEMS.md's phases 3 and 5: they join this list.
import { findDoc } from './app.js';
import { openSystem } from './system-open.js';

const editSystem = file => ({ id: 'sys-open', label: 'View/Edit System', ico: 'system', run: () => openSystem(file) });

/** The processes of the selection `sel` if it is a System's row or a node's ({ type: 'file', system } or { type:
 *  'node' }), else null; `check` and `rtl` an FPGA node's module's Check Syntax and RTL schematic. */
export function systemProcesses(sel, { check, rtl }) {
  if (sel.type === 'file' && sel.system) return [
    editSystem(sel.file),
    { id: 'sys-check', label: 'Check System', ico: 'process', run: async () => { await openSystem(sel.file); findDoc(`sys:${sel.file}`)?.checkSystem?.(); } },
    { id: 'sys-emulate', label: 'Emulate System', ico: 'board', run: async () => (await import('./system-emu-open.js')).openSystemEmulator(sel.file) },
  ];
  if (sel.type !== 'node') return null;
  return [
    editSystem(sel.file),
    ...(sel.kind === 'fpga' && sel.module ? [
      { id: 'check', label: 'Check Syntax', ico: 'process', run: () => check(sel.module) },
      { id: 'rtl', label: 'View RTL Schematic', ico: 'schematic', run: () => rtl(sel.module) },
    ] : []),
  ];
}
