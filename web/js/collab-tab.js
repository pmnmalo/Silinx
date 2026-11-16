// The Collaboration tab (#4215): a tab of the Design pane's row (Start, Design, Files, Libraries, Teaching,
// Collaboration), in both interfaces, gathering the git commands (#3194, web/js/git.js) as the Teaching tab gathers the
// labs (#3533): the project's GitHub repository and branch, its changes with the Design pane's marks (a click compares
// a file with the last commit), Commit…, Push, Pull, History…, the GitHub sign-in and the last push's checks; a project
// with no repository: Initialize Repository…, Open from Repository…. The same items as the Git submenu's
// (gitMenuItems), which keeps them. Its Sharing box (#4259): Share a Copy… (File ▸ Share Project…'s copy, disabled with
// no project as it is, and in a followed project), and live sharing (#3181): what the toolbar's presence shows and its commands
// (web/js/collab-presence.js: who is in, Copy View Link, Stop Sharing, Follow, Stop Following…), Share Live… otherwise. Every message goes to the console (docs/UI-GUIDELINES.md); a followed project (read only) shows the
// read-only notice and its Live box only. No git (SILINX_GIT=off) and no live sharing: no tab. Its boxes are the Start
// page's, so that a later command (a merge, a branch) is one more box or entry.
import { icon } from './icons.js';
import { h } from './ui.js';
import { api } from './api.js';
import { S, showLeftPage } from './app.js';
import { gitMenuItems, gitMarks, gitOff, hasGit, openFromRepositoryDialog } from './git.js';
import { collab, following, followNotice } from './collab-state.js';
import { presence } from './collab-presence.js';
import { liveProblem, shareLiveDialog, shareCopyDialog } from './share-how.js';
import { getLanguage, onLanguageChange } from './i18n.js';
import { designOnly } from './design-only.js';
import { hdlSideFile } from '/core/project-kind.js';
import { shortCommit } from '/core/git-messages.js';

// the last GitHub Checks' answer, its project's (File ▸ Git ▸ GitHub Checks or the tab's)
let checks = null;
const CHECKS = { success: 'Checks passed', failure: 'Checks failed', pending: 'Checks running', none: 'No check on GitHub' };

const entry = (ic, ...kids) => h('div', { class: 'entry' }, icon(ic), ...kids);
const hint = text => h('div', { class: 'entry hint' }, text);
const box = (cls, title, ...kids) => h('div', { class: `start-box ${cls}` }, h('h3', {}, title), ...kids.filter(Boolean));
// a command of the Git submenu: its label, its action (the page drawn again after it), disabled as there
const command = (it, ic) => (it.disabled
  ? entry(ic, h('a', { class: 'disabled', 'aria-disabled': 'true' }, it.label))
  : entry(ic, h('a', { onclick: () => Promise.resolve(it.action()).finally(renderCollabPage) }, it.label)));
const ICON = { 'Commit…': 'save', 'Commit and Push…': 'save', 'Push to GitHub': 'up', 'Pull from GitHub': 'refresh', 'History…': 'summary',
  'GitHub Checks': 'run', 'Initialize Repository…': 'project', 'Sign in with GitHub…': 'project', 'Sign out of GitHub': 'project' };
const cmd = it => command(it, ICON[it.label] || 'file');

/** The tab shown or hidden with git, and its page drawn (#collab-page); kept when it is the same, as the Teaching page. */
export function renderCollabPage() {
  const host = document.getElementById('collab-page');
  if (!host) return;
  const tab = document.querySelector('#left-tabs .tab[data-page="collab"]');
  const none = gitOff() && !liveHere();
  if (tab) tab.hidden = none;
  if (none && S.leftPage === 'collab') showLeftPage('design');
  const page = h('div', { class: 'page' }, ...boxes());
  if (host.firstElementChild?.outerHTML === page.outerHTML) return;
  host.replaceChildren(page);
}

// (live sharing in this edition: a server's relay, or the browser edition's own page)
const liveHere = () => !!(api.collab || api.standalone);

function boxes() {
  if (following()) return [h('div', { class: 'collab-readonly' }, followNotice()), liveBox()];
  if (!hasGit()) return [liveHere() ? liveBox() : null].filter(Boolean);
  const items = gitMenuItems().filter(it => it !== '-');
  const by = label => items.find(it => it.label === label);
  const init = by('Initialize Repository…'), open = { label: 'Open from Repository…', action: () => openFromRepositoryDialog() };
  return [repositoryBox(items, init, open), S.git ? changesBox() : null, githubBox(items, by('GitHub Checks')), liveHere() ? liveBox() : null];
}

