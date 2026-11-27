// A project's versions in the interface (#5740, phase 2 of #5743; core/versions.js, kept by the server or the browser:
// api.listVersions…): Project ▸ Save Version… (one kept by hand, with a name), Project ▸ Versions… (the versions kept,
// newest first: what made each, its author, what it changed; the one selected's files that differ from now, each opened
// as it was, compared with now or restored alone, #5741; Restore Project puts the one selected back, the project as
// it was kept first as a version, so that a restore can be undone), and the version kept before each of the page's
// risky commands (versionBefore: Remove from Project, Delete, a conversion, an import, a merge, a git pull or merge).
// What they do is said in the console; the MCP's save_version, list_versions, version_diff and restore_version do the same.
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
import { following, collab } from './collab-state.js';

// (the name the user gave a shared project, as its author; none: no author)
const author = () => { try { return localStorage.getItem(prefKey('silinx.collab.name')) || ''; } catch { return ''; } };
// (a version saved or restored here: a project shared publishes its versions again, web/js/collab-versions.js)
const changed = project => dispatchEvent(new CustomEvent('silinx:versions', { detail: { project } }));
const what = v => (v.reason === 'restore' ? `restored version ${v.of}` : REASONS[v.reason]);
const counts = v => [['+', v.changed?.added], ['~', v.changed?.changed], ['-', v.changed?.removed]].filter(([, l]) => l?.length).map(([s, l]) => `${s}${l.length}`).join(' ');
const when = v => new Date(v.at).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });


/** A version kept before a command of the page that replaces or removes files (`label`: its menu's): nothing for the
 *  others, nor on a follower's page (#5761); a warning when it could not be kept (the command runs all the same). */
export async function versionBefore(label) {
  const reason = riskyReason(label);
  // (a project followed, an editor's command: the owner keeps the project's versions, never this page, #5761)
  if (!reason || !S.project || following()) return;
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
  // (a project followed, #5742: saved by its owner, whose answer every participant's console says)
  if (following()) return r;
  changed(name);
  appLog(r.saved ? `Version ${r.version.id} of ${name} saved${r.version.label ? `: ${r.version.label}` : ''}.` : `Version ${r.version.id} of ${name} has it already: no version saved.`, 'ok');
  return r;
}

/** A version restored (the whole project, or `path`): the page's documents read again, said in the console. */
async function restore(id, { path = null } = {}) {
  const name = S.project?.name;
  if (!name || !await saveAll()) return null;
  let r;
  try { r = await api.restoreVersion(name, id, { path, author: author() }); } catch (e) { logError(`Restore Version: ${e.message}`); return null; }
  // (a project followed, #5742: restored by its owner, its writes arriving as theirs, its answer said by everyone's console)
  if (following()) return r;
  changed(name);
  if (!r.version) { appLog(`${path || name} is as version ${id} has it already: nothing restored.`, 'ok'); return r; }
  appLog(`Restored ${path || name} as version ${id} had it: ${r.written.length} file(s) written, ${r.removed.length} removed; the project before it kept as version ${r.before.id} (restore it to undo).`, 'ok');
  if (S.project?.name === name) {
    // (the server tells the page its writes, as another process's: server/server.js TOLD; the browser's, here)
    if (api.standalone) await applyChanges({ project: name, changes: [...r.written.map(f => ({ path: f, kind: 'changed' })), ...r.removed.map(f => ({ path: f, kind: 'deleted' }))] });
    await reloadProject();
  }
  return r;
}

// what a file of a version is now (core/versions.js versionChanges), as the dialog says it
const STATE = { changed: 'changed since', added: 'added since', removed: 'removed since' };

/** Project ▸ Versions…: the versions kept, newest first; the one selected (the newest at first) with the files that
 *  differ from now (#5741): each one opened as the version had it (read only), compared with now, or restored alone;
 *  Restore Project puts the whole version back. */
