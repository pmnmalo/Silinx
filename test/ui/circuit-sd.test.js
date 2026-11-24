// UI (#5477): an SD card module in the Circuit editor: the Parts panel's Outputs list it; drawn (its board, its socket and
// card, its pins' names); Check; Try it: `card off`, 0 written; its host's switches (SCK, MOSI, CS) clock it up and send
// CMD0 (through the simulation, its 400 edges), then CS clicked high: `card idle`; its Part info and its state in
// Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const CIRC = { format: 'silinx-circuit', version: 1, name: 'sd', lang: 'vhdl',
  parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 }, { id: 'SD1', type: 'sd-card', x: 0, y: 0 }, { id: 'MOSI', type: 'logic-switch', x: 3, y: 4, on: true }, { id: 'SCK', type: 'logic-switch', x: 4, y: 6 },
    { id: 'CS', type: 'logic-switch', x: 5, y: 8, on: true }, { id: 'D1', type: 'led', x: -3, y: 3 }],
  wires: [{ id: 'm', points: [[3, 4], [3, 0]], color: 'blue' }, { id: 'k', points: [[4, 6], [4, 0]], color: 'blue' }, { id: 'c', points: [[5, 8], [5, 0]], color: 'blue' }, { id: 'o', points: [[2, 0], [2, 2], [-3, 2], [-3, 3]], color: 'blue' },
    { id: 'dk', points: [[-2, 3], [-10, -13]], color: 'black' }, { id: 'g', points: [[0, 0], [-11, 0], [-11, -13], [-10, -13]], color: 'black' }, { id: 'v', points: [[1, 0], [1, -1], [-12, -1], [-12, -14], [-10, -14]], color: 'red' }] };
const state = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-canvas [data-id=SD1] .circ-sd-state`)].map((t) => t.textContent), ED);

uiTest('#5477 Circuit editor: an SD card module drawn, Try it\'s state as it is clocked up and sent CMD0; its Part info and state in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircSd', top: '', files: { 'src/sd.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircSd');
  await page.eval(() => window.SilinxApp.openFile('src/sd.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=SD1] .circ-sd-card`), [ED], { what: 'the SD module drawn' });
  await page.eval(() => window.Silinx.active.circuitEditor.fit());
  assert.deepEqual(await page.eval((ed) => { const b = document.querySelector(`${ed} .circ-lib-part[data-part="sd-card"]`); return [b?.dataset.group, b?.textContent]; }, ED), ['Outputs', 'SD card module (SPI, microSD)']);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-canvas [data-id=SD1] .circ-sd-pin`)].map((t) => t.textContent), ED), ['GND', 'VCC', 'MISO', 'MOSI', 'SCK', 'CS']);
  assert.deepEqual(await state(page), []);
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  // Try it: off; 80 clocks with CS high, CS low, CMD0 and two bytes of FF (through the simulation); CS clicked high: idle
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  assert.deepEqual(await state(page), ['card off', '0 written']);
  await page.eval(() => {
    const sim = window.Silinx.active.circuitEditor.sim(), set = (k, v) => { sim.advance(5000); sim.set(k, !!v); sim.run(); };
    for (let i = 0; i < 80; i++) { set('SCK', 1); set('SCK', 0); }
    set('CS', 0);
    for (const b of [0x40, 0, 0, 0, 0, 0x95, 0xff, 0xff]) for (let k = 7; k >= 0; k--) { set('MOSI', (b >> k) & 1); set('SCK', 1); set('SCK', 0); }
  });
  await page.click(`${ED} .circ-canvas [data-id=CS]`);
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=SD1] .circ-sd-state`)?.textContent === 'card idle', [ED], { what: 'card idle' });
  assert.deepEqual(await state(page), ['card idle', '0 written']);
  // (in Portuguese, while trying it: its state)
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=SD1] .circ-sd-state`)?.textContent === 'cartão em espera', [ED], { what: 'its state in Portuguese' });
  assert.deepEqual(await state(page), ['cartão em espera', '0 escrito(s)']);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'stopped' });
  // its Part info, in Portuguese
  await page.eval(() => window.Silinx.active.circuitEditor.select({ kind: 'part', id: 'SD1' }));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info .circ-note`), [ED], { what: 'SD1 selected' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^Um módulo de cartão microSD/.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent), [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="sd-card"]`)?.textContent, ED), 'Módulo de cartão SD (SPI, microSD)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
