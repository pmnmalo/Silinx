// Git in the interface (#3195: the server editions, through the system's git, server/git.js; #3196: the browser edition,
// through GitHub's REST API, web/js/git-browser.js, where a commit is pushed at once and the sign-in is Silinx's): File ▸
// Open from GitHub Repository…, File ▸ Git ▸ (Commit…, Push to GitHub, Pull from GitHub, New Branch…, Switch Branch…, Merge
// Branch… (#4213, web/js/git-branch.js), Changes… (#4581, web/js/git-changes.js), History… (web/js/git-history.js), GitHub
// Checks (#3194: what GitHub's workflows said of the last push),
// Store Project in a GitHub Repository…), the same in the Design pane's
// project menu (the Silinx interface has no File menu) and in the Collaboration tab (#4215, web/js/collab-tab.js), and the Design pane's marks of the files changed or new since
// the last commit (S.git, refreshed when the project opens, after its files are written and after each command).
// Every message goes to the console: git's line as an ERROR, its hint after it (docs/UI-GUIDELINES.md).
import { api } from './api.js';
import { h, dialog, toast } from './ui.js';
import { collabLog } from './collab-log.js';
import { S } from './app.js';
import { openProject, reloadProject, renderStartPage } from './project.js';
import { renderTeachingPage } from './teaching-page.js';
import { saveAll } from './processes.js';
import { renderHierarchy } from './design.js';
import { field } from './wizards.js';
import { applyChanges } from './project-watch.js';
import { commitText, pushText, pullText, cloneText, initText, pullMergeLines } from '/core/git-messages.js';
import { checksLines } from '/core/github-checks.js';
import { keptBothText } from '/core/git-clone-exists.js';
import { repoList } from './git-repo-list.js';
import { checkUrl, nameFromRepo } from '/core/github-url.js';
import { designOnly } from './design-only.js';
import { hdlSideFile } from '/core/project-kind.js';
import { branchMenuItems } from './git-branch.js';

// ------------------------------------------------------------------ git on this server
let enabled = null, asking = null;
/** Whether this edition has git: the browser edition (GitHub's API), a server whose git is not turned off (SILINX_GIT=off).
 *  A request that failed (no token yet, the server not answering yet) is no answer: asked again next time (#3968). */
export function gitAvailable() {
  if (enabled !== null) return Promise.resolve(enabled);
  return (asking ??= api.gitEnabled().then(r => (enabled = !!r.enabled), () => false).finally(() => { asking = null; }));
}
/** The last answer of gitAvailable (the menus are drawn synchronously; the start-up, the Start page and a project's
 *  opening ask). */
export const hasGit = () => enabled === true;
/** Whether this edition is known to have no git (SILINX_GIT=off): the Collaboration tab hidden (#4215). */
export const gitOff = () => enabled === false;

// a failure, in the console: git's line, then its hint
export function logGitError(e) {
  collabLog(`ERROR: ${e.message}`, 'err');
  if (e.hint) collabLog(`Hint: ${e.hint}`, 'info');
}

// ------------------------------------------------------------------ the status and the Design pane's marks
let timer = null, seq = 0, newest = null;
/** The project's status read again soon (several writes in a row: once). */
function scheduleGitStatus(ms = 400) {
  if (enabled === false || !S.project) return;
  clearTimeout(timer);
  timer = setTimeout(() => refreshGitStatus(), ms);
}
/** The project's status read again: S.git ({ files, byPath, branch… } or null), the Design pane's marks drawn again. A
 *  read that a later one overtakes gives the later one's answer (Commit… asks while a save's read is in flight). */
export function refreshGitStatus() {
  const n = ++seq;
  const run = readStatus(n).then(r => (n === seq ? r : newest));
  newest = run;
  return run;
}
async function readStatus(n) {
  if (!await gitAvailable() || !S.project) { S.git = null; return null; }
  const name = S.project.name;
  let s;
  try { s = await api.gitStatus(name); } catch { s = null; }
  if (n !== seq || S.project?.name !== name) return null;   // (a later read, or another project: not this answer)
  const before = JSON.stringify(S.git?.files || []), had = !!S.git;
  S.git = s?.repository ? { ...s, byPath: new Map(s.files.map(f => [f.path, f.state])) } : null;
  if (JSON.stringify(S.git?.files || []) !== before) renderHierarchy();
  if (!!S.git !== had) renderStartPage();   // (its Store Project in a GitHub Repository…, a project with no repository's, #3534)
  dispatchEvent(new CustomEvent('silinx:git-status'));   // (the Collaboration tab's remote, branch and changes, #4215)
  return S.git;
}

