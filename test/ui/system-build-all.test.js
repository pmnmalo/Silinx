// UI (#5489): a System built by its plan from the Design pane: the uart-avr example with a sketch in its Arduino's
// folder (arduino-cli's stand-in, test/fixtures/arduino-cli-stub, config.json's path); the System's row's Build Plan (one
// line a node, the FPGA node first: not built, out of date) and Build All (both built in that order, their lines),
// Build Plan again (both up to date); in Portuguese; the browser edition says the local server builds it. No warnings.
// Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';
import { ROOT } from '../server-helpers.js';

const STUB = path.join(ROOT, 'test/fixtures/arduino-cli-stub/arduino-cli');
let env;
before(async () => {
  env = await setupUi();
  if (env?.server) fs.writeFileSync(path.join(env.server.configDir, 'config.json'), JSON.stringify({ mode: 'silinx', editor: 'off', paths: { 'arduino-cli': STUB } }));
});
after(async () => { await env?.teardown?.(); });
const E = () => env;
const procs = (page) => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map((l) => l.textContent.trim()).filter((t) => t !== 'Design Summary/Reports' && t !== 'Resumo do Projeto/Relatórios'));
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const UNO = 'compiled by arduino-cli to uno/hello.hex, programmed by avrdude (arduino-cli upload)';
const FPGA = 'built by the Silinx toolchain to build/nodes/fpga/build/uart.bit, programmed over JTAG';

uiTest('#5489 the System\'s Build Plan and Build All from its row: the FPGA node first, then the Arduino; Portuguese; the browser edition', E, async (page) => {
  if (process.platform === 'win32') return;   // (the stand-in for arduino-cli is a script run by its #! line)
  await makeProject(env, { name: 'SysBuild', template: 'uart-avr' });
  fs.writeFileSync(path.join(env.server.workspace, 'SysBuild/uno/hello.ino'), 'void setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {}\n');
  await page.openProject('SysBuild');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'uart_avr'), [], { what: 'the System' });
  await page.treeRow('#hier', 'uart_avr', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Build All'), [], { what: 'the System\'s processes' });
  assert.deepEqual(await procs(page), ['View/Edit System', 'Check System', 'Emulate System', 'Implement System', 'Build Plan', 'Build All', 'Connected Boards', 'Program All']);
  // Build Plan: one line a node
  await page.treeRow('#procs', 'Build Plan', { exact: true, dbl: true });
  await page.waitConsole(/^Process "Build Plan" completed successfully$/m);
  const plan = ['Build plan (the FPGA nodes first, then the microcontrollers):',
    `  fpga: not built (no build/nodes/fpga/build/uart.bit yet); ${FPGA}`,
    `  uno: out of date (its last build left no record of its sources); ${UNO}`];
  let all = await lines(page);
  assert.ok(plan.every((l) => all.includes(l)), all.join('\n'));
  // Build All: both, in that order
  await page.treeRow('#procs', 'Build All', { exact: true, dbl: true });
  await page.waitConsole(/^Process "Build All" completed successfully$/m, { timeout: 180000 });
  all = await lines(page);
  const order = ['System node fpga: building (not built).', 'System node fpga: built, build/nodes/fpga/build/uart.bit.',
    'System node uno: building (out of date).', 'System node uno: built, uno/hello.hex.', 'Build: 2 node(s) built (fpga, uno), 0 failed, 0 left as they were.'];
  assert.deepEqual(all.filter((l) => order.includes(l)), order, all.join('\n'));
  assert.ok(fs.existsSync(path.join(env.server.workspace, 'SysBuild/build/nodes/fpga/build/uart.bit')), 'the FPGA node\'s bitstream');
  // Build Plan again: up to date
  await page.treeRow('#procs', 'Build Plan', { exact: true, dbl: true });
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].filter((l) => /^Process "Build Plan" completed successfully$/.test(l.textContent)).length === 2, [], { what: 'the second plan' });
  all = await lines(page);
  for (const l of [`  fpga: up to date; ${FPGA}`, `  uno: up to date; ${UNO}`]) assert.ok(all.includes(l), all.join('\n'));
  assert.deepEqual(all.filter((l) => /^(WARNING|ERROR)/.test(l)), [], 'no warning');
  // Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Construir Tudo'), [], { what: 'Portuguese' });
  assert.deepEqual((await procs(page)).slice(-4), ['Plano de Construção', 'Construir Tudo', 'Placas Ligadas', 'Programar Tudo']);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  // the browser edition: the local server's, said
  await page.eval(async () => { (await import('/js/api.js')).api.standalone = true; });
  await page.treeRow('#procs', 'Build All', { exact: true, dbl: true });
  await page.waitConsole(/^ERROR: Build All: a System is built by the local server for now \(the browser edition implements an FPGA project and takes a node's \.hex made elsewhere\)$/m);
  await page.eval(async () => { delete (await import('/js/api.js')).api.standalone; });
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 300000 });
