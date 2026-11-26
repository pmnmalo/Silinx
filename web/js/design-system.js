// The Design pane's row of a System project's System (#4700, docs/SYSTEMS.md): the project's one System document
// (.sys.json), its top, shown as `<name> [System]` in place of the device, and under it one branch per node (#5414,
// #5416's phase 2: core/project-nodes.js projectNodes, the MCP's project_info's too), grouped by node (#5488: a node a
// folder, each row under the node whose folder holds its file): an FPGA node its module's hierarchy (its rows as any
// module's) and its folder's other modules and drawings, a microcontroller its firmware and its folder's sources, a
// circuit its drawing, a terminal none; the rows in no node's folder under the System. A project with one node (an FPGA or a design project) is drawn as before: its node implicit, no branch.
// Its text is read with the project's drawings (project.js's viewTexts).
import { S } from './app.js';
import { designState } from './state-design.js';
import { filesState } from './state-files.js';
import { isSystemProject } from '/core/project-kind.js';
import { systemsOn } from '/core/build-channel.js';
import { mcuBoard, readSystem } from '/core/system-doc.js';
import { projectNodes } from '/core/project-nodes.js';
import { nodeOfPath, nodeFilesOf, sourcePlace, LANG_NAMES } from '/core/system-layout.js';
import { panes } from './state-panes.js';
import { openSystem, systemContextMenu } from './system-open.js';
import { cpuCode, isCpuDrawing } from './design-cpu.js';
import { processorBoardOf } from '/core/processor-board.js';

/** Whether the project open is a System project (and Systems are on in this build, #5202). */
export const systemProject = () => isSystemProject(S.project) && systemsOn();

/** The open project's nodes (core/project-nodes.js), its System document's text the view's. */
const shownNodes = () => projectNodes(S.project, { files: filesState.fileTree || [], texts: designState.viewTexts || {} });

const NODE_ICON = { fpga: 'chip', mcu: 'board', circuit: 'circuit', terminal: 'system' };
// a node's board, as the user knows it (its name, else its id)
const boardName = n => (n.kind === 'mcu' ? mcuBoard(n.board)?.name : S.devices?.boards?.find(b => b.id === n.board)?.name) || n.board;

/** The folder of the open System project's first microcontroller node (#5488: its id), or null. */
export const mcuFolder = () => (systemProject() ? shownNodes().nodes.find(n => n.kind === 'mcu')?.id ?? null : null);

/** Where New Source puts a source of the folder kind `dir` in the open System project (#5488, core/system-layout.js
 *  sourcePlace): the selected node's folder (a node's row, or a row of a file in its folder), else the first FPGA
 *  node's, with its base language: { node, location, lang }, or null (not a System project, no such node). */
export function newSourcePlace(dir) {
  if (!systemProject()) return null;
  const { system: f, nodes } = shownNodes();
  const sys = f ? readSystem(designState.viewTexts?.[f] || '').system : null;
  const sel = panes.sel, id = sel?.node ?? nodeOfPath(sel?.file, nodes.map(n => n.id));
  return sourcePlace(sys, { id, dir, preferred: S.project?.preferredLanguage });
}

/** Why the open System project's System cannot be read (`<file>: <why>`: one of version 1, #5488, or damaged), or null. */
export function systemProblem() {
  if (!systemProject()) return null;
  const { system, error } = shownNodes();
  return error ? `${system}: ${error}` : null;
}

/** Whether the open project's top is its System (#5443): a System project with no module as its top, its document read. */
export const systemTop = () => systemProject() && !!shownNodes().system;

/** The open System project's System: { file, system } (system null when it is not read), or null (no System). */
export function shownSystem() {
  const f = systemProject() ? shownNodes().system : null;
  return f ? { file: f, system: readSystem(designState.viewTexts?.[f] || '').system } : null;
}

/** The Design pane's top row of any project (#5443, #5416's phase 5: one path, from its nodes): a System's row with its
 *  nodes' branches (systemRow), or the one implicit node of a project with one drawn as its device row as before: the
 *  device (an FPGA project's), Design (a design project's), Behavioral (the Simulation view's). Returns { item, owned,
 *  fill } (fill null: nothing more under it from the nodes). */
export function topRow(treeItem, select, { sim, dev, menu }) {
  const sys = !sim && systemProject() ? systemRow(treeItem, select) : null;
  if (sys) return sys;
  const [n] = shownNodes().nodes;
  const label = n?.kind === 'design' ? 'Design' : !sim ? dev : 'Behavioral';
  return { item: treeItem({ label, ico: !sim ? 'chip' : 'sim', open: true, key: 'device', onSelect: () => select({ type: 'device' }), onContext: menu }), owned: [], fill: null };
}

/** The System's row (`treeItem`, design.js's) and its nodes' branches, one per node, each its folder's rows (#5488):
 *  { item, owned, fill(addModule, fileRow, moduleOf, roots), ulOf(path), finish() } (fill draws the branches once
 *  design.js's rows can be made: an FPGA node's module with addModule, then its folder's other root modules (`roots`, the
 *  view's), a node's files with fileRow, or its module's row if the file is a module's, moduleOf; ulOf the branch a row of
 *  the file `path` goes under, its node's, else null: the System's; finish marks the empty branches), or null (no
 *  System), tops the FPGA nodes' top modules (lower case). A node's sub-folders (a Zynq's PL and PS, later) are rows of its
 *  branch. */
