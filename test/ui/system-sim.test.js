// UI (#4701): the System's simulation view. A co-design project (the uart example's modules, an AVR's echo program as a
// .hex): its System, an Arduino Uno linked by UART to the FPGA node, opened in the System editor; Simulate, Run 100 ms:
// the FPGA node's module compiled (Yosys), the AVR's "Hi" and the FPGA's echo of each byte (and the AVR's answers plus
// one) in the link inspector; the waves in the waveform viewer, a scope a node; the console's lines, no warnings. A
// terminal linked to the FPGA instead: a line typed, its echo read back. The AVR's firmware an .elf instead (#5198): its
// bytes read by the page, the same run. Portuguese; both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { intelHex, echoProgram, avrElf } from '../avr-asm.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const FPGA = { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: { rx: 'J3', tx: 'A3' }, interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }], x: 300, y: 0 };
const UNO = { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/echo.hex', interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: 0, y: 0 };
const TERM = { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: 0, y: 200 };
const doc = (nodes, links) => JSON.stringify({ format: 'silinx-system', version: 1, name: 'uart_avr', nodes, links }, null, 2);

async function codesign(name, system) {
  await makeProject(env, { name, template: 'uart', files: { 'uart_avr.sys.json': system, 'fw/echo.hex': intelHex(echoProgram()) } });
  const pj = await env.server.api('GET', `/api/projects/${name}`);
  delete pj.fileTree;
  await env.server.api('PUT', `/api/projects/${name}`, { ...pj, kind: 'codesign', board: null, constraints: null, top: null });
}
async function openSystem(page, name) {
  await page.openProject(name);
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .badge')].some((b) => b.textContent === 'System'), [], { what: 'the System\'s row' });
  await page.click('#hier .row .badge', { text: 'System' });
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
}
const state = (page) => page.eval(() => window.Silinx.active.systemEditor.sim?.state() ?? null);
const consoleLines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()).filter(Boolean));

