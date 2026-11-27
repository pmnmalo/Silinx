// UI: the Collaboration tab of the Design pane's row (#4215, web/js/collab-tab.js) in the server editions, against local
// bare repositories (no network: https://github.com/test/<repo> mapped to one, SILINX_UI_GIT_REMOTES of
// test/ui/serve.js), in both interfaces (SILINX_UI_INTERFACE): the tab after Libraries, before Teaching (#4577); no project open: the Start and Collaboration tabs
// (#4257, #4322, #4619: Open from GitHub Repository… from the tab); a project opened from a repository: its GitHub repository and branch, Changes…
// (#4581: how many, its window with the Design pane's marks, the conflicts first, a click comparing one with the last commit, following
// git's status while open; no Changes box), Commit…, Push to GitHub, Pull from GitHub, History… run from the tab, the File menu's items kept; a project with no repository: Store Project in a GitHub Repository… from the
// tab, then committed and pushed; a followed project's read-only notice; Sharing (Share a Copy…, Share Live… from the tab, who is
// in, the presence's commands, Stop Sharing; a follower's box); the ISE style's tabs all whole in its default side panel
// (330 px); in Portuguese; a narrow screen; while sharing (#4643), the mode at the top and each follower's path (P2P or
// Relay), a long list of participants folded; no warnings.
// (The browser edition's sign-in and checks: test/ui/collab-tab-browser.test.js.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';

