// UI: git's branches (#4213, web/js/git-branch.js) in the server editions, against local bare repositories
// (test/ui/serve.js maps https://github.com/test/<repo> to one), the traffic example. New Branch…: a name git refuses said
// beside the field, then the branch made and the project on it (the Collaboration tab's Branch). Merge Branch…: Rui's
// branch, whose same lines (a VHDL constant) Ana changed too: the merge stops (its ERROR and hint), the merge view opens
// with the two branches' names, Theirs chosen, merged by its lines and committed. Switch Branch… back to main: its files.
// In Portuguese: the commands, the dialogs and the tab. Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setupUi, uiTest, readWs, ROOT } from './harness.js';

let env, tmp, remotes;
const TIMER = 'src/timer.vhd';
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function bare(name) {
  const dir = path.join(remotes, `${name}.git`);
  fs.mkdirSync(dir, { recursive: true });
  sh(dir, 'init', '--quiet', '--bare');
  sh(dir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  const seed = path.join(tmp, 'seed', name);
  fs.cpSync(path.join(ROOT, 'examples', 'traffic'), seed, { recursive: true });
  sh(seed, 'init', '--quiet');
  sh(seed, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  sh(seed, 'add', '-A');
  sh(seed, 'commit', '--quiet', '-m', 'Starter');
  sh(seed, 'push', '--quiet', dir, 'main');
}
// Rui's change of a file on his branch, pushed
function ruis(name, file, fn) {
  const dir = path.join(tmp, 'rui', name);
  sh(tmp, 'clone', '--quiet', path.join(remotes, `${name}.git`), dir);
  sh(dir, 'switch', '--quiet', '-c', 'rui');
  const f = path.join(dir, file);
  fs.writeFileSync(f, fn(fs.readFileSync(f, 'utf8')));
  sh(dir, 'commit', '--quiet', '-am', 'Rui');
  sh(dir, 'push', '--quiet', 'origin', 'rui');
}

before(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ui-git-branch-')));
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
const warnings = page => page.console.filter(c => c.type === 'warning' || c.type === 'warn').map(c => c.text);
const open = async (page, name) => {
  bare(name);
  page.project = name;
  await page.menu('File', 'Open from GitHub Repository…');
  await page.waitDialog('Open from GitHub Repository');
  await page.fill('.dlg-overlay .git-url', `https://github.com/test/${name}`);
  await page.dialogButton('Open');
  await page.waitNoDialog();
  await page.waitFor(n => window.Silinx.project?.name === n && document.querySelector('#hier .row'), [name], { what: `${name} open` });
};
const CARS = n => t => t.replace('CARS_S   : integer := 5;', `CARS_S   : integer := ${n};`);
// the Collaboration tab's branch, and its branch commands
const tab = page => page.waitFor(() => document.querySelector('#collab-page .collab-branch') && {
  branch: document.querySelector('#collab-page .collab-branch').textContent,
  commands: [...document.querySelectorAll('#collab-page .collab-repo .entry a')].map(a => a.textContent).filter(l => /Branch|Ramo/.test(l)),
}, [], { what: 'the Collaboration tab\'s branch' });
// a dialog's choices of branches and its fields' labels
const choices = page => page.eval(() => {
  const d = [...document.querySelectorAll('.dlg-overlay')].pop();
  return { labels: [...d.querySelectorAll('.form-grid > label')].map(l => l.textContent), now: d.querySelector('.git-branch-now')?.textContent,
    options: [...d.querySelectorAll('.git-branch-choice option')].map(o => o.value), hint: d.querySelector('.dlg-body > div > .hint')?.textContent };
});

uiTest('#4213 New Branch…, Merge Branch… through the merge view, Switch Branch…', E, async page => {
  await open(page, 'branches');
  assert.deepEqual(await tab(page), { branch: 'main', commands: ['New Branch…', 'Switch Branch…', 'Merge Branch…'] });
  // New Branch…: a name git refuses said beside the field
  await page.menu('File', 'New Branch…');
  await page.waitDialog('New Branch');
  await page.fill('.dlg-overlay .git-branch-name', 'ana lima');
  await page.dialogButton('Create');
  await page.waitFor(() => document.querySelector('.dlg-overlay .git-branch-error')?.textContent === '\'ana lima\' is not a valid branch name', [], { what: 'the name refused' });
  await page.fill('.dlg-overlay .git-branch-name', 'ana');
  await page.dialogButton('Create');
  await page.waitNoDialog();
  await page.waitConsole(/Branch ana made from main: the project is on it now; Push sends it to GitHub\./);
  await page.waitFor(() => document.querySelector('#collab-page .collab-branch')?.textContent === 'ana', [], { what: 'the tab on ana' });
  // Ana's change, committed and pushed; Rui's of the same lines on his branch
  await page.eval(async (p, t) => { const { api } = await import('/js/api.js'); await api.writeFile(window.Silinx.project.name, p, t); await api.gitCommit(window.Silinx.project.name, 'Ana: cars'); },
    TIMER, CARS(8)(await readWs(env, 'branches', TIMER)));
  await page.menu('File', 'Push to GitHub');
  await page.waitConsole(/Pushed ana to local\/branches\./);
  ruis('branches', TIMER, CARS(6));
  // Merge Branch…: Rui's branch listed (fetched), the project's own not
  await page.menu('File', 'Merge Branch…');
  await page.waitDialog('Merge Branch');
  assert.deepEqual(await choices(page), { labels: ['Branch of the project:', 'Merge in:'], now: 'ana', options: ['main', 'rui'],
    hint: 'What only the other branch changed is taken; a drawing changed on both is merged by its objects, a file by its lines; for the same objects or lines, you choose. Commit your changes first.' });
  await page.eval(() => { document.querySelector('.dlg-overlay .git-branch-choice').value = 'rui'; });
  await page.dialogButton('Merge');
  await page.waitConsole(/ERROR: git merge: a conflict in src\/timer\.vhd: nothing was merged, the project's files are as they were\nHint: The same lines of a file changed on both branches: choose mine, theirs or both for each conflict, or write its lines, then Merge Branch… again\.\nMerge: 1 conflict\(s\) in 1 file\(s\), the same lines changed on both sides: choose Mine, Theirs or Both for each, or edit its lines, then Merge Branch\./, { timeout: 30000 });   // (the merge fetches rui's branch first: a loaded runner's longer, #5003)
  const v = await page.waitFor(() => document.querySelector('.merge-view .merge-choice') && {
    tab: window.SilinxApp.S.active?.title,
    bar: [...document.querySelectorAll('.merge-bar button')].map(b => b.textContent),
    heads: [...document.querySelectorAll('.merge-sides th')].map(x => x.textContent),
  }, [], { what: 'the merge view' });
  assert.deepEqual(v, { tab: 'Merge Branch (merge)', bar: ['Previous Conflict', 'Next Conflict', 'Merge Branch', 'Cancel'], heads: ['Common Ancestor', 'Mine (ana)', 'Theirs (rui)'] });
  await page.click('.merge-choice[data-id=h1] .merge-pick-theirs');
  await page.click('.merge-bar [data-cmd=apply]');
  await page.waitConsole(/Merged rui into ana: 1 file\(s\) changed\.\n {2}src\/timer\.vhd\nsrc\/timer\.vhd: merged by its lines\./);
  assert.equal(await page.eval(() => !!document.querySelector('.merge-view')), false, 'the merge view closed');
  const timer = await readWs(env, 'branches', TIMER);
  assert.match(timer, /CARS_S {3}: integer := 6;/);
  assert.doesNotMatch(timer, /^(<<<<<<<|=======|>>>>>>>)/m);
  const st = await page.eval(async () => (await import('/js/api.js')).api.gitStatus(window.Silinx.project.name));
  assert.deepEqual([st.branch, st.files, st.ahead], ['ana', [], 2]);
  // Switch Branch… back to main: its files
  await page.menu('File', 'Switch Branch…');
  await page.waitDialog('Switch Branch');
  assert.deepEqual(await choices(page), { labels: ['Branch of the project:', 'Switch to:'], now: 'ana', options: ['main', 'rui'],
    hint: 'The project\'s files become the branch\'s last commit\'s. Commit your changes first.' });
  await page.dialogButton('Switch');
  await page.waitConsole(/Switched to main: 2 file\(s\) changed\.\n {2}\.gitignore\n {2}src\/timer\.vhd/);   // (Ana's first commit wrote Silinx's .gitignore)
  await page.waitFor(() => document.querySelector('#collab-page .collab-branch')?.textContent === 'main', [], { what: 'the tab on main' });
  assert.match(await readWs(env, 'branches', TIMER), /CARS_S {3}: integer := 5;/);
  assert.ok(!(await page.consoleText()).includes('WARNING'));
  assert.deepEqual(warnings(page), []);
}, { timeout: 150000 });

uiTest('#4213 the branches in Portuguese: the commands, New Branch…\'s and Switch Branch…\'s dialogs, the tab', E, async page => {
  await open(page, 'ramos');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor(() => document.querySelector('#collab-page .collab-repo h3')?.textContent === 'Repositório Git', [], { what: 'the tab in Portuguese' });
    assert.deepEqual(await tab(page), { branch: 'main', commands: ['Novo Ramo…', 'Mudar de Ramo…', 'Juntar Ramo…'] });
    await page.menu('Ficheiro', 'Novo Ramo…');
    await page.waitDialog('Novo Ramo');
    const d = await page.eval(() => { const x = [...document.querySelectorAll('.dlg-overlay')].pop(); return { label: x.querySelector('.form-grid > label').textContent, hint: x.querySelector('.dlg-body > div > .hint').textContent, buttons: [...x.querySelectorAll('.dlg-buttons .btn')].map(b => b.textContent) }; });
    assert.deepEqual(d, { label: 'Nome do novo ramo:', hint: 'Cada pessoa de um grupo trabalha num ramo seu, feito a partir do último commit: o projeto passa para ele, com as suas alterações.', buttons: ['Criar', 'Cancelar'] });
    await page.fill('.dlg-overlay .git-branch-name', 'ana');
    await page.dialogButton('Criar');
    await page.waitNoDialog();
    await page.waitFor(() => document.querySelector('#collab-page .collab-branch')?.textContent === 'ana', [], { what: 'the tab on ana' });
    await page.menu('Ficheiro', 'Mudar de Ramo…');
    await page.waitDialog('Mudar de Ramo');
    assert.deepEqual(await choices(page), { labels: ['Ramo do projeto:', 'Mudar para:'], now: 'ana', options: ['main'],
      hint: 'Os ficheiros do projeto passam a ser os do último commit do ramo. Registe (commit) primeiro as suas alterações.' });
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.deepEqual(warnings(page), []);
}, { timeout: 120000 });
