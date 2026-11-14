// UI (#3968): the Start page's git group (Initialize Repository…, Open from Repository…, after a line) when Silinx opens,
// though the first ask of git (GET /api/git) fails, as a server not answering yet: asked again, the group drawn with its
// answer, no reload, no click. The ask that failed was kept as "no git" for good, and the group never came. In
// Portuguese too; no warnings. (SILINX_GIT=off, no group: test/ui/git-off.test.js.)
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

uiTest('#3968 the Start page\'s git group when Silinx opens, its first ask of git failed; Portuguese', E, async (page) => {
  // the page's first GET /api/git fails as a server not answering does; the next ones reach the server
  const stub = `(() => { let first = true; const orig = window.fetch; window.fetch = (u, o) => (first && /\\/api\\/git$/.test(String(u)) ? (first = false, window.__gitFailed = true, Promise.reject(new TypeError('Failed to fetch'))) : orig(u, o)); })();`;
  const s1 = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: stub });
  try {
    await page.eval(() => window.SilinxApp.closeProject?.());
    await page.reload();
    assert.equal(await page.eval(() => window.__gitFailed), true, 'the first ask failed');
    // the Start page in front, the group after its line, with no click
    await page.waitFor(() => [...document.querySelectorAll('#start-page .entry a')].some((a) => a.textContent === 'Open from Repository…'), [], { what: 'the git group' });
    assert.deepEqual(await startCommands(page), ['Import Project (.zip)…', 'Export Project (.zip)…', '—', 'Initialize Repository…', 'Open from Repository…']);
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    await page.leftTab('start');
    await page.waitFor(() => [...document.querySelectorAll('#start-page .entry a')].some((a) => a.textContent === 'Abrir do Repositório…'), [], { what: 'the Start page in Portuguese' });
    assert.deepEqual(await startCommands(page), ['Importar Projeto (.zip)…', 'Exportar Projeto (.zip)…', '—', 'Inicializar Repositório…', 'Abrir do Repositório…']);
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    assert.deepEqual(warnings(page), []);
  } finally {
    await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: s1.identifier });
  }
}, { skip: chromeOnly });   // (Page.addScriptToEvaluateOnNewDocument)
