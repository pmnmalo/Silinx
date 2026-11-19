// UI: Open from GitHub Repository… onto a project of the same name (#4618, web/js/git-clone-exists.js) against local bare
// repositories (no network: the server maps https://github.com/test/<repo> to one, SILINX_UI_GIT_REMOTES of
// test/ui/serve.js): a question rather than the old error. Its text (the same repository or not; what a replace would
// lose; the free name); Cancel; Open and Pull; Open; Keep Both (a name taken said beside its field); Replace with nothing
// to lose (no second question, the old project in .trash); Replace with a change (the second question naming it:
// cancelled, the change kept; then confirmed, replaced); another repository onto the name (no Open and Pull); in
// Portuguese. Each step's console lines exact; no warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setupUi, uiTest, readWs, ROOT } from './harness.js';

let env, tmp, remotes;
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
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ui-git-exists-')));
  remotes = path.join(tmp, 'remotes');
  fs.writeFileSync(path.join(tmp, 'gitconfig'), '[user]\n\tname = Ana Aluna\n\temail = ana@example.com\n[init]\n\tdefaultBranch = main\n');
  // GitHub's command line, the stand-in's (#4666): the user has no repository, so Open from GitHub Repository…'s list
  // says nothing in the console, whatever gh the machine has
  fs.writeFileSync(path.join(tmp, 'repos.json'), '[]');
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: path.join(tmp, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', SILINX_UI_GIT_REMOTES: remotes,
    SILINX_UI_GH: path.join(ROOT, 'test', 'fake-gh.mjs'), FAKE_GH_REPOS: path.join(tmp, 'repos.json') });
  env = await setupUi();
});
after(async () => {
  await env?.teardown?.();
  for (const k of ['SILINX_UI_GIT_REMOTES', 'SILINX_UI_GH', 'FAKE_GH_REPOS']) delete process.env[k];
  fs.rmSync(tmp, { recursive: true, force: true });
});
const E = () => env;
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const writeFile = (page, rel, text) => page.eval(async (p, t) => { const { api } = await import('/js/api.js'); await api.writeFile(window.Silinx.project.name, p, t); }, rel, text);
const ws = (...p) => path.join(env.server.workspace, ...p);
const trash = () => (fs.existsSync(ws('.trash')) ? fs.readdirSync(ws('.trash')).map((n) => n.replace(/-\d+$/, '')).sort() : []);
const OPENED = (name) => `Project "${name}" opened (xc3s250e-4-cp132).`;
const UNTRUSTED = /Project "[^"]+" .*Xilinx ISE and programming a board or a PROM run only once you trust it[^\n]*\n?/g;

// File ▸ Open from GitHub Repository…, the address (and a name) given, Open; -> the console's length before
async function openRepo(page, url, name = null, { title = 'Open from GitHub Repository', open = 'Open' } = {}) {
  const n = (await page.consoleText()).length;
  await page.menu(title === 'Open from GitHub Repository' ? 'File' : 'Ficheiro', `${title}…`);
  await page.waitDialog(title);
  await page.fill('.dlg-overlay .git-url', url);
  if (name) await page.fill('.dlg-overlay .git-name', name);
  await page.dialogButton(open);
  return n;
}
// the question's text and buttons
const question = (page) => page.eval(() => {
  const d = [...document.querySelectorAll('.dlg-overlay')].pop();
  return {
    title: d.querySelector('.dlg-title span').textContent,
    text: [...d.querySelectorAll('.git-exists-text, .git-exists-repo')].map((e) => e.textContent),
    loss: d.querySelector('.git-exists-loss li') ? [...d.querySelectorAll('.git-exists-loss li')].map((e) => e.textContent) : d.querySelector('.git-exists-loss').textContent,
    name: d.querySelector('.git-other-name').value,
    buttons: [...d.querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent),
  };
});
// the console's lines since n, once `re` is among them (the untrusted project's notice left out)
async function linesSince(page, n, re) {
  await page.waitFor((k, s) => new RegExp(s).test(window.__console().slice(k)), [n, re.source], { what: `console ${re}` });
  // (the watcher's line of a pulled file comes when it notices it, in this step or a later one: asserted apart)
  return (await page.consoleText()).slice(n).replace(UNTRUSTED, '').replace(/^Changed outside Silinx: .*\n?/gm, '').trim().split('\n');
}

