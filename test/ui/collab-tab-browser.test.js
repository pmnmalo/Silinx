// UI: the Collaboration tab (#4215, web/js/collab-tab.js) in the browser edition, through GitHub's REST API (the site,
// test/ui/site-lib.js, with test/fake-github.mjs for GitHub: no network), in both interfaces (SILINX_UI_INTERFACE): a
// repository opened from the tab; Commit and Push… (no Push: a commit is pushed at once); the sign-in's state, Sign out of
// GitHub giving Sign in with GitHub…; GitHub Checks from the tab, its result kept in the tab (none, running, passed,
// failed), its details in the console, with a fine-grained token too (#4237: the workflow's jobs, or the
// permissions to add); the Live Sharing box; in Portuguese; no warnings. (The server editions': test/ui/collab-tab.test.js.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, ROOT } from './harness.js';
import { buildSite } from './site-lib.js';
import { fakeGitHub } from '../fake-github.mjs';

const BLINKY = path.join(ROOT, 'examples', 'blinky');
const filesOf = (dir, base = '') => Object.fromEntries(fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap((e) => {
  const rel = base ? `${base}/${e.name}` : e.name;
  return e.isDirectory() ? Object.entries(filesOf(dir, rel)) : [[rel, fs.readFileSync(path.join(dir, rel), 'utf8')]];
}));

let env, site, gh;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  gh = fakeGitHub({ interval: 1 });
  site = await buildSite(env.tmp, { route: (req, res, body) => gh.route('/fake-github')(req, res, body) });
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

const boot = async (page) => {
  await page.goto(`${site.url}index.html`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'site boot', timeout: 60000 });
  await page.eval((u, id) => { window.SILINX_GITHUB = { api: u, login: u, clientId: id }; }, `${site.url}fake-github`, gh.clientId);
};
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
// a box of the page as shown: its entries (an entry's parts joined by a space, "(disabled)" after a command that cannot
// be clicked), or null
const boxOf = (page, heading) => page.eval((hd) => {
  const b = [...document.querySelectorAll('#collab-page .start-box')].find((x) => x.querySelector('h3').textContent === hd);
  return b ? [...b.querySelectorAll('.entry')].map((e) => [...e.childNodes].filter((n) => !n.classList?.contains('ico')).map((n) => n.textContent).filter(Boolean).join(' ')
    + (e.querySelector('a.disabled') ? ' (disabled)' : '')) : null;
}, heading);
const waitBox = async (page, heading, entries, what) => {
  try {
    await page.waitFor((hd, en) => {
      const b = [...document.querySelectorAll('#collab-page .start-box')].find((x) => x.querySelector('h3').textContent === hd);
      return !!b && JSON.stringify([...b.querySelectorAll('.entry')].map((e) => [...e.childNodes].filter((n) => !n.classList?.contains('ico')).map((n) => n.textContent).filter(Boolean).join(' '))) === JSON.stringify(en);
    }, [heading, entries], { what });
  } catch (e) { assert.deepEqual(await boxOf(page, heading), entries, e.message); throw e; }
};
const tabCommand = (page, label) => page.click('#collab-page .entry a', { text: label });
const edit = async (page, rel, text) => {
  await page.eval((f) => window.SilinxApp.openFile(f), rel);
  await page.waitFor((f) => !!window.SilinxApp.S.docs.find((d) => d.path === f)?.editor, [rel], { what: `${rel} open` });
  await page.eval(async (f, t) => { window.SilinxApp.S.docs.find((d) => d.path === f).editor.setValue(t); await window.SilinxApp.saveAll(); }, rel, text);
};