// (a deleted file's: the Collaboration tab's list only, #4215, the Design pane having no row of it)
export const gitMarks = {
  conflict: { text: 'C', title: 'In conflict' },
  new: { text: 'N', title: 'New: not committed yet' },
  modified: { text: 'M', title: 'Changed since the last commit' },
  deleted: { text: 'D', title: 'Deleted since the last commit' },
};
/** The Design pane's mark of a row whose files are these: the strongest of their states (conflict, new, changed). */
export function gitMark(paths) {
  if (!S.git) return null;
  const states = paths.filter(Boolean).map(p => S.git.byPath.get(p));
  const st = ['conflict', 'new', 'modified'].find(k => states.includes(k));
  return st ? { ...gitMarks[st], state: st } : null;
}

// the status after every write of the project's files (the editors' saves, a wizard's, a rename), and after a reload
// (what another process changed)
let hooked = false;
export function hookGitStatus() {
  if (hooked) return;
  hooked = true;
  for (const k of ['writeFile', 'saveProject', 'renameFile', 'deleteFile', 'project']) {
    const f = api[k];
    api[k] = async (...a) => { const r = await f(...a); scheduleGitStatus(); return r; };
  }
  addEventListener('silinx:project-opened', () => refreshGitStatus());
  addEventListener('silinx:project-closed', () => { S.git = null; dispatchEvent(new CustomEvent('silinx:git-status')); });
  // (git's presence asked once: the Start page and the Teaching page then have Open from GitHub Repository…; a project reopened at start-up, which
  // says no project-opened, gets its status; a request that failed, asked again a few times, #3968)
  const ask = wait => gitAvailable().then(on => {
    dispatchEvent(new CustomEvent('silinx:git-status'));   // (the Collaboration tab, shown or hidden with git, #4215)
    if (on) { renderStartPage(); renderTeachingPage(); if (S.project) refreshGitStatus(); }
    else if (enabled === null && wait <= 8000) setTimeout(() => ask(wait * 2), wait);
  });
  ask(500);
}

// ------------------------------------------------------------------ the commands
// a field's error, beside it (the dialog stays open)
const fieldError = cls => h('div', { class: `hint git-error ${cls}`, style: { gridColumn: '1 / -1', minHeight: '16px' } });

/** File ▸ Open from GitHub Repository…: a GitHub repository (a Classroom assignment's) cloned into the workspace, opened;
 *  the user's repositories listed under the address's field to pick from (#4653, web/js/git-repo-list.js). */
