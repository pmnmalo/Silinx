// UI (#4591): the files the implementation and the Board Emulator read beside the HDL (core/flow-files.js: the project's
// constraints, then the memory images), where the flow is:
// - the ISE style interface's Implementation view: under the top module's row, after its instances, as ISE's; the
//   constraints' row selected shows their processes, a double-click opens the file, its menu is the file's; none in the
//   Simulation view; on a board of each family's format (UCF, PCF, LPF, CST, XDC); in Portuguese;
// - the Silinx interface's Implement and Emulate: a Files tab after theirs (#4609), as Simulate's, its page the design's
//   sources (a drawing in place of its HDL), the constraints and the memory images, opened from there, the file's menu;
//   the Design page still without them (#1250); in Portuguese; none in the ISE style interface.
// No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { resolveBoard } from '../../server/devices.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// every row of a tree, indented by its depth: "icon label [badge*] (meta)"
const rows = (page, sel) => page.eval((s) => [...document.querySelectorAll(`${s} .row`)].map((r) => {
  let d = 0;
  for (let li = r.parentElement.parentElement.closest('li'); li && document.querySelector(s).contains(li); li = li.parentElement.closest('li')) d++;
  const b = [...r.querySelectorAll('.badge')].map((x) => `[${x.textContent}${x.classList.contains('base') ? '*' : ''}]`);
  return `${'  '.repeat(d)}${r.querySelector('.ico')?.dataset.ico} ${r.querySelector('.lbl').textContent}${b.length ? ` ${b.join(' ')}` : ''}${r.querySelector('.meta') ? ` ${r.querySelector('.meta').textContent}` : ''}`;
}), sel);
const rowOf = (page, sel, label, ev) => page.eval((s, l, e) => {
  const r = [...document.querySelectorAll(`${s} .row`)].find((x) => x.querySelector('.lbl').textContent === l);
  const k = r.getBoundingClientRect();
  r.dispatchEvent(new MouseEvent(e, { bubbles: true, clientX: k.left + 10, clientY: k.top + 5 }));
}, sel, label, ev);
const menuLabels = (page) => page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return m.length ? m : null; }, [], { what: 'the context menu' });
// (the file's menu, the Files page's: its Open in … item the machine's editor's, left out)
const FILE_MENU = ['Open', 'Rename…', 'Check Syntax', 'Remove from Project', 'Delete File…', 'Source Properties…'];
const fileMenu = async (page, sel, label) => {
  await rowOf(page, sel, label, 'contextmenu');
  const m = (await menuLabels(page)).filter((x) => !/^Open in /.test(x));
  await page.closeMenus();
  return m;
};
const procs = (page) => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map((x) => x.textContent));
const active = (page) => page.eval(() => window.SilinxApp.S.active?.title || null);
const language = (page, l) => page.eval(async (x) => (await import('/js/i18n.js')).setLanguage(x), l);
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
}

const BLINKY = [
  'project FF_blinky',
  '  chip xc3s250e-4-cp132',
  '    moduleTop top [VHDL*] (top.vhd)',
  '      vhdl u_count - bcd_counter [VHDL*] (bcd_counter.vhd)',
  '      verilog u_display - sevenseg [Verilog*] [VHDL] (sevenseg.v)',
  '      vhdl u_knight - knight [VHDL*] (knight.vhd)',
  '      verilog u_pre - prescaler [Verilog*] [VHDL] (counter.v)',
  '      asm u_speed - speed_ctrl [ASM*] [VHDL] (speed_ctrl.asm.json)',
  '      ucf top.ucf',
  '      file rom.mem',
];

