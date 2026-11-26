// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// Remove from Project of one source or of several (#5720: a selection of the Design pane). The question names them and
// offers to keep the files in the project folder (the default, as in ISE: Undo or Add to Project brings them back) or to
// delete them too, as Delete File does (into the workspace's .trash where there is one; web/js/history.js records the
// files deleted, so that Undo writes them back). A drawing's HDL file, generated from it, goes with it (#207, #220,
// #234); the Files view removes the one file. The console says what was removed and what was deleted, in the words of
// the MCP's remove_from_project (core/project-entries.js removedMessage).
import { api } from './api.js';
import { h, dialog, toast } from './ui.js';
import { S, closeDoc, fixMissingTops, projectUndo } from './app.js';
import { appLog, log } from './console.js';
import { reloadProject } from './project.js';
import { saveAll } from './processes.js';
import { designOnly } from './design-only.js';
import { saveProjectJson, serialOp } from './design.js';
import { deleteEntries, removeFromProject, removedMessage } from '/core/project-entries.js';
import { HDL_RE } from '/core/file-kinds.js';
import { designState } from './state-design.js';
import { docsState } from './state-docs.js';

/** A source as Remove from Project takes it ({ file, hdl }): with `pair`, a module's (its drawing and the drawing's HDL
 *  file together, whichever of the two `file` is), else the one file. */
export function removal(file, pair = true) {
  const drawing = pair ? designState.hdlToSch?.[file] || (designState.schOwners?.[file] ? file : null) : null;
  const hdl = drawing ? designState.schOwners?.[drawing] : null;
  return hdl ? { file: drawing, hdl } : { file, hdl: null };
}

// (a design project's hidden HDL file, a test bench's: its module named, #3891; a drawing's HDL file never named there)
const shownName = file => (designOnly() && HDL_RE.test(file) && designState.modules?.find(m => m.file === file)?.name) || file;
const named = r => (r.hdl && !designOnly() ? `'${r.file}' and its HDL file '${r.hdl}'` : `'${shownName(r.file)}'`);

// the question: Remove from Project (null: cancelled), 'keep' or 'delete'
function ask(list) {
  const shown = list.length + (designOnly() ? 0 : list.filter(r => r.hdl).length);
  const many = shown > 1, them = many ? 'them' : 'it';
  const del = many ? 'Remove and Delete Files' : 'Remove and Delete File';
  const trash = !api.standalone || api.keepsTrash;
  const head = list.length === 1 ? `Remove ${named(list[0])} from the project?` : `Remove these ${list.length} sources from the project?\n${list.map(named).join('\n')}`;
  const text = `${head}\n(The ${many ? 'files stay' : 'file stays'} in the project folder: Undo or Add to Project in the Files view brings ${them} back.)\n\n`
    + `${del} ${trash ? `moves ${them} to the workspace's .trash folder` : `deletes ${them} from the disk`}.`;
  return dialog({
    title: 'Remove Source', width: 560,   // (its three buttons on one row, in Portuguese too, #5748)
    body: h('div', { class: 'msg msg-question' }, h('div', { class: 'msg-icon' }, '?'), h('div', { class: 'msg-text' }, text)),
    buttons: [{ label: 'Remove from Project', value: 'keep', primary: true }, { label: del, value: 'delete' }, { label: 'Cancel', value: null }],
  });
}

/** Remove from Project of `sources` ({ file, hdl }: removal's), asked first: kept in the project folder or deleted. */
export async function removeSources(sources) {
  // (each file once; a drawing's HDL file chosen too goes with its drawing)
  const list = [];
  for (const r of sources) if (!list.some(x => x.file === r.file)) list.push({ ...r });
  const owned = new Set(list.map(r => r.hdl).filter(Boolean));
  const items = list.filter(r => !owned.has(r.file));
  if (!items.length) return;
  const how = await ask(items);
  if (!how) return;
  if (!await saveAll()) return;
  const del = how === 'delete', trash = !api.standalone || api.keepsTrash;
  const paths = items.flatMap(r => [r.file, r.hdl]).filter(Boolean);
  for (const d of [...docsState.docs]) {
    if (!paths.some(f => d.path === f || String(d.id || '').endsWith(`:${f}`))) continue;
    if (del) { d.dirty = false; clearTimeout(d._autosave); }
    await closeDoc(d);
  }
  return serialOp(async () => {
    const pj = S.project;
    removeFromProject(pj, paths);   // (core/project-entries.js, as the MCP's remove_from_project, #4733)
    if (del) for (const p of paths) deleteEntries(pj, p);
    await saveProjectJson();
    const failed = new Set();
    if (del) {
      for (const p of paths) {
        try { await api.deleteFile(pj.name, p, { trash }); } catch (e) { failed.add(p); log(`ERROR: cannot delete ${p}: ${e.message}`, 'err'); }
      }
    }
    await reloadProject();
    await fixMissingTops();   // (the top module removed, #253)
    for (const r of items) appLog(removedMessage({ file: shownName(r.file), hdl: designOnly() ? null : r.hdl, deleted: del && !failed.has(r.file), trash }), 'info');
    const one = items.length === 1 && items[0];
    toast(!one ? `Removed ${items.length} sources from the project` : one.hdl && !designOnly() ? `Removed ${one.file.split('/').pop()} and ${one.hdl.split('/').pop()} from the project`
      : `Removed ${shownName(one.file).split('/').pop()} from the project`, 'info', 10000, { label: 'Undo', run: () => projectUndo() });
  });
}
