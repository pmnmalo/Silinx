// UI (#4702): a co-design project made by New Project. The Co-design card chosen: its Start from the co-design examples
// only (uart-avr), its settings page no board nor device but what stands for them; made from uart-avr, its System opened
// at once (the Design pane's `uart_avr [System]`, the uart module under it), then simulated: the Arduino's "Hello from
// Arduino!" echoed by the FPGA in the link inspector. An empty one: its System document, no node. The FPGA kind's Start
// from has no co-design example; Design Properties of a co-design project says what stands for them. Portuguese; both
// interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const NOTE = 'A co-design project has no board of its own: each FPGA node of its System names its board and pins, each microcontroller its firmware.';

const openWizard = async (page) => {
  await page.menu('File', 'New Project…');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .kind-cards'), [], { what: 'New Project\'s kind' });
};
const startFrom = page => page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-main select option')].filter(o => !o.hidden).map(o => o.value));
// New Project ▸ Co-design: its name, its Start from (`template`), Finish; the System open
async function newCodesign(page, name, template) {
  await openWizard(page);
  await page.click('.dlg-overlay .kind-card[data-kind=codesign] input');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  assert.deepEqual(await startFrom(page), ['empty', 'uart-avr', 'spi-avr']);
  await page.fill('.dlg-overlay .wiz-main select', template);
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Settings', [], { what: 'Project Settings' });
  const settings = await page.eval(() => ({ note: document.querySelector('.dlg-overlay .codesign-note')?.textContent,
    fields: [...document.querySelector('.dlg-overlay .codesign-note').parentElement.querySelectorAll('.form-grid > label')].filter(l => l.style.display !== 'none').map(l => l.textContent) }));
  assert.deepEqual(settings, { note: NOTE, fields: [] });
  await page.dialogButton('Next >');
  await page.waitFor(() => /Kind: {9}Co-design/.test(document.querySelector('.dlg-overlay pre.code-box')?.textContent || ''), [], { what: 'the summary' });
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((ed) => window.Silinx.active?.id?.startsWith('sys:') && document.querySelector(ed), [ED], { what: 'the System open' });
}

uiTest('#4702 New Project ▸ Co-design from uart-avr: its System open, its Design row, simulated: the Arduino\'s hello echoed', E, async (page) => {
  await newCodesign(page, 'CoNew', 'uart-avr');
  assert.equal(await page.eval(() => window.Silinx.active.id), 'sys:uart_avr.sys.json');
  assert.equal(await page.eval(() => window.SilinxApp.S.project.kind), 'codesign');
  await page.waitFor(() => ['uart_avr', 'uart'].every(n => [...document.querySelectorAll('#hier .row .lbl')].some(l => l.textContent.trim() === n)), [], { what: 'its Design rows' });
  await page.click(`${ED} .sys-sim-btn`);
  await page.click(`${ED} .sys-run-for`);
  await page.waitFor(() => { const s = window.Silinx.active.systemEditor.sim?.state(); return s && !s.running && s.now >= 100e9; }, [], { what: '100 ms run', timeout: 60000 });
  const s = await page.eval(() => window.Silinx.active.systemEditor.sim.state());
  const text = w => String.fromCharCode(...s.traffic.find(t => t.wire === w).bytes.map(b => b.byte));
  assert.deepEqual([text('serial_uno'), text('serial_fpga'), s.warnings, s.errors], ['Hello from Arduino!\r\n', 'Hello from Arduino!\r\n', [], []]);
  // Design Properties of a co-design project: what stands for its board, in the console
  await page.eval(async () => (await import('/js/wizards.js')).projectProperties());
  await page.waitFor((n) => [...document.querySelectorAll('#console-log .ln')].some(l => l.textContent.trim() === `Design Properties: ${n}`), [NOTE], { what: 'Design Properties\' note' });
  assert.equal(await page.eval(() => !!document.querySelector('.dlg-overlay')), false);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

uiTest('#4702 New Project ▸ Co-design, empty: its System document, no node; the FPGA kind has no co-design example; Portuguese', E, async (page) => {
  await newCodesign(page, 'CoEmpty', 'empty');
  assert.equal(await page.eval(() => window.Silinx.active.id), 'sys:CoEmpty.sys.json');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .doc-status`).textContent, ED), '0 nodes · 0 links');
  // the FPGA kind's Start from: the examples but uart-avr
  await openWizard(page);
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Create New Project', [], { what: 'its first page' });
  const fpga = await startFrom(page);
  assert.ok(fpga.includes('uart') && !fpga.includes('uart-avr'), fpga.join(', '));
  await page.dialogButton('< Back');
  // in Portuguese: the co-design card and its settings page
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.click('.dlg-overlay .kind-card[data-kind=codesign] input');
  await page.dialogButton('Seguinte >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main input[type=text]'), [], { what: 'its first page' });
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'CoPt');
  await page.dialogButton('Seguinte >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .codesign-note')?.textContent === 'Um projeto de co-design não tem placa própria: cada nó FPGA do seu Sistema indica a sua placa e os pinos, cada microcontrolador o seu firmware.', [], { what: 'Portuguese' });
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
