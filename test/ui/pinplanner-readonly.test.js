// UI: I/O Pin Planning read only (#5247), as the other editors: on a phone (#5121, 375 × 812 with touch) and in a
// followed project (#3181). Its notice at the right end of its toolbar ("Read-only on a phone", "Read-only, following
// Ana's project"); Auto-assign from Board and Clear All hidden; the table's fields disabled; in the Board view no ✕ on
// the ports and a port dragged onto the board places nothing; a pin's right-click menu (Remove … from its pin) not
// shown; nothing to save. On a computer the owner's edits as before. No warnings. In both interfaces
// (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const PP = '.doc:not([hidden]) .pin-planner';

async function openPins(page) {
  await page.eval(async () => (await import('/js/impl-views.js')).openPinPlanner(window.Silinx.project.top));
  await page.waitFor((s) => document.querySelector(`${s} .grid tr td`) && /I\/Os assigned/.test(document.querySelector(`${s} .pp-status`)?.textContent || ''), [PP], { what: 'I/O Pin Planning' });
}
// its notices (and whether nothing of its toolbar's line is right of each), Auto-assign and Clear All shown, the table's
// fields enabled, its status, whether it has changes
const state = (page) => page.eval((s) => {
  const root = document.querySelector(s), bar = root.querySelector('.pp-bar');
  const shown = (e) => !!e && e.getClientRects().length > 0;
  return {
    notices: [...bar.querySelectorAll('.gen-banner.read-only')].filter(shown).map((b) => {
      const r = b.getBoundingClientRect();
      return [b.textContent, [...bar.children].filter((e) => e !== b && shown(e)).every((e) => { const o = e.getBoundingClientRect(); return o.right <= r.left + 0.5 || o.bottom <= r.top + 0.5 || o.top >= r.bottom - 0.5; })];
    }),
    editing: [...bar.querySelectorAll('button')].filter(shown).map((b) => b.textContent.trim()).filter((t) => /Auto-assign|Clear All/.test(t)),
    fields: [...root.querySelectorAll('.pp-table :is(input, select)')].filter((x) => !x.disabled).length,
    status: root.querySelector('.pp-status').textContent,
    dirty: !!window.SilinxApp.findDoc('pins').dirty,
  };
}, PP);
// the Board view: its ports' ✕ and tips; a port dragged onto the board's first LED; a used pin's right-click
async function boardView(page) {
  await page.click(`${PP} .pp-view[data-view=board]`);
  // (a narrow screen: the Ports panel over the board, shown by its ☰ Ports)
  await page.eval((x) => { const side = document.querySelector(`${x} .pp-ports-side`); if (!side.getClientRects().length) [...document.querySelectorAll(`${x} .pp-bar button`)].find((b) => b.textContent === '☰ Ports').click(); }, PP);
  await page.waitFor((s) => document.querySelector(`${s} .pp-portlist .pp-port`)?.getClientRects().length && document.querySelector(`${s} .pp-board .pp-target`), [PP], { what: 'the Board view' });
  const ports = await page.eval((s) => [document.querySelectorAll(`${s} .pp-x`).length, [...document.querySelectorAll(`${s} .pp-port`)].filter((p) => p.title).length], PP);
  const led = await page.eval((s) => { const r = [...document.querySelectorAll(`${s} .pp-board .pp-target`)].find((t) => t.getClientRects().length).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, PP);
  const port = await page.eval((s) => { const r = document.querySelector(`${s} .pp-portlist .pp-port .pp-pname`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, PP);
  await page.drag(port, led);
  await page.eval((s) => { const u = document.querySelector(`${s} .pp-res .res.used`); u?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })); }, PP);
  const menu = await page.eval(() => !!document.querySelector('body > .menu-popup'));
  await page.closeMenus();
  return { ports, menu };
}
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}

uiTest('#5247 I/O Pin Planning on a phone: read only, its notice at its toolbar\'s end, nothing changed', E, async (page) => {
  await page.setViewport(375, 812);
  await makeProject(env, { name: 'PinsPhone', template: 'gates' });
  await page.openProject('PinsPhone');
  await openPins(page);
  const s0 = await state(page);
  assert.deepEqual({ ...s0, status: undefined }, { notices: [['Read-only on a phone', true]], editing: [], fields: 0, status: undefined, dirty: false });
  assert.match(s0.status, /^6\/6 I\/Os assigned$/);
  assert.deepEqual(await boardView(page), { ports: [0, 0], menu: false });
  assert.deepEqual(await state(page), s0, 'nothing placed, nothing changed');
  await noWarnings(page);
}, { tablet: 'portrait' });

uiTest('#5247 I/O Pin Planning on a computer: the owner edits it (no notice, its tools, its fields, the ✕ and the menu)', E, async (page) => {
  await makeProject(env, { name: 'PinsDesk', template: 'gates' });
  await page.openProject('PinsDesk');
  await openPins(page);
  const s = await state(page);
  assert.deepEqual([s.notices, s.editing, s.fields > 0, s.dirty], [[], ['Auto-assign from Board', 'Clear All'], true, false]);
  await page.click(`${PP} .pp-view[data-view=board]`);
  await page.waitFor((x) => document.querySelectorAll(`${x} .pp-x`).length > 0, [PP], { what: 'the ports\' ✕' });
  await noWarnings(page);
});

uiTest('#5247 I/O Pin Planning in a followed project: read only, the follower\'s notice, nothing changed', E, async (page) => {
  await makeProject(env, { name: 'PinsFollow', template: 'gates' });
  await page.openProject('PinsFollow');
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.sharedLink(); });
  const fp = await env.newPage(env.server.url);
  try {
    await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await fp.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
    await fp.waitDialog('Follow a Shared Project');
    await fp.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await fp.dialogButton('Follow');
    await fp.waitFor(() => window.Silinx?.project?.name === 'PinsFollow' && window.Silinx.startupChecked, [], { what: 'the project followed', timeout: 30000 });
    await openPins(fp);
    const s = await state(fp);
    assert.deepEqual([s.notices, s.editing, s.fields, s.dirty], [[["Read-only, following Ana's project", true]], [], 0, false]);
    assert.deepEqual(await boardView(fp), { ports: [0, 0], menu: false });
    assert.deepEqual(await state(fp), s, 'nothing placed, nothing changed');
  } finally { await fp.close(); }
  await noWarnings(page);
});
