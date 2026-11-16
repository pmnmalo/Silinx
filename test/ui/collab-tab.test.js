// UI: the Collaboration tab of the Design pane's row (#4215, web/js/collab-tab.js) in the server editions, against local
// bare repositories (no network: https://github.com/test/<repo> mapped to one, SILINX_UI_GIT_REMOTES of
// test/ui/serve.js), in both interfaces (SILINX_UI_INTERFACE): the tab after Teaching; no project open (Open from
// Repository… only); a project opened from a repository from the tab: its GitHub repository and branch, its changes with
// the Design pane's marks (a click compares one with the last commit), Commit…, Push to GitHub, Pull from GitHub,
// History… run from the tab, the File menu's items kept; a project with no repository: Initialize Repository… from the
// tab, then committed and pushed; a followed project's read-only notice; Live Sharing (Share Live… from the tab, who is
// in, the presence's commands, Stop Sharing; a follower's box); the ISE style's tabs all whole in its default side panel
// (330 px); in Portuguese; a narrow screen; no warnings.
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
const NOT_LIVE = (off = false) => ['Live Sharing', 'Not shared live.', `Share Live…${off ? ' (disabled)' : ''}`, 'To follow a project shared live, open its link.'];
const REPO_COMMANDS = ['Commit…', 'Push to GitHub', 'Pull from GitHub', 'History…'];

