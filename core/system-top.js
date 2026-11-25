// A System as a project's top (#5402): Top-Level Source Type "System" (New Project, Design Properties, the MCP's
// new_project and set_design_properties) and Set as Top Module on a System document (the MCP's set_top) make the
// project a System project, the System its top (core/project-kind.js asSystemProject: no board of its own, each
// FPGA node names its own). Set as Top Module on a module of a System project sets the top module of the FPGA node whose
// folder holds it, the System staying the project's top (#5583: before, it made the project an FPGA project again).
// Off in a release, as Systems are (#5202). One rule and one set of messages for the interface and the MCP server.
// Isomorphic module (browser + Node).
import { systemsOn, SYSTEMS_OFF } from './build-channel.js';
import { asSystemProject, isSystemProject, isDesignOnly } from './project-kind.js';
import { newSystemFile } from './system-doc.js';
import { changeNode, NODE_KIND_NAMES } from './system-edit.js';
import { nodeOfPath } from './system-layout.js';

/** The Top-Level Source Type of a System. */
export const SYSTEM_TOP = 'system';

/** Why a process of the FPGA flow is refused in the project `name` whose top is its System (#5443): its FPGA nodes are
 *  implemented each on its own board, not yet (docs/SYSTEMS.md's phase 3). The interface offers none; the MCP says it. */
export const systemFlowRefusal = name => `the project '${name}' has its System as its top: its FPGA nodes are not implemented yet, each on its own board (Check Syntax and the simulation work on their modules)`;

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

/** Why `mod` (its file `file`) cannot be the top module of a node of the System `sys`, or null (#5583). */
function nodeTopRefusal(sys, n, mod) {
  if (!n) return `'${mod}' is in no node's folder of the System ${sys.name}: a System project's top is its System, and an FPGA node's top module is a module of its folder`;
  if (n.kind !== 'fpga') return `'${mod}' is in the folder of ${n.id}, a ${NODE_KIND_NAMES[n.kind] || n.kind} node: only an FPGA node has a top module`;
  return null;
}

/**
 * Set as Top Module of the module `mod` (its file `file`) in a System project (#5583): the FPGA node whose folder holds it
 * gets it as its top module (its `module`, what Build Node, Implement and Program Node use); the System stays the
 * project's top. { system, node, text } (system null: already its top), or { error }.
 */
export function nodeTop(sys, mod, file) {
  const n = sys.nodes.find(x => x.id === nodeOfPath(file, sys.nodes.map(y => y.id)));
  const error = nodeTopRefusal(sys, n, mod);
  if (error) return { error };
  if (String(n.module || '').toLowerCase() === String(mod).toLowerCase()) return { system: null, node: n.id, text: `'${mod}' is already ${n.id}'s top module` };
  const r = changeNode(sys, n.id, { module: mod });
  return r.error ? r : { system: r.system, node: n.id, text: `'${mod}' is now ${n.id}'s top module (the System ${sys.name} stays the project's top)` };
}

/** Why Unset as Top Module is refused in a System project (#5583): each FPGA node always has its top module. */
export const NODE_UNSET_REFUSAL = 'a System project\'s top is its System, and each FPGA node always has a top module: Set as Top Module on another module of its folder changes it';
