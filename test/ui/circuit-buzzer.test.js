// UI (#5454): a buzzer in the Circuit editor: the Parts panel's Outputs list it; drawn (its black body, its sound hole,
// its + marked); Try it: its + on a logic switch, its − on the supply's −: switched on it sounds (its waves, `2300 Hz`, its
// own tone), switched off silent; Check; its Part info, in Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const CIRC = { format: 'silinx-circuit', version: 1, name: 'buzz', lang: 'vhdl',
  parts: [{ id: 'P1', type: 'supply', x: -6, y: -8 }, { id: 'BZ1', type: 'buzzer', x: 0, y: 0 }, { id: 'S1', type: 'logic-switch', x: 0, y: 4 }],
  wires: [{ id: 'ws', points: [[0, 4], [0, 0]], color: 'blue' }, { id: 'wg', points: [[3, 0], [-6, -7]], color: 'black' }] };
const shown = (page) => page.eval((ed) => { const g = document.querySelector(`${ed} .circ-canvas [data-id=BZ1]`); return [g.querySelectorAll('.circ-buzz-wave').length, g.querySelector('.circ-buzz-hz')?.textContent ?? null]; }, ED);

uiTest('#5454 Circuit editor: a buzzer on a switch sounding in Try it (its waves, its tone), silent off; Check; its Part info in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircBuzz', top: '', files: { 'src/buzz.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircBuzz');
  await page.eval(() => window.SilinxApp.openFile('src/buzz.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=BZ1]`), [ED], { what: 'the circuit editor' });
  await page.eval(() => window.Silinx.active.circuitEditor.fit());
  assert.deepEqual(await page.eval((ed) => { const b = document.querySelector(`${ed} .circ-lib-part[data-part="buzzer"]`); return [b?.dataset.group, b?.textContent]; }, ED), ['Outputs', 'Buzzer (active, 5 V)']);
  assert.deepEqual(await shown(page), [0, null]);
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  // Try it: off silent; S1 on: its own tone, its waves; off: silent
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  assert.deepEqual(await page.eval(() => window.Silinx.active.circuitEditor.sim().buzzers().BZ1), { sounding: false, hz: null, how: 'off' });
  await page.click(`${ED} .circ-canvas [data-id=S1]`);
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=BZ1] .circ-buzz-hz`), [ED], { what: 'sounding' });
  assert.deepEqual(await shown(page), [4, '2300 Hz']);
  await page.click(`${ED} .circ-canvas [data-id=S1]`);
  await page.waitFor((ed) => !document.querySelector(`${ed} .circ-canvas [data-id=BZ1] .circ-buzz-hz`), [ED], { what: 'silent' });
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'stopped' });
  // its Part info, in Portuguese
  await page.eval(() => window.Silinx.active.circuitEditor.select({ kind: 'part', id: 'BZ1' }));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info .circ-note`), [ED], { what: 'BZ1 selected' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^Um besouro ativo/.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent), [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="buzzer"]`)?.textContent, ED), 'Besouro (ativo, 5 V)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
