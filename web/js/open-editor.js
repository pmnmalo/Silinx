// Open in VS Code (#4017): a project's text file (HDL, C / C++, constraints, any text) or its folder opened in the
// user's editor, by the server on this computer (server/open-editor.js); its saves come back to Silinx as any change
// made outside it (server/project-watch.js, #2843). The server edition only, and only where it can work: a page on
// the server's computer, the editor not turned off (GET /api/editor). The browser edition has none (no api.editorInfo).
import { api } from './api.js';
import { h } from './ui.js';
import { S } from './app.js';
import { log, logError } from './console.js';
import { t } from './i18n.js';

let info = null, asking = null;
/** What the server says of its editor ({ available, label, reason }); a failed ask (no token yet) asked again later. */
export function editorAvailable() {
  if (info) return Promise.resolve(info);
  if (!api.editorInfo) return Promise.resolve(info = { available: false });
  return (asking ??= api.editorInfo().then(r => (info = r), () => ({ available: false })).finally(() => { asking = null; }));
}
/** The editor's name when it can be opened (the menus are drawn synchronously: the last answer), else null. */
export function editorLabel() {
  if (!info) editorAvailable();   // (for the next menu)
  return info?.available ? info.label : null;
}

/** Opens a project's file at a line (1-based), or its folder (no path), in the editor; what it says in the console. */
export async function openInEditor(path = null, line = null) {
  const pj = S.project?.name, label = editorLabel() || 'VS Code';
  if (!pj) return;
  // (the open document saved first: the editor opens what Silinx shows)
  if (path) await import('./processes.js').then(m => m.saveAll()).catch(() => {});
  try {
    const r = await api.openInEditor(pj, path, line);
    // (no program the server can run: the editor's link, which the browser on the same computer opens)
    if (r.url) h('a', { href: r.url }).click();
    log(t(`Opened ${path || pj} in ${r.editor}.`), 'info');
  } catch (e) { logError(`Cannot open ${path || pj} in ${label}: ${e.message}`); }
}

/** A file's menu item ("Open in VS Code"), or null where it cannot work. */
export function editorItem(path, line = null) {
  const label = editorLabel();
  return label ? { label: `Open in ${label}`, action: () => openInEditor(path, line) } : null;
}
/** A document tab's menu items: a project's text file (its id file:…; not the HDL a drawing makes) at the cursor's line. */
export function docEditorItems(doc) {
  const path = doc.path, ed = doc.editor;
  if (!path || doc.id !== `file:${path}` || !ed?.getCursor || S.hdlToSch?.[path] || !editorLabel()) return [];
  return ['-', editorItem(path, ed.getCursor().line + 1)];
}
/** The project's menu item: its folder. */
export function projectEditorItem() {
  const label = editorLabel();
  return label ? { label: `Open Folder in ${label}`, action: () => openInEditor() } : null;
}

editorAvailable();
