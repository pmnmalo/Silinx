// UI (#5581): a System project's Emulate. The Silinx interface's Emulate task shows the System's tree (its row:
// Emulation Properties… and Emulate System; a row per node, its emulation's options and runs only (#5597: no source
// file, no Compile Firmware; the Emulate rows' icon not an Arduino's board): the Uno's Emulate Node, the
// FPGA's Emulate Node), Emulate System above it (I/O Pin Planning off: a node's), where it said "No top module is set";
// the FPGA's Emulate Node runs it alone in the System Emulator, the Uno's end of their link a terminal (its warning
// exact, a byte typed echoed); Emulate System runs both again, no warning; Emulation Properties… ticks the FPGA alone
// (silinx.json), which Emulate System then runs; Portuguese. The ISE style: the node's row's Emulate Node.
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
const WARN = 'WARNING: Emulate Node fpga: link serial: uno is not run, its end fpga.uart is the terminal serial here (9600 baud, 8N1)';
// the tree's rows, indented by their depth
const rows = (page) => page.eval((b) => {
  const depth = (li) => { let d = 0; for (let p = li.parentElement.closest('li'); p; p = p.parentElement.closest('li')) d++; return d; };
  return [...document.querySelectorAll(`${b} .task-emu-tree li`)].map((li) => `${'  '.repeat(depth(li))}${li.querySelector(':scope > .row .lbl').textContent}`);
}, BOX);
// a row of the tree double-clicked: the `k`th of that label
const run = (page, label, k = 0) => page.eval((b, l, i) => {
  const r = [...document.querySelectorAll(`${b} .task-emu-tree .row`)].filter((x) => x.querySelector('.lbl').textContent === l)[i];
  r.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
}, BOX, label, k);
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const nodes = (page) => page.eval((e) => [...document.querySelectorAll(`${e} [data-node]`)].map((n) => n.dataset.node), EMU);
const title = (page) => page.eval(() => window.SilinxApp.findDoc('sysemu:uart_avr.sys.json')?.title ?? null);
const EN = ['uart_avr (System)', '  Emulation Properties…', '  Emulate System', '  uno (Arduino Uno)', '    Emulate Node',
  '  fpga (Digilent Basys2)', '    User Constraints', '      I/O Pin Planning', '      Edit Constraints (Text)', '      Check Constraints', '    Emulate Node'];

