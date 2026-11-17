// The MCP server's runs of the top (#4421, #2674: what the interface does): a module with errors outside the top's
// hierarchy (a file nothing instantiates) does not stop run_process (the Silinx toolchain) nor simulate, a warning saying
// it is left out; one inside still does; check_syntax still says every file's errors.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-top-hierarchy-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

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
const LEFT_OUT = 'src/broken.vhd is not in the hierarchy of the top module \'top\': left out, its 1 error not checked (Check Syntax shows them)';

test('blinky with a broken module outside its hierarchy: synthesized and simulated, the module left out with a warning; check_syntax still says its error (#4421)', { timeout: 600000 }, async () => {
  await ok('new_project_from_example', { name: 'outside', example: 'blinky' });
  await ok('write_file', { project: 'outside', path: 'src/broken.vhd', text: BROKEN });
  const run = await ok('run_process', { project: 'outside', process: 'synthesize', toolchain: 'silinx' });
  assert.deepEqual([run.data.ok, run.data.errors, run.data.warnings], [true, [], [`WARNING: ${LEFT_OUT}`]]);
  assert.ok(!run.data.log.some(l => /broken/.test(l) && !/^WARNING/.test(l)), 'the file is not parsed');
  // the test bench's simulation: its hierarchy only (tb_top, then top's), the same warning
  const sim = await ok('simulate', { project: 'outside', time_ns: 100, signals: [] });
  assert.deepEqual([sim.data.started, sim.data.failed, sim.data.warnings], [true, false,
    [{ severity: 'warning', file: 'src/broken.vhd', line: 0, col: 0, tool: 'Silinx', message: 'not in the hierarchy of the top module \'tb_top\': left out, its 1 error not checked (Check Syntax shows them)' }]]);
  // Check Syntax as it was: every file's errors
  const chk = await call('check_syntax', { project: 'outside' });
  assert.deepEqual(chk.data.errors.map(e => [e.file, e.line, e.message]), [['src/broken.vhd', 8, 'expected expression but found \';\'']]);
});

test('blinky with a broken module inside its hierarchy: synthesis and simulation still stop on its error (#4421)', { timeout: 600000 }, async () => {
  await ok('new_project_from_example', { name: 'inside', example: 'blinky' });
  await ok('write_file', { project: 'inside', path: 'src/broken.vhd', text: BROKEN });
  const knight = fs.readFileSync(path.join(P.projectDir('inside'), 'src/knight.vhd'), 'utf8');
  await ok('write_file', { project: 'inside', path: 'src/knight.vhd', text: knight.replace(/end\s+(architecture\s+)?\w*\s*;\s*$/i, 'x <= ;\n$&') });
  const run = await call('run_process', { project: 'inside', process: 'synthesize', toolchain: 'silinx' });
  assert.equal(run.isError, true, run.text);
  assert.deepEqual(run.data.warnings, [`WARNING: ${LEFT_OUT}`]);
  assert.ok(run.data.errors.includes('ERROR:Silinx - the design has errors'), run.text);
  assert.ok(run.data.log.some(l => /src\/knight\.vhd:\d+ /.test(l)) && !run.data.log.some(l => /src\/broken\.vhd:\d+ /.test(l)), run.text);
  const sim = await call('simulate', { project: 'inside', time_ns: 100, signals: [] });
  assert.equal(sim.isError, true, sim.text);
  assert.deepEqual([...new Set(sim.data.errors.map(e => e.file))], ['src/knight.vhd']);
});
