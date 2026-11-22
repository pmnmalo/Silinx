// UI (#5214): an SPI link drawn in the System editor, in the spi-avr example's project. The Uno's + SPI (its board's
// SPI: D13, D11, D12, D10), the FPGA's + SPI (its spi_echo module's sck, mosi, miso and ss found by their names), the
// Link tool joins them: saved as the format has it, its check's three 5 V warnings in the console; Try it runs it: the
// Uno's counts sent, each answered by the FPGA, the SPI transfers in the run's report. Portuguese; both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
// the example's System with no SPI yet: the Uno, the FPGA node on spi_echo with its pins
const SYS = JSON.stringify({ format: 'silinx-system', version: 1, name: 'spi_avr', nodes: [
  { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'firmware/spi.hex', interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: 0, y: 0 },
  { id: 'fpga', kind: 'fpga', module: 'spi_echo', board: 'basys2', variant: '250', pins: { clk: 'B8', sck: 'B2', mosi: 'A3', miso: 'J3', ss: 'B5' }, interfaces: [], x: 320, y: 0 },
], links: [] }, null, 2);
const setField = (page, sel, value) => page.eval((ed, sel, value) => { const el = document.querySelector(`${ed} .asm-side ${sel}`); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }, ED, sel, value);
const ifaceRow = (page, id) => page.eval((ed, id) => { const r = document.querySelector(`${ed} .sys-iface[data-id="${id}"] .sys-iface-row`).getBoundingClientRect(); return { x: r.x + r.width / 3, y: r.y + r.height / 2 }; }, ED, id);
const model = (page) => page.eval(() => window.Silinx.active.systemEditor.getModel());
const W5 = (pin, port, loc) => `spi: uno's ${pin}, a 5 V output, drives fpga's ${port} (pin ${loc}), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards`;

uiTest('#5214 an SPI link drawn: + SPI on the Uno and the FPGA, linked, saved, its 5 V warnings; Try it: the counts answered; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CoSpi', template: 'spi-avr', files: { 'spi_avr.sys.json': SYS } });
  await page.openProject('CoSpi');
  await page.eval(() => window.SilinxApp.openFile('spi_avr.sys.json'));
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  for (const node of ['uno', 'fpga']) {
    await page.eval((n) => window.Silinx.active.systemEditor.select({ kind: 'node', id: n }), node);
    await page.waitFor((ed, n) => document.querySelector(`${ed} .sys-add-spi`) && document.querySelector(`${ed} .sys-selection h3`)?.textContent.endsWith(` ${n}`), [ED, node], { what: `${node}'s properties` });
    await page.click(`${ED} .sys-add-spi`);
    await page.waitFor((ed) => /^SPI /.test(document.querySelector(`${ed} .sys-selection h3`)?.textContent || ''), [ED], { what: `${node}'s SPI` });
  }
  // the FPGA's ports found by their names; the Uno's its board's
  const m0 = await model(page);
  assert.deepEqual(m0.nodes.map((n) => n.interfaces.filter((f) => f.kind === 'spi')), [[{ name: 'SPI', kind: 'spi', hz: 125000, mode: 0 }], [{ name: 'spi1', kind: 'spi', sck: 'sck', mosi: 'mosi', miso: 'miso', ss: 'ss', hz: 125000, mode: 0 }]]);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .sys-selection .asm-label`)].map((l) => l.textContent), ED), ['Name', 'SCK (an input of the module)', 'MOSI (an input)', 'MISO (an output)', 'SS (an input)', 'SCK rate (Hz)', 'Mode']);
  await page.click(`${ED} .sys-tool`, { text: 'Link' });
  await page.click(await ifaceRow(page, 'uno.SPI'));
  await page.click(await ifaceRow(page, 'fpga.spi1'));
  await page.waitFor((ed) => document.querySelector(`${ed} .doc-status`)?.textContent === '2 nodes · 1 link', [ED], { what: 'the SPI link' });
  const m = await model(page);
  assert.deepEqual(m.links, [{ id: 'spi', kind: 'spi', a: 'uno.SPI', b: 'fpga.spi1' }]);
  for (let t = Date.now(); Date.now() - t < 15000;) { if (JSON.parse(await readWs(env, 'CoSpi', 'spi_avr.sys.json')).links.length === 1) break; await new Promise((r) => setTimeout(r, 100)); }
  assert.deepEqual(JSON.parse(await readWs(env, 'CoSpi', 'spi_avr.sys.json')).links, m.links);
  const W = [W5('D13', 'sck', 'B2'), W5('D11', 'mosi', 'A3'), W5('D10', 'ss', 'B5')];
  await page.waitFor((w) => w.every((x) => window.SilinxApp.S.diags.some((d) => d.tool === 'System' && d.message === x)), [W], { what: 'the 5 V warnings' });
  assert.deepEqual(await page.eval(() => window.SilinxApp.S.diags.filter((d) => d.tool === 'System').map((d) => d.message)), W);
  // Try it: two transfers in 100 ms, 00 then 01 sent, 00 then 01 answered; its SPI wires in the link inspector
  await page.click(`${ED} .sys-sim-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-sim-panel:not([hidden]) .sys-run-for`), [ED], { what: 'Try it' });
  await page.click(`${ED} .sys-run-for`);
  await page.waitFor(() => { const s = window.Silinx.active.systemEditor.sim?.state(); return s && !s.running && s.now >= 100e9; }, [], { what: '100 ms run', timeout: 60000 });
  const s = await page.eval(() => window.Silinx.active.systemEditor.sim.state());
  assert.deepEqual(s.spi.map((x) => x.transfers.map((t) => [t.mosi, t.miso])), [[[0, 0], [1, 1], [2, 2]]]);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .sys-wire`)].map((w) => w.dataset.wire), ED), ['spi_sck', 'spi_mosi', 'spi_ss', 'spi_miso']);
  assert.deepEqual([s.warnings, s.errors], [[], []]);
  // in Portuguese: the SPI's properties
  await page.eval((id) => window.Silinx.active.systemEditor.select({ kind: 'iface', id }), 'fpga.spi1');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .sys-selection .asm-label`)].map((l) => l.textContent).includes('Modo'), [ED], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .sys-selection .asm-label`)].map((l) => l.textContent), ED), ['Nome', 'SCK (uma entrada do módulo)', 'MOSI (uma entrada)', 'MISO (uma saída)', 'SS (uma entrada)', 'Ritmo do SCK (Hz)', 'Modo']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
