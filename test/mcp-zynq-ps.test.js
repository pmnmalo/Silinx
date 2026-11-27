// MCP: a Zynq board's processing system in a System (#4686, part 2): edit_system's change_node sets an FPGA node's `ps`
// (its PS's program, in its folder's ps/), writing its starter program when the project has none, refused on a board with
// no PS or out of ps/; check_system describes the PS (its CPU's clock, its UART's MIO pins) and says a program missing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-zynq-ps-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

const system = { format: 'silinx-system', version: 2, name: 'zynq', nodes: [
  { id: 'zybo', kind: 'fpga', module: 'uart', board: 'zybo-z7', variant: '20', interfaces: [] },
  { id: 'b2', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', interfaces: [] },
], links: [] };
const PS_LINE = 'node zybo: FPGA, module uart on zybo-z7-20, in VHDL; its PS\'s program zybo/ps/main.c: the Cortex-A9 at 666.7 MHz, UART1 on MIO 48 (TX) and 49 (RX), FCLK0 50 MHz';

test('#4686 edit_system: a Zynq node\'s PS program set, its starter written; check_system describes the PS; a program missing said', async () => {
  await ok('new_project_from_example', { name: 'z', example: 'uart' });
  await ok('write_file', { project: 'z', path: 'zynq.sys.json', text: JSON.stringify(system, null, 2) });
  const e = await ok('edit_system', { project: 'z', file: 'zynq.sys.json', edits: [{ action: 'change_node', node: 'zybo', fields: { ps: 'zybo/ps/main.c' } }] });
  assert.ok(e.text.split('\n').includes('zybo/ps/main.c: the PS\'s starter program'), e.text);
  const main = await ok('read_file', { project: 'z', path: 'zybo/ps/main.c' });
  assert.match(main.text, /uart_puts\("Hello from the Cortex-A9 of Digilent Zybo Z7\\n"\);/);
  assert.match(main.text, /#define UART_CR {4}REG\(0xE0001000\)/);
  // (the System's description, its PS's line; no PS problem)
  const c = await ok('check_system', { project: 'z', file: 'zynq.sys.json' });
  assert.ok(c.text.split('\n').includes(PS_LINE), c.text);
  assert.deepEqual(c.data.errors.filter((x) => /PS/.test(x.message)), []);
  // (edited again: the program kept as it is, no starter over it)
  await ok('write_file', { project: 'z', path: 'zybo/ps/main.c', text: 'int main(void) { for (;;) { } }\n' });
  const again = await ok('edit_system', { project: 'z', file: 'zynq.sys.json', edits: [{ action: 'change_node', node: 'zybo', fields: { x: 40 } }] });
  assert.ok(!/starter/.test(again.text));
  assert.equal((await ok('read_file', { project: 'z', path: 'zybo/ps/main.c' })).text.includes('Hello'), false);
  // (its program deleted: the check says so)
  await ok('delete_file', { project: 'z', path: 'zybo/ps/main.c' });
  const gone = await ok('check_system', { project: 'z', file: 'zynq.sys.json' });
  assert.deepEqual(gone.data.errors.filter((x) => /PS/.test(x.message)).map((x) => [x.message, x.item]), [['zybo: no PS\'s program zybo/ps/main.c in the project', 'zybo']]);
});

test('#4686 edit_system: a PS program refused on a board with no PS and out of the node\'s ps/, nothing written', async () => {
  await ok('new_project_from_example', { name: 'r', example: 'uart' });
  await ok('write_file', { project: 'r', path: 'zynq.sys.json', text: JSON.stringify(system, null, 2) });
  const bad = async (node, ps) => (await call('edit_system', { project: 'r', file: 'zynq.sys.json', edits: [{ action: 'change_node', node, fields: { ps } }] }));
  const [a, b] = [await bad('b2', 'b2/ps/main.c'), await bad('zybo', 'zybo/main.c')];
  assert.deepEqual([a.isError, a.text, b.isError, b.text], [true, 'edit_system: edit 0 (change_node): b2: the board basys2 has no processing system (nothing written)',
    true, 'edit_system: edit 0 (change_node): zybo: its PS\'s program zybo/main.c is not in zybo/ps/ (nothing written)']);
  assert.equal((await call('read_file', { project: 'r', path: 'zybo/main.c' })).isError, true);
});
