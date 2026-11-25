// UI (#5402): a System as the project's top. Design Properties' Top-Level Source Type "System" makes an FPGA project a
// System project, its new System its top (the Design pane's System row; its board kept); the Files view's Set as Top
// Module on a System document does the same. #5583: Set as Top Module on a module of a System project sets the top
// module of the FPGA node whose folder holds it (the Design pane marks it), the System still the project's top; a module
// in no node's folder is refused. The console's lines; in Portuguese; no warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const BLINK = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity blink is port (sw : in std_logic; led : out std_logic); end blink;\narchitecture r of blink is begin led <= sw; end r;\n';
const warnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((l) => /^(WARNING|ERROR)/.test(l)));
// (its profile, #5440: a System project's written as profile)
const project = (page) => page.eval(() => { const p = window.Silinx.project; return [p.profile ?? p.kind ?? null, p.board, p.top, p.topSourceType]; });
const field = (label) => [...document.querySelectorAll('.dlg-overlay .form-grid > label')].find((l) => l.textContent === label).nextElementSibling;

uiTest('#5402 a System as the project\'s top: Design Properties\' System; the Files view\'s Set as Top Module on a System document', E, async (page) => {
  await makeProject(env, { name: 'SysTop', board: 'basys2', top: 'blink', files: { 'src/blink.vhd': BLINK } });
  await page.openProject('SysTop');
  await page.waitFor(() => window.Silinx.modules.some((m) => m.name === 'blink'), [], { what: 'its module' });
  // Design Properties: System among the Top-Level Source Types, chosen
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  const types = await page.eval((f) => [...eval(`(${f})`)('Top-Level Source Type:').options].map((o) => `${o.value}:${o.textContent}`), field.toString());
  assert.equal(types.at(-1), 'system:System');
  await page.eval((f) => { const s = eval(`(${f})`)('Top-Level Source Type:'); s.value = 'system'; s.dispatchEvent(new Event('change')); }, field.toString());
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.profile === 'system', [], { what: 'a System project' });
  await page.waitConsole(/^SysTop: a System project now, its System SysTop\.sys\.json its top \(its board kept\)\.$/m);
  assert.deepEqual(await project(page), ['system', null, '', 'system']);
  // (the Design pane: its System's row, as a System project's)
  await page.waitFor(() => [...document.querySelectorAll('#left .tree .badge, #left .tree [class*=badge]')].some((b) => b.textContent === 'System'), [], { what: 'the System row' });
  // Set as Top Module on its module, in no node's folder (#5583): refused, the System still its top
  await page.eval(() => window.SilinxApp.setTop('blink', false));
  await page.waitConsole(/^ERROR: Set as Top Module: 'blink' is in no node's folder of the System SysTop: a System project's top is its System, and an FPGA node's top module is a module of its folder$/m);
  assert.deepEqual(await project(page), ['system', null, '', 'system']);
  // the Files view: Set as Top Module on a System document of an FPGA project
  await makeProject(env, { name: 'SysTop2', board: 'basys2', top: 'blink', files: { 'src/blink.vhd': BLINK, 'lab.sys.json': JSON.stringify({ format: 'silinx-system', version: 2, name: 'lab', nodes: [], links: [] }) } });
  await page.openProject('SysTop2');
  await page.leftTab('files');
  const i = await page.waitFor(() => [...document.querySelectorAll('#files-page tr')].findIndex((tr) => tr.cells[0]?.textContent === 'lab.sys.json') + 1) - 1;
  await page.rightClick('#files-page tr', { index: i });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Set as Top Module' });
  await page.waitFor(() => window.Silinx.project?.profile === 'system', [], { what: 'a System project' });
  await page.waitConsole(/^SysTop2: a System project now, its System lab\.sys\.json its top \(its board kept\)\.$/m);
  assert.deepEqual(await project(page), ['system', null, '', 'system']);
  // in Portuguese: the type's label
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.menu('Projeto', 'Propriedades do Projeto…');
  await page.waitDialog('Propriedades do Projeto');
  // (the Top-Level Source Type's option, not the Project Kind's: both ids system since #5411)
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay select')].find((s) => [...s.options].some((o) => o.value === 'hdl'))?.querySelector('option[value=system]')?.textContent), 'Sistema');
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(await warnings(page), ['ERROR: Set as Top Module: \'blink\' is in no node\'s folder of the System SysTop: a System project\'s top is its System, and an FPGA node\'s top module is a module of its folder']);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });

// a module's row of the Design pane: whether it is marked as a top (the top module's icon and class)
const marked = (page, name) => page.eval((n) => document.querySelector(`#hier .row[data-module="${n}"]`)?.classList.contains('top-mod') ?? null, name);
const nodeModule = () => JSON.parse(fs.readFileSync(path.join(env.server.workspace, 'SysNodeTop/uart_avr.sys.json'), 'utf8')).nodes.find((n) => n.id === 'fpga').module;

uiTest('#5583 Set as Top Module on a module of an FPGA node\'s folder: that node\'s top module, the System still the project\'s top; marked in the Design pane; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'SysNodeTop', template: 'uart-avr', files: { 'fpga/other.vhd': BLINK.replace(/blink/g, 'other') } });
  await page.openProject('SysNodeTop');
  if (process.env.SILINX_UI_INTERFACE !== 'ise') await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'other'), [], { what: 'its modules' });
  const before = await project(page);
  assert.equal(await marked(page, 'uart'), true, 'the node\'s top marked');
  assert.equal(await marked(page, 'other'), false);
  // its row's menu: Set as Top Module
  await page.treeRow('#hier', 'other', { exact: true, right: true });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Set as Top Module' });
  // (before #5583: an FPGA project again, the System gone from its top)
  await page.waitConsole(/^Set as Top Module: 'other' is now fpga's top module \(the System uart_avr stays the project's top\)\.$/m);
  assert.deepEqual(await project(page), before);
  assert.equal(nodeModule(), 'other');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row.top-mod[data-module]')].map((r) => r.dataset.module).join() === 'other', [], { what: 'other marked, uart not' });
  assert.ok(await page.eval(() => [...document.querySelectorAll('#hier .badge')].some((b) => b.textContent === 'System')), 'the System row');
  // the System editor open: its model follows
  await page.eval(() => window.SilinxApp.openFile('uart_avr.sys.json'));
  await page.waitFor(() => window.SilinxApp.findDoc('sys:uart_avr.sys.json')?.systemEditor, [], { what: 'the System editor' });
  // in Portuguese: uart its top again
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.eval(() => window.SilinxApp.setTop('uart', false));
  await page.waitConsole(/^Definir como Módulo de Topo: 'uart' é agora o módulo de topo de fpga \(o Sistema uart_avr continua o topo do projeto\)\.$/m);
  assert.equal(nodeModule(), 'uart');
  assert.equal(await page.eval(() => window.SilinxApp.findDoc('sys:uart_avr.sys.json').systemEditor.getModel().nodes.find((n) => n.id === 'fpga').module), 'uart');
  assert.equal(await page.eval(() => window.SilinxApp.findDoc('sys:uart_avr.sys.json').dirty), false);
  await page.eval(() => window.SilinxApp.setTop('uart', false));
  await page.waitConsole(/^Definir como Módulo de Topo: 'uart' já é o módulo de topo de fpga\.$/m);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(await project(page), before);
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