let env, tmp, remotes;
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
// (git run beside the app's own status reads: its index.lock waited for, #4581)
function shLocked(cwd, ...args) {
  for (let i = 0; ; i++) {
    try { return sh(cwd, ...args); } catch (e) {
      if (i >= 50 || !/index\.lock/.test(e.stderr || e.message)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}
// a bare repository on "GitHub", with blinky committed (seed) or empty
function bare(name, { seed = true } = {}) {
  const dir = path.join(remotes, `${name}.git`);
  fs.mkdirSync(dir, { recursive: true });
  sh(dir, 'init', '--quiet', '--bare');
  sh(dir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  if (!seed) return dir;
  const work = path.join(tmp, 'seed', name);
  fs.cpSync(path.join(ROOT, 'examples', 'blinky'), work, { recursive: true });
  sh(work, 'init', '--quiet');
  sh(work, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  sh(work, 'add', '-A');
  sh(work, 'commit', '--quiet', '-m', 'Starter');
  sh(work, 'push', '--quiet', dir, 'main');
  return dir;
}
// another author's commit on GitHub
function theirs(name, file, text) {
  const dir = path.join(tmp, 'theirs', name);
  if (!fs.existsSync(dir)) sh(tmp, 'clone', '--quiet', path.join(remotes, `${name}.git`), dir);
  sh(dir, 'pull', '--quiet', '--no-rebase');
  fs.writeFileSync(path.join(dir, file), text);
  sh(dir, 'commit', '--quiet', '-am', `Theirs: ${file}`);
  sh(dir, 'push', '--quiet');
}

before(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ui-collab-')));
  remotes = path.join(tmp, 'remotes');
  fs.writeFileSync(path.join(tmp, 'gitconfig'), '[user]\n\tname = Ana Aluna\n\temail = ana@example.com\n[init]\n\tdefaultBranch = main\n');
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: path.join(tmp, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', SILINX_UI_GIT_REMOTES: remotes });
  env = await setupUi();
});
after(async () => {
  await env?.teardown?.();
  delete process.env.SILINX_UI_GIT_REMOTES;
  fs.rmSync(tmp, { recursive: true, force: true });
});
const E = () => env;

async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
// the page as shown: each box's heading and entries (an entry's parts joined by a space, "(disabled)" after a command
// that cannot be clicked, a file's mark before its path)
const collab = (page) => page.eval(() => {
  const host = document.getElementById('collab-page');
  const text = (e) => [...e.childNodes].filter((n) => !n.classList?.contains('ico')).map((n) => n.textContent).filter(Boolean).join(' ')
    + (e.querySelector('a.disabled') ? ' (disabled)' : '');
  return { shown: host.getClientRects().length > 0,
    boxes: [...host.querySelectorAll('.start-box')].map((b) => [b.querySelector('h3').textContent, ...[...b.querySelectorAll('.entry')].map(text)]) };
});
// (timed out: the console's last lines in the failure)
const waitLog = (page, re) => page.waitConsole(re).catch(async (e) => { assert.match((await page.eval(() => window.__console())).slice(-1500), re, e.message); throw e; });
const tabCommand = (page, label) => page.click('#collab-page .entry a', { text: label });
const writeFile = (page, rel, text) => page.eval(async (p, t) => { const { api } = await import('/js/api.js'); await api.writeFile(window.Silinx.project.name, p, t); }, rel, text);
// (timed out: the boxes as shown, against the expected)
const waitBox = (page, heading, entries, what) => waitBoxOf(page, heading, entries, what).catch(async (e) => {
  assert.deepEqual((await collab(page)).boxes.find((b) => b[0] === heading)?.slice(1), entries, e.message);
  throw e;
});
const waitBoxOf = (page, heading, entries, what) => page.waitFor((hd, en) => {
  const b = [...document.querySelectorAll('#collab-page .start-box')].find((x) => x.querySelector('h3').textContent === hd);
  return !!b && JSON.stringify([...b.querySelectorAll('.entry')].map((e) => [...e.childNodes].filter((n) => !n.classList?.contains('ico')).map((n) => n.textContent).filter(Boolean).join(' '))) === JSON.stringify(en);
}, [heading, entries], { what });
const SERVER_GITHUB = 'git signs in to GitHub with its own credentials.';
// (#4259: the Sharing box, Share a Copy… in it)
const NOT_LIVE = (off = false) => ['Sharing', 'Not shared live.', `Share a Copy…${off ? ' (disabled)' : ''}`, `Share Live…${off ? ' (disabled)' : ''}`, 'To follow a project shared live, open its link.'];
// (#4581: Changes… before History…, with how many files changed)
// (#4581: one Git Repository box, the sign-in first, GitHub Checks last)
const REPO = (n = 0) => ['Commit…', 'Push to GitHub', 'Pull from GitHub', 'New Branch…', 'Switch Branch…', 'Merge Branch…', n ? `Changes… (${n})` : 'Changes…', 'History…', 'GitHub Checks'];
const REPO_COMMANDS = REPO();
// Changes…'s window (#4581): its lines (the hint, the conflicts' line) and its files (mark, path, state)
const changesWindow = (page) => page.eval(() => {
  const d = [...document.querySelectorAll('.dlg-overlay')].pop();
  return { title: d?.querySelector('.dlg-title span')?.textContent,
    lines: [...(d?.querySelectorAll('.git-changes-window > div') || [])].map((e) => e.textContent),
    files: [...(d?.querySelectorAll('.git-change') || [])].map((li) => [...li.childNodes].map((n) => n.textContent).join(' ')) };
});
const waitChanges = (page, want, what) => page.waitFor((w) => {
  const d = [...document.querySelectorAll('.dlg-overlay')].pop();
  const got = { title: d?.querySelector('.dlg-title span')?.textContent, lines: [...(d?.querySelectorAll('.git-changes-window > div') || [])].map((e) => e.textContent),
    files: [...(d?.querySelectorAll('.git-change') || [])].map((li) => [...li.childNodes].map((n) => n.textContent).join(' ')) };
  return JSON.stringify(got) === JSON.stringify(w);
}, [want], { what }).catch(async (e) => { assert.deepEqual(await changesWindow(page), want, e.message); throw e; });

uiTest('#4215 #4257 #4322 #4581 #4619 the Collaboration tab: shown with no project, a project opened from a repository, Changes…, Commit…, Push, Pull, History…; read only when followed; Portuguese', E, async (page) => {
  bare('collab1');
  await page.setViewport(1366, 768);
  await page.eval(() => window.SilinxApp.closeProject?.());
  // no project: the Start and Collaboration tabs (#4257, #4322, #4619); Open from GitHub Repository… from the tab: the project, its repository and branch, no change
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#left-tabs .tab')].filter((t) => t.getClientRects().length).map((t) => t.dataset.page)), ['start', 'collab']);
  await page.leftTab('collab');
  await tabCommand(page, 'Open from GitHub Repository…');
  await page.waitDialog('Open from GitHub Repository');
  await page.fill('.dlg-overlay .git-url', 'https://github.com/test/collab1');
  await page.dialogButton('Open');
  await page.waitNoDialog();
  await waitLog(page, /Project 'collab1' opened from the GitHub repository test\/collab1\./);
  // the tab after Libraries, before Teaching (#4577), its label and icon
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#left-tabs .tab[data-page]')].map((t) => t.dataset.page).filter((p) => !['procs', 'emu'].includes(p))),
    ['start', 'design', 'files', 'libraries', 'collab', 'teaching']);
  assert.deepEqual(await page.eval(() => { const t = document.querySelector('#left-tabs .tab[data-page=collab]'); return [t.querySelector('.tab-lbl').textContent, !!t.querySelector('.tab-ico svg'), t.hidden]; }), ['Collaboration', true, false]);
  // (every tab in the row, none cut: the ISE style's names shown, the Silinx interface's icons)
  assert.deepEqual(await page.eval(() => { const row = document.getElementById('left-tabs').getBoundingClientRect();
    return [...document.querySelectorAll('#left-tabs .tab')].filter((t) => t.getClientRects().length).filter((t) => { const r = t.getBoundingClientRect(); return r.left < row.left - 1 || r.right > row.right + 1; }).map((t) => t.dataset.page); }), []);
  // (the ISE style: every name whole in the side panel's default width, 330 px)
  if (await page.eval(() => document.documentElement.dataset.ui === 'ise')) {
    assert.equal(await page.eval(() => document.getElementById('left').getBoundingClientRect().width), 330);
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#left-tabs .tab-lbl')].filter((l) => l.getClientRects().length && l.scrollWidth > l.clientWidth).map((l) => l.textContent)), []);
  }
  await page.waitFor(() => window.Silinx.project?.name === 'collab1' && !!window.SilinxApp.S.git, [], { what: 'collab1 open, its status' });
  await page.leftTab('collab');
  await waitBox(page, 'Git Repository', [SERVER_GITHUB, 'GitHub: local/collab1', 'Branch: main', ...REPO_COMMANDS], 'no change');
  // (#4581: no Changes box; Changes… just before History…)
  // (Sharing first, then Git Repository: #4636)
  assert.deepEqual((await collab(page)).boxes, [
    NOT_LIVE(), ['Git Repository', SERVER_GITHUB, 'GitHub: local/collab1', 'Branch: main', ...REPO_COMMANDS]]);
  assert.equal(await page.eval(() => document.querySelector('#collab-page .collab-changes, #collab-page .collab-file')), null);
  // Changes… with no change: its line
  await tabCommand(page, 'Changes…');
  await page.waitDialog('Changes');
  await waitChanges(page, { title: 'Changes', lines: ['No change since the last commit.'], files: [] }, 'no change in the window');
  await page.dialogButton('Close');
  await page.waitNoDialog();
  assert.deepEqual(await page.eval(() => { const a = document.querySelector('#collab-page .collab-remote'); return [a.href, a.target, a.rel]; }), ['https://github.com/local/collab1', '_blank', 'noopener noreferrer']);
  // a change and a new file (silinx.json lists it): listed with the Design pane's marks and their tips
  const counter = await page.eval(async () => (await (await import('/js/api.js')).api.readFile('collab1', 'src/counter.v')));
  await writeFile(page, 'src/counter.v', `${counter}// changed\n`);
  await writeFile(page, 'src/extra.v', 'module extra; endmodule\n');
  await waitBox(page, 'Git Repository', [SERVER_GITHUB, 'GitHub: local/collab1', 'Branch: main', ...REPO(3)], 'the changes counted');
  // Changes…: the window, with the Design pane's marks and their tips
  await tabCommand(page, 'Changes…');
  await page.waitDialog('Changes');
  await waitChanges(page, { title: 'Changes', lines: ['3 change(s) on main: a click compares a file with the last commit.'],
    files: ['M silinx.json (changed)', 'M src/counter.v (changed)', 'N src/extra.v (new)'] }, 'the changes');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .git-change .git-mark')].map((m) => m.title)), ['Changed since the last commit', 'Changed since the last commit', 'New: not committed yet']);
  // a click: the window closed, the file compared with the last commit, in a document of its own
  await page.click('.dlg-overlay .git-compare', { text: 'src/counter.v' });
  await page.waitNoDialog();
  await page.waitFor(() => window.SilinxApp.S.active?.compare?.path === 'src/counter.v', [], { what: 'the comparison' });
  assert.deepEqual(await page.eval(() => [window.SilinxApp.S.active.compare.before.replace(/[0-9a-f]{7}$/, 'X'), window.SilinxApp.S.active.compare.after]), ['as it was in the commit X', 'as it is now']);
  // Commit… from the tab: the File menu's dialog; then one commit to push
  await page.leftTab('collab');
  await tabCommand(page, 'Commit…');
  await page.waitDialog('Commit');
  await page.fill('.dlg-overlay .git-message', 'Counter changed');
  await page.dialogButton('Commit');
  await page.waitNoDialog();
  await waitLog(page, /Committed [0-9a-f]{7} on main: 4 file\(s\)\./);   // (Silinx's .gitignore, written by the commit)
  await waitBox(page, 'Git Repository', [SERVER_GITHUB, 'GitHub: local/collab1', 'Branch: main', '1 commit(s) to push', ...REPO_COMMANDS], 'committed, one commit to push');
  // Push to GitHub from the tab
  await tabCommand(page, 'Push to GitHub');
  await waitLog(page, /Pushed main to local\/collab1\./);
  await waitBox(page, 'Git Repository', [SERVER_GITHUB, 'GitHub: local/collab1', 'Branch: main', ...REPO_COMMANDS], 'pushed');
  // Pull from GitHub from the tab: another author's commit
  theirs('collab1', 'src/sevenseg.v', '// theirs\n');
  await tabCommand(page, 'Pull from GitHub');
  await waitLog(page, /Pulled into main: 1 file\(s\) changed\.\n {2}src\/sevenseg\.v/);
  // History… from the tab: the commits, the newest first
  await tabCommand(page, 'History…');
  await page.waitDialog('History');
  assert.ok(await page.eval(() => /Theirs: src\/sevenseg\.v/.test(document.querySelector('.dlg-overlay').textContent)));
  await page.dialogButton('Close');
  await page.waitNoDialog();
  // the File menu keeps its items (the same functions)
  const file = await page.eval(() => window.SilinxApp.S.menus.find((m) => m.label === 'File').items().filter(Boolean).flatMap((x) => (x.submenu ? x.submenu : [x])).filter((x) => x !== '-').map((x) => x.label));
  for (const l of ['Open from GitHub Repository…']) assert.ok(file.includes(l), file.join(' | '));
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor(() => document.querySelector('#collab-page .collab-repo h3')?.textContent === 'Repositório Git', [], { what: 'Portuguese' });
    assert.deepEqual((await collab(page)).boxes, [
      ['Partilha', 'Não partilhado em direto.', 'Partilhar uma Cópia…', 'Partilhar em Direto…', 'Para seguir um projeto partilhado em direto, abra a sua ligação.'],
      ['Repositório Git', 'O git autentica-se no GitHub com as suas próprias credenciais.', 'GitHub: local/collab1', 'Ramo: main', 'Registar (Commit)…', 'Enviar para o GitHub (Push)', 'Receber do GitHub (Pull)', 'Novo Ramo…', 'Mudar de Ramo…', 'Juntar Ramo…', 'Alterações…', 'Histórico…', 'Verificações do GitHub (Checks)']]);
    assert.equal(await page.eval(() => document.querySelector('#left-tabs .tab[data-page=collab] .tab-lbl').textContent), 'Colaboração');
    await tabCommand(page, 'Alterações…');
    await page.waitDialog('Alterações');
    await waitChanges(page, { title: 'Alterações', lines: ['Nenhuma alteração desde o último commit.'], files: [] }, 'the window in Portuguese');
    await page.dialogButton('Fechar');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  // a followed project (read only, #3181): the read-only notice, the Sharing box only (a real one: the next test)
  await page.eval(async () => { const { collab: c } = await import('/js/collab-state.js'); Object.assign(c, { role: 'follower', owner: 'Rui' }); (await import('/js/collab-tab.js')).renderCollabPage(); });
  try {
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#collab-page .page > *')].map((e) => e.querySelector('h3')?.textContent ?? e.textContent)), ['Read-only, following Rui\'s project', 'Sharing']);
    // (#4259: Share a Copy… enabled, as File ▸ Share Project… is; no other command)
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#collab-page .entry a')].map((a) => [a.textContent, a.className])), [['Share a Copy…', '']]);
  } finally {
    await page.eval(async () => { const { collab: c } = await import('/js/collab-state.js'); Object.assign(c, { role: null, owner: '' }); (await import('/js/collab-tab.js')).renderCollabPage(); });
  }
  await noWarnings(page);
});

uiTest('#4215 the Collaboration tab: a project with no repository, Store Project in a GitHub Repository… from it, its remote, committed and pushed', E, async (page) => {
  bare('collab2', { seed: false });
  await page.setViewport(1366, 768);
  await makeProject(env, { name: 'CollabInit', template: 'gates' });
  await page.openProject('CollabInit');
  await page.leftTab('collab');
  await waitBox(page, 'Git Repository', [SERVER_GITHUB, 'The project is not in a git repository.', 'Open from GitHub Repository…', 'Store Project in a GitHub Repository…'], 'no repository');
  assert.deepEqual((await collab(page)).boxes.map((b) => b[0]), ['Sharing', 'Git Repository']);
  // Store Project in a GitHub Repository… from the tab, with no GitHub repository: offered again, to give it one
  await tabCommand(page, 'Store Project in a GitHub Repository…');
  await page.waitDialog('Store Project in a GitHub Repository');
  await page.dialogButton('Initialize');
  await page.waitNoDialog();
  await waitLog(page, /Repository made for 'CollabInit'; \.gitignore written\./);
  await page.waitFor(() => window.SilinxApp.S.git?.files.length > 2, [], { what: 'the new files' });
  const n0 = await page.eval(() => window.SilinxApp.S.git.files.length);
  await waitBox(page, 'Git Repository', [SERVER_GITHUB, 'No GitHub repository (origin).', 'Branch: main', 'Not pushed yet', ...REPO(n0), 'Store Project in a GitHub Repository…'], 'the repository, no remote');
  // its origin (the test server's local repositories stand for GitHub's, as a clone's: set with git)
  sh(path.join(env.server.workspace, 'CollabInit'), 'remote', 'add', 'origin', path.join(remotes, 'collab2.git'));
  await page.eval(async () => (await import('/js/git.js')).refreshGitStatus());
  // the repository, not pushed yet; every file new, counted
  await page.waitFor(() => window.SilinxApp.S.git?.remote === 'local/collab2', [], { what: 'the remote' });
  const n = await page.eval(() => window.SilinxApp.S.git.files.length);
  await waitBox(page, 'Git Repository', [SERVER_GITHUB, 'GitHub: local/collab2', 'Branch: main', 'Not pushed yet', ...REPO(n)], 'the repository, its changes counted');
  await tabCommand(page, 'Changes…');
  await page.waitDialog('Changes');
  const changes = (await changesWindow(page)).files;
  assert.ok(changes.length === n && n > 2 && changes.every((c) => /^N .* \(new\)$/.test(c)) && changes.includes('N silinx.json (new)') && changes.includes('N .gitignore (new)'), changes.join(' | '));
  await page.dialogButton('Close');
  await page.waitNoDialog();
  await tabCommand(page, 'Commit…');
  await page.waitDialog('Commit');
  await page.fill('.dlg-overlay .git-message', 'First');
  await page.dialogButton('Commit');
  await page.waitNoDialog();
  await waitBox(page, 'Git Repository', [SERVER_GITHUB, 'GitHub: local/collab2', 'Branch: main', 'Not pushed yet', ...REPO_COMMANDS], 'committed');
  await tabCommand(page, 'Push to GitHub');
  await waitLog(page, /Pushed main to local\/collab2\./);
  await waitBox(page, 'Git Repository', [SERVER_GITHUB, 'GitHub: local/collab2', 'Branch: main', ...REPO_COMMANDS], 'pushed');
  assert.equal(sh(path.join(remotes, 'collab2.git'), 'log', '--format=%s', 'main').trim(), 'First');
  await noWarnings(page);
});

// Changes… (#4581) with a merge left in conflict by git itself: the Repository box says how many files are in conflict,
// the window lists them first and marked, follows git's status while open (a new file, the merge aborted), its line when
// nothing changed; in Portuguese
uiTest('#4581 the Collaboration tab: Changes…, the conflicts first, the window following git\'s status; Portuguese', E, async (page) => {
  await page.setViewport(1366, 768);
  await makeProject(env, { name: 'CollabClash', template: 'gates' });
  await page.openProject('CollabClash');
  await page.leftTab('collab');
  await tabCommand(page, 'Store Project in a GitHub Repository…');
  await page.waitDialog('Store Project in a GitHub Repository');
  await page.dialogButton('Initialize');
  await page.waitNoDialog();
  await waitLog(page, /Repository made for 'CollabClash'; \.gitignore written\./);
  // (a merge of another branch that changed the same line, by git outside Silinx)
  const dir = path.join(env.server.workspace, 'CollabClash'), vhd = path.join(dir, 'src', 'gates.vhd');
  const text = fs.readFileSync(vhd, 'utf8');
  shLocked(dir, 'add', '-A'); shLocked(dir, 'commit', '--quiet', '-m', 'First');
  shLocked(dir, 'checkout', '--quiet', '-b', 'other');
  fs.writeFileSync(vhd, `-- theirs\n${text}`); shLocked(dir, 'commit', '--quiet', '-am', 'Theirs');
  shLocked(dir, 'checkout', '--quiet', 'main');
  fs.writeFileSync(vhd, `-- mine\n${text}`); shLocked(dir, 'commit', '--quiet', '-am', 'Mine');
  assert.throws(() => shLocked(dir, 'merge', '--quiet', 'other'));
  fs.writeFileSync(path.join(dir, 'src', 'a_new.v'), 'module a_new; endmodule\n');
  await page.eval(async () => (await import('/js/git.js')).refreshGitStatus());
  // the Git Repository box: the conflicts counted, Changes… with how many
  const REPO_BOX = (n, c) => [SERVER_GITHUB, 'No GitHub repository (origin).', 'Branch: main', 'Not pushed yet', ...(c ? [`${c} file(s) in conflict`] : []), ...REPO(n), 'Store Project in a GitHub Repository…'];
  await waitBox(page, 'Git Repository', REPO_BOX(2, 1), 'the conflict counted');
  // the window: the conflict first (git lists src/a_new.v first), in red
  await tabCommand(page, 'Changes…');
  await page.waitDialog('Changes');
  const CONFLICT = '1 file(s) in conflict: resolve each, then commit.';
  await waitChanges(page, { title: 'Changes', lines: ['2 change(s) on main: a click compares a file with the last commit.', CONFLICT],
    files: ['C src/gates.vhd (in conflict)', 'N src/a_new.v (new)'] }, 'the conflict first');
  assert.deepEqual(await page.eval(() => window.SilinxApp.S.git.files.map((f) => f.path)), ['src/a_new.v', 'src/gates.vhd']);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .git-change')].map((li) => [li.dataset.state, getComputedStyle(li).fontWeight, li.querySelector('.git-mark').title])),
    [['conflict', '700', 'In conflict'], ['new', '400', 'New: not committed yet']]);
  // while it is open: a file written (silinx.json lists it), the window follows
  await writeFile(page, 'src/b_new.v', 'module b_new; endmodule\n');
  await waitChanges(page, { title: 'Changes', lines: ['4 change(s) on main: a click compares a file with the last commit.', CONFLICT],
    files: ['C src/gates.vhd (in conflict)', 'M silinx.json (changed)', 'N src/a_new.v (new)', 'N src/b_new.v (new)'] }, 'the window following');
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await waitChanges(page, { title: 'Alterações', lines: ['4 alteração(ões) em main: um clique compara um ficheiro com o último commit.', '1 ficheiro(s) em conflito: resolva cada um e depois registe (commit).'],
      files: ['C src/gates.vhd (em conflito)', 'M silinx.json (alterado)', 'N src/a_new.v (novo)', 'N src/b_new.v (novo)'] }, 'the window in Portuguese');
    await page.waitFor(() => [...document.querySelectorAll('#collab-page .entry')].some((e) => e.textContent === '1 ficheiro(s) em conflito'), [], { what: 'the conflicts in Portuguese' });
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  // the merge aborted, the new files removed: no change, its line; the Repository box without the conflicts
  shLocked(dir, 'merge', '--abort');
  for (const f of ['a_new.v', 'b_new.v']) fs.rmSync(path.join(dir, 'src', f));
  shLocked(dir, 'checkout', '--quiet', '--', '.');
  await page.eval(async () => (await import('/js/git.js')).refreshGitStatus());
  await waitChanges(page, { title: 'Changes', lines: ['No change since the last commit.'], files: [] }, 'no change any more');
  await page.dialogButton('Close');
  await page.waitNoDialog();
  await waitBox(page, 'Git Repository', REPO_BOX(0, 0), 'no conflict any more');
  await noWarnings(page);
});

// Sharing (#3181, #4259) from the tab: the presence's label, who is in and its commands, the owner's and a follower's
uiTest('#4215 the Collaboration tab\'s Sharing: Share a Copy…, Share Live…, who is in, the commands, a follower\'s, Stop Sharing', E, async (page) => {
  await page.setViewport(1366, 768);
  await makeProject(env, { name: 'CollabLive', template: 'gates' });
  await page.openProject('CollabLive');
  await page.leftTab('collab');
  await waitBox(page, 'Sharing', NOT_LIVE().slice(1), 'not shared');
  // Share a Copy… (#4259): Share Project's window, A copy chosen
  await tabCommand(page, 'Share a Copy…');
  await page.waitDialog('Share Project');
  assert.deepEqual(await page.eval(() => ['copy', 'live'].map((w) => document.querySelector(`.dlg-overlay input[data-field=how-${w}]`).checked)), [true, false]);
  await page.dialogButton('Close');
  await page.waitNoDialog();
  // Share Live…: Share Project's window, Live chosen
  await tabCommand(page, 'Share Live…');
  await page.waitDialog('Share Project');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[data-field=how-live]').checked), true);
  await page.fill('.dlg-overlay input[data-field=name]', 'Ana');
  await page.dialogButton('Start Sharing');
  const link = await page.waitFor(() => (document.querySelector('.dlg-overlay .link-field:has([data-field=link]) .link-generate:not(:disabled)')?.click(), document.querySelector('.dlg-overlay input[data-field=link]')?.value) || null, [], { what: 'the link' });
  await page.dialogButton('Close');
  await page.waitNoDialog();
  await page.leftTab('collab');
  const OWNER = ['Show Sharing Link…', 'Renew Editor Link', 'Stop Sharing'];   // (no Add a User…, #5868)
  // (#4643: the mode at the top, this server's relay; each follower's path beside them, its relay's room: through it)
  const MODE = 'Live via the Silinx server\'s relay';
  await waitBox(page, 'Sharing', [MODE, 'Sharing', 'A Ana you', 'Share a Copy…', ...OWNER], 'sharing');
  // a follower: in the owner's box, a viewer; the follower's tab, read only, its own box
  const fp = await env.newPage(env.server.url);
  try {
    await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    const u = new URL(link);
    await fp.goto(`${u.origin}/?f=1${u.hash}`);
    await fp.waitDialog('Follow a Shared Project');
    await fp.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await fp.dialogButton('Follow');
    await fp.waitFor(() => window.Silinx?.project && window.Silinx.startupChecked, [], { what: 'the shared project open', timeout: 20000 });
    await waitBox(page, 'Sharing', [MODE, 'Sharing (1)', 'A Ana you', 'R Rui ViewerEditor Relay', 'Share a Copy…', ...OWNER], 'Rui in');
    const tag = () => page.eval(() => { const t = document.querySelector('#collab-page .collab-path'); return [document.querySelector('#collab-page .collab-mode').textContent, t.textContent, t.title, t.dataset.path]; });
    assert.deepEqual(await tag(), [MODE, 'Relay', 'Through the Silinx server\'s relay', 'relay']);
    // (in Portuguese: the mode, the tag and its tip)
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      await page.waitFor(() => document.querySelector('#collab-page .collab-path')?.textContent === 'Retransmissor', [], { what: 'the tag in Portuguese' });
      assert.deepEqual(await tag(), ['Em direto pelo retransmissor do servidor Silinx', 'Retransmissor', 'Através do retransmissor do servidor Silinx', 'relay']);
    } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
    // (no console line about Rui's path: his arrival only)
    assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /Rui/.test(l)).map((l) => l.trim()), ['Rui follows your project "CollabLive".']);
    await fp.leftTab('collab');
    // (browsing alone at first, on the link's module; Follow Ana from the tab follows her)
    await waitBox(fp, 'Sharing', ['Follow Ana', 'A Ana owner', 'R Rui you', 'Share a Copy…', 'Follow Ana', 'Stop Following'], 'the follower\'s');
    assert.equal(await fp.eval(() => [...document.querySelectorAll('#collab-page .collab-live .entry a')].find((a) => a.textContent === 'Share a Copy…').className), '');
    await tabCommand(fp, 'Follow Ana');
    await waitBox(fp, 'Sharing', ['Following Ana', 'A Ana owner', 'R Rui you', 'Share a Copy…', 'Follow Ana', 'Stop Following'], 'following');
    assert.equal(await fp.eval(() => document.querySelector('#collab-page .collab-readonly')?.textContent), 'Read-only, following Ana\'s project');
    // Stop Sharing from the owner's tab
    await tabCommand(page, 'Stop Sharing');
    await waitLog(page, /Stopped sharing "CollabLive": its followers no longer see it\./);
    await waitBox(page, 'Sharing', NOT_LIVE().slice(1), 'stopped');
    await fp.waitFor(() => document.querySelector('#collab-page .collab-live .entry')?.textContent === 'Not shared any more', [], { what: 'the follower told' });
  } finally { await fp.close(); }
  await noWarnings(page);
});

