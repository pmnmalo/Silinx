// UI: a pull whose text files changed on both sides (#4214, web/js/git.js, web/js/merge-view.js) in the server
// editions, against local bare repositories (test/ui/serve.js maps https://github.com/test/<repo> to one), the traffic
// example. Changes apart: merged at once by their lines, said. The same lines (a VHDL constant): the pull stops (its
// ERROR and hint in the console), the merge view opens, the action refused while its conflict is left, the lines
// written by hand, pulled again: merged, no conflict marker in the file, the merge committed. In Portuguese. Both
// interfaces; no warnings.
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
// another author's change of a text file, pushed
function theirs(name, file, fn) {
  const dir = path.join(tmp, 'theirs', name);
  if (!fs.existsSync(dir)) sh(tmp, 'clone', '--quiet', path.join(remotes, `${name}.git`), dir);
  sh(dir, 'pull', '--quiet', '--no-rebase');
  const f = path.join(dir, file);
  fs.writeFileSync(f, fn(fs.readFileSync(f, 'utf8')));
  sh(dir, 'commit', '--quiet', '-am', 'Theirs');
  sh(dir, 'push', '--quiet');
}

before(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ui-git-pull-merge-')));
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
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const open = async (page, name) => {
  bare(name);
  page.project = name;
  await page.menu('File', 'Open from GitHub Repository…');
  await page.waitDialog('Open from GitHub Repository');
  await page.fill('.dlg-overlay .git-url', `https://github.com/test/${name}`);
  await page.dialogButton('Open');
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && document.querySelector('#hier .row'), [name], { what: `${name} open` });
};
// the project's file changed and committed (as an edit and File ▸ Git ▸ Commit… would)
const commitMine = async (page, file, fn, message) => {
  const text = fn(await readWs(env, page.project, file));
  await page.eval(async (p, t, msg) => {
    const { api } = await import('/js/api.js');
    await api.writeFile(window.Silinx.project.name, p, t);
    await api.gitCommit(window.Silinx.project.name, msg);
  }, file, text, message);
};
const CARS = (n) => (t) => t.replace('CARS_S   : integer := 5;', `CARS_S   : integer := ${n};`);

