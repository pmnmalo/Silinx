// The Collaboration tab (#4215): a tab of the Design pane's row (Start, Design, Files, Libraries, Collaboration,
// Teaching: #4577), in both interfaces, gathering the git commands (#3194, web/js/git.js) as the Teaching tab gathers the
// labs (#3533): the project's GitHub repository and branch (how many files are in conflict), Commit…, Push, Pull, New
// Branch…, Switch Branch…, Merge Branch… (#4213), Changes… (#4581: how many, the window of web/js/git-changes.js, which
// replaced the Changes box), History…, GitHub Checks and the last push's checks, the GitHub sign-in first: one Git
// Repository box (#4581); a project
// with no repository: Store Project in a GitHub Repository…, Open from GitHub Repository…. The same items as the Git submenu's
// (gitMenuItems), which keeps them. Its Sharing box (#4259): Share a Copy… (File ▸ Share Project…'s copy, enabled as it
// is), and live sharing (#3181): what the toolbar's presence shows and its commands
// (web/js/collab-presence.js: who is in, Show Sharing Link…, Stop Sharing, Follow, Stop Following…), Share Live… otherwise. Every message goes to the console (docs/UI-GUIDELINES.md); a followed project (read only) shows the
// read-only notice and its Live box only. The browser edition's Cloudflare Relay box (#4574, web/js/relay-setup.js): the
// relay its live shares meet their followers at, set up, checked, forgotten. Sharing first, the relay under it, then Git
// Repository (#4636). While sharing, its mode at the top and each follower's path beside them, P2P or Relay (#4643),
// a long list of participants folded (core/list-fold.js); the owner's Viewer | Editor on each follower's row (#4646). No git (SILINX_GIT=off) and no live sharing: no tab. Its boxes are the Start
// page's, so that a later command (a merge, a branch) is one more box or entry. Shown with no project open too (#4619: the
// sign-in, Open from GitHub Repository…, how to follow, the relay; the project's commands disabled), the Start page
// having no GitHub commands of its own.
import { icon } from './icons.js';
import { h } from './ui.js';
import { api } from './api.js';
import { S, showLeftPage } from './app.js';
import { gitMenuItems, gitMarks, gitOff, hasGit, openFromRepositoryDialog } from './git.js';
import { collab, following, followNotice } from './collab-state.js';
import { presence } from './collab-presence.js';
import { liveProblem, shareLiveDialog, shareCopyDialog, canShare } from './share-how.js';
import { getLanguage, onLanguageChange } from './i18n.js';
import { shownChanges } from './git-changes.js';
import { shortCommit, conflictCount } from '/core/git-messages.js';
import { relayEntries } from './relay-setup.js';
import { foldList } from '/core/list-fold.js';
import { roleSwitch } from './collab-roles.js';
import { panes } from './state-panes.js';
import { filesState } from './state-files.js';

// the last GitHub Checks' answer, its project's (File ▸ Git ▸ GitHub Checks or the tab's)
let checks = null;
// the participants unfolded ("N more…"; "Show fewer" folds them again), kept while the page is drawn again
let peersOpen = false;
const CHECKS = { success: 'Checks passed', failure: 'Checks failed', pending: 'Checks running', none: 'No check on GitHub' };

const entry = (ic, ...kids) => h('div', { class: 'entry' }, icon(ic), ...kids);
const hint = text => h('div', { class: 'entry hint' }, text);
const box = (cls, title, ...kids) => h('div', { class: `start-box ${cls}` }, h('h3', {}, title), ...kids.filter(Boolean));
// a command of the Git submenu: its label, its action (the page drawn again after it), disabled as there
const command = (it, ic) => (it.disabled
  ? entry(ic, h('a', { class: 'disabled', 'aria-disabled': 'true' }, it.label))
  : entry(ic, h('a', { onclick: () => Promise.resolve(it.action()).finally(renderCollabPage) }, it.label)));
