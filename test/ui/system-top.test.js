// UI (#5402): a System as the project's top. Design Properties' Top-Level Source Type "System" makes an FPGA project a
// co-design project, its new System its top (the Design pane's System row; its board kept); Set as Top Module on one of
// its modules makes it an FPGA project again, on that board; the Files view's Set as Top Module on its System makes it a
// co-design project again, that System its top. The console's lines; in Portuguese; no warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const BLINK = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity blink is port (sw : in std_logic; led : out std_logic); end blink;\narchitecture r of blink is begin led <= sw; end r;\n';
const warnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((l) => /^(WARNING|ERROR)/.test(l)));
const project = (page) => page.eval(() => { const p = window.Silinx.project; return [p.kind ?? null, p.board, p.top, p.topSourceType]; });
const field = (label) => [...document.querySelectorAll('.dlg-overlay .form-grid > label')].find((l) => l.textContent === label).nextElementSibling;

uiTest('#5402 a System as the project\'s top: Design Properties\' System, Set as Top Module on a module and on the System', E, async (page) => {
  await makeProject(env, { name: 'SysTop', board: 'basys2', top: 'blink', files: { 'src/blink.vhd': BLINK } });
  await page.openProject('SysTop');
  await page.waitFor(() => window.Silinx.modules.some((m) => m.name === 'blink'), [], { what: 'its module' });
  // Design Properties: System among the Top-Level Source Types, chosen
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  const types = await page.eval((f) => [...eval(`(${f})`)('Top-Level Source Type:').options].map((o) => `${o.value}:${o.textContent}`), field.toString());
  assert.equal(types.at(-1), 'system:System (co-design)');
  await page.eval((f) => { const s = eval(`(${f})`)('Top-Level Source Type:'); s.value = 'system'; s.dispatchEvent(new Event('change')); }, field.toString());
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.kind === 'codesign', [], { what: 'a co-design project' });
  await page.waitConsole(/^SysTop: a co-design project now, its System SysTop\.sys\.json its top \(its board kept: Set as Top Module on a module makes it an FPGA project again\)\.$/m);
  assert.deepEqual(await project(page), ['codesign', null, '', 'system']);
  // (the Design pane: its System's row, as a co-design project's)
  await page.waitFor(() => [...document.querySelectorAll('#left .tree .badge, #left .tree [class*=badge]')].some((b) => b.textContent === 'System'), [], { what: 'the System row' });
  // Set as Top Module on its module (the Files view's blink.vhd row has none: the Design pane's module): an FPGA project again
  await page.eval(() => window.SilinxApp.setTop('blink', false));
  await page.waitFor(() => window.Silinx.project && !window.Silinx.project.kind, [], { what: 'an FPGA project again' });
  await page.waitConsole(/^SysTop: an FPGA project now, its top module 'blink' on basys2 \(xc3s250e-4-cp132\)\.$/m);
  assert.deepEqual(await project(page), [null, 'basys2', 'blink', 'hdl']);
  // the Files view: Set as Top Module on its System
  await page.leftTab('files');
  const i = await page.waitFor(() => [...document.querySelectorAll('#files-page tr')].findIndex((tr) => tr.cells[0]?.textContent === 'SysTop.sys.json') + 1) - 1;
  await page.rightClick('#files-page tr', { index: i });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Set as Top Module' });
  await page.waitFor(() => window.Silinx.project?.kind === 'codesign', [], { what: 'a co-design project again' });
  assert.deepEqual(await project(page), ['codesign', null, '', 'system']);
  // in Portuguese: the type's label, the console's line
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.eval(() => window.SilinxApp.setTop('blink', false));
  await page.waitConsole(/^SysTop: agora um projeto FPGA, o seu módulo de topo 'blink' na basys2 \(xc3s250e-4-cp132\)\.$/m);
  await page.menu('Projeto', 'Propriedades do Projeto…');
  await page.waitDialog('Propriedades do Projeto');
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay select option')].find((o) => o.value === 'system')?.textContent), 'Sistema (co-design)');
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
