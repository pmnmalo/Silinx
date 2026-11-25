// The MCP server's System as a project's top (#5402, server/mcp-system-top.js), as the interface's: set_design_properties'
// top_source_type system and set_top with a System document make the project a System project, its System its top;
// set_top with one of its modules sets its FPGA node's top module, the System still its top (#5583); new_project's top_source_type
// system makes a System project; refused in a release and in a design project, with the interface's messages.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { setBuildChannel, SYSTEMS_OFF } from '../core/build-channel.js';
import { unlabelled } from './mcp-label.js';

let tmp;
before(async () => {
  tmp = await scratchEnv('silinx-mcp-system-top-');
  fs.mkdirSync(path.join(tmp, 'exchange'));
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'exchange');
  setBuildChannel('dev');
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

test('#5402 set_design_properties top_source_type system: an FPGA project made a System project, its new System its top', async () => {
  await ok('new_project', { name: 's1', board: 'nexys2' });
  const r = await ok('set_design_properties', { project: 's1', top_source_type: 'system' });
  assert.equal(r.text, 's1: a System project now, its System s1.sys.json its top (its board kept).');
  const pj = await P.readProject('s1');
  assert.deepEqual([pj.kind, pj.profile, pj.board, pj.topSourceType, pj.fpga.board], [undefined, 'system', null, 'system', 'nexys2']);   // (its profile, #5440)
  assert.ok(fs.existsSync(path.join(P.projectDir('s1'), 's1.sys.json')));
  await fails('set_design_properties', { project: 's1', top_source_type: 'system', board: 'basys2' }, 'top_source_type system: give it alone (a System project has no board of its own)');
});

test('#5583 set_top / unset_top in a System project: a module of an FPGA node\'s folder that node\'s top, the System still the project\'s top; refused outside it', async () => {
  await ok('new_project_from_example', { name: 's2', example: 'uart-avr' });
  const ent = n => `library ieee;\nuse ieee.std_logic_1164.all;\nentity ${n} is\n  port (clk : in std_logic; led : out std_logic);\nend ${n};\narchitecture rtl of ${n} is\nbegin\n  led <= clk;\nend rtl;\n`;
  await ok('write_file', { project: 's2', path: 'fpga/other.vhd', text: ent('other') });
  const sysText = () => JSON.parse(fs.readFileSync(path.join(P.projectDir('s2'), 'uart_avr.sys.json'), 'utf8'));
  // (before #5583: the project made an FPGA project, its System gone from its top)
  const r = await ok('set_top', { project: 's2', top: 'other' });
  assert.deepEqual([r.text.split('\n')[0], unlabelled(r.data)], ['s2: \'other\' is now fpga\'s top module (the System uart_avr stays the project\'s top).', { project: 's2', top: 'uart_avr.sys.json', node: 'fpga', nodeTop: 'other', changed: true }]);
  let pj = await P.readProject('s2');
  assert.deepEqual([pj.kind, pj.board, pj.top || ''], ['system', null, '']);   // (the example's: a System project, as it was)
  assert.deepEqual(sysText().nodes.map(n => [n.id, n.module ?? null]), [['uno', null], ['fpga', 'other']]);
  // (its top already: nothing written)
  const again = await ok('set_top', { project: 's2', top: 'OTHER' });
  assert.deepEqual([again.text.split('\n')[0], again.data.changed], ['s2: \'OTHER\' is already fpga\'s top module.', false]);
  await ok('set_top', { project: 's2', top: 'uart' });
  assert.equal(sysText().nodes[1].module, 'uart');
  // refused: a module in no node's folder; unset_top (the test bench's still unset)
  await ok('write_file', { project: 's2', path: 'lone.vhd', text: ent('lone') });
  await fails('set_top', { project: 's2', top: 'lone' }, '\'lone\' is in no node\'s folder of the System uart_avr: a System project\'s top is its System, and an FPGA node\'s top module is a module of its folder');
  await fails('unset_top', { project: 's2' }, 'a System project\'s top is its System, and each FPGA node always has a top module: Set as Top Module on another module of its folder changes it');
  const u = await ok('unset_top', { project: 's2', simulation: true });
  assert.equal(u.text, 'The project \'s2\' has no test bench: nothing to unset.');
  pj = await P.readProject('s2');
  assert.deepEqual([pj.kind, pj.top || '', sysText().nodes[1].module], ['system', '', 'uart']);
  // (its System its top: as it is)
  const b = await ok('set_top', { project: 's2', top: 'uart_avr.sys.json' });
  assert.deepEqual([b.data.kind, b.data.system, b.data.made], ['system', 'uart_avr.sys.json', false]);
  await fails('set_top', { project: 's2', top: 'none.sys.json' }, 'none.sys.json: no such file in the project \'s2\'');
});

test('#5402 new_project top_source_type system: a System project; refused in a design project and in a release', async () => {
  const r = await ok('new_project', { name: 's3', top_source_type: 'system' });
  assert.deepEqual([r.data.kind, r.data.system], ['system', 's3.sys.json']);
  assert.equal((await P.readProject('s3')).topSourceType, 'system');
  await fails('new_project', { name: 's4', profile: 'logic', top_source_type: 'system' }, 'top_source_type system: a design and simulation project\'s top is a drawing: a System is a System project\'s top (New Project ▸ System)');
  await ok('new_project', { name: 's5', board: 'basys2' });
  setBuildChannel('release');
  try {
    await fails('set_design_properties', { project: 's5', top_source_type: 'system' }, `top_source_type system: ${SYSTEMS_OFF}`);
    await fails('new_project', { name: 's6', top_source_type: 'system' }, SYSTEMS_OFF);
  } finally { setBuildChannel('dev'); }
});

test('#5443 run_process in a System project whose top is its System: refused, its FPGA nodes not implemented yet', async () => {
  await ok('new_project_from_example', { name: 'rp1', example: 'uart-avr' });
  await fails('run_process', { project: 'rp1', process: 'synthesize' }, 'the project \'rp1\' has its System as its top: its FPGA nodes are not implemented yet, each on its own board (Check Syntax and the simulation work on their modules)');
});

test('#5446 run_process node: a System\'s FPGA node synthesized on its own board; another process, or no such node, refused', async () => {
  await ok('new_project_from_example', { name: 'rp2', example: 'uart-avr' });
  const r = await ok('run_process', { project: 'rp2', process: 'synthesize', node: 'fpga', toolchain: 'silinx' });
  assert.match(r.text, /^Process "synthesize" of <node fpga> completed successfully/m);
  assert.ok(r.text.includes('System node fpga: its module uart on basys2 (250), its constraints fpga.ucf from its pins, built in build/nodes/fpga/.'), r.text);
  assert.ok(fs.existsSync(path.join(P.projectDir('rp2'), 'build/nodes/fpga/build/open/uart.json')), 'its netlist in its own folder');
  await fails('run_process', { project: 'rp2', process: 'timing', node: 'fpga' }, 'node: a System node runs synthesize, implement or bitstream (not timing)');
  await fails('run_process', { project: 'rp2', process: 'synthesize', node: 'uno' }, 'no FPGA node \'uno\' in the System of \'rp2\' (fpga)');
});

test('#5446 run_process node: a System whose node\'s id is no identifier refused (its file and the id said)', async () => {
  await ok('new_project_from_example', { name: 'rp3', example: 'uart-avr' });
  const f = path.join(P.projectDir('rp3'), 'uart_avr.sys.json'), sys = JSON.parse(fs.readFileSync(f, 'utf8'));
  sys.nodes.find((n) => n.kind === 'fpga').id = '../x';
  fs.writeFileSync(f, JSON.stringify(sys, null, 2));
  await fails('run_process', { project: 'rp3', process: 'synthesize', node: '../x' }, 'uart_avr.sys.json: \'../x\' is not a node\'s id: a letter, then letters, digits and _');
  assert.equal(fs.existsSync(path.join(P.projectDir('rp3'), 'build')), false, 'nothing built');
});
