// The MCP server in a design and simulation project without HDL, the editors (#3891, after #3780): a truth table's
// results (related_view results, its editor's results panel) with no HDL notation and its logic not called HDL's. An FPGA
// project keeps them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, ROOT } from './server-helpers.js';

let tmp;
before(async () => {
  tmp = await scratchEnv('silinx-mcp-design-only-editors-');
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

const BOOL = fs.readFileSync(path.join(ROOT, 'examples/traffic/src/lamps.bool.json'), 'utf8');

test('related_view results in a design project: no HDL notation, its logic named so; an FPGA project\'s HDL logic', async () => {
  await designProject('t1');
  await ok('write_file', { project: 't1', path: 'src/lamps.bool.json', text: BOOL });
  const r = await ok('related_view', { project: 't1', path: 'src/lamps.bool.json', view: 'results' });
  assert.match(r.text, /^Logic: /m);
  assert.doesNotMatch(r.text, /HDL/);
  for (const n of ['vhdl', 'verilog']) await fails('related_view', { project: 't1', path: 'src/lamps.bool.json', view: 'results', notation: n }, `notation ${n}: a design and simulation project shows no HDL (its drawings are its sources)`);
  await ok('new_project', { name: 't2' });
  await ok('write_file', { project: 't2', path: 'src/lamps.bool.json', text: BOOL });
  assert.match((await ok('related_view', { project: 't2', path: 'src/lamps.bool.json', view: 'results', notation: 'vhdl' })).text, /^HDL logic: /m);
});