export async function openFromRepositoryDialog() {
  const url = h('input', { type: 'text', class: 'git-url', placeholder: 'https://github.com/owner/repository', style: { width: '100%' } });
  const name = h('input', { type: 'text', class: 'git-name', style: { width: '100%' } });
  const err = fieldError('git-url-error');
  // (the project's name follows the repository's until the user types one)
  let named = false;
  name.addEventListener('input', () => { named = true; });
  url.addEventListener('input', () => {
    err.textContent = '';
    if (!named) { try { name.value = nameFromRepo(checkUrl(url.value).repo); } catch { name.value = ''; } }
  });
  const r = await dialog({
    title: 'Open from GitHub Repository', width: 520,
    body: h('div', {},
      h('div', { class: 'form-grid' }, ...field('GitHub repository (a Classroom assignment\'s too):', url), err, repoList(url), ...field('Project name:', name)),
      h('div', { class: 'hint', style: { marginTop: '10px' } }, api.standalone
        ? 'A public repository opens as it is; a private one (a Classroom assignment\'s) after Sign in with GitHub… with your private repositories included.'
        : 'git signs in to GitHub with its own credentials (GitHub\'s command line, Git Credential Manager or an SSH key): Silinx never asks for a password or a token.')),
    buttons: [{ label: 'Open', primary: true, value: () => ({ url: url.value.trim(), name: name.value.trim() }),
      validate: () => { try { checkUrl(url.value); return true; } catch (e) { err.textContent = e.message; return false; } } },
    { label: 'Cancel', value: null }],
  });
  if (!r) return null;
  collabLog(`Cloning ${r.url}…`, 'info');
  let c;
  try { c = await api.gitClone(r.url, r.name || null); } catch (e) {
    // (a project of the name: open it, replace it or keep both, asked, #4618)
    if (e.status !== 409 || !e.existing) { logGitError(e); return null; }
    const { cloneOntoExisting } = await import('./git-clone-exists.js');
    c = await cloneOntoExisting(r.url, e.existing, logGitError);
    if (!c) return null;
  }
  if (!c.opened) {
    if (c.renamedFrom) collabLog(keptBothText(c), 'info');
    collabLog(cloneText(c), 'ok');
    for (const w of c.warnings || []) collabLog(`WARNING: ${w}`, 'warn');
  }
  await openProject(c.project);
  if (c.then === 'pull') await gitPull();
  return c.project;
}

/** File ▸ Git ▸ Commit…: the project's changes with a message. */
async function commitDialog() {
  if (!S.project) return null;
  if (!await saveAll()) return null;
  const s = await refreshGitStatus();
  if (!s) { collabLog(`ERROR: the project '${S.project.name}' is not in a git repository`, 'err'); collabLog('Hint: Store Project in a GitHub Repository… puts it in one, or Open from GitHub Repository… opens a project from GitHub.', 'info'); return null; }
  const STATE = { modified: 'changed', new: 'new', deleted: 'deleted', conflict: 'in conflict' };
  const msg = h('textarea', { class: 'git-message', rows: 4, style: { width: '100%' } });
  // (Compare: the file against the last commit, #3197; the dialog closed for it)
  let compare = null, closeIt = null;
  // (a design project's HDL committed with its drawings, never listed, #3891)
  const list = h('ul', { class: 'git-changes' }, ...s.files.filter(f => !designOnly() || !hdlSideFile(f.path)).map(f => h('li', { 'data-state': f.state }, h('span', { 'data-no-i18n': '' }, f.path), ` (${STATE[f.state]}) `,
    h('a', { href: '#', class: 'git-compare', 'data-path': f.path, onclick: e => { e.preventDefault(); compare = f.path; closeIt?.(); } }, 'Compare'))));
  const err = fieldError('git-message-error');
  msg.addEventListener('input', () => { err.textContent = ''; });
  const r = await dialog({
    title: api.standalone ? 'Commit and Push' : 'Commit', width: 520,
    body: h('div', {},
      h('div', { class: 'form-grid' }, ...field('Message:', msg), err),
      s.files.length ? h('div', {}, h('label', {}, `${s.files.length} change(s) on ${s.branch || 'no branch'}:`), list) : h('div', { class: 'hint' }, 'No change since the last commit.')),
    buttons: [{ label: api.standalone ? 'Commit and Push' : 'Commit', primary: true, disabled: !s.files.length, value: () => msg.value,
      validate: () => { if (msg.value.trim()) return true; err.textContent = 'Say in a few words what changed.'; return false; } },
    { label: 'Cancel', value: null }],
    onOpen: ({ close }) => { closeIt = () => close(null); },
  });
  if (compare) return import('./git-history.js').then(m => m.compareNow(compare));
  if (r === null || r === undefined) return null;
  try {
    const c = await api.gitCommit(S.project.name, r);
    collabLog(commitText(c), 'ok');
    if (c.pushed) { collabLog(pushText(c), 'ok'); collabLog(CHECKS_HINT, 'info'); }   // (the browser edition's: pushed at once)
    toast('Committed', 'ok');
    return c;
  } catch (e) { logGitError(e); return null; } finally { await refreshGitStatus(); }
}

