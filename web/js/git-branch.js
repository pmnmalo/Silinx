// Git's branches in the interface (#4213, phase 4 of #4204): each person of a group works on a branch of their own. File ▸
// Git ▸ New Branch… (made from the last commit, the project on it), Switch Branch… (the project's files the branch's) and
// Merge Branch… (another branch merged into the project's as Pull merges GitHub's commits: a drawing by its objects, a
// text file by its lines, the conflicts chosen in the merge view), the same in the Design pane's project menu and the
// Collaboration tab, which shows the branch (web/js/collab-tab.js). The server editions' git (server/git-branch.js) or the
// browser edition's GitHub API (core/git-rest-branch.js), through api.js. Every message goes to the console.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { collabLog } from './collab-log.js';
import { S } from './app.js';
import { reloadProject } from './project.js';
import { saveAll } from './processes.js';
import { field } from './wizards.js';
import { applyChanges } from './project-watch.js';
import { logGitError, refreshGitStatus, chooseConflicts } from './git.js';
import { designOnly } from './design-only.js';
import { newBranchText, switchText, mergeBranchText, pullMergeLines } from '/core/git-messages.js';
import { checkBranchName } from '/core/git-branch-name.js';
import { filesState } from './state-files.js';

// a field's error, beside it (the dialog stays open)
const fieldError = cls => h('div', { class: `hint git-error ${cls}`, style: { gridColumn: '1 / -1', minHeight: '16px' } });

// the project's files a switch or a merge changed, read again (the server's watcher tells the page; the browser
// edition's open documents told here)
async function reread(name, files) {
  if (S.project?.name !== name || !files.length) return;
  if (api.standalone) await applyChanges({ project: name, changes: files.map(f => ({ path: f, kind: filesState.diskTree?.includes(f) ? 'changed' : 'added' })) });
  else await reloadProject();
}

// the branches, GitHub's fetched first (its warnings in the console), or null (an error, logged)
async function listBranches(name) {
  try {
    const r = await api.gitBranches(name);
    for (const w of r.warnings || []) collabLog(`WARNING: ${w}`, 'warn');
    return r;
  } catch (e) { logGitError(e); return null; }
}

// a dialog choosing one of the branches but the project's: { branch } or null
async function chooseBranch({ title, label, hint, button, list }) {
  const others = list.branches.filter(b => !b.current);
  const sel = h('select', { class: 'git-branch-choice', style: { width: '100%' } }, ...others.map(b => h('option', { value: b.name, 'data-no-i18n': '' }, b.name)));
  return dialog({
    title, width: 460,
    body: h('div', {},
      h('div', { class: 'form-grid' }, ...field('Branch of the project:', h('span', { class: 'git-branch-now', 'data-no-i18n': '' }, list.branch || '(no branch)')), ...field(label, sel)),
      h('div', { class: 'hint', style: { marginTop: '10px' } }, others.length ? hint : 'The project has no other branch: New Branch… makes one.')),
    buttons: [{ label: button, primary: true, disabled: !others.length, value: () => ({ branch: sel.value }) }, { label: 'Cancel', value: null }],
  });
}

/** File ▸ Git ▸ New Branch…: a branch made from the project's last commit, the project on it (its changes kept). */
async function newBranchDialog() {
  if (!S.project) return null;
  if (!await saveAll()) return null;
  const name = h('input', { type: 'text', class: 'git-branch-name', style: { width: '100%' } });
  const err = fieldError('git-branch-error');
  name.addEventListener('input', () => { err.textContent = ''; });
  const r = await dialog({
    title: 'New Branch', width: 460,
    body: h('div', {},
      h('div', { class: 'form-grid' }, ...field('Name of the new branch:', name), err),
      h('div', { class: 'hint', style: { marginTop: '10px' } }, 'Each person of a group works on a branch of their own, made from the last commit: the project goes on it, its changes kept.')),
    buttons: [{ label: 'Create', primary: true, value: () => name.value.trim(),
      validate: () => { try { checkBranchName(name.value); return true; } catch (e) { err.textContent = e.message; return false; } } },
    { label: 'Cancel', value: null }],
  });
  if (!r) return null;
  try { const b = await api.gitNewBranch(S.project.name, r); collabLog(newBranchText(b), 'ok'); return b; }
  catch (e) { logGitError(e); return null; } finally { await refreshGitStatus(); }
}

/** File ▸ Git ▸ Switch Branch…: the project on another branch (its changes committed first), its files read again. */
async function switchBranchDialog() {
  if (!S.project) return null;
  if (!await saveAll()) return null;
  const name = S.project.name;
  const list = await listBranches(name);
  if (!list) return null;
  const r = await chooseBranch({ title: 'Switch Branch', label: 'Switch to:', button: 'Switch', list,
    hint: 'The project\'s files become the branch\'s last commit\'s. Commit your changes first.' });
  if (!r) return null;
  try {
    const s = await api.gitSwitch(name, r.branch);
    collabLog(switchText(s), 'ok');
    for (const w of s.warnings || []) collabLog(`WARNING: ${w}`, 'warn');
    await reread(name, s.files);
    return s;
  } catch (e) { logGitError(e); return null; } finally { await refreshGitStatus(); }
}

/** File ▸ Git ▸ Merge Branch…: another branch merged into the project's; its conflicts chosen (a drawing's objects, a
 *  text file's lines in the merge view), then merged again with the choices. */
async function mergeBranchDialog() {
  if (!S.project) return null;
  if (!await saveAll()) return null;
  const name = S.project.name;
  const list = await listBranches(name);
  if (!list) return null;
  const r = await chooseBranch({ title: 'Merge Branch', label: 'Merge in:', button: 'Merge', list,
    hint: 'What only the other branch changed is taken; a drawing changed on both is merged by its objects, a file by its lines; for the same objects or lines, you choose. Commit your changes first.' });
  return r ? mergeBranch(name, r.branch, list.branch) : null;
}
async function mergeBranch(name, branch, mine, resolve = null) {
  try {
    const m = await api.gitMerge(name, branch, resolve ? { resolve } : {});
    collabLog(mergeBranchText(m), 'ok');
    for (const l of pullMergeLines(m, { designOnly: designOnly() })) collabLog(l, 'info');
    for (const w of m.warnings || []) collabLog(`WARNING: ${w}`, 'warn');
    await reread(name, m.upToDate ? [] : m.files);
    return m;
  } catch (e) {
    logGitError(e);
    if (S.project?.name !== name) return null;
    const choices = await chooseConflicts(e, { key: `merge:${name}`, title: 'Merge Branch (merge)', labels: { mine: `Mine (${mine})`, theirs: `Theirs (${branch})` }, action: 'Merge Branch', where: 'on both branches', resolve });
    return choices ? mergeBranch(name, branch, mine, choices) : null;
  } finally { await refreshGitStatus(); }
}

/** The Git submenu's branch commands (web/js/git.js gitMenuItems), for a project in a repository. */
export const branchMenuItems = () => [
  { label: 'New Branch…', action: () => newBranchDialog(), disabled: !filesState.git },
  { label: 'Switch Branch…', action: () => switchBranchDialog(), disabled: !filesState.git },
  { label: 'Merge Branch…', action: () => mergeBranchDialog(), disabled: !filesState.git },
];
