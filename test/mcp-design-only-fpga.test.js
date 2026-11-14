// The MCP server in a design and simulation project without FPGA tools (#3891, after #3780): export_project makes a
// Silinx project of it (its default there) and refuses an ISE project, as Export Project offers Silinx's alone. An
// FPGA project's default stays Xilinx ISE's.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, ROOT } from './server-helpers.js';

let tmp;
before(async () => {
  tmp = await scratchEnv('silinx-mcp-design-only-fpga-');
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


test('export_project in a design project: a Silinx project by default, an ISE project refused; an FPGA project\'s default ISE\'s', async () => {
  await designProject('e1');
  const r = await ok('export_project', { project: 'e1', path: 'e1.zip' });
  assert.equal(r.data.kind, 'silinx', JSON.stringify(r.data));
  await fails('export_project', { project: 'e1', kind: 'xilinx', path: 'e1-ise.zip' }, 'the project \'e1\' is a design and simulation project (no FPGA): it is exported as a Silinx project, not as an ISE project');
  await ok('new_project', { name: 'e2', board: 'basys2' });
  await ok('write_file', { project: 'e2', path: 'src/traffic.fsm.json', text: FSM });
  await ok('set_top', { project: 'e2', top: 'traffic' });
  assert.equal((await ok('export_project', { project: 'e2', path: 'e2.zip' })).data.kind, 'xilinx');
});