uiTest('#4701 Simulate System: an AVR and the FPGA by UART, their bytes in the link inspector, the waves; Portuguese', E, async (page) => {
  await codesign('CoSim', doc([UNO, FPGA], [{ id: 'serial', kind: 'uart', a: 'uno.Serial', b: 'fpga.uart' }]));
  await openSystem(page, 'CoSim');
  // (its toolbar's Try it, the green Try it panel of the other drawing editors, #5194)
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .sys-sim-btn`).textContent.trim(), ED), 'Try it');
  await page.click(`${ED} .sys-sim-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-sim-panel:not([hidden]) .sys-run-for`), [ED], { what: 'the simulation view' });
  assert.deepEqual(await page.eval((ed) => { const p = document.querySelector(`${ed} .sys-sim-panel`); return [p.classList.contains('try-it'), p.querySelector('.asm-code-title').textContent, p.querySelector('.sys-sim-host').classList.contains('try-it-body'), document.querySelector(`${ed} .sys-sim-btn`).classList.contains('active')]; }, ED),
    [true, 'Try it', true, true]);
  await page.click(`${ED} .sys-run-for`);
  await page.waitFor(() => { const s = window.Silinx.active.systemEditor.sim?.state(); return s && !s.running && s.now >= 100e9; }, [], { what: '100 ms run', timeout: 60000 });
  const s = await state(page);
  const text = (w) => String.fromCharCode(...s.traffic.find((t) => t.wire === w).bytes.map((b) => b.byte));
  assert.deepEqual(s.traffic.map((t) => [t.wire, t.from, t.to]), [['serial_uno', 'uno.D1', 'fpga.rx'], ['serial_fpga', 'fpga.tx', 'uno.D0']]);
  assert.equal(text('serial_uno').slice(0, 6), 'HiIjJk');
  assert.equal(text('serial_fpga').slice(0, 5), 'HiIjJ');
  assert.deepEqual([s.warnings, s.errors], [[], []]);
  // the link inspector: each wire, its text and its bytes
  const insp = await page.eval((ed) => [...document.querySelectorAll(`${ed} .sys-wire`)].map((w) => [w.querySelector('.sys-wire-cap').textContent, w.querySelector('.sys-wire-text').textContent.slice(0, 6), w.querySelector('.sys-byte')?.textContent]), ED);
  assert.match(insp[0][0], /^serial_uno: uno\.D1 → fpga\.rx · 9600 8N1 · \d+ B$/);
  assert.deepEqual(insp.map((x) => [x[1].slice(0, 5), x[2]]), [['HiIjJ', '0x48 \'H\''], ['HiIjJ', '0x48 \'H\'']]);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .sys-sim-time`).textContent, ED), 't = 100 ms');
  const lines = await consoleLines(page);
  assert.ok(lines.includes('Simulate System: uno, fpga ready, 2 wire(s).'), lines.join('\n'));
  assert.ok(lines.includes('Simulate System: paused at 100 ms.'), lines.join('\n'));
  // the waves: a scope a node, and the links
  await page.click(`${ED} .sys-waves`);
  await page.waitFor(() => window.Silinx.active?.id === 'syswaves:CoSim' && document.querySelector('.doc:not([hidden]) .isim'), [], { what: 'the waves' });
  const rows = await page.eval(() => window.SilinxApp.findDoc('syswaves:CoSim').view.getState().rows.map((r) => r.path));
  assert.deepEqual(rows, ['uart_avr.uno.D1', 'uart_avr.uno.D0', 'uart_avr.fpga.rx', 'uart_avr.fpga.tx', 'uart_avr.links.serial_uno', 'uart_avr.links.serial_fpga']);
  // in Portuguese
  await page.click('.doc-tab', { text: 'uart_avr.sys.json' }).catch(() => page.eval(() => window.SilinxApp.activateDoc(window.SilinxApp.findDoc('sys:uart_avr.sys.json'))));
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-run-for`)?.textContent === 'Correr 100 ms' && document.querySelector(`${ed} .sys-waves`)?.textContent === 'Ondas', [ED], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((ed) => [document.querySelector(`${ed} .sys-sim-btn`).textContent.trim(), document.querySelector(`${ed} .sys-sim-btn`).title, document.querySelector(`${ed} .sys-sim-panel .asm-code-title`).textContent], ED),
    ['Experimentar', 'Experimentar o Sistema: os nós a correr juntos, as ligações descodificadas, as ondas', 'Experimentar']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

uiTest('#4701 Simulate System: a terminal typing to the FPGA, its echo read back; Restart from 0', E, async (page) => {
  await codesign('CoTerm', doc([FPGA, TERM], [{ id: 'console', kind: 'uart', a: 'term.serial', b: 'fpga.uart' }]));
  await openSystem(page, 'CoTerm');
  await page.click(`${ED} .sys-sim-btn`);
  await page.click(`${ED} .sys-run-for`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-term-in`) && !window.Silinx.active.systemEditor.sim.state()?.running, [ED], { what: 'the terminal', timeout: 60000 });
  await page.click(`${ED} .sys-term-in`);
  await page.type('OK');
  await page.key('Enter');
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-term-out`)?.textContent === 'OK\n', [ED], { what: 'the echo', timeout: 30000 });
  await page.waitFor(() => !window.Silinx.active.systemEditor.sim.state()?.running, [], { what: 'the run ended', timeout: 30000 });
  assert.deepEqual((await state(page)).warnings, []);
  await page.click(`${ED} .sys-restart`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-sim-time`)?.textContent === 't = 0 ms' && document.querySelector(`${ed} .sys-term-out`)?.textContent === '', [ED], { what: 'restarted', timeout: 60000 });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

uiTest('#5198 Try it with an .elf firmware: its bytes read by the page, the AVR\'s and the FPGA\'s bytes those of the .hex', E, async (page) => {
  await codesign('CoElf', doc([{ ...UNO, firmware: 'fw/echo.elf' }, FPGA], [{ id: 'serial', kind: 'uart', a: 'uno.Serial', b: 'fpga.uart' }]));
  await fsp.writeFile(path.join(env.server.workspace, 'CoElf', 'fw', 'echo.elf'), avrElf(echoProgram()));
  await openSystem(page, 'CoElf');
  await page.click(`${ED} .sys-sim-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-sim-panel:not([hidden]) .sys-run-for`), [ED], { what: 'the simulation view' });
  await page.click(`${ED} .sys-run-for`);
  await page.waitFor(() => { const s = window.Silinx.active.systemEditor.sim?.state(); return s && !s.running && s.now >= 100e9; }, [], { what: '100 ms run', timeout: 60000 });
  const s = await state(page);
  const text = (w) => String.fromCharCode(...s.traffic.find((t) => t.wire === w).bytes.map((b) => b.byte));
  assert.equal(text('serial_uno').slice(0, 6), 'HiIjJk');
  assert.equal(text('serial_fpga').slice(0, 5), 'HiIjJ');
  assert.deepEqual([s.warnings, s.errors], [[], []]);
  const lines = await consoleLines(page);
  assert.ok(lines.includes('Simulate System: uno, fpga ready, 2 wire(s).'), lines.join('\n'));
  assert.deepEqual(lines.filter((l) => /^(ERROR|WARNING)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
