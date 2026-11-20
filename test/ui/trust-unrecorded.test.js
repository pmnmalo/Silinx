// UI: a project folder put in the workspace by hand (#4735: unzipped by the system, cloned with command-line git…),
// which Silinx has no trust record of, opened in the local server's interface, in both interfaces: the console says
// when it opens that it was not made in Silinx nor trusted, with its Trust Project button, whatever its silinx.json
// says (trusted: true); the button asks, Yes trusts it (recorded: the server says so, the line no longer said when it
// opens again). A project made with New Project is trusted from the start (no line). No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const NAME = 'Unzipped';
const NOTICE = `Project "${NAME}" was not made in Silinx nor trusted here (its folder reached the workspace outside Silinx): it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it.`;
const trustLines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln-trust')].map((b) => [b.parentElement.firstChild.textContent, b.textContent, !b.disabled]));
const problems = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)/.test(l));

uiTest('#4735 a project folder put in the workspace by hand: untrusted when it opens, its Trust Project button; trusted, recorded; New Project\'s trusted', E, async (page) => {
  // (a project the user makes first: recorded; the records made, a folder put there afterwards has none)
  await env.server.api('POST', '/api/projects', { name: 'Made', template: 'blinky' });
  assert.equal((await env.server.api('GET', '/api/projects/Made')).trusted, undefined);
  const dir = path.join(env.server.workspace, NAME);
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'src', 'top.vhd'), 'library ieee;\nuse ieee.std_logic_1164.all;\nentity top is port (a : in std_logic; y : out std_logic); end;\narchitecture rtl of top is begin y <= a; end;\n');
  await fs.writeFile(path.join(dir, 'silinx.json'), JSON.stringify({ name: NAME, version: 1, top: 'top', board: 'basys2-250', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, files: [{ path: 'src/top.vhd', lang: 'vhdl', role: 'design' }], trusted: true }, null, 2));
  assert.deepEqual([(await env.server.api('GET', `/api/projects/${NAME}`)).trusted, (await env.server.api('GET', `/api/projects/${NAME}`)).madeBy], [false, 'unrecorded']);
  await page.openProject(NAME);
  await page.waitFor(() => !!document.querySelector('#console-log .ln-trust'), [], { what: 'the line with its button' });
  assert.deepEqual(await trustLines(page), [[NOTICE, 'Trust Project', true]]);
  await page.eval(() => [...document.querySelectorAll('#console-log .ln-trust')].at(-1).click());
  await page.waitDialog('Trust Project');
  await page.dialogButton('Yes');
  await page.waitNoDialog();
  await page.waitFor(() => document.querySelector('#console-log .ln-trust').disabled, [], { what: 'the button disabled once trusted' });
  await page.waitConsole(new RegExp(`^Project "${NAME}" trusted: Xilinx ISE and programming a board or a PROM may run for it\\.$`, 'm'));
  assert.equal((await env.server.api('GET', `/api/projects/${NAME}`)).trusted, undefined);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'silinx.json'), 'utf8')).trusted, undefined, 'its trust is the record, not its silinx.json');
  // opened again: no line; New Project's project: none either
  await page.openProject('Made');
  await page.openProject(NAME);
  await page.waitFor((n) => window.Silinx.project?.name === n, [NAME]);
  assert.equal((await trustLines(page)).length, 1);
  assert.deepEqual(await problems(page), []);
}, { timeout: 120000 });
