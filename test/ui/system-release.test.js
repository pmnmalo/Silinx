// UI (#5202): Systems off in a release (core/build-channel.js), the local server's channel 'release'
// (SILINX_CHANNEL): New Project's System card disabled, the reason said under it (in Portuguese too), the FPGA kind's
// Start from with no System example; a System project made in a development build: no System row in the Design
// pane, its .sys.json opened, or emulated, says why in the console (no editor, no emulator); the Circuit editor's Parts
// panel without its Boards (#5215). Both interfaces. (In the development build:
// test/ui/system-new-project.test.js.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { EXAMPLE_ORDER } from '../../core/examples.js';
import { newCircuit } from '../../core/circuit.js';

let env;
before(async () => { process.env.SILINX_CHANNEL = 'release'; env = await setupUi(); delete process.env.SILINX_CHANNEL; });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const OFF = 'Systems are not in this release yet: it is in the development build (the site\'s dev/) until it is stable.';
const OFF_PT = 'Os Sistemas ainda não estão nesta versão: está na versão de desenvolvimento (a dev/ do site) até estar estável.';
const card = (page) => page.eval(() => { const c = document.querySelector('.dlg-overlay .kind-card[data-kind=system]'); return { off: c.classList.contains('off'), disabled: c.querySelector('input').disabled, why: c.querySelector('.kind-not-yet')?.textContent }; });

uiTest('#5202 a release: New Project\'s System card disabled with its reason, no System example; Portuguese', E, async (page) => {
  assert.equal(await page.eval(() => globalThis.SILINX_CHANNEL), 'release');
  await page.menu('File', 'New Project…');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .kind-cards'), [], { what: 'New Project\'s kind' });
  assert.deepEqual(await card(page), { off: true, disabled: true, why: OFF });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .kind-card')].map(c => [c.dataset.kind, c.querySelector('input').disabled])), [['design', false], ['fpga', false], ['system', true]]);   // (the three modes, #5754: Embedded / SoC a System's profile)
  await page.dialogButton('Next >');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .wiz-main select'), [], { what: 'Start from' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-main select option')].map(o => o.value)), ['empty', ...EXAMPLE_ORDER]);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.menu('Ficheiro', 'Novo Projeto…');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .kind-cards'), [], { what: 'Novo Projeto' });
  assert.deepEqual(await card(page), { off: true, disabled: true, why: OFF_PT });
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

uiTest('#5215 a release: the Circuit editor\'s Parts panel has no Boards (the Systems\')', E, async (page) => {
  await makeProject(env, { name: 'CircRel', top: '', files: { 'src/c.circ.json': JSON.stringify(newCircuit('c'), null, 2) } });
  await page.openProject('CircRel');
  await page.eval(() => window.SilinxApp.openFile('src/c.circ.json'));
  const ed = '.doc:not([hidden]) .circuit-editor';
  await page.waitFor((e) => document.querySelector(`${e} .circ-lib-part[data-part="supply"]`), [ed], { what: 'the Parts panel' });
  assert.deepEqual(await page.eval((e) => [document.querySelectorAll(`${e} .circ-lib-part[data-group="Boards"]`).length, [...document.querySelectorAll(`${e} .circ-lib-title > span:first-child`)].map((t) => t.textContent).includes('Boards')], ed), [0, false]);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

uiTest('#5202 a release: a System project\'s System not shown, its .sys.json opened refused in the console', E, async (page) => {
  const sys = JSON.stringify({ format: 'silinx-system', version: 2, name: 'cd', nodes: [], links: [] }, null, 2);
  await makeProject(env, { name: 'CdRel', template: 'uart', files: { 'cd.sys.json': sys } });
  const pj = await env.server.api('GET', '/api/projects/CdRel');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/CdRel', { ...pj, kind: 'system', board: null, constraints: null, top: null });
  await page.openProject('CdRel');
  await page.leftTab('design');
  await page.waitFor(() => document.querySelectorAll('#hier .row').length > 0, [], { what: 'the Design pane' });
  assert.equal(await page.eval(() => [...document.querySelectorAll('#hier .row .badge')].some((b) => b.textContent === 'System')), false);
  await page.eval(() => window.SilinxApp.openFile('cd.sys.json'));
  await page.waitConsole(/^ERROR: cannot open cd\.sys\.json: Systems are not in this release yet/m);
  assert.equal(await page.eval(() => !!document.querySelector('.system-editor') || (window.Silinx.active?.id || '').startsWith('sys:')), false);
  // (the System Emulator too, #5212)
  await page.eval(async () => (await import('/js/system-emu-open.js')).openSystemEmulator('cd.sys.json'));
  await page.waitConsole(/^ERROR: cannot emulate cd\.sys\.json: Systems are not in this release yet/m);
  assert.equal(await page.eval(() => !!document.querySelector('.sys-emu') || (window.Silinx.active?.id || '').startsWith('sysemu:')), false);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
