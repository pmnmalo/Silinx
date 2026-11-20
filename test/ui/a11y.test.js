// UI (#4761): the interface's accessibility. The menu bar (role menubar, its menus menuitems) taken by F10 or Alt alone,
// ← → between its menus, ↓ opening one on its first entry (role menu, its entries menuitems), Esc back on the bar then
// back where the focus was; a command run from it acts where the focus was; a context menu (Shift+F10 on the Design
// tree) entered by ↓, left by Esc. A dialog: role dialog, aria-modal, named by its title, Tab and Shift+Tab kept inside
// it, Ctrl+P not reaching the document behind, the focus back where it was when it closes. The document tabs (tablist,
// tab, aria-selected), the Design tree (tree, treeitem, aria-selected, aria-expanded, aria-activedescendant), the
// console a polite live log, the toasts a live status kept while focused or hovered. Both interfaces; Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, tick } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'entity top is end;\narchitecture a of top is begin end;\n';
const focused = (page) => page.eval(() => {
  const a = document.activeElement;
  return a ? { tag: a.tagName, role: a.getAttribute('role'), text: (a.querySelector?.('.lbl') || a).textContent.trim(), tree: !!a.closest('#hier .tree') } : null;
});
const menuOpen = (page) => page.eval(() => {
  const m = document.querySelector('body > .menu-popup');
  return m ? { role: m.getAttribute('role'), rows: [...m.querySelectorAll(':scope > .mi')].map((r) => r.getAttribute('role')).every((r) => r === 'menuitem' || r === 'menuitemcheckbox') } : null;
});
const focusTree = (page) => page.eval(() => document.querySelector('#hier .tree').focus());
const noProblems = (page) => assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);

