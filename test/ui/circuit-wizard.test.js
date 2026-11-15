// UI: the Digital Electronic Circuit Wizard (#4061): New Source ▸ Digital Electronic Circuit (second in the list) ▸
// Wizard >: its assemblies (core/circuit-templates.js), Switches and LEDs with 2 switches and 3 LEDs, a parameter out of
// range refused, its summary; no Empty (#4161); the circuit made and opened in its editor, its HDL generated; three full breadboards; in
// Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newSourceWizardOf } from './new-source-helpers.js';
import { CIRCUIT_TEMPLATES } from '../../core/circuit-templates.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const page3 = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent);

uiTest('#4061 the Digital Electronic Circuit Wizard: switches and LEDs, a parameter refused, the summary; three full breadboards; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircWiz', top: '' });
  await page.setViewport(1440, 900);
  await page.openProject('CircWiz');
  // second in New Source's list
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].slice(0, 3).map((e) => e.lastChild.textContent.trim())), ['Boolean Algebra', 'Digital Electronic Circuit', 'Module (HDL)']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await newSourceWizardOf(page, 'Digital Electronic Circuit', 'panel', 'Digital Electronic Circuit Wizard');
  assert.equal(await page3(page), 'Template');
  assert.deepEqual(await page.eval(() => [...document.querySelector('.dlg-overlay .tp-template').options].map((o) => o.value)), CIRCUIT_TEMPLATES.map((t) => t.id));
  // no Empty (#4161)
  assert.deepEqual(await page.eval(() => [...document.querySelector('.dlg-overlay .tp-template').options].map((o) => o.textContent)), ['Breadboards and a supply', 'Switches and LEDs']);
  await page.fill('.dlg-overlay .tp-template', 'io');
  await page.fill('.dlg-overlay .tp-n', '9');
  await page.dialogButton('Next >');
  await page.waitFor(() => /Switches \(N\): a whole number from 1 to 8\./.test(document.querySelector('.dlg-overlay')?.textContent), [], { what: 'refused' });
  await page.fill('.dlg-overlay .tp-n', '2');
  await page.fill('.dlg-overlay .tp-m', '3');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Summary', [], { what: 'the summary' });
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent),
    /^The wizard will create the digital electronic circuit src\/panel\.circ\.json and open it in the circuit editor\.\n\nModule: panel[^\n]*\nAssembly: Switches and LEDs\nParts: 7 \(0 IC\(s\) · 2 input\(s\) · 3 display\(s\) · 7 wire\(s\)\)$/);
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((ed) => window.Silinx.active?.id === 'circ:src/panel.circ.json' && document.querySelector(ed), [ED], { what: 'opened' });
  const m = JSON.parse(await readWs(env, 'CircWiz', 'src/panel.circ.json'));
  assert.deepEqual(m.parts.filter((p) => p.label).map((p) => p.label), ['sw[0]', 'sw[1]', 'led[0]', 'led[1]', 'led[2]']);
  await page.waitFor(() => window.Silinx.fileTree.includes('src/panel.vhd'), [], { what: 'its HDL' });
  assert.match(await page.consoleText(), /Digital Electronic Circuit Wizard: created src\/panel\.circ\.json \(Switches and LEDs, 7 part\(s\), 7 wire\(s\)\)\./);
  // three full breadboards
  await newSourceWizardOf(page, 'Digital Electronic Circuit', 'bench', 'Digital Electronic Circuit Wizard');
  await page.fill('.dlg-overlay .tp-n', '3');
  await page.fill('.dlg-overlay .tp-size', 'full');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Summary', [], { what: 'the summary' });
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((ed) => window.Silinx.active?.id === 'circ:src/bench.circ.json' && document.querySelector(ed), [ED], { what: 'opened' });
  assert.deepEqual(JSON.parse(await readWs(env, 'CircWiz', 'src/bench.circ.json')).parts.map((p) => p.type), ['supply', 'breadboard-full', 'breadboard-full', 'breadboard-full']);
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await newSourceWizardOf(page, 'Circuito Eletrónico Digital', 'x', 'Assistente de Circuito Eletrónico Digital',
    { menu: 'Projeto', item: 'Nova Fonte…', dialog: 'Nova Fonte', next: 'Seguinte >', wizard: 'Assistente >', file: 'Nome do Ficheiro e Localização' });
  assert.deepEqual(await page.eval(() => [...document.querySelector('.dlg-overlay .tp-template').options].map((o) => o.textContent)), ['Placas de ensaio e uma fonte', 'Interruptores e LEDs']);
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 180000 });
