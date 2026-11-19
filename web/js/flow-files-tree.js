// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The files the implementation and the Board Emulator read beside the HDL, in the trees (#4591; core/flow-files.js):
// - the ISE style interface's Implementation view: under the top module's row, as ISE's (web/js/design.js); the
//   constraints' row selected shows their processes (Edit Constraints (Text), Check Constraints, I/O Pin Planning);
// - the Silinx interface's Implement and Emulate side panels (.task-flow-files, web/js/tasks.js): the top module's row,
//   its badges as the Design page's, and the same files under it, above the processes (which are the top's whatever
//   these rows select).
// A double-click opens a file, its menu is the file's (the Files page's: Open, Check Syntax, …).

import { h } from './ui.js';
import { S, moduleInfo, openFile } from './app.js';
import { fileContextMenu, moduleBadges, moduleContextMenu, openModuleSource, select, treeItem } from './design.js';
import { viewContextMenu } from './drawings.js';
import { gitMark } from './git.js';
import { flowFiles } from '/core/flow-files.js';

/** The flow's files' rows ({ li }: treeItem's), for the tree they go in: `hier` (the Design pane's) selects what they show. */
export function flowFileRows({ hier = true } = {}) {
  if (!S.project) return [];
  return flowFiles(S.project, S.fileTree || []).map(({ path, kind }) => {
    const cons = kind === 'constraints';
    const it = treeItem({
      label: path.split('/').pop(), ico: cons ? 'ucf' : 'file', key: `${hier ? '' : 'flow:'}${cons ? 'ucf' : `mem:${path}`}`, mark: gitMark([path]),
      onSelect: hier ? () => select(cons ? { type: 'ucf', file: path } : { type: 'file', file: path }) : null,
      onOpen: () => openFile(path), onContext: e => fileContextMenu(e, path),
    });
    it.setLeaf();
    it.row.dataset.flowFile = kind;
    return it;
  });
}

/** The Silinx interface's Implement and Emulate side panels: the top module and the flow's files under it, in `host`. */
export function renderFlowTree(host) {
  host.innerHTML = '';
  const top = S.project?.top, info = top ? moduleInfo(top) : null;
  if (!info) return;
  const tree = h('ul', { class: 'tree', 'aria-label': 'Top module and its files' });
  // (its menu the Design row's; its badges as the Design page's: the HDL's opens the HDL, the others the module's base)
  const drawn = /\.(sch|asm|tt|bool|fsm|pn|circ)\.json$/.test(info.file) ? info.file : null;
  const menu = e => (drawn ? viewContextMenu(e, drawn) : moduleContextMenu(e, info.name, info.file));
  const badges = moduleBadges(top).map(b => ({ ...b, title: 'Open', context: menu,
    open: () => (!b.base && /^(VHDL|Verilog)$/.test(b.text) ? openFile(info.file, info.line) : openModuleSource(top)) }));
  const it = treeItem({ label: info.name, meta: `(${info.file.split('/').pop()})`, ico: 'moduleTop', cls: 'top-mod', key: 'flow:top', open: true, badges,
    module: info.name, onOpen: () => openModuleSource(top), onContext: menu });
  const rows = flowFileRows({ hier: false });
  if (!rows.length) it.setLeaf();
  for (const r of rows) it.ul.append(r.li);
  tree.append(it.li);
  host.append(tree);
}
