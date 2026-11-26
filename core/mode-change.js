// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A project's mode changed (roadmap #5753, its phase 2 #5755: core/project-mode.js), the plan of it, one for Project ▸
// Change Mode… and the MCP's set_mode. Going up loses nothing: Circuit → Board gives it a board (or a device), as Design
// Properties' board does; Board (or Circuit) → System makes its one node the System's first: its files moved into the
// node's folder (a System builds each node from its own folder, #5488), its System document written with that node (its
// board, device, top module, constraints). Going down is allowed with a warning that says what is lost, each item: System
// → Board keeps one FPGA node (its board, top module, constraints) and the others, the links and the System document leave
// the project; Board → Circuit drops the board, the constraints file and the HDL and C sources no drawing makes. Nothing
// is deleted: what leaves the project stays on the disk. Isomorphic module (browser + Node).
import { MODES, modeById, modeOf, modeOn } from './project-mode.js';
import { profileOf, withProfile } from './project-profile.js';
import { asDesignProject, asFpgaProject, ownSources } from './project-kind.js';
import { renameEntries } from './project-entries.js';
import { projectSystem } from './project-system.js';
import { isSystemFile, writeSystem, newSystem } from './system-doc.js';
import { relInNode } from './system-layout.js';
import { resolveBoard } from './devices.js';
import { VIEW_RE } from './view-hdl.js';
import { SYSTEMS_OFF } from './build-channel.js';

const RANK = Object.fromEntries(MODES.map((m, i) => [m.id, i]));
/** Whether going from the mode `from` to `to` goes down (a warning: something is lost). */
export const goesDown = (from, to) => RANK[to] < RANK[from];

// the files and folders at a project's root that stay there when its node gets a folder: its silinx.json, its builds, its
// hidden folders (git's, Silinx's), its labs (a System's are at its root: core/system-layout.js sourcePlace), its read-me,
// licence and git files, its System documents
const STAYS = /^(silinx\.json|build|labs|\..*|readme(\..*)?|licen[sc]e(\..*)?|notice(\..*)?)$/i;

/** The moves that put a project's files in the node `id`'s folder: one per entry of its root that holds a file of the
 *  project's (`owned`: its sources, its constraints, its drawings and wave configurations; a folder moved whole),
 *  [{ from, to }]; its folder's own name never moved into itself, a folder of no file of the project's (another node's
 *  left there) not moved. `files`: its paths (its file tree). */
export function nodeMoves(files, id, owned = files) {
  const mine = new Set(owned.map(f => String(f).split('/')[0]));
  const roots = [...new Set(files.map(f => String(f).split('/')[0]))].sort();
  return roots.filter(r => mine.has(r) && !STAYS.test(r) && !isSystemFile(r) && r.toLowerCase() !== id.toLowerCase()).map(r => ({ from: r, to: `${id}/${r}` }));
}

// the files of the project's own: its list's, its constraints, its drawings, its wave configurations
const ownedOf = (pj, files) => [...(pj.files || []).map(f => f.path), ...(pj.constraints ? [pj.constraints] : []), ...files.filter(f => VIEW_RE.test(f) || /\.wcfg$/i.test(f))];

/** A path after `moves`. */
const moved = (p, moves) => {
  for (const m of moves) if (p === m.from || p.startsWith(`${m.from}/`)) return m.to + p.slice(m.from.length);
  return p;
};

/** A drawing's text with its HDL file's path (`generatedFile`) after `moves`, or null when it has none to change. Every
 *  drawing (VIEW_RE) is given; a text that does not read is left as it is. */
export function relinked(path, text, moves) {
  if (!VIEW_RE.test(path)) return null;
  let d;
  try { d = JSON.parse(text); } catch { return null; }
  const g = d?.generatedFile;
  if (typeof g !== 'string' || moved(g, moves) === g) return null;
  d.generatedFile = moved(g, moves);
  return JSON.stringify(d, null, /\.(asm|tt|bool|fsm|regs)\.json$/i.test(path) ? 2 : 1);
}

