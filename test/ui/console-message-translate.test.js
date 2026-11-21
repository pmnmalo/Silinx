// UI: the console's lines translated where they are drawn (#4749, step 5): an application's line (logError,
// logWarning, logInfo, a command's error, appLog) drawn in the interface's language, its tag kept, while its message's
// text stays English (what the followers and the MCP get); drawn again when the language changes, its button's label
// too; its entry of the Errors / Warnings tabs in the language, its message English; a tool's line never translated.
// Both interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINK = 'module blink(input clk, output reg led);\n  always @(posedge clk) led <= ~led;\nendmodule\n';
const settled = (page) => page.eval(() => new Promise((r) => setTimeout(r, 120)));   // (the tabs drawn at most every 50 ms)
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => [l.firstChild?.nodeValue ?? '', l.message.text]));
const rows = (page, tab) => page.eval((x) => [...document.querySelectorAll(`#console-${x} .diag`)].map((d) => d.textContent), tab);
const setLanguage = (page, l) => page.eval(async (x) => (await import('/js/i18n.js')).setLanguage(x), l);

uiTest('#4749 an application\'s line drawn in the language, its message English; drawn again when it changes; a tool\'s as it is', E, async (page) => {
  await makeProject(env, { name: 'MsgTr', top: 'blink', files: { 'src/blink.v': BLINK } });
  await page.openProject('MsgTr');
  await page.eval(() => document.querySelector('#mc-filters .filt[data-src=all]')?.click());
  await setLanguage(page, 'pt');
  try {
    const watched = await page.eval(() => import('/js/console.js').then((c) => {
      const got = [];
      const stop = c.onLogLine((line) => got.push(line));
      c.clearConsole();
      c.logInfo('No quick fix here.');
      c.logError('Use Ctrl+V to paste');
      c.commandWarning('Rename Project', 'No quick fix here.');
      c.appLog('Use Ctrl+V to paste', '', { action: { label: 'Trust Project', run: () => false } });
      c.logLine('WARNING:Xst:737 - Use Ctrl+V to paste');   // (a tool's line: never translated)
      stop();
      return got;
    }));
    await settled(page);
    const pt = [
      ['INFO: Não há aqui nenhuma correção rápida.', 'INFO: No quick fix here.'],
      ['ERROR: Use Ctrl+V para colar', 'ERROR: Use Ctrl+V to paste'],
      ['WARNING: Mudar o Nome do Projeto: Não há aqui nenhuma correção rápida.', 'WARNING: Rename Project: No quick fix here.'],
      ['Use Ctrl+V para colar', 'Use Ctrl+V to paste'],
      ['WARNING:Xst:737 - Use Ctrl+V to paste', 'WARNING:Xst:737 - Use Ctrl+V to paste'],
    ];
    assert.deepEqual(await lines(page), pt);
    // (the watchers, a follower's runs: the English)
    assert.deepEqual(watched, pt.map(([, en]) => en));
    assert.equal(await page.eval(() => document.querySelector('#console-log .ln-action').textContent), 'Confiar no Projeto');
    // the entries in the language, their messages English
    assert.deepEqual(await rows(page, 'errors'), ['ERROR:Silinx - Use Ctrl+V para colar']);
    assert.deepEqual(await rows(page, 'warnings'), ['WARNING:Silinx - Mudar o Nome do Projeto: Não há aqui nenhuma correção rápida.', 'WARNING:Xst:737 - Use Ctrl+V to paste']);
    assert.deepEqual(await page.eval(() => window.Silinx.diags.map((d) => d.message)), ['Use Ctrl+V to paste', 'Rename Project: No quick fix here.', 'Use Ctrl+V to paste']);
    // English again: every line drawn again from its English, its button too
    await setLanguage(page, 'en');
    await settled(page);
    assert.deepEqual(await lines(page), pt.map(([, en]) => [en, en]));
    assert.equal(await page.eval(() => document.querySelector('#console-log .ln-action').textContent), 'Trust Project');
    assert.deepEqual(await rows(page, 'errors'), ['ERROR:Silinx - Use Ctrl+V to paste']);
    // and Portuguese again
    await setLanguage(page, 'pt');
    await settled(page);
    assert.deepEqual(await lines(page), pt);
  } finally {
    await setLanguage(page, 'en');
  }
});
