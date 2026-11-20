// UI: Set as Top Module's rule (#4733, core/project-entries.js topRefusal, the MCP's set_top's): a module with errors is
// set (Check Syntax says them); a name no source of the view declares refused with the MCP's words, in the console, the
// top unchanged; a test bench is no top of the Implementation view. The console's lines: that one error alone.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const problems = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l));
const setTop = (page, mod, sim) => page.eval(async (m, s) => (await import('/js/design.js')).setTop(m, s), mod, sim);

uiTest('#4733 Set as Top Module: a module with errors set; a name no source declares refused, the MCP\'s words', E, async (page) => {
  await makeProject(env, { name: 'TopRule', top: 'good', files: {
    'src/good.vhd': 'entity good is port (y : out bit); end;\narchitecture a of good is begin y <= \'1\'; end;\n',
    'src/bad.vhd': 'entity bad is port (y : out bit); end;\narchitecture a of bad is begin y <= nope; end;\n',
    'sim/tb_good.vhd': 'entity tb_good is end;\narchitecture a of tb_good is begin end;\n' } });
  await page.openProject('TopRule');
  await page.waitFor(() => window.Silinx.modules?.some((m) => m.name === 'bad'), [], { what: 'the modules' });
  await setTop(page, 'bad', false);
  await page.waitConsole(/^Top-level module set to 'bad'\.$/m).catch(async (e) => { throw new Error(`${e.message}\n${await page.consoleText()}`); });
  assert.equal((await env.server.api('GET', '/api/projects/TopRule')).top, 'bad');
  await setTop(page, 'nothere', false);
  await page.waitConsole(/^ERROR: Set as Top Module: no entity or module 'nothere' in the project's design sources\.$/m);
  await setTop(page, 'tb_good', false);
  await page.waitConsole(/^ERROR: Set as Top Module: no entity or module 'tb_good' in the project's design sources\.$/m);
  await setTop(page, 'tb_good', true);
  await page.waitConsole(/^Top-level simulation module set to 'tb_good'\.$/m);
  const pj = await env.server.api('GET', '/api/projects/TopRule');
  assert.deepEqual([pj.top, pj.simTop], ['bad', 'tb_good']);
  assert.deepEqual(await problems(page), [
    "ERROR: Set as Top Module: no entity or module 'nothere' in the project's design sources.",
    "ERROR: Set as Top Module: no entity or module 'tb_good' in the project's design sources.",
  ]);
});
