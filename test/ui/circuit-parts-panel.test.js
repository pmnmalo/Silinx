// UI: the circuit editor's Parts panel (#4062): on the left of the canvas, the Properties on the right without the parts;
// each part's drawing (an IC's the schematic's symbol of its gate or block); the search; a category folded and opened; a
// part placed from it; the panel folded to a strip, remembered; Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const rows = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-lib-part`)].map((b) => b.dataset.part), ED);

uiTest('Circuit editor: the Parts panel on the left, its drawings, search, categories; a part placed; folded, remembered; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircParts', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircParts');
  await page.eval(() => { try { localStorage.removeItem('silinx.circuit.parts.folded'); } catch { /* none */ } });
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part`), [ED], { what: 'the parts' });
  // on the left of the canvas; the Properties on its right, no parts in them
  const sides = await page.eval((ed) => {
    const x = (s) => document.querySelector(`${ed} ${s}`).getBoundingClientRect();
    return { parts: x('.circ-parts-side').right <= x('.circ-canvas').left + 1, props: x('.asm-side').left >= x('.circ-canvas').right - 1, inProps: document.querySelectorAll(`${ed} .asm-side .circ-lib-part`).length };
  }, ED);
  assert.deepEqual(sides, { parts: true, props: true, inProps: 0 });
  assert.equal((await rows(page)).length, 64);
  // the drawings: a gate IC's its gate's schematic symbol, an MSI's its block's, a breadboard's and an LED's their own
  assert.deepEqual(await page.eval((ed) => ['7400', '74138', 'breadboard-half', 'led'].map((t) => document.querySelector(`${ed} .circ-lib-part[data-part="${t}"] svg`).classList.contains('circ-pv-sym')), ED), [true, true, false, false]);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="7400"] svg .gate`) !== null, ED), true);
  // the search; a category folded, opened
  await page.click(`${ED} .circ-search`);
  await page.type('xor');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-lib-part`).length === 3, [ED], { what: 'the search' });
  assert.deepEqual(await rows(page), ['7486', '4030', '4070']);
  await page.eval((ed) => { const s = document.querySelector(`${ed} .circ-search`); s.value = ''; s.dispatchEvent(new Event('input')); }, ED);
  await page.click(`${ED} .circ-lib-title`, { text: 'Breadboards (2)' });
  assert.deepEqual((await rows(page)).slice(0, 2), ['supply', 'pull-up']);
  await page.click(`${ED} .circ-lib-title`, { text: 'Breadboards (2)' });
  assert.deepEqual((await rows(page)).slice(0, 2), ['breadboard-half', 'breadboard-full']);
  // a part placed from it: a 7404 by a click on it, then on the canvas
  await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="7404"]`).scrollIntoView({ block: 'center' }), ED);
  await page.click(`${ED} .circ-lib-part[data-part="7404"]`);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="7404"]`).classList.contains('active'), ED), true);
  const free = await page.eval((ed) => { const r = document.querySelector(`${ed} .circ-canvas`).getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height - 30 }; }, ED);
  await page.click(free);
  await page.waitFor((ed) => /^3 IC/.test(document.querySelector(`${ed} .doc-status .ds-f`).textContent), [ED], { what: 'a 7404 placed' });
  // folded to a strip, remembered
  await page.click(`${ED} .circ-parts-side .asm-fold`);
  assert.equal(await page.eval((ed) => document.querySelector(ed).classList.contains('parts-folded'), ED), true);
  assert.equal(await page.eval(() => localStorage.getItem('silinx.circuit.parts.folded')), '1');
  assert.ok(await page.eval((ed) => document.querySelector(`${ed} .circ-parts-side`).getBoundingClientRect().width < 30, ED));
  await page.click(`${ED} .circ-parts-side`);
  assert.equal(await page.eval((ed) => document.querySelector(ed).classList.contains('parts-folded'), ED), false);
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-parts-side .asm-fold`).title === 'Recolher o painel das peças', [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-parts-btn`).textContent, ED), '☰ Peças');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
