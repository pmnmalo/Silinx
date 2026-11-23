// UI (#5216): the System editor's Wiring view, in the uart-avr example's project. Wiring shows the serial link pin by
// pin: the Uno's D1 to the FPGA's rx on J3 (hot: a 5 V output on a 3.3 V input, its warning its tip), the FPGA's tx on A3
// to the Uno's D0, each arrow towards the input, the levels at each end; its status line the wires and links; read only
// (the node and link tools and Delete hidden, Del deletes nothing), a click on a wire selects its link (the side panel's);
// Wiring again: the System as it was. Portuguese; both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const status = (page) => page.eval((ed) => document.querySelector(`${ed} .doc-status`)?.textContent, ED);
const shownTools = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-toolbar .asm-btn`)].filter((b) => !b.hidden && b.getClientRects().length > 0).map((b) => b.textContent.trim()).filter(Boolean), ED);
// the wiring's rows: [link, signal, left pin, right pin, left volts, right volts, hot, arrow to the right]
const rows = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .sys-wiring`)].flatMap((g) => [...g.querySelectorAll('.sys-wire-row')].map((r) => {
  const pins = [...r.querySelectorAll('.sys-wire-pin')].map((x) => x.firstChild.textContent), v = [...r.querySelectorAll('.sys-wire-volts')].map((x) => x.textContent);
  return [g.dataset.id, r.dataset.signal, ...pins, ...v, r.classList.contains('hot'), r.querySelector('.sys-wire-line').hasAttribute('marker-end')];
})), ED);

uiTest('#5216 Wiring: the uart-avr\'s serial link pin by pin, its 5 V wire hot, read only, a wire selects its link; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CoWire', template: 'uart-avr' });
  await page.openProject('CoWire');
  await page.eval(() => window.SilinxApp.openFile('uart_avr.sys.json'));
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  assert.ok((await shownTools(page)).includes('Wiring'));
  await page.click(`${ED} .sys-wiring-btn`);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .sys-wire-row`).length === 2, [ED], { what: 'the wiring' });
  assert.equal(await page.eval(() => window.Silinx.active.systemEditor.view), 'wiring');
  assert.deepEqual(await rows(page), [
    ['serial', 'TX', 'D1', 'rx · J3', '5 V', '3.3 V', true, true],
    ['serial', 'TX', 'D0', 'tx · A3', '5 V', '3.3 V', false, false]]);
  // the hot wire's tip its warning; an FPGA pin's tip what the board says it is
  assert.deepEqual(await page.eval((ed) => {
    const r = document.querySelector(`${ed} .sys-wire-row.hot`);
    return [r.querySelector(':scope > title').textContent, [...r.querySelectorAll('.sys-wire-pin')][1].querySelector('title').textContent];
  }, ED), ['serial: uno\'s D1, a 5 V output, drives fpga\'s rx (pin J3), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards',
    'UART RX on a PmodUSBUART in JA (its TXD, JA3) · LVCMOS33']);
  assert.equal(await status(page), '2 wires · 1 link');
  // read only: the tools that edit hidden; a wire's click selects its link; Del deletes nothing
  const tools = await shownTools(page);
  for (const t of ['FPGA', 'Arduino Uno', 'Arduino Nano', 'Terminal', 'Link']) assert.ok(!tools.includes(t), `${t} hidden: ${tools.join(', ')}`);
  assert.ok(tools.includes('Check') && tools.includes('Try it'), tools.join(', '));
  const at = await page.eval((ed) => { const r = document.querySelector(`${ed} .sys-wire-row .sys-wire-line`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, ED);
  await page.click(at);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-wiring.sel`), [ED], { what: 'the link selected' });
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .sys-selection h3`).textContent, ED), /serial$/);
  await page.eval((ed) => document.querySelector(ed).dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })), ED);
  assert.equal((await page.eval(() => window.Silinx.active.systemEditor.getModel())).links.length, 1);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-wiring-btn`)?.textContent === 'Fios', [ED], { what: 'Portuguese' });
  assert.equal(await status(page), '2 fios · 1 ligação');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // Wiring again: the System's nodes and links, its tools back
  await page.click(`${ED} .sys-wiring-btn`);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .sys-node`).length === 2, [ED], { what: 'the System view' });
  assert.equal(await status(page), '2 nodes · 1 link');
  assert.ok((await shownTools(page)).includes('Arduino Uno'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
