// UI: Check Design's lines under the console's Design filter (#4716): in a design and simulation project Check Syntax is
// Check Design (Verificar Projeto), whose header web/js/messages.js's sourceOf took for Implementation's, its lines shown
// under All only. With Design picked (Projeto in Portuguese), Check Design run after another process's header: every
// line of it shown under Design, the filter left as it is, the other process's header hidden; no warnings. Both
// interfaces, English and Portuguese.
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
// the console's lines: [text, source, shown]
const consoleLines = (page) => page.eval(() => [...document.getElementById('console-log').children].filter((l) => l.textContent.trim())
  .map((l) => [l.textContent.trim(), l.dataset.src, !l.classList.contains('mc-off')]));
const pressed = (page) => page.eval(() => [...document.querySelectorAll('#mc-filters .filt')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent));

for (const lang of ['en', 'pt']) {
  uiTest(`#4716 Check Design's lines under the Design filter (${lang})`, E, async (page) => {
    const name = `CheckDesign${lang}`;
    await makeProject(env, { name, kind: 'design', files: { 'src/traffic.fsm.json': FSM }, top: 'traffic' });
    await page.openProject(name);
    await page.waitFor(() => window.Silinx.hdlToSch?.['src/traffic.vhd'] === 'src/traffic.fsm.json', [], { what: 'the drawing\'s HDL' });
    if (lang === 'pt') await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
    // another process's header (the lines after it its process's), then Design picked
    await page.eval(() => window.SilinxApp.log('Started : "Synthesize - XST".'));
    await page.click('#mc-filters .filt[data-src=check]');
    const design = lang === 'pt' ? 'Projeto' : 'Design';
    assert.deepEqual(await pressed(page), [design]);
    const before = (await consoleLines(page)).length;
    await page.eval(async () => (await import('/js/processes.js')).checkSyntax('traffic'));
    await page.waitConsole(/Process "Check Design" completed successfully/);
    const run = (await consoleLines(page)).slice(before);
    assert.deepEqual(run, [
      ['Started : "Check Design".', 'check', true],
      ['Checking drawing "src/traffic.fsm.json"', 'check', true],
      ['Checking top module <traffic>: 8 signals, 3 processes.', 'check', true],
      ['Process "Check Design" completed successfully', 'check', true],
    ]);
    assert.deepEqual(await pressed(page), [design]);   // (the filter left on Design, not turned to Implementation)
    assert.deepEqual((await consoleLines(page)).filter(([t]) => t === 'Started : "Synthesize - XST".'), [['Started : "Synthesize - XST".', 'impl', false]]);
    assert.deepEqual((await consoleLines(page)).filter(([t]) => /^(WARNING|ERROR)/.test(t)), []);
  });
}