// a free name for a new System document at the root: <name>.sys.json, else <name>_2.sys.json…
function systemPath(name, files) {
  const taken = new Set(files.map(f => f.toLowerCase()));
  for (let i = 1; ; i++) { const p = `${name}${i > 1 ? `_${i}` : ''}.sys.json`; if (!taken.has(p.toLowerCase())) return p; }
}

// up to System: the project's one node the first of its System, its files in the node's folder
function toSystem(pj, files) {
  const node = projectSystem(pj).model.nodes[0];
  const id = node.id, moves = nodeMoves(files, id, ownedOf(pj, files));
  const first = { ...node, constraints: node.constraints ? moved(node.constraints, moves) : null };
  for (const k of ['implicit', 'pins', 'device']) delete first[k];
  if (first.kind === 'design') delete first.constraints;
  const path = systemPath(pj.name, files);
  const sys = { ...newSystem(pj.name), nodes: [first] };
  let out = structuredClone(pj);
  for (const m of moves) out = renameEntries(out, m.from, m.to);
  out = { ...withProfile(out, profileOf(pj) === 'embedded' ? 'embedded' : 'system'), board: null, constraints: null, top: '', topSourceType: 'system' };
  const lines = [`its ${node.kind === 'fpga' ? 'board' : 'drawings'} the System's first node, ${id}${node.board ? ` (${node.board})` : ''}`,
    moves.length ? `its files moved into the node's folder, ${id}/ (${moves.map(m => m.from).join(', ')})` : null, `its System document ${path} written`].filter(Boolean);
  return { project: out, moves, write: { path, text: writeSystem(sys) }, done: lines, lost: [] };
}

// down from System: the node `keep` (an FPGA node, else a design node) the project's; the others, the links and the System
// document out of it (their files out of its list, on the disk)
function fromSystem(pj, files, texts, keep) {
  const r = projectSystem(pj, { files, texts });
  if (!r.model) return { error: `the project '${pj.name}' has no System document that reads${r.error ? ` (${r.error})` : ''}` };
  const nodes = r.model.nodes;
  const kept = keep ? nodes.find(n => n.id === keep) : nodes.find(n => n.kind === 'fpga') ?? nodes.find(n => n.kind === 'design');
  if (keep && !kept) return { error: `the System has no node '${keep}' (its nodes: ${nodes.map(n => n.id).join(', ') || 'none'})` };
  if (!kept) return { error: `the System of '${pj.name}' has no FPGA nor design node to keep: its nodes are ${nodes.map(n => `${n.id} (${n.kind})`).join(', ') || 'none'}` };
  if (kept.kind !== 'fpga' && kept.kind !== 'design') return { error: `${kept.id} is a ${kept.kind} node: only an FPGA or a design node can be kept` };
  const others = nodes.filter(n => n !== kept);
  const theirs = p => others.some(n => relInNode(p, n.id) != null);
  const out = { ...structuredClone(pj), files: (pj.files || []).filter(f => !theirs(f.path)), top: kept.module || '', topSourceType: 'hdl' };
  delete out.fpga;
  const dropped = (pj.files || []).filter(f => theirs(f.path)).map(f => f.path);
  const lost = [
    ...others.map(n => `the node ${n.id} (${n.kind}${n.board ? `, ${n.board}` : ''}) leaves the project${files.some(f => relInNode(f, n.id) != null) ? `: its folder ${n.id}/ stays on the disk` : ''}`),
    ...(r.model.links.length ? [`its ${r.model.links.length} link${r.model.links.length > 1 ? 's' : ''} (${r.model.links.map(l => l.id).join(', ')})`] : []),
    `its System document ${r.system} (it stays in the folder, out of the flow)`,
    ...(dropped.length ? [`the sources of the other nodes leave the project's list: ${dropped.join(', ')}`] : []),
  ];
  if (kept.kind === 'design') return { project: { ...asDesignProject(withProfile(out, 'logic')), top: kept.module || '' }, kept: kept.id, lost };
  const b = kept.board ? resolveBoard(kept.board, { variant: kept.variant }) : null;
  const project = { ...withProfile(out, 'fpga'), board: kept.board ?? null, device: b?.device ?? pj.device, constraints: kept.constraints ?? null };
  return { project, kept: kept.id, lost };
}

