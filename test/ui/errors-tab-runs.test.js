// UI: the Errors tab lists each run's errors once (#4728). A drawing's Check (web/js/tasks-check.js: a schematic's Check,
// its Try it) run again replaces its own entries: an error fixed and checked again leaves the tab empty, the same error
// checked twice is listed once, another run's entries stay. An implementation stopped by Check Syntax's errors lists
// those errors only (its "Process … stopped" line no entry). A refusal said twice is listed once. Both interfaces
// (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINK = 'module blink(input clk, output reg led);\n  always @(posedge clk) led <= ~led;\nendmodule\n';
const BAD = 'module blink(input clk, output reg led);\n  always @(posedge clk) led <= ~nothing;\nendmodule\n';
const rows = (page, tab = 'errors') => page.eval((t) => [...document.querySelectorAll(`#console-${t} .diag`)].map((d) => d.textContent), tab);
const settled = (page) => page.eval(() => new Promise((r) => setTimeout(r, 120)));   // (the tabs drawn at most every 50 ms)
// a drawing's Check that found `diags`, as the schematic editor says it (web/js/sch-try.js showDiags)
const check = (page, what, name, diags) => page.eval((w, n, d) => {
  document.getElementById('workspace').dispatchEvent(new CustomEvent('silinx-diagnostics', { bubbles: true, detail: { what: w, name: n, diags: d, focus() {} } }));
}, what, name, diags);

uiTest('#4728 a drawing\'s Check run again replaces its own entries: fixed, the tab empty; twice, listed once; another run\'s kept', E, async (page) => {
  await makeProject(env, { name: 'RunsPj', top: 'blink', files: { 'src/blink.v': BLINK } });
  await page.openProject('RunsPj');
  const ERR = { severity: 'error', message: 'The input a of g1 is not connected' };
  const WARN = { severity: 'warning', message: 'The net n3 drives nothing' };
  await check(page, 'Check Schematic', 'gates', [ERR, WARN]);
  await check(page, 'Check Schematic', 'gates', [ERR, WARN]);   // (checked again, nothing changed)
  await settled(page);
  assert.deepEqual(await rows(page), ['ERROR:Silinx - The input a of g1 is not connected']);
  assert.deepEqual(await rows(page, 'warnings'), ['WARNING:Silinx - The net n3 drives nothing']);
  // another drawing's Check: its own entries beside
  await check(page, 'Check Schematic', 'adder', [{ severity: 'error', message: 'The output s of x1 drives two nets' }]);
  // fixed and checked again: the first drawing's entries gone, the other's kept
  await check(page, 'Check Schematic', 'gates', []);
  await settled(page);
  assert.deepEqual(await rows(page), ['ERROR:Silinx - The output s of x1 drives two nets']);
  assert.deepEqual(await rows(page, 'warnings'), []);
  await check(page, 'Check Schematic', 'adder', []);
  await settled(page);
  assert.deepEqual(await rows(page), []);
  assert.match(await page.eval(() => document.getElementById('console-errors').textContent), /^No messages\.$/);
});

uiTest('#4728 an implementation stopped by Check Syntax: its errors listed once, its "stopped" line no entry; a refusal said twice listed once', E, async (page) => {
  await makeProject(env, { name: 'StopPj', top: 'blink', files: { 'src/blink.v': BAD } });
  await page.openProject('StopPj');
  await page.eval(async () => (await import('/js/processes.js')).checkSyntax('blink'));
  await page.waitConsole(/Process "Check Syntax" failed/);
  await settled(page);
  const checked = await rows(page);
  assert.equal(checked.length, 1, JSON.stringify(checked));
  assert.match(checked[0], /nothing/);
  await page.eval(async () => (await import('/js/implement.js')).runImpl('blink', ['synth']));
  await page.waitConsole(/Process "Synthesize - [^"]+" stopped: Check Syntax found errors/);
  await settled(page);
  assert.deepEqual(await rows(page), checked);
  // a busy refusal, twice: one entry
  const busy = () => page.eval(async () => { window.Silinx.busy = true; try { return await (await import('/js/implement.js')).runImpl('blink', ['synth']); } finally { window.Silinx.busy = false; } });
  await busy();
  await busy();
  await settled(page);
  assert.deepEqual((await rows(page)).filter((r) => /already running/.test(r)), ['ERROR:Silinx - An implementation is already running (use Stop to cancel it)']);
  assert.equal((await rows(page)).length, 2);
});
