// UI (#4762): one dialog framework. SSim's dialogs (Force Constant, Force Clock, the stimuli's), the schematic editor's
// Symbol Info and the command palette are ui.js's dialog(): a modal role dialog with its name, one stack (the innermost
// alone answers Esc), Tab kept inside, the focus given back when it closes, a button's validation closing it at once
// (Apply leaving it open). Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const noProblems = (page) => assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
// the dialog in front: its role, modal, name, and whether Tab and Shift+Tab stay in it
const front = (page) => page.eval(() => {
  const d = [...document.querySelectorAll('.dlg-overlay [role=dialog]')].pop();
  if (!d) return null;
  return { modal: d.getAttribute('aria-modal'), name: d.getAttribute('aria-label') || document.getElementById(d.getAttribute('aria-labelledby'))?.textContent, inside: d.contains(document.activeElement) };
});
async function tabsStay(page) {
  for (const m of [0, 8, 0, 0, 8]) {
    await page.key('Tab', { modifiers: m });
    assert.equal((await front(page)).inside, true, `Tab (${m})`);
  }
}

uiTest('#4762 SSim\'s Force dialog and Symbol Info are dialog()s: role, name, Tab inside, Esc, the focus back', E, async (page) => {
  await makeProject(env, { name: 'OneDlg', top: '', files: {} });
  await page.openProject('OneDlg');
  await page.eval(async () => {
    const host = document.createElement('div');
    host.className = 'isim';
    host.tabIndex = 0;
    host.id = 'one-dlg-host';
    document.body.append(host);
    host.focus();
    const { mountDialogs } = await import('/js/isim-dialogs.js');
    const V = await import('/core/values.js');
    const sig = { name: 'q', path: 'top.q', t: { kind: 'logic', w: 4, s: false }, val: V.fromInt(3, 4), wave: [] };
    window.__d = mountDialogs({ root: host, sim: { now: 0, valueAt: (s) => s.val }, addForce: () => {}, echo: () => {} });
    window.__done = window.__d.forceDialog(sig, 'const');
  });
  assert.deepEqual(await front(page), { modal: 'true', name: 'Force Selected Signal', inside: true });
  assert.equal(await page.eval(() => document.activeElement.name), 'value');
  await tabsStay(page);
  // Apply: the dialog left open; Esc: closed, the focus back on the window
  await page.eval(() => document.querySelector('#one-dlg-host [data-a=apply]').click());
  assert.equal(await page.eval(() => document.querySelectorAll('#one-dlg-host .dlg-overlay').length), 1);
  await page.key('Escape');
  assert.equal(await page.eval(() => window.__done), null);
  assert.equal(await page.eval(() => document.activeElement.id), 'one-dlg-host');
  // Symbol Info: its own header, the dialog's role, Esc, the focus back
  await page.eval(async () => {
    const host = document.getElementById('one-dlg-host');
    host.classList.add('sch-editor');
    host.focus();
    const { openSymbolInfo } = await import('/js/symbol-info.js');
    window.__closed = 0;
    openSymbolInfo({ container: host, type: 'AND2', draw: () => '', onClose: () => { window.__closed++; } });
  });
  await page.waitFor(() => document.querySelector('#one-dlg-host .se-symdoc .se-dhead b'), [], { what: 'Symbol Info' });
  assert.deepEqual(await front(page), { modal: 'true', name: 'Symbol Info', inside: true });
  await tabsStay(page);
  await page.key('Escape');
  assert.deepEqual(await page.eval(() => [document.querySelectorAll('#one-dlg-host .dlg-overlay').length, window.__closed, document.activeElement.id]), [0, 1, 'one-dlg-host']);
  noProblems(page);
});

uiTest('#4762 the command palette is a dialog(): role, name, Esc, the focus back; over another dialog, Esc closes the innermost', E, async (page) => {
  await makeProject(env, { name: 'OneDlgPal', top: '', files: {} });
  await page.openProject('OneDlgPal');
  await page.eval(() => document.querySelector('#hier .tree').focus());
  await page.eval(async () => { window.__pal = (await import('/js/palette.js')).openPalette({ commands: [], files: [{ path: 'a.vhd', open: () => {} }] }); });
  assert.deepEqual(await front(page), { modal: 'true', name: 'Command palette', inside: true });
  assert.equal(await page.eval(() => document.activeElement.classList.contains('pal-input')), true);
  await page.key('Escape');
  assert.equal(await page.eval(() => window.__pal), null);
  assert.equal(await page.eval(() => !!document.activeElement.closest('#hier .tree')), true);
  // a dialog over a dialog: Esc closes the one in front only
  await page.eval(async () => {
    const { dialog } = await import('/js/ui.js');
    window.__outer = dialog({ title: 'Outer', body: document.createElement('div') });
    window.__inner = (await import('/js/palette.js')).openPalette({ commands: [], files: [] });
  });
  await page.key('Escape');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay [role=dialog]')].map((d) => d.getAttribute('aria-label') || d.textContent.slice(0, 5))), ['Outer']);
  await page.key('Escape');
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay').length), 0);
  noProblems(page);
});