// down to Circuit from Board: the board, the constraints file, the HDL and C sources of its own out of the project
function toCircuit(pj, generated) {
  const own = new Set(ownSources(pj, generated));
  const project = asDesignProject({ ...pj, files: (pj.files || []).filter(f => !own.has(f.path)) });
  const lost = [
    ...(pj.board ? [`its board, ${pj.board}`] : []),
    ...(pj.constraints ? [`its constraints file ${pj.constraints} (it stays on the disk)`] : []),
    ...(own.size ? [`its HDL and C sources no drawing makes leave the project (they stay on the disk): ${[...own].join(', ')}`] : []),
    'its implementation, emulation and programming',
  ];
  return { project, lost };
}

/**
 * The plan of the project `pj` (its silinx.json) changed to the mode `to`: { project (its silinx.json after), moves
 * ([{ from, to }], the files moved, in order), write ({ path, text }: a System document, or null), relink (true: the
 * drawings' HDL paths to follow the moves, `relinked`), down (true: something is lost), lost (what is lost, each said),
 * done (what is done, each said), kept (System → Board: the node kept) } or { error }. `files`: its paths (its file tree);
 * `texts`: its System document's text; `generated`: the paths its drawings generate; `board`, `device`, `ext`: Circuit →
 * Board's board or device (`ext`: its constraints file's extension); `keep`: the node System → Board keeps.
 */
export function modeChange(pj, to, { files = [], texts = {}, generated = [], board = null, device = null, ext = '.ucf', keep = null } = {}) {
  const from = modeOf(pj), m = modeById(to);
  if (!m) return { error: `no mode '${to}' (the modes: ${MODES.map(x => x.id).join(', ')})` };
  if (from === to) return { error: `the project '${pj.name}' is a ${m.label} project already` };
  if (!modeOn(to)) return { error: SYSTEMS_OFF };
  if (keep && from !== 'system') return { error: 'keep: the node a System keeps going down; this project has no System' };
  if ((board || device) && !(from === 'circuit' && to === 'board')) return { error: 'a board or a device is given going from Circuit to Board only' };
  const base = { moves: [], write: null, relink: false, down: goesDown(from, to), lost: [], done: [], kept: null };
  if (to === 'system') {
    // (Circuit: its drawings the design node; Board: its board the FPGA node)
    const r = toSystem(pj, files);
    return { ...base, ...r, relink: r.moves.length > 0 };
  }
  if (from === 'system') {
    const r = fromSystem(pj, files, texts, keep);
    if (r.error) return r;
    if (to === 'board' && modeOf(r.project) === 'circuit') return { error: `the node ${r.kept} is a design node: going down to Circuit keeps it (a Board needs an FPGA node)` };
    if (to === 'circuit' && modeOf(r.project) === 'board') {
      const c = toCircuit(r.project, generated);
      return { ...base, project: c.project, kept: r.kept, lost: [...r.lost, ...c.lost], done: [`the node ${r.kept} the project's`] };
    }
    return { ...base, project: r.project, kept: r.kept, lost: r.lost, done: [`the node ${r.kept} the project's${r.project.board ? ` (${r.project.board})` : ''}`] };
  }
  if (to === 'board') {
    const project = asFpgaProject(pj, { board, device, ext });
    return { ...base, project, done: [project.board ? `its board ${project.board}` : 'its device, no board yet', `its constraints file ${project.constraints}, to be written`] };
  }
  const c = toCircuit(pj, generated);
  return { ...base, project: c.project, lost: c.lost };
}

/** What a mode change does, said: its first line, then a WARNING line for each thing lost, a line for each done. */
export function modeChangeText(name, to, plan) {
  const head = `${name}: ${modeById(to).label} now${plan.down ? ' (nothing deleted: what left the project stays on the disk)' : ' (nothing lost)'}.`;
  return [head, ...plan.done.map(d => `  ${d}`), ...plan.lost.map(l => `WARNING: lost: ${l}`)].join('\n');
}

/** Why a change down is refused unconfirmed (the MCP's set_mode without confirm): what would be lost, each said. */
export const confirmText = (name, to, plan) => `going down to ${modeById(to).label} loses, in '${name}': ${plan.lost.join('; ')}. Give confirm true to do it (nothing is deleted from the disk).`;