uiTest('#4215 the Collaboration tab: no project, a project opened from a repository from it, its changes, Commit…, Push, Pull, History…; read only when followed; Portuguese', E, async (page) => {
  bare('collab1');
  await page.setViewport(1366, 768);
  await page.eval(() => window.SilinxApp.closeProject?.());
  // the tab after Teaching, its label and icon
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#left-tabs .tab[data-page]')].map((t) => t.dataset.page).filter((p) => !['procs', 'emu'].includes(p))),
    ['start', 'design', 'files', 'libraries', 'teaching', 'collab']);
  assert.deepEqual(await page.eval(() => { const t = document.querySelector('#left-tabs .tab[data-page=collab]'); return [t.querySelector('.tab-lbl').textContent, !!t.querySelector('.tab-ico svg'), t.hidden]; }), ['Collaboration', true, false]);
  // (every tab in the row, none cut: the ISE style's names shown, the Silinx interface's icons)
  assert.deepEqual(await page.eval(() => { const row = document.getElementById('left-tabs').getBoundingClientRect();
    return [...document.querySelectorAll('#left-tabs .tab')].filter((t) => t.getClientRects().length).filter((t) => { const r = t.getBoundingClientRect(); return r.left < row.left - 1 || r.right > row.right + 1; }).map((t) => t.dataset.page); }), []);
  // no project: Open from Repository… only
  await page.leftTab('collab');
  await page.waitFor(() => document.querySelectorAll('#collab-page .start-box').length === 3, [], { what: 'the Collaboration page' });
  assert.deepEqual(await collab(page), { shown: true, boxes: [
    ['Repository', 'No project open.', 'Initialize Repository… (disabled)', 'Open from Repository…'],
    ['GitHub', SERVER_GITHUB, 'GitHub Checks (disabled)'], NOT_LIVE(true)] });
  // (the ISE style: every name whole in the side panel's default width, 330 px)
  if (await page.eval(() => document.documentElement.dataset.ui === 'ise')) {
    assert.equal(await page.eval(() => document.getElementById('left').getBoundingClientRect().width), 330);
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#left-tabs .tab-lbl')].filter((l) => l.getClientRects().length && l.scrollWidth > l.clientWidth).map((l) => l.textContent)), []);
  }
  // Open from Repository… from the tab: the project, its repository and branch, no change
  await tabCommand(page, 'Open from Repository…');
  await page.waitDialog('Open from Repository');
  await page.fill('.dlg-overlay .git-url', 'https://github.com/test/collab1');
  await page.dialogButton('Open');
  await page.waitNoDialog();
  await waitLog(page, /Project 'collab1' opened from the GitHub repository test\/collab1\./);
  await page.waitFor(() => window.Silinx.project?.name === 'collab1' && !!window.SilinxApp.S.git, [], { what: 'collab1 open, its status' });
  await page.leftTab('collab');
  await waitBox(page, 'Changes', ['No change since the last commit.'], 'no change');
  assert.deepEqual((await collab(page)).boxes, [
    ['Repository', 'GitHub: local/collab1', 'Branch: main', ...REPO_COMMANDS],
    ['Changes', 'No change since the last commit.'],
    ['GitHub', SERVER_GITHUB, 'GitHub Checks'], NOT_LIVE()]);
  assert.deepEqual(await page.eval(() => { const a = document.querySelector('#collab-page .collab-remote'); return [a.href, a.target, a.rel]; }), ['https://github.com/local/collab1', '_blank', 'noopener noreferrer']);
  // a change and a new file (silinx.json lists it): listed with the Design pane's marks and their tips
  const counter = await page.eval(async () => (await (await import('/js/api.js')).api.readFile('collab1', 'src/counter.v')));
  await writeFile(page, 'src/counter.v', `${counter}// changed\n`);
  await writeFile(page, 'src/extra.v', 'module extra; endmodule\n');
  await waitBox(page, 'Changes', ['M silinx.json', 'M src/counter.v', 'N src/extra.v'], 'the changes');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#collab-page .collab-file .git-mark')].map((m) => m.title)), ['Changed since the last commit', 'Changed since the last commit', 'New: not committed yet']);
  // a click: the file compared with the last commit, in a document of its own
  await page.click('#collab-page .collab-compare', { text: 'src/counter.v' });
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
  await waitBox(page, 'Changes', ['No change since the last commit.'], 'committed');
  await waitBox(page, 'Repository', ['GitHub: local/collab1', 'Branch: main', '1 commit(s) to push', ...REPO_COMMANDS], 'one commit to push');
  // Push to GitHub from the tab
  await tabCommand(page, 'Push to GitHub');
  await waitLog(page, /Pushed main to local\/collab1\./);
  await waitBox(page, 'Repository', ['GitHub: local/collab1', 'Branch: main', ...REPO_COMMANDS], 'pushed');
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
  for (const l of ['Open from Repository…']) assert.ok(file.includes(l), file.join(' | '));
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor(() => document.querySelector('#collab-page .start-box h3')?.textContent === 'Repositório', [], { what: 'Portuguese' });
    assert.deepEqual((await collab(page)).boxes, [
      ['Repositório', 'GitHub: local/collab1', 'Ramo: main', 'Registar (Commit)…', 'Enviar para o GitHub (Push)', 'Receber do GitHub (Pull)', 'Histórico…'],
      ['Alterações', 'Nenhuma alteração desde o último commit.'],
      ['GitHub', 'O git autentica-se no GitHub com as suas próprias credenciais.', 'Verificações do GitHub (Checks)'],
      ['Partilha em Direto', 'Não partilhado em direto.', 'Partilhar em Direto…', 'Para seguir um projeto partilhado em direto, abra a sua ligação.']]);
    assert.equal(await page.eval(() => document.querySelector('#left-tabs .tab[data-page=collab] .tab-lbl').textContent), 'Colaboração');
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  // a followed project (read only, #3181): the read-only notice, the Live Sharing box only (a real one: the next test)
  await page.eval(async () => { const { collab: c } = await import('/js/collab-state.js'); Object.assign(c, { role: 'follower', owner: 'Rui' }); (await import('/js/collab-tab.js')).renderCollabPage(); });
  try {
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#collab-page .page > *')].map((e) => e.querySelector('h3')?.textContent ?? e.textContent)), ['Read-only, following Rui\'s project', 'Live Sharing']);
    assert.equal(await page.eval(() => document.querySelectorAll('#collab-page .entry a').length), 0);
  } finally {
    await page.eval(async () => { const { collab: c } = await import('/js/collab-state.js'); Object.assign(c, { role: null, owner: '' }); (await import('/js/collab-tab.js')).renderCollabPage(); });
  }
  await noWarnings(page);
});

