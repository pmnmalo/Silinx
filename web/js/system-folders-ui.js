// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A System project's nodes' folders as the System editor saves its System (#5488, core/system-layout.js layoutPlan,
// as the MCP's edit_system does, server/system-folders.js): a renamed node's folder renamed with it (app.js moveFolder,
// Rename Folder's: its documents and the drawings' links follow), a removed node's deleted when the user says so (as
// Delete Folder asks), else kept and said.
import { api } from './api.js';
import { moveFolder, dropFolder } from './app.js';
import { confirmDlg } from './ui.js';
import { log } from './console.js';
import { filesState } from './state-files.js';
import { layoutPlan } from '/core/system-layout.js';

// a node's folder as the project spells it (its id in any case), and its files
const folderOf = id => {
  const files = (filesState.fileTree || []).filter(f => f.toLowerCase().startsWith(`${String(id).toLowerCase()}/`));
  return { dir: files[0]?.split('/')[0] ?? null, files };
};

/** The nodes' folders made as the System `after` says, from the System as saved `before` and the renames of its editor
 *  since. Throws when a folder cannot be renamed (the System then not written: said by its save). */
export async function saveNodeFolders(before, after, renames) {
  const plan = layoutPlan(before, after, renames);
  for (const { from, to } of plan.renames) {
    const { dir } = folderOf(from);
    if (!dir) continue;   // (no file yet: no folder)
    if (to.toLowerCase() !== from.toLowerCase() && folderOf(to).dir) throw new Error(`the node ${from} renamed ${to}: its folder cannot be renamed, '${to}' already exists`);
    if (!await moveFolder(dir, to)) throw new Error(`the node ${from} renamed ${to}: its folder ${dir}/ could not be renamed`);
  }
  for (const id of plan.removed) {
    const { dir, files } = folderOf(id);
    if (!dir) continue;
    const trash = !api.standalone || api.keepsTrash;
    if (await confirmDlg('Remove Node', `Delete the folder '${dir}' of the removed node ${id} and the ${files.length} file(s) in it from the project?${trash ? '\n(They are moved to the workspace\'s .trash folder, from where you can move them back.)' : ''}\n\n${files.slice(0, 12).join('\n')}${files.length > 12 ? '\n…' : ''}`)) await dropFolder(dir);
    else log(`Folder ${dir} of the removed node ${id} kept.`, 'info');
  }
}
