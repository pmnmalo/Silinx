// UI: the KiCad catalogue in the circuit editor's Parts panel (#4305): its group folded at first, its count; opened;
// a search finds its parts by their number and title, the group open then; each part's tip in Silinx's words with its
// library and licence; a click imports it through the local server (it fetches nothing here, SILINX_KICAD_OFFLINE: its error in the console,
// nothing written; the import itself: test/kicad-catalogue.test.js); Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newCircuit } from '../../core/circuit.js';
import { CATALOGUE } from '../../core/kicad-catalogue-data.js';

let env;
// (the server fetches nothing: no network in the tests, #4305)
before(async () => { process.env.SILINX_KICAD_OFFLINE = '1'; env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const CAT = (ed, g = 'KiCad catalogue') => `${ed} .circ-lib-part[data-group="${g}"]`;
const title = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-lib-title`)].map((t) => t.textContent).find((t) => /^(KiCad catalogue|Catálogo KiCad) \(/.test(t)), ED);

uiTest('Parts panel: the KiCad catalogue folded, opened, searched, its tips; a part clicked imports it (no network: its error); Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircCat', top: '', files: { 'src/c.circ.json': JSON.stringify(newCircuit('c', 'vhdl'), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircCat');
  await page.eval(() => window.SilinxApp.openFile('src/c.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part`), [ED], { what: 'the parts' });
  // folded at first, its count; a click opens it
  assert.equal(await title(page), `KiCad catalogue (${CATALOGUE.length})`);
  assert.equal(await page.eval((s) => document.querySelectorAll(s).length, CAT(ED)), 0);
  await page.click(`${ED} .circ-lib-title`, { text: `KiCad catalogue (${CATALOGUE.length})` });
  assert.equal(await page.eval((s) => document.querySelectorAll(s).length, CAT(ED)), CATALOGUE.length);
  await page.click(`${ED} .circ-lib-title`, { text: `KiCad catalogue (${CATALOGUE.length})` });
  // a search: its parts, the group open
  await page.click(`${ED} .circ-search`);
  await page.type('nand hct');
  await page.waitFor((s) => document.querySelectorAll(s).length === 1, [CAT(ED)], { what: 'the search' });
  const row = await page.eval((s) => { const b = document.querySelector(s); return [b.dataset.catalogue, b.querySelector('.nm').textContent, b.title, !!b.querySelector('svg.circ-pv-sym')]; }, CAT(ED));
  assert.deepEqual(row, ['kicad-74xx/74HCT00', '74HCT00 (7400)', '74HCT00, as the 7400: Quad 2-input NAND (KiCad 74xx symbols, CC-BY-SA-4.0): click it to import it into the project', true]);
  // a click: imported through the local server, which has no network here: its error, nothing written
  await page.click(CAT(ED));
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^ERROR: KiCad catalogue: /.test(l.textContent)), [], { what: 'its error' });
  assert.ok((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).includes('ERROR: KiCad catalogue: KiCad\'s libraries are not fetched: SILINX_KICAD_OFFLINE is set (only what was kept is used)'));
  assert.equal(fs.existsSync(path.join(env.server.workspace, 'CircCat', 'parts')), false);
  // a drawn-only part: its tip; its drawing a body
  await page.eval((ed) => { const s = document.querySelector(`${ed} .circ-search`); s.value = 'sparkfun conn_01x04'; s.dispatchEvent(new Event('input')); }, ED);
  await page.waitFor((s) => document.querySelectorAll(s).length >= 1, [CAT(ED)], { what: 'a SparkFun part' });
  assert.match(await page.eval((s) => document.querySelector(s).title, CAT(ED)), /^Conn_01x04, drawn only: 4 pin\(s\) \(SparkFun Connector, CC-BY-4\.0\): click it to import it into the project$/);
  assert.equal(await page.eval((s) => !!document.querySelector(`${s} .circ-pv-cat`), CAT(ED)), true);
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.eval((ed) => { const s = document.querySelector(`${ed} .circ-search`); s.value = 'nand hct'; s.dispatchEvent(new Event('input')); }, ED);
  await page.waitFor((s) => document.querySelector(s)?.title.startsWith('74HCT00, como o 7400: '), [CAT(ED, 'KiCad catalogue')], { what: 'Portuguese' });
  assert.equal(await page.eval((s) => document.querySelector(s).title, CAT(ED)), '74HCT00, como o 7400: Quatro portas NAND de 2 entradas (KiCad 74xx symbols, CC-BY-SA-4.0): clique para a importar para o projeto');
  assert.equal(await title(page), 'Catálogo KiCad (1)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
}, { timeout: 120000 });
