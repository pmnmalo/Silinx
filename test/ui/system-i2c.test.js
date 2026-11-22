// UI (#5214): an I²C link drawn in the System editor, in the i2c-avr example's project. The Uno's + I²C (its board's
// Wire: SCL A5, SDA A4), the FPGA's + I²C (its i2c_leds module's scl and sda found by their names, its SDA an inout
// port), the Link tool joins them: saved as the format has it, its check's two 5 V warnings in the console; Try it runs
// it: the Uno's counts written, the FPGA's switches read back, the I²C transfers in the run's report and its three
// wires. Portuguese; both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
// the example's System with no I²C yet: the Uno, the FPGA node on i2c_leds with its pins
const SYS = JSON.stringify({ format: 'silinx-system', version: 1, name: 'i2c_avr', nodes: [
  { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'firmware/i2c.hex', interfaces: [], x: 0, y: 0 },
  { id: 'fpga', kind: 'fpga', module: 'i2c_leds', board: 'basys2', variant: '250', pins: { clk: 'B8', scl: 'B2', sda: 'A3' }, interfaces: [], x: 320, y: 0 },
], links: [] }, null, 2);
const ifaceRow = (page, id) => page.eval((ed, id) => { const r = document.querySelector(`${ed} .sys-iface[data-id="${id}"] .sys-iface-row`).getBoundingClientRect(); return { x: r.x + r.width / 3, y: r.y + r.height / 2 }; }, ED, id);
const model = (page) => page.eval(() => window.Silinx.active.systemEditor.getModel());
const W5 = (pin, port, loc) => `i2c: uno's ${pin}, a 5 V output, drives fpga's ${port} (pin ${loc}), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards`;
const labels = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .sys-selection .asm-label`)].map((l) => l.textContent), ED);

uiTest('#5214 an I²C link drawn: + I²C on the Uno and the FPGA, linked, saved, its 5 V warnings; Try it: the counts written, the switches read; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CoI2c', template: 'i2c-avr', files: { 'i2c_avr.sys.json': SYS } });
  await page.openProject('CoI2c');
  await page.eval(() => window.SilinxApp.openFile('i2c_avr.sys.json'));
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  for (const node of ['uno', 'fpga']) {
    await page.eval((n) => window.Silinx.active.systemEditor.select({ kind: 'node', id: n }), node);
    await page.waitFor((ed, n) => document.querySelector(`${ed} .sys-add-i2c`) && document.querySelector(`${ed} .sys-selection h3`)?.textContent.endsWith(` ${n}`), [ED, node], { what: `${node}'s properties` });
    await page.click(`${ED} .sys-add-i2c`);
    await page.waitFor((ed) => /^I²C /.test(document.querySelector(`${ed} .sys-selection h3`)?.textContent || ''), [ED], { what: `${node}'s I²C` });
  }
  // the FPGA's ports found by their names; the Uno's its board's
  const m0 = await model(page);
  assert.deepEqual(m0.nodes.map((n) => n.interfaces), [[{ name: 'Wire', kind: 'i2c', hz: 100000 }], [{ name: 'i2c1', kind: 'i2c', scl: 'scl', sda: 'sda', hz: 100000 }]]);
  assert.deepEqual(await labels(page), ['Name', 'SCL (an input of the module)', 'SDA (an inout port)', 'SCL rate (Hz)']);
  // (SDA's choice: the module's inout ports only)
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .sys-selection .sys-sda option`)].map((o) => o.value), ED), ['', 'sda']);
  await page.click(`${ED} .sys-tool`, { text: 'Link' });
  await page.click(await ifaceRow(page, 'uno.Wire'));
  await page.click(await ifaceRow(page, 'fpga.i2c1'));
  await page.waitFor((ed) => document.querySelector(`${ed} .doc-status`)?.textContent === '2 nodes · 1 link', [ED], { what: 'the I²C link' });
  const m = await model(page);
  assert.deepEqual(m.links, [{ id: 'i2c', kind: 'i2c', a: 'uno.Wire', b: 'fpga.i2c1' }]);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .sys-link.i2c`) != null, ED), true, 'drawn as an I²C link');
  for (let t = Date.now(); Date.now() - t < 15000;) { if (JSON.parse(await readWs(env, 'CoI2c', 'i2c_avr.sys.json')).links.length === 1) break; await new Promise((r) => setTimeout(r, 100)); }
  assert.deepEqual(JSON.parse(await readWs(env, 'CoI2c', 'i2c_avr.sys.json')).links, m.links);
  const W = [W5('A5', 'scl', 'B2'), W5('A4', 'sda', 'A3')];
  await page.waitFor((w) => w.every((x) => window.SilinxApp.S.diags.some((d) => d.tool === 'System' && d.message === x)), [W], { what: 'the 5 V warnings' });
  assert.deepEqual(await page.eval(() => window.SilinxApp.S.diags.filter((d) => d.tool === 'System').map((d) => d.message)), W);
  // Try it: in 100 ms the counts 00, 01, 02 written, the switches (00) read after each; its three wires in the link inspector
  await page.click(`${ED} .sys-sim-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-sim-panel:not([hidden]) .sys-run-for`), [ED], { what: 'Try it' });
  await page.click(`${ED} .sys-run-for`);
  await page.waitFor(() => { const s = window.Silinx.active.systemEditor.sim?.state(); return s && !s.running && s.now >= 100e9; }, [], { what: '100 ms run', timeout: 60000 });
  const s = await page.eval(() => window.Silinx.active.systemEditor.sim.state());
  assert.deepEqual(s.i2c.map((x) => x.transfers.map((t) => [t.read ? 'R' : 'W', t.addr, t.data.map((d) => d.byte)])), [[['W', 0x42, [0]], ['R', 0x42, [0]], ['W', 0x42, [1]], ['R', 0x42, [0]], ['W', 0x42, [2]], ['R', 0x42, [0]]]]);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .sys-wire`)].map((w) => w.dataset.wire), ED), ['i2c_scl', 'i2c_sda', 'i2c_sda_back']);
  assert.deepEqual([s.warnings, s.errors], [[], []]);
  // in Portuguese: the I²C's properties
  await page.eval((id) => window.Silinx.active.systemEditor.select({ kind: 'iface', id }), 'fpga.i2c1');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .sys-selection .asm-label`)].map((l) => l.textContent).includes('Ritmo do SCL (Hz)'), [ED], { what: 'Portuguese' });
  assert.deepEqual(await labels(page), ['Nome', 'SCL (uma entrada do módulo)', 'SDA (um porto inout)', 'Ritmo do SCL (Hz)']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
