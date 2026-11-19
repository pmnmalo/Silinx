// UI (#4619): the Collaboration tab with no project open, in the browser edition (the site, test/ui/site-lib.js, with
// test/fake-github.mjs for GitHub: no network), in both interfaces (SILINX_UI_INTERFACE): shown beside the Start tab, its
// Git Repository box (Sign in with GitHub…, Open from GitHub Repository…, Store Project in a GitHub Repository… disabled),
// its Sharing box (the project's commands disabled), its Cloudflare Relay box; the Start page with no GitHub command;
// signed in from the tab (a personal access token, the fake GitHub's), a repository opened from it: the whole Git
// Repository box; the project closed, another one with no repository: Store Project in a GitHub Repository… enabled in
// the tab; in Portuguese; no warnings.
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

// (a client id that is not one: the sign-in asks for a personal access token, the fake GitHub's)
const boot = async (page) => {
  await page.goto(`${site.url}index.html`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'site boot', timeout: 60000 });
  await page.eval((u) => { window.SILINX_GITHUB = { api: u, login: u, clientId: 'REPLACE-ME-with-the-client-ID-of-Silinx-GitHub-OAuth-App' }; }, `${site.url}fake-github`);
};
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
const shownTabs = (page) => page.eval(() => [...document.querySelectorAll('#left-tabs .tab[data-page]')].filter((t) => t.getClientRects().length).map((t) => t.dataset.page).filter((p) => !['procs', 'emu'].includes(p)));
// the Collaboration page as shown: each box's heading and entries (an entry's parts joined by a space, "(disabled)" after
// a command that cannot be clicked)
const collabPage = (page) => page.eval(() => [...document.querySelectorAll('#collab-page .start-box')].map((b) => [b.querySelector('h3').textContent,
  ...[...b.querySelectorAll('.entry')].map((e) => [...e.childNodes].filter((n) => !n.classList?.contains('ico')).map((n) => n.textContent).filter(Boolean).join(' ')
    + (e.querySelector('a.disabled') ? ' (disabled)' : ''))]));
const waitPage = async (page, want, what) => {
  try {
    await page.waitFor((w) => JSON.stringify([...document.querySelectorAll('#collab-page .start-box')].map((b) => [b.querySelector('h3').textContent,
      ...[...b.querySelectorAll('.entry')].map((e) => [...e.childNodes].filter((n) => !n.classList?.contains('ico')).map((n) => n.textContent).filter(Boolean).join(' ')
        + (e.querySelector('a.disabled') ? ' (disabled)' : ''))])) === JSON.stringify(w), [want], { what });
  } catch (e) { assert.deepEqual(await collabPage(page), want, e.message); throw e; }
};
const startCommands = (page) => page.eval(() => [...document.querySelector('#start-page .start-box').children]
  .filter((e) => e.matches('.entry, hr') && e.getClientRects().length).map((e) => (e.matches('hr') ? '—' : e.textContent)));
const tabCommand = (page, label) => page.click('#collab-page .entry a', { text: label });

const SHARING = ['Sharing', 'Not shared live.', 'Share a Copy… (disabled)', 'Share Live… (disabled)', 'To follow a project shared live, open its link.'];
const RELAY = ['Cloudflare Relay', 'No Cloudflare relay: your followers find you at the public meeting point.', 'Set Up a Cloudflare Relay…'];
// (Sharing first, the relay under it, then Git Repository: #4636)
const NO_PROJECT = (sign) => [SHARING, RELAY, ['Git Repository', sign, 'No project open.', 'Open from GitHub Repository…', 'Store Project in a GitHub Repository… (disabled)']];

