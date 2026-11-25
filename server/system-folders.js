// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A System project's nodes' folders as its System is saved (#5488, core/system-layout.js layoutPlan): a renamed node's
// folder renamed with it (its files' entries in silinx.json with them, server/projects.js renameFile), a removed node's
// moved to the workspace's trash when the user says so (deleteFile's trash, as Delete Folder), else kept and said. The
// MCP server's edit_system's; the interface does the same through its store (web/js/system-folders-ui.js).
import * as P from './projects.js';
import { nodeDir } from '../core/system-layout.js';
import { VIEW_RE } from '../core/view-hdl.js';

// the drawings linked to an HDL file of the renamed folder follow it (as rename_file's, server/mcp-sources.js)
async function followLinks(name, a, b) {
  for (const f of (await P.fileTree(name)).filter(x => VIEW_RE.test(x))) {
    let d;
    try { d = JSON.parse(await P.readFile(name, f)); } catch { continue; }
    if (!d?.generatedFile?.startsWith(`${a}/`)) continue;
    d.generatedFile = b + d.generatedFile.slice(a.length);
    await P.writeFile(name, f, JSON.stringify(d, null, /\.(asm|tt|bool|fsm|regs)\.json$/i.test(f) ? 2 : 1));
  }
}

/** The folders of `plan` ({ renames, removed }) applied to the project `name`: the lines that say what was done. Every
 *  folder named by a node's id (an identifier, nodeDir), joined by the project's safe join (renameFile, deleteFile). */
export async function applyNodeFolders(name, plan, { deleteFolders = false } = {}) {
  const tree = await P.fileTree(name), lines = [];
  const has = id => tree.some(f => f.toLowerCase().startsWith(`${nodeDir(id).toLowerCase()}/`));
  for (const { from, to } of plan.renames) {
    if (!has(from)) continue;   // (no file yet: no folder)
    await P.renameFile(name, nodeDir(from), nodeDir(to));
    await followLinks(name, nodeDir(from), nodeDir(to));
    lines.push(`folder ${from}/ renamed ${to}/`);
  }
  for (const id of plan.removed) {
    if (!has(id)) continue;
    if (!deleteFolders) { lines.push(`folder ${id}/ of the removed node ${id} kept (delete_folders moves it to the trash)`); continue; }
    const { trashed } = await P.deleteFile(name, nodeDir(id), { trash: true });
    lines.push(`folder ${id}/ moved to the trash${trashed ? ` (${trashed})` : ''}`);
  }
  return lines;
}
