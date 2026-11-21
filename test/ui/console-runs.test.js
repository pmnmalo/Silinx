// UI: a process's run (#4749, step 2: web/js/console.js startRun): its header, then every line it writes its own (its
// source, its run, its process) whatever else writes meanwhile; two runs at once keep their lines apart (a synthesis's
// under Implementation, a simulation's under Simulation), and the lines no run writes are not taken by the last
// header; a run's header written again drops the entries its last run listed; its end closes it. Both interfaces
// (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINK = 'module blink(input clk, output reg led);\n  always @(posedge clk) led <= ~led;\nendmodule\n';
const settled = (page) => page.eval(() => new Promise((r) => setTimeout(r, 120)));   // (the tabs drawn at most every 50 ms)
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].filter((l) => l.textContent.trim())
  .map((l) => [l.textContent, l.message.source, l.message.process]));

uiTest('#4749 two runs at once keep their lines apart; a run written again replaces its entries; its end closes it', E, async (page) => {
  await makeProject(env, { name: 'Runs2', top: 'blink', files: { 'src/blink.v': BLINK } });
  await page.openProject('Runs2');
  await page.eval(() => import('/js/console.js').then((c) => {
    c.clearConsole();
    const a = c.startRun({ process: 'Synthesize - XST', source: 'impl' });
    const b = c.startRun({ process: 'Simulate Behavioral Model', source: 'sim' });
    a.line('WARNING:Xst:647 - Input <sw> is never used.');
    b.log('Building simulation model for top \'tb\'...');
    a.line('ERROR:Xst:2585 - Port <led> does not exist.');
    c.log('a line of no run');
    b.end('Process "Simulate Behavioral Model" completed successfully', 'ok');
    a.end('Process "Synthesize - XST" failed', 'err');
    a.log('after its end: still its own (its writer said so)');
  }));
  await settled(page);
  assert.deepEqual(await lines(page), [
    ['Started : "Synthesize - XST".', 'impl', 'Synthesize - XST'],
    ['Started : "Simulate Behavioral Model".', 'sim', 'Simulate Behavioral Model'],
    ['WARNING:Xst:647 - Input <sw> is never used.', 'impl', 'Synthesize - XST'],
    ['Building simulation model for top \'tb\'...', 'sim', 'Simulate Behavioral Model'],
    ['ERROR:Xst:2585 - Port <led> does not exist.', 'impl', 'Synthesize - XST'],
    ['a line of no run', 'app', null],
    ['Process "Simulate Behavioral Model" completed successfully', 'sim', 'Simulate Behavioral Model'],
    ['Process "Synthesize - XST" failed', 'impl', 'Synthesize - XST'],
    ['after its end: still its own (its writer said so)', 'impl', 'Synthesize - XST'],
  ]);
  // its entries tagged with its run
  const entries = () => page.eval(() => window.Silinx.diags.filter((d) => d.source === 'console').map((d) => [d.severity, d.message, d.run, d.src]));
  assert.deepEqual(await entries(), [['warning', 'Input <sw> is never used.', 'Started : "Synthesize - XST"', 'impl'], ['error', 'Port <led> does not exist.', 'Started : "Synthesize - XST"', 'impl']]);
  // run again: its last run's entries dropped, its new ones listed
  await page.eval(() => import('/js/console.js').then((c) => {
    const a = c.startRun({ process: 'Synthesize - XST', source: 'impl' });
    a.line('WARNING:Xst:647 - Input <sw> is never used.');
    a.end('Process "Synthesize - XST" completed successfully with 1 warning(s)', 'ok');
  }));
  await settled(page);
  assert.deepEqual(await entries(), [['warning', 'Input <sw> is never used.', 'Started : "Synthesize - XST"', 'impl']]);
  // the Simulation filter: the synthesis's lines hidden, the simulation's and the application's shown
  await page.click('#mc-filters .filt[data-src=sim]');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-log .ln:not(.mc-off)')].filter((l) => l.textContent.trim()).map((l) => l.message.source)),
    ['sim', 'sim', 'app', 'sim']);
  await page.click('#mc-filters .filt[data-src=all]');
});
