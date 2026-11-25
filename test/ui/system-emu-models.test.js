// UI (#5612): a System's FPGA node emulated on its models. Its Emulate Node in the Emulate tree (the Silinx interface) or
// on its row (the ISE style) has its RTL and the four models its Basys2's toolchain makes under it; Emulate Post-Synthesis
// Model makes the model first (its node's flow, its run's lines) and runs the node alone on it: its tab and its status
// line name the model, a byte typed comes back and its LEDs show it as the RTL's. Emulation Properties… chooses each FPGA
// node's model (silinx.json), Emulate System runs it. Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DEV = { commit: 'abc1234', date: '2026-10-24 12:00' };
const ISE = process.env.SILINX_UI_INTERFACE === 'ise';
const BOX = '#task-emu-panel';
const EMU = '.doc:not([hidden]) .sys-emu';
const MODELS = ['Emulate Behavioral Model (RTL)', 'Emulate Post-Synthesis Model', 'Emulate Post-Translate Model', 'Emulate Post-Map Model', 'Emulate Post-Place & Route Model'];
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
// a process run: the Emulate tree's (the Silinx interface), the FPGA node's row's (ISE style)
async function run(page, label) {
  if (ISE) { await page.treeRow('#hier', 'fpga', { exact: true }); await page.treeRow('#procs', label, { exact: true, dbl: true }); return; }
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.waitFor((b, l) => [...document.querySelectorAll(`${b} .task-emu-tree .row .lbl`)].some((x) => x.textContent === l), [BOX, label], { what: label });
  await page.eval((b, l) => [...document.querySelectorAll(`${b} .task-emu-tree .row`)].find((x) => x.querySelector('.lbl').textContent === l).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), BOX, label);
}

uiTest('#5612 an FPGA node emulated on its models: listed under its Emulate Node; Post-Synthesis made first and run (its tab, its status line, a byte echoed); the Emulation Properties\' model; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'SysModels', template: 'uart-avr' });
  await page.setViewport(1680, 1050);
  if (!ISE) {
    await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
    await page.reload();
    await page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  }
  await page.openProject('SysModels');
  // its models under its Emulate Node
  if (ISE) {
    await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'fpga'), [], { what: 'the node' });
    await page.treeRow('#hier', 'fpga', { exact: true });
    await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Emulate Post-Map Model'), [], { what: 'its models' });
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map((l) => l.textContent.trim()).slice(-6)), ['Emulate Node', ...MODELS]);
  } else {
    await page.click('#task-switch .task-btn[data-task="emu"]');
    await page.waitFor((b) => [...document.querySelectorAll(`${b} .task-emu-tree .row .lbl`)].some((x) => x.textContent === 'Emulate Post-Map Model'), [BOX], { what: 'its models' });
    assert.deepEqual(await page.eval((b) => [...document.querySelectorAll(`${b} .task-emu-tree .row .lbl`)].map((x) => x.textContent).slice(-6), BOX), ['Emulate Node', ...MODELS]);
  }
  // Emulate Post-Synthesis Model: made first by its node's flow, then the node alone on it
  await run(page, 'Emulate Post-Synthesis Model');
  await page.waitConsole(/^Process "Generate Post-Synthesis Simulation Model \(System node fpga\)" completed successfully$/m, { timeout: 180000 });
  assert.ok((await lines(page)).includes('Emulate Node fpga: fpga\'s post-synthesis model is not made yet: its flow makes it first.'));
  await page.waitFor((e) => document.querySelector(`${e} [data-node=fpga] .emu-pcb`) && document.querySelector(`${e} .sys-term-in`), [EMU], { what: 'the node on its model', timeout: 120000 });
  assert.equal(await page.eval(() => window.SilinxApp.S.active.title), 'Emulate (uart_avr: fpga, Post-Synthesis)');
  await page.waitFor((e) => [...document.querySelectorAll(`${e} .doc-status > *`)].some((x) => x.textContent === 'fpga: Post-Synthesis'), [EMU], { what: 'its model named' });
  await page.waitFor((e) => document.querySelector(`${e} .sysemu-run`)?.textContent === '⏸ Pause', [EMU], { what: 'running once ready (#5619)', timeout: 60000 });
  await page.click(`${EMU} .sys-term-in`);
  await page.type('A');
  await page.key('Enter');
  await page.waitFor(() => window.SilinxApp.findDoc('sysemu:uart_avr.sys.json').emulator.state()?.boards?.fpga?.leds?.join() === '0,1,0,1,0,0,0,0', [], { what: 'LF on its LEDs', timeout: 120000 });
  await page.waitFor((e) => document.querySelector(`${e} .sys-term-out`)?.textContent === 'A\n', [EMU], { what: 'the echo', timeout: 60000 });
  await page.click(`${EMU} .sysemu-run`);
  // the Emulation Properties: its Post-Map model
  if (ISE) { await page.treeRow('#hier', 'uart_avr', { exact: true }); await page.treeRow('#procs', 'Emulation Properties…', { exact: true, dbl: true }); }
  else { await page.click('#task-switch .task-btn[data-task="emu"]'); await page.eval((b) => [...document.querySelectorAll(`${b} .task-emu-tree .row`)].find((x) => x.querySelector('.lbl').textContent === 'Emulation Properties…').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), BOX); }
  await page.waitFor(() => document.querySelector('.dlg .sys-emu-model'), [], { what: 'its model\'s choice' });
  assert.deepEqual(await page.eval(() => [...document.querySelector('.dlg .sys-emu-model').options].map((o) => o.textContent)), ['Behavioral (RTL)', 'Post-Synthesis', 'Post-Translate', 'Post-Map', 'Post-Place & Route']);
  await page.eval(() => { document.querySelector('.dlg .sys-emu-model').value = 'postmap'; [...document.querySelectorAll('.dlg .btn')].find((b) => b.textContent === 'OK').click(); });
  await page.waitConsole(/^Emulation Properties: Emulate System runs every node; fpga on its Post-Map model$/m);
  const json = () => JSON.parse(fs.readFileSync(path.join(env.server.workspace, 'SysModels', 'silinx.json'), 'utf8'));
  for (let k = 0; k < 50 && !json().system; k++) await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(json().system, { emulate: { models: { fpga: 'postmap' } } });
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  if (ISE) {
    await page.treeRow('#hier', 'fpga', { exact: true });
    await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Emular Modelo Pós-Síntese'), [], { what: 'Portuguese' });
  } else {
    await page.click('#task-switch .task-btn[data-task="emu"]');
    await page.waitFor((b) => [...document.querySelectorAll(`${b} .task-emu-tree .row .lbl`)].some((x) => x.textContent === 'Emular Modelo Pós-Síntese'), [BOX], { what: 'Portuguese' });
  }
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual((await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l) && !/^WARNING: Emulate Node fpga: link serial:/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { build: DEV, timeout: 480000 });
