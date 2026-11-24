// The MCP server's project_info (#4591, server/mcp-projects.js): the files the implementation and the Board Emulator
// read beside the HDL (flowFiles: the constraints, then the memory images), as the Implementation view lists them under
// the top module and Implement's and Emulate's panels: the blinky example on a board of each family's constraints format
// (UCF, PCF, LPF, CST, XDC), a memory image added, a design and simulation project with none.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

const tmp = await scratchEnv('silinx-mcp-flow-files-');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const flowLines = text => text.split('\n').filter(l => /implementation and emulation files/.test(l));

test('#4591 project_info: the constraints the flow reads, in the board\'s format, for each family', async () => {
  const BOARDS = { basys2: 'ucf', nexys3: 'ucf', icebreaker: 'pcf', ulx3s: 'lpf', tangnano9k: 'cst', basys3: 'xdc' };
  for (const [board, ext] of Object.entries(BOARDS)) {
    const name = `b_${board.replace(/\W/g, '')}`;
    await ok('new_project_from_example', { name, example: 'blinky', board });
    const info = await ok('project_info', { project: name });
    const c = info.data.constraints;
    assert.match(c, new RegExp(`\\.${ext}$`), board);
    assert.deepEqual(info.data.flowFiles, [{ path: c, kind: 'constraints' }], board);
    assert.deepEqual(flowLines(info.text), [`  implementation and emulation files: ${c} (constraints)`], board);
  }
});

test('#4591 project_info: a memory image after the constraints; none in build/', async () => {
  await ok('new_project_from_example', { name: 'mem', example: 'blinky', board: 'basys2' });
  await ok('write_file', { project: 'mem', path: 'src/rom.mem', text: '00\n01\n' });
  const info = await ok('project_info', { project: 'mem' });
  assert.deepEqual(info.data.flowFiles, [{ path: 'constraints/top.ucf', kind: 'constraints' }, { path: 'src/rom.mem', kind: 'memory' }]);
  assert.deepEqual(flowLines(info.text), ['  implementation and emulation files: constraints/top.ucf (constraints), src/rom.mem (memory)']);
});

test('#4591 project_info: none for a project with no constraints file yet, the line left out', async () => {
  await ok('new_project', { name: 'empty', board: 'basys2' });
  const info = await ok('project_info', { project: 'empty' });
  assert.deepEqual(info.data.flowFiles, []);
  assert.deepEqual(flowLines(info.text), []);
});

test('#4591 project_info: a design and simulation project has no flow files', async () => {
  await ok('new_project', { name: 'dsgn', profile: 'logic' });
  const info = await ok('project_info', { project: 'dsgn' });
  assert.equal(info.data.flowFiles, undefined);
  assert.deepEqual(flowLines(info.text), []);
});
