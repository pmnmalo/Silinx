// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The files the implementation and the Board Emulator read beside the HDL, in the trees (#4591; core/flow-files.js):
// the ISE style interface's Implementation view: under the top module's row, as ISE's (web/js/design.js); the
// constraints' row selected shows their processes (Edit Constraints (Text), Check Constraints, I/O Pin Planning). (The
// Silinx interface's Implement and Emulate have them on their Files page: web/js/tasks-flow-files.js, #4609.)
// A double-click opens a file, its menu is the file's (the Files page's: Open, Check Syntax, …).

import { S, openFile } from './app.js';
import { fileContextMenu, select, treeItem } from './design.js';
import { gitMark } from './git.js';
import { flowFiles } from '/core/flow-files.js';
import { filesState } from './state-files.js';

/** The flow's files' rows ({ li }: treeItem's) of the Design pane's Implementation view. */
export function flowFileRows({ skip = [] } = {}) {
  if (!S.project) return [];
  // (`skip`: the files a System's node shows under it, its firmware, #5414)
  return flowFiles(S.project, filesState.fileTree || []).filter(({ path }) => !skip.includes(path)).map(({ path, kind }) => {
    const cons = kind === 'constraints';
    const it = treeItem({
      label: path.split('/').pop(), ico: cons ? 'ucf' : 'file', key: cons ? 'ucf' : `mem:${path}`, mark: gitMark([path]),
      onSelect: () => select(cons ? { type: 'ucf', file: path } : { type: 'file', file: path }),
      onOpen: () => openFile(path), onContext: e => fileContextMenu(e, path),
    });
    it.setLeaf();
    it.row.dataset.flowFile = kind;
    return it;
  });
}
