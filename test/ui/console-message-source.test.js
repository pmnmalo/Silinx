// UI: the console's typed message (#4749): each line holds its message, its source decided where it was written (a
// process's header and its lines, a line after its result the application's, a writer's own); the Errors / Warnings
// tabs list the entries of the sources the filter shows (their counts too), the entries the filter hides not bringing
// a tab forward when it changes, every one again under All; a line cleared away leaves the next one the
// application's. Both interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINK = 'module blink(input clk, output reg led);\n  always @(posedge clk) led <= ~led;\nendmodule\n';
const settled = (page) => page.eval(() => new Promise((r) => setTimeout(r, 120)));   // (the tabs drawn at most every 50 ms)
const rows = (page, tab) => page.eval((x) => [...document.querySelectorAll(`#console-${x} .diag`)].map((d) => d.textContent), tab);
const counts = (page) => page.eval(() => [document.getElementById('err-count').textContent, document.getElementById('warn-count').textContent]);
const filter = (page, src) => page.click(`#mc-filters .filt[data-src=${src}]`);

uiTest('#4749 each line\'s message and source; the Errors / Warnings tabs follow the console\'s filter', E, async (page) => {
  await makeProject(env, { name: 'MsgSrc', top: 'blink', files: { 'src/blink.v': BLINK } });
  await page.openProject('MsgSrc');
  await page.eval(() => import('/js/console.js').then((c) => {
    c.clearConsole();
    c.log('\nStarted : "Synthesize - XST".', 'hdr');
    c.logLine('ERROR:Xst:2585 - Port <led> of instance <u1> does not exist in definition <counter>.');
    c.log('Process "Synthesize - XST" failed', 'err');
    c.log('after its result', '');
    c.log('\nStarted : "Simulate Behavioral Model".', 'hdr');
    c.logLine('WARNING: the simulation stopped at 100 ns');
    c.log('Process "Simulate Behavioral Model" completed successfully', 'ok');
    c.appLog('INFO: an application\'s line', 'info');
  }));
  await settled(page);
  // each line's message: its source, severity and run
  const msgs = await page.eval(() => [...document.querySelectorAll('#console-log .ln')].filter((l) => l.textContent.trim()).map((l) => [l.message.source, l.message.severity, l.message.process, l.textContent.slice(0, 16)]));
  assert.deepEqual(msgs, [
    ['impl', 'header', 'Synthesize - XST', 'Started : "Synth'],
    ['impl', 'error', 'Synthesize - XST', 'ERROR:Xst:2585 -'],
    ['impl', 'error', 'Synthesize - XST', 'Process "Synthes'],
    ['app', 'text', null, 'after its result'],
    ['sim', 'header', 'Simulate Behavioral Model', 'Started : "Simul'],
    ['sim', 'warning', 'Simulate Behavioral Model', 'WARNING: the sim'],
    ['sim', 'ok', 'Simulate Behavioral Model', 'Process "Simulat'],
    ['app', 'info', null, 'INFO: an applica'],
  ]);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-log .ln')].filter((l) => l.textContent.trim()).map((l) => l.dataset.src)), ['impl', 'impl', 'impl', 'app', 'sim', 'sim', 'sim', 'app']);
  // All: every entry
  await filter(page, 'all');
  await settled(page);
  assert.deepEqual(await rows(page, 'errors'), ['ERROR:Xst:2585 - Port <led> of instance <u1> does not exist in definition <counter>.']);
  assert.deepEqual(await rows(page, 'warnings'), ['WARNING:Silinx - the simulation stopped at 100 ns']);
  assert.deepEqual(await counts(page), ['(1)', '(1)']);
  // Simulation: the synthesis's error not listed, nor counted; no tab brought forward by the change
  const before = await page.eval(() => document.querySelector('#console-tabs .tab.active')?.dataset.page);
  await filter(page, 'sim');
  await settled(page);
  assert.deepEqual(await rows(page, 'errors'), []);
  assert.deepEqual(await rows(page, 'warnings'), ['WARNING:Silinx - the simulation stopped at 100 ns']);
  assert.deepEqual(await counts(page), ['', '(1)']);
  assert.equal(await page.eval(() => document.querySelector('#console-tabs .tab.active')?.dataset.page), before);
  // Implementation: the error, not the warning
  await filter(page, 'impl');
  await settled(page);
  assert.deepEqual(await counts(page), ['(1)', '']);
  // an entry of no source (a check's): under every filter
  await page.eval(() => import('/js/console.js').then((c) => c.setDiagnostics([{ severity: 'warning', tool: 'HDLCompiler', message: 'unused signal x', file: 'src/blink.v', line: 2 }])));
  await settled(page);
  assert.deepEqual(await counts(page), ['(1)', '(1)']);
  await filter(page, 'all');
  await settled(page);
  assert.deepEqual(await counts(page), ['(1)', '(2)']);
  // cleared: the next line the application's, not the last process's
  await page.eval(() => import('/js/console.js').then((c) => { c.log('\nStarted : "Synthesize - XST".', 'hdr'); c.clearConsole(); c.log('a line after the clearing'); }));
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.message.source)), ['app']);
});