uiTest('#4761 the menu bar and the menus from the keyboard: F10 or Alt, the arrows, Esc back where the focus was', E, async (page) => {
  await makeProject(env, { name: 'A11yMenu', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('A11yMenu');
  const bar = await page.eval(() => {
    const el = document.getElementById('menubar');
    const items = [...el.querySelectorAll(':scope > .item')].filter((x) => x.getClientRects().length);
    return { role: el.getAttribute('role'), items: items.map((x) => [x.textContent, x.getAttribute('role'), x.getAttribute('aria-haspopup'), x.getAttribute('aria-expanded')]) };
  });
  assert.equal(bar.role, 'menubar');
  await focusTree(page);
  // (the Silinx interface shows no menu bar: F10 and Alt leave the focus where it is)
  if (!bar.items.length) {
    for (const k of ['F10', 'Alt']) { await page.key(k); assert.equal((await focused(page)).tree, true, k); }
  } else await barKeys(page, bar);
  // a context menu (Shift+F10 on the tree's row): ↓ takes the keyboard into it, Esc closes it, back in the tree
  await page.key('ArrowDown');
  await page.key('F10', { modifiers: 8 });
  await page.waitFor(() => document.querySelector('body > .menu-popup'), [], { what: 'the row\'s menu' });
  assert.deepEqual(await menuOpen(page), { role: 'menu', rows: true });
  await page.key('ArrowDown');
  assert.ok(await page.eval(() => document.activeElement.matches('body > .menu-popup > .mi')));
  await page.key('Escape');
  assert.equal(await menuOpen(page), null);
  assert.equal((await focused(page)).tree, true);
  noProblems(page);
});

async function barKeys(page, bar) {
  assert.ok(bar.items.length >= 2, JSON.stringify(bar));
  for (const [, role, popup, expanded] of bar.items) assert.deepEqual([role, popup, expanded], ['menuitem', 'menu', 'false']);
  const [first, second] = bar.items.map((x) => x[0]);
  // F10: the bar's first menu; → the next; ↓ opens it on its first entry
  await page.key('F10');
  assert.deepEqual(await focused(page), { tag: 'DIV', role: 'menuitem', text: first, tree: false });
  await page.key('ArrowRight');
  assert.equal((await focused(page)).text, second);
  await page.key('ArrowLeft');
  await page.key('ArrowDown');
  assert.deepEqual(await menuOpen(page), { role: 'menu', rows: true });
  assert.equal(await page.eval((m) => document.querySelector(`#menubar .item[data-menu="${m}"]`).getAttribute('aria-expanded'), first), 'true');
  const firstEntry = await page.eval(() => document.querySelector('body > .menu-popup > .mi:not(.disabled)').textContent);
  assert.equal(await page.eval(() => document.activeElement.textContent), firstEntry);
  await page.key('ArrowDown');
  assert.notEqual(await page.eval(() => document.activeElement.textContent), firstEntry);
  // → in an open menu: the next menu of the bar, open on its first entry
  await page.key('ArrowRight');
  assert.equal(await page.eval(() => document.querySelector('#menubar .item.open')?.textContent), second);
  assert.ok(await page.eval(() => document.querySelector('body > .menu-popup').contains(document.activeElement)));
  // Esc: the menu closed, back on its name in the bar; Esc again: back in the tree
  await page.key('Escape');
  assert.equal(await menuOpen(page), null);
  assert.equal((await focused(page)).text, second);
  await page.key('Escape');
  assert.equal((await focused(page)).tree, true);
  // Alt alone: the bar too
  await page.key('Alt');
  assert.equal((await focused(page)).text, first);
  await page.key('Escape');
  assert.equal((await focused(page)).tree, true);
}

uiTest('#4761 a dialog: role dialog, named by its title, Tab kept inside, Ctrl+P not reaching the document, the focus back', E, async (page) => {
  await makeProject(env, { name: 'A11yDlg', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('A11yDlg');
  await focusTree(page);
  await page.eval(() => {
    window.__dlg = import('/js/ui.js').then(({ dialog, h }) => dialog({ title: 'Test Dialog', body: h('div', {}, h('input', { type: 'text', id: 'a11y-a' }), h('input', { type: 'text', id: 'a11y-b' })) }));
  });
  await page.waitFor(() => document.querySelector('.dlg-overlay [role=dialog]'), [], { what: 'the dialog' });
  const d = await page.eval(() => {
    const el = document.querySelector('.dlg-overlay [role=dialog]');
    return { modal: el.getAttribute('aria-modal'), name: document.getElementById(el.getAttribute('aria-labelledby'))?.textContent, x: el.querySelector('.dlg-x').getAttribute('aria-label'), at: document.activeElement.id };
  });
  assert.deepEqual(d, { modal: 'true', name: 'Test Dialog', x: 'Close', at: 'a11y-a' });
  // Tab through its fields and buttons, then round to its first again; Shift+Tab the other way
  const seen = [];
  for (let i = 0; i < 5; i++) { await page.key('Tab'); seen.push(await page.eval(() => document.activeElement.id || document.activeElement.textContent)); }
  assert.deepEqual(seen, ['a11y-b', 'OK', 'Cancel', '✕', 'a11y-a']);
  await page.key('Tab', { modifiers: 8 });
  assert.equal(await page.eval(() => document.activeElement.textContent), '✕');
  // Ctrl+P: prevented in the dialog (the app prints nothing behind it)
  await page.eval(() => { window.__p = null; addEventListener('keydown', (e) => { if (e.key === 'p') window.__p = e.defaultPrevented; }, { once: true }); });
  await page.key('p', { modifiers: 2 });
  assert.equal(await page.eval(() => window.__p), true);
  await page.key('Escape');
  assert.equal(await page.eval(() => window.__dlg), null);
  assert.equal((await focused(page)).tree, true);
  noProblems(page);
});

uiTest('#4761 the document tabs, the Design tree, the console and the toasts: their roles; a toast kept while focused; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'A11yTabs', top: 'top', files: { 'src/top.vhd': TOP, 'src/b.vhd': 'entity b is end;\narchitecture a of b is begin end;\n' } });
  await page.openProject('A11yTabs');
  for (const f of ['src/top.vhd', 'src/b.vhd']) await page.eval((x) => window.SilinxApp.openFile(x), f);
  await page.waitFor(() => window.Silinx.docs.length >= 2, [], { what: 'two documents' });
  const tabs = () => page.eval(() => ({ list: document.getElementById('doc-tabs').getAttribute('role'), tabs: window.Silinx.docs.map((d) => [d.tab.getAttribute('role'), d.tab.getAttribute('aria-selected'), d === window.Silinx.active]) }));
  let t = await tabs();
  assert.equal(t.list, 'tablist');
  for (const [role, sel, active] of t.tabs) assert.deepEqual([role, sel], ['tab', String(active)]);
  await page.eval(() => window.SilinxApp.activateDoc(window.Silinx.docs[0]));
  t = await tabs();
  assert.deepEqual(t.tabs.map((x) => x[1]), ['true', ...t.tabs.slice(1).map(() => 'false')]);
  // the Design tree: its rows treeitems, the selected one said
  await focusTree(page);
  await page.key('ArrowDown');
  const tree = await page.eval(() => {
    const el = document.querySelector('#hier .tree'), sel = el.querySelector('.row.sel').parentElement;
    return { role: el.getAttribute('role'), active: el.getAttribute('aria-activedescendant') === sel.id, item: sel.getAttribute('role'), selected: sel.getAttribute('aria-selected'),
      others: [...el.querySelectorAll('[role=treeitem][aria-selected=true]')].length, root: el.querySelector('[role=treeitem]').getAttribute('aria-expanded'),
      groups: [...el.querySelectorAll('[role=treeitem] > ul')].every((u) => u.getAttribute('role') === 'group') };
  });
  assert.deepEqual(tree, { role: 'tree', active: true, item: 'treeitem', selected: 'true', others: 1, root: 'true', groups: true });
  // collapsed: aria-expanded follows
  await page.eval(() => document.querySelector('#hier .tree [role=treeitem] > .row .twisty').click());
  assert.equal(await page.eval(() => document.querySelector('#hier .tree [role=treeitem]').getAttribute('aria-expanded')), 'false');
  // the console and the toasts: live regions
  assert.deepEqual(await page.eval(() => [document.getElementById('console-log').getAttribute('role'), document.getElementById('console-log').getAttribute('aria-live')]), ['log', 'polite']);
  await page.eval(() => import('/js/ui.js').then(({ toast }) => toast('Done (#4761)', 'info', 300, { label: 'Undo', run: () => {} })));
  assert.deepEqual(await page.eval(() => [document.querySelector('.toasts').getAttribute('role'), document.querySelector('.toasts').getAttribute('aria-live')]), ['status', 'polite']);
  const MINE = 'Done (#4761)';
  await page.eval((t) => [...document.querySelectorAll('.toasts .toast')].find((x) => x.textContent.startsWith(t)).querySelector('.toast-action').focus(), MINE);
  await tick(700);
  assert.equal(await page.eval((t) => [...document.querySelectorAll('.toasts .toast')].some((x) => x.textContent.startsWith(t)), MINE), true, 'kept while its button has the focus');
  await page.eval(() => document.activeElement.blur());
  await page.waitFor((t) => ![...document.querySelectorAll('.toasts .toast')].some((x) => x.textContent.startsWith(t)), [MINE], { what: 'the toast gone once the focus left it' });
  // Portuguese: the tabs' list named in it
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  assert.equal(await page.eval(() => document.getElementById('doc-tabs').getAttribute('aria-label')), 'Documentos');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  noProblems(page);
});
