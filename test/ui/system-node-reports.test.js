// UI (#5632): a System's FPGA node's reports in Implement's tree. The uart-zynq example's Zybo Z7 node: its row's Design
// Summary/Reports and its steps' reports under them (View Synthesis Report under Synthesize, View Static Timing Report
// under Implement Design); before a build, a report said not made yet; after its Implement Design (the Silinx
// toolchain), each opens its file of the node's build folder, and its Design Summary its own document (the node's
// module, device and board, its reports' links in its build folder). Portuguese; both interfaces. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const run = (page, label) => page.eval((l) => [...document.querySelectorAll('#procs .row')].find((r) => r.querySelector('.lbl').textContent === l).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), label);
const has = (page, label) => page.waitFor((l) => [...document.querySelectorAll('#procs .row .lbl')].some((x) => x.textContent === l), [label], { what: label });
const active = (page) => page.eval(() => window.Silinx.active?.id ?? null);

uiTest('#5632 a System\'s FPGA node\'s Design Summary and its steps\' reports in Implement\'s tree, before and after its build; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'NodeReports', template: 'uart-zynq' });
  await page.openProject('NodeReports');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'zybo'), [], { what: 'the node' });
  // (its Implement: the Silinx interface's Implement task, the ISE style's Implementation view)
  if (process.env.SILINX_UI_INTERFACE === 'ise') await page.treeRow('#hier', 'zybo', { exact: true });
  else await page.click('#task-switch .task-btn[data-task="impl"]');
  for (const l of ['Design Summary/Reports', 'View Synthesis Report', 'View Static Timing Report']) await has(page, l);
  // (before a build: said)
  await run(page, 'View Synthesis Report');
  await page.waitConsole(/^ERROR: View Synthesis Report: no report yet for System node zybo: run its Implement Design first$/m);
  // its Implement Design, by the Silinx toolchain
  const impl = await page.eval(() => [...document.querySelectorAll('#procs .row')].filter((r) => r.querySelector('.lbl').textContent === 'Implement Design').length);
  assert.equal(impl, 1);
  await run(page, 'Implement Design');
  await page.waitConsole(/^Process "Implement Design \(System node zybo\)" completed successfully$/m, { timeout: 180000 });
  await run(page, 'View Synthesis Report');
  await page.waitFor(() => window.Silinx.active?.id === 'file:build/nodes/zybo/build/open/leds_stat.txt', [], { what: 'its synthesis report' });
  await run(page, 'View Static Timing Report');
  await page.waitFor(() => window.Silinx.active?.id === 'file:build/nodes/zybo/build/open/timing.txt', [], { what: 'its timing report' });
  await run(page, 'Design Summary/Reports');
  await page.waitFor(() => window.Silinx.active?.id === 'summary:zybo' && document.querySelector('.doc:not([hidden]) .page h2')?.textContent === 'System node zybo Status', [], { what: 'its Design Summary' });
  const summary = await page.eval(() => {
    const p = document.querySelector('.doc:not([hidden]) .page');
    const cell = (t) => [...p.querySelectorAll('th')].find((th) => th.textContent === t)?.nextElementSibling?.textContent ?? null;
    return { file: cell('System File:'), module: cell('Module Name:'), device: cell('Target Device:'), board: cell('Board:'), tab: window.Silinx.active.title };
  });
  assert.deepEqual(summary, { file: 'NodeReports/uart_zynq.sys.json', module: 'leds', device: 'xc7z020-1-clg400', board: 'Digilent Zybo Z7', tab: 'Design Summary (zybo)' });
  // (its reports' links: its build folder's)
  await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .page a')].find((a) => a.closest('tr').firstChild.textContent === 'Static Timing Report').click());
  await page.waitFor(() => window.Silinx.active?.id === 'file:build/nodes/zybo/build/open/timing.txt', [], { what: 'the link' });
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await has(page, 'Ver o Relatório de Síntese');
  await has(page, 'Ver o Relatório de Temporização Estática');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^WARNING/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 300000 });