export async function versionsDialog() {
  if (!S.project) return null;
  const name = S.project.name;
  let list;
  try { list = (await api.listVersions(name)).versions; } catch (e) { logError(`Versions: ${e.message}`); return null; }
  let sel = list[0]?.id ?? null, act = null, close = null, asked = 0;
  const rows = list.map(v => h('tr', { 'data-version': v.id, tabindex: '0', 'aria-selected': String(v.id === sel), class: v.id === sel ? 'sel' : '' },
    h('td', {}, v.id), h('td', {}, when(v)), h('td', {}, v.author), h('td', {}, what(v)), h('td', { 'data-no-i18n': '' }, v.label), h('td', {}, counts(v))));
  const files = h('div', { class: 'version-files', 'aria-live': 'polite' });
  const link = (label, cls, fn) => h('a', { href: '#', class: cls, onclick: e => { e.preventDefault(); act = fn; close?.(); } }, label);
  // the selected version's files that differ from now, read again at each selection (the last one asked shown)
  // (a project followed, #5742: the owner keeps the versions and their texts; a version's files are what it changed, as
  // its row says, restored by an editor's request, opened and compared in the owner's Silinx)
  const canRestore = !following() || collab.editor;
  const ownFiles = id => {
    const v = list.find(x => x.id === id), c = v?.changed || {};
    const rowsOf = (l, state) => (l || []).map(p => h('li', { 'data-path': p }, h('span', { 'data-no-i18n': '' }, p), ' (', h('span', { class: 'version-state' }, state), ') ',
      canRestore ? link('Restore', 'version-restore', () => restore(id, { path: p })) : null));
    files.replaceChildren(h('p', {}, `Version ${id} changed (its files are opened and compared in ${collab.owner}'s Silinx):`),
      h('ul', { class: 'version-file-list' }, ...rowsOf(c.added, 'added in it'), ...rowsOf(c.changed, 'changed in it'), ...rowsOf(c.removed, 'removed in it')));
  };
  const showFiles = async id => {
    if (following()) { ownFiles(id); return; }
    const n = ++asked;
    // (loading: its list, once there, moves the dialog's buttons; the UI tests wait for it, [data-loading], #5790)
    files.replaceChildren(h('p', {}, '…'));
    files.dataset.loading = '';
    let d;
    try { d = await api.versionDiff(name, id); } catch (e) { if (n === asked) { files.replaceChildren(); delete files.dataset.loading; } logError(`Versions: ${e.message}`); return; }
    if (n !== asked) return;
    delete files.dataset.loading;
    const item = f => h('li', { 'data-path': f.path },
      h('span', { 'data-no-i18n': '' }, f.path), ' (', h('span', { class: 'version-state' }, STATE[f.state]), ') ',   // (its word translated alone)
      f.state !== 'added' ? link('Open', 'version-open', () => openVersion(id, f.path)) : null, ' ',
      link('Compare', 'version-compare', () => compareVersion(id, f.path)), ' ',
      link('Restore', 'version-restore', () => restore(id, { path: f.path })));
    files.replaceChildren(
      h('p', {}, d.files.length || d.json ? `Version ${id} against now:` : `The project is as version ${id} has it.`),
      h('ul', { class: 'version-file-list' }, ...d.files.map(item), ...(d.json ? [h('li', {}, h('span', { 'data-no-i18n': '' }, 'silinx.json'), ' (', h('span', { class: 'version-state' }, STATE.changed), ')')] : [])));
  };
  const pick = id => {
    sel = id;
    for (const r of rows) { const on = r.dataset.version === id; r.classList.toggle('sel', on); r.setAttribute('aria-selected', String(on)); }
    showFiles(id);
  };
  for (const r of rows) { r.onclick = () => pick(r.dataset.version); r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(r.dataset.version); } }; }
  const body = list.length
    ? h('div', {}, h('div', { style: { maxHeight: '40vh', overflow: 'auto' } }, h('table', { class: 'grid versions', role: 'grid', style: { width: '100%' } },
      h('thead', {}, h('tr', {}, ...['Version', 'Time', 'Author', 'Made', 'Name', 'Files'].map(t => h('th', {}, t)))), h('tbody', {}, ...rows))),
    h('div', { style: { maxHeight: '25vh', overflow: 'auto', marginTop: '8px' } }, files))
    : h('p', {}, 'No versions of this project yet: Save Version… keeps one, and one is kept as you work.');
  if (sel) showFiles(sel);
  const r = await dialog({
    title: `Versions of ${name}`, width: 680, body,
    buttons: [{ label: 'Restore Project', primary: true, value: () => sel, disabled: !list.length || !canRestore }, { label: 'Close', value: null }],
    onOpen: ({ close: c }) => { close = () => c(null); },
  });
  if (act) return act();
  return r === null ? null : restore(r);
}

const openVersion = (id, path) => import('./versions-files.js').then(m => m.openVersionFile(id, path));
const compareVersion = (id, path) => import('./versions-files.js').then(m => m.compareVersionFile(id, path));
