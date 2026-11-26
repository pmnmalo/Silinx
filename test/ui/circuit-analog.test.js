// UI (#5382): the analog parts in the Circuit editor: the Parts panel's Analog group; a potentiometer's wiper through a
// resistor to an LED, a voltmeter on the wiper, a second LED with no resistor; drawn (the resistor's value, the
// voltmeter); Check (no warnings); Try it: the voltmeter's reading, the LED lit as bright as its current, the
// potentiometer turned to its end 3 by its + (0 V, the LED off), the LED with no resistor said once in the console; the
// resistor's Properties' resistance set as "1k"; its Part info and fields in Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
// (RV1's pins at (0,0) (1,0) (2,0); R1's at (0,4) (4,4); D1's at (8,4) (9,4); VM1's at (0,8) (1,8); D2's at (8,10) (9,10))
const CIRC = { format: 'silinx-circuit', version: 1, name: 'analog', lang: 'vhdl',
  parts: [{ id: 'P1', type: 'supply', x: -10, y: -10 }, { id: 'RV1', type: 'potentiometer', x: 0, y: 0, ohms: 10000, pos: 0 }, { id: 'R1', type: 'resistor', x: 0, y: 4, ohms: 330 },
    { id: 'D1', type: 'led', x: 8, y: 4 }, { id: 'VM1', type: 'voltmeter', x: 0, y: 8 }, { id: 'D2', type: 'led', x: 8, y: 10, color: 'green' }],
  wires: [{ id: 'w1', points: [[-10, -10], [0, 0]], color: 'red' }, { id: 'w2', points: [[-10, -9], [2, 0]], color: 'black' }, { id: 'w3', points: [[1, 0], [0, 4]], color: 'blue' },
    { id: 'w4', points: [[4, 4], [8, 4]], color: 'blue' }, { id: 'w5', points: [[9, 4], [-10, -9]], color: 'black' }, { id: 'w6', points: [[1, 0], [0, 8]], color: 'blue' },
    { id: 'w7', points: [[1, 8], [-10, -9]], color: 'black' }, { id: 'w8', points: [[-10, -10], [8, 10]], color: 'red' }, { id: 'w9', points: [[9, 10], [-10, -9]], color: 'black' }] };
const centre = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const meter = (page) => page.eval((ed) => document.querySelector(`${ed} .circ-canvas [data-id=VM1] .circ-meter-text`)?.textContent, ED);
const lit = (page, id) => page.eval((ed, i) => document.querySelector(`${ed} .circ-canvas [data-id=${i}] .circ-led`)?.classList.contains('lit'), ED, id);

uiTest('#5382 Circuit editor: a potentiometer, a resistor, LEDs and a voltmeter tried; the missing resistor said; its Properties; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircAnalog', top: '', files: { 'src/analog.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircAnalog');
  await page.eval(() => window.SilinxApp.openFile('src/analog.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=VM1] .circ-meter-body`), [ED], { what: 'the voltmeter drawn' });
  await page.eval(() => window.Silinx.active.circuitEditor.fit());
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-lib-part[data-group="Analog"]`)].map((b) => b.dataset.part), ED),
    ['resistor', 'capacitor', 'potentiometer', 'ldr', 'thermistor', 'diode', 'voltmeter', 'oscilloscope', 'function-generator', 'lm393', 'pmod-da2', 'pmod-ad1']);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-canvas [data-id=R1] .circ-label`)?.textContent, ED), 'R1  330 Ω');
  assert.equal(await meter(page), 'V', 'no reading while not trying it');
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  // Try it: the wiper at +5 V (less D2's 293 mA through the supply's 0.1 Ω), D1 lit through 330 Ω (about 9 mA: not full brightness); D2 with no resistor said
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=VM1] .circ-meter-text`)?.textContent === "4.96 V", [ED], { what: "4.96 V (D2 with no resistor draws the supply down)" });
  assert.deepEqual([await lit(page, 'D1'), await lit(page, 'D2')], [true, true]);
  const op = await page.eval((ed) => Number(document.querySelector(`${ed} .circ-canvas [data-id=D1] .circ-led`).style.opacity), ED);
  assert.ok(op > 0.6 && op < 0.9, `D1 as bright as its ~9 mA: ${op}`);
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .circ-canvas [data-id=D1] title`)?.textContent, ED), /^D1: 9\.\d mA$/);
  // its + ten times: its end 3, 0 V, D1 off
  const up = await centre(page, `${ED} .circ-canvas [data-id=RV1] [data-input="sense-up"] rect`);
  for (let k = 0; k < 10; k++) await page.click(up);
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=RV1] .circ-an-val`)?.textContent === '100 %', [ED], { what: '100 %' });
  assert.equal(await meter(page), '0 V');
  assert.equal(await lit(page, 'D1'), false);
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'stopped' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-canvas [data-id=RV1] .circ-an-val`)?.textContent, ED), '0 %', 'its saved position again');
  const warnings = (await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l));
  assert.deepEqual(warnings, ['WARNING: analog.circ.json: D2: 293 mA through it, more than an LED takes (20 mA): a current-limiting resistor is missing in series (about 190 Ω from 5 V)']);
  // its Properties: R1's resistance as "1k"
  await page.eval(() => window.Silinx.active.circuitEditor.select({ kind: 'part', id: 'R1' }));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-value-in[data-prop="ohms"]`), [ED], { what: 'R1 selected' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-selection .circ-value-in`).value, ED), '330 Ω');
  await page.fill(`${ED} .circ-selection .circ-value-in[data-prop="ohms"]`, '1k');
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts.find((p) => p.id === 'R1').ohms === 1000, [], { what: 'saved 1 kΩ' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-canvas [data-id=R1] .circ-label`)?.textContent, ED), 'R1  1 kΩ');
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^Limita a corrente entre os seus dois terminais/.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent), [ED], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-selection label`)].map((l) => l.textContent).filter((t) => /Resist/.test(t)), ED), ['Resistência (Ω)']);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="voltmeter"]`)?.textContent, ED), 'Voltímetro');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
