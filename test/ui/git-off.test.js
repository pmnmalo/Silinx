// UI (#3968): a server whose git is turned off (SILINX_GIT=off): the Start page has no git group and no line before it,
// though it asks git's presence each time it is drawn; no warnings. (The group when git is there:
// test/ui/git-start.test.js.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => {
  process.env.SILINX_GIT = 'off';
  try { env = await setupUi(); } finally { delete process.env.SILINX_GIT; }
});
after(async () => { await env?.teardown?.(); });
const E = () => env;
// the Project Commands box: its entries and its line, in order, as shown (git-start.test.js's)
const startCommands = (page) => page.eval(() => [...document.querySelector('#start-page .start-box').children]
  .filter((e) => e.matches('.entry, hr') && e.getClientRects().length).map((e) => (e.matches('hr') ? '—' : e.textContent)));
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);

uiTest('#3968 SILINX_GIT=off: no git group on the Start page', E, async (page) => {
  await page.eval(() => window.SilinxApp.closeProject?.());
  await page.reload();
  await page.leftTab('design');
  await page.leftTab('start');
  await page.waitFor(() => !!document.querySelector('#start-page .start-box'), [], { what: 'the Start page' });
  assert.equal(await page.eval(async () => (await (await import('/js/api.js')).api.gitEnabled()).enabled), false);
  assert.deepEqual(await startCommands(page), ['Import Project (.zip)…', 'Export Project (.zip)…']);
  assert.deepEqual(warnings(page), []);
});
