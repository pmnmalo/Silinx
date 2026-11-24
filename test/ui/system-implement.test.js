// UI (#5446): a System's FPGA node implemented on its own board from the Design pane: the uart-avr example's FPGA node's
// row has Synthesize, Implement Design and Generate Programming File; Synthesize run: its run's lines in the console,
// built in build/nodes/fpga/; the System's row has Implement System; in Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const procs = (page) => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map((l) => l.textContent.trim()).filter((t) => t !== 'Design Summary/Reports' && t !== 'Resumo do Projeto/Relatórios'));
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));

uiTest('#5446 a System\'s FPGA node synthesized on its own board from its row; the System\'s Implement System; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'NodeImpl', template: 'uart-avr' });
  await page.openProject('NodeImpl');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'fpga'), [], { what: 'the nodes' });
  await page.treeRow('#hier', 'fpga', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Synthesize'), [], { what: 'the node\'s processes' });
  assert.deepEqual(await procs(page), ['View/Edit System', 'Check Syntax', 'View RTL Schematic', 'Synthesize', 'Implement Design', 'Generate Programming File']);
  await page.treeRow('#procs', 'Synthesize', { exact: true, dbl: true });
  await page.waitConsole(/^Process "Synthesize \(System node fpga\)" completed successfully$/m, { timeout: 120000 });
  const all = await lines(page);
  assert.ok(all.includes('System node fpga: its module uart on basys2 (250), its constraints fpga.ucf from its pins, built in build/nodes/fpga/.'), all.join('\n'));
  assert.ok(fs.existsSync(path.join(env.server.workspace, 'NodeImpl/build/nodes/fpga/build/open/uart.json')), 'its netlist in its own folder');
  // the System's row: Implement System
  await page.treeRow('#hier', 'uart_avr', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Implement System'), [], { what: 'the System\'s processes' });
  assert.deepEqual(await procs(page), ['View/Edit System', 'Check System', 'Emulate System', 'Implement System']);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Implementar Sistema'), [], { what: 'Portuguese' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 240000 });
