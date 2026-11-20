// Rename Project… (#4641): File ▸ Rename Project… and the Design pane's project menu. The open project renamed where it
// is kept (the local server's workspace folder, the browser's storage or a workspace folder on the disk: api.renameProject,
// the MCP's rename_project's checks and messages, core/project-rename.js), and kept open as it was: its documents, the
// view, the title (one of the Start page's Recent Projects too, #4641); what this browser keeps of it by its name (Recent Projects, the last project, its documents and
// cursors) under the new name. Refused, said in the console, while a process of it runs or while it is shared live.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { log, logInfo } from './console.js';
import { S } from './app.js';
import { prefKey } from './prefs.js';
import { reloadProject, updateTitle, renderStartPage } from './project.js';
import { saveAll } from './processes.js';
import { watchProject, stopWatching } from './project-watch.js';
import { collab, following } from './collab-state.js';
import { renameProblem, renamedMessage, runningProblem, sharedProblem, followedProblem } from '/core/project-rename.js';

/** What this browser keeps by a project's name moved to its new one: Recent Projects, when it was opened, the last
 *  project (this browser's, this tab's), its documents and view, its sources' cursors. */
function moveProjectPrefs(from, to, { local = globalThis.localStorage, session = globalThis.sessionStorage } = {}) {
  const json = (k, d) => { try { return JSON.parse(local.getItem(k)) ?? d; } catch { return d; } };
  try {
    const recent = prefKey('silinx.recent'), opened = prefKey('silinx.opened');
    const r = json(recent, []);
    if (Array.isArray(r) && r.includes(from)) local.setItem(recent, JSON.stringify(r.map(x => (x === from ? to : x))));
    const o = json(opened, {});
    if (o && typeof o === 'object' && from in o) { o[to] = o[from]; delete o[from]; local.setItem(opened, JSON.stringify(o)); }
    for (const k of [prefKey(`silinx.view.${from}`), prefKey(`silinx.cursor.${from}`)]) {
      const v = local.getItem(k);
      if (v != null) { local.setItem(k.slice(0, -from.length) + to, v); local.removeItem(k); }
    }
  } catch { /* not kept */ }
  for (const s of [local, session]) {
    try { if (s.getItem(prefKey('silinx.lastProject')) === from) s.setItem(prefKey('silinx.lastProject'), to); } catch { /* not kept */ }
  }
}

/** Why the project `name` is not renamed now, or null (another than the open one: the server's checks only). */
function renameRefusal(name = S.project?.name) {
  if (S.project?.name !== name) return null;
  if (following()) return followedProblem(name);
  if (collab.role === 'owner') return sharedProblem(name);
  if (S.busy || S.currentJob) return runningProblem(name);
  return null;
}

/** Rename Project…: the project's name asked for (the open one's; the Start page's Recent Projects: one of them),
 *  checked as New Project's (a clash said), then renamed. */
export async function renameProjectDialog(from = S.project?.name) {
  if (!from) return;
  const no = renameRefusal(from);
  if (no) { logInfo(`Rename Project: ${no}.`); return; }   // (a refusal: why the command does nothing, #3591, #4728)
  const input = h('input', { type: 'text', value: from, style: { width: '100%' }, spellcheck: 'false', 'data-no-i18n': '' });
  const err = h('div', { class: 'hint rename-project-error', style: { color: 'var(--error-fg)', minHeight: '16px' } });
  const names = (await api.projects().catch(() => [])).map(p => p.name);
  // (a clash said as New Project says it, #3538)
  const check = () => { const p = renameProblem(from, input.value.trim(), names); return p && (p.status === 409 ? `A${p.message.slice(1)}.` : p.message); };
  const to = await dialog({
    title: 'Rename Project', width: 460, className: 'rename-project',
    body: h('div', {},
      h('div', { class: 'form-grid' }, h('label', {}, 'Project name:'), input),
      h('div', { class: 'hint', style: { marginTop: '8px' } }, 'A letter, then letters, digits, - and _. The project stays open; its folder is renamed.'),
      err),
    buttons: [{ label: 'Rename', primary: true, value: () => input.value.trim(), validate: () => { const m = check(); err.textContent = m || ''; return !m; } }, { label: 'Cancel', value: null }],
    onOpen: () => input.select(),
  });
  if (!to) return;
  await renameOpenProject(from, to);
}

/** The project `from` renamed `to`, the open one kept open: true when done (its error said in the console otherwise). */
async function renameOpenProject(from, to) {
  const open = S.project?.name === from;
  if (open) { if (!await saveAll()) return false; stopWatching(); }
  try { await api.renameProject(from, to); } catch (e) {
    if (open) watchProject(from);
    log(`ERROR: Rename Project: ${e.message}`, 'err');
    return false;
  }
  moveProjectPrefs(from, to);
  if (open && S.project?.name === from) {
    S.project.name = to;
    await reloadProject();
    updateTitle();
    watchProject(to);
  }
  if (!document.querySelector('.left-page[data-page=start]')?.hidden) renderStartPage();
  log(renamedMessage(from, to), 'ok');
  dispatchEvent(new CustomEvent('silinx:project-renamed', { detail: { from, to } }));
  return true;
}
