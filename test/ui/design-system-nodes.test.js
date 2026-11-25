// UI (#5414, #5416's phase 2): a System project's nodes as branches of the Design pane (core/project-nodes.js). Under the
// System's row: the Arduino with its firmware, the FPGA node with its module's hierarchy, the terminal, the circuit node
// with its drawing (not among the project's other rows too). Their processes: the System's View/Edit, Check and Emulate;
// an FPGA node's Check Syntax (run: its line) and RTL schematic; a microcontroller's View/Edit System. Portuguese; no
// warnings. Both interfaces. (A project with one node, an FPGA or a design project, is drawn as before: its own tests.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const BENCH = { format: 'silinx-circuit', version: 1, name: 'bench', lang: 'vhdl',
  parts: [{ id: 'S1', type: 'logic-switch', x: 8, y: 25 }, { id: 'D2', type: 'led', x: 12, y: 26, color: 'green' }], wires: [] };
const SYS = JSON.stringify({ format: 'silinx-system', version: 2, name: 'lab', nodes: [
  { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/hello.hex', interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: 0, y: 0 },
  { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: { clk: 'B8', rx: 'J3', tx: 'A3' }, interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }], x: 300, y: 0 },
  { id: 'term', kind: 'terminal', interfaces: [], x: 0, y: 200 },
  { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [], x: 300, y: 200 },
], links: [{ id: 'serial', kind: 'uart', a: 'uno.Serial', b: 'fpga.uart' }] }, null, 2);
const HEX = ':00000001FF\n';
const warnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((l) => /^(WARNING|ERROR)/.test(l)));
// the System's branches: each node's label and meta, and its children's labels
const branches = (page) => page.eval(() => {
  const sys = [...document.querySelectorAll('#hier li')].find((li) => li.querySelector(':scope > .row .badge')?.textContent === 'System');
  return [...sys.querySelectorAll(':scope > ul > li')].map((li) => [li.querySelector(':scope > .row .lbl').textContent.trim(), li.querySelector(':scope > .row .meta')?.textContent.trim() || '',
    [...li.querySelectorAll(':scope > ul > li > .row .lbl')].map((l) => l.textContent.trim())]);
});
const procs = (page) => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map((l) => l.textContent.trim()).filter((t) => t !== 'Design Summary/Reports' && t !== 'Resumo do Projeto/Relatórios'));

uiTest('#5414 a System project\'s nodes as the Design pane\'s branches, each with its files and processes; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Nodes', template: 'uart', files: { 'lab.sys.json': SYS, 'src/bench.circ.json': JSON.stringify(BENCH, null, 2), 'fw/hello.hex': HEX } });
  const pj = await env.server.api('GET', '/api/projects/Nodes');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/Nodes', { ...pj, kind: 'system', board: null, constraints: null, top: null });
  await page.openProject('Nodes');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'uno'), [], { what: 'the nodes' });
  const b = await branches(page);
  assert.deepEqual(b.map(([l, m]) => [l, m]), [['uno', '(Arduino Uno)'], ['fpga', '(Digilent Basys2)'], ['term', ''], ['bench', '']]);
  assert.deepEqual(b[0][2], ['hello.hex']);
  assert.equal(b[1][2][0], 'uart');
  assert.deepEqual(b[2][2], []);
  assert.deepEqual(b[3][2], ['bench.circ.json']);
  // (the circuit under its node only, not among the project's other rows too)
  assert.equal(await page.eval(() => [...document.querySelectorAll('#hier .row .lbl')].filter((l) => l.textContent.trim() === 'bench.circ.json').length), 1);
  // the processes: the System's, a microcontroller's, an FPGA node's
  await page.treeRow('#hier', 'lab', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Check System'), [], { what: 'the System\'s processes' });
  assert.deepEqual(await procs(page), ['View/Edit System', 'Check System', 'Emulate System', 'Emulation Properties…', 'Implement System', 'Build Plan', 'Build All', 'Connected Boards', 'Program All']);   // (Implement System, #5446; Build Plan, Build All, #5489)
  await page.treeRow('#hier', 'uno', { exact: true });
  await page.waitFor(() => ![...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Check System'), [], { what: 'the node\'s processes' });
  assert.deepEqual(await procs(page), ['View/Edit System', 'Compile Firmware', 'Program Node', 'Emulate Node']);   // (its sketch's, #5503)
  await page.treeRow('#hier', 'fpga', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Check Syntax'), [], { what: 'the FPGA node\'s processes' });
  assert.deepEqual(await procs(page), ['View/Edit System', 'Check Syntax', 'View RTL Schematic', 'Synthesize', 'Implement Design', 'Generate Programming File', 'Program Node', 'Emulate Node']);   // (on its own board, #5446)
  await page.treeRow('#procs', 'Check Syntax', { exact: true, dbl: true });
  await page.waitConsole(/^Process "Check Syntax" completed successfully$/m);
  // (its module's row: its node's processes, no flow on the project's default device, #5443)
  await page.treeRow('#hier', 'uart', { exact: true });
  await page.waitFor(() => ![...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'View/Edit System'), [], { what: 'the module\'s processes' });
  assert.deepEqual(await procs(page), ['Check Syntax', 'View RTL Schematic']);
  await page.treeRow('#hier', 'fpga', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'View/Edit System'), [], { what: 'the node\'s processes again' });
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Ver/Editar Sistema'), [], { what: 'the processes in Portuguese' });
  assert.deepEqual(await procs(page), ['Ver/Editar Sistema', 'Verificar Sintaxe', 'Ver Esquemático RTL', 'Sintetizar', 'Implementar Projeto', 'Gerar Ficheiro de Programação', 'Programar Nó', 'Emular o Nó']);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