// #4643: a long list of participants folded (core/list-fold.js): an owner's 14 followers, as the presence shows them (a
// share peer to peer: its mode, their paths): its first ten, "5 more…"; all, "Show fewer"; in Portuguese
uiTest('#4643 the Sharing box\'s participants: the mode, each follower\'s path, a long list folded; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CollabMany', template: 'gates' });
  await page.openProject('CollabMany');
  await page.leftTab('collab');
  await page.eval(async () => {
    const { collab: c } = await import('/js/collab-state.js');
    c.role = 'owner';
    const peers = Array.from({ length: 14 }, (_, i) => ({ client: i + 2, name: `P${String(i).padStart(2, '0')}`, role: 'viewer', color: '#888', path: i % 2 ? 'relay' : 'p2p' }));
    (await import('/js/collab-presence.js')).renderPresence({ label: 'Sharing (14)', me: { name: 'Ana', role: 'owner', color: '#888', me: true }, peers, mode: 'p2p' });
  });
  try {
    const peersShown = () => page.eval(() => [...document.querySelectorAll('#collab-page .collab-peer')].map((e) => e.textContent));
    const fold = () => page.eval(() => document.querySelector('#collab-page .collab-fold')?.textContent ?? null);
    await page.waitFor(() => document.querySelector('#collab-page .collab-mode')?.textContent === 'Live peer to peer', [], { what: 'the mode' });
    assert.deepEqual(await peersShown(), ['AAnayou', ...Array.from({ length: 9 }, (_, i) => `PP0${i}viewer${i % 2 ? 'Relay' : 'P2P'}`)]);
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#collab-page .collab-path')].slice(0, 2).map((t) => t.title)), ['Peer to peer: directly between your browsers', 'Through the Silinx server\'s relay']);
    assert.equal(await fold(), '5 more…');
    await page.click('#collab-page .collab-fold');
    await page.waitFor(() => document.querySelectorAll('#collab-page .collab-peer').length === 15, [], { what: 'unfolded' });
    assert.equal(await fold(), 'Show fewer');
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      await page.waitFor(() => document.querySelector('#collab-page .collab-fold')?.textContent === 'Mostrar menos', [], { what: 'Show fewer in Portuguese' });
      assert.equal(await page.eval(() => document.querySelector('#collab-page .collab-mode').textContent), 'Em direto ponto a ponto');
      await page.click('#collab-page .collab-fold');
      await page.waitFor(() => document.querySelectorAll('#collab-page .collab-peer').length === 10, [], { what: 'folded again' });
      assert.equal(await fold(), 'Mais 5…');
    } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  } finally {
    await page.eval(async () => { const { collab: c } = await import('/js/collab-state.js'); c.role = null; (await import('/js/collab-presence.js')).renderPresence(); });
  }
  await noWarnings(page);
});

