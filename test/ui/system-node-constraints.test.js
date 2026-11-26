// UI (#5581's part 2): a System's FPGA node's constraints file. A System document of before (its FPGA node's pins in it)
// has them moved into the node's constraints file when its project opens, said in the console (the file the uart-avr
// example's, line for line); the node's I/O Pin Planning (the Silinx interface's Emulate tree, opened in Emulate; the ISE
// style's node row; alone since #5642, no User Constraints folder): its board, its module's ports, a pin changed written
// to its file; its Check, Check Constraints (its module, its board); its Text view (the file; a node with none: the
// table's text, the file made by its Check, the node told it; Edit Constraints (Text) of before); the System editor's
// side panel names the file; in Portuguese. The warnings asserted. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';
import { ROOT } from '../examples-lib.mjs';
import { nodePinsOf } from '../../core/system-constraints.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DEV = { commit: 'abc1234', date: '2026-10-24 12:00' };
const ISE = process.env.SILINX_UI_INTERFACE === 'ise';
const EX = path.join(ROOT, 'examples/uart-avr');
const UCF = fs.readFileSync(path.join(EX, 'fpga/uart.ucf'), 'utf8');
const DOC = JSON.parse(fs.readFileSync(path.join(EX, 'uart_avr.sys.json'), 'utf8'));
const file = (pj, f) => path.join(env.server.workspace, pj, f);
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const problems = async (page) => (await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l));
// a System document of before: its FPGA node's pins in it, no constraints file
const oldDoc = () => {
  const d = structuredClone(DOC), n = d.nodes.find((x) => x.kind === 'fpga');
  n.pins = nodePinsOf(n, UCF).pins;
  delete n.constraints;
  return JSON.stringify(d, null, 2);
};
const BOX = '#task-emu-panel';
// the node's I/O Pin Planning run: the Emulate tree's (the Silinx interface), the node's row's (ISE style)
async function run(page, label) {
  if (ISE) {
    await page.treeRow('#hier', 'fpga', { exact: true });
    await page.treeRow('#procs', label, { exact: true, dbl: true });
    return;
  }
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.waitFor((b, l) => [...document.querySelectorAll(`${b} .task-emu-tree .row .lbl`)].some((x) => x.textContent === l), [BOX, label], { what: label });
  await page.eval((b, l) => [...document.querySelectorAll(`${b} .task-emu-tree .row`)].find((x) => x.querySelector('.lbl').textContent === l).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), BOX, label);
}
const tasks = async (page) => {
  if (ISE) return;
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
};