const ICON = { 'Commit…': 'save', 'Commit and Push…': 'save', 'Push to GitHub': 'up', 'Pull from GitHub': 'refresh', 'Changes…': 'report', 'History…': 'summary',
  'GitHub Checks': 'run', 'New Branch…': 'add', 'Switch Branch…': 'open', 'Merge Branch…': 'procGroup', 'Store Project in a GitHub Repository…': 'project', 'Sign in with GitHub…': 'project', 'Sign out of GitHub': 'project' };
const cmd = it => command(it, ICON[it.label] || 'file');
// Changes… with how many there are (#4581), as the window lists them
function changesCmd(it) {
  const e = cmd(it), n = shownChanges().length;
  if (n) e.append(h('span', { class: 'collab-count', 'data-no-i18n': '' }, `(${n})`));
  return e;
}

/** The tab shown or hidden with git, and its page drawn (#collab-page); kept when it is the same, as the Teaching page. */
export function renderCollabPage() {
  const host = document.getElementById('collab-page');
  if (!host) return;
  const tab = document.querySelector('#left-tabs .tab[data-page="collab"]');
  const none = gitOff() && !liveHere();
  if (tab) tab.hidden = none;
  if (none && panes.leftPage === 'collab') showLeftPage(S.project ? 'design' : 'start');   // (no project: no Design page, #5284)
  const page = h('div', { class: 'page' }, ...boxes());
  if (host.firstElementChild?.outerHTML === page.outerHTML) return;
  host.replaceChildren(page);
}

// (live sharing in this edition: a server's relay, or the browser edition's own page)
const liveHere = () => !!(api.collab || api.standalone);

function boxes() {
  if (following()) return [h('div', { class: 'collab-readonly' }, followNotice()), liveBox()];
  if (!hasGit()) return [liveHere() ? liveBox() : null, relayBox()].filter(Boolean);
  const items = gitMenuItems().filter(it => it !== '-');
  const by = label => items.find(it => it.label === label);
  const init = by('Store Project in a GitHub Repository…'), open = { label: 'Open from GitHub Repository…', action: () => openFromRepositoryDialog() };
  return [liveHere() ? liveBox() : null, relayBox(), repositoryBox(items, init, open)].filter(Boolean);   // (sharing first, its relay with it, #4636)
}

// Git Repository (#4581: the GitHub box's sign-in and checks in it): the sign-in first (the browser edition's command; the
// server editions' git signs in itself), the remote and the branch, the commands of a repository, GitHub Checks and the
// last push's checks; none: Open from GitHub Repository…, Store Project in a GitHub Repository…
function repositoryBox(items, init, open) {
  const g = filesState.git;
  const sign = items.find(it => /^Sign (in|out)/.test(it.label));
  const signIn = sign ? cmd(sign) : hint('git signs in to GitHub with its own credentials.');
  if (!g) {
    return box('collab-repo', 'Git Repository', signIn,
      hint(S.project ? 'The project is not in a git repository.' : 'No project open.'),
      cmd(open), command({ ...init, disabled: !S.project }, 'project'));   // (Open first, #4343)
  }
  const where = !g.upstream ? 'Not pushed yet' : null, conflicts = conflictCount(shownChanges());
  const kept = checks && checks.project === S.project?.name ? checks.checks : null;   // (none yet: null, with no project too, #4619)
  const state = kept && (kept.state === 'none' ? 'none' : kept.conclusion || 'pending');
  return box('collab-repo', 'Git Repository', signIn,
    g.remote
      ? entry('project', 'GitHub:', h('a', { class: 'collab-remote', 'data-no-i18n': '', href: `https://github.com/${g.remote}`, target: '_blank', rel: 'noopener noreferrer' }, g.remote))
      : hint('No GitHub repository (origin).'),
    entry('file', 'Branch:', h('span', { class: 'collab-branch', 'data-no-i18n': '' }, g.branch || '(no branch)')),
    where ? hint(where) : null,
    g.ahead ? hint(`${g.ahead} commit(s) to push`) : null,
    g.behind ? hint(`${g.behind} commit(s) to pull`) : null,
    // (a pull's or a merge's conflicts left unresolved: said here, as the Design pane's C marks, #4581)
    conflicts ? h('div', { class: 'entry hint collab-conflicts' }, `${conflicts} file(s) in conflict`) : null,
    ...items.filter(it => /^(Commit|Push|Pull|Changes|History|New Branch|Switch Branch|Merge Branch|GitHub Checks)/.test(it.label)).map(it => (it.label === 'Changes…' ? changesCmd(it) : cmd(it))),
    kept ? h('div', { class: 'entry collab-checks', 'data-state': state }, h('span', {}, CHECKS[state]), h('span', { 'data-no-i18n': '' }, `(${shortCommit(kept.commit)})`)) : null,
    g.remote ? null : cmd(init));
}