// (#3194) a push starts the repository's workflows on GitHub: a Classroom assignment's runs its visible tests
const CHECKS_HINT = 'GitHub runs the repository\'s checks on the push (a Classroom assignment\'s visible tests): Git ▸ GitHub Checks says their result.';

/** File ▸ Git ▸ GitHub Checks (#3194): what GitHub's workflows said of the last pushed commit, in the console (a
 *  Classroom assignment's: each visible test's verdict). */
async function gitChecks() {
  if (!S.project) return null;
  collabLog(`GitHub's checks of '${S.project.name}'…`, 'info');
  try {
    const c = await api.gitChecks(S.project.name);
    for (const l of checksLines(c)) collabLog(l.level === 'error' ? `ERROR: ${l.text}` : l.level === 'warning' ? `WARNING: ${l.text}` : l.text, l.level === 'error' ? 'err' : l.level === 'warning' ? 'warn' : c.conclusion === 'success' ? 'ok' : 'info');
    // (their result kept by the Collaboration tab, #4215)
    dispatchEvent(new CustomEvent('silinx:git-checks', { detail: { project: S.project.name, checks: c } }));
    return c;
  } catch (e) { logGitError(e); return null; }
}

/** File ▸ Git ▸ Push. */
async function gitPush() {
  if (!S.project) return null;
  try { const p = await api.gitPush(S.project.name); collabLog(pushText(p), 'ok'); if (p.pushed) collabLog(CHECKS_HINT, 'info'); return p; } catch (e) { logGitError(e); return null; } finally { await refreshGitStatus(); }
}

/** File ▸ Git ▸ Pull: GitHub's commits merged in; the project read again (its open documents, by the watcher). A
 *  drawing's objects changed on both sides (#3197): Mine or Theirs asked for each (web/js/git-resolve-dialog.js); a text
 *  file's same lines (#4214): the merge view (web/js/merge-view.js), Mine, Theirs, Both or edited per hunk; then pulled
 *  again with the choices. */
async function gitPull({ resolve = null } = {}) {
  if (!S.project) return null;
  if (!await saveAll()) return null;
  const name = S.project.name;
  try {
    const p = await api.gitPull(name, resolve ? { resolve } : {});
    collabLog(pullText(p), 'ok');
    for (const l of pullMergeLines(p, { designOnly: designOnly() })) collabLog(l, 'info');
    for (const w of p.warnings || []) collabLog(`WARNING: ${w}`, 'warn');
    // (the server's watcher tells the page what changed; the browser edition has none: its open documents told here)
    if (!p.upToDate && S.project?.name === name) {
      if (api.standalone) await applyChanges({ project: name, changes: p.files.map(f => ({ path: f, kind: S.diskTree?.includes(f) ? 'changed' : 'added' })) });
      else await reloadProject();
    }
    return p;
  } catch (e) {
    logGitError(e);
    if (S.project?.name !== name) return null;
    const choices = await chooseConflicts(e, { key: `pull:${name}`, title: 'Pull from GitHub (merge)', labels: { mine: 'Mine (here)', theirs: 'Theirs (GitHub)' }, action: 'Pull from GitHub', resolve });
    return choices ? gitPull({ resolve: choices }) : null;
  } finally { await refreshGitStatus(); }
}

/** A pull's or a merge's conflicts (#3197, #4214; Merge Branch…'s, #4213), only those Silinx resolves: the drawings'
 *  objects chosen (web/js/git-resolve-dialog.js), the text files' hunks in the merge view (key, title, labels, action:
 *  its own; where: the drawings' dialog's, where the objects changed) -> the choices, with the earlier ones (resolve), or null (cancelled, or a conflict it cannot resolve). */
export async function chooseConflicts(e, { key, title, labels, action, where, resolve = null }) {
  if (!e.resolvable || !(e.drawings?.length || e.texts?.length)) return null;
  const choices = { ...(resolve || {}) };
  if (e.drawings?.length) {
    const c = await (await import('./git-resolve-dialog.js')).resolveDialog(e.drawings, { ...(where ? { where } : {}), action });
    if (!c) return null;
    Object.assign(choices, c);
  }
  if (e.texts?.length) {
    const { openMergeView } = await import('./merge-view.js');
    const c = await openMergeView({ key, title, files: e.texts.map(t => ({ path: t.path, base: t.base, mine: t.mine, theirs: t.theirs })),
      labels, action, choices: Object.fromEntries(e.texts.map(t => [t.path, choices[t.path] || {}])) });
    if (!c) return null;
    Object.assign(choices, c);
  }
  return choices;
}

