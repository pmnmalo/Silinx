// A file of a project's version (#5741, phase 3 of #5743), from Project ▸ Versions…: opened as the version had it, read
// only, in a document of its own (the project's editor in its read-only mode, the notice at the right end of its toolbar:
// docs/UI-GUIDELINES.md, "A read-only view"), as History… opens a file of a commit (web/js/git-history.js); compared with
// the project now (web/js/drawing-diff-view.js: a drawing by its objects, any other file by its lines).
import { api } from './api.js';
import { h } from './ui.js';
import { S, findDoc, activateDoc, openDoc } from './app.js';
import { createEditor } from './editor.js';
import { logError } from './console.js';
import { C_RE, langOfPath } from '/core/file-kinds.js';

const langOf = p => (C_RE.test(p) ? 'c' : langOfPath(p));

// a file's text in a version (null: not in it), the version read once per call
async function textIn(id, path) {
  const v = await api.readVersion(S.project.name, id);
  return Object.hasOwn(v.files, path) ? v.files[path] : null;
}

/** A file as version `id` had it: read only, in a document of its own (one per version and file). */
export async function openVersionFile(id, path) {
  const doc = `version:${id}:${path}`;
  const old = findDoc(doc);
  if (old) { activateDoc(old); return old; }
  let text;
  try { text = await textIn(id, path); } catch (e) { logError(`Versions: ${e.message}`); return null; }
  if (text === null) { logError(`Versions: ${path} is not in version ${id}`); return null; }
  const name = `${path.split('/').pop()} @ ${id}`;
  const lang = langOf(path);
  return openDoc({
    id: doc, title: name, tooltip: `${path}, as it was in version ${id}`, icon: ['vhdl', 'verilog', 'ucf'].includes(lang) ? lang : 'file',
    create(el, d) {
      const banner = h('span', { class: 'gen-banner read-only' }, `Read-only, as it was in version ${id}`);
      const host = h('div', { class: 'editor-host' });
      el.append(h('div', { class: 'editor-bar' }, h('span', { class: 'path', 'data-no-i18n': '' }, path), banner), host);
      d.editor = createEditor(host, { text, lang, path: name, readOnly: true });
      el.append(d.editor.status);   // (its status line, #2763)
      d.versionAt = { id, path };
      return { destroy: () => d.editor.destroy() };
    },
  });
}

/** A file of version `id` compared with the project now (none on one side: the file added or removed since). */
export async function compareVersionFile(id, path) {
  let a, b;
  try { [a, b] = await Promise.all([textIn(id, path), api.readFile(S.project.name, path).catch(() => null)]); } catch (e) { logError(`Versions: ${e.message}`); return null; }
  const { openCompare } = await import('./drawing-diff-view.js');
  return openCompare(path, { text: a, label: `as it was in version ${id}` }, { text: b, label: 'as it is now' });
}