// the Sharing box's heading (#4259: "Sharing" is the presence's "A partilhar" elsewhere: this one's word given here)
const sharingTitle = () => h('span', { 'data-no-i18n': '' }, getLanguage() === 'pt' ? 'Partilha' : 'Sharing');
// Share a Copy… (#4259): Share Project…'s copy, enabled as File ▸ Share Project… is (canShare)
const copyEntry = () => command({ label: 'Share a Copy…', action: () => shareCopyDialog(), disabled: !canShare() }, 'share');

// a share's mode (#4643: Share Project… ▸ Live's two ways, #4634, and a Silinx server's relay) and a follower's path
const MODE = { cloudflare: 'Live via your Cloudflare relay', p2p: 'Live peer to peer', server: 'Live via the Silinx server\'s relay' };
const PATH = { p2p: 'P2P', relay: 'Relay' };
const pathTip = (path, mode) => (path === 'p2p' ? 'Peer to peer: directly between your browsers'
  : mode === 'cloudflare' ? 'Through your Cloudflare relay: no direct path; counts against its free plan' : 'Through the Silinx server\'s relay');

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
  const { shown, more } = foldList(p.all, { open: peersOpen });
  const fold = open => () => { peersOpen = open; renderCollabPage(); };
  return box('collab-live', sharingTitle(),
    p.mode ? h('div', { class: 'entry hint collab-mode', 'data-mode': p.mode }, MODE[p.mode]) : null,
    hint(p.label),
    ...shown.map(x => h('div', { class: 'entry collab-peer' }, h('span', { class: 'collab-badge', style: { background: x.color }, 'data-no-i18n': '' }, (String(x.name).trim()[0] || '?').toUpperCase()),
      h('span', { 'data-no-i18n': '' }, x.name),
      p.roles && !x.me && x.role !== 'owner' ? roleSwitch(x, p.roles, renderCollabPage) : h('span', { class: 'collab-role' }, x.me ? 'you' : ROLE[x.role] || 'viewer'),
      x.path ? h('span', { class: 'collab-path', 'data-path': x.path, title: pathTip(x.path, p.mode) }, PATH[x.path]) : null)),
    more ? entry('expand', h('a', { class: 'collab-fold', onclick: fold(true) }, `${more} more…`)) : null,
    peersOpen && foldList(p.all).more ? entry('collapse', h('a', { class: 'collab-fold', onclick: fold(false) }, 'Show fewer')) : null,
    copyEntry(),
    ...p.commands.map(c => command(c, 'share')));
}

// Relay (#4574): the browser edition's relay of this browser's settings, where Share Project… ▸ Live meets the
// followers (web/js/relay-setup.js): the relay set, Check Relay, Change Relay…, Forget Relay; none: Set Up a Cloudflare
// Relay…. Not while sharing nor in a server edition (its own relay).
const relayBox = () => (api.standalone && !api.collab && !collab.role
  ? box('collab-relay-box', 'Cloudflare Relay', ...relayEntries({ entry, hint, command: (it, ic) => command(it, ic) }))
  : null);

// drawn again when git's status or presence changes, after GitHub Checks, when a project opens or closes
addEventListener('silinx:git-status', () => renderCollabPage());
addEventListener('silinx:git-checks', e => { checks = e.detail; renderCollabPage(); });
onLanguageChange(() => renderCollabPage());
for (const ev of ['silinx:project-opened', 'silinx:project-closed', 'silinx:collab-presence', 'silinx:relay-changed']) addEventListener(ev, () => renderCollabPage());