uiTest('#4619 the Collaboration tab with no project open: the sign-in, Open from GitHub Repository…, the relay; the Start page with no GitHub command; Portuguese', E, async (page) => {
  const REPO = 'course/nopro-ana';
  gh.seed(REPO, filesOf(BLINKY));
  await page.setViewport(1366, 768);
  await boot(page);
  await page.eval(() => { for (const s of [localStorage, sessionStorage]) s.removeItem('silinx.github-token'); localStorage.removeItem('silinx.lastProject'); });
  await boot(page);
  assert.equal(await page.eval(() => !window.Silinx.project), true, 'no project');
  // the Start and Collaboration tabs; the Start page's project commands alone
  assert.deepEqual(await shownTabs(page), ['start', 'collab']);
  await page.waitFor(() => !!document.querySelector('#start-page .start-box'), [], { what: 'the Start page' });
  assert.deepEqual(await startCommands(page), ['Import Project…', 'Export Project (.zip)…']);
  assert.equal(await page.eval(() => [...document.querySelectorAll('#start-page .entry a')].some((a) => /GitHub/.test(a.textContent))), false, 'no GitHub command on the Start page');
  // the tab: the sign-in, Open from GitHub Repository…, the project's commands disabled; the relay
  await page.leftTab('collab');
  await waitPage(page, NO_PROJECT('Sign in with GitHub…'), 'the tab with no project');
  // in Portuguese (the page loaded again): every entry translated
  await page.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await boot(page);
  assert.deepEqual(await shownTabs(page), ['start', 'collab']);
  await page.leftTab('collab');
  await waitPage(page, [['Partilha', 'Não partilhado em direto.', 'Partilhar uma Cópia… (disabled)', 'Partilhar em Direto… (disabled)', 'Para seguir um projeto partilhado em direto, abra a sua ligação.'],
    ['Retransmissor Cloudflare', 'Sem retransmissor Cloudflare: quem o segue encontra-o no ponto de encontro público.', 'Configurar um Retransmissor Cloudflare…'],
    ['Repositório Git', 'Iniciar sessão no GitHub…', 'Nenhum projeto aberto.', 'Abrir do Repositório GitHub…', 'Guardar o Projeto num Repositório GitHub… (disabled)']], 'the tab in Portuguese');
  // (back from the Collaboration tab with no project: its Start tab clicked, the harness's leftTab('start') being the Start page alone's)
  await page.click('#left-tabs .tab[data-page=start]');
  await page.waitFor(() => !!document.querySelector('#start-page .start-box'), [], { what: 'the Start page in Portuguese' });
  assert.deepEqual(await startCommands(page), ['Importar Projeto…', 'Exportar Projeto (.zip)…']);
  await page.eval(() => localStorage.removeItem('silinx.lang'));
  await boot(page);
  await page.leftTab('collab');
  await waitPage(page, NO_PROJECT('Sign in with GitHub…'), 'the tab in English again');
  // signed in from the tab: Sign out of GitHub in its place
  await tabCommand(page, 'Sign in with GitHub…');
  await page.waitDialog('Sign in with GitHub');
  await page.fill('.dlg-overlay .git-token', gh.token);
  await page.dialogButton('Sign In');
  await page.waitNoDialog();
  await page.waitConsole(/Signed in to GitHub as student: the sign-in is kept in this browser/);
  await waitPage(page, NO_PROJECT('Sign out of GitHub'), 'signed in, no project');
  // Open from GitHub Repository… from the tab: the project, the whole Git Repository box
  await tabCommand(page, 'Open from GitHub Repository…');
  await page.waitDialog('Open from GitHub Repository');
  await page.fill('.dlg-overlay .git-url', `https://github.com/${REPO}`);
  await page.dialogButton('Open');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'nopro-ana' && !!window.SilinxApp.S.git, [], { what: 'nopro-ana open' });
  assert.deepEqual(await shownTabs(page), ['start', 'design', 'files', 'libraries', 'collab', 'teaching']);
  await page.leftTab('collab');
  await waitPage(page, [['Sharing', 'Not shared live.', 'Share a Copy…', 'Share Live…', 'To follow a project shared live, open its link.'], RELAY,
    ['Git Repository', 'Sign out of GitHub', `GitHub: ${REPO}`, 'Branch: main', 'Commit and Push…', 'Pull from GitHub', 'New Branch…', 'Switch Branch…', 'Merge Branch…', 'Changes…', 'History…', 'GitHub Checks']], 'the repository\'s box');
  // closed: the Start and Collaboration tabs again, the tab's box with no project
  await page.eval(() => window.SilinxApp.closeProject());
  await page.waitFor(() => !window.Silinx.project && document.documentElement.hasAttribute('data-no-project'), [], { what: 'the project closed' });
  assert.deepEqual(await shownTabs(page), ['start', 'collab']);
  await page.leftTab('collab');
  await waitPage(page, NO_PROJECT('Sign out of GitHub'), 'closed');
  // a project with no repository: Store Project in a GitHub Repository… enabled in the tab, not on the Start page
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'NoRepo');
  await page.dialogButton('Next >');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  // (the wizard done: its toast, after the project opened and its Design page shown)
  await page.waitFor(() => window.Silinx.project?.name === 'NoRepo' && [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('NoRepo')), [], { what: 'NoRepo made' });
  await page.leftTab('collab');
  await waitPage(page, [['Sharing', 'Not shared live.', 'Share a Copy…', 'Share Live…', 'To follow a project shared live, open its link.'], RELAY,
    ['Git Repository', 'Sign out of GitHub', 'The project is not in a git repository.', 'Open from GitHub Repository…', 'Store Project in a GitHub Repository…']], 'a project with no repository');
  await tabCommand(page, 'Store Project in a GitHub Repository…');
  await page.waitDialog('Store Project in a GitHub Repository');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await page.leftTab('start');
  assert.deepEqual(await startCommands(page), ['Import Project…', 'Export Project (.zip)…']);
  await noWarnings(page);
}, { url: () => 'about:blank', timeout: 180000 });
