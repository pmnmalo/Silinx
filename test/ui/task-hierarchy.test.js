// UI (#5789): the Tasks interface's Implement, Emulate and Simulate side panels, one layout (web/js/task-hierarchy.js):
// the project, its device (none in a Circuit project), then the task's own rows: Implement's and Emulate's, the top
// module (no source's badge) and its processes; Simulate's, each test bench with its objects under it (its unit under
// test, their submodules), or with none the module and model prompts under the device. The hierarchy's names not
// translated, no process's menu on them; in Portuguese. The ISE style interface's Processes pane stays ISE's (its Design
// pane shows the hierarchy above it). No warnings. (Emulate's own: test/ui/tasks-emu-procs.test.js.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'module top(input clk, input [3:0] sw, output [3:0] led, output x);\n  assign led = sw;\n  inv u1(.a(clk), .y(x));\nendmodule\n';
const INV = 'module inv(input a, output y);\n  assign y = ~a;\nendmodule\n';
const TB = 'module tb_top;\n  reg clk = 0; reg [3:0] sw = 0; wire [3:0] led; wire x;\n  top uut(.clk(clk), .sw(sw), .led(led), .x(x));\n  always #5 clk = ~clk;\n  initial #100 $finish;\nendmodule\n';
const DEV = 'xc3s250e-4-cp132';
const FSM = JSON.stringify({ format: 'silinx-fsm', version: 1, name: 'm', inputs: [{ name: 'a', width: 1 }], outputs: [], states: [{ id: 's0', name: 'S0', x: 100, y: 100 }], transitions: [], reset: 's0', clock: 'clk' });

async function tasksInterface(page) {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await page.setViewport(1680, 1050);
}
// a side panel's rows, indented by their depth (shown ones)
const rows = (page, sel) => page.eval((s) => {
  const box = document.querySelector(s);
  const depth = (li) => { let d = 0; for (let p = li.parentElement.closest('li'); p && box.contains(p); p = p.parentElement.closest('li')) d++; return d; };
  return [...box.querySelectorAll('li')].filter((li) => li.getClientRects().length).map((li) => `${'  '.repeat(depth(li))}${li.querySelector(':scope > .row .lbl, :scope > .row select option:checked')?.textContent ?? '?'}`);
}, sel);
const badges = (page, sel) => page.eval((s) => document.querySelectorAll(`${s} .badges, ${s} .badge, ${s} .meta`).length, sel);
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()).filter((l) => /^(WARNING|ERROR)/.test(l))), []);
}
const task = async (page, t) => { await page.click(`#task-switch .task-btn[data-task="${t}"]`); await page.waitFor((x) => document.documentElement.dataset.task === x, [t], { what: t }); };

