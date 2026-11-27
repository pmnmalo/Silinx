// UI (#5642): the constraints in the process trees are I/O Pin Planning alone, no User Constraints folder, no Edit
// Constraints (Text) nor Check Constraints: its views Table | Board | Text (Table first), the Text view the constraints
// file in the text editor (its edits read into the table, the table's written into it, saved); its Check, just before
// Clear All, Check Constraints, its lines the console's as the process's were. Opened from Emulate (its bar, its tree,
// the Tasks interface), it stays in Emulate; from Implement, in Implement. Both interfaces; in Portuguese; the warnings
// asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'module top(input sw, output led);\n  assign led = sw;\nendmodule\n';
const UCF = 'NET "led" LOC = "M5" ;\n';
const WARN = 'WARNING:ConstraintSystem - "constraints/top.ucf" Line 1: 1 port bit(s) of \'top\' have no LOC: sw';
const D = '.doc:not([hidden])';

// the Console's lines from the last `header` on (the blank ones left out)
const linesFrom = (page, header) => page.eval((hd) => {
  const ls = [...document.querySelectorAll('#console-log .ln')];
  let i = ls.length - 1;
  while (i >= 0 && !ls[i].textContent.includes(hd)) i--;
  return ls.slice(i).filter((l) => l.textContent.trim()).map((l) => l.textContent.trim());
}, header);
// I/O Pin Planning's toolbar: its views (the one pressed), its tools shown; the views shown
const planner = (page) => page.eval((d) => {
  const shown = (e) => !!e && e.getClientRects().length > 0;
  const bar = document.querySelector(`${d} .pp-bar`);
  return {
    views: [...bar.querySelectorAll('.pp-view')].map((b) => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? '*' : ''}`),
    tools: [...bar.querySelectorAll('.asm-group button:not(.pp-view)')].filter(shown).map((b) => b.textContent.trim()).filter((t) => !t.startsWith('☰')),
    shown: ['.pp-table', '.pp-board', '.pp-text'].filter((s) => shown(document.querySelector(`${d} ${s}`))),
  };
}, D);
const tableLoc = (page, net) => page.eval((d, n) => [...document.querySelectorAll(`${d} .pp-table tr`)].find((r) => r.cells[0]?.textContent === n)?.cells[3].querySelector('input').value, D, net);
const text = (page) => page.eval((d) => window.Silinx.active.pinText()?.getValue() ?? document.querySelector(`${d} .pp-text .cm-content`)?.textContent, D);
const noWarnings = (page) => assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
async function openPins(page) {
  await page.treeRow('#procs', 'I/O Pin Planning', { dbl: true, exact: true });
  await page.waitFor((d) => window.Silinx.active?.id === 'pins' && document.querySelectorAll(`${d} .pp-table tr`).length > 1, [D], { what: 'I/O Pin Planning' });
}

uiTest('#5642 Implement: I/O Pin Planning alone in the tree; its Table, Board and Text views; Check before Clear All, its console lines; the text and the table each other\'s; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'PinText', top: 'top', board: 'basys2', constraints: 'constraints/top.ucf', files: { 'src/top.v': TOP, 'constraints/top.ucf': UCF } });
  await page.openProject('PinText');
  await page.showMessages();
  await page.setView('impl');
  await page.treeRow('#hier', 'top');
  await page.waitFor(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent === 'I/O Pin Planning'), [], { what: 'Implement\'s processes' });
  // the tree: I/O Pin Planning at the top level, no User Constraints, Edit Constraints (Text) nor Check Constraints
  const tree = await page.eval(() => {
    const ls = [...document.querySelectorAll('#procs .lbl')].map((e) => e.textContent);
    const li = [...document.querySelectorAll('#procs li')].find((x) => x.querySelector(':scope > .row .lbl')?.textContent === 'I/O Pin Planning');
    return { gone: ls.filter((l) => /^(User Constraints|Edit Constraints \(Text\)|Check Constraints)$/.test(l)), top: !li.parentElement.closest('li') };
  });
  assert.deepEqual(tree, { gone: [], top: true });
  await openPins(page);
  // Table first; Check just before Clear All
  assert.deepEqual(await planner(page), { views: ['Table*', 'Board', 'Text'], tools: ['Auto-assign from Board', 'Check', 'Clear All'], shown: ['.pp-table'] });
  // Check: Check Constraints, its lines the console's
  await page.click(`${D} .pp-check`);
  await page.waitConsole(/Process "Check Constraints" completed successfully with 1 warning\(s\)/);
  assert.deepEqual(await linesFrom(page, 'Started : "Check Constraints"'),
    ['Started : "Check Constraints" of constraints/top.ucf.', WARN, 'Process "Check Constraints" completed successfully with 1 warning(s)']);
  // Text: the UCF as it is in the file, in the text editor, its status line the one shown
  await page.click(`${D} .pp-view[data-view=text]`);
  await page.waitFor((d) => document.querySelector(`${d} .pp-text .cm-content`), [D], { what: 'the Text view' });
  assert.deepEqual(await planner(page), { views: ['Table', 'Board', 'Text*'], tools: ['Auto-assign from Board', 'Check', 'Clear All'], shown: ['.pp-text'] });
  assert.equal(await text(page), UCF);
  // (one status line, the editor's: the line and the column)
  assert.equal(await page.eval((d) => [...document.querySelectorAll(`${d} .doc-status`)].filter((e) => e.getClientRects().length).length, D), 1);
  assert.ok(await page.eval((d) => document.querySelector(`${d} .pp-status`)?.closest('.doc-status').hidden, D), 'the table\'s hidden');
  // a line typed: the table has it, the file too once saved; Check: no warning now
  await page.eval(() => { const ed = window.Silinx.active.pinText(); ed.focus(); ed.setCursor({ line: 1, ch: 0 }); });
  await page.type('NET "sw" LOC = "P11" ;\n');
  assert.ok(await page.eval(() => window.Silinx.active.pinPlanner.canUndo()), 'the Text view\'s Undo: its editor\'s');
  await page.click(`${D} .pp-view[data-view=table]`);
  assert.deepEqual([await tableLoc(page, 'sw'), await tableLoc(page, 'led')], ['P11', 'M5']);
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  assert.equal(await page.eval(async () => (await import('/js/api.js')).api.readFile('PinText', 'constraints/top.ucf')), `${UCF}NET "sw" LOC = "P11" ;\n`, 'the text as typed');
  await page.click(`${D} .pp-check`);
  await page.waitFor(() => /Started : "Check Constraints"[^]*Started : "Check Constraints"[^]*Process "Check Constraints" completed successfully\s*$/.test(window.__console()), [], { what: 'Check again' });
  assert.deepEqual(await linesFrom(page, 'Started : "Check Constraints"'), ['Started : "Check Constraints" of constraints/top.ucf.', 'Process "Check Constraints" completed successfully']);
  // a pin changed in the table: the text written from the table
  await page.fill(`${D} .pp-table tr:nth-child(3) td:nth-child(4) input`, 'G12');
  await page.click(`${D} .pp-view[data-view=text]`);
  await page.waitFor(() => /NET "led"\s+LOC = "G12"/.test(window.Silinx.active.pinText().getValue()), [], { what: 'the table\'s text' });
  assert.match(await text(page), /NET "sw"\s+LOC = "P11"/);
  // Board: its view, the text's and the table's hidden
  await page.click(`${D} .pp-view[data-view=board]`);
  await page.waitFor((d) => document.querySelector(`${d} .pp-board svg`), [D], { what: 'the board drawn' });
  assert.deepEqual((await planner(page)).shown, ['.pp-board']);
  // in Portuguese: the views, the tools, the tree
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((d) => document.querySelector(`${d} .pp-view[data-view=text]`)?.textContent === 'Texto', [D], { what: 'Portuguese' });
  assert.deepEqual(await planner(page), { views: ['Tabela', 'Placa*', 'Texto'], tools: ['Atribuir Automaticamente pela Placa', 'Verificar', 'Limpar Tudo'], shown: ['.pp-board'] });
  assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} .pp-view[data-view=text], ${d} .pp-check`)].map((b) => b.title), D),
    ['O ficheiro de restrições em texto', 'Verificar o ficheiro de restrições: a sintaxe, as portas do módulo de topo, os pinos da placa (Verificar Restrições)']);
  assert.ok(await page.eval(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent === 'Planeamento de Pinos de E/S')));
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  noWarnings(page);
});

