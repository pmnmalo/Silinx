// UI: Open from GitHub Repository…'s list of the user's repositories (#4653, web/js/git-repo-list.js) in the server
// editions, through GitHub's command line (test/fake-gh.mjs, SILINX_UI_GH: no network) and local bare repositories as
// the remotes (SILINX_UI_GIT_REMOTES). The list, the last pushed first; filtered as the address is typed (none matching
// said); a click puts the address and the project's name in, and Open clones it; the arrows onto the list pick too;
// gh not signed in: not listed, the console says why and how, the address still typed. In Portuguese. Both interfaces;
// each step's console lines exact; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setupUi, uiTest, ROOT } from './harness.js';

let env, tmp, remotes, reposFile;
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function bare(name) {
  const dir = path.join(remotes, `${name}.git`);
  fs.mkdirSync(dir, { recursive: true });
  sh(dir, 'init', '--quiet', '--bare');
  sh(dir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  const seed = path.join(tmp, 'seed', name);
  fs.cpSync(path.join(ROOT, 'examples', 'blinky'), seed, { recursive: true });
  sh(seed, 'init', '--quiet');
  sh(seed, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  sh(seed, 'add', '-A');
  sh(seed, 'commit', '--quiet', '-m', 'Starter');
  sh(seed, 'push', '--quiet', dir, 'main');
}
const repo = (full, more = {}) => ({ full_name: full, html_url: `https://github.com/${full}`, private: false, description: null, pushed_at: '2026-11-19T10:00:00Z', ...more });
const REPOS = [repo('test/lab2', { private: true, description: 'Traffic lights' }), repo('test/lab1'), repo('isel-sd/pong-ana', { private: true })];
const setRepos = (data) => fs.writeFileSync(reposFile, JSON.stringify(data));

before(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ui-repos-')));
  remotes = path.join(tmp, 'remotes');
  reposFile = path.join(tmp, 'repos.json');
  setRepos(REPOS);
  fs.writeFileSync(path.join(tmp, 'gitconfig'), '[user]\n\tname = Ana Aluna\n\temail = ana@example.com\n[init]\n\tdefaultBranch = main\n');
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: path.join(tmp, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', SILINX_UI_GIT_REMOTES: remotes,
    SILINX_UI_GH: path.join(ROOT, 'test', 'fake-gh.mjs'), FAKE_GH_REPOS: reposFile });
  env = await setupUi();
});
after(async () => {
  await env?.teardown?.();
  for (const k of ['SILINX_UI_GIT_REMOTES', 'SILINX_UI_GH', 'FAKE_GH_REPOS']) delete process.env[k];
  fs.rmSync(tmp, { recursive: true, force: true });
});
const E = () => env;
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
// the list as shown: its status line and its rows (the selected one marked *)
const shown = (page) => page.eval(() => ({
  status: document.querySelector('.dlg-overlay .git-repos-status').textContent,
  rows: [...document.querySelectorAll('.dlg-overlay .git-repo')].map((li) => `${li.textContent}${li.getAttribute('aria-selected') === 'true' ? ' *' : ''}`),
}));
const fields = (page) => page.eval(() => [document.querySelector('.dlg-overlay .git-url').value, document.querySelector('.dlg-overlay .git-name').value]);
async function openDialog(page, { menu = 'File', item = 'Open from GitHub Repository…', title = 'Open from GitHub Repository' } = {}) {
  await page.menu(menu, item);
  await page.waitDialog(title);
  await page.waitFor(() => !/…$/.test(document.querySelector('.dlg-overlay .git-repos-status')?.textContent || '…'), [], { what: 'the list read' });
}