uiTest('#4591 ISE style ▸ Implementation view: the constraints and the memory images under the top module, their processes, opened, the file\'s menu; none in the Simulation view; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'FF_blinky', template: 'blinky', files: { 'src/rom.mem': '00\n01\n' } });
  await page.openProject('FF_blinky');
  await page.waitFor(() => !!document.querySelector('#hier .row[data-key="ucf"]'), [], { what: 'the constraints\' row' });
  assert.deepEqual(await rows(page, '#hier'), BLINKY);
  // the constraints selected: their processes, as ISE's
  await rowOf(page, '#hier', 'top.ucf', 'click');
  await page.waitFor(() => /top\.ucf/.test(document.getElementById('proc-caption').textContent), [], { what: 'the constraints\' processes' });
  assert.deepEqual(await procs(page), ['Design Summary/Reports', 'Edit Constraints (Text)', 'Check Constraints', 'I/O Pin Planning']);
  // a double-click opens it; its menu is the file's
  await rowOf(page, '#hier', 'top.ucf', 'dblclick');
  await page.waitFor(() => window.SilinxApp.S.active?.title === 'top.ucf', [], { what: 'the UCF opened' });
  assert.deepEqual(await fileMenu(page, '#hier', 'top.ucf'), FILE_MENU);
  // the memory image: opened, its menu the file's (no Check Syntax)
  await rowOf(page, '#hier', 'rom.mem', 'dblclick');
  await page.waitFor(() => window.SilinxApp.S.active?.title === 'rom.mem', [], { what: 'the memory image opened' });
  assert.deepEqual(await fileMenu(page, '#hier', 'rom.mem'), FILE_MENU.filter((x) => x !== 'Check Syntax'));
  // the Simulation view: none (as ISE's)
  await page.click('input[name=view][value=sim]');
  await page.waitFor(() => window.Silinx.view === 'sim');
  assert.deepEqual((await rows(page, '#hier')).filter((r) => /ucf|mem/.test(r)), []);
  await page.click('input[name=view][value=impl]');
  await page.waitFor(() => window.Silinx.view === 'impl');
  // in Portuguese: the same rows, the processes translated
  await language(page, 'pt');
  await rowOf(page, '#hier', 'top.ucf', 'click');
  await page.waitFor(() => document.querySelector('#procs .row .lbl')?.textContent === 'Resumo do Projeto/Relatórios', [], { what: 'Portuguese' });
  assert.deepEqual(await rows(page, '#hier'), BLINKY);
  assert.deepEqual(await procs(page), ['Resumo do Projeto/Relatórios', 'Editar Restrições (Texto)', 'Verificar Restrições', 'Planeamento de Pinos de E/S']);
  await language(page, 'en');
  await noWarnings(page);
}, { ui: 'ise' });

uiTest('#4591 ISE style ▸ Implementation view: the constraints in the board\'s format under the top module, on the iCE40, ECP5, Gowin and 7-series boards', E, async (page) => {
  for (const [board, ext] of [['icebreaker', 'pcf'], ['ulx3s', 'lpf'], ['tangnano9k', 'cst'], ['basys3', 'xdc']]) {
    const name = `FF_${board}`;
    await makeProject(env, { name, template: 'blinky', board, device: resolveBoard(board).device });
    await page.openProject(name);
    await page.waitFor(() => !!document.querySelector('#hier .row[data-key="ucf"]'), [], { what: `${board}'s constraints' row` });
    const r = await rows(page, '#hier');
    // under the top, after its instances: the last row, the only file's
    assert.equal(r.at(-1), `      ucf top.${ext}`, board);
    assert.equal(r.filter((x) => /^ {6}(ucf|file) /.test(x)).length, 1, board);
    assert.match(r[2], /^ {4}moduleTop top /, board);
  }
  await noWarnings(page);
}, { ui: 'ise' });

// the Files tab's page: its rows "icon name (path)"
const filesRows = (page, sel) => page.eval((s) => [...document.querySelectorAll(`${s} .row`)].filter((r) => r.getClientRects().length)
  .map((r) => `${r.querySelector('.ico')?.dataset.ico} ${r.querySelector('.lbl').textContent} ${r.querySelector('.meta').textContent}`), sel);
const shownTabs = (page) => page.eval(() => [...document.querySelectorAll('#left-tabs .tab')].filter((t) => t.getClientRects().length)
  .map((t) => `${t.querySelector('.tab-lbl').textContent}${t.querySelector('.tab-lbl').getClientRects().length && getComputedStyle(t.querySelector('.tab-lbl')).position !== 'absolute' ? '' : ' (icon)'}`));
const FILES = [
  'vhdl bcd_counter.vhd (src/bcd_counter.vhd)', 'verilog counter.v (src/counter.v)', 'vhdl knight.vhd (src/knight.vhd)',
  'verilog sevenseg.v (src/sevenseg.v)', 'asm speed_ctrl.asm.json (src/speed_ctrl.asm.json)', 'vhdl top.vhd (src/top.vhd)',
  'ucf top.ucf (constraints/top.ucf)', 'file rom.mem (src/rom.mem)',
];

