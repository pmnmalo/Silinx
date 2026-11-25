// The MCP server's project_info gives a project's nodes (#5414, #5416's phase 2), as the Design pane shows them, from
// core/project-nodes.js: one implicit node for an FPGA project and for a design and simulation project, its text as before;
// a System project's nodes from its System document, each with its board, module and files, said in a line of its own.
// And its System (#5416's phase 3, core/project-system.js): a System project's document's model, an FPGA or a design
// project's implicit one (one node as silinx.json says, no link), nothing written.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { setBuildChannel } from '../core/build-channel.js';

let tmp;
before(async () => {
  tmp = await scratchEnv('silinx-mcp-project-nodes-');
  setBuildChannel('dev');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  assert.equal(r.isError, false, r.content[0].text);
  return { text: r.content[0].text, data: r.structuredContent };
}

test('#5414 project_info of a System project: its nodes, each with its board, module and files, its folder\'s (#5488); a line of them', async () => {
  await P.createProject({ name: 'ua', template: 'uart-avr' });
  const r = await call('project_info', { project: 'ua' });
  assert.deepEqual(r.data.nodes, [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', module: null, lang: 'c', files: ['uno/hello.hex'], folder: 'uno', inFolder: ['uno/hello.asm', 'uno/hello.hex'] },
    { id: 'fpga', kind: 'fpga', board: 'basys2', variant: '250', module: 'uart', lang: 'vhdl', files: [],
    folder: 'fpga', inFolder: ['fpga/debounce.vhd', 'fpga/sevenseg.vhd', 'fpga/uart.vhd', 'fpga/uart_rx.vhd', 'fpga/uart_tx.vhd'] }]);
  assert.ok(r.text.split('\n').includes('  nodes: uno (mcu, arduino-uno: uno/hello.hex; uno/: 2 file(s)); fpga (fpga, basys2: module uart; fpga/: 5 file(s))'), r.text);
});

test('#5414 project_info of an FPGA project and of a design project: its one implicit node; no nodes line', async () => {
  await P.createProject({ name: 'bl', template: 'blinky' });
  const f = await call('project_info', { project: 'bl' });
  assert.deepEqual(f.data.nodes.map(n => [n.id, n.kind, n.implicit, n.board, n.module, n.files]), [['fpga', 'fpga', true, 'basys2', 'top', ['constraints/top.ucf']]]);
  assert.doesNotMatch(f.text, /nodes:/);
  await P.createProject({ name: 'dl', kind: 'design' });
  const d = await call('project_info', { project: 'dl' });
  assert.deepEqual(d.data.nodes, [{ id: 'design', kind: 'design', implicit: true, board: null, device: null, module: null, lang: 'vhdl', files: [] }]);
  assert.doesNotMatch(d.text, /nodes:/);
});

test('#5414 project_info of a System project with no System document: no node, said', async () => {
  await P.createProject({ name: 'sx', kind: 'system' });
  fs.rmSync(path.join(P.projectDir('sx'), 'sx.sys.json'));
  const r = await call('project_info', { project: 'sx' });
  assert.deepEqual(r.data.nodes, []);
  assert.ok(r.text.split('\n').includes('  nodes: (none)'), r.text);
});

test('#5416 project_info\'s system: a System project\'s document, an FPGA project\'s and a design project\'s implicit; nothing written', async () => {
  const ua = await call('project_info', { project: 'ua' });
  assert.deepEqual(ua.data.system, JSON.parse(fs.readFileSync(path.join(P.projectDir('ua'), 'uart_avr.sys.json'), 'utf8')));
  const before = fs.readdirSync(P.projectDir('bl'), { recursive: true }).sort();
  const desc = fs.readFileSync(path.join(P.projectDir('bl'), 'silinx.json'), 'utf8');
  const bl = await call('project_info', { project: 'bl' });
  const pj = JSON.parse(desc);
  assert.deepEqual(bl.data.system, { format: 'silinx-system', version: 2, name: 'bl', links: [], nodes: [{ id: 'fpga', kind: 'fpga', module: 'top', board: 'basys2', variant: '250',
    device: pj.device, constraints: 'constraints/top.ucf', lang: 'vhdl', pins: {}, interfaces: [], x: 0, y: 0, implicit: true }] });
  assert.deepEqual([fs.readdirSync(P.projectDir('bl'), { recursive: true }).sort(), fs.readFileSync(path.join(P.projectDir('bl'), 'silinx.json'), 'utf8')], [before, desc]);
  const dl = await call('project_info', { project: 'dl' });
  assert.deepEqual(dl.data.system.nodes.map(n => [n.id, n.kind, n.implicit, n.board]), [['design', 'design', true, null]]);
  const sx = await call('project_info', { project: 'sx' });
  assert.equal(sx.data.system, null);
});
