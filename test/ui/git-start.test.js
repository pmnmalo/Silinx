// UI (#3968): the git commands with no project open (Open from GitHub Repository…, Store Project in a GitHub Repository…,
// #4343: the Collaboration tab's since #4619, the Start page's before) when Silinx opens, though the first ask of git (GET
// /api/git) fails, as a server not answering yet: asked again, the tab's box drawn with its answer, no reload, no click.
// The ask that failed was kept as "no git" for good, and the commands never came. The Start page without them. In
// Portuguese too; no warnings. (SILINX_GIT=off: test/ui/git-off.test.js.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, chromeOnly } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);

// the Project Commands box: its entries and its line, in order, as shown
const startCommands = (page) => page.eval(() => [...document.querySelector('#start-page .start-box').children]
  .filter((e) => e.matches('.entry, hr') && e.getClientRects().length).map((e) => (e.matches('hr') ? '—' : e.textContent)));
// the Collaboration tab's Git Repository box: its entries ("(disabled)" after a command that cannot be clicked)
const repoBox = (page) => page.eval(() => [...(document.querySelector('#collab-page .collab-repo')?.querySelectorAll('.entry') || [])]
  .map((e) => `${e.textContent}${e.querySelector('a.disabled') ? ' (disabled)' : ''}`));

uiTest('#3968 #4619 the Collaboration tab\'s git commands when Silinx opens, its first ask of git failed; Portuguese', E, async (page) => {
  // the page's first GET /api/git fails as a server not answering does; the next ones reach the server
  const stub = `(() => { let first = true; const orig = window.fetch; window.fetch = (u, o) => (first && /\\/api\\/git$/.test(String(u)) ? (first = false, window.__gitFailed = true, Promise.reject(new TypeError('Failed to fetch'))) : orig(u, o)); })();`;
  const s1 = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: stub });
  try {
    await page.eval(() => window.SilinxApp.closeProject?.());
    await page.reload();
    assert.equal(await page.eval(() => window.__gitFailed), true, 'the first ask failed');
    // the Collaboration tab's box, with no click (the tab not chosen); the Start page's project commands alone
    await page.waitFor(() => [...document.querySelectorAll('#collab-page .entry a')].some((a) => a.textContent === 'Open from GitHub Repository…'), [], { what: 'the git commands' });
    const REPO = ['git signs in to GitHub with its own credentials.', 'No project open.', 'Open from GitHub Repository…', 'Store Project in a GitHub Repository… (disabled)'];
    assert.deepEqual(await repoBox(page), REPO);
    assert.deepEqual(await startCommands(page), ['New Project…', 'Open Project…', 'Import Project…', 'Export Project (.zip)…']);   // (New Project… and Open Project… first, #5939)
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    await page.leftTab('collab');
    await page.waitFor(() => [...document.querySelectorAll('#collab-page .entry a')].some((a) => a.textContent === 'Abrir do Repositório GitHub…'), [], { what: 'the tab in Portuguese' });
    assert.deepEqual((await repoBox(page)).slice(2), ['Abrir do Repositório GitHub…', 'Guardar o Projeto num Repositório GitHub… (disabled)']);
    // (back from the Collaboration tab with no project: its Start tab clicked, the harness's leftTab('start') being the Start page alone's)
    await page.click('#left-tabs .tab[data-page=start]');
    await page.waitFor(() => [...document.querySelectorAll('#start-page .entry a')].some((a) => a.textContent === 'Importar Projeto…'), [], { what: 'the Start page in Portuguese' });
    assert.deepEqual(await startCommands(page), ['Novo Projeto…', 'Abrir Projeto…', 'Importar Projeto…', 'Exportar Projeto (.zip)…']);
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    assert.deepEqual(warnings(page), []);
  } finally {
    await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: s1.identifier });
  }
}, { skip: chromeOnly });   // (Page.addScriptToEvaluateOnNewDocument)
