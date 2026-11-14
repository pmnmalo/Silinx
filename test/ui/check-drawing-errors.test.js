// UI: Check Syntax (Check Design in a design and simulation project) of a drawing that makes no module (#3934): a state
// diagram with two states of one name and no HDL file yet, the top: its errors on the drawing, the fix, no "top module
// not found"; in an FPGA project and in a design project; the Errors tab; the exact errors. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BAD = (() => { const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8')); m.states[1].name = m.states[0].name; return JSON.stringify(m); })();
const WHY = 'Two states are named \'CARS\' (letter case does not count)';

for (const [kind, label, error] of [
  [undefined, 'Check Syntax', `ERROR:Silinx - "src/traffic.fsm.json": its HDL cannot be made: ${WHY}. Fix src/traffic.fsm.json (its HDL is then made).`],
  ['design', 'Check Design', `ERROR:Silinx - "src/traffic.fsm.json": its module is not made: ${WHY}. Fix src/traffic.fsm.json.`],
]) {
  uiTest(`#3934 ${label} of a drawing that makes no module (${kind ? 'a design project' : 'an FPGA project'}): its errors on the drawing, no "top module not found"`, E, async (page) => {
    const name = kind ? 'BadDrawn' : 'BadFpga';
    await makeProject(env, { name, kind, files: { 'src/traffic.fsm.json': BAD }, top: 'traffic' });
    await page.openProject(name);
    await page.waitFor(() => window.SilinxApp.S.failedDrawings?.length === 1, [], { what: 'the drawing that makes no module' });
    await page.eval(async () => (await import('/js/processes.js')).checkSyntax('traffic'));
    await page.waitConsole(/Process "Check (Syntax|Design)" failed/);
    const lines = (await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR/.test(l));
    assert.deepEqual(lines, [error]);
    assert.ok((await page.consoleText()).includes(`Process "${label}" failed (1 error(s), 0 warning(s))`));
    // the Errors tab: the drawing, no line
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-errors .diag .loc')].map((e) => e.textContent)), ['"src/traffic.fsm.json"']);
  });
}
