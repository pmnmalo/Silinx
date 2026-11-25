// UI (#5581's part 3): a System project's Simulate. The Silinx interface's Simulate task shows the System's tree (its
// row: Simulation Properties… and Simulate System; a row per node: Simulate Node), its page saying so; the FPGA's Simulate
// Node runs it alone in a document of its own in the Simulate task, the Uno's end of their link a terminal (its warning
// exact), for the Simulation Properties' time (100 ms, its status line); Simulation Properties… ticks the FPGA alone, 30
// ms, a new stimulus file (made, said, silinx.json), a line typed at 2 ms written into it: Simulate System runs the FPGA
// alone for 30 ms, the line echoed. Portuguese. The ISE style: the System's and the nodes' rows. Both interfaces.
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
const TREE = '.task-sim-system';
const DOC = '.doc:not([hidden]) .sys-sim-doc';
const WARN = 'WARNING: Simulate Node fpga: link serial: uno is not run, its end fpga.uart is the terminal serial here (9600 baud, 8N1)';
const rows = (page) => page.eval((b) => {
  const depth = (li) => { let d = 0; for (let p = li.parentElement.closest('li'); p; p = p.parentElement.closest('li')) d++; return d; };
  return [...document.querySelectorAll(`${b} li`)].map((li) => `${'  '.repeat(depth(li))}${li.querySelector(':scope > .row .lbl').textContent}`);
}, TREE);
const run = (page, label, k = 0) => page.eval((b, l, i) => [...document.querySelectorAll(`${b} .row`)].filter((x) => x.querySelector('.lbl').textContent === l)[i]
  .dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), TREE, label, k);
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const problems = async (page) => (await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l));
const status = (page) => page.eval((d) => document.querySelector(`${d} .doc-status`)?.textContent ?? null, DOC);
const term = (page) => page.eval((d) => document.querySelector(`${d} .sys-term-out`)?.textContent ?? null, DOC);
const EN = ['uart_avr (System)', '  Simulation Properties…', '  Simulate System', '  uno (Arduino Uno)', '    Simulate Node', '  fpga (Digilent Basys2)', '    Simulate Node'];

