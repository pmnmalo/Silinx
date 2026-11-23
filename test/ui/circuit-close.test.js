// UI (#5403): a circuit's tab closed, then its project closed, with no error: its editor's destroy() stops Try it's
// clock (tryIt.stopTicks, circuit-try.js since #5357; a bare stopTicks() threw "stopTicks is not defined"). Opened again
// and closed while trying it too. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const bad = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((l) => /^(WARNING|ERROR)/.test(l)));
const open = async (page) => {
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=BB1]`), [ED], { what: 'the circuit editor' });
};
const closeTab = async (page) => {
  await page.click('#doc-tabs > .tab.active .tclose');
  await page.waitFor(() => !document.querySelector('.doc:not([hidden]) .circuit-editor'), [], { what: 'the tab closed' });
};

uiTest('#5403 Circuit editor: its tab closed, then its project, with no error; closed while trying it too', E, async (page) => {
  await makeProject(env, { name: 'CircClose', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircClose');
  await open(page);
  await closeTab(page);
  // (opened again and tried: closed while its clock runs)
  await open(page);
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  await closeTab(page);
  await open(page);
  // the project closed with its circuit open
  await page.eval(async () => { await window.SilinxApp.closeProject(); });
  await page.waitFor(() => !window.SilinxApp.S.project, [], { what: 'the project closed' });
  assert.deepEqual(await bad(page), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 120000 });
