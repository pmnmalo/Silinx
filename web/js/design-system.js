// The Design pane's row of a System project's System (#4700, docs/SYSTEMS.md): the project's one System document
// (.sys.json), its top, shown as `<name> [System]` in place of the device, and under it one branch per node (#5414,
// #5416's phase 2: core/project-nodes.js projectNodes, the MCP's project_info's too): an FPGA node its module's hierarchy
// (its rows as any module's), a microcontroller its firmware, a circuit its drawing, a terminal none; the project's other
// rows after them. A project with one node (an FPGA or a design project) is drawn as before: its node implicit, no branch.
// Its text is read with the project's drawings (project.js's viewTexts).
import { S } from './app.js';
import { designState } from './state-design.js';
import { filesState } from './state-files.js';
import { isSystemProject } from '/core/project-kind.js';
import { systemsOn } from '/core/build-channel.js';
import { mcuBoard, readSystem } from '/core/system-doc.js';
import { projectNodes } from '/core/project-nodes.js';
import { openSystem, systemContextMenu } from './system-open.js';

/** Whether the project open is a System project (and Systems are on in this build, #5202). */
export const systemProject = () => isSystemProject(S.project) && systemsOn();

/** The open project's nodes (core/project-nodes.js), its System document's text the view's. */
const shownNodes = () => projectNodes(S.project, { files: filesState.fileTree || [], texts: designState.viewTexts || {} });

const NODE_ICON = { fpga: 'chip', mcu: 'board', circuit: 'circuit', terminal: 'system' };
// a node's board, as the user knows it (its name, else its id)
const boardName = n => (n.kind === 'mcu' ? mcuBoard(n.board)?.name : S.devices?.boards?.find(b => b.id === n.board)?.name) || n.board;

/** The folder of the open System project's first microcontroller node (#5488: its id), or null. */
export const mcuFolder = () => (systemProject() ? shownNodes().nodes.find(n => n.kind === 'mcu')?.id ?? null : null);

/** Why the open System project's System cannot be read (`<file>: <why>`: one of version 1, #5488, or damaged), or null. */
export function systemProblem() {
  if (!systemProject()) return null;
  const { system, error } = shownNodes();
  return error ? `${system}: ${error}` : null;
}

/** Whether the open project's top is its System (#5443): a System project with no module as its top, its document read. */
export const systemTop = () => systemProject() && !!shownNodes().system;

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

/** The System's row (`treeItem`, design.js's) and its nodes' branches: { item, owned, fill(addModule, fileRow) } (fill
 *  draws the branches once design.js's rows can be made: an FPGA node's module with addModule, a node's files with
 *  fileRow, or its module's row if the file is a module's, moduleOf), or null (no System). */
function systemRow(treeItem, select) {
  const { system: f, nodes, owned } = shownNodes();
  if (!f) return null;
  const sys = readSystem(designState.viewTexts?.[f] || '').system;
  const menu = e => systemContextMenu(e, f);
  const item = treeItem({ label: sys?.name || f.split('/').pop(), ico: 'system', open: true, key: `sys:${f}`, cls: 'top-mod',
    badges: [{ text: 'System', base: true, title: 'Open', open: () => openSystem(f), context: menu }],
    onSelect: () => select({ type: 'file', file: f, system: true }), onOpen: () => openSystem(f), onContext: menu });
  const fill = (addModule, fileRow, moduleOf) => {
    for (const n of nodes) {
      const board = n.board ? boardName(n) : null;
      const it = treeItem({ label: n.id, meta: board ? `(${board})` : '', ico: NODE_ICON[n.kind] || 'system', open: true, key: `node:${f}:${n.id}`,
        onSelect: () => select({ type: 'node', file: f, node: n.id, kind: n.kind, module: n.module }), onOpen: () => openSystem(f), onContext: menu });
      item.ul.append(it.li);
      if (n.module) addModule(it.ul, n.module, null, 0, n.module);
      // (a circuit that is a module, its HDL generated from it: its module's row, #4069)
      for (const p of n.files) { const m = moduleOf(p); if (m) addModule(it.ul, m, null, 0, m); else it.ul.append(fileRow(p).li); }
      if (!n.module && !n.files.length) it.setLeaf();
    }
  };
  return { item, owned, fill };
}
