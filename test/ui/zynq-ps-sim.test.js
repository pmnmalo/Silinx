// UI (#4689, part 5b of #4688): a Zynq's PS simulated in the local server's page (cross-origin isolated): the uart-zynq
// example's System, Try it: its PS's program run by the C interpreter in a Worker (web/js/zynq-ps-worker.js), its hello on
// the terminal its PS UART is linked to, the wire's bytes said; no warnings. Emulate: the same hello on its terminal.
// Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const HELLO = 'Hello from the Cortex-A9 of Digilent Zybo Z7\r\n';

async function openSystem(page, name) {
  await makeProject(env, { name, template: 'uart-zynq' });
  await page.openProject(name);
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .badge')].some((b) => b.textContent === 'System'), [], { what: 'the System\'s row' });
  await page.click('#hier .row .badge', { text: 'System' });
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
}

uiTest('#4689 the uart-zynq example: Try it, its PS\'s program run in a Worker, its hello on the terminal; no warnings', E, async (page) => {
  await openSystem(page, 'ZynqSim');
  await page.click(`${ED} .sys-sim-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-sim-panel:not([hidden]) .sys-run-for`), [ED], { what: 'the simulation view' });
  await page.click(`${ED} .sys-run-for`);
  await page.waitFor((ed, hello) => document.querySelector(`${ed} .sys-term-out[data-term="term"]`)?.textContent === hello && !window.Silinx.active.systemEditor.sim.state()?.running, [ED, HELLO], { what: 'the hello', timeout: 240000 });
  const s = await page.eval(() => window.Silinx.active.systemEditor.sim.state());
  assert.deepEqual([s.warnings, s.errors, s.traffic.map((t) => [t.wire, String.fromCharCode(...t.bytes.map((b) => b.byte))])], [[], [], [['serial_zybo_ps', HELLO], ['serial_term', '']]]);
  const lines = await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()).filter(Boolean));
  assert.deepEqual(lines.filter((l) => /^(ERROR|WARNING)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 300000 });

uiTest('#4689 the uart-zynq example: Emulate, its PS\'s hello on the terminal; no warnings', E, async (page) => {
  const EMU = '.doc:not([hidden]) .sys-emu';
  await openSystem(page, 'ZynqEmu');
  await page.click(`${ED} .sys-emu-btn`);
  await page.waitFor((e, hello) => [...document.querySelectorAll(`${e} .sys-term-out`)].some((t) => t.textContent === hello), [EMU, HELLO], { what: 'the hello', timeout: 120000 });
  const s = await page.eval(() => window.Silinx.active.emulator.state());
  assert.deepEqual([s.warnings, s.errors], [[], []]);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 300000 });
