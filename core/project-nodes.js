// A project's nodes (#5414, roadmap #5416's phase 2: every project a System): what the Design pane shows as branches and
// the MCP server's project_info says, from one function. Read from the project's System (core/project-system.js, #5416's
// phase 3): an FPGA project or a design and simulation project has one node, implicit (derived, nothing written: no
// .sys.json); a System project's nodes are its System document's (its .sys.json, core/system-doc.js), each with the files
// it uses. Isomorphic module (browser + Node).
import { projectSystem } from './project-system.js';

/** A System node's own files (the project's: its firmware, its circuit; an implicit FPGA node's constraints), none for the
 *  others. */
const nodeFiles = n => (n.kind === 'mcu' ? [n.firmware] : n.kind === 'circuit' ? [n.circuit] : n.implicit ? [n.constraints] : [])
  .filter(f => typeof f === 'string' && f);

// a node as the Design pane and project_info give it
const shown = n => (n.implicit
  ? { id: n.id, kind: n.kind, implicit: true, board: n.board, device: n.device, module: n.module, files: nodeFiles(n) }
  : { id: n.id, kind: n.kind, board: n.board ?? null, ...(n.variant != null ? { variant: n.variant } : {}),
    module: n.kind === 'fpga' ? n.module ?? null : null, files: nodeFiles(n) });

/** A project's nodes: { system (its System document's path, or null), nodes: [{ id, kind, implicit?, board, variant?,
 *  device?, module, files }], owned (the files a node uses, shown under it, not among the project's other rows), error
 *  (its System document unreadable, or null) }. `files` the project's paths (its file tree), `texts` their texts (the
 *  System document's at least). A System project with no System document, or one that cannot be read, has no node. */
export function projectNodes(pj, { files = [], texts = {} } = {}) {
  const { model, system, error } = projectSystem(pj, { files, texts });
  const nodes = (model?.nodes ?? []).map(shown);
  return { system, nodes, owned: [...new Set(nodes.flatMap(n => n.files))], error };
}
