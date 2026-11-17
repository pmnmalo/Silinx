// UI: no HDL in a design and simulation project's wizards and dialogs (#3891, after #3780): the drawings' wizards with no
// Language field, no "its HDL is generated from it", no language in their summaries; New Project's note; Design
// Properties' Top Module; Rename… and Source Properties… of a drawn module (its drawing, never its HDL file); Remove from
// Project (the drawing alone named); the Design pane's badges' tips; the Command Palette's files; in Portuguese; no
// warnings. An FPGA project keeps them (test/ui/modwizard.test.js, test/ui/remove-module.test.js…). Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const FSM = fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8');
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR/.test(l));
const h3 = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent);
const labels = (page) => page.eval(() => [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.form-grid > label')].filter((l) => l.style.display !== 'none').map((l) => l.textContent));
const hint = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main .hint')?.textContent);
const msg = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.msg-text').textContent);
const cancel = async (page) => {
  await page.eval(() => [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.dlg-buttons .btn')].find((b) => /^(Cancel|Cancelar|No|Não)$/.test(b.textContent)).click());
  await page.waitNoDialog();
};
// a wizard opened from its module (its first page: the name)
const wizard = (page, mod, fn) => page.eval((m, f) => { import(`/js/${m}.js`).then((x) => x[f]()); }, mod, fn);

uiTest('#3891 a design project\'s wizards: no Language, no HDL in their hints and summaries; New Project\'s note; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'DrawnWiz', kind: 'design', files: { 'src/traffic.fsm.json': FSM }, top: 'traffic' });
  await page.openProject('DrawnWiz');
  await page.waitFor(() => document.documentElement.dataset.projectKind === 'design' && window.Silinx.modules.some((m) => m.name === 'traffic'), [], { what: 'the design project' });
  // the Schematic Wizard: its first page "Name", no Language; its summary without the HDL's language
  wizard(page, 'modwizard', 'schematicWizard');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3'), [], { what: 'the Schematic Wizard' });
  assert.equal(await h3(page), 'Name');
  assert.deepEqual(await labels(page), ['Schematic (module) name:', 'Location:', 'File:']);
  await page.fill('.dlg-overlay .mw-name', 'gate');
  // (every page's text without HDL: the ports' hint without std_logic / wire)
  const seen = [];
  for (let i = 0; i < 4 && (await h3(page)) !== 'Summary'; i++) {
    seen.push(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main').textContent));
    await page.dialogButton('Next >');
  }
  assert.equal(await h3(page), 'Summary');
  assert.ok(seen.some((t) => t.includes('Width 1 is a single bit; a width N makes a bus')), 'the ports\' hint');
  for (const t of seen) assert.doesNotMatch(t, /HDL|VHDL|Verilog|std_logic/);
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), /\n\nModule: gate\n/);
  await cancel(page);
  // the FSM, ASM and Petri Net wizards: their hints without the HDL
  for (const [mod, fn, text] of [
    ['chart-wizards', 'fsmWizard', 'The wizard creates a state diagram with its inputs, outputs, states and transitions, ready for you to set the outputs of its states.'],
    ['chart-wizards', 'asmWizard', 'The wizard creates an ASM chart with its inputs, outputs and state boxes, ready for you to add the decisions and the outputs.'],
    ['petri-wizard', 'petriWizard', 'The wizard creates a Petri net with its inputs and outputs declared, ready for you to draw its places, transitions and arcs.'],
  ]) {
    wizard(page, mod, fn);
    await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3'), [], { what: fn });
    assert.deepEqual([await h3(page), await hint(page), (await labels(page)).includes('Language:')], ['Name', text, false], fn);
    await cancel(page);
  }
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    wizard(page, 'chart-wizards', 'fsmWizard');
    await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3'), [], { what: 'the FSM Wizard' });
    assert.deepEqual([await h3(page), await hint(page)], ['Nome', 'O assistente cria um diagrama de estados com as entradas, as saídas, os estados e as transições, pronto para definir as saídas dos estados.']);
    await cancel(page);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  // New Project, a design project: its note without the HDL module
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Drawn2');
  await page.fill('.dlg-overlay .wiz-main select', 'design', { index: 1 });
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Settings');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main .hint[style*="grid-column"]')?.textContent), 'The project starts with src/top.sch.json (the top module \'top\').');
  await cancel(page);
  assert.deepEqual(await warnings(page), []);
});

