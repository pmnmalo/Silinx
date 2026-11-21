// Changes… (#4581: the Collaboration tab's command before History…, and the Git submenu's): the project's files changed
// since the last commit in a window of their own, which replaced the tab's Changes box. Each file with the Design pane's
// mark and its state, the conflicts first and marked (core/git-messages.js changesFirst, as the MCP's git_status lists
// them); a click compares the file with the last commit (#3197, web/js/git-history.js compareNow). The window follows
// git's status while it is open (silinx:git-status), and says so when nothing changed.
import { h, dialog } from './ui.js';
import { S } from './app.js';
import { gitMarks, refreshGitStatus } from './git.js';
import { designOnly } from './design-only.js';
import { hdlSideFile } from '/core/project-kind.js';
import { changesFirst, conflictCount, stateWord } from '/core/git-messages.js';
import { filesState } from './state-files.js';

/** The changes Changes… lists, the conflicts first (a design project's HDL never: committed with its drawings, #3891). */
export const shownChanges = () => (filesState.git ? changesFirst(filesState.git.files.filter(f => !designOnly() || !hdlSideFile(f.path))) : []);

/** Changes…: the changed files; a click on one compares it with the last commit (the window closed for it). */
export async function changesDialog() {
  if (!filesState.git) return null;
  let compare = null, close = null;
  const body = h('div', { class: 'git-changes-window' });
  const item = f => h('li', { class: 'git-change', 'data-state': f.state },
    h('span', { class: `git-mark git-${f.state}`, title: gitMarks[f.state]?.title || '', 'data-no-i18n': '' }, gitMarks[f.state]?.text || '?'),
    h('a', { href: '#', class: 'git-compare', 'data-path': f.path, 'data-no-i18n': '', title: 'Compare with the last commit',
      onclick: e => { e.preventDefault(); compare = f.path; close?.(); } }, f.path),
    h('span', { class: 'git-state' }, `(${stateWord(f.state)})`));
  const draw = () => {
    if (!filesState.git) { close?.(); return; }   // (the project closed, or no longer a repository)
    const files = shownChanges(), conflicts = conflictCount(files);
    body.replaceChildren(
      h('div', { class: 'hint' }, files.length ? `${files.length} change(s) on ${filesState.git.branch || 'no branch'}: a click compares a file with the last commit.` : 'No change since the last commit.'),
      ...(conflicts ? [h('div', { class: 'git-conflicts' }, `${conflicts} file(s) in conflict: resolve each, then commit.`)] : []),
      h('ul', { class: 'git-changes' }, ...files.map(item)));
  };
  draw();
  addEventListener('silinx:git-status', draw);
  refreshGitStatus();   // (what changed outside Silinx too)
  try {
    await dialog({
      title: 'Changes', width: 520, body,
      buttons: [{ label: 'Close', value: null, primary: true }],
      onOpen: ({ close: c }) => { close = () => c(null); },
    });
  } finally { removeEventListener('silinx:git-status', draw); }
  return compare ? import('./git-history.js').then(m => m.compareNow(compare)) : null;
}
