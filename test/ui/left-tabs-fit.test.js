// UI (#4625, web/js/left-tabs-fit.js): the side panel's tabs with no project open, Start and Collaboration (#4619), both
// whole (their icon and name shown) and sharing the row's width, in both interfaces (SILINX_UI_INTERFACE); a panel too
// narrow for both names: the tabs as with a project (the Silinx interface: the active one's name alone; the ISE style: the
// other's name cut), whole again once wide; Collaboration chosen: the same; in Portuguese; a project opened: the tabs as
// they were (none sharing the row), closed: both whole again; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
// the row as shown: whether its tabs share it (data-fit), and each shown tab: its page, its name if shown whole (null: hidden
// or cut), its width rounded
const row = (page) => page.eval(() => {
  const r = document.getElementById('left-tabs');
  return { fit: r.hasAttribute('data-fit'), tabs: [...r.querySelectorAll('.tab[data-page]')].filter((t) => t.getClientRects().length).map((t) => {
    const l = t.querySelector('.tab-lbl'), b = l.getBoundingClientRect();
    return { page: t.dataset.page, name: b.width > 2 && l.scrollWidth <= l.clientWidth + 1 ? l.textContent : null, w: Math.round(t.getBoundingClientRect().width) };
  }) };
});
// the side panel's width set (below its least too: the narrowest drawers, a longer language's names), the row measured again
const setWidth = async (page, w) => {
  await page.eval((x) => { const l = document.getElementById('left'); l.style.width = `${x}px`; l.style.minWidth = '0'; }, w);
  await page.waitFor((x) => Math.round(document.getElementById('left').getBoundingClientRect().width) === x, [w], { what: `the panel ${w} px` });
  await new Promise((r) => setTimeout(r, 100));   // (two frames: the observer's, the measure's)
};
const both = async (page, names, what) => {
  await page.waitFor(() => document.getElementById('left-tabs').hasAttribute('data-fit'), [], { what });
  const r = await row(page);
  assert.deepEqual(r.tabs.map((t) => [t.page, t.name]), [['start', names[0]], ['collab', names[1]]], what);
  assert.ok(Math.abs(r.tabs[0].w - r.tabs[1].w) <= 1, `${what}: the same width (${r.tabs.map((t) => t.w)})`);
  // (the whole row: the tabs' widths and the row's padding and gaps)
  assert.ok(await page.eval(() => { const rr = document.getElementById('left-tabs'), ts = [...rr.querySelectorAll('.tab')].filter((t) => t.getClientRects().length);
    return ts.at(-1).getBoundingClientRect().right >= rr.getBoundingClientRect().right - 16 && rr.scrollWidth <= rr.clientWidth; }), `${what}: the row filled`);
};

uiTest('#4625 no project: the Start and Collaboration tabs both whole, sharing the row; the active one alone in a narrow panel; Portuguese', E, async (page) => {
  await page.setViewport(1366, 768);
  await page.eval(() => window.SilinxApp.closeProject?.());
  await page.waitFor(() => !window.Silinx.project && document.documentElement.hasAttribute('data-no-project'), [], { what: 'no project' });
  const silinx = await page.eval(() => document.documentElement.dataset.ui === 'silinx');
  const wide = await page.eval(() => Math.round(document.getElementById('left').getBoundingClientRect().width));
  await both(page, ['Start', 'Collaboration'], 'the default panel');
  // a panel too narrow for both names (120 px): the tabs as with a project, the active one's name alone (the other: its
  // icon, the Silinx interface; its name cut, the ISE style)
  await setWidth(page, 120);
  await page.waitFor(() => !document.getElementById('left-tabs').hasAttribute('data-fit'), [], { what: 'not sharing the row' });
  const narrow = await row(page);
  assert.deepEqual(narrow.tabs.map((t) => [t.page, t.name]), [['start', 'Start'], ['collab', null]]);
  if (silinx) assert.ok(narrow.tabs[0].w > narrow.tabs[1].w, `the active one wider (${narrow.tabs.map((t) => t.w)})`);
  // Collaboration chosen there: its name, the Start tab's icon (the Silinx interface)
  await page.click('#left-tabs .tab[data-page=collab]');
  await page.waitFor(() => !document.querySelector('.left-page[data-page=collab]').hidden, [], { what: 'the Collaboration page' });
  if (silinx) assert.deepEqual((await row(page)).tabs.map((t) => [t.page, t.name]), [['start', null], ['collab', 'Collaboration']]);
  // wide again: both whole, the Collaboration tab active
  await page.eval(() => { const l = document.getElementById('left'); l.style.width = ''; l.style.minWidth = ''; });
  await page.waitFor((x) => Math.round(document.getElementById('left').getBoundingClientRect().width) === x, [wide], { what: 'the panel as it was' });
  await both(page, ['Start', 'Collaboration'], 'wide again, Collaboration active');
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#left-tabs .tab[data-page=collab] .tab-lbl').textContent === 'Colaboração', [], { what: 'Portuguese' });
  await both(page, ['Início', 'Colaboração'], 'Portuguese');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.click('#left-tabs .tab[data-page=start]');
  // a project open: the tabs as they were, none sharing the row; closed: both whole again
  await makeProject(env, { name: 'TabsFit', template: 'gates' });
  await page.openProject('TabsFit');
  await page.waitFor(() => !document.getElementById('left-tabs').hasAttribute('data-fit'), [], { what: 'a project: the tabs as they were' });
  assert.equal((await row(page)).tabs.length, 6);
  await page.eval(() => window.SilinxApp.closeProject());
  await page.waitFor(() => !window.Silinx.project && document.documentElement.hasAttribute('data-no-project'), [], { what: 'closed' });
  await both(page, ['Start', 'Collaboration'], 'closed');
  await noWarnings(page);
});
