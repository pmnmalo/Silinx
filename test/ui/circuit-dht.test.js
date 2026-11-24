// UI (#5470): a temperature and humidity sensor (DHT11) in the Circuit editor: the Parts panel's Inputs list both; drawn
// (its blue case, its grille, what it senses); Check; Try it: its temperature's + twice (27 °C), its humidity's −
// (45 %); after its power-on second, a button to GND held (its start) and released: the read answered; its Properties'
// Temperature and Humidity saved; its Part info and fields in Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const CIRC = { format: 'silinx-circuit', version: 1, name: 'dht', lang: 'vhdl',
  parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 }, { id: 'DHT1', type: 'dht11', x: 0, y: 0 }, { id: 'R1', type: 'pull-up', x: 1, y: 3 }, { id: 'B1', type: 'button', x: 1, y: 5 }, { id: 'D1', type: 'led', x: 6, y: 3 }],
  wires: [{ id: 'd', points: [[1, 0], [1, 3]], color: 'blue' }, { id: 'b', points: [[1, 3], [1, 5]], color: 'blue' }, { id: 'a', points: [[1, 3], [6, 3]], color: 'blue' }, { id: 'k', points: [[7, 3], [-10, -13]], color: 'black' },
    { id: 'bg', points: [[4, 5], [-10, -13]], color: 'black' }, { id: 'v', points: [[0, 0], [-12, 0], [-12, -14], [-10, -14]], color: 'red' }, { id: 'g', points: [[3, 0], [-10, -13]], color: 'black' }] };
const centre = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const vals = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-canvas [data-id=DHT1] .circ-dht-val`)].map((t) => t.textContent), ED);

uiTest('#5470 Circuit editor: a DHT11\'s temperature and humidity set in Try it, a button\'s start read; its Properties; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircDht', top: '', files: { 'src/dht.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircDht');
  await page.eval(() => window.SilinxApp.openFile('src/dht.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=DHT1] .circ-dht-case`), [ED], { what: 'the DHT11 drawn' });
  await page.eval(() => window.Silinx.active.circuitEditor.fit());
  assert.deepEqual(await page.eval((ed) => ['dht11', 'dht22'].map((t) => { const b = document.querySelector(`${ed} .circ-lib-part[data-part="${t}"]`); return [b?.dataset.group, b?.textContent]; }), ED),
    [['Inputs', 'Temperature and humidity sensor (DHT11)'], ['Inputs', 'Temperature and humidity sensor (DHT22)']]);
  assert.deepEqual(await vals(page), ['25 °C', '50 %']);
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  // Try it: + twice on its temperature, − once on its humidity
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  const started = Date.now();
  const btn = (input, lever) => centre(page, `${ED} .circ-canvas [data-id=DHT1] [data-input="${input}"][data-lever="${lever}"] rect`);
  const up = await btn('sense-up', 0), down = await btn('sense-down', 1);
  await page.click(up); await page.click(up); await page.click(down);
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .circ-canvas [data-id=DHT1] .circ-dht-val`)].map((t) => t.textContent).join() === '27 °C,45 %', [ED], { what: '27 °C, 45 %' });
  // (its power-on second passed, B1 held 100 ms: its start; the read answered)
  await page.eval((ms) => new Promise((r) => setTimeout(r, ms)), Math.max(0, 1200 - (Date.now() - started)));
  const b1 = await centre(page, `${ED} .circ-canvas [data-id=B1]`);
  await page.mouse('mouseMoved', b1.x, b1.y); await page.mouse('mousePressed', b1.x, b1.y);
  await page.eval(() => new Promise((r) => setTimeout(r, 100)));
  await page.mouse('mouseReleased', b1.x, b1.y);
  await page.waitFor(() => window.Silinx.active.circuitEditor.sim().dhts().DHT1.reads === 1, [], { what: 'the read answered' });
  assert.deepEqual(await page.eval(() => window.Silinx.active.circuitEditor.sim().dhts().DHT1), { temp: 27, hum: 45, reads: 1 });
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'stopped' });
  assert.deepEqual(await vals(page), ['25 °C', '50 %'], 'its saved ones again');
  // its Properties: what it senses, saved
  await page.eval(() => window.Silinx.active.circuitEditor.select({ kind: 'part', id: 'DHT1' }));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-sense-in[data-prop="hum"]`), [ED], { what: 'DHT1 selected' });
  await page.fill(`${ED} .circ-selection .circ-sense-in[data-prop="hum"]`, '70');
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts.find((p) => p.id === 'DHT1').hum === 70, [], { what: 'saved 70 %' });
  assert.deepEqual(await vals(page), ['25 °C', '70 %']);
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^Um sensor de temperatura e humidade num só fio, /.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent), [ED], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-selection label`)].map((l) => l.textContent).filter((t) => /Temperatura|Humidade/.test(t)), ED), ['Temperatura (°C)', 'Humidade (%)']);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="dht22"]`)?.textContent, ED), 'Sensor de temperatura e humidade (DHT22)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
