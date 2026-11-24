// The MCP server's System as a project's top (#5402, server/mcp-system-top.js), as the interface's: set_design_properties'
// top_source_type system and set_top with a System document make the project a System project, its System its top;
// set_top with one of its modules makes it an FPGA project again, on its FPGA node's board; new_project's top_source_type
// system makes a System project; refused in a release and in a design project, with the interface's messages.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { setBuildChannel, SYSTEMS_OFF } from '../core/build-channel.js';

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
  assert.equal(r.text, 's1: a System project now, its System s1.sys.json its top (its board kept: set_top with a module makes it an FPGA project again).');
  const pj = await P.readProject('s1');
  assert.deepEqual([pj.kind, pj.profile, pj.board, pj.topSourceType, pj.fpga.board], [undefined, 'system', null, 'system', 'nexys2']);   // (its profile, #5440)
  assert.ok(fs.existsSync(path.join(P.projectDir('s1'), 's1.sys.json')));
  await fails('set_design_properties', { project: 's1', top_source_type: 'system', board: 'basys2' }, 'top_source_type system: give it alone (a System project has no board of its own)');
});

test('#5402 set_top: a module of a System project its top (an FPGA project on its node\'s board), then its System again', async () => {
  await ok('new_project_from_example', { name: 's2', example: 'uart-avr' });
  const r = await ok('set_top', { project: 's2', top: 'uart' });
  assert.match(r.text, /^s2: an FPGA project now, its top module 'uart' on basys2 \(xc3s250e/);
  let pj = await P.readProject('s2');
  assert.deepEqual([pj.kind, pj.board, pj.top, pj.device.part], [undefined, 'basys2', 'uart', 'xc3s250e']);
  // (its System its top again: the one it has)
  const b = await ok('set_top', { project: 's2', top: 'uart_avr.sys.json' });
  assert.deepEqual([b.data.kind, b.data.system, b.data.made], ['system', 'uart_avr.sys.json', false]);
  pj = await P.readProject('s2');
  assert.deepEqual([pj.kind, pj.profile, pj.board, pj.fpga.board], [undefined, 'system', null, 'basys2']);
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