// the remote and the branch, the commands of a repository; none: Initialize Repository…, Open from Repository…
function repositoryBox(items, init, open) {
  const g = S.git;
  if (!g) {
    return box('collab-repo', 'Repository',
      hint(S.project ? 'The project is not in a git repository.' : 'No project open.'),
      command({ ...init, disabled: !S.project }, 'project'), cmd(open));
  }
  const where = !g.upstream ? 'Not pushed yet' : null;
  return box('collab-repo', 'Repository',
    g.remote
      ? entry('project', 'GitHub:', h('a', { class: 'collab-remote', 'data-no-i18n': '', href: `https://github.com/${g.remote}`, target: '_blank', rel: 'noopener noreferrer' }, g.remote))
      : hint('No GitHub repository (origin).'),
    entry('file', 'Branch:', h('span', { class: 'collab-branch', 'data-no-i18n': '' }, g.branch || '(no branch)')),
    where ? hint(where) : null,
    g.ahead ? hint(`${g.ahead} commit(s) to push`) : null,
    g.behind ? hint(`${g.behind} commit(s) to pull`) : null,
    ...items.filter(it => /^(Commit|Push|Pull|History)/.test(it.label)).map(cmd),
    g.remote ? null : cmd(init));
}

// the files changed since the last commit, with the Design pane's marks; a click: Compare (#3197)
function changesBox() {
  const files = S.git.files.filter(f => !designOnly() || !hdlSideFile(f.path));   // (a design project's HDL: never listed, #3891)
  const compare = path => import('./git-history.js').then(m => m.compareNow(path));
  return box('collab-changes', 'Changes',
    files.length ? null : hint('No change since the last commit.'),
    ...files.map(f => {
      const m = gitMarks[f.state];
      return h('div', { class: 'entry collab-file', 'data-state': f.state },
        h('span', { class: `git-mark git-${f.state}`, title: m.title }, m.text),
        h('a', { class: 'collab-compare', 'data-no-i18n': '', title: 'Compare with the last commit', onclick: () => compare(f.path) }, f.path));
    }));
}

// the sign-in (the browser edition's; the server editions' git signs in itself), the last push's checks
function githubBox(items, checksItem) {
  const sign = items.find(it => /^Sign (in|out)/.test(it.label));
  const kept = S.git && checks?.project === S.project?.name ? checks.checks : null;
  const state = kept && (kept.state === 'none' ? 'none' : kept.conclusion || 'pending');
  return box('collab-github', 'GitHub',
    api.standalone ? hint(api.githubSignedIn() ? 'Signed in to GitHub.' : 'Not signed in to GitHub.') : hint('git signs in to GitHub with its own credentials.'),
    sign ? cmd(sign) : null,
    cmd(checksItem),
    kept ? h('div', { class: 'entry collab-checks', 'data-state': state }, h('span', {}, CHECKS[state]), h('span', { 'data-no-i18n': '' }, `(${shortCommit(kept.commit)})`)) : null);
}

// the Sharing box's heading (#4259: "Sharing" is the presence's "A partilhar" elsewhere: this one's word given here)
const sharingTitle = () => h('span', { 'data-no-i18n': '' }, getLanguage() === 'pt' ? 'Partilha' : 'Sharing');
// Share a Copy… (#4259): Share Project…'s copy, disabled with no project as File ▸ Share Project… is, and in a followed
// project (read only: the owner's to share), its reason its tip
const FOLLOWED = 'A followed project is its owner\'s to share.';
const copyEntry = () => (following() || !S.project
  ? entry('share', h('a', { class: 'disabled', 'aria-disabled': 'true', title: following() ? FOLLOWED : '' }, 'Share a Copy…'))
  : command({ label: 'Share a Copy…', action: () => shareCopyDialog() }, 'share'));

// Sharing: Share a Copy…, then live sharing (#3181): the presence's label, who is in (their role beside them) and its
// commands; none: Share Live… (disabled with no project or where it cannot be, its reason its tip), how to follow
function liveBox() {
  const p = presence();
  if (!collab.role) {
    const why = S.project ? liveProblem() : null;
    return box('collab-live', sharingTitle(),
      hint('Not shared live.'),
      copyEntry(),
      why || !S.project
        ? entry('share', h('a', { class: 'disabled', 'aria-disabled': 'true', title: why || '' }, 'Share Live…'))
        : entry('share', h('a', { onclick: () => Promise.resolve(shareLiveDialog()).finally(renderCollabPage) }, 'Share Live…')),
      hint('To follow a project shared live, open its link.'));
  }
  const ROLE = { owner: 'owner', editor: 'editor', viewer: 'viewer' };
  return box('collab-live', sharingTitle(),
    hint(p.label),
    ...p.all.map(x => h('div', { class: 'entry collab-peer' }, h('span', { class: 'collab-badge', style: { background: x.color }, 'data-no-i18n': '' }, (String(x.name).trim()[0] || '?').toUpperCase()),
      h('span', { 'data-no-i18n': '' }, x.name), h('span', { class: 'collab-role' }, x.me ? 'you' : ROLE[x.role] || 'viewer'))),
    copyEntry(),
    ...p.commands.map(c => command(c, 'share')));
}

// drawn again when git's status or presence changes, after GitHub Checks, when a project opens or closes
addEventListener('silinx:git-status', () => renderCollabPage());
addEventListener('silinx:git-checks', e => { checks = e.detail; renderCollabPage(); });
onLanguageChange(() => renderCollabPage());
for (const ev of ['silinx:project-opened', 'silinx:project-closed', 'silinx:collab-presence']) addEventListener(ev, () => renderCollabPage());