uiTest('#4215 the Collaboration tab: a project with no repository, Initialize Repository… from it, its remote, committed and pushed', E, async (page) => {
  bare('collab2', { seed: false });
  await page.setViewport(1366, 768);
  await makeProject(env, { name: 'CollabInit', template: 'gates' });
  await page.openProject('CollabInit');
  await page.leftTab('collab');
  await waitBox(page, 'Repository', ['The project is not in a git repository.', 'Initialize Repository…', 'Open from Repository…'], 'no repository');
  assert.deepEqual((await collab(page)).boxes.map((b) => b[0]), ['Repository', 'GitHub', 'Live Sharing']);
  // Initialize Repository… from the tab, with no GitHub repository: offered again, to give it one
  await tabCommand(page, 'Initialize Repository…');
  await page.waitDialog('Initialize Repository');
  await page.dialogButton('Initialize');
  await page.waitNoDialog();
  await waitLog(page, /Repository made for 'CollabInit'; \.gitignore written\./);
  await waitBox(page, 'Repository', ['No GitHub repository (origin).', 'Branch: main', 'Not pushed yet', ...REPO_COMMANDS, 'Initialize Repository…'], 'the repository, no remote');
  // its origin (the test server's local repositories stand for GitHub's, as a clone's: set with git)
  sh(path.join(env.server.workspace, 'CollabInit'), 'remote', 'add', 'origin', path.join(remotes, 'collab2.git'));
  await page.eval(async () => (await import('/js/git.js')).refreshGitStatus());
  // the repository, not pushed yet; every file new
  await waitBox(page, 'Repository', ['GitHub: local/collab2', 'Branch: main', 'Not pushed yet', ...REPO_COMMANDS], 'the repository');
  const changes = (await collab(page)).boxes.find((b) => b[0] === 'Changes').slice(1);
  assert.ok(changes.length > 2 && changes.every((c) => /^N /.test(c)) && changes.includes('N silinx.json') && changes.includes('N .gitignore'), changes.join(' | '));
  await tabCommand(page, 'Commit…');
  await page.waitDialog('Commit');
  await page.fill('.dlg-overlay .git-message', 'First');
  await page.dialogButton('Commit');
  await page.waitNoDialog();
  await waitBox(page, 'Changes', ['No change since the last commit.'], 'committed');
  await tabCommand(page, 'Push to GitHub');
  await waitLog(page, /Pushed main to local\/collab2\./);
  await waitBox(page, 'Repository', ['GitHub: local/collab2', 'Branch: main', ...REPO_COMMANDS], 'pushed');
  assert.equal(sh(path.join(remotes, 'collab2.git'), 'log', '--format=%s', 'main').trim(), 'First');
  await noWarnings(page);
});

// Live Sharing (#3181) from the tab: the presence's label, who is in and its commands, the owner's and a follower's
uiTest('#4215 the Collaboration tab\'s Live Sharing: Share Live…, who is in, the commands, a follower\'s, Stop Sharing', E, async (page) => {
  await page.setViewport(1366, 768);
  await makeProject(env, { name: 'CollabLive', template: 'gates' });
  await page.openProject('CollabLive');
  await page.leftTab('collab');
  await waitBox(page, 'Live Sharing', NOT_LIVE().slice(1), 'not shared');
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
  const OWNER = ['Copy View Link', 'Copy Editor Link', 'Add a User…', 'Stop Sharing'];
  await waitBox(page, 'Live Sharing', ['Sharing', 'A Ana you', ...OWNER], 'sharing');
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
    await waitBox(page, 'Live Sharing', ['Sharing (1)', 'A Ana you', 'R Rui viewer', 'Make Rui an Editor', ...OWNER], 'Rui in');
    await fp.leftTab('collab');
    // (browsing alone at first, on the link's module; Follow Ana from the tab follows her)
    await waitBox(fp, 'Live Sharing', ['Follow Ana', 'A Ana owner', 'R Rui you', 'Follow Ana', 'Stop Following'], 'the follower\'s');
    await tabCommand(fp, 'Follow Ana');
    await waitBox(fp, 'Live Sharing', ['Following Ana', 'A Ana owner', 'R Rui you', 'Follow Ana', 'Stop Following'], 'following');
    assert.equal(await fp.eval(() => document.querySelector('#collab-page .collab-readonly')?.textContent), 'Read-only, following Ana\'s project');
    // Stop Sharing from the owner's tab
    await tabCommand(page, 'Stop Sharing');
    await waitLog(page, /Stopped sharing "CollabLive": its followers no longer see it\./);
    await waitBox(page, 'Live Sharing', NOT_LIVE().slice(1), 'stopped');
    await fp.waitFor(() => document.querySelector('#collab-page .collab-live .entry')?.textContent === 'Not shared any more', [], { what: 'the follower told' });
  } finally { await fp.close(); }
  await noWarnings(page);
});

// a narrow screen: the tab and its page in the drawer
uiTest('#4215 the Collaboration tab on a narrow screen', E, async (page) => {
  await makeProject(env, { name: 'CollabNarrow', template: 'gates' });
  await page.openProject('CollabNarrow');
  await page.setViewport(820, 1180);
  try {
    await page.leftTab('collab');
    await waitBox(page, 'Repository', ['The project is not in a git repository.', 'Initialize Repository…', 'Open from Repository…'], 'the Collaboration page');
    assert.ok((await collab(page)).shown);
    // no sideways scroll, the page inside the window
    assert.ok(await page.eval(() => document.getElementById('collab-page').getBoundingClientRect().right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth));
  } finally {
    await page.setViewport(1366, 768);
  }
  await noWarnings(page);
});