function systemRow(treeItem, select) {
  const { system: f, nodes, owned } = shownNodes();
  if (!f) return null;
  const sys = readSystem(designState.viewTexts?.[f] || '').system;
  const menu = e => systemContextMenu(e, f);
  // (a processor board's Board project, #5756: its one node the top row, its board's; no System row)
  const single = processorBoardOf(S.project) && nodes.length === 1 ? nodes[0] : null;
  const nodeRow = (n, cls) => treeItem({ label: n.id, meta: n.board ? `(${boardName(n)})` : '', ico: NODE_ICON[n.kind] || 'system', open: true, key: `node:${f}:${n.id}`, cls,
    onSelect: () => select({ type: 'node', file: f, node: n.id, kind: n.kind, module: n.module, board: n.board, lang: n.lang }), onOpen: () => openSystem(f), onContext: menu });
  const item = single ? nodeRow(single, 'top-mod') : treeItem({ label: sys?.name || f.split('/').pop(), ico: 'system', open: true, key: `sys:${f}`, cls: 'top-mod',
    badges: [{ text: 'System', base: true, title: 'Open', open: () => openSystem(f), context: menu }],
    onSelect: () => select({ type: 'file', file: f, system: true }), onOpen: () => openSystem(f), onContext: menu });
  const ids = nodes.map(n => n.id), branches = new Map();   // node id -> its branch's item
  // (a microcontroller's folder's sources, its firmware's first: its .asm, .c, .py, #5488; an FPGA node's are modules)
  const tree = filesState.fileTree || [];
  // (a drawing's C, #5486: its drawing's row's, not one of its own)
  const sources = n => { if (n.kind !== 'mcu') return []; const ps = nodeFilesOf(tree, n.id), code = new Set(ps.map(cpuCode).filter(Boolean)); return ps.filter(p => !n.files.includes(p) && !designState.hdlToSch?.[p] && !code.has(p)); };
  const fill = (addModule, fileRow, moduleOf, roots = [], drawingRow = null) => {
    for (const n of nodes) {
      const it = single ? item : nodeRow(n);
      if (!single) item.ul.append(it.li);
      branches.set(n.id, it);
      // (a CPU node's drawings: rows as an FPGA node's, their last badge its base language's, #5488: [Py] MicroPython's,
      // #5487)
      const cpu = n.kind === 'mcu' ? (n.lang === 'micropython' ? 'Py' : LANG_NAMES[n.lang]) ?? null : null;
      if (n.module) addModule(it.ul, n.module, null, 0, n.module);
      const mine = roots.filter(r => r !== n.module && nodeOfPath(moduleFile(r), ids) === n.id);
      for (const m of mine) addModule(it.ul, m, null, 0, m, cpu);
      // (a circuit that is a module, its HDL generated from it: its module's row, #4069; a module's file once)
      // (its drawings first, as an FPGA node's modules, then its firmware and its other files)
      const files = [...n.files, ...sources(n)], drawn = p => !!(cpu && drawingRow && isCpuDrawing(p));
      for (const p of [...files.filter(drawn), ...files.filter(p => !drawn(p))]) {
        // (a drawing in a CPU node: its board's program, its C generated from it, its row: #5486, design-cpu.js)
        if (drawn(p)) { it.ul.append(drawingRow(p, cpu, sys?.nodes?.find(x => x.id === n.id) ?? n).li); continue; }
        const m = moduleOf(p) ?? (cpu ? designState.viewModule?.[p] : null);   // (a CPU node's drawing: its module's row)
        if (!m) it.ul.append(fileRow(p).li);
        else if (!mine.includes(m) && m !== n.module) addModule(it.ul, m, null, 0, m, cpu);
      }
    }
    // (the root modules in no node's folder, none a node's own (its module, its circuit's): under the System)
    const theirs = new Set([...nodes.map(n => n.module), ...owned.map(moduleOf), ...owned.map(p => designState.viewModule?.[p])].filter(Boolean));
    for (const m of roots.filter(r => !theirs.has(r) && nodeOfPath(moduleFile(r), ids) == null)) addModule(item.ul, m, null, 0, m);
  };
  const ulOf = path => branches.get(nodeOfPath(path, ids))?.ul ?? null;
  const finish = () => { for (const it of branches.values()) if (!it.ul.children.length && it !== item) it.setLeaf(); };
  // (each FPGA node's top module, marked as an FPGA project's top, #5583)
  const tops = new Set(nodes.filter(n => n.kind === 'fpga' && n.module).map(n => String(n.module).toLowerCase()));
  return { item, owned: [...owned, ...nodes.flatMap(sources)], fill, ulOf, finish, tops };
}

// a module's file (its drawing's, when it is drawn), or null
const moduleFile = name => designState.modules?.find(m => m.name === name)?.file ?? null;