uiTest('#5789 Implement and Simulate: the project, its device, the top (no badge) and its processes; each test bench and its objects; Portuguese; ISE style\'s Processes as ISE\'s', E, async (page) => {
  await makeProject(env, { name: 'Hier', board: 'basys2', top: 'top', files: { 'src/top.v': TOP, 'src/inv.v': INV, 'sim/tb_top.v': TB }, roles: { 'sim/tb_top.v': 'sim' } });
  await tasksInterface(page);
  await page.openProject('Hier');
  // Implement: its processes under the top, under the device, under the project
  await task(page, 'impl');
  await page.waitFor(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent === 'Design Summary/Reports'), [], { what: 'Implement\'s processes' });
  const impl = await rows(page, '#procs');
  assert.deepEqual(impl.slice(0, 5), ['Hier', `  ${DEV}`, '    top', '      Design Summary/Reports', '      I/O Pin Planning']);
  for (const p of ['Implement Design', 'Generate Programming File']) assert.ok(impl.includes(`      ${p}`), `${p}: ${impl}`);
  assert.equal(await badges(page, '#procs'), 0, 'no source\'s badge');
  // (the hierarchy's rows: no process's menu)
  await page.eval(() => document.querySelector('#procs .row.proc-hier').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 120 })));
  assert.equal(await page.eval(() => !!document.querySelector('.menu-popup')?.getClientRects().length), false, 'no menu');
  // Simulate: the test bench under the device, its unit under test and that one's submodule under it
  await task(page, 'sim');
  await page.waitFor(() => document.querySelector('#task-sim-panel .task-sim-bench')?.getClientRects().length > 0, [], { what: 'Simulate\'s test benches' });
  assert.deepEqual(await rows(page, '#task-sim-panel .task-sim-benches'), ['Hier', `  ${DEV}`, '    tb_top', '      uut - top', '        u1 - inv']);
  assert.equal(await badges(page, '#task-sim-panel'), 0, 'no source\'s badge');
  // its twisty folds its objects; a click on its row simulates it, as before
  await page.eval(() => document.querySelector('#task-sim-panel .task-sim-bench > .row .twisty').click());
  assert.deepEqual(await rows(page, '#task-sim-panel .task-sim-benches'), ['Hier', `  ${DEV}`, '    tb_top']);
  await page.eval(() => document.querySelector('#task-sim-panel .task-sim-bench > .row .twisty').click());
  // in Portuguese: the names as they are, the processes translated
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#task-sim-panel .tab-lbl')?.textContent === 'Simulação', [], { what: 'Portuguese' });
  assert.deepEqual(await rows(page, '#task-sim-panel .task-sim-benches'), ['Hier', `  ${DEV}`, '    tb_top', '      uut - top', '        u1 - inv']);
  await task(page, 'impl');
  assert.deepEqual((await rows(page, '#procs')).slice(0, 5), ['Hier', `  ${DEV}`, '    top', '      Resumo do Projeto/Relatórios', '      Planeamento de Pinos de E/S']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the ISE style interface: its Processes pane as ISE's, the top's processes at its top level (the Design pane above it)
  await page.eval(async () => (await import('/js/silinx.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  await page.setView('impl');
  await page.treeRow('#hier', 'top');
  await page.waitFor(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent === 'Design Summary/Reports'), [], { what: 'the Processes pane' });
  assert.equal(await page.eval(() => document.querySelectorAll('#procs .proc-hier').length), 0, 'no hierarchy rows');
  assert.equal((await rows(page, '#procs'))[0], 'Design Summary/Reports');
  await noWarnings(page);
});

uiTest('#5789 Simulate with no test bench: the project and its device, the prompts under it; a Circuit project: no device row', E, async (page) => {
  await makeProject(env, { name: 'HierNoTb', board: 'basys2', top: 'top', files: { 'src/top.v': TOP, 'src/inv.v': INV } });
  await tasksInterface(page);
  await page.openProject('HierNoTb');
  await task(page, 'sim');
  await page.waitFor(() => document.querySelector('#task-sim-panel .task-sim-choice')?.getClientRects().length > 0, [], { what: 'the prompts' });
  const r = await rows(page, '#task-sim-panel .task-sim-benches');
  assert.deepEqual(r.slice(0, 2), ['HierNoTb', `  ${DEV}`]);
  assert.equal(r.length, 4, String(r));
  assert.ok(r.slice(2).every((x) => x.startsWith('    ')), `the prompts under the device: ${r}`);
  // (what to do: the page beside it, not a hint line)
  assert.match(await page.eval(() => document.querySelector('#task-empty p').textContent), /no test bench yet/);
  // a Circuit project: no device
  await makeProject(env, { name: 'HierCircuit', kind: 'design', files: { 'src/m.fsm.json': FSM }, top: 'm' });
  await page.openProject('HierCircuit');
  await task(page, 'sim');
  await page.waitFor(() => document.querySelector('#task-sim-panel .task-sim-benches li')?.getClientRects().length > 0, [], { what: 'Simulate\'s tree' });
  const c = await rows(page, '#task-sim-panel .task-sim-benches');
  assert.equal(c[0], 'HierCircuit');
  assert.ok(c.slice(1).every((x) => x.startsWith('  ') && !x.includes('xc')), `no device: ${c}`);
  await noWarnings(page);
});
