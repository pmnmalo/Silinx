// UI (#4754): a page left open across an upgrade of its server (web/js/stale-page.js, the 'silinx-stale' event
// web/js/api.js raises when the server says another version): a WARNING line in the console, and a dialog offering a
// reload (Reload, Later); Later keeps the page. In English and in Portuguese, both interfaces; no browser warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const stale = (page) => page.eval(() => window.dispatchEvent(new CustomEvent('silinx-stale', { detail: { page: '15.28.0', server: '99.0.0' } })));
const dialog = (page) => page.eval(() => {
  const d = document.querySelector('.dlg-overlay');
  return d && [d.querySelector('.dlg-title span')?.textContent, d.querySelector('.msg-text')?.textContent, [...d.querySelectorAll('.dlg-buttons button')].map((b) => b.textContent)];
});
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|ERROR)/.test(l));

uiTest('#4754 a server of another version: a WARNING line and a reload offered; Later keeps the page; in Portuguese', E, async (page) => {
  await page.eval(() => { window.__kept = 1; });
  await stale(page);
  await page.waitFor(() => !!document.querySelector('.dlg-overlay'), [], { what: 'the dialog' });
  assert.deepEqual(await dialog(page), ['Silinx was updated', 'This page is Silinx 15.28.0; the server is Silinx 99.0.0. Reload the page?', ['Reload', 'Later']]);
  assert.deepEqual(await warnings(page), ['WARNING: This page is Silinx 15.28.0, the server Silinx 99.0.0: reload the page to use it (its requests may be refused until then).']);
  await page.click('.dlg-overlay .dlg-buttons button', { text: 'Later' });
  await page.waitFor(() => !document.querySelector('.dlg-overlay'), [], { what: 'the dialog closed' });
  assert.equal(await page.eval(() => window.__kept), 1);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await stale(page);
  await page.waitFor(() => !!document.querySelector('.dlg-overlay'), [], { what: 'the dialog' });
  await page.waitFor(() => document.querySelector('.dlg-overlay').textContent.includes('Recarregar a página?'), [], { what: 'the dialog in Portuguese' });
  assert.deepEqual(await dialog(page), ['O Silinx foi atualizado', 'Esta página é do Silinx 15.28.0; o servidor é do Silinx 99.0.0. Recarregar a página?', ['Recarregar', 'Mais tarde']]);
  assert.equal((await warnings(page))[1], 'WARNING: Esta página é do Silinx 15.28.0, o servidor do Silinx 99.0.0: recarregue a página para o usar (até lá, os seus pedidos podem ser recusados).');
  await page.click('.dlg-overlay .dlg-buttons button', { text: 'Mais tarde' });
  await page.waitFor(() => !document.querySelector('.dlg-overlay'), [], { what: 'the dialog closed' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.equal(await page.eval(() => window.__kept), 1);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
