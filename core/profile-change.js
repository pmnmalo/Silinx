// A project's profile changed (#5440, roadmap #5416's phase 4): Design Properties' Project Kind, the MCP's
// set_design_properties, and the System as a project's top (#5402, core/system-top.js), one function and one set of
// messages. Widening allows more node kinds and converts nothing (Digital Logic to FPGA: its board or device, as Design
// Properties gives them); narrowing is refused while a node of the project's System would not be allowed, the node
// named, and a design project's own rule kept (its HDL and C sources of its own refused: core/project-kind.js
// toDesignProject); a System as the top is a System's profile's: a module set as the top first. Nothing is deleted.
// Isomorphic module (browser + Node).
import { profileById, profileOf, profileRefusal, systemProfile, withProfile } from './project-profile.js';
import { asFpgaProject, toDesignProject } from './project-kind.js';
import { projectSystem } from './project-system.js';

/**
 * The project `pj` (its silinx.json) with the profile `to`: { project } (unchanged when it has it already) or { error }.
 * `files` and `texts`: its paths and its System document's text (its nodes read); `generated`: the paths its drawings
 * generate (Digital Logic's rule); `fpga`: { board, device, ext } for Digital Logic to FPGA.
 */
export function changeProfile(pj, to, { files = [], texts = {}, generated = [], fpga = {} } = {}) {
  const from = profileOf(pj);
  if (from === to) return { project: pj };
  const nodes = (projectSystem(pj, { files, texts }).model?.nodes ?? []).filter(n => !n.implicit);
  const why = profileRefusal(pj.name, to, nodes);
  if (why) return { error: why };
  if (systemProfile(from) && !systemProfile(to) && !pj.top) {
    return { error: `the project '${pj.name}' cannot be ${profileById(to).label}: its top is its System (Set as Top Module on one of its modules first)` };
  }
  if (to === 'logic') return toDesignProject(pj, generated);
  if (to === 'fpga') return { project: from === 'logic' ? asFpgaProject(pj, fpga) : withProfile(pj, 'fpga') };
  return { project: withProfile(pj, to) };
}