uiTest('#5581 #5642 an FPGA node\'s constraints file: a document of before moved into it; its I/O Pin Planning (in Emulate), its Check, the System editor\'s field; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'SysPins', template: 'uart-avr', files: { 'uart_avr.sys.json': oldDoc() } });
  fs.rmSync(file('SysPins', 'fpga/uart.ucf'));
  await page.setViewport(1680, 1050);
  await tasks(page);
  await page.openProject('SysPins');
  // its pins moved into the node's file, said; the file the example's, the document the example's
  await page.waitConsole(/^uart_avr\.sys\.json: fpga: its pins written to its constraints file fpga\/uart\.ucf \(a System's pins are in its FPGA nodes' constraints files now\)\.$/m);
  assert.equal(fs.readFileSync(file('SysPins', 'fpga/uart.ucf'), 'utf8'), UCF);
  assert.deepEqual(JSON.parse(fs.readFileSync(file('SysPins', 'uart_avr.sys.json'), 'utf8')), DOC);
  // its I/O Pin Planning: in the Emulate tree (the Silinx interface)
  if (!ISE) {
    await page.click('#task-switch .task-btn[data-task="emu"]');
    await page.waitFor((b) => document.querySelectorAll(`${b} .task-emu-tree li`).length > 5, [BOX], { what: 'the tree' });
    const rows = await page.eval((b) => { const depth = (li) => { let d = 0; for (let p = li.parentElement.closest('li'); p; p = p.parentElement.closest('li')) d++; return d; };
      return [...document.querySelectorAll(`${b} .task-emu-tree li`)].map((li) => `${'  '.repeat(depth(li))}${li.querySelector(':scope > .row .lbl').textContent}`); }, BOX);
    const at = rows.indexOf('  fpga (Digilent Basys2)');   // (the node's rows: its Emulate Node's models may be drawn after it)
    assert.deepEqual(rows.slice(at, at + 3), ['  fpga (Digilent Basys2)', '    I/O Pin Planning', '    Emulate Node']);
  }
  // I/O Pin Planning: its board, its module, its file (in Emulate, the Silinx interface's, #5642)
  await run(page, 'I/O Pin Planning');
  await page.waitFor(() => window.SilinxApp.S.active?.id === 'pins:fpga' && document.querySelector('.doc:not([hidden]) .pin-planner .pp-table'), [], { what: 'the node\'s pin planner' });
  assert.equal(await page.eval(() => window.SilinxApp.S.active.title), 'I/O Pin Planning (fpga)');
  if (!ISE) assert.equal(await page.eval(() => document.documentElement.dataset.task), 'emu');
  // its Check: its module's ports, its board's pins
  await page.click('.doc:not([hidden]) .pp-check');
  await page.waitConsole(/^Process "Check Constraints" completed successfully$/m);
  assert.ok((await lines(page)).includes('Started : "Check Constraints" of fpga/uart.ucf.'));
  // TX on B4, written to its file
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .doc-status span')].map((s) => s.textContent).filter((t) => t)),
    ['24/24 I/Os assigned', 'Top: uart', 'Device xc3s250e-cp132', 'Board: Digilent Basys2']);
  await page.eval(() => {
    const inp = [...document.querySelectorAll('.doc:not([hidden]) .pp-table tr')].find((r) => r.cells[0]?.textContent === 'tx').cells[3].querySelector('input');
    inp.value = 'B4'; inp.dispatchEvent(new Event('change'));
  });
  await page.waitFor(() => !window.SilinxApp.S.active.tab.classList.contains('dirty'), [], { what: 'saved' });
  for (let k = 0; k < 50 && !/NET "tx" +LOC = "B4"/.test(fs.readFileSync(file('SysPins', 'fpga/uart.ucf'), 'utf8')); k++) await new Promise((r) => setTimeout(r, 100));
  assert.match(fs.readFileSync(file('SysPins', 'fpga/uart.ucf'), 'utf8'), /^NET "tx" +LOC = "B4" ;$/m);
  assert.equal(nodePinsOf(DOC.nodes[1], fs.readFileSync(file('SysPins', 'fpga/uart.ucf'), 'utf8')).pins.rx, 'J3', 'the others kept');
  // the System editor: its side panel names the node's file
  await page.eval(() => window.SilinxApp.openFile('uart_avr.sys.json'));
  await page.waitFor(() => window.SilinxApp.findDoc('sys:uart_avr.sys.json')?.systemEditor, [], { what: 'the System editor' });
  await page.eval(() => window.SilinxApp.findDoc('sys:uart_avr.sys.json').systemEditor.select({ kind: 'node', id: 'fpga' }));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .sys-constraints')?.textContent === 'fpga/uart.ucf', [], { what: 'its file named' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .sys-pins, .doc:not([hidden]) .sys-edit-constraints')].map((b) => b.textContent)), ['I/O Pin Planning']);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  if (ISE) {
    await page.treeRow('#hier', 'fpga', { exact: true });
    await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Planeamento de Pinos de E/S'), [], { what: 'Portuguese' });
  } else {
    await page.click('#task-switch .task-btn[data-task="emu"]');
    await page.waitFor((b) => [...document.querySelectorAll(`${b} .task-emu-tree .lbl`)].some((l) => l.textContent === 'Planeamento de Pinos de E/S'), [BOX], { what: 'Portuguese' });
  }
  assert.ok(await page.eval(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^uart_avr\.sys\.json: fpga: os seus pinos escritos no seu ficheiro de restrições fpga\/uart\.ucf/.test(l.textContent))), 'the console\'s line in Portuguese');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(await problems(page), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { build: DEV, timeout: 240000 });

// (Edit Constraints (Text) of before, #5642: I/O Pin Planning's Text view, its Check)
uiTest('#5581 #5642 I/O Pin Planning\'s Text view of an FPGA node with no constraints file: the table\'s text; its Check makes the file (no pin yet), the node told it, no warning', E, async (page) => {
  const d = structuredClone(DOC);
  delete d.nodes.find((x) => x.kind === 'fpga').constraints;
  await makeProject(env, { name: 'SysPinsNew', template: 'uart-avr', files: { 'uart_avr.sys.json': JSON.stringify(d, null, 2) } });
  fs.rmSync(file('SysPinsNew', 'fpga/uart.ucf'));
  await tasks(page);
  await page.openProject('SysPinsNew');
  await run(page, 'I/O Pin Planning');
  await page.waitFor(() => window.SilinxApp.S.active?.id === 'pins:fpga' && document.querySelector('.doc:not([hidden]) .pp-view[data-view=text]'), [], { what: 'the node\'s pin planner' });
  await page.click('.doc:not([hidden]) .pp-view[data-view=text]');
  await page.waitFor(() => window.SilinxApp.S.active.pinText()?.getValue(), [], { what: 'the Text view' });
  const shown = await page.eval(() => window.SilinxApp.S.active.pinText().getValue());
  assert.equal(shown.split('\n')[0], '# UCF generated by Silinx I/O Pin Planning for top \'uart\' (xc3s250e-4-cp132, Digilent Basys2)');
  assert.ok(!fs.existsSync(file('SysPinsNew', 'fpga/uart.ucf')), 'not made by showing it');
  await page.click('.doc:not([hidden]) .pp-check');
  await page.waitConsole(/^Process "Check Constraints" completed successfully$/m);
  const made = fs.readFileSync(file('SysPinsNew', 'fpga/uart.ucf'), 'utf8');
  assert.equal(made, shown);
  assert.deepEqual(nodePinsOf(DOC.nodes[1], made).pins, {});
  assert.equal(JSON.parse(fs.readFileSync(file('SysPinsNew', 'uart_avr.sys.json'), 'utf8')).nodes[1].constraints, 'fpga/uart.ucf');
  assert.deepEqual(await problems(page), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { build: DEV, timeout: 180000 });
