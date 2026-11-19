// UI (#4591): the files the implementation and the Board Emulator read beside the HDL (core/flow-files.js: the project's
// constraints, then the memory images), where the flow is:
// - the ISE style interface's Implementation view: under the top module's row, after its instances, as ISE's; the
//   constraints' row selected shows their processes, a double-click opens the file, its menu is the file's; none in the
//   Simulation view; on a board of each family's format (UCF, PCF, LPF, CST, XDC); in Portuguese;
// - the Silinx interface's Implement and Emulate side panels: the top module's row (its badges) and the same files under
//   it, above the buttons and the processes; the Design page still without them (#1250); in Portuguese.
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

uiTest('#4591 Silinx ▸ Implement and Emulate: the top module and its constraints above the processes, opened from there, the file\'s menu; the Design page without them; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'FF_tasks', template: 'blinky' });
  await page.setViewport(1680, 1050);
  await page.openProject('FF_tasks');
  // the Design page: the design only (#1250)
  assert.deepEqual((await rows(page, '#hier')).filter((r) => /ucf/.test(r)), []);
  const WANT = ['moduleTop top [VHDL*] (top.vhd)', '  ucf top.ucf'];
  for (const [task, box, bar] of [['impl', '#task-impl-files', '#task-impl-bar'], ['emu', '#task-emu-files', '#task-emu-bar']]) {
    await page.click(`#task-switch .task-btn[data-task="${task}"]`);
    await page.waitFor((b) => document.querySelector(b)?.getClientRects().length > 0, [box], { what: `${task}'s files` });
    assert.deepEqual(await rows(page, box), WANT, task);
    // above the task's buttons and its processes, in its side panel
    assert.ok(await page.eval((b, x) => document.querySelector(b).getBoundingClientRect().bottom <= document.querySelector(x).getBoundingClientRect().top + 1 && !!document.querySelector(b).closest('#left'), box, bar), task);
    // the constraints: opened by a double-click (in Implement, as Edit Constraints (Text)), the file's menu
    await rowOf(page, box, 'top.ucf', 'dblclick');
    await page.waitFor(() => window.SilinxApp.S.active?.title === 'top.ucf', [], { what: `${task}: the UCF opened` });
    await page.click(`#task-switch .task-btn[data-task="${task}"]`);
    assert.deepEqual(await fileMenu(page, box, 'top.ucf'), FILE_MENU, task);
    // the top: its badge opens its source
    await page.eval((b) => document.querySelector(`${b} .badge`).click(), box);
    await page.waitFor(() => window.SilinxApp.S.active?.title === 'top.vhd', [], { what: `${task}: the top opened` });
    assert.equal(await active(page), 'top.vhd');
  }
  // in Portuguese: the tree's name translated, its rows the files'
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await language(page, 'pt');
  await page.waitFor(() => document.querySelector('#task-emu-files .tree')?.getAttribute('aria-label') === 'Módulo de topo e os seus ficheiros', [], { what: 'Portuguese' });
  assert.deepEqual(await rows(page, '#task-emu-files'), WANT);
  await language(page, 'en');
  await noWarnings(page);
}, { ui: 'silinx' });
