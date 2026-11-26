// UI: a phone's main toolbar, menus and dialogs (#5121, web/js/phone-toolbar.js, web/css/phone.css): under 600 px
// (375 × 812 and 430 × 932, with touch) the toolbar keeps Open Project, Undo, Redo and Find in Project and gathers the
// others in the menu of More tools (⋯), the ISE style's processes too; the header never wider than the screen; a menu
// (More tools', the menu bar's, Settings') the whole width, its items 40 px tall; a dialog (a wizard) the whole screen,
// its steps a line above its page. At 768 px the toolbar as before. In both interfaces (SILINX_UI_INTERFACE) and in
// Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the toolbar's buttons shown (data-cmd; More tools as 'more'), and whether the header or the page is wider than the screen
const toolbar = (page) => page.eval(() => ({
  shown: [...document.querySelectorAll('#toolbar > .tb-btn')].filter((b) => b.getClientRects().length).map((b) => (b.id === 'phone-more' ? 'more' : b.dataset.cmd)),
  over: [...document.querySelectorAll('#topbar, #toolbar, #menubar')].filter((e) => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1).map((e) => e.id),
  page: document.documentElement.scrollWidth > innerWidth,
}));
// the menu open: its items ('-' a separator; a disabled one in brackets), its box, its items' least height
const menu = (page) => page.waitFor(() => {
  const m = document.querySelector('body > .menu-popup:not(.sub)');
  if (!m) return null;
  const r = m.getBoundingClientRect(), mis = [...m.querySelectorAll(':scope > .mi')];
  return {
    items: [...m.children].map((c) => (c.classList.contains('sep') ? '-' : c.classList.contains('disabled') ? `(${c.querySelector('.lbl').textContent})` : c.querySelector('.lbl')?.textContent)).filter(Boolean),
    left: Math.round(r.left), width: Math.round(r.width), bottom: Math.round(r.bottom), least: Math.min(...mis.map((x) => Math.round(x.getBoundingClientRect().height))),
  };
}, [], { what: 'a menu open' });
const ISE_MORE = ['-', 'Implement Top Module', 'Stop the running process', 'Simulate Behavioral Model', 'Emulate Behavioral Model', 'Configure Target Device (iMPACT)', '-', 'Toolchain Settings', 'About'];
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}

for (const [w, h] of [[375, 812], [430, 932]]) {
  uiTest(`#5121 phone ${w}×${h}: the toolbar's tools and More tools; menus the whole width; a wizard the whole screen`, E, async (page) => {
    await page.setViewport(w, h);
    const silinx = await page.eval(() => document.documentElement.dataset.ui === 'silinx');
    await makeProject(env, { name: `PhoneTb_${w}`, template: 'gates' });
    await page.openProject(`PhoneTb_${w}`);
    assert.deepEqual(await toolbar(page), { shown: ['open', 'undo', 'redo', 'find', 'more'], over: [], page: false });
    // More tools: the others, in their order, as enabled as their buttons (nothing selected: no Cut, Copy, Paste)
    await page.tap('#phone-more');
    const more = await menu(page);
    assert.deepEqual(more.items, ['New Project', 'Close Project', 'Share Project', 'Print', '-', '(Cut)', '(Copy)', '(Paste)', ...(silinx ? [] : ISE_MORE)]);
    assert.ok(more.left === 0 && more.width === w && more.least >= 40 && more.bottom <= h, JSON.stringify(more));
    // New Project from it: the wizard the whole screen, its current step only above its page, nothing wider than it
    await page.tap('body > .menu-popup .mi .lbl', { text: 'New Project' });
    await page.waitDialog('New Project Wizard');
    assert.deepEqual(await page.eval(() => {
      const r = document.querySelector('.dlg-overlay .dlg').getBoundingClientRect(), b = document.querySelector('.dlg-overlay .dlg-body');
      return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), b.scrollWidth <= b.clientWidth, [...document.querySelectorAll('.dlg .wiz-side > *')].filter((s) => s.getClientRects().length).map((s) => s.textContent)];
    }), [0, 0, w, h, true, ['Project Mode']]);
    await page.tap('.dlg-overlay .dlg-buttons .btn', { text: 'Cancel' });
    await page.waitNoDialog();
    // a menu of the header: the menu bar's File (ISE style), Settings (Silinx): the whole width too
    if (silinx) await page.tap('#settings-btn');
    else await page.tap('#menubar .item', { text: 'File' });
    const head = await menu(page);
    assert.ok(head.left === 0 && head.width === w && head.least >= 40 && head.bottom <= h, JSON.stringify(head));
    await page.closeMenus();
    // a tablet in portrait: the toolbar as before, no More tools
    await page.setViewport(768, 1024);
    await page.waitFor(() => !document.getElementById('phone-more').getClientRects().length, [], { what: 'More tools hidden' });
    const wide = await toolbar(page);
    assert.ok(!wide.shown.includes('more') && ['newProject', 'cut', 'paste', 'find'].every((c) => wide.shown.includes(c)), JSON.stringify(wide));
    await noWarnings(page);
  }, { tablet: 'portrait' });
}

uiTest('#5121 phone: More tools in Portuguese', E, async (page) => {
  await page.setViewport(375, 812);
  await makeProject(env, { name: 'PhoneTbPt', template: 'gates' });
  await page.openProject('PhoneTbPt');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.getElementById('phone-more').title === 'Mais ferramentas', [], { what: 'Portuguese' });
  assert.equal(await page.eval(() => document.getElementById('phone-more').getAttribute('aria-label')), 'Mais ferramentas');
  await page.tap('#phone-more');
  const items = (await menu(page)).items;
  assert.deepEqual(items.slice(0, 4), ['Novo Projeto', 'Fechar Projeto', 'Partilhar Projeto', 'Imprimir']);
  await page.closeMenus();
  assert.deepEqual((await toolbar(page)).over, [], 'the header in Portuguese');
  await noWarnings(page);
}, { tablet: 'portrait' });
