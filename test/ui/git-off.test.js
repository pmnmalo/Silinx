// UI (#3968): a server whose git is turned off (SILINX_GIT=off): the Start page has no git group and no line before it,
// though it asks git's presence each time it is drawn; the Collaboration tab's Sharing box only, and no tab with no
// live sharing either (#4215); no warnings. (The group when git is there:
// test/ui/git-start.test.js.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

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

uiTest('#3968 #4215 SILINX_GIT=off: no git group on the Start page, the Collaboration tab live sharing only', E, async (page) => {
  await page.eval(() => window.SilinxApp.closeProject?.());
  await page.reload();
  await page.leftTab('start');
  await page.waitFor(() => !!document.querySelector('#start-page .start-box'), [], { what: 'the Start page' });
  assert.equal(await page.eval(async () => (await (await import('/js/api.js')).api.gitEnabled()).enabled), false);
  assert.deepEqual(await startCommands(page), ['Import Project…', 'Export Project (.zip)…']);
  // the Collaboration tab (#4215): its Sharing box only (this server shares live), no git box (a project open: no
  // tabs with none, #4257)
  await makeProject(env, { name: 'GitOff', template: 'gates' });
  await page.openProject('GitOff');
  await page.leftTab('collab');
  await page.waitFor(() => document.querySelectorAll('#collab-page .start-box').length > 0, [], { what: 'the Collaboration page' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#collab-page .start-box h3')].map((e) => e.textContent)), ['Sharing']);
  // and none where nothing is shared live either
  await page.eval(async () => { const { api } = await import('/js/api.js'); window.__collab = api.collab; api.collab = false; (await import('/js/collab-tab.js')).renderCollabPage(); });
  try {
    assert.equal(await page.eval(() => document.querySelector('#left-tabs .tab[data-page=collab]').getClientRects().length), 0);
    assert.equal(await page.eval(() => window.SilinxApp.S.leftPage), 'design');
  } finally {
    await page.eval(async () => { const { api } = await import('/js/api.js'); api.collab = window.__collab; (await import('/js/collab-tab.js')).renderCollabPage(); });
  }
  assert.deepEqual(warnings(page), []);
});
