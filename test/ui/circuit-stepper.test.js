// UI (#5476): a stepper motor (28BYJ-48 on its ULN2003 board) in the Circuit editor: the Parts panel's Outputs list it;
// drawn (its board, its LEDs, the motor, its arm, its angle); Check; Try it: its four switches on and off in order, A,
// AB, B, BC: three half steps (0.3°), its LEDs B and C lit; stopped, back at 0°; its Part info in Portuguese. No
// warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const CIRC = { format: 'silinx-circuit', version: 1, name: 'st', lang: 'vhdl',
  parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 }, { id: 'M1', type: 'stepper-28byj48', x: 0, y: 0 }, ...[0, 1, 2, 3].map((k) => ({ id: `S${k + 1}`, type: 'logic-switch', x: k, y: 4 }))],
  wires: [...[0, 1, 2, 3].map((k) => ({ id: `w${k}`, points: [[k, 4], [k, 0]], color: 'blue' })), { id: 'g', points: [[5, 0], [5, 2], [-11, 2], [-11, -13], [-10, -13]], color: 'black' },
    { id: 'v', points: [[6, 0], [6, 1], [-12, 1], [-12, -14], [-10, -14]], color: 'red' }] };
const shown = (page) => page.eval((ed) => { const g = document.querySelector(`${ed} .circ-canvas [data-id=M1]`); return [[...g.querySelectorAll('.circ-step-led')].map((l) => (l.classList.contains('on') ? 1 : 0)).join(''), g.querySelector('.circ-step-angle').textContent]; }, ED);

uiTest('#5476 Circuit editor: a stepper motor stepped by four switches in Try it, its LEDs and its angle; its Part info in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircStep', top: '', files: { 'src/st.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircStep');
  await page.eval(() => window.SilinxApp.openFile('src/st.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=M1] .circ-step-can`), [ED], { what: 'the motor drawn' });
  await page.eval(() => window.Silinx.active.circuitEditor.fit());
  assert.deepEqual(await page.eval((ed) => { const b = document.querySelector(`${ed} .circ-lib-part[data-part="stepper-28byj48"]`); return [b?.dataset.group, b?.textContent]; }, ED), ['Outputs', 'Stepper motor (28BYJ-48, ULN2003 board)']);
  assert.deepEqual(await shown(page), ['0000', '0°']);
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  // Try it: A, AB, B, BC (S1 on, S2 on, S1 off, S3 on): three half steps
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  for (const s of ['S1', 'S2', 'S1', 'S3']) { await page.click(`${ED} .circ-canvas [data-id=${s}]`); await page.eval(() => new Promise((r) => setTimeout(r, 50))); }
  await page.waitFor(() => window.Silinx.active.circuitEditor.sim().steppers().M1.steps === 3, [], { what: 'three half steps' });
  assert.deepEqual(await shown(page), ['0110', '0.3°']);
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'stopped' });
  assert.deepEqual(await shown(page), ['0000', '0°']);
  // its Part info, in Portuguese
  await page.eval(() => window.Silinx.active.circuitEditor.select({ kind: 'part', id: 'M1' }));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info .circ-note`), [ED], { what: 'M1 selected' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^Um motor passo-a-passo com redutor \(28BYJ-48\)/.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent), [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="stepper-28byj48"]`)?.textContent, ED), 'Motor passo-a-passo (28BYJ-48, placa ULN2003)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
