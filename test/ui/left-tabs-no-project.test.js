// UI: the side panel's tabs with no project open (#4257): no tab row (Start, Design, Files, Libraries, Teaching,
// Collaboration), the Start page only; a project opened brings them back, on the tab last chosen, and closing it hides
// them again (the Silinx interface: on its Design page, #1171); an FPGA project and a design and simulation one (#3780); on a narrow screen (the drawer from the header's
// button, the Silinx interface with no empty activity bar); the local server and the browser edition; in both
// interfaces (SILINX_UI_INTERFACE); no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { buildSite } from './site-lib.js';

let env, site;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
// the side panel as shown: its tab row (the tabs one can see, the active one) and its page
const side = (page) => page.eval(() => {
  const row = document.getElementById('left-tabs');
  const tabs = [...row.querySelectorAll('.tab[data-page]')].filter((t) => t.getClientRects().length).map((t) => t.dataset.page).filter((p) => !['procs', 'emu'].includes(p));
  return { row: row.getClientRects().length > 0, tabs, active: row.querySelector('.tab.active')?.dataset.page || null,
    pages: [...document.querySelectorAll('.left-page')].filter((p) => !p.hidden).map((p) => p.dataset.page) };
});
const NONE = { row: false, tabs: [], active: 'start', pages: ['start'] };
// the Start page shown, its boxes drawn (on a narrow screen: the drawer opened by the header's button)
async function startShown(page) {
  if (await page.eval(() => !document.getElementById('start-page').getClientRects().length)) await page.click('#drawer-btn');
  await page.waitFor(() => document.getElementById('start-page').getClientRects().length && document.querySelector('#start-page .start-box h3'), [], { what: 'the Start page' });
  // (no empty activity bar beside it: the Start page from the side panel's left edge)
  assert.equal(await page.eval(() => Math.round(document.getElementById('start-page').getBoundingClientRect().left - document.getElementById('main').getBoundingClientRect().left) <= 8), true);
}
const close = async (page) => {
  await page.eval(() => window.SilinxApp.closeProject());
  await page.waitFor(() => !window.Silinx.project && document.documentElement.hasAttribute('data-no-project'), [], { what: 'the project closed' });
};
// opened as File ▸ Open Project does: no page asked
const open = async (page, name) => {
  await page.eval((n) => window.SilinxApp.openProject(n), name);
  await page.waitFor((n) => window.Silinx.project?.name === n && !document.documentElement.hasAttribute('data-no-project'), [name], { what: `${name} open` });
};

uiTest('#4257 no project: no tab row, the Start page only; a project opened brings the tabs back on the last chosen, closed hides them; a design project; a narrow screen', E, async (page) => {
  await page.setViewport(1366, 768);
  await close(page);
  assert.deepEqual(await side(page), NONE);
  await startShown(page);
  // an FPGA project: the tabs back; Files chosen
  await makeProject(env, { name: 'TabsFpga', template: 'gates' });
  await page.openProject('TabsFpga');
  const all = ['start', 'design', 'files', 'libraries', 'teaching', 'collab'];
  assert.deepEqual(await side(page), { row: true, tabs: all, active: 'design', pages: ['design'] });
  await page.leftTab('files');
  await close(page);
  assert.deepEqual(await side(page), NONE);
  // opened again: on Files, the tab last chosen (the Silinx interface's layout by tasks: its Design page, #1171)
  const chosen = await page.eval(() => (document.documentElement.dataset.layout === 'tasks' ? 'design' : 'files'));
  await open(page, 'TabsFpga');
  assert.deepEqual(await side(page), { row: true, tabs: all, active: chosen, pages: [chosen] });
  // a design and simulation project (never opened: nothing of its own kept): its tabs too, the same tab
  await makeProject(env, { name: 'TabsDesign', kind: 'design' });
  await open(page, 'TabsDesign');
  assert.deepEqual(await side(page), { row: true, tabs: all, active: chosen, pages: [chosen] });
  await page.leftTab('teaching');
  await close(page);
  assert.deepEqual(await side(page), NONE);
  // a narrow screen: no tab row (the Silinx interface: no activity bar), the drawer's Start page; a project: the tabs back
  await page.setViewport(820, 1000);
  assert.equal((await side(page)).row, false);
  await startShown(page);
  await open(page, 'TabsFpga');
  await page.leftTab('design');
  await page.waitFor(() => document.getElementById('hier').getClientRects().length && document.querySelector('#hier .row'), [], { what: 'the Design page in the drawer' });
  assert.deepEqual(await side(page), { row: true, tabs: all, active: 'design', pages: ['design'] });
  await close(page);
  assert.deepEqual(await side(page), NONE);
  await startShown(page);
  await page.setViewport(1366, 768);
  await noWarnings(page);
});

// the browser edition: the same, its project made with File ▸ New Project…
uiTest('#4257 the browser edition: no tab row with no project, the tabs with one, none again once closed', () => (site?.skip ? { skip: site.skip } : env), async (page) => {
  site ??= await buildSite(env.tmp);
  if (site.skip) return;
  try {
    await page.setViewport(1366, 768);
    await page.goto(`${site.url}index.html`);
    await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'site boot', timeout: 60000 });
    assert.deepEqual(await side(page), NONE);
    await startShown(page);
    await page.menu('File', 'New Project…');
    await page.waitDialog('New Project Wizard');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', 'WebTabs');
    await page.dialogButton('Next >');
    await page.dialogButton('Next >');
    await page.dialogButton('Finish');
    await page.waitNoDialog();
    // (the wizard done: its toast, after the project opened and its Design page shown)
    await page.waitFor(() => window.Silinx.project?.name === 'WebTabs' && [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('WebTabs')), [], { what: 'WebTabs made' });
    assert.deepEqual(await side(page), { row: true, tabs: ['start', 'design', 'files', 'libraries', 'teaching', 'collab'], active: 'design', pages: ['design'] });
    await close(page);
    assert.deepEqual(await side(page), NONE);
    await noWarnings(page);
  } finally { site.close?.(); site = null; }
});
