// Open from GitHub Repository… onto a project of the same name (#4618): a question rather than an error. Open it as it is
// (Open and Pull, when it is a clone of the same repository), Replace it (a second confirmation naming what it has
// nowhere else: uncommitted changes, unpushed commits, no repository at all), Keep Both (the repository under another
// name, editable) or Cancel; then the clone done again with the choice (core/git-clone-exists.js, the MCP's git_clone
// if_exists). Every message goes to the console.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { collabLog } from './collab-log.js';
import { S } from './app.js';
import { closeProject, openProject } from './project.js';
import { field } from './wizards.js';
import { projectNameError, sameProject } from '/core/project-name.js';
import { openedText, replacedText, keptBothText } from '/core/git-clone-exists.js';

const trashes = () => !api.standalone || api.keepsTrash;

// the first question: what to do with the project of the name -> 'pull' | 'open' | 'replace' | { rename } | null
async function ask(ex) {
  const other = h('input', { type: 'text', class: 'git-other-name', value: ex.suggested, style: { width: '100%' } });
  const err = h('div', { class: 'hint git-error git-other-name-error', style: { gridColumn: '1 / -1', minHeight: '16px' } });
  other.addEventListener('input', () => { err.textContent = ''; });
  const nameOk = async () => {
    const n = other.value.trim();
    const bad = projectNameError(n);
    if (bad) { err.textContent = bad; return false; }
    if (sameProject(await api.projects(), n)) { err.textContent = `A project named '${n}' already exists: choose another name.`; return false; }
    return true;
  };
  return dialog({
    title: 'Project Already Exists', width: 540, className: 'git-exists',
    body: h('div', {},
      h('div', { class: 'msg msg-question' }, h('div', { class: 'msg-icon' }, '?'), h('div', { class: 'msg-text' },
        h('div', { class: 'git-exists-text' }, `A project named '${ex.project}' already exists.`),
        h('div', { class: 'git-exists-repo' }, ex.sameRepository ? `It is a clone of ${ex.repository}: Open and Pull brings it up to date.` : `It is not a clone of ${ex.repository}.`))),
      ex.loss.length
        ? h('div', { class: 'git-exists-loss', style: { marginTop: '10px' } }, h('div', {}, 'Replacing it would lose:'), h('ul', {}, ...ex.loss.map(l => h('li', {}, l))))
        : h('div', { class: 'hint git-exists-loss', style: { marginTop: '10px' } }, 'Replacing it loses nothing: every change is committed and pushed.'),
      h('div', { class: 'form-grid', style: { marginTop: '10px' } }, ...field('Keep both, the repository as:', other), err)),
    buttons: [
      ...(ex.sameRepository ? [{ label: 'Open and Pull', primary: true, value: 'pull' }] : []),
      { label: 'Open', primary: !ex.sameRepository, value: 'open' },
      { label: 'Replace', value: 'replace' },
      { label: 'Keep Both', value: () => ({ rename: other.value.trim() }), validate: nameOk },
      { label: 'Cancel', value: null }],
  });
}

// the second question of a replace that loses what it names
const confirmLoss = ex => dialog({
  title: 'Replace Project', width: 480, className: 'git-replace',
  body: h('div', { class: 'msg msg-warn' }, h('div', { class: 'msg-icon' }, '!'), h('div', { class: 'msg-text' },
    h('div', {}, `Replace '${ex.project}' with the repository's project? It has what is nowhere else:`),
    h('ul', {}, ...ex.loss.map(l => h('li', {}, l))),
    h('div', {}, trashes() ? 'The old project is moved to the workspace .trash folder.' : 'The old project will be deleted from this browser, and what it has is lost.'))),
  buttons: [{ label: 'Replace', value: true }, { label: 'Cancel', value: false, primary: true }],
});

/** A clone refused as a project of its name exists (the 409's `existing`): asked, then done again with the choice ->
 *  the clone's (or the opened project's) result, already logged, with its `then` ('pull': Pull from GitHub after
 *  opening), or null (cancelled; or failed, logged by fail). */
export async function cloneOntoExisting(url, ex, fail) {
  const choice = await ask(ex);
  if (!choice) { collabLog(`Open from GitHub Repository cancelled: project '${ex.project}' kept as it is.`, 'info'); return null; }
  if (choice === 'open' || choice === 'pull') {
    let r;
    try { r = await api.gitClone(url, ex.project, { ifExists: 'open' }); } catch (e) { fail(e); return null; }
    collabLog(openedText(r), 'ok');
    return { ...r, then: choice === 'pull' && r.sameRepository ? 'pull' : null };
  }
  if (choice.rename) {
    let r;
    try { r = await api.gitClone(url, choice.rename, { ifExists: 'rename' }); } catch (e) { fail(e); return null; }
    return r.renamedFrom ? r : { ...r, renamedFrom: ex.project };   // (the name taken meanwhile: the free one after it)
  }
  if (ex.loss.length && !await confirmLoss(ex)) { collabLog(`Open from GitHub Repository cancelled: project '${ex.project}' kept as it is.`, 'info'); return null; }
  // (the project closed first, opened again if the clone fails: it is then as it was)
  const wasOpen = sameProject([S.project].filter(Boolean), ex.project);
  if (wasOpen) await closeProject();
  try {
    const r = await api.gitClone(url, ex.project, { ifExists: 'replace', discardChanges: ex.loss.length > 0 });
    collabLog(replacedText(r), 'ok');
    return r;
  } catch (e) {
    fail(e);
    if (wasOpen) await openProject(ex.project).catch(() => {});
    return null;
  }
}
