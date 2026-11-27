// UI: Open Project's Delete in the browser edition (#5785), the site over HTTP, its projects in the browser's storage:
// two projects selected, Delete asks first (they are deleted from this browser's storage, it cannot be undone, Cancel
// the default), then both gone from the list and from the storage, the console's lines (no .trash here); the page
// loaded again, they are still gone, the third kept. No warnings, no error of the page's scripts. (The interface:
// SILINX_UI_INTERFACE.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';
import { buildSite } from './site-lib.js';

let env, site;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  site = await buildSite(env.tmp);
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

const problems = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)/.test(l));
const boot = (page) => page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });
// a project made by the New Project wizard (it opens it)
async function newProject(page, name) {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && window.Silinx.project.top, [name], { what: `${name} open` });
}
async function openDialog(page) {
  await page.menu('File', 'Open Project…');
  await page.waitDialog('Open Project');
  await page.waitFor(() => document.querySelector('.dlg tr[data-project]'), [], { what: 'the list' });
}
const listed = (page) => page.eval(() => [...document.querySelectorAll('.dlg tr[data-project]')].map((r) => r.dataset.project).sort());
const CTRL = process.platform === 'darwin' ? 4 : 2;

uiTest('#5785 browser edition: Open Project\'s Delete of two projects, from the browser\'s storage; still gone after a reload', E, async (page) => {
  await page.goto(site.url);
  await boot(page);
  for (const name of ['gone_a', 'gone_b', 'kept_c']) await newProject(page, name);
  await openDialog(page);
  assert.deepEqual(await listed(page), ['gone_a', 'gone_b', 'kept_c']);
  await page.click('.dlg tr[data-project="gone_a"] td');
  await page.click('.dlg tr[data-project="gone_b"] td', { modifiers: CTRL });
  await page.dialogButton('Delete');
  await page.waitDialog('Delete Projects');
  const order = await page.eval(() => [...document.querySelectorAll('.dlg tr[data-project]')].map((r) => r.dataset.project).filter((n) => n.startsWith('gone_')));
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.msg-text').textContent),
    `Delete these 2 projects?\n'${order[0]}'\n'${order[1]}'\n\nThey are deleted from this browser's storage.\nThis cannot be undone.`);
  assert.equal(await page.eval(() => document.activeElement?.textContent), 'Cancel');
  await page.dialogButton('Delete');
  await page.waitConsole(new RegExp(`^Project '${order[1]}' deleted\\.$`, 'm'));
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /^Project '.+' deleted/.test(l)), order.map((n) => `Project '${n}' deleted.`));
  assert.deepEqual(await listed(page), ['kept_c']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // the page loaded again: still gone
  await page.goto(site.url);
  await boot(page);
  await openDialog(page);
  assert.deepEqual(await listed(page), ['kept_c']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(await problems(page), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { url: () => 'about:blank', timeout: 240000 });