/** File ▸ Git ▸ Store Project in a GitHub Repository…: git init, Silinx's .gitignore, optionally the GitHub repository (origin). */
async function initDialog() {
  if (!S.project) return null;
  const url = h('input', { type: 'text', class: 'git-url', placeholder: 'https://github.com/owner/repository', style: { width: '100%' } });
  const err = fieldError('git-url-error');
  url.addEventListener('input', () => { err.textContent = ''; });
  const r = await dialog({
    title: 'Store Project in a GitHub Repository', width: 520,
    body: h('div', {}, h('div', { class: 'form-grid' }, ...field(api.standalone ? 'GitHub repository (an empty one: where the commits go):' : 'GitHub repository (optional: where Push sends the commits):', url), err),
      h('div', { class: 'hint', style: { marginTop: '10px' } }, 'A .gitignore leaves build/ and the tools\' outputs out of the commits.')),
    buttons: [{ label: 'Initialize', primary: true, value: () => url.value.trim(),
      validate: () => { if (!url.value.trim() && !api.standalone) return true; try { checkUrl(url.value); return true; } catch (e) { err.textContent = e.message; return false; } } },
    { label: 'Cancel', value: null }],
  });
  if (r === null) return null;
  try { const i = await api.gitInit(S.project.name, r || null); collabLog(initText(S.project.name, i), 'ok'); return i; }
  catch (e) { logGitError(e); return null; } finally { await refreshGitStatus(); }
}

/** The Git submenu (File ▸ Git ▸, the Design pane's project menu): its commands, for an open project. The browser
 *  edition's commit is pushed at once (no Push), and it signs in to GitHub itself. */
export const gitMenuItems = () => [
  { label: api.standalone ? 'Commit and Push…' : 'Commit…', action: () => commitDialog(), disabled: !S.git },
  ...(api.standalone ? [] : [{ label: 'Push to GitHub', action: () => gitPush(), disabled: !S.git }]),
  { label: 'Pull from GitHub', action: () => gitPull(), disabled: !S.git },
  // (the branches, #4213: web/js/git-branch.js)
  ...branchMenuItems(),
  // (the changes since the last commit in a window, #4581: web/js/git-changes.js)
  { label: 'Changes…', action: () => import('./git-changes.js').then(m => m.changesDialog()), disabled: !S.git },
  { label: 'History…', action: () => import('./git-history.js').then(m => m.historyDialog()), disabled: !S.git },
  { label: 'GitHub Checks', action: () => gitChecks(), disabled: !S.git },
  '-',
  { label: 'Store Project in a GitHub Repository…', action: () => initDialog() },
  ...(api.standalone ? ['-', api.githubSignedIn()
    ? { label: 'Sign out of GitHub', action: () => import('./git-signin.js').then(m => m.signOut()) }
    : { label: 'Sign in with GitHub…', action: () => signIn() }] : []),
];
// Sign in with GitHub…, the Start page drawn again after it (its entry gone once signed in, #3534)
const signIn = () => import('./git-signin.js').then(m => m.signInDialog()).then(ok => { if (ok) renderStartPage(); return ok; });

/** The git commands that start one (the Start page, the Design pane's project and device menus, #3534), where they
 *  apply: Store Project in a GitHub Repository… when the project has no repository (the open one's: on the Start page, disabled with
 *  none), Sign in with GitHub… in the browser edition when not signed in (Sign out of GitHub: the Git submenu's). The
 *  same functions as the Git submenu's; `project`: the command needs an open project. */
export const gitStartItems = () => (!hasGit() ? [] : [
  !S.git ? { label: 'Store Project in a GitHub Repository…', action: () => initDialog(), project: true } : null,
  api.standalone && !api.githubSignedIn() ? { label: 'Sign in with GitHub…', action: () => signIn() } : null,
].filter(Boolean));
