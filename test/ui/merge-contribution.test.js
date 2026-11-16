// UI: Project ▸ Merge Contribution… and Undo Merge (#4206, web/js/merge-dialog.js), in both interfaces: a teacher's
// project given out (Export Project as Silinx), a student's copy imported and changed, given back; the teacher's
// project changed meanwhile (the same transition of the state diagram, another file). The window lists the files that
// differ with what the merge does, the transition's conflict with Mine / Theirs (Merge refused until it is chosen); the
// merge's lines in the console (nothing in the window after it closes), the files as merged, the project untrusted;
// Compare from the window and back through the console; Undo Merge putting the project back; and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject, waitDownload, readWs, writeWs } from './harness.js';
import { FILE, exportZip, openImport } from './zip-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const FSM = 'src/traffic.fsm.json';
async function editFsm(project, fn) { const m = JSON.parse(await readWs(env, project, FSM)); fn(m); await writeWs(env, project, FSM, `${JSON.stringify(m, null, 2)}\n`); }
const lines = async (page, from) => (await page.consoleText()).slice(from).split('\n').map((l) => l.trim()).filter(Boolean);

uiTest('#4206 Merge Contribution…: the files that differ and what is done with each, a conflict chosen, merged, compared, undone; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Teacher', template: 'traffic', board: 'basys2' });
  await page.openProject('Teacher');
  await exportZip(page, 'silinx');
  const copy = path.join(env.tmp, 'teacher-copy.zip');
  await fs.copyFile(await waitDownload(page, 'Teacher-silinx.zip'), copy);
  await openImport(page, 'silinx');
  await page.setFiles(FILE, [copy]);
  await page.fill('.dlg-overlay input[type=text]', 'Ana');
  await page.dialogButton('Import');
  await page.waitFor(() => window.Silinx.project?.name === 'Ana' && document.querySelector('#hier .row'), [], { what: 'the copy open' });
  // Ana's work: the first transition's condition, the seven-segment decoder (Verilog)
  await editFsm('Ana', (m) => { m.transitions[0].cond = 'night and req'; });
  await writeWs(env, 'Ana', 'src/sevenseg.v', `${await readWs(env, 'Ana', 'src/sevenseg.v')}// ana\n`);
  await page.openProject('Ana');
  await exportZip(page, 'silinx');
  const back = path.join(env.tmp, 'ana-work.zip');
  await fs.copyFile(await waitDownload(page, 'Ana-silinx.zip'), back);
  // the teacher meanwhile: the same transition, the timer (VHDL)
  await editFsm('Teacher', (m) => { m.transitions[0].cond = 'night or req'; });
  const timer = `${await readWs(env, 'Teacher', 'src/timer.vhd')}-- teacher\n`;
  await writeWs(env, 'Teacher', 'src/timer.vhd', timer);
  await page.openProject('Teacher');
  const before = { fsm: await readWs(env, 'Teacher', FSM), seven: await readWs(env, 'Teacher', 'src/sevenseg.v') };
  const start = (await page.consoleText()).length;
  await page.menu('Project', 'Merge Contribution…');
  await page.waitDialog('Merge Contribution');
  await page.setFiles(FILE, [back]);
  await page.dialogButton('Compare');
  await page.waitFor(() => document.querySelector('.dlg-overlay .merge-files'), [], { what: 'the comparison' });
  const rows = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .merge-file')].map((r) => [r.dataset.path, r.querySelector('.merge-state').textContent]));
  assert.deepEqual(rows, [['src/sevenseg.v', 'Changed there: taken'], ['src/timer.vhd', 'Changed here: kept'], [FSM, 'Changed on both sides: choose']]);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .merge-summary').textContent), 'Through their common ancestor: 3 file(s) differ, 1 conflict(s) to choose.');
  // Merge refused until the conflict is chosen
  await page.dialogButton('Merge');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .merge-error').textContent), 'Choose Mine or Theirs for 1 conflict(s) more.');
  // Compare: the window closed, the comparison open; the console's line opens it again
  await page.eval(() => document.querySelector(`.dlg-overlay .merge-file[data-path="src/traffic.fsm.json"] .merge-compare`).click());
  await page.waitFor(() => /^diff:src\/traffic\.fsm\.json:/.test(window.Silinx.active?.id || '') && !document.querySelector('.dlg-overlay'), [], { what: 'the comparison open' });
  await page.waitConsole(/Merge Contribution: src\/traffic\.fsm\.json compared with ana-work\.zip\./);
  await page.eval(() => [...document.querySelectorAll('#console-log .ln .ln-action')].pop().click());
  await page.waitFor(() => document.querySelector('.dlg-overlay .merge-files'), [], { what: 'the comparison again' });
  await page.click('.dlg-overlay .merge-object[data-id="transitions/t1"] .merge-theirs input');
  await page.dialogButton('Merge');
  await page.waitNoDialog();
  await page.waitConsole(/^Merged ana-work\.zip into 'Teacher' \(three-way, through the ancestor the contribution carries\): 2 file\(s\) written, 1 HDL file\(s\) made again from their drawings\. Undo Merge$/m);
  const said = await lines(page, start);
  assert.deepEqual(said.filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.ok(said.some((l) => /^Project "Teacher" had a contribution merged into it \(Merge Contribution\)/.test(l)), said.join('\n'));
  assert.equal(JSON.parse(await readWs(env, 'Teacher', FSM)).transitions[0].cond, 'night and req');
  assert.match(await readWs(env, 'Teacher', 'src/sevenseg.v'), /\/\/ ana\n$/);
  assert.equal(await readWs(env, 'Teacher', 'src/timer.vhd'), timer);
  // (the project read again after the merge's lines: waited for, #4257's CI)
  await page.waitFor(() => [window.Silinx.project?.trusted, window.Silinx.project?.madeBy].join() === 'false,merge', [], { what: 'the project untrusted by the merge' })
    .catch(async (e) => { assert.equal(await page.eval(() => [window.Silinx.project.trusted, window.Silinx.project.madeBy].join()), 'false,merge', e.message); throw e; });
  // Undo Merge: the project as it was
  await page.menu('Project', 'Undo Merge');
  await page.waitConsole(/^Undid the last merge of 'Teacher': 3 file\(s\) put back, 0 removed\.$/m);
  assert.deepEqual({ fsm: await readWs(env, 'Teacher', FSM), seven: await readWs(env, 'Teacher', 'src/sevenseg.v') }, before);
  await page.menu('Project', 'Undo Merge');
  await page.waitConsole(/^ERROR: Undo Merge: project 'Teacher': no merge to undo$/m);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.menu('Projeto', 'Juntar Contribuição…');
    await page.waitDialog('Juntar Contribuição');
    assert.match(await page.eval(() => document.querySelector('.dlg-overlay').innerText), /Pasta da contribuição:/);
    await page.setFiles(FILE, [back]);
    await page.dialogButton('Comparar');
    await page.waitFor(() => document.querySelector('.dlg-overlay .merge-files'), [], { what: 'a comparação' });
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .merge-summary').textContent), 'Através do antepassado comum: 3 ficheiro(s) diferem, 1 conflito(s) a escolher.');
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .merge-file[data-path="src/sevenseg.v"] .merge-state').textContent), 'Alterado lá: aceite');
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
});
