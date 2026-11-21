// UI: the check of an HDL file as one types (#4773), in a Web Worker (web/js/hdl-check-worker.js): its markers in the
// editor; a file that does not read shows its parse errors only (no elaboration of a half-typed file), then, read
// again, its elaboration's; Check Syntax still elaborates it.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = `module top(input clk, input [3:0] sw, output [3:0] led);
  reg [3:0] r = 0;
  always @(posedge clk) r <= sw;
  assign led = r;
endmodule
`;
// the lines the editor marks as errors
const marked = page => page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .cm-lint-marker-error')].length);
const setText = (page, text) => page.eval(t => { window.Silinx.active.editor.setValue(t); }, text);
// the editor's diagnostics once the check of its text answered: [line, severity, message] (the parser's markers and
// the check's, as the page's former check gave them: test/hdl-check.test.js)
const diagsOf = async (page, want, what) => {
  await page.waitFor(w => JSON.stringify(window.Silinx.active.editor.diagnostics().map(d => [d.line, d.severity, d.message])) === w, [JSON.stringify(want)], { what });
  assert.deepEqual(await page.eval(() => window.Silinx.active.editor.diagnostics().map(d => [d.line, d.severity, d.message])), want, what);
};

uiTest('live check: in a Web Worker; a file that does not read: its parse errors only; read again: its elaboration\'s', E, async (page) => {
  await makeProject(env, { name: 'LivePj', top: 'top', board: 'basys2', files: { 'src/top.v': TOP } });
  // the workers the page starts, by their script
  await page.eval(() => {
    window.__workers = [];
    const W = window.Worker;
    window.Worker = class extends W { constructor(url, opts) { super(url, opts); window.__workers.push(String(url)); } };
  });
  await page.openProject('LivePj');
  await page.eval(() => window.SilinxApp.openFile('src/top.v'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.v' && window.Silinx.active.editor);
  // an undeclared name (an elaboration's error) and a line that does not read
  await setText(page, TOP.replace('assign led = r;', 'assign led = rr;\n  assign = ;'));
  await page.waitFor(() => document.querySelectorAll('.doc:not([hidden]) .cm-lint-marker-error').length > 0, [], { what: 'the parse error marked' });
  await new Promise(r => setTimeout(r, 1200));   // (the check's delay and its answer: the elaboration's error would be there)
  assert.equal(await marked(page), 1, 'the line that does not read only');
  await diagsOf(page, [[5, 'error', "expected identifier but found '='"]], 'its parse error only');
  // the line removed: the file reads, elaborated: the undeclared name marked
  await setText(page, TOP.replace('assign led = r;', 'assign led = rr;'));
  await page.waitFor(() => window.Silinx.active.editor.getValue().includes('rr;') && document.querySelectorAll('.doc:not([hidden]) .cm-lint-marker-error').length === 1, [], { what: 'the undeclared name marked' });
  await diagsOf(page, [[4, 'error', "'rr' is not declared"]], 'the elaboration\'s error');
  // the design checks' warnings, as before: a signal never used, an input never used
  await setText(page, TOP.replace('assign led = r;', 'assign led = sw[2:0];'));
  await diagsOf(page, [[2, 'warning', 'Signal <r> is assigned but never used. This unconnected signal will be trimmed during the optimization process.']], 'a signal never used');
  await setText(page, TOP.replace('always @(posedge clk) r <= sw;', 'always @(posedge clk) r <= 0;'));
  await diagsOf(page, [[1, 'warning', 'Input <sw> is never used.']], 'an input never used');
  // the check ran in the worker, started once
  assert.deepEqual((await page.eval(() => window.__workers)).filter(u => /hdl-check-worker\.js$/.test(u)).length, 1);
  // fixed: no marker
  await setText(page, TOP);
  await page.waitFor(() => document.querySelectorAll('.doc:not([hidden]) .cm-lint-marker-error').length === 0, [], { what: 'no marker' });
  await diagsOf(page, [], 'no warnings');
  // Check Syntax still elaborates a file that does not read: both errors in the console
  await setText(page, TOP.replace('assign led = r;', 'assign led = rr;\n  assign = ;'));
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitConsole(/Process "Check Syntax" failed \(2 error\(s\), 0 warning\(s\)\)/);
  await page.waitConsole(/'rr' is not declared/);
});
