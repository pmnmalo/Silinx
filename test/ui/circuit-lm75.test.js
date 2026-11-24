// UI (#5342): the temperature sensor LM75. The Circuit editor: its row in the Parts panel's Inputs; a circuit with the
// LM75 at 79 °C, an LED from + to its OS (pulled up): Try it, its + clicked twice (81 °C, over TOS: OS active, the LED lit),
// its − clicked down to 76 °C (still lit: THYST 75 °C) and 74 °C (dark); its Properties' Temperature saved; Check with
// no warnings; Portuguese. The System Emulator: the circuit as a System's node, its + clicked, the temperature the run's.
// Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const CIRC = { format: 'silinx-circuit', version: 1, name: 'temp', lang: 'vhdl',
  parts: [{ id: 'P1', type: 'supply', x: -6, y: -10 }, { id: 'U1', type: 'lm75', x: 0, y: 0, temp: 79 }, { id: 'R1', type: 'pull-up', x: 8, y: -6 }, { id: 'D1', type: 'led', x: 5, y: 4, color: 'red' }],
  wires: [{ id: 'wg', points: [[3, 0], [-6, -9]], color: 'black' }, { id: 'wv', points: [[0, -3], [-6, -10]], color: 'red' }, { id: 'wo', points: [[8, -6], [2, 0]], color: 'blue' },
    { id: 'wa', points: [[5, 4], [-6, -10]], color: 'red' }, { id: 'wk', points: [[6, 4], [2, 0]], color: 'blue' }] };
const centre = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const shown = (page) => page.eval((ed) => [document.querySelector(`${ed} [data-id=U1] .circ-temp`).textContent, document.querySelector(`${ed} [data-id=D1] .circ-led`).classList.contains('lit')], ED);

uiTest('#5342 Circuit editor: the LM75\'s + and − in Try it, its OS lighting an LED over TOS until under THYST; its Temperature; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircTemp', top: '', files: { 'src/temp.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircTemp');
  await page.eval(() => window.SilinxApp.openFile('src/temp.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=U1] .circ-temp`), [ED], { what: 'the LM75 drawn' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="lm75"]`)?.dataset.group, ED), 'Inputs');
  assert.deepEqual(await shown(page), ['79.0 °C', false]);
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  // Try it: + twice, over TOS
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  const click = async (input) => page.click(await centre(page, `${ED} [data-id=U1] [data-input="${input}"] rect`));
  await click('temp-up'); await click('temp-up');
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=U1] .circ-temp`).textContent === '81.0 °C', [ED], { what: '81 °C' });
  assert.deepEqual(await shown(page), ['81.0 °C', true]);
  for (let k = 0; k < 5; k++) await click('temp-down');
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=U1] .circ-temp`).textContent === '76.0 °C', [ED], { what: '76 °C' });
  assert.deepEqual(await shown(page), ['76.0 °C', true], 'still over THYST');
  await click('temp-down'); await click('temp-down');
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=U1] .circ-temp`).textContent === '74.0 °C', [ED], { what: '74 °C' });
  assert.deepEqual(await shown(page), ['74.0 °C', false]);
  await page.click(`${ED} .circ-sim-btn`);
  // its Properties: its saved temperature
  await page.click(await page.eval((ed) => { const r = document.querySelector(`${ed} [data-id=U1] .circ-ic-body`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 6 }; }, ED));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-temp-in`), [ED], { what: 'U1 selected' });
  await page.fill(`${ED} .circ-selection .circ-temp-in`, '60');
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts.find((p) => p.id === 'U1').temp === 60, [], { what: 'saved 60 °C' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} [data-id=U1] .circ-temp`).textContent, ED), '60.0 °C');
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^U1: Sensor de temperatura LM75/.test(document.querySelector(`${ed} .circ-selection h3`)?.textContent || ''), [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-selection label, ${ed} .circ-selection .asm-label`)].map((l) => l.textContent).find((t) => /Temperatura/.test(t)) ?? null, ED), 'Temperatura (°C)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { timeout: 180000 });

const EMU = '.doc:not([hidden]) .sys-emu';
const SYS = JSON.stringify({ format: 'silinx-system', version: 1, name: 'emu', nodes: [
  { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: 0, y: 0 },
  { id: 'bench', kind: 'circuit', circuit: 'src/temp.circ.json', interfaces: [], x: 300, y: 0 }], links: [] }, null, 2);

uiTest('#5342 Emulate System: a circuit node\'s LM75, its + clicked, its temperature the run\'s', E, async (page) => {
  await makeProject(env, { name: 'CoTemp', template: 'uart', files: { 'emu.sys.json': SYS, 'src/temp.circ.json': JSON.stringify(CIRC, null, 2) } });
  const pj = await env.server.api('GET', '/api/projects/CoTemp');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/CoTemp', { ...pj, kind: 'system', board: null, constraints: null, top: null });
  await page.openProject('CoTemp');
  await page.eval(() => window.SilinxApp.openFile('emu.sys.json'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .system-editor .sys-emu-btn'), [], { what: 'the System editor' });
  await page.click('.doc:not([hidden]) .system-editor .sys-emu-btn');
  await page.waitFor((e) => document.querySelector(`${e} [data-node=bench] [data-id=U1] .circ-temp`), [EMU], { what: 'the circuit', timeout: 60000 });
  await page.click(`${EMU} .sysemu-run`);
  await page.eval((e) => document.querySelector(`${e} [data-node=bench]`).scrollIntoView({ block: 'center' }), EMU);
  await page.eval((e) => document.querySelector(`${e} [data-node=bench] [data-id=U1] [data-input="temp-up"] rect`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })), EMU);
  await page.waitFor(() => window.SilinxApp.findDoc('sysemu:emu.sys.json')?.emulator?.state()?.boards?.bench?.sensors?.U1?.temp === 80, [], { what: '80 °C', timeout: 30000 });
  await page.waitFor((e) => document.querySelector(`${e} [data-node=bench] [data-id=U1] .circ-temp`)?.textContent === '80.0 °C', [EMU], { what: 'drawn' });
  await page.click(`${EMU} .sysemu-run`);
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { timeout: 180000 });
