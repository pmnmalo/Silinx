// UI: the KiCad catalogue in the circuit editor's Parts panel (#4305): its group folded at first, its count; opened;
// a search finds its parts by their number and title, the group open then; each part's tip in Silinx's words with its
// library and licence; a click imports it through the local server (it fetches nothing here, SILINX_KICAD_OFFLINE: its error in the console,
// nothing written; the import itself: test/kicad-catalogue.test.js); a drawn-only part's preview drawn as the part (#4346);
// Portuguese. Both interfaces.
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
  assert.deepEqual(row, ['kicad-74xx/74HCT00', '74HCT00 Quad 2-input NAND', '74HCT00, as the 7400: Quad 2-input NAND (KiCad 74xx symbols, CC-BY-SA-4.0): click it to import it into the project', true]);
  // a click: imported through the local server, which has no network here: its error, nothing written
  await page.click(CAT(ED));
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^ERROR: KiCad catalogue: /.test(l.textContent)), [], { what: 'its error' });
  assert.ok((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).includes('ERROR: KiCad catalogue: KiCad\'s libraries are not fetched: SILINX_KICAD_OFFLINE is set (only what was kept is used)'));
  assert.equal(fs.existsSync(path.join(env.server.workspace, 'CircCat', 'parts')), false);
  // a drawn-only part: its tip; its preview drawn as the part (#4346: its footprint's drawing kept in the catalogue, its
  // pads), not a box
  await page.eval((ed) => { const s = document.querySelector(`${ed} .circ-search`); s.value = 'sparkfun conn_01x04'; s.dispatchEvent(new Event('input')); }, ED);
  await page.waitFor((s) => document.querySelectorAll(s).length >= 1, [CAT(ED)], { what: 'a SparkFun part' });
  assert.match(await page.eval((s) => document.querySelector(s).title, CAT(ED)), /^Conn_01x04, drawn only: 4 pin\(s\) \(SparkFun Connector, CC-BY-4\.0\): click it to import it into the project$/);
  const pv = (sel) => page.eval((s) => { const v = document.querySelector(`${s} svg.circ-pv`); return { cat: !!v.querySelector('.circ-pv-cat'), fp: v.querySelectorAll('.circ-fp path').length, pins: v.querySelectorAll('.circ-pin').length,
    led: [...v.querySelectorAll('.circ-fp-body')].map((x) => [...x.classList].find((c) => c.startsWith('circ-led-')) ?? null) }; }, sel);
  assert.deepEqual(await pv(CAT(ED)), { cat: false, fp: 4, pins: 4, led: [] });
  // the red LED: its round body red; a 74xx drawn only: a DIP's body and its 14 pins; KiCad's 2N3904 its pads (#4385)
  for (const [q, want] of [['led_red_5mm_pth_nosilk', { cat: false, fp: 9, pins: 2, led: ['circ-led-red'] }], ['7454 drawn', { cat: false, fp: 0, pins: 14, led: [] }],
    // (KiCad's own 2N3904, #4385: no drawing of KiCad's kept, a box round its pads)
    ['2n3904', { cat: false, fp: 0, pins: 3, led: [] }],
    // (an Arduino Nano, #4394: its 30 pads named by its pins)
    ['arduino_nano_socket', { cat: false, fp: 0, pins: 30, led: [] }]]) {
    await page.eval((ed, t) => { const s = document.querySelector(`${ed} .circ-search`); s.value = t; s.dispatchEvent(new Event('input')); }, ED, q);
    await page.waitFor((s) => document.querySelectorAll(s).length === 1, [CAT(ED)], { what: q });
    assert.deepEqual(await pv(CAT(ED)), want, q);
  }
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.eval((ed) => { const s = document.querySelector(`${ed} .circ-search`); s.value = 'nand hct'; s.dispatchEvent(new Event('input')); }, ED);
  await page.waitFor((s) => document.querySelector(s)?.title.startsWith('74HCT00, como o 7400: '), [CAT(ED, 'KiCad catalogue')], { what: 'Portuguese' });
  assert.equal(await page.eval((s) => document.querySelector(s).title, CAT(ED)), '74HCT00, como o 7400: Quatro portas NAND de 2 entradas (KiCad 74xx symbols, CC-BY-SA-4.0): clique para a importar para o projeto');
  assert.equal(await title(page), 'Catálogo KiCad (1)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
}, { timeout: 120000 });