// #4646: the owner's Viewer | Editor on a follower's row, the change through the share's (a stub's here: the real one,
// test/ui/collab-roles.test.js); a share with no editors' key: Editor disabled, its tip saying why; in Portuguese
uiTest('#4646 the Sharing box\'s Viewer | Editor: a click asks the share to change the role; no editors\' key: Editor disabled, why in its tip', E, async (page) => {
  await makeProject(env, { name: 'CollabRoles', template: 'gates' });
  await page.openProject('CollabRoles');
  await page.leftTab('collab');
  const show = (editors) => page.eval(async (ed) => {
    const { collab: c } = await import('/js/collab-state.js');
    c.role = 'owner';
    window.__roles = [];
    const pr = await import('/js/collab-presence.js');
    pr.setPresenceRoles({ set: (peer, role) => { window.__roles.push([peer.name, role]); }, editors: () => ed });
    pr.renderPresence({ label: 'Sharing (2)', me: { name: 'Ana', role: 'owner', color: '#888', me: true }, peers: [{ client: 2, name: 'Eva', role: 'editor', color: '#888', path: 'p2p' }, { client: 3, name: 'Rui', role: 'viewer', color: '#888', path: 'relay' }], mode: 'server' });
  }, editors);
  const states = () => page.eval(() => [...document.querySelectorAll('#collab-page .collab-peer')].map((r) => [r.children[1].textContent, [...r.querySelectorAll('.collab-role-state')].map((b) => [b.textContent, b.getAttribute('aria-pressed'), b.title, b.disabled])]));
  try {
    await show(true);
    await page.waitFor(() => document.querySelectorAll('#collab-page .collab-roles').length === 2, [], { what: 'the controls' });
    assert.deepEqual(await states(), [['Ana', []],
      ['Eva', [['Viewer', 'false', 'Make Eva a Viewer', false], ['Editor', 'true', '', false]]],
      ['Rui', [['Viewer', 'true', '', false], ['Editor', 'false', 'Make Rui an Editor', false]]]]);
    // a click on the other state: the share asked; on the pressed one: nothing
    await page.eval(() => [...document.querySelectorAll('#collab-page .collab-peer')][2].querySelector('[data-role="editor"]').click());
    await page.eval(() => [...document.querySelectorAll('#collab-page .collab-peer')][1].querySelector('[data-role="editor"]').click());
    await page.eval(() => [...document.querySelectorAll('#collab-page .collab-peer')][1].querySelector('[data-role="viewer"]').click());
    assert.deepEqual(await page.eval(() => window.__roles), [['Rui', 'editor'], ['Eva', 'viewer']]);
    // no editors' key: Rui's Editor disabled, why in its tip; Eva (an editor) still made a viewer
    await show(false);
    await page.waitFor(() => document.querySelector('#collab-page .collab-role-state[disabled]'), [], { what: 'Editor disabled' });
    assert.deepEqual((await states())[2], ['Rui', [['Viewer', 'true', '', false], ['Editor', 'false', 'This share has no editors\' link: share it again to let editors in', true]]]);
    await page.eval(() => [...document.querySelectorAll('#collab-page .collab-peer')][2].querySelector('[data-role="editor"]').click());
    assert.deepEqual(await page.eval(() => window.__roles), []);
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      await page.waitFor(() => document.querySelector('#collab-page .collab-role-state')?.textContent === 'Espectador', [], { what: 'Portuguese' });
      assert.deepEqual((await states())[2], ['Rui', [['Espectador', 'true', '', false], ['Editor', 'false', 'Esta partilha não tem ligação de editores: partilhe-a de novo para deixar entrar editores', true]]]);
    } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  } finally {
    await page.eval(async () => { const { collab: c } = await import('/js/collab-state.js'); c.role = null; const pr = await import('/js/collab-presence.js'); pr.setPresenceRoles(null); pr.renderPresence(); });
  }
  await noWarnings(page);
});

