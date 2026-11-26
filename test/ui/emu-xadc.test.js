// UI (#5385): the Board Emulator's analog inputs on a Basys 3: a design reading its XADC's VAUX6 (test/xadc-design.mjs)
// runs on the event-driven engine (the compiled one has no model of the XADC: said in the console); the side panel's
// "Analog inputs (XADC)": VAUX6's knob at 0.5 V, then 1 V, the LEDs the code's top bits; the die temperature set; in
// Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { resolveBoard } from '../../server/devices.js';
import { XADC_TOP } from '../xadc-design.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const leds = (page) => page.eval(() => window.Silinx.active?.view?.outputs?.leds.slice(0, 8).map((v) => Math.round(v)).join(''));
const knob = (page, v) => page.eval((x) => { const k = document.querySelector('.doc:not([hidden]) .emu-xadc-volts'); k.value = String(x); k.dispatchEvent(new Event('input')); }, v);

uiTest('#5385 the Board Emulator: an XADC\'s VAUX6 set by its knob, the LEDs its code; its temperature; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'EmuXadc', board: 'basys3', device: resolveBoard('basys3').device, files: { 'src/adcled.vhd': XADC_TOP }, top: 'adcled', constraints: 'constraints/adcled.xdc' });
  await page.openProject('EmuXadc');
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
  await page.setView('impl');
  await page.treeRow('#hier', 'adcled');
  await page.treeRow('#procs', 'Emulate on Board', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs && document.querySelector('.doc:not([hidden]) .emu-xadc'), [], { what: 'emulator running, its XADC box' });
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-xadc h4').textContent), 'Analog inputs (XADC)');
  // VAUX6 at 0.5 V: 2048, its top 8 bits 1000 0000 (LD7 lit; the LEDs listed from LD0)
  await page.eval(() => { const s = document.querySelector('.doc:not([hidden]) .emu-xadc-in'); s.value = 'vaux6'; s.dispatchEvent(new Event('change')); });
  await knob(page, 0.5);
  await page.waitFor((want) => window.Silinx.active.view.outputs.leds.slice(0, 8).map((v) => Math.round(v)).join('') === want, ['00000001'], { what: 'LD7 lit', timeout: 20000 });
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-xadc-v').textContent), '0.500 V');
  await knob(page, 1);
  await page.waitFor((want) => window.Silinx.active.view.outputs.leds.slice(0, 8).map((v) => Math.round(v)).join('') === want, ['11111111'], { what: 'all lit', timeout: 20000 });
  // the die temperature: its model's signal
  await page.fill('.doc:not([hidden]) .emu-xadc-temp', '60');
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-xadc-temp').value), '60');
  // the engine: said in the console
  assert.ok((await page.consoleText()).split('\n').some((l) => /not compiled \(the compiled simulator has no model of XADC\): the event-driven simulator runs the design/.test(l)));
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .emu-xadc h4')?.textContent === 'Entradas analógicas (XADC)', [], { what: 'Portuguese' });
  assert.ok((await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-xadc label span')].map((s) => s.textContent))).includes('Temperatura do chip (°C)'));
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.equal(await leds(page), '11111111');
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 240000 });
