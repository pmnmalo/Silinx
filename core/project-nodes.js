// A project's nodes (#5414, roadmap #5416's phase 2: every project a System): what the Design pane shows as branches and
// the MCP server's project_info says, from one function. An FPGA project or a design and simulation project has one node,
// implicit (derived here, nothing written: no .sys.json); a System project's nodes are its System document's (its .sys.json,
// core/system-doc.js), each with the files it uses. Isomorphic module (browser + Node).
import { isDesignOnly, isSystemProject } from './project-kind.js';
import { isSystemFile, readSystem } from './system-doc.js';

/** A System node's own files (the project's: its firmware, its circuit), none for the others. */
const nodeFiles = n => (n.kind === 'mcu' ? [n.firmware] : n.kind === 'circuit' ? [n.circuit] : []).filter(f => typeof f === 'string' && f);

/** The implicit node of a project with one (#5416): an FPGA project's (its board, its device, its top module and its
 *  constraints) or a design and simulation project's (its top drawing's module, no board). */
function implicitNode(pj) {
  if (isDesignOnly(pj)) return { id: 'design', kind: 'design', implicit: true, board: null, device: null, module: pj.top || null, files: [] };
  return { id: 'fpga', kind: 'fpga', implicit: true, board: pj.board ?? null, device: pj.device ?? null, module: pj.top || null,
    files: pj.constraints ? [pj.constraints] : [] };
}

/** A project's nodes: { system (its System document's path, or null), nodes: [{ id, kind, implicit?, board, variant?,
 *  device?, module, files }], owned (the files a node uses, shown under it, not among the project's other rows), error
 *  (its System document unreadable, or null) }. `files` the project's paths (its file tree), `texts` their texts (the
 *  System document's at least). A System project with no System document, or one that cannot be read, has no node. */
export function projectNodes(pj, { files = [], texts = {} } = {}) {
  if (!isSystemProject(pj)) { const n = implicitNode(pj || {}); return { system: null, nodes: [n], owned: [...n.files], error: null }; }
  const system = files.find(isSystemFile) || null;
  if (!system) return { system: null, nodes: [], owned: [], error: null };
  const r = readSystem(texts[system] ?? '');
  if (r.error) return { system, nodes: [], owned: [], error: r.error };
  const nodes = r.system.nodes.map(n => ({ id: n.id, kind: n.kind, board: n.board ?? null, ...(n.variant != null ? { variant: n.variant } : {}),
    module: n.kind === 'fpga' ? n.module ?? null : null, files: nodeFiles(n) }));
  return { system, nodes, owned: [...new Set(nodes.flatMap(n => n.files))], error: null };
}