uiTest('#4214 Pull from GitHub: text files merged by their lines; the same lines resolved in the merge view, never markers', E, async (page) => {
  await open(page, 'lines');
  // apart: merged at once (git's own merge), the pull says what it took
  theirs('lines', TIMER, (t) => t.replace('END_S    : integer := 3;', 'END_S    : integer := 4;'));
  await commitMine(page, TIMER, (t) => t.replace('YELLOW_S : integer := 2;', 'YELLOW_S : integer := 3;'), 'Mine: yellow');
  await page.menu('File', 'Pull from GitHub');
  await page.waitConsole(/Pulled into main: \d+ file\(s\) changed\.\n {2}src\/timer\.vhd/);
  assert.match(await readWs(env, 'lines', TIMER), /YELLOW_S : integer := 3;[\s\S]*END_S {4}: integer := 4;/);
  await page.menu('File', 'Push to GitHub');
  await page.waitConsole(/Pushed main to local\/lines\./);
  // the same lines: the pull stops, the merge view opens
  theirs('lines', TIMER, CARS(6));
  await commitMine(page, TIMER, CARS(8), 'Mine: cars');
  const from = (await page.consoleText()).length;
  await page.menu('File', 'Pull from GitHub');
  await page.waitConsole(/ERROR: git pull: a conflict in src\/timer\.vhd: nothing was pulled, the project's files are as they were\nHint: The same lines of a file changed here and on GitHub: choose mine, theirs or both for each conflict, or write its lines, then Pull again\.\nMerge: 1 conflict\(s\) in 1 file\(s\), the same lines changed on both sides: choose Mine, Theirs or Both for each, or edit its lines, then Pull from GitHub\./);
  const v = await page.waitFor(() => document.querySelector('.merge-view .merge-choice') && {
    tab: window.SilinxApp.S.active?.title,
    bar: [...document.querySelectorAll('.merge-bar button')].map((b) => b.textContent),
    heads: [...document.querySelectorAll('.merge-sides th')].map((x) => x.textContent),
    conflict: [...document.querySelectorAll('.merge-hunk.merge-conflict td')].map((x) => x.textContent.trim()),
    status: document.querySelector('.merge-view .doc-status').innerText.replace(/\s+/g, ' ').trim(),
  }, [], { what: 'the merge view' });
  assert.deepEqual(v, {
    tab: 'Pull from GitHub (merge)', bar: ['Previous Conflict', 'Next Conflict', 'Pull from GitHub', 'Cancel'], heads: ['Common Ancestor', 'Mine (here)', 'Theirs (GitHub)'],
    conflict: ['constant CARS_S   : integer := 5;                -- cars green: at least 5 s', 'constant CARS_S   : integer := 8;                -- cars green: at least 5 s', 'constant CARS_S   : integer := 6;                -- cars green: at least 5 s'],
    status: '0 of 1 conflict(s) resolved',
  });
  // the action refused while the conflict is left; then its lines written
  await page.click('.merge-bar [data-cmd=apply]');
  await page.waitConsole(/^ERROR: Merge: 1 conflict\(s\) left to resolve \(src\/timer\.vhd h1\): choose Mine, Theirs or Both, or edit its lines\.$/m);
  await page.click('.merge-choice[data-id=h1] .merge-pick-mine');
  await page.eval(() => { const t = document.querySelector('.merge-choice[data-id=h1] .merge-edit'); t.value = '    constant CARS_S   : integer := 7;                -- cars green: at least 7 s'; t.dispatchEvent(new Event('input')); });
  await page.click('.merge-bar [data-cmd=apply]');
  await page.waitConsole(/Pulled into main: \d+ file\(s\) changed\.\n {2}src\/timer\.vhd\nsrc\/timer\.vhd: merged by its lines\./);
  assert.equal(await page.eval(() => !!document.querySelector('.merge-view')), false, 'the merge view closed');
  const timer = await readWs(env, 'lines', TIMER);
  assert.match(timer, /^ {4}constant CARS_S {3}: integer := 7; {16}-- cars green: at least 7 s$/m);
  assert.doesNotMatch(timer, /^(<<<<<<<|=======|>>>>>>>)/m);
  // (the merge committed: nothing left to commit, one commit ahead of GitHub)
  const st = await page.eval(async () => (await import('/js/api.js')).api.gitStatus(window.Silinx.project.name));
  assert.deepEqual([st.files, st.ahead], [[], 2]);
  assert.ok(!(await page.consoleText()).slice(from).includes('WARNING'));
  assert.deepEqual(warnings(page), []);
}, { timeout: 150000 });

uiTest('#4214 a pull\'s merge view in Portuguese; Cancel pulls nothing', E, async (page) => {
  await open(page, 'linhas');
  theirs('linhas', TIMER, CARS(6));
  await commitMine(page, TIMER, CARS(8), 'Mine: cars');
  const mine = await readWs(env, 'linhas', TIMER);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.menu('Ficheiro', 'Receber do GitHub (Pull)');
    const v = await page.waitFor(() => document.querySelector('.merge-view .merge-choice') && document.querySelector('.merge-bar [data-cmd=apply]').textContent === 'Receber do GitHub (Pull)' && {
      tab: document.querySelector('#doc-tabs .active')?.textContent.trim(),
      heads: [...document.querySelectorAll('.merge-sides th')].map((x) => x.textContent),
      status: document.querySelector('.merge-view .doc-status').innerText.replace(/\s+/g, ' ').trim(),
    }, [], { what: 'the merge view, in Portuguese' });
    assert.match(v.tab, /^Receber do GitHub \(junção\)/);
    assert.deepEqual([v.heads, v.status], [['Antepassado Comum', 'O meu (cá)', 'O deles (GitHub)'], '0 de 1 conflito(s) resolvido(s)']);
    await page.click('.merge-bar [data-cmd=cancel]');
    await page.waitFor(() => !document.querySelector('.merge-view'), [], { what: 'closed' });
    assert.equal(await readWs(env, 'linhas', TIMER), mine, 'nothing pulled');
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.deepEqual(warnings(page), []);
}, { timeout: 120000 });
