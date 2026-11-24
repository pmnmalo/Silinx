// UI (#5456): an ultrasonic range sensor (HC-SR04) in the Circuit editor: the Parts panel's Inputs list it; drawn (its
// blue board, its two cans, its pins' names, its distance); Check; Try it: its Trig on a logic switch, on then off a
// trigger of the real time between the clicks, its echo coming in real time (2915.4 µs at 50 cm); + twice, 60 cm, its
// next echo 3498.5 µs; its Properties' Distance (cm) saved; its Part info and Distance in Portuguese. No warnings. Both
// interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const CIRC = { format: 'silinx-circuit', version: 1, name: 'son', lang: 'vhdl',
  parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 }, { id: 'US1', type: 'hc-sr04', x: 0, y: 0, cm: 50 }, { id: 'S1', type: 'logic-switch', x: 1, y: 6 }],
  wires: [{ id: 'wt', points: [[1, 6], [1, 0]], color: 'blue' }, { id: 'wv', points: [[0, 0], [-12, 0], [-12, -14], [-10, -14]], color: 'red' },
    { id: 'wg', points: [[3, 0], [4, 0], [4, 2], [-11, 2], [-11, -13], [-10, -13]], color: 'black' }] };
const centre = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const cmShown = (page) => page.eval((ed) => document.querySelector(`${ed} .circ-canvas [data-id=US1] .circ-sonar-cm`)?.textContent ?? null, ED);
const echo = (page) => page.eval(() => window.Silinx.active.circuitEditor.sim().sonars().US1);

uiTest('#5456 Circuit editor: an HC-SR04 triggered from a switch in Try it, its echo in real time; its distance\'s + and its Properties; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircSonar', top: '', files: { 'src/son.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircSonar');
  await page.eval(() => window.SilinxApp.openFile('src/son.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=US1] .circ-sonar-board`), [ED], { what: 'the HC-SR04 drawn' });
  await page.eval(() => window.Silinx.active.circuitEditor.fit());
  assert.deepEqual(await page.eval((ed) => { const b = document.querySelector(`${ed} .circ-lib-part[data-part="hc-sr04"]`); return [b?.dataset.group, b?.textContent]; }, ED), ['Inputs', 'Ultrasonic range sensor (HC-SR04)']);
  assert.deepEqual(await page.eval((ed) => { const g = document.querySelector(`${ed} .circ-canvas [data-id=US1]`); return [g.querySelectorAll('.circ-sonar-can').length, [...g.querySelectorAll('.circ-sonar-pin')].map((t) => t.textContent)]; }, ED), [2, ['Vcc', 'Trig', 'Echo', 'Gnd']]);
  assert.equal(await cmShown(page), '50 cm');
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  // Try it: S1 on, off: its echo, in real time
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  assert.deepEqual(await echo(page), { cm: 50, measuring: false, echo: null });
  const s1 = `${ED} .circ-canvas [data-id=S1]`;
  await page.click(s1); await page.click(s1);
  await page.waitFor(() => window.Silinx.active.circuitEditor.sim().sonars().US1.echo != null, [], { what: 'its echo' });
  assert.deepEqual(await echo(page), { cm: 50, measuring: false, echo: 2915.4 });
  // + twice: 60 cm, its next echo
  const plus = await centre(page, `${ED} [data-id=US1] [data-input="sense-up"] rect`);
  await page.click(plus); await page.click(plus);
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=US1] .circ-sonar-cm`)?.textContent === '60 cm', [ED], { what: '60 cm' });
  await page.click(s1); await page.click(s1);
  await page.waitFor(() => window.Silinx.active.circuitEditor.sim().sonars().US1.echo === 3498.5, [], { what: 'its echo at 60 cm' });
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'stopped' });
  assert.equal(await cmShown(page), '50 cm', 'its saved distance again');
  // its Properties: its saved distance
  await page.eval(() => window.Silinx.active.circuitEditor.select({ kind: 'part', id: 'US1' }));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-sense-in`), [ED], { what: 'US1 selected' });
  await page.fill(`${ED} .circ-selection .circ-sense-in`, '120');
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts.find((p) => p.id === 'US1').cm === 120, [], { what: 'saved 120 cm' });
  assert.equal(await cmShown(page), '120 cm');
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^Um sensor de distância ultrassónico/.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent), [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-selection label`)].map((l) => l.textContent).find((t) => /Distância/.test(t)) ?? null, ED), 'Distância (cm)');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="hc-sr04"]`)?.textContent, ED), 'Sensor de distância ultrassónico (HC-SR04)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