uiTest('#3891 a design project\'s drawn module: Rename…, Source Properties…, Remove from Project, its badges, the Command Palette, without its HDL file', E, async (page) => {
  await makeProject(env, { name: 'DrawnDlg', kind: 'design', files: { 'src/traffic.fsm.json': FSM }, top: 'traffic' });
  await page.openProject('DrawnDlg');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/traffic.vhd'] === 'src/traffic.fsm.json', [], { what: 'the drawing\'s HDL' });
  // opened: no device in the console, the status bar, Open Project's list
  await page.waitConsole(/Project "DrawnDlg" opened/);
  assert.ok((await page.consoleText()).split('\n').includes('Project "DrawnDlg" opened (a design and simulation project, no FPGA).'));
  assert.equal(await page.eval(() => document.getElementById('status-device').textContent), '');
  page.eval(async () => (await import('/js/wizards.js')).openProjectDialog()).catch(() => {});
  await page.waitDialog('Open Project');
  const row = await page.eval(() => [...document.querySelectorAll('.dlg-overlay table tr')].map((r) => [...r.cells].map((c) => c.textContent)).find((c) => c[0] === 'DrawnDlg'));
  assert.deepEqual(row.slice(0, 3), ['DrawnDlg', '', 'Design and simulation only (no FPGA)']);   // (no Top column, #4314)
  await cancel(page);
  // its badge's tip
  assert.deepEqual(await page.eval(() => [...[...document.querySelectorAll('#hier .row')].find((r) => r.querySelector('.lbl')?.textContent === 'traffic').querySelectorAll('.badge')].map((b) => [b.textContent, b.title])), [['FSM', 'Open']]);
  // the Command Palette: the drawing, not its HDL
  page.eval(async () => (await import('/js/menus.js')).showPalette()).catch(() => {});
  await page.waitFor(() => document.querySelector('.pal-input'), [], { what: 'the palette' });
  await page.eval(() => { const i = document.querySelector('.pal-input'); i.value = 'traffic'; i.dispatchEvent(new Event('input')); });
  const files = await page.waitFor(() => { const l = [...document.querySelectorAll('.pal-file .pal-label')].map((e) => e.textContent); return l.length ? l : null; }, [], { what: 'the palette\'s files' });
  assert.ok(files.some((f) => f.includes('src/traffic.fsm.json')) && !files.some((f) => /\.vhd/.test(f)), String(files));
  await page.key('Escape');
  await page.waitFor(() => !document.querySelector('.pal-overlay'), [], { what: 'the palette closed' });
  // Source Properties… of its module: its drawing
  page.eval(async () => (await import('/js/wizards.js')).sourceProperties('src/traffic.vhd')).catch(() => {});
  await page.waitDialog('Source Properties - src/traffic.fsm.json');
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid span')].map((s) => s.textContent).join()), 'src/traffic.fsm.json');
  await cancel(page);
  // Rename… of its module: its name alone, the file following it; the console without the HDL file
  page.eval(async () => (await import('/js/rename.js')).renameDialog('src/traffic.vhd', 'traffic')).catch(() => {});
  await page.waitDialog('Rename');
  assert.deepEqual(await labels(page), ['Module:']);
  await page.eval(() => { const i = document.querySelector('.dlg-overlay .form-grid input'); i.value = 'lights'; i.dispatchEvent(new Event('input')); });
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitConsole(/Rename: module 'traffic' renamed to 'lights'/);
  const line = (await page.consoleText()).split('\n').find((l) => /^Rename: /.test(l));
  assert.equal(line, 'Rename: module \'traffic\' renamed to \'lights\' (1 file(s) updated); src/traffic.fsm.json → src/lights.fsm.json.');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/lights.vhd'] === 'src/lights.fsm.json', [], { what: 'the renamed drawing' });
  // Remove from Project of its module: the drawing alone named
  page.eval(async () => (await import('/js/design.js')).removeModule('src/lights.vhd')).catch(() => {});
  await page.waitDialog('Remove Source');
  assert.equal(await msg(page), 'Remove \'src/lights.fsm.json\' from the project?\n(The file stays in the project folder: Undo or Add to Project in the Files view brings it back.)');
  await page.dialogButton('Yes');
  await page.waitNoDialog();
  await page.waitConsole(/^Removed src\/lights\.fsm\.json from the project/m);
  assert.ok(!(await page.consoleText()).includes('lights.vhd'), 'no HDL file named');
  assert.deepEqual(await warnings(page), []);
});
