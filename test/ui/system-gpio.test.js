// UI (#5213): a GPIO link drawn in the System editor. The FPGA node (the uart module on its Basys2) gets a GPIO interface
// on its BTN0 port, the Arduino Uno one on its D2 (+ GPIO, its pins and direction in the properties), the Link tool joins
// them: saved as the format has it, its check's warning (the Uno's 5 V output on the FPGA's 3.3 V input) in the console;
// Try it runs it: the Uno's program holds D2 high, the FPGA's debouncer sees BTN0 pressed and sends its message to the
// serial terminal, the link inspector the wire's changes. Portuguese; both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { avrAssemble, intelHex } from '../avr-asm.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const SYS = JSON.stringify({ format: 'silinx-system', version: 1, name: 'g', nodes: [
  { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: { clk: 'B8', rx: 'J3', tx: 'A3', 'btn<0>': 'G12' }, interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }], x: 300, y: 0 },
  { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/p.hex', interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: 0, y: 0 },
  { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: 300, y: 260 },
], links: [{ id: 'console', kind: 'uart', a: 'term.serial', b: 'fpga.uart' }] }, null, 2);
const PROG = ['ldi r16, 0x04', 'out 0x0a, r16', 'out 0x0b, r16', 'loop:', 'rjmp loop'];   // D2 an output, high
const setField = (page, sel, value) => page.eval((ed, sel, value) => { const el = document.querySelector(`${ed} .asm-side ${sel}`); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }, ED, sel, value);
const ifaceRow = (page, id) => page.eval((ed, id) => { const r = document.querySelector(`${ed} .sys-iface[data-id="${id}"] .sys-iface-row`).getBoundingClientRect(); return { x: r.x + r.width / 3, y: r.y + r.height / 2 }; }, ED, id);
const model = (page) => page.eval(() => window.Silinx.active.systemEditor.getModel());
const W5 = "wires: uno's D2, a 5 V output, drives fpga's btn (pin G12), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards";

uiTest('#5213 a GPIO link drawn: + GPIO on the FPGA\'s BTN0 and the Uno\'s D2, linked, saved, its 5 V warning; Try it: D2 presses BTN0, the message in the terminal; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CoGpio', template: 'uart', files: { 'g.sys.json': SYS, 'fw/p.hex': intelHex(avrAssemble(PROG)) } });
  const pj = await env.server.api('GET', '/api/projects/CoGpio');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/CoGpio', { ...pj, kind: 'codesign', board: null, constraints: null, top: null });
  await page.openProject('CoGpio');
  await page.eval(() => window.SilinxApp.openFile('g.sys.json'));
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  // the FPGA's GPIO: its BTN0 port, an input
  for (const [node, pins, dir] of [['fpga', 'btn', 'in'], ['uno', 'D2', 'out']]) {
    await page.eval((n) => window.Silinx.active.systemEditor.select({ kind: 'node', id: n }), node);
    await page.waitFor((ed, n) => document.querySelector(`${ed} .sys-selection h3`)?.textContent.endsWith(` ${n}`), [ED, node], { what: `${node}'s properties` });
    await page.click(`${ED} .sys-add-gpio`);
    await page.waitFor((ed, n) => /^GPIO /.test(document.querySelector(`${ed} .sys-selection h3`)?.textContent || '') && document.querySelector(`${ed} .sys-selection h3`).textContent.includes(`${n}.`), [ED, node], { what: `${node}'s GPIO` });
    await setField(page, '.sys-pins', pins);
    await setField(page, '.sys-dir', dir);
  }
  const m0 = await model(page);
  const gpio = (id) => `${id}.${m0.nodes.find((n) => n.id === id).interfaces.find((f) => f.kind === 'gpio').name}`;
  assert.deepEqual(m0.nodes.map((n) => n.interfaces.filter((f) => f.kind === 'gpio').map((f) => [f.pins, f.dir])), [[[['btn'], 'in']], [[['D2'], 'out']], []]);
  await page.click(`${ED} .sys-tool`, { text: 'Link' });
  await page.click(await ifaceRow(page, gpio('uno')));
  await page.click(await ifaceRow(page, gpio('fpga')));
  await page.waitFor((ed) => document.querySelector(`${ed} .doc-status`)?.textContent === '3 nodes · 2 links', [ED], { what: 'the GPIO link' });
  const m = await model(page);
  assert.deepEqual(m.links.at(-1), { id: 'wires', kind: 'gpio', a: gpio('uno'), b: gpio('fpga') });
  // (saved, as the format has it)
  for (let t = Date.now(); Date.now() - t < 15000;) { if (JSON.parse(await readWs(env, 'CoGpio', 'g.sys.json')).links.length === 2) break; await new Promise((r) => setTimeout(r, 100)); }
  assert.deepEqual(JSON.parse(await readWs(env, 'CoGpio', 'g.sys.json')).links, m.links);
  await page.waitFor((w) => window.SilinxApp.S.diags.some((d) => d.tool === 'System' && d.message === w), [W5], { what: 'the 5 V warning' });
  assert.deepEqual(await page.eval(() => window.SilinxApp.S.diags.filter((d) => d.tool === 'System').map((d) => `${d.severity}: ${d.message}`)), [`warning: ${W5}`]);
  // Try it: D2 high presses BTN0, the FPGA's message to the terminal; the wire in the link inspector
  await page.click(`${ED} .sys-sim-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-sim-panel:not([hidden]) .sys-run-for`), [ED], { what: 'Try it' });
  await page.click(`${ED} .sys-run-for`);
  await page.waitFor(() => { const s = window.Silinx.active.systemEditor.sim?.state(); return s && !s.running && s.now >= 100e9; }, [], { what: '100 ms run', timeout: 60000 });
  const s = await page.eval(() => window.Silinx.active.systemEditor.sim.state());
  assert.equal(s.terminals.term, 'Hello from Silinx!\r\n');
  assert.deepEqual(s.traffic.filter((t) => t.kind === 'wire').map((t) => [t.wire, t.from, t.to, t.changes]), [['wires_uno', 'uno.D2', 'fpga.btn', 3]]);
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .sys-wire[data-wire="wires_uno"] .sys-wire-cap`).textContent, ED), /^wires_uno: uno\.D2 → fpga\.btn · 3 change\(s\)$/);
  // in Portuguese: the GPIO's properties
  await page.eval((id) => window.Silinx.active.systemEditor.select({ kind: 'iface', id }), gpio('uno'));
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => { const ls = [...document.querySelectorAll(`${ed} .asm-side .asm-label`)].map((l) => l.textContent); return ls.includes('Pinos') && ls.includes('Direção'); }, [ED], { what: 'Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