uiTest('#4609 Silinx ▸ Implement and Emulate: a Files tab after theirs, the design\'s sources, the constraints and the memory images, opened from there, the file\'s menu; the processes back under the task\'s tab; the Design page without the constraints; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'FF_tasks', template: 'blinky', files: { 'src/rom.mem': '00\n01\n' } });
  await page.setViewport(1680, 1050);
  await page.openProject('FF_tasks');
  // the Design page: the design only (#1250); no Files tab of the flow in Edit
  assert.deepEqual((await rows(page, '#hier')).filter((r) => /ucf/.test(r)), []);
  assert.equal(await page.eval(() => document.getElementById('task-flow-files-tab').getClientRects().length), 0);
  for (const [task, tab, list, procs] of [['impl', 'Implementation', '#task-impl-files', '#procs'], ['emu', 'Emulate', '#task-emu-files', '#task-emu-panel .task-emu-tree']]) {
    await page.click(`#task-switch .task-btn[data-task="${task}"]`);
    // the task's tab in front, its processes; the Files tab after it, its icon only
    await page.click(`#left-tabs #${task === 'impl' ? 'task-procs-tab' : 'task-emu-tab'}`);
    assert.deepEqual(await shownTabs(page), [tab, 'Files (icon)'], task);
    assert.deepEqual(await filesRows(page, list), [], task);
    assert.ok(await page.eval((s) => document.querySelector(s).getClientRects().length > 0, procs), `${task}: its processes`);
    // the Files tab: its page in front, the processes hidden
    await page.click('#task-flow-files-tab');
    assert.deepEqual(await shownTabs(page), [`${tab} (icon)`, 'Files'], task);
    assert.deepEqual(await filesRows(page, list), FILES, task);
    assert.equal(await page.eval((s) => document.querySelector(s).getClientRects().length, procs), 0, `${task}: no processes`);
    // a double-click opens a file (the UCF in Implement, its task); the drawing, its editor; the menu is the file's
    await rowOf(page, list, 'top.ucf', 'dblclick');
    await page.waitFor(() => window.SilinxApp.S.active?.title === 'top.ucf', [], { what: `${task}: the UCF opened` });
    await page.click(`#task-switch .task-btn[data-task="${task}"]`);
    assert.deepEqual(await fileMenu(page, list, 'top.ucf'), FILE_MENU, task);
    assert.deepEqual(await fileMenu(page, list, 'rom.mem'), FILE_MENU.filter((x) => x !== 'Check Syntax'), task);
    await rowOf(page, list, 'speed_ctrl.asm.json', 'dblclick');
    await page.waitFor(() => /speed_ctrl/.test(window.SilinxApp.S.active?.title || ''), [], { what: `${task}: the ASM chart opened` });
    await page.click(`#task-switch .task-btn[data-task="${task}"]`);
  }
  // the page in front the same in both tasks: back to the processes from Emulate's tab, Implement's too
  await page.click('#left-tabs #task-emu-tab');
  await page.click('#task-switch .task-btn[data-task="impl"]');
  assert.deepEqual(await shownTabs(page), ['Implementation', 'Files (icon)']);
  // in Portuguese
  await page.click('#task-flow-files-tab');
  await language(page, 'pt');
  await page.waitFor(() => document.querySelector('#task-flow-files-tab .tab-lbl')?.textContent === 'Ficheiros', [], { what: 'Portuguese' });
  assert.deepEqual(await shownTabs(page), ['Implementação (icon)', 'Ficheiros']);
  assert.deepEqual(await filesRows(page, '#task-impl-files'), FILES);
  await language(page, 'en');
  await noWarnings(page);
}, { ui: 'silinx' });

uiTest('#4609 ISE style: no Files tab of Implement\'s or Emulate\'s (its Implementation view has the constraints under the top)', E, async (page) => {
  await makeProject(env, { name: 'FF_ise', template: 'blinky' });
  await page.openProject('FF_ise');
  assert.equal(await page.eval(() => document.getElementById('task-flow-files-tab')), null);
  assert.equal(await page.eval(() => document.querySelectorAll('.task-flow-files').length), 0);
  // the interface changed to Silinx and back: the tab made, then removed
  await page.eval(async () => (await import('/js/silinx.js')).setInterface('silinx'));
  await page.waitFor(() => document.documentElement.dataset.layout === 'tasks' && !!document.getElementById('task-flow-files-tab'), [], { what: 'the Silinx interface' });
  await page.eval(async () => (await import('/js/silinx.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => document.getElementById('task-flow-files-tab')), null);
  assert.equal(await page.eval(() => [document.querySelectorAll('.task-flow-files').length, document.getElementById('left').dataset.flowPage ?? null].join()), '0,');
  await noWarnings(page);
}, { ui: 'ise' });
