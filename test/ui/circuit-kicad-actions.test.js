// UI (#4534): the circuit editor's Parts panel, KiCad's actions in the KiCad catalogue's section. Import KiCad Part… and
// Browse KiCad Libraries… are a row under the section's heading, folded or open; the panel's top holds only the search.
// Import KiCad Part… opens its dialog from there. Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
// (the panel's top, and the row under the catalogue's heading: its buttons' texts; the heading's text; the row its next one)
const where = (page) => page.eval((ed) => {
  const top = [...document.querySelectorAll(`${ed} .circ-lefttools > *`)].map((e) => e.tagName.toLowerCase() + (e.className ? `.${e.className}` : ''));
  const tools = document.querySelector(`${ed} .circ-lib .circ-cat-tools`);
  const head = tools?.previousElementSibling;
  return { top, tools: tools ? [...tools.querySelectorAll('button')].map((b) => b.textContent) : null, head: head?.classList.contains('circ-lib-title') ? head.querySelector('span').textContent : null,
    open: head?.classList.contains('open') ?? null, last: [...document.querySelectorAll(`${ed} .circ-lib > .circ-lib-title`)].pop()?.querySelector('span').textContent };
}, ED);

uiTest('#4534 Parts panel: Import KiCad Part… and Browse KiCad Libraries… in the KiCad catalogue\'s section, none at the top; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircActions', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircActions');
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-cat-tools .circ-import-kicad`), [ED], { what: 'the KiCad catalogue\'s actions' });
  // the catalogue folded at first: its actions under its heading all the same; the top only the search
  assert.deepEqual(await where(page), { top: ['input.circ-search'], tools: ['Import KiCad Part…', 'Browse KiCad Libraries…'], head: 'KiCad catalogue', open: false, last: 'KiCad catalogue' });
  // opened: the same row, under its heading, before its parts
  await page.click(`${ED} .circ-lib-title`, { text: 'KiCad catalogue' });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-cat-part`), [ED], { what: 'the catalogue open' });
  assert.deepEqual(await where(page), { top: ['input.circ-search'], tools: ['Import KiCad Part…', 'Browse KiCad Libraries…'], head: 'KiCad catalogue', open: true, last: 'KiCad catalogue' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-cat-tools`).nextElementSibling.classList.contains('circ-cat-part'), ED), true);
  // a search: the section and its actions still there
  await page.click(`${ED} .circ-search`);
  await page.type('7400');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-lib-part[data-part]`).length === 1, [ED], { what: 'the search' });
  assert.deepEqual((await where(page)).tools, ['Import KiCad Part…', 'Browse KiCad Libraries…']);
  await page.eval((ed) => { const s = document.querySelector(`${ed} .circ-search`); s.value = ''; s.dispatchEvent(new Event('input')); }, ED);
  // Import KiCad Part… from there: its dialog
  await page.click(`${ED} .circ-cat-tools .circ-import-kicad`);
  await page.waitFor(() => document.querySelector('.dlg-overlay input[data-field=kicad-file]'), [], { what: 'Import KiCad Part…\'s dialog' });
  await page.click('.dlg-overlay .dlg-buttons .btn:not(.primary)');
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-cat-tools .circ-import-kicad`)?.textContent === 'Importar peça KiCad…', [ED], { what: 'Portuguese' });
  assert.deepEqual(await where(page), { top: ['input.circ-search'], tools: ['Importar peça KiCad…', 'Explorar bibliotecas KiCad…'], head: 'Catálogo KiCad', open: true, last: 'Catálogo KiCad' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
