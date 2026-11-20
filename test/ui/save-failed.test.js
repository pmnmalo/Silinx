// UI (#4722): a document that cannot be saved stops what saves the open documents first (web/js/processes.js
// saveAll): the editor's Check Syntax and the Processes pane's run nothing on the older file on disk, an ERROR line
// naming the document, its changes kept; saved again, they run on the document's text. Both interfaces; the console's
// warnings and errors asserted, no browser warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';

const OLD = 'module top(input a, input b, output y);\n  assign y = a & b;\nendmodule\n';
const NEW = 'module top(input a, input b, output y);\n  assign y = a & c;\nendmodule\n';   // (an error: c undeclared)
const FAILED = 'ERROR: cannot save src/top.v: the disk is full. Your changes are kept and saved as soon as it is possible again.';
const STOPPED = 'ERROR: src/top.v could not be saved: stopped, so as not to use the older file on disk';
const lines = async (page, re) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => re.test(l));
const started = (page) => page.eval(() => window.__console().split('Started : "Check Syntax"').length - 1);

uiTest('#4722 a document that cannot be saved: Check Syntax stops with an ERROR naming it, nothing run on the older file', E, async (page) => {
  await makeProject(env, { name: 'SaveFail', top: 'top', files: { 'src/top.v': OLD } });
  await page.openProject('SaveFail');
  await page.eval(() => window.SilinxApp.openFile('src/top.v'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.v' && window.Silinx.active.editor, [], { what: 'the editor' });
  // the server refuses every write; an edit, its autosave held back
  await page.eval(async () => {
    const { api } = await import('/js/api.js');
    window.__writeFile = api.writeFile;
    api.writeFile = async () => { throw new Error('the disk is full'); };
    const d = window.Silinx.active;
    d.editor.setValue(d.editor.getValue().replace('a & b', 'a & c'));
    clearTimeout(d._autosave);
  });
  const before = await started(page);
  // the editor's Check Syntax: stopped, not started
  await page.click(`${D} .editor-bar .btn`, { text: 'Check Syntax' });
  await page.waitFor((m) => window.__console().includes(m), [STOPPED], { what: 'the stop' });
  assert.equal(await started(page), before);
  assert.deepEqual(await lines(page, /^(WARNING|ERROR)/), [FAILED, STOPPED]);
  // the Processes pane's Check Syntax: the same, its status failed
  assert.equal(await page.eval(async () => (await import('/js/processes.js')).checkSyntax('top')), false);
  assert.equal(await started(page), before);
  assert.deepEqual(await lines(page, /^(WARNING|ERROR)/), [FAILED, STOPPED, STOPPED]);
  // the document and its changes kept, the file on disk the old one
  assert.equal(await page.eval(() => window.Silinx.active.dirty && window.Silinx.active.editor.getValue()), NEW);
  assert.equal(await readWs(env, 'SaveFail', 'src/top.v'), OLD);
  // the server writes again: Check Syntax saves the document, then checks its text (its error)
  await page.eval(async () => { const { api } = await import('/js/api.js'); api.writeFile = window.__writeFile; });
  await page.click(`${D} .editor-bar .btn`, { text: 'Check Syntax' });
  await page.waitFor((k) => window.__console().split('Started : "Check Syntax"').length - 1 > k && /Process "Check Syntax" (completed|failed)[^\n]*$/.test(window.__console().trimEnd()), [before], { what: 'Check Syntax done' });
  assert.equal(await readWs(env, 'SaveFail', 'src/top.v'), NEW);
  assert.equal(await page.eval(() => window.Silinx.active.dirty), false);
  assert.ok((await lines(page, /^src\/top\.v saved\.$/)).length === 1);
  const after = (await lines(page, /^(WARNING|ERROR)/)).slice(3);
  assert.ok(after.length > 0 && after.every((l) => /^ERROR:.*\bc\b/.test(l)), after.join('\n'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
