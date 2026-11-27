// The MCP's flows check the drawings' HDL files first (#5872, server/mcp-drawing-check.js, server/mcp.js): a state
// diagram replaced in the project's folder (another port): check_syntax makes its HDL again and says so, then passes;
// an HDL file edited by hand: simulate keeps it in a version, makes it again and warns; a drawing with errors: the
// flow's error, never the stale HDL used; a tool that runs no flow (read_file) checks nothing. The same lines as the
// interface's (web/js/drawing-check.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { FLOW_TOOLS } from '../server/mcp-drawing-check.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-drawing-check-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const file = (name, f) => path.join(P.projectDir(name), f);
const read = (name, f) => fs.readFileSync(file(name, f), 'utf8');
// (another program's write: not through Silinx)
const put = (name, f, text) => fs.writeFileSync(file(name, f), text);
const EDITED = n => `WARNING: src/lamps.vhd was changed outside Silinx: made again from src/lamps.bool.json, the drawing being its source; the changed file is kept in version ${n} ("src/lamps.vhd changed outside Silinx").`;

test('the flows checked: every tool that reads the sources to run something', () => {
  assert.deepEqual([...FLOW_TOOLS].sort(), ['c_cosimulation', 'c_simulation', 'check_constraints', 'check_syntax', 'check_system', 'export_project', 'grade', 'run_process', 'simulate', 'simulate_drawing', 'timing_paths', 'verify']);
});

test('Pedro\'s case: a state diagram replaced on disk with another port: check_syntax makes its HDL again, says so, and passes', async () => {
  await P.createProject({ name: 'tr', template: 'traffic' });
  const fsm = JSON.parse(read('tr', 'src/traffic.fsm.json'));
  fsm.inputs.push({ name: 'hold', width: 1 });
  fsm.transitions.find(t => t.id === 't3').cond = 'done && !hold';
  put('tr', 'src/traffic.fsm.json', JSON.stringify(fsm, null, 2));
  // (the top's instance has no hold: the check's error, the module's ports the new ones)
  const r = await call('check_syntax', { project: 'tr', top: 'traffic' });
  const lines = r.text.split('\n');
  assert.equal(lines[0], 'src/traffic.vhd updated from src/traffic.fsm.json (the drawing was changed outside Silinx)');
  assert.equal(lines.at(-1), 'Process "Check Syntax" of <traffic> completed successfully (9 signals, 3 processes).', r.text);
  assert.match(read('tr', 'src/traffic.vhd'), /hold\s+: in\s+std_logic;/);
  // (again: nothing to say)
  assert.doesNotMatch((await call('check_syntax', { project: 'tr', top: 'traffic' })).text, /updated from|changed outside/);
});

test('an HDL file edited by hand: simulate keeps it in a version, makes it again from its drawing and warns; read_file checks nothing', async () => {
  await P.createProject({ name: 'ed', template: 'traffic' });
  const was = read('ed', 'src/lamps.vhd');
  const edited = was.replace('library', '-- mine\nlibrary');
  put('ed', 'src/lamps.vhd', edited);
  // (a tool that runs no flow: the file as it is)
  assert.equal((await call('read_file', { project: 'ed', path: 'src/lamps.vhd' })).isError, false);
  assert.equal(read('ed', 'src/lamps.vhd'), edited);
  const r = await call('simulate', { project: 'ed' });
  assert.equal(r.text.split('\n')[0], EDITED(1), r.text);
  assert.equal(read('ed', 'src/lamps.vhd'), was);
  const v = await call('list_versions', { project: 'ed' });
  assert.deepEqual(v.data.versions.map(x => [x.id, x.reason, x.label]), [['1', 'before-regenerate', 'src/lamps.vhd changed outside Silinx']]);
  assert.equal((await call('version_diff', { project: 'ed', version: '1', path: 'src/lamps.vhd' })).isError, false);
});

test('a drawing replaced with one with errors: check_syntax fails on its errors, its stale HDL never used; nothing said made', async () => {
  await P.createProject({ name: 'bad', template: 'traffic' });
  const hdl = read('bad', 'src/traffic.vhd');
  const fsm = JSON.parse(read('bad', 'src/traffic.fsm.json'));
  fsm.transitions[0].to = 's99';
  put('bad', 'src/traffic.fsm.json', JSON.stringify(fsm, null, 2));
  const r = await call('check_syntax', { project: 'bad' });
  assert.match(r.text, /Process "Check Syntax" of \S+ failed \(1 error\(s\), 0 warning\(s\)\)\./);
  assert.doesNotMatch(r.text, /updated from|changed outside/);
  assert.match(r.text, /src\/traffic\.vhd is not up to date: src\/traffic\.fsm\.json cannot generate it, it has errors: A transition starts or ends at a state that does not exist/);
  assert.equal(read('bad', 'src/traffic.vhd'), hdl);
});