uiTest('#5581 a System\'s Simulate: its tree, a node simulated alone in a document of its own, the Simulation Properties (the nodes, the time, a stimulus file); Portuguese; the ISE style\'s rows', E, async (page) => {
  await makeProject(env, { name: 'SysSim', template: 'uart-avr' });
  await page.setViewport(1680, 1050);
  if (!ISE) {
    await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
    await page.reload();
    await page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  }
  await page.openProject('SysSim');
  if (ISE) {
    await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'fpga'), [], { what: 'the node' });
    await page.treeRow('#hier', 'fpga', { exact: true });
    await page.treeRow('#procs', 'Simulate Node', { exact: true, dbl: true });
  } else {
    await page.click('#task-switch .task-btn[data-task="sim"]');
    await page.waitFor((b) => document.querySelectorAll(`${b} li`).length > 0, [TREE], { what: 'the tree' });
    assert.deepEqual(await rows(page), EN);
    assert.equal(await page.eval(() => document.querySelector('#task-empty p').textContent), 'Simulate the System: Simulate System runs its nodes together, a node\'s Simulate Node that node alone; the run opens here.');
    await run(page, 'Simulate Node', 1);   // (the FPGA's)
  }
  // the FPGA alone, for 100 ms, in the Simulate task
  await page.waitFor((d) => document.querySelector(d)?.closest('.doc')?.querySelector('.doc-status')?.textContent === 't = 100 ms', [DOC], { what: 'its run', timeout: 60000 });
  assert.deepEqual(await page.eval(() => [window.SilinxApp.S.active.id, window.SilinxApp.S.active.title, document.documentElement.dataset.task ?? null]),
    ['syssim:uart_avr.sys.json', 'Simulate (uart_avr: fpga)', ISE ? null : 'sim']);
  assert.deepEqual(await problems(page), [WARN]);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .sys-run-for`).textContent, DOC), 'Run 100 ms');
  // the Simulation Properties: the FPGA alone, 30 ms, a new stimulus file
  if (ISE) { await page.treeRow('#hier', 'uart_avr', { exact: true }); await page.treeRow('#procs', 'Simulation Properties…', { exact: true, dbl: true }); }
  else { await page.click('#task-switch .task-btn[data-task="sim"]'); await run(page, 'Simulation Properties…'); }
  await page.waitFor(() => document.querySelector('.dlg .sys-sim-props'), [], { what: 'the dialog' });
  assert.deepEqual(await page.eval(() => [[...document.querySelectorAll('.dlg .sys-sim-props input[type=checkbox]')].map((b) => [b.value, b.checked]), document.querySelector('.dlg .sys-sim-ms').value,
    [...document.querySelector('.dlg .sys-sim-stimulus').options].map((o) => o.textContent)]), [[['uno', true], ['fpga', true]], '100', ['(none)', 'New: uart_avr.stim.json']]);
  // (a time out of range: refused beside its fields)
  await page.eval(() => { document.querySelector('.dlg .sys-sim-ms').value = '0'; [...document.querySelectorAll('.dlg .btn')].find((b) => b.textContent === 'OK').click(); });
  assert.equal(await page.eval(() => document.querySelector('.dlg .sys-sim-props .dlg-err').textContent), 'The run time: from 1 to 10000 ms');
  await page.eval(() => {
    document.querySelector('.dlg input[value=uno]').checked = false;
    document.querySelector('.dlg .sys-sim-ms').value = '30';
    document.querySelector('.dlg .sys-sim-stimulus').value = 'new:uart_avr.stim.json';
    [...document.querySelectorAll('.dlg .btn')].find((b) => b.textContent === 'OK').click();
  });
  await page.waitConsole(/^Simulation Properties: Simulate System runs fpga for 30 ms, its stimulus uart_avr\.stim\.json$/m);
  assert.ok((await lines(page)).includes('Simulation Properties: uart_avr.stim.json made, the System\'s stimulus file (its controls and the text typed, at their times).'));
  const ws = (f) => path.join(env.server.workspace, 'SysSim', f);
  assert.deepEqual(JSON.parse(fs.readFileSync(ws('uart_avr.stim.json'), 'utf8')), { format: 'silinx-stimulus', version: 1, controls: [], type: [] });
  for (let k = 0; k < 50 && !JSON.parse(fs.readFileSync(ws('silinx.json'), 'utf8')).system; k++) await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(JSON.parse(fs.readFileSync(ws('silinx.json'), 'utf8')).system, { simulate: { nodes: ['fpga'], ms: 30, stimulus: 'uart_avr.stim.json' } });
  // a line typed at 2 ms; Simulate System: the FPGA alone for 30 ms, the line echoed
  fs.writeFileSync(ws('uart_avr.stim.json'), JSON.stringify({ format: 'silinx-stimulus', version: 1, controls: [], type: [{ terminal: 'serial', text: 'A\n', at_ns: 2e6 }] }));
  if (ISE) { await page.treeRow('#hier', 'uart_avr', { exact: true }); await page.treeRow('#procs', 'Simulate System', { exact: true, dbl: true }); }
  else { await page.click('#task-switch .task-btn[data-task="sim"]'); await run(page, 'Simulate System'); }
  await page.waitFor((d) => document.querySelector(d)?.closest('.doc')?.querySelector('.doc-status')?.textContent === 't = 30 ms', [DOC], { what: 'its run', timeout: 60000 });
  assert.deepEqual([await page.eval(() => window.SilinxApp.S.active.title), await term(page)], ['Simulate (uart_avr)', 'A\n']);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .sys-run-for`).textContent, DOC), 'Run 30 ms');
  // (one node ticked: its run named as Simulate Node's, as Emulate's, #5581)
  assert.deepEqual(await problems(page), [WARN, WARN]);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  if (ISE) {
    await page.treeRow('#hier', 'fpga', { exact: true });
    await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Simular o Nó'), [], { what: 'Portuguese' });
  } else {
    await page.click('#task-switch .task-btn[data-task="sim"]');
    await page.waitFor((b) => document.querySelector(`${b} .lbl`)?.textContent === 'uart_avr (Sistema)', [TREE], { what: 'Portuguese' });
    assert.deepEqual(await rows(page), ['uart_avr (Sistema)', '  Propriedades da Simulação…', '  Simular o Sistema', '  uno (Arduino Uno)', '    Simular o Nó', '  fpga (Digilent Basys2)', '    Simular o Nó']);
  }
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { build: DEV, timeout: 240000 });