uiTest('#4618 Open from GitHub Repository… onto a project of the name: Cancel, Open and Pull, Open, Keep Both, Replace (with and without changes)', E, async (page) => {
  bare('lab1');
  let n = await openRepo(page, 'https://github.com/test/lab1');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'lab1', [], { what: 'lab1 open' });
  await page.waitConsole(/Project "lab1" opened \(/);
  // the same repository again: the question, not the old error
  n = await openRepo(page, 'https://github.com/test/lab1');
  await page.waitDialog('Project Already Exists');
  assert.deepEqual(await question(page), {
    title: 'Project Already Exists',
    text: ['A project named \'lab1\' already exists.', 'It is a clone of test/lab1: Open and Pull brings it up to date.'],
    loss: 'Replacing it loses nothing: every change is committed and pushed.', name: 'lab1-2',
    buttons: ['Open and Pull', 'Open', 'Replace', 'Keep Both', 'Cancel'],
  });
  assert.ok(!/already exists/.test((await page.consoleText()).slice(n)), 'no error in the console');
  // Cancel
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(await linesSince(page, n, /cancelled/), ['Cloning https://github.com/test/lab1…', 'Open from GitHub Repository cancelled: project \'lab1\' kept as it is.']);
  // Open and Pull: GitHub's new commit pulled into it
  theirs('lab1', 'src/sevenseg.v', '// theirs\n');
  n = await openRepo(page, 'https://github.com/test/lab1');
  await page.waitDialog('Project Already Exists');
  await page.dialogButton('Open and Pull');
  assert.deepEqual(await linesSince(page, n, /Pulled into main/), ['Cloning https://github.com/test/lab1…',
    'Project \'lab1\' already exists: opened as it is; it is a clone of test/lab1, which Pull brings up to date.', OPENED('lab1'),
    'Pulled into main: 1 file(s) changed.', '  src/sevenseg.v']);
  assert.equal(await readWs(env, 'lab1', 'src/sevenseg.v'), '// theirs\n');
  // Open: as it is
  n = await openRepo(page, 'https://github.com/test/lab1');
  await page.waitDialog('Project Already Exists');
  await page.dialogButton('Open');
  await page.waitNoDialog();
  assert.deepEqual(await linesSince(page, n, /Project "lab1" opened \(/), ['Cloning https://github.com/test/lab1…', 'Project \'lab1\' already exists: opened as it is; it is a clone of test/lab1, which Pull brings up to date.', OPENED('lab1')]);
  // Keep Both: a name taken said beside its field; then another
  n = await openRepo(page, 'https://github.com/test/lab1');
  await page.waitDialog('Project Already Exists');
  await page.fill('.dlg-overlay .git-other-name', 'lab1');
  await page.dialogButton('Keep Both');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .git-other-name-error')?.textContent, [], { what: 'the name\'s error' });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .git-other-name-error').textContent), 'A project named \'lab1\' already exists: choose another name.');
  await page.fill('.dlg-overlay .git-other-name', 'lab1_copy');
  await page.dialogButton('Keep Both');
  await page.waitNoDialog();
  assert.deepEqual(await linesSince(page, n, /Project "lab1_copy" opened \(/), ['Cloning https://github.com/test/lab1…',
    'Project \'lab1\' kept as it is: the repository opened as \'lab1_copy\'.', 'Project \'lab1_copy\' opened from the GitHub repository test/lab1.', OPENED('lab1_copy')]);
  await page.waitFor(() => window.Silinx.project?.name === 'lab1_copy', [], { what: 'lab1_copy open' });
  assert.ok(fs.existsSync(ws('lab1', 'silinx.json')));
  // Replace, nothing to lose: no second question; the old one in .trash
  n = await openRepo(page, 'https://github.com/test/lab1');
  await page.waitDialog('Project Already Exists');
  await page.dialogButton('Replace');
  await page.waitNoDialog();
  assert.deepEqual(await linesSince(page, n, /Project "lab1" opened \(/), ['Cloning https://github.com/test/lab1…',
    'Project \'lab1\' replaced (the old one is in the workspace .trash folder).', 'Project \'lab1\' opened from the GitHub repository test/lab1.', OPENED('lab1')]);
  assert.deepEqual(trash(), ['lab1']);
  // a change: the loss named; Replace asks again, naming it: Cancel keeps it
  await page.waitFor(() => window.Silinx.project?.name === 'lab1', [], { what: 'lab1 open' });
  await writeFile(page, 'src/counter.v', '// mine\n');
  n = await openRepo(page, 'https://github.com/test/lab1');
  await page.waitDialog('Project Already Exists');
  assert.deepEqual((await question(page)).loss, ['1 uncommitted change(s)']);
  await page.dialogButton('Replace');
  await page.waitDialog('Replace Project');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .git-replace .msg-text > *')].map((e) => e.textContent)),
    ['Replace \'lab1\' with the repository\'s project? It has what is nowhere else:', '1 uncommitted change(s)', 'The old project is moved to the workspace .trash folder.']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(await linesSince(page, n, /cancelled/), ['Cloning https://github.com/test/lab1…', 'Open from GitHub Repository cancelled: project \'lab1\' kept as it is.']);
  assert.equal(await readWs(env, 'lab1', 'src/counter.v'), '// mine\n');
  // confirmed: replaced (the open project closed first, then the clone opened)
  n = await openRepo(page, 'https://github.com/test/lab1');
  await page.waitDialog('Project Already Exists');
  await page.dialogButton('Replace');
  await page.waitDialog('Replace Project');
  await page.dialogButton('Replace');
  await page.waitNoDialog();
  assert.deepEqual(await linesSince(page, n, /Project "lab1" opened \(/), ['Cloning https://github.com/test/lab1…',
    'Project \'lab1\' replaced (the old one is in the workspace .trash folder): it had 1 uncommitted change(s).', 'Project \'lab1\' opened from the GitHub repository test/lab1.', OPENED('lab1')]);
  assert.equal(await readWs(env, 'lab1', 'src/counter.v'), fs.readFileSync(path.join(ROOT, 'examples', 'blinky', 'src', 'counter.v'), 'utf8'));
  assert.deepEqual(trash(), ['lab1', 'lab1']);
  await page.waitFor(() => window.Silinx.project?.name === 'lab1', [], { what: 'lab1 open again' });
  assert.ok((await page.consoleText()).split('\n').filter((l) => /^Changed outside Silinx/.test(l)).every((l) => l === 'Changed outside Silinx: src/sevenseg.v.'), 'only the pulled file changed outside');
  assert.ok(!/WARNING|ERROR/.test(await page.consoleText()), 'no warning nor error in the console');
  assert.deepEqual(warnings(page), []);
}, { timeout: 120000 });

uiTest('#4618 another repository onto the name: not the same one (no Open and Pull); the question in Portuguese', E, async (page) => {
  bare('lab2');
  bare('other');
  await openRepo(page, 'https://github.com/test/lab2');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'lab2', [], { what: 'lab2 open' });
  await page.waitConsole(/Project "lab2" opened \(/);
  await openRepo(page, 'https://github.com/test/other', 'lab2');
  await page.waitDialog('Project Already Exists');
  assert.deepEqual(await question(page), {
    title: 'Project Already Exists',
    text: ['A project named \'lab2\' already exists.', 'It is not a clone of test/other.'],
    loss: 'Replacing it loses nothing: every change is committed and pushed.', name: 'lab2-2',
    buttons: ['Open', 'Replace', 'Keep Both', 'Cancel'],
  });
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await writeFile(page, 'src/counter.v', '// mine\n');
  await openRepo(page, 'https://github.com/test/lab2', null, { title: 'Abrir do Repositório GitHub', open: 'Abrir' });
  await page.waitDialog('O Projeto Já Existe');
  assert.deepEqual(await question(page), {
    title: 'O Projeto Já Existe',
    text: ['Já existe um projeto chamado \'lab2\'.', 'É um clone de test/lab2: Abrir e Receber (Pull) atualiza-o.'],
    loss: ['1 alteração(ões) sem commit'], name: 'lab2-2',
    buttons: ['Abrir e Receber (Pull)', 'Abrir', 'Substituir', 'Manter os Dois', 'Cancelar'],
  });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .git-exists-loss > div').textContent), 'Substituí-lo perderia:');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .form-grid label').textContent), 'Manter os dois, o repositório como:');
  await page.dialogButton('Substituir');
  await page.waitDialog('Substituir Projeto');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .git-replace .msg-text > *')].map((e) => e.textContent)),
    ['Substituir \'lab2\' pelo projeto do repositório? Tem o que não está em mais lado nenhum:', '1 alteração(ões) sem commit', 'O projeto antigo é movido para a pasta .trash da pasta de trabalho.']);
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.equal(await readWs(env, 'lab2', 'src/counter.v'), '// mine\n');
  assert.ok(!/WARNING|ERROR/.test(await page.consoleText()), 'no warning nor error in the console');
  assert.deepEqual(warnings(page), []);
}, { timeout: 120000 });