async function tasksInterface(page) {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
}
const where = (page) => page.eval(() => ({ task: document.documentElement.dataset.task, active: window.Silinx.active?.id,
  tab: [...document.querySelectorAll('#doc-tabs > .tab')].some((t) => t.getClientRects().length && /I\/O Pin Planning/.test(t.textContent)) }));
const emuRow = (page, label) => page.eval((l) => {
  const r = [...document.querySelectorAll('#task-emu-panel .task-emu-tree .row')].find((x) => x.querySelector('.lbl').textContent === l);
  r.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
}, label);

uiTest('#5642 Tasks ▸ Emulate: I/O Pin Planning (its bar\'s, its tree\'s) opens in Emulate, not in Implement; from Implement, in Implement; its Text view there', E, async (page) => {
  await makeProject(env, { name: 'PinEmu', top: 'top', board: 'basys2', constraints: 'constraints/top.ucf', files: { 'src/top.v': TOP, 'constraints/top.ucf': UCF } });
  await page.setViewport(1680, 1050);
  await tasksInterface(page);
  await page.openProject('PinEmu');
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.waitFor(() => !document.querySelector('#task-emu-bar [data-act=pins]')?.disabled && document.querySelectorAll('#task-emu-panel .task-emu-tree li').length, [], { what: 'Emulate\'s processes' });
  // its tree: I/O Pin Planning alone before Emulate, under the top module (#5789)
  assert.deepEqual(await page.eval(() => [...[...document.querySelectorAll('#task-emu-panel .task-emu-tree li')].find((li) => li.querySelector(':scope > .row .lbl').textContent === 'top')
    .querySelectorAll(':scope > ul > li > .row .lbl')].map((e) => e.textContent)), ['I/O Pin Planning', 'Emulate']);
  // its bar's button: in Emulate
  await page.click('#task-emu-bar [data-act=pins]');
  await page.waitFor((d) => window.Silinx.active?.id === 'pins' && document.querySelectorAll(`${d} .pp-table tr`).length > 1, [D], { what: 'I/O Pin Planning' });
  assert.deepEqual(await where(page), { task: 'emu', active: 'pins', tab: true });
  // its Text view in Emulate
  await page.click(`${D} .pp-view[data-view=text]`);
  await page.waitFor(() => window.Silinx.active.pinText()?.getValue() === 'NET "led" LOC = "M5" ;\n', [], { what: 'the Text view' });
  assert.equal(await page.eval(() => document.documentElement.dataset.task), 'emu');
  // Implement: not its tab there; its tree's I/O Pin Planning, Implement's
  await page.click('#task-switch .task-btn[data-task="impl"]');
  assert.equal((await where(page)).tab, false, 'not in Implement');
  await page.waitFor(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent === 'I/O Pin Planning' && e.getClientRects().length), [], { what: 'Implement\'s processes' });
  await page.treeRow('#procs', 'I/O Pin Planning', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'pins' && document.documentElement.dataset.task === 'impl', [], { what: 'in Implement' });
  assert.deepEqual(await where(page), { task: 'impl', active: 'pins', tab: true });
  // Emulate's tree's: in Emulate again
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await emuRow(page, 'I/O Pin Planning');
  await page.waitFor(() => window.Silinx.active?.id === 'pins' && document.documentElement.dataset.task === 'emu' && window.Silinx.active.task === 'emu', [], { what: 'in Emulate' });
  assert.deepEqual(await where(page), { task: 'emu', active: 'pins', tab: true });
  noWarnings(page);
});
