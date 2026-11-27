// The System example uart-zynq (#4687, part 4): a Zybo Z7's node, its PL's module (LD0-LD2 following SW0-SW2, LD3
// blinking from the 125 MHz clock) and its PS's program (the starter: hello on the USB serial port, LD4 blinking), its PS
// UART linked to a serial terminal. Its files as Silinx makes them (the XDC nodeConstraints', the program psStarter's);
// made with the MCP server, checked (the one warning: the PS's link left out of the simulation), simulated (no warning,
// the terminal silent: the Cortex-A9 not simulated), its PL built by the Silinx toolchain with no warning (its ps/ C not
// HLS's), its PS program compiled (a stand-in arm-none-eabi-gcc) with no warning; the MCP's edit_system adds a PS UART.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, writeConfig, ROOT } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';
import { readSystem } from '../core/system-doc.js';
import { nodeConstraints } from '../core/system-node.js';
import { psOfBoard, psStarter } from '../core/zynq-ps.js';

const EX = path.join(ROOT, 'examples/uart-zynq');
const GCC = path.join(ROOT, 'test/fixtures/arm-gcc-stub/arm-none-eabi-gcc');
let tmp;
before(async () => { tmp = await scratchEnv('silinx-uart-zynq-'); await writeConfig({ mode: 'silinx', paths: { 'arm-none-eabi-gcc': GCC } }); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

test('#4687 uart-zynq\'s files as Silinx makes them: the node\'s XDC (nodeConstraints), its PS program (the starter)', () => {
  const n = readSystem(fs.readFileSync(path.join(EX, 'uart_zynq.sys.json'), 'utf8')).system.nodes[0];
  const ports = [{ name: 'clk', dir: 'in', width: 1, msb: null, lsb: null }, { name: 'sw', dir: 'in', width: 3, msb: 2, lsb: 0 }, { name: 'led', dir: 'out', width: 4, msb: 3, lsb: 0 }];
  assert.equal(fs.readFileSync(path.join(EX, 'zybo/leds.xdc'), 'utf8'), nodeConstraints(n, ports).text);
  assert.equal(fs.readFileSync(path.join(EX, 'zybo/ps/main.c'), 'utf8'), psStarter(psOfBoard('zybo-z7', '20'), 'Digilent Zybo Z7'));
});

test('#4687 uart-zynq made with the MCP server: checked (its one warning), simulated (no warning), its PL built with no warning, its PS program compiled', async () => {
  const ex = await ok('list_examples', {});
  assert.equal(ex.text.split('\n').at(-1), 'uart-zynq: a System example (FPGA and microcontroller nodes in a System), 1 file(s)');
  await ok('new_project_from_example', { name: 'uz', example: 'uart-zynq' });
  const c = await ok('check_system', { project: 'uz', file: 'uart_zynq.sys.json' });
  assert.deepEqual(c.text.split('\n'), ['System uart_zynq: 2 nodes, 1 link',
    'node zybo: FPGA, module leds on zybo-z7-20, in VHDL; its PS\'s program zybo/ps/main.c: the Cortex-A9 at 666.7 MHz, UART1 on MIO 48 (TX) and 49 (RX), FCLK0 50 MHz',
    '  PS_UART1: UART 115200 baud 8N1, its PS\'s UART1: TX MIO 48, RX MIO 49, the board\'s USB serial port',
    'node term: Serial terminal', '  serial: UART 115200 baud 8N1', 'link serial: UART zybo.PS_UART1 ↔ term.serial', 'No wires: no link joins two resolved interfaces.',
    'WARNING: serial: zybo.PS_UART1 is its PS\'s, whose Cortex-A9 is not simulated: Simulate and Emulate leave the link out (its terminal\'s Real Board reaches it)',
    'Process "Check System" of uart_zynq.sys.json completed successfully with 1 warning(s).']);
  const s = await ok('simulate', { project: 'uz', time_ns: 1e6 });
  assert.deepEqual([s.data.warnings, s.data.errors, s.data.terminals], [[], [], { term: '' }]);
  const b = await ok('run_process', { project: 'uz', process: 'bitstream', node: 'zybo' });
  assert.deepEqual([b.data.errors, b.data.warnings], [[], []]);
  await P.updateProject('uz', (p) => ({ ...p, trusted: true }));
  const ps = await ok('run_process', { project: 'uz', process: 'ps', node: 'zybo' });
  assert.deepEqual([ps.data.errors, ps.data.warnings], [[], []]);
});

test('#4687 MCP: edit_system adds a Zynq node\'s PS UART (fields.ps), its link to a terminal; refused on another board', async () => {
  await ok('new_project_from_example', { name: 'ue', example: 'uart-zynq' });
  const sys = JSON.parse(fs.readFileSync(path.join(P.projectDir('ue'), 'uart_zynq.sys.json'), 'utf8'));
  sys.nodes[0].interfaces = []; sys.links = [];
  await ok('write_file', { project: 'ue', path: 'uart_zynq.sys.json', text: JSON.stringify(sys, null, 2) });
  const e = await ok('edit_system', { project: 'ue', file: 'uart_zynq.sys.json', edits: [{ action: 'add_interface', node: 'zybo', fields: { kind: 'uart', ps: true } },
    { action: 'add_link', fields: { a: 'zybo.PS_UART1', b: 'term.serial' } }] });
  assert.deepEqual(e.text.split('\n'), ['add_interface zybo.PS_UART1', 'add_link serial', 'zybo: its pins set in its constraints file zybo/leds.xdc',
    'WARNING: serial: zybo.PS_UART1 is its PS\'s, whose Cortex-A9 is not simulated: Simulate and Emulate leave the link out (its terminal\'s Real Board reaches it)',
    'Process "Check System" of uart_zynq.sys.json completed successfully with 1 warning(s).']);
  const d = await ok('check_system', { project: 'ue', file: 'uart_zynq.sys.json' });
  assert.ok(d.text.split('\n').includes('  PS_UART1: UART 115200 baud 8N1, its PS\'s UART1: TX MIO 48, RX MIO 49, the board\'s USB serial port'), d.text);
  const bad = await call('edit_system', { project: 'ue', file: 'uart_zynq.sys.json', edits: [{ action: 'add_interface', node: 'term', fields: { ps: true } }] });
  assert.deepEqual([bad.isError, bad.text], [true, 'edit_system: edit 0 (add_interface): term: a PS UART is a Zynq board\'s FPGA node\'s (the Zybo Z7, the Arty Z7) (nothing written)']);
});
