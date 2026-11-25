// Any project's System (roadmap #5416's phase 3: every project a System), read only: the model of a System document
// (core/system-doc.js: format, version, name, nodes, links) for every project. A System project's is its System document
// as it reads (its top: one of the Embedded / SoC or System profile with no module as its top, #5440); any other's is implicit, derived here from its silinx.json and
// nothing written (no .sys.json; silinx.json as it is): one node, no link. The FPGA node carries its project's board (its
// variant the board's for the device), device, top module and constraints as silinx.json says them; a design project's node
// (kind design: drawings simulated, no board) its top module. core/project-nodes.js reads its nodes from here.
// Isomorphic module (browser + Node).
import { isDesignOnly, isSystemProject } from './project-kind.js';
import { SYSTEM_FORMAT, SYSTEM_VERSION, isSystemFile, readSystem } from './system-doc.js';
import { resolveBoard } from './devices.js';
import { baseLang } from './system-layout.js';

// the board's variant for the project's device (the Basys2's 100 or 250), none when the board has none or is not known
function variantOf(board, device) {
  if (!board) return null;
  try { return resolveBoard(board, { part: device?.part })?.variant?.id ?? null; } catch { return null; }
}

/** The implicit node of a project with one (#5416): an FPGA project's or a design and simulation project's. */
function implicitNode(pj) {
  // (its base language the project's preferred HDL, #5488)
  const at = { pins: {}, interfaces: [], x: 0, y: 0, implicit: true };
  if (isDesignOnly(pj)) return { id: 'design', kind: 'design', module: pj.top || null, board: null, device: null, constraints: null, lang: baseLang({ kind: 'design' }, pj.preferredLanguage), ...at };
  const variant = variantOf(pj.board, pj.device);
  return { id: 'fpga', kind: 'fpga', module: pj.top || null, board: pj.board ?? null, ...(variant != null ? { variant: String(variant) } : {}),
    device: pj.device ?? null, constraints: pj.constraints ?? null, lang: baseLang({ kind: 'fpga' }, pj.preferredLanguage), ...at };
}

/** A project's System: { model ({ format, version, name, nodes, links }, or null when its System document is missing or
 *  cannot be read), implicit (derived from silinx.json, nothing written), system (its System document's path, or null),
 *  error (why it cannot be read, or null) }. `files` the project's paths (its file tree), `texts` their texts (its
 *  System document's at least). */
export function projectSystem(pj, { files = [], texts = {} } = {}) {
  const p = pj || {};
  // (a System document the project's System when it is its top: a System project's with no module as its top, #5440)
  if (!isSystemProject(p) || p.top) {
    return { model: { format: SYSTEM_FORMAT, version: SYSTEM_VERSION, name: String(p.name ?? 'system'), nodes: [implicitNode(p)], links: [] },
      implicit: true, system: null, error: null };
  }
  const system = files.find(isSystemFile) || null;
  if (!system) return { model: null, implicit: false, system: null, error: null };
  const r = readSystem(texts[system] ?? '');
  return r.error ? { model: null, implicit: false, system, error: r.error } : { model: r.system, implicit: false, system, error: null };
}
