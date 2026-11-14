// UI: no FPGA tool in a design and simulation project (#3891, after #3780): no Toolchain Settings (Settings, Tools, the
// toolbar's gear), no RTL Schematic (Tools, a module's menu, the Processes), the view named Design for Implementation,
// Export Project with Silinx's alone, no Language column in Files, no Xilinx library equivalents in a symbol's Symbol
// Info, Design Checks saying Check Design; in Portuguese; no warnings. An FPGA project keeps them. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const FSM = fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8');
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR/.test(l));
// what the interface offers: the menus' labels, the toolbar's gear, the Files tab's columns
const offered = (page) => page.eval(async () => {
  const S = window.SilinxApp.S;
  const items = (m) => S.menus.find((x) => x.label === m).items().filter((x) => x && x !== '-').map((x) => x.label);
  const settings = (await import('/js/menus.js')).settingsItems().filter((x) => x && x !== '-' && x.label).map((x) => x.label);
  const gear = document.querySelector('#toolbar .tb-btn[data-cmd=gear]');
  return { tools: items('Tools'), view: items('View'), settings, gear: !!gear && !gear.hidden,
    files: [...document.querySelectorAll('#files-page table tr:first-child th')].map((t) => t.textContent),
    radio: document.querySelector('input[name=view][value=impl]')?.parentElement.lastChild.textContent.trim() ?? null };
});

uiTest('#3891 a design project: no Toolchain Settings, no RTL Schematic, the Design view, Export Project with Silinx\'s alone, no Language column, no Xilinx equivalents; an FPGA project\'s', E, async (page) => {
  const sch = newDoc('board', 'vhdl');
  sch.symbols.push({ id: 'S1', type: 'fdce', x: 400, y: 300, rot: 0, mirror: false, name: 'U1', params: { init: '0' } });
  await makeProject(env, { name: 'DrawnFpga', kind: 'design', files: { 'src/traffic.fsm.json': FSM, 'src/board.sch.json': JSON.stringify(sch) }, top: 'traffic' });
  await page.openProject('DrawnFpga');
  await page.waitFor(() => document.documentElement.dataset.projectKind === 'design' && window.Silinx.modules.some((m) => m.name === 'traffic'), [], { what: 'the design project' });
  await page.eval(() => window.SilinxApp.renderFilesPage?.());
  const d = await offered(page);
  for (const absent of ['RTL Schematic', 'Toolchain Settings (ISE / Programmers)…']) assert.ok(!d.tools.includes(absent) && !d.settings.includes(absent), absent);
  assert.ok(d.view.includes('Design') && !d.view.includes('Implementation'), d.view.join());
  assert.equal(d.gear, false);
  assert.deepEqual(d.files, ['File Name', 'Association']);
  if (d.radio !== null) assert.equal(d.radio, 'Design');
  // a module's menu: no View RTL Schematic
  await page.treeRow('#hier', 'traffic', { right: true });
  const menu = await page.waitFor(() => { const l = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return l.length ? l : null; }, [], { what: 'the module\'s menu' });
  assert.ok(menu.includes('Rename…') && !menu.some((l) => /RTL/.test(l)), menu.join(' | '));
  await page.closeMenus();
  // Export Project: Silinx's, no software to choose
  page.eval(async () => (await import('/js/project-zip-dialogs.js')).exportProjectDialog()).catch(() => {});
  await page.waitDialog('Export Project');
  const exp = await page.eval(() => ({ radios: document.querySelectorAll('.dlg-overlay input[type=radio]').length, hint: document.querySelector('.dlg-overlay .hint').textContent }));
  assert.deepEqual(exp, { radios: 0, hint: 'The whole Silinx project: silinx.json and every project file (sources, ASM charts, schematics, constraints, simulation files). It opens in Silinx with File ▸ Import Project (.zip)….' });
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // a flip-flop's Symbol Info: no Xilinx library equivalents
  await page.eval(() => window.SilinxApp.openSch('src/board.sch.json'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .sch-editor g.sym[data-id="S1"]'), [], { what: 'the schematic' });
  await page.click('.doc:not([hidden]) .sch-editor g.sym[data-id="S1"] .hitbox');
  await page.key('F1');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .se-symdoc'), [], { what: 'the Symbol Info' });
  assert.equal(await page.eval(() => !!document.querySelector('.doc:not([hidden]) .se-symdoc .sd-xil')), false);
  await page.click('.doc:not([hidden]) .se-symdoc [data-act=close]');
  // Design Checks: Check Design's
  const toastText = async () => page.waitFor(() => [...document.querySelectorAll('.toasts .toast, .toasts > *')].map((t) => t.textContent).find((t) => /^Design checks/.test(t)) || null, [], { what: 'the toast' });
  const toggle = () => page.eval(() => window.SilinxApp.S.menus.find((m) => m.label === 'Edit').items().find((x) => x?.label === 'Design Checks (Lint Warnings)').action());
  await page.eval(() => document.querySelectorAll('.toasts > *').forEach((t) => t.remove()));
  await toggle();
  let t = await toastText();
  if (!/on:/.test(t)) { await page.eval(() => document.querySelectorAll('.toasts > *').forEach((x) => x.remove())); await toggle(); t = await toastText(); await toggle(); } else await toggle();
  assert.equal(t.replace(/\s*[×✕]\s*$/, ''), 'Design checks on: Check Design and the editor show the lint warnings');
  // in Portuguese: the view
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    // (the menu's Design, translated as the Design pane's)
    assert.equal(await page.eval(async () => (await import('/js/i18n.js')).t('Design')), 'Projeto');
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.deepEqual(await warnings(page), []);

  // an FPGA project: its toolchain, its RTL Schematic, its Implementation view, its Language column
  await makeProject(env, { name: 'FpgaPj', board: 'basys2', files: { 'src/traffic.fsm.json': FSM }, top: 'traffic' });
  await page.openProject('FpgaPj');
  await page.waitFor(() => !document.documentElement.dataset.projectKind && window.Silinx.modules.some((m) => m.name === 'traffic'), [], { what: 'the FPGA project' });
  await page.eval(() => window.SilinxApp.renderFilesPage?.());
  const f = await offered(page);
  assert.ok(f.tools.includes('RTL Schematic') && f.tools.includes('Toolchain Settings (ISE / Programmers)…') && f.view.includes('Implementation'), JSON.stringify(f));
  assert.deepEqual([f.gear, f.files], [true, ['File Name', 'Association', 'Language']]);
  if (f.radio !== null) assert.equal(f.radio, 'Implementation');
});
