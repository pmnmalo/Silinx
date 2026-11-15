// UI: Design Properties' Project Kind (#4103, after #3780): the field New Project has, its choices and labels, the
// project's kind shown; the board list without the "no FPGA" entry; the kind "no FPGA" hiding the board, the device,
// the synthesis tool and the language at once; a design project made an FPGA project with no board (its console line),
// undone;
// in Portuguese; no warnings. Both interfaces. (A board making it one, and back, refused with HDL of its own:
// test/ui/design-only.test.js.)
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
const KIND = 'Project Kind:', BOARD = 'Evaluation Development Board:';
// the dialog's fields: the shown labels, the Project Kind's value and options, the board list's options
const fields = (page, kind = KIND, board = BOARD) => page.eval((k, b) => {
  const labels = [...document.querySelectorAll('.dlg-overlay .form-grid > label')];
  const sel = t => labels.find(l => l.textContent === t)?.nextElementSibling;
  return { shown: labels.filter(l => l.style.display !== 'none').map(l => l.textContent), kind: sel(k)?.value, kinds: [...sel(k).options].map(o => [o.value, o.textContent]),
    boards: [...sel(b).options].map(o => o.textContent) };
}, kind, board);
const choose = (page, label, v) => page.eval((l, x) => { const s = [...document.querySelectorAll('.dlg-overlay .form-grid > label')].find(e => e.textContent === l).nextElementSibling; s.value = x; s.dispatchEvent(new Event('change')); }, label, v);
const warnings = async page => (await page.consoleText()).split('\n').filter(l => /WARNING|ERROR/.test(l));

uiTest('#4103 Design Properties: a Project Kind field as New Project\'s, no "no FPGA" board; the kind hides the FPGA fields; a design project made an FPGA one with no board', E, async (page) => {
  await makeProject(env, { name: 'KindFpga', board: 'basys2', files: { 'src/traffic.fsm.json': FSM }, top: 'traffic' });
  await page.openProject('KindFpga');
  await page.waitFor(() => window.Silinx.modules.some(m => m.name === 'traffic'), [], { what: 'its module' });
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  let f = await fields(page);
  assert.deepEqual([f.kind, f.kinds], ['fpga', [['fpga', 'FPGA design (a board and a device)'], ['design', 'Design and simulation only (no FPGA)']]]);
  assert.deepEqual(f.shown.slice(0, 3), ['Name:', KIND, BOARD]);
  assert.ok(f.boards[0] === 'None Specified' && !f.boards.some(b => /no FPGA/.test(b)), f.boards.join(' | '));
  for (const l of ['Device:', 'Synthesis Tool:', 'Preferred Language:']) assert.ok(f.shown.includes(l), l);
  // the kind "no FPGA": the board, the device, the synthesis tool and the language hidden at once; back, shown
  await choose(page, KIND, 'design');
  assert.deepEqual((await fields(page)).shown, ['Name:', KIND, 'Top-Level Source Type:']);
  await choose(page, KIND, 'fpga');
  assert.ok((await fields(page)).shown.includes(BOARD) && (await fields(page)).shown.includes('Device:'));
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => window.Silinx.project.kind), undefined);

  // a design project: its kind shown, the FPGA fields hidden; made an FPGA project with no board
  await makeProject(env, { name: 'KindDrawn', kind: 'design', files: { 'src/traffic.fsm.json': FSM }, top: 'traffic' });
  await page.openProject('KindDrawn');
  await page.waitFor(() => document.documentElement.dataset.projectKind === 'design', [], { what: 'the design project' });
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  f = await fields(page);
  assert.deepEqual([f.kind, f.shown], ['design', ['Name:', KIND, 'Top-Level Source Type:']]);
  await choose(page, KIND, 'fpga');
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitFor(() => !window.Silinx.project.kind && !document.documentElement.dataset.projectKind, [], { what: 'an FPGA project' });
  await page.waitConsole(/KindDrawn: an FPGA project now: its HDL and its implementation shown\./);
  assert.deepEqual(await page.eval(() => [window.Silinx.project.board, window.Silinx.project.constraints]), [null, 'constraints/top.ucf']);
  // undone as any Design Properties: a design project again
  await page.menu('Edit', 'Undo Design Properties');
  await page.waitFor(() => window.Silinx.project.kind === 'design' && document.documentElement.dataset.projectKind === 'design', [], { what: 'undo: a design project again' });
  assert.deepEqual(await warnings(page), []);
});

uiTest('#4103 Design Properties\' Project Kind in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'KindPt', kind: 'design', files: { 'src/traffic.fsm.json': FSM }, top: 'traffic' });
  await page.openProject('KindPt');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    page.eval(async () => (await import('/js/wizards.js')).projectProperties()).catch(() => {});
    await page.waitFor(() => !!document.querySelector('.dlg-overlay .form-grid'), [], { what: 'Design Properties' });
    const f = await fields(page, 'Tipo de Projeto:', 'Placa de Desenvolvimento:');
    assert.deepEqual([f.kind, f.kinds.map(k => k[1])], ['design', ['Projeto para FPGA (uma placa e um dispositivo)', 'Só desenho e simulação (sem FPGA)']]);
    assert.ok(!f.boards.some(b => /sem FPGA/.test(b)), f.boards.join(' | '));
    await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].pop().click());
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