// a narrow screen: the tab and its page in the drawer
uiTest('#4215 the Collaboration tab on a narrow screen', E, async (page) => {
  await makeProject(env, { name: 'CollabNarrow', template: 'gates' });
  await page.openProject('CollabNarrow');
  await page.setViewport(820, 1180);
  try {
    await page.leftTab('collab');
    await waitBox(page, 'Git Repository', [SERVER_GITHUB, 'The project is not in a git repository.', 'Open from GitHub Repository…', 'Store Project in a GitHub Repository…'], 'the Collaboration page');
    assert.ok((await collab(page)).shown);
    // no sideways scroll, the page inside the window
    assert.ok(await page.eval(() => document.getElementById('collab-page').getBoundingClientRect().right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth));
  } finally {
    await page.setViewport(1366, 768);
  }
  await noWarnings(page);
});

// the sections' order (#4636): Sharing first, then Git Repository (the relay's box between them is the browser edition's:
// test/ui/collab-no-project.test.js), with no project open and with one, in Portuguese too; no warnings
uiTest('#4636 the Collaboration tab: Sharing first, above Git Repository, with no project and with one', E, async (page) => {
  await page.setViewport(1366, 768);
  await page.eval(() => window.SilinxApp.closeProject?.());
  await page.leftTab('collab');
  const NO_PROJECT = [NOT_LIVE(true), ['Git Repository', SERVER_GITHUB, 'No project open.', 'Open from GitHub Repository…', 'Store Project in a GitHub Repository… (disabled)']];
  await waitBoxOf(page, 'Git Repository', [SERVER_GITHUB, 'No project open.', 'Open from GitHub Repository…', 'Store Project in a GitHub Repository…'], 'no project')   // (its marks: below)
    .catch(async (e) => { assert.deepEqual((await collab(page)).boxes, NO_PROJECT, e.message); throw e; });
  assert.deepEqual((await collab(page)).boxes, NO_PROJECT);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#collab-page .page > *')].map((e) => e.className)), ['start-box collab-live', 'start-box collab-repo']);
  await makeProject(env, { name: 'CollabOrder', template: 'gates' });
  await page.openProject('CollabOrder');
  await page.leftTab('collab');
  await waitBox(page, 'Git Repository', [SERVER_GITHUB, 'The project is not in a git repository.', 'Open from GitHub Repository…', 'Store Project in a GitHub Repository…'], 'a project');
  assert.deepEqual((await collab(page)).boxes, [NOT_LIVE(),
    ['Git Repository', SERVER_GITHUB, 'The project is not in a git repository.', 'Open from GitHub Repository…', 'Store Project in a GitHub Repository…']]);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor(() => document.querySelector('#collab-page .collab-repo h3')?.textContent === 'Repositório Git', [], { what: 'Portuguese' });
    assert.deepEqual((await collab(page)).boxes.map((b) => b[0]), ['Partilha', 'Repositório Git']);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  await noWarnings(page);
});
