// A System as a project's top (#5402): Top-Level Source Type "System" (New Project, Design Properties, the MCP's
// new_project and set_design_properties) and Set as Top Module on a System document (the MCP's set_top) make the
// project a System project, the System its top (core/project-kind.js asSystemProject: no board of its own, each
// FPGA node names its own). Set as Top Module on a module of a System project makes it an FPGA project again, that
// module its top, on the board of the System's FPGA node that runs it (its variant's device), else on the board it had.
// Off in a release, as Systems are (#5202). One rule and one set of messages for the interface and the MCP server.
// Isomorphic module (browser + Node).
import { systemsOn, SYSTEMS_OFF } from './build-channel.js';
import { asSystemProject, asFpgaProject, isSystemProject, isDesignOnly } from './project-kind.js';
import { newSystemFile } from './system-doc.js';
import { resolveBoard } from './devices.js';
import { constraintsExtOf } from '../packages/silinx-fpga/src/parts.js';

/** The Top-Level Source Type of a System. */
export const SYSTEM_TOP = 'system';

/** Why the project `pj` cannot have a System as its top, or null. */
export function systemTopRefusal(pj) {
  if (!systemsOn()) return SYSTEMS_OFF;
  if (isDesignOnly(pj)) return 'a design and simulation project\'s top is a drawing: a System is a System project\'s top (New Project ▸ System)';
  return null;
}

/**
 * The project `pj` (its silinx.json) with the System `file` as its top: a System project (its board and constraints
 * left, kept in `fpga` to come back to; nothing deleted), its top type System. `file` none: a new System document,
 * `<name>.sys.json` (core/system-doc.js newSystemFile), to write: returns { pj, write: { path, text } | null }.
 */
export function toSystemTop(pj, file = null) {
  const made = file ? null : newSystemFile(pj.name);
  const fpga = isSystemProject(pj) ? pj.fpga ?? null : { board: pj.board ?? null, device: pj.device, constraints: pj.constraints ?? null };
  return { pj: { ...asSystemProject(pj), ...(fpga ? { fpga } : {}) }, write: made, file: file || made.path };
}

/**
 * The System project `pj` made an FPGA project again, the module `mod` its top: on the board of the System's (`system`,
 * read) FPGA node that runs `mod` (its variant's device), else on the board it had before it was made a System
 * project (`pj.fpga`), else on none (the default device). Its top type the one it had, else HDL.
 */
export function toModuleTop(pj, mod, system = null) {
  const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
  const node = (system?.nodes || []).find(n => n.kind === 'fpga' && same(n.module, mod));
  const r = node?.board ? resolveBoard(node.board, { variant: node.variant }) : null;
  const was = pj.fpga || {};
  const board = r ? node.board : was.board ?? null, device = r ? r.device : was.device || pj.device;
  const out = asFpgaProject(pj, { board, device, ext: constraintsExtOf(device) });
  if (!r && was.constraints) out.constraints = was.constraints;
  delete out.fpga;
  return { ...out, top: mod, topSourceType: pj.topSourceType === SYSTEM_TOP ? 'hdl' : pj.topSourceType };
}
