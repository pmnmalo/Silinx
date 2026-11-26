// A project's versions in the interface (#5740, phase 2 of #5743; core/versions.js, kept by the server or the browser:
// api.listVersions…): Project ▸ Save Version… (one kept by hand, with a name), Project ▸ Versions… (the versions kept,
// newest first: what made each, its author, what it changed; Restore Project puts the one selected back, the project as
// it was kept first as a version, so that a restore can be undone), and the version kept before each of the page's
// risky commands (versionBefore: Remove from Project, Delete, a conversion, an import, a merge, a git pull or merge).
// What they do is said in the console; the MCP's save_version, list_versions and restore_version do the same.
import { api } from './api.js';
import { h, dialog, promptDlg } from './ui.js';
import { appLog, logError, logWarning } from './console.js';
import { S } from './app.js';
import { reloadProject } from './project.js';
import { saveAll } from './processes.js';
import { applyChanges } from './project-watch.js';
import { prefKey } from './prefs.js';
import { REASONS } from '/core/versions.js';
import { riskyReason } from './versions-risky.js';

// (the name the user gave a shared project, as its author; none: no author)
const author = () => { try { return localStorage.getItem(prefKey('silinx.collab.name')) || ''; } catch { return ''; } };
const what = v => (v.reason === 'restore' ? `restored version ${v.of}` : REASONS[v.reason]);
const counts = v => [['+', v.changed?.added], ['~', v.changed?.changed], ['-', v.changed?.removed]].filter(([, l]) => l?.length).map(([s, l]) => `${s}${l.length}`).join(' ');
const when = v => new Date(v.at).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });


/** A version kept before a command of the page that replaces or removes files (`label`: its menu's): nothing for the
 *  others; a warning when it could not be kept (the command runs all the same). */
export async function versionBefore(label) {
  const reason = riskyReason(label);
  if (!reason || !S.project) return;
  try { await api.saveVersion(S.project.name, { reason, author: author() }); } catch (e) { logWarning(`${String(label).replace(/…$/, '')}: no version of the project kept before it: ${e.message}.`); }
}

/** Project ▸ Save Version…: a version of the project kept, with a name. */
export async function saveVersionDialog() {
  if (!S.project) return null;
  const name = S.project.name;
  const label = await promptDlg('Save Version', 'Version name (optional):');
  if (label === null) return null;
  if (!await saveAll()) return null;
  let r;
  try { r = await api.saveVersion(name, { label, author: author(), reason: 'manual' }); } catch (e) { logError(`Save Version: ${e.message}`); return null; }
  appLog(r.saved ? `Version ${r.version.id} of ${name} saved${r.version.label ? `: ${r.version.label}` : ''}.` : `Version ${r.version.id} of ${name} has it already: no version saved.`, 'ok');
  return r;
}

/** A version restored (the whole project, or `path`): the page's documents read again, said in the console. */
async function restore(id, { path = null } = {}) {
  const name = S.project?.name;
  if (!name || !await saveAll()) return null;
  let r;
  try { r = await api.restoreVersion(name, id, { path, author: author() }); } catch (e) { logError(`Restore Version: ${e.message}`); return null; }
  if (!r.version) { appLog(`${path || name} is as version ${id} has it already: nothing restored.`, 'ok'); return r; }
  appLog(`Restored ${path || name} as version ${id} had it: ${r.written.length} file(s) written, ${r.removed.length} removed; the project before it kept as version ${r.before.id} (restore it to undo).`, 'ok');
  if (S.project?.name === name) {
    // (the server tells the page its writes, as another process's: server/server.js TOLD; the browser's, here)
    if (api.standalone) await applyChanges({ project: name, changes: [...r.written.map(f => ({ path: f, kind: 'changed' })), ...r.removed.map(f => ({ path: f, kind: 'deleted' }))] });
    await reloadProject();
  }
  return r;
}

/** Project ▸ Versions…: the versions kept, newest first; Restore Project puts the one selected back. */
export async function versionsDialog() {
  if (!S.project) return null;
  const name = S.project.name;
  let list;
  try { list = (await api.listVersions(name)).versions; } catch (e) { logError(`Versions: ${e.message}`); return null; }
  let sel = list[0]?.id ?? null;
  const rows = list.map(v => h('tr', { 'data-version': v.id, tabindex: '0', 'aria-selected': String(v.id === sel), class: v.id === sel ? 'sel' : '' },
    h('td', {}, v.id), h('td', {}, when(v)), h('td', {}, v.author), h('td', {}, what(v)), h('td', { 'data-no-i18n': '' }, v.label), h('td', {}, counts(v))));
  const pick = id => { sel = id; for (const r of rows) { const on = r.dataset.version === id; r.classList.toggle('sel', on); r.setAttribute('aria-selected', String(on)); } };
  for (const r of rows) { r.onclick = () => pick(r.dataset.version); r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(r.dataset.version); } }; }
  const body = list.length
    ? h('div', { style: { maxHeight: '50vh', overflow: 'auto' } }, h('table', { class: 'grid versions', role: 'grid', style: { width: '100%' } },
      h('thead', {}, h('tr', {}, ...['Version', 'Time', 'Author', 'Made', 'Name', 'Files'].map(t => h('th', {}, t)))), h('tbody', {}, ...rows)))
    : h('p', {}, 'No versions of this project yet: Save Version… keeps one, and one is kept as you work.');
  const r = await dialog({ title: `Versions of ${name}`, width: 680, body, buttons: [{ label: 'Restore Project', primary: true, value: () => sel, disabled: !list.length }, { label: 'Close', value: null }] });
  return r === null ? null : restore(r);
}