uiTest('#5581 a System\'s Emulate: its tree, a node emulated alone (its link\'s other end a terminal, said), the System, the Emulation Properties\' nodes; Portuguese; the ISE style\'s Emulate Node', E, async (page) => {
  await makeProject(env, { name: 'SysEmuTree', template: 'uart-avr' });
  await page.setViewport(1680, 1050);
  if (!ISE) {
    await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
    await page.reload();
    await page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  }
  await page.openProject('SysEmuTree');
  if (ISE) {
    // the ISE style: the FPGA node's row in the Design pane, its Emulate Node
    await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'fpga'), [], { what: 'the node' });
    await page.treeRow('#hier', 'fpga', { exact: true });
    await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Emulate Node'), [], { what: 'its Emulate Node' });
    assert.equal(await page.eval(() => [...document.querySelectorAll('#procs .row')].find((r) => r.querySelector('.lbl').textContent.trim() === 'Emulate Node').querySelector('.ico').dataset.ico), 'emulate', 'its icon its own (#5597)');
    await page.treeRow('#procs', 'Emulate Node', { exact: true, dbl: true });
  } else {
    await page.click('#task-switch .task-btn[data-task="emu"]');
    await page.waitFor((b) => document.querySelectorAll(`${b} .task-emu-tree li`).length > 0, [BOX], { what: 'the tree' });
    assert.deepEqual(await rows(page), EN);
    // (the Emulate rows' icon its own, #5597: not the Uno's board's)
    assert.deepEqual(await page.eval((b) => [...document.querySelectorAll(`${b} .task-emu-tree .row`)].map((r) => `${r.querySelector('.lbl').textContent}:${r.querySelector('.ico')?.dataset.ico}`)
      .filter((t) => /^(Emulate|uno)/.test(t)), BOX), ['Emulate System:emulate', 'uno (Arduino Uno):board', 'Emulate Node:emulate', 'Emulate Node:emulate']);
    assert.equal(await page.eval((b) => document.querySelector(`${b} .task-no-top`), BOX), null, 'no "No top module is set"');
    await page.waitFor(() => !document.querySelector('#task-emu-bar [data-act=emulate]').disabled, [], { what: 'Emulate System on' });
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#task-emu-bar .btn')].map((x) => [x.textContent, x.disabled])), [['I/O Pin Planning', true], ['Emulate System', false]]);
    await run(page, 'Emulate Node', 1);   // (the FPGA's)
  }
  // the FPGA alone: its board, the terminal in the Uno's place, said
  await page.waitFor((e) => document.querySelector(`${e} [data-node=fpga] .emu-pcb`) && document.querySelector(`${e} .sys-term-in`), [EMU], { what: 'the FPGA alone', timeout: 60000 });
  assert.deepEqual([await nodes(page), await title(page)], [['fpga'], 'Emulate (uart_avr: fpga)']);
  assert.deepEqual((await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l)), [WARN]);
  assert.equal(await page.eval((e) => document.querySelector(`${e} .sys-term-cap`)?.textContent, EMU), 'serial · 9600 8N1');
  await page.click(`${EMU} .sysemu-run`);
  await page.click(`${EMU} .sys-term-in`);
  await page.type('A');
  await page.key('Enter');
  await page.waitFor((e) => document.querySelector(`${e} .sys-term-out`)?.textContent === 'A\n', [EMU], { what: 'the echo', timeout: 60000 });
  if (ISE) {
    await page.treeRow('#hier', 'uart_avr', { exact: true });
    await page.treeRow('#procs', 'Emulate System', { exact: true, dbl: true });
  } else {
    await page.click('#task-switch .task-btn[data-task="emu"]');
    await page.click('#task-emu-bar [data-act=emulate]');
  }
  // the System: both boards, in the same document, nothing more said
  await page.waitFor((e) => document.querySelector(`${e} [data-node=uno]`) && document.querySelector(`${e} [data-node=fpga]`), [EMU], { what: 'the System', timeout: 60000 });
  assert.deepEqual([await nodes(page), await title(page)], [['uno', 'fpga'], 'Emulate (uart_avr)']);
  assert.deepEqual((await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l)), [WARN]);
  // the Emulation Properties: the FPGA alone, in silinx.json
  if (ISE) await page.treeRow('#procs', 'Emulation Properties…', { exact: true, dbl: true });
  else { await page.click('#task-switch .task-btn[data-task="emu"]'); await run(page, 'Emulation Properties…'); }
  await page.waitFor(() => document.querySelector('.dlg .sys-emu-props'), [], { what: 'the dialog' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg .sys-emu-props input')].map((b) => [b.value, b.checked])), [['uno', true], ['fpga', true]]);
  // (none ticked: refused beside its fields)
  await page.eval(() => { for (const b of document.querySelectorAll('.dlg .sys-emu-props input')) b.checked = false; [...document.querySelectorAll('.dlg .btn')].find((b) => b.textContent === 'OK').click(); });
  assert.equal(await page.eval(() => { const e = document.querySelector('.dlg .sys-emu-props .dlg-err'); return e.hidden ? null : e.textContent; }), 'Tick at least one node');
  await page.eval(() => { document.querySelector('.dlg .sys-emu-props input[value=fpga]').checked = true; [...document.querySelectorAll('.dlg .btn')].find((b) => b.textContent === 'OK').click(); });
  await page.waitConsole(/^Emulation Properties: Emulate System runs fpga$/m);
  const json = () => JSON.parse(fs.readFileSync(path.join(env.server.workspace, 'SysEmuTree/silinx.json'), 'utf8'));
  for (let k = 0; k < 50 && !json().system; k++) await new Promise((r) => setTimeout(r, 100));   // (saved by the server)
  assert.deepEqual(json().system, { emulate: { nodes: ['fpga'] } });
  if (ISE) await page.treeRow('#procs', 'Emulate System', { exact: true, dbl: true });
  else await page.click('#task-emu-bar [data-act=emulate]');
  await page.waitFor((e) => !document.querySelector(`${e} [data-node=uno]`) && document.querySelector(`${e} [data-node=fpga]`), [EMU], { what: 'the FPGA alone again', timeout: 60000 });
  assert.deepEqual((await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l)), [WARN, WARN]);
  // Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  if (ISE) {
    await page.treeRow('#hier', 'fpga', { exact: true });
    await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Emular o Nó'), [], { what: 'Portuguese' });
  } else {
    await page.click('#task-switch .task-btn[data-task="emu"]');
    await page.waitFor((b) => document.querySelector(`${b} .task-emu-tree .lbl`)?.textContent === 'uart_avr (Sistema)', [BOX], { what: 'Portuguese' });
    assert.deepEqual(await rows(page), ['uart_avr (Sistema)', '  Propriedades da Emulação…', '  Emular o Sistema', '  uno (Arduino Uno)', '    Emular o Nó',
      '  fpga (Digilent Basys2)', '    Restrições do Utilizador', '      Planeamento de Pinos de E/S', '      Editar Restrições (Texto)', '      Verificar Restrições', '    Emular o Nó']);
    assert.equal(await page.eval(() => document.querySelector('#task-emu-bar [data-act=emulate]').textContent), 'Emular o Sistema');
  }
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { build: DEV, timeout: 240000 });