// (#4495) what each part is: its number in bold, its function after it (Silinx's IC's title, KiCad's description
// shortened), on two lines in the panel's width; found by it; in Portuguese, Silinx's titles as the interface translates
// them, KiCad's by the vocabulary, one it does not cover in English (lang="en"), and found by the Portuguese
uiTest('Parts panel: the KiCad catalogue\'s parts say what they are, are found by it; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircFn', top: '', files: { 'src/c.circ.json': JSON.stringify(newCircuit('c', 'vhdl'), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircFn');
  await page.eval(() => window.SilinxApp.openFile('src/c.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part`), [ED], { what: 'the parts' });
  const search = (q) => page.eval((ed, t) => { const s = document.querySelector(`${ed} .circ-search`); s.value = t; s.dispatchEvent(new Event('input')); }, ED, q);
  const rows = (g = 'KiCad catalogue') => page.eval((s) => [...document.querySelectorAll(s)].map((b) => { const n = b.querySelector('.nm'), f = n.querySelector('.fn');
    return [b.dataset.catalogue, n.querySelector('b').textContent, f?.textContent ?? null, f?.getAttribute('lang') ?? null]; }), CAT(ED, g));
  await search('retriggerable monostable 74ls');
  await page.waitFor((s) => document.querySelectorAll(s).length === 2, [CAT(ED)], { what: 'the monostables' });
  assert.deepEqual(await rows(), [['kicad-74xx/74LS122', '74LS122', 'Retriggerable monostable', null], ['kicad-74xx/74LS123', '74LS123', 'Dual retriggerable monostable', null]]);
  // (the number bold, the function after it, on a second line in the panel's width)
  const look = await page.eval((s) => { const n = document.querySelector(`${s} .nm`), b = n.querySelector('b'), f = n.querySelector('.fn');
    return { bold: Number(getComputedStyle(b).fontWeight) >= 600, lines: Math.round(n.getBoundingClientRect().height / parseFloat(getComputedStyle(n).lineHeight)), below: f.getBoundingClientRect().bottom > b.getBoundingClientRect().bottom }; }, CAT(ED));
  assert.deepEqual(look, { bold: true, lines: 2, below: true });
  // (Silinx's IC's title for a part that behaves as one)
  await search('4049');
  await page.waitFor((s) => document.querySelectorAll(s).length === 1, [CAT(ED)], { what: 'the 4049' });
  assert.deepEqual(await rows(), [['kicad-4xxx/4049', '4049', 'Hex inverting buffer', null]]);
  // found by what they are
  for (const [q, id] of [['inverter', 'kicad-4xxx/40106'], ['flip-flop', 'kicad-74xx/74LS109'], ['multiplexer', 'kicad-4xxx/4051']]) {
    await search(q);
    await page.waitFor((s, i) => [...document.querySelectorAll(s)].some((b) => b.dataset.catalogue === i), [CAT(ED), id], { what: q });
    assert.ok((await rows()).every(([, , f]) => f.toLowerCase().includes(q)), q);
  }
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await search('retriggerable monostable 74ls');
  await page.waitFor((s) => document.querySelector(`${s} .fn`)?.textContent === 'Monoestável redisparável', [CAT(ED, 'KiCad catalogue')], { what: 'Portuguese' });
  assert.deepEqual(await rows(), [['kicad-74xx/74LS122', '74LS122', 'Monoestável redisparável', null], ['kicad-74xx/74LS123', '74LS123', 'Dois monoestáveis redisparáveis', null]]);
  await search('seis buffers inversores');
  await page.waitFor((s) => [...document.querySelectorAll(s)].some((b) => b.dataset.catalogue === 'kicad-4xxx/4049'), [CAT(ED)], { what: 'the 4049 in Portuguese' });
  assert.deepEqual((await rows()).find((r) => r[0] === 'kicad-4xxx/4049'), ['kicad-4xxx/4049', '4049', 'Seis buffers inversores', null]);
  await search('descodificador 74ls42');
  await page.waitFor((s) => document.querySelectorAll(s).length === 1, [CAT(ED)], { what: 'a decoder in Portuguese' });
  // (the 74LS42 behaves as the 7442, #4397: its title the interface's Portuguese)
  assert.deepEqual(await rows(), [['kicad-74xx/74LS42', '74LS42', 'Descodificador BCD para decimal', null]]);
  // (one the vocabulary does not cover: KiCad's words, in English)
  await search('4046');
  await page.waitFor((s) => document.querySelectorAll(s).length === 1, [CAT(ED)], { what: 'the 4046' });
  assert.deepEqual(await rows(), [['kicad-4xxx/4046', '4046', 'Phase comp & VCO', 'en']]);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  await page.waitFor((s) => document.querySelector(`${s} .fn`)?.textContent === 'Phase comp & VCO', [CAT(ED)], { what: 'English again' });
  assert.deepEqual(await rows(), [['kicad-4xxx/4046', '4046', 'Phase comp & VCO', null]]);
}, { timeout: 120000 });
