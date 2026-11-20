// UI: messages in the console, not in a modal box (#4747, docs/UI-GUIDELINES.md). A command's failure or refusal an
// ERROR line of the console (`ERROR: <command>: <message>`) and an entry of the Errors tab in front, no dialog, in
// English and in Portuguese; a list of a design's errors a line each; a wizard's last check (what it makes, made) said
// in the wizard, which stays open, never in a second box after it closed; Import Project's missing files said in its
// dialog. Both interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINK = 'module blink(input clk, output reg led);\n  always @(posedge clk) led <= ~led;\nendmodule\n';
const settled = (page) => page.eval(() => new Promise((r) => setTimeout(r, 120)));   // (the tabs drawn at most every 50 ms)
const errLines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln.err')].map((l) => l.textContent));
const clear = (page) => page.eval(() => import('/js/console.js').then((c) => c.clearConsole()));
const front = (page) => page.eval(() => document.querySelector('#console-tabs .tab.active')?.dataset.page);
const setLang = (page, l) => page.eval(async (y) => { (await import('/js/i18n.js')).setLanguage(y); }, l);

uiTest('#4747 a command\'s failure and refusal in the console, its Errors tab in front, no dialog; in Portuguese too', E, async (page) => {
  await makeProject(env, { name: 'NoBoxPj', top: 'blink', files: { 'src/blink.v': BLINK } });
  await page.openProject('NoBoxPj');
  // a refusal: Open Project while an implementation runs
  await clear(page);
  await page.eval(async () => { window.Silinx.busy = true; try { await window.SilinxApp.openProject('NoBoxPj'); } finally { window.Silinx.busy = false; } });
  await settled(page);
  assert.equal(await page.dialogCount(), 0);
  assert.deepEqual(await errLines(page), ['ERROR: Open Project: An implementation is running: stop it (or wait for it to finish) first.']);
  assert.equal(await front(page), 'errors');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-errors .diag')].map((d) => d.textContent)),
    ['ERROR:Silinx - Open Project: An implementation is running: stop it (or wait for it to finish) first.']);
  // a failure: a module that is no state machine converted to a state diagram, its error on the same line
  await clear(page);
  await page.eval(() => import('/js/drawings.js').then((d) => d.convertToFsm('blink')));
  await settled(page);
  assert.equal(await page.dialogCount(), 0);
  const [line] = await errLines(page);
  assert.match(line, /^ERROR: Convert to State Diagram: 'blink' cannot be shown as a state diagram: \S/);
  assert.equal((await errLines(page)).length, 1, 'one line');
  // in Portuguese: the command's name and the message translated apart
  await setLang(page, 'pt');
  try {
    await clear(page);
    await page.eval(() => import('/js/drawings.js').then((d) => d.convertToFsm('blink')));
    await settled(page);
    assert.match((await errLines(page))[0], /^ERROR: Converter para Diagrama de Estados: 'blink' não pode ser representado como diagrama de estados: \S/);
  } finally { await setLang(page, 'en'); }
  // a list of errors: a line each
  await clear(page);
  await page.eval(() => import('/js/console.js').then((c) => c.commandError('Set as Top Module', ['x.sch.json cannot be the top yet:', 'the net n1 has no driver', 'the input a of g1 is not connected'])));
  assert.deepEqual(await errLines(page), ['ERROR: Set as Top Module: x.sch.json cannot be the top yet:', 'ERROR: Set as Top Module: the net n1 has no driver',
    'ERROR: Set as Top Module: the input a of g1 is not connected']);
  assert.equal(await page.dialogCount(), 0);
});

uiTest('#4747 a wizard\'s last check said in the wizard, which stays open; Import Project\'s missing files in its dialog', E, async (page) => {
  await makeProject(env, { name: 'WizPj', top: 'blink', files: { 'src/blink.v': BLINK } });
  await page.openProject('WizPj');
  await clear(page);
  // a wizard whose Finish makes what it makes: refused once (its error in the wizard), then made
  await page.eval(() => import('/js/wizards.js').then((w) => {
    let n = 0;
    window.__wiz = w.wizard('Test Wizard', [{ title: 'One', render: () => document.createElement('div') }],
      { finish: () => { if (n++ === 0) throw new Error('the name x is used twice'); return null; } });
  }));
  await page.waitDialog('Test Wizard');
  await page.dialogButton('Finish');
  await page.waitFor(() => /the name x is used twice/.test(document.querySelector('.dlg-overlay .wiz')?.parentElement.textContent || ''), [], { what: 'the error in the wizard' });
  assert.equal(await page.dialogCount(), 1, 'the wizard still open, no second box');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => window.__wiz), true);
  assert.deepEqual(await errLines(page), []);
  // Import Project with nothing picked: said in its dialog, which stays open
  await page.eval(() => { import('/js/project-zip-dialogs.js').then((m) => m.importProjectDialog()); });
  await page.waitDialog('Import Project');
  await page.dialogButton('Import');
  await page.waitFor(() => /^Select the project folder/.test([...document.querySelectorAll('.dlg-overlay .dlg-body > div > .hint')].pop()?.textContent || ''), [], { what: 'what is missing, in the dialog' });
  assert.equal(await page.dialogCount(), 1);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(await errLines(page), []);
});
