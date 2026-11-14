// The MCP server in a design and simulation project without HDL (#3891, after #3780): what the interface's wizards and
// dialogs no longer show there, its tools neither: new_source with no language; remove_from_project and rename_module
// naming the drawing, never its HDL file; list_projects with no device. An FPGA project keeps them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, ROOT } from './server-helpers.js';

let tmp;
before(async () => {
  tmp = await scratchEnv('silinx-mcp-design-only-hdl-');
  fs.mkdirSync(path.join(tmp, 'exchange'));
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'exchange');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };
const FSM = fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8');

/** A design project with the traffic example's state diagram as its top. */
async function designProject(name) {
  await ok('new_project', { name, design_only: true });
  await ok('write_file', { project: name, path: 'src/traffic.fsm.json', text: FSM });
  await ok('set_top', { project: name, top: 'traffic' });
}


test('new_source in a design project: a drawing with no language; refused with one (the interface has no Language field)', async () => {
  await designProject('n1');
  const r = await ok('new_source', { project: 'n1', type: 'fsm', name: 'st' });
  assert.equal(r.text, 'Created Finite State Machine (FSM) \'src/st.fsm.json\'.');
  await fails('new_source', { project: 'n1', type: 'fsm', name: 'st2', language: 'verilog' }, 'a design and simulation project has no HDL language (its drawings are its sources)');
  // (an FPGA project: its language)
  await ok('new_project', { name: 'f1' });
  await ok('new_source', { project: 'f1', type: 'fsm', name: 'st', language: 'verilog' });
});

test('remove_from_project in a design project: the drawing named alone; an FPGA project names its HDL file', async () => {
  await designProject('r1');
  await ok('new_source', { project: 'r1', type: 'schematic', name: 'sh' });
  const r = await ok('remove_from_project', { project: 'r1', path: 'src/sh.sch.json' });
  assert.equal(r.text, 'Removed src/sh.sch.json from the project (the file is kept in the project folder).');
  assert.deepEqual(r.data.removed, ['src/sh.sch.json']);
  await ok('new_project', { name: 'r2' });
  await ok('new_source', { project: 'r2', type: 'schematic', name: 'sh' });
  const f = await ok('remove_from_project', { project: 'r2', path: 'src/sh.sch.json' });
  assert.equal(f.text, 'Removed src/sh.sch.json and its HDL file src/sh.vhd from the project (the files are kept in the project folder).');
});

test('rename_module in a design project: its drawing renamed, its HDL file never named', async () => {
  await designProject('m1');
  await ok('new_source', { project: 'm1', type: 'schematic', name: 'sh' });
  const r = await ok('rename_module', { project: 'm1', module: 'sh', to: 'sheet' });
  assert.equal(r.text.split('\n')[0], 'Rename: module \'sh\' renamed to \'sheet\' (1 file(s) updated); src/sh.sch.json → src/sheet.sch.json.');
  await fails('rename_module', { project: 'm1', module: 'nothing', to: 'x' }, 'no module \'nothing\' in the project');
});

test('list_projects: a design project with no device nor board, its kind', async () => {
  await designProject('l1');
  await ok('new_project', { name: 'l2' });
  const r = await ok('list_projects', {});
  assert.ok(r.text.split('\n').includes('l1: top traffic, a design and simulation project (no FPGA)'), r.text);
  assert.deepEqual(r.data.projects.find(p => p.name === 'l1'), { name: 'l1', top: 'traffic', kind: 'design', board: null, device: null });
  assert.match(r.text.split('\n').find(l => l.startsWith('l2:')), /^l2: top \(none\), no board \(xc3s/);
});

// (#3891, part 4: the messages)
test('a design project\'s messages: a drawing made without its HDL named, one with errors its module not made again; Check Design on the drawing', async () => {
  await designProject('c1');
  assert.equal((await ok('new_source', { project: 'c1', type: 'schematic', name: 'sh' })).text, 'Created Schematic \'src/sh.sch.json\'.');
  const bad = JSON.parse(FSM);
  bad.states[1].name = bad.states[0].name;
  await ok('write_file', { project: 'c1', path: 'src/traffic.fsm.json', text: JSON.stringify(bad, null, 2) });
  const chk = await call('check_syntax', { project: 'c1' });
  // (its errors on the drawing, #3934)
  assert.equal(chk.text, 'ERROR:Silinx - "src/traffic.fsm.json": its module is not made: Two states are named \'CARS\' (letter case does not count). Fix src/traffic.fsm.json.\nProcess "Check Design" of <traffic> failed (1 error(s), 0 warning(s)).');
  assert.doesNotMatch(chk.text, /HDL|\.vhd/);
});

test('a design project\'s test bench and Verify: no language, the test bench by its name; find_in_project without the HDL', async () => {
  await designProject('c2');
  await fails('test_bench_wizard', { project: 'c2', module: 'traffic', language: 'verilog' }, 'a design and simulation project has no HDL language (its drawings are its sources)');
  await fails('verify', { project: 'c2', language: 'verilog' }, 'a design and simulation project has no HDL language (its drawings are its sources)');
  await ok('new_source', { project: 'c2', type: 'schematic', name: 'sh' });
  const f = await ok('find_in_project', { project: 'c2', text: 'sh' });
  assert.ok(f.data.files.length && f.data.files.every(x => !/\.vhd$/.test(x.path)), JSON.stringify(f.data.files.map(x => x.path)));
});
