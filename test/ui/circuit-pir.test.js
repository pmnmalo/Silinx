// UI (#5463): a motion sensor (PIR, HC-SR501) in the Circuit editor: the Parts panel's Inputs list it; drawn (its green
// board, its dome, its pins' names); Check; Try it: its dome held, someone moving (its waves, OUT at 1, its LED lit, its
// dome lit), released, OUT kept for its hold time (3 s, in real time), then off and blind; its Properties' Hold time and
// Retriggering saved; its Part info and fields in Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const CIRC = { format: 'silinx-circuit', version: 1, name: 'pir', lang: 'vhdl',
  parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 }, { id: 'PIR1', type: 'hc-sr501', x: 0, y: 0 }, { id: 'D1', type: 'led', x: 1, y: 4 }],
  wires: [{ id: 'o', points: [[1, 0], [1, 4]], color: 'blue' }, { id: 'k', points: [[2, 4], [3, 4], [3, 3], [-10, 3], [-10, -13]], color: 'black' },
    { id: 'v', points: [[0, 0], [-12, 0], [-12, -14], [-10, -14]], color: 'red' }, { id: 'g', points: [[2, 0], [4, 0], [4, 2], [-11, 2], [-11, -13], [-10, -13]], color: 'black' }] };
const centre = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const shown = (page) => page.eval((ed) => { const g = document.querySelector(`${ed} .circ-canvas [data-id=PIR1]`); return [g.querySelectorAll('.circ-pir-wave').length, g.querySelector('.circ-pir-dome').classList.contains('on'), document.querySelector(`${ed} .circ-canvas [data-id=D1] .circ-led`).classList.contains('lit')]; }, ED);
const state = (page) => page.eval(() => window.Silinx.active.circuitEditor.sim().pirs().PIR1);

uiTest('#5463 Circuit editor: a PIR\'s dome held in Try it, its OUT lighting an LED for its hold time; its Properties; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircPir', top: '', files: { 'src/pir.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircPir');
  await page.eval(() => window.SilinxApp.openFile('src/pir.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=PIR1] .circ-pir-dome`), [ED], { what: 'the PIR drawn' });
  await page.eval(() => window.Silinx.active.circuitEditor.fit());
  assert.deepEqual(await page.eval((ed) => { const b = document.querySelector(`${ed} .circ-lib-part[data-part="hc-sr501"]`); return [b?.dataset.group, b?.textContent]; }, ED), ['Inputs', 'Motion sensor (PIR, HC-SR501)']);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-canvas [data-id=PIR1] .circ-pir-pin`)].map((t) => t.textContent), ED), ['VCC', 'OUT', 'GND']);
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  // Try it: its dome held (someone moving), released; OUT kept 3 s, then off and blind
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  assert.deepEqual(await shown(page), [0, false, false]);
  const dome = await centre(page, `${ED} .circ-canvas [data-id=PIR1] .circ-pir-dome`);
  await page.mouse('mouseMoved', dome.x, dome.y); await page.mouse('mousePressed', dome.x, dome.y);
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=PIR1] .circ-pir-wave`), [ED], { what: 'someone moving' });
  assert.deepEqual(await shown(page), [4, true, true]);
  await page.mouse('mouseReleased', dome.x, dome.y);
  await page.waitFor((ed) => !document.querySelector(`${ed} .circ-canvas [data-id=PIR1] .circ-pir-wave`), [ED], { what: 'no one moving' });
  const released = Date.now();
  assert.deepEqual([await shown(page), await state(page)], [[0, true, true], { moving: false, out: true, blind: false }], 'its hold time');
  await page.waitFor(() => window.Silinx.active.circuitEditor.sim().pirs().PIR1.blind, [], { what: 'off, blind', timeout: 10000 });
  assert.ok(Date.now() - released >= 2500, `OUT kept for its hold time (${Date.now() - released} ms)`);
  assert.deepEqual(await shown(page), [0, false, false]);
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'stopped' });
  // its Properties: its hold time and jumper
  await page.eval(() => window.Silinx.active.circuitEditor.select({ kind: 'part', id: 'PIR1' }));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-hold-in`), [ED], { what: 'PIR1 selected' });
  await page.fill(`${ED} .circ-selection .circ-hold-in`, '10');
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts.find((p) => p.id === 'PIR1').hold === 10, [], { what: 'saved 10 s' });
  await page.click(`${ED} .circ-selection .circ-retrigger-in`);
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts.find((p) => p.id === 'PIR1').retrigger === false, [], { what: 'single' });
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^Um sensor de movimento \(PIR\)/.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent), [ED], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-selection label`)].map((l) => l.textContent).filter((t) => /Tempo ativo|Redisparável/.test(t)), ED), ['Tempo ativo (s)', 'Redisparável (H)']);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="hc-sr501"]`)?.textContent, ED), 'Sensor de movimento (PIR, HC-SR501)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
