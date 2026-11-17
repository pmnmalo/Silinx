// UI: a module with errors outside the top's hierarchy (#4421): Check Syntax still says its error, but Synthesize (the
// Silinx toolchain), the Board Emulator and the test bench's simulation run, the file left out with a warning; a module
// with errors inside the hierarchy still stops them. The exact warnings and errors. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BROKEN = `library ieee;
use ieee.std_logic_1164.all;
entity broken is
  port (a : in std_logic; y : out std_logic);
end broken;
architecture rtl of broken is
begin
  y <= a and ;
end rtl;
`;
const ERROR = 'ERROR:HDLCompiler - "src/broken.vhd" Line 8: expected expression but found \';\'';
const leftOut = top => `WARNING:Silinx - "src/broken.vhd": not in the hierarchy of the top module '${top}': left out, its 1 error not checked (Check Syntax shows them)`;
// the console's warnings and errors from its line `from` on
const problems = async (page, from) => (await page.consoleText()).split('\n').slice(from).filter(l => /^(WARNING|ERROR)/.test(l));

async function open(page, name, files) {
  await makeProject(env, { name, template: 'blinky', files });
  const pj = await env.server.api('GET', `/api/projects/${name}`);
  delete pj.fileTree;
  await env.server.api('PUT', `/api/projects/${name}`, { ...pj, synthTool: 'silinx' });   // (the Silinx toolchain: no ISE here)
  await page.openProject(name);
}
const lines = async page => (await page.consoleText()).split('\n').length;

uiTest('#4421 a broken module outside the top\'s hierarchy: Check Syntax says its error; Synthesize, the Board Emulator and the simulation run, the module left out', E, async (page) => {
  await open(page, 'Outside', { 'src/broken.vhd': BROKEN });
  // Check Syntax as before: every file's errors
  let from = await lines(page);
  await page.eval(async () => (await import('/js/processes.js')).checkSyntax('top'));
  await page.waitConsole(/Process "Check Syntax" failed \(1 error\(s\), 0 warning\(s\)\)/);
  assert.deepEqual(await problems(page, from), [ERROR]);
  // Synthesize: its Check Syntax the hierarchy's, the warning; the Silinx toolchain's synthesis leaves the file out too
  from = await lines(page);
  await page.eval(async () => (await import('/js/implement.js')).runImpl('top', ['synth']));
  await page.waitFor(() => ['ok', 'warn', 'err'].includes(window.SilinxApp.S.status.synth), [], { what: 'the synthesis done', timeout: 300000 });
  const synth = await problems(page, from);
  assert.deepEqual([await page.eval(() => window.SilinxApp.S.status.synth), synth], ['warn', [leftOut('top'),
    'WARNING: src/broken.vhd is not in the hierarchy of the top module \'top\': left out, its 1 error not checked (Check Syntax shows them)']]);
  // the Board Emulator runs
  from = await lines(page);
  await page.eval(async () => (await import('/js/viewers.js')).openEmulator('top', { quiet: true }));
  await page.waitFor(() => window.SilinxApp.findDoc('emulator')?.view?.outputs, [], { what: 'the emulator running', timeout: 60000 });
  assert.deepEqual(await problems(page, from), [leftOut('top')]);
  // the test bench's simulation runs: its hierarchy, the test bench's
  from = await lines(page);
  await page.eval(() => window.SilinxApp.runSimulation('tb_top'));
  await page.waitFor(() => !!window.SilinxApp.findDoc('isim:tb_top'), [], { what: 'the simulation open', timeout: 60000 });
  assert.deepEqual(await problems(page, from), [leftOut('tb_top')]);
});

uiTest('#4421 a broken module inside the top\'s hierarchy still stops Synthesize and the Board Emulator', E, async (page) => {
  const knight = fs.readFileSync(path.join(ROOT, 'examples/blinky/src/knight.vhd'), 'utf8').replace(/end\s+Behavioral\s*;\s*$/i, 'x <= ;\n$&');
  await open(page, 'Inside', { 'src/broken.vhd': BROKEN, 'src/knight.vhd': knight });
  let from = await lines(page);
  await page.eval(async () => (await import('/js/implement.js')).runImpl('top', ['synth']));
  await page.waitConsole(/Process "[^"]+" stopped: Check Syntax found errors/);
  const synth = await problems(page, from);
  assert.ok(synth.some(l => /^ERROR:HDLCompiler - "src\/knight\.vhd" Line \d+: /.test(l)), synth.join('\n'));
  assert.ok(synth.includes(leftOut('top')) && !synth.includes(ERROR), synth.join('\n'));
  from = await lines(page);
  await page.eval(async () => (await import('/js/viewers.js')).openEmulator('top', { quiet: true }));
  await page.waitConsole(/Process "Check Syntax" failed/);
  assert.equal(await page.eval(() => !!window.SilinxApp.findDoc('emulator')), false);
});