uiTest('#4215 the browser edition\'s Collaboration tab: Open from Repository…, Commit and Push…, the sign-in, GitHub Checks kept; Portuguese', E, async (page) => {
  const REPO = 'course/collab-ana';
  gh.seed(REPO, filesOf(BLINKY));
  await boot(page);
  await page.eval((t) => localStorage.setItem('silinx.github-token', t), gh.token);
  await page.leftTab('collab');
  await waitBox(page, 'GitHub', ['Signed in to GitHub.', 'Sign out of GitHub', 'GitHub Checks'], 'signed in, no project');
  await tabCommand(page, 'Open from Repository…');
  await page.waitDialog('Open from Repository');
  await page.fill('.dlg-overlay .git-url', `https://github.com/${REPO}`);
  await page.dialogButton('Open');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'collab-ana' && !!window.SilinxApp.S.git, [], { what: 'collab-ana open' });
  await page.leftTab('collab');
  // Commit and Push… (no Push to GitHub)
  const REPO_ENTRIES = ['GitHub: course/collab-ana', 'Branch: main', 'Commit and Push…', 'Pull from GitHub', 'History…'];
  await waitBox(page, 'Repository', REPO_ENTRIES, 'the repository');
  await waitBox(page, 'Changes', ['No change since the last commit.'], 'no change');
  // (Live Sharing: the browser edition's page hosts it)
  assert.deepEqual(await boxOf(page, 'Live Sharing'), ['Not shared live.', 'Share Live…', 'To follow a project shared live, open its link.']);
  const short = (s) => s.slice(0, 7);
  // GitHub Checks from the tab: none yet, then running, then failed and passed: kept in the tab, the details in the console
  await tabCommand(page, 'GitHub Checks');
  await page.waitConsole(new RegExp(`No check on GitHub for commit ${short(gh.head(REPO))}`));
  await waitBox(page, 'GitHub', ['Signed in to GitHub.', 'Sign out of GitHub', 'GitHub Checks', `No check on GitHub (${short(gh.head(REPO))})`], 'no check');
  const counter = gh.filesAt(REPO, 'main')['src/counter.v'];
  await edit(page, 'src/counter.v', `${counter}// done\n`);
  await page.leftTab('collab');
  await waitBox(page, 'Changes', ['M src/counter.v'], 'the change');
  await tabCommand(page, 'Commit and Push…');
  await page.waitDialog('Commit and Push');
  await page.fill('.dlg-overlay .git-message', 'Done');
  await page.dialogButton('Commit and Push');
  await page.waitNoDialog();
  await page.waitConsole(/Pushed main to course\/collab-ana\./);
  await waitBox(page, 'Changes', ['No change since the last commit.'], 'committed and pushed');
  const sha = gh.head(REPO);
  gh.setChecks(REPO, sha, [{ name: 'grade', status: 'queued' }]);
  await tabCommand(page, 'GitHub Checks');
  await waitBox(page, 'GitHub', ['Signed in to GitHub.', 'Sign out of GitHub', 'GitHub Checks', `Checks running (${short(sha)})`], 'running');
  gh.setChecks(REPO, sha, [{ name: 'grade', status: 'completed', conclusion: 'failure', annotations: [{ level: 'failure', title: 'Silinx: count', message: 'WA Wrong Answer, 0 / 30' }] }]);
  await tabCommand(page, 'GitHub Checks');
  await waitBox(page, 'GitHub', ['Signed in to GitHub.', 'Sign out of GitHub', 'GitHub Checks', `Checks failed (${short(sha)})`], 'failed');
  await page.waitConsole(/ERROR: {3}Silinx: count: WA Wrong Answer, 0 \/ 30/);
  gh.setChecks(REPO, sha, [{ name: 'grade', status: 'completed', conclusion: 'success' }]);
  await tabCommand(page, 'GitHub Checks');
  await waitBox(page, 'GitHub', ['Signed in to GitHub.', 'Sign out of GitHub', 'GitHub Checks', `Checks passed (${short(sha)})`], 'passed');
  assert.equal(await page.eval(() => document.querySelector('#collab-page .collab-checks').dataset.state), 'success');
  // (#4237) a fine-grained token: GitHub's Checks refused, the workflow's jobs read instead (the tab's result the same);
  // neither readable: the console names the permissions to add
  gh.fineGrained({ actions: true, statuses: true });
  gh.setRuns(REPO, sha, [{ name: 'Classroom', status: 'completed', conclusion: 'failure', jobs: [{ name: 'grade', status: 'completed', conclusion: 'failure' }] }]);
  await tabCommand(page, 'GitHub Checks');
  await waitBox(page, 'GitHub', ['Signed in to GitHub.', 'Sign out of GitHub', 'GitHub Checks', `Checks failed (${short(sha)})`], 'failed, from the workflow');
  await page.waitConsole(new RegExp(`This token cannot read GitHub's Checks \\(a fine-grained personal access token has no such permission\\): the workflows' jobs and the commit's statuses instead, without the tests' verdicts \\(their annotations\\)\\.\\nERROR: grade: failure \\(commit ${short(sha)}\\): https://github\\.com/course/collab-ana/actions/runs/\\d+/job/\\d+`));
  gh.fineGrained({});
  await tabCommand(page, 'GitHub Checks');
  await page.waitConsole(/ERROR: GitHub refused this token the commit's checks: a fine-grained personal access token needs Actions: read and Commit statuses: read on course\/collab-ana\nHint: Edit the token on GitHub \(Settings ▸ Developer settings ▸ Fine-grained tokens\) and add those two repository permissions\./);
  gh.fineGrained(null);
  // in Portuguese (the site read again in it: the checks' result was the page's), then Sign out of GitHub from the tab
  await page.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  try {
    await boot(page);
    await page.waitFor(() => document.documentElement.lang === 'pt' && window.Silinx.project?.name === 'collab-ana' && !!window.SilinxApp.S.git, [], { what: 'Portuguese, collab-ana' });
    await page.leftTab('collab');
    await waitBox(page, 'GitHub', ['Com sessão iniciada no GitHub.', 'Terminar sessão no GitHub', 'Verificações do GitHub (Checks)'], 'Portuguese');
    assert.deepEqual(await boxOf(page, 'Repositório'), ['GitHub: course/collab-ana', 'Ramo: main', 'Registar e Enviar (Commit e Push)…', 'Receber do GitHub (Pull)', 'Histórico…']);
    assert.deepEqual(await boxOf(page, 'Alterações'), ['Nenhuma alteração desde o último commit.']);
    assert.equal(await page.eval(() => document.querySelector('#left-tabs .tab[data-page=collab] .tab-lbl').textContent), 'Colaboração');
    await tabCommand(page, 'Terminar sessão no GitHub');
    await waitBox(page, 'GitHub', ['Sem sessão iniciada no GitHub.', 'Iniciar sessão no GitHub…', 'Verificações do GitHub (Checks)'], 'signed out');
  } finally {
    await page.eval(() => localStorage.removeItem('silinx.lang'));
  }
  await noWarnings(page);
}, { url: () => 'about:blank', timeout: 180000 });
