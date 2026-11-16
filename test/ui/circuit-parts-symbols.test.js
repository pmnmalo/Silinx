// UI (#4242): the circuit editor's Parts panel draws its gate ICs as their schematic symbols in Settings ▸ Schematic
// Symbols' standard (#4113): IEEE Std 91-1984's distinctive shapes by default (the 7400's NAND a D: an arc, no box, the
// 7432's OR a shield), IEC 60617-12's boxes once it is chosen, drawn again at once with the circuit open; back to the
// shapes. (Its images were kept by part type alone: the first standard drawn stayed.) The other parts as they are. No
// warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';

/** Settings ▸ Schematic Symbols (View ▸ in the ISE style interface), `pick` clicked. */
async function chooseSymbols(page, pick) {
  await page.closeMenus();
  const ise = await page.eval(() => document.documentElement.dataset.ui === 'ise');
  let items;
  if (ise) items = await page.openMenu('View');
  else {
    await page.click('#settings-btn');
    await page.waitForSelector('body > .menu-popup .mi');
    items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup:not(.sub) > .mi .lbl')].map((l) => ({ label: l.textContent })));
  }
  const idx = items.findIndex((x) => x.label === 'Schematic Symbols');
  assert.ok(idx >= 0, items.map((x) => x.label).join(' | '));
  await page.hover(await page.point(ise ? 'body > .menu-popup > .mi' : 'body > .menu-popup:not(.sub) > .mi', { index: idx }));
  await page.waitForSelector('.menu-popup.sub .mi');
  const subs = await page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi .lbl')].map((l) => l.textContent));
  await page.click('.menu-popup.sub .mi', { index: subs.indexOf(pick) });
}
// a part's image in the Parts panel: [boxes, an AND's arc, an OR's shield (its curves)]
const look = (page, part) => page.eval((ed, t) => {
  const s = document.querySelector(`${ed} .circ-lib-part[data-part="${t}"] svg`);
  const ds = [...s.querySelectorAll('path.gate')].map((p) => p.getAttribute('d'));
  return [s.querySelectorAll('rect.gate').length, ds.some((d) => / A[\d.]+,[\d.]+ 0 0 1 /.test(d)), ds.some((d) => /Q.*Q/.test(d))];
}, ED, part);
const IEEE = { 7400: [0, true, false], 7432: [0, false, true] }, IEC = { 7400: [1, false, false], 7432: [1, false, false] };
const looks = async (page) => ({ 7400: await look(page, '7400'), 7432: await look(page, '7432') });

uiTest('#4242 the Parts panel\'s gate ICs in Settings ▸ Schematic Symbols\' standard, drawn again when it changes', E, async (page) => {
  await makeProject(env, { name: 'CircParts', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircParts');
  await page.eval(() => { try { localStorage.removeItem('silinx.symbols'); } catch { /* none */ } });
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="7400"] svg`), [ED], { what: 'the Parts panel' });
  // IEEE Std 91-1984, the default
  assert.deepEqual(await looks(page), IEEE);
  const others = await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="led"] svg`).outerHTML, ED);
  // IEC 60617-12 chosen with the circuit open: boxes, at once
  await chooseSymbols(page, 'IEC 60617-12 (rectangular)');
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="7400"] svg rect.gate`), [ED], { what: 'the boxes' });
  assert.deepEqual(await looks(page), IEC);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="led"] svg`).outerHTML, ED), others);
  // back to the distinctive shapes
  await chooseSymbols(page, 'IEEE Std 91-1984 (distinctive shapes)');
  await page.waitFor((ed) => !document.querySelector(`${ed} .circ-lib-part[data-part="7400"] svg rect.gate`), [ED], { what: 'the shapes again' });
  assert.deepEqual(await looks(page), IEEE);
  await page.eval(() => { try { localStorage.removeItem('silinx.symbols'); } catch { /* none */ } });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