uiTest('#4653 Open from GitHub Repository…: the user\'s repositories listed, filtered as typed, one picked (a click, the arrows) and opened', E, async (page) => {
  bare('lab1');
  const n0 = (await page.consoleText()).length;
  // (the list's box marked data-loading as the dialog opens, until the list comes: a click on a button waits for it, #4816)
  await page.eval(() => { window.__loading = null; new MutationObserver(() => { const b = document.querySelector('.dlg-overlay .git-repos-box'); if (b && window.__loading === null) window.__loading = b.hasAttribute('data-loading'); }).observe(document.body, { childList: true, subtree: true }); });
  await openDialog(page);
  assert.deepEqual(await page.eval(() => [window.__loading, document.querySelector('.dlg-overlay .git-repos-box').hasAttribute('data-loading')]), [true, false]);
  assert.deepEqual(await shown(page), { status: '3 of your 3 GitHub repositories, the most recently pushed first:', rows: ['test/lab2(private)', 'test/lab1', 'isel-sd/pong-ana(private)'] });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .git-repo').title), 'test/lab2 (private): Traffic lights');
  // typed: filtered (a name, a description); nothing matching said, the address kept
  await page.fill('.dlg-overlay .git-url', 'LAB');
  assert.deepEqual((await shown(page)).rows, ['test/lab2(private)', 'test/lab1']);
  await page.fill('.dlg-overlay .git-url', 'traffic');
  assert.deepEqual(await shown(page), { status: '1 of your 3 GitHub repositories, the most recently pushed first:', rows: ['test/lab2(private)'] });
  await page.fill('.dlg-overlay .git-url', 'https://github.com/someone/else');
  assert.deepEqual(await shown(page), { status: 'None of your GitHub repositories has this: its address is opened as it is.', rows: [] });
  // the arrows: from the field onto the list, each row picked as it is reached; the list as it was
  await page.fill('.dlg-overlay .git-url', '');
  await page.eval(() => document.querySelector('.dlg-overlay .git-url').focus());
  await page.key('ArrowDown');
  assert.deepEqual(await fields(page), ['https://github.com/test/lab2', 'lab2']);
  await page.key('ArrowDown');
  assert.deepEqual(await fields(page), ['https://github.com/test/lab1', 'lab1']);
  assert.deepEqual((await shown(page)).rows, ['test/lab2(private)', 'test/lab1 *', 'isel-sd/pong-ana(private)']);
  await page.key('ArrowUp');
  await page.key('ArrowUp');
  assert.equal(await page.eval(() => document.activeElement.classList.contains('git-url')), true);
  // a click: its address and its name; Open clones it
  await page.click('.dlg-overlay .git-repo[data-repo="test/lab1"]');
  assert.deepEqual(await fields(page), ['https://github.com/test/lab1', 'lab1']);
  await page.dialogButton('Open');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'lab1', [], { what: 'lab1 open' });
  await page.waitConsole(/Project "lab1" opened \(/);
  const lines = (await page.consoleText()).slice(n0).trim().split('\n').filter((l) => !/Xilinx ISE and programming a board or a PROM run only once you trust it/.test(l));
  assert.deepEqual(lines, ['Cloning https://github.com/test/lab1…', 'Project \'lab1\' opened from the GitHub repository test/lab1.', 'Project "lab1" opened (xc3s250e-4-cp132).']);
  assert.ok(!/WARNING|ERROR/.test(await page.consoleText()), 'no warning nor error in the console');
  assert.deepEqual(warnings(page), []);
}, { timeout: 120000 });

uiTest('#4653 gh not signed in: not listed, the console says why and how, the address typed; none at all; in Portuguese', E, async (page) => {
  setRepos({ mode: 'signed-out' });
  const n0 = (await page.consoleText()).length;
  await openDialog(page);
  assert.deepEqual(await shown(page), { status: 'Your GitHub repositories are not listed (the console says why): type the address.', rows: [] });
  await page.waitConsole(/Hint: Sign in with gh auth login/);
  assert.deepEqual((await page.consoleText()).slice(n0).trim().split('\n'), [
    'Your repositories are not listed: GitHub\'s command line (gh) is not signed in.',
    'Hint: Sign in with gh auth login, or set GH_TOKEN before starting Silinx; or type the repository\'s address.']);
  await page.fill('.dlg-overlay .git-url', 'https://github.com/test/lab1');
  assert.deepEqual(await fields(page), ['https://github.com/test/lab1', 'lab1']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // none at all
  setRepos([]);
  await openDialog(page);
  assert.deepEqual(await shown(page), { status: 'You have no GitHub repository: type its address.', rows: [] });
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // in Portuguese
  setRepos(REPOS);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await openDialog(page, { menu: 'Ficheiro', item: 'Abrir do Repositório GitHub…', title: 'Abrir do Repositório GitHub' }).catch(async (e) => {
    if (!/no item/.test(e.message)) throw e;
    await openDialog(page, { menu: 'Ficheiro', item: 'Open from GitHub Repository…', title: 'Abrir do Repositório GitHub' });
  });
  assert.deepEqual(await shown(page), { status: '3 dos seus 3 repositórios do GitHub, os enviados mais recentemente primeiro:', rows: ['test/lab2(privado)', 'test/lab1', 'isel-sd/pong-ana(privado)'] });
  await page.fill('.dlg-overlay .git-url', 'nada');
  assert.equal((await shown(page)).status, 'Nenhum dos seus repositórios do GitHub tem isto: o endereço é aberto tal como está.');
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  setRepos({ mode: 'signed-out' });
  await openDialog(page, { menu: 'Ficheiro', item: 'Abrir do Repositório GitHub…', title: 'Abrir do Repositório GitHub' }).catch(async (e) => {
    if (!/no item/.test(e.message)) throw e;
    await openDialog(page, { menu: 'Ficheiro', item: 'Open from GitHub Repository…', title: 'Abrir do Repositório GitHub' });
  });
  assert.equal((await shown(page)).status, 'Os seus repositórios do GitHub não estão listados (a consola diz porquê): escreva o endereço.');
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  setRepos(REPOS);
  assert.ok(!/WARNING|ERROR/.test(await page.consoleText()), 'no warning nor error in the console');
  assert.deepEqual(warnings(page), []);
}, { timeout: 120000 });
