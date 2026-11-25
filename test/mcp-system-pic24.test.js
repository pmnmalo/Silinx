// The MCP server with a System's PIC24 node (#5484, #2674: as the System editor and Simulate System): edit_system adds
// an Explorer 16/32 (its UART), links it to a terminal and gives it its .hex; check_system describes and checks it (its
// typed ports at 3.3 V; an .elf refused); simulate runs its firmware (made by the tests' assembler) with the terminal
// typing to it, each wire's bytes; with no firmware, said; a drawing written in its folder, its C not made, said.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';
import { echoHex } from './pic24-node-lib.mjs';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-system-pic24-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const SYS = 'uart_avr.sys.json';

test('#5484 edit_system adds an Explorer 16/32 linked to a terminal; check_system describes it, its ports at 3.3 V; simulate runs its .hex', async () => {
  await ok('new_project_from_example', { name: 'p', example: 'uart-avr' });
  await ok('write_file', { project: 'p', path: SYS, text: JSON.stringify({ format: 'silinx-system', version: 2, name: 'pic_echo', nodes: [], links: [] }, null, 2) });
  await ok('write_file', { project: 'p', path: 'pic/echo.hex', text: echoHex() });
  const e = await ok('edit_system', { project: 'p', file: SYS, edits: [
    { action: 'add_node', fields: { kind: 'mcu', id: 'pic', board: 'explorer-1632' } },
    { action: 'change_node', node: 'pic', fields: { firmware: 'pic/echo.hex' } },
    { action: 'add_node', fields: { kind: 'terminal', id: 'pc', x: 300 } },
    { action: 'add_link', fields: { id: 'usb', a: 'pic.UART', b: 'pc.serial' } },
  ] });
  assert.deepEqual(e.text.split('\n'), ['add_node pic', 'change_node pic', 'add_node pc', 'add_link usb', `Process "Check System" of ${SYS} completed successfully.`]);
  const c = await ok('check_system', { project: 'p', file: SYS });
  assert.deepEqual(c.text.split('\n'), ['System pic_echo: 2 nodes, 1 link', 'node pic: Explorer 16/32, firmware pic/echo.hex, in C', '  UART: UART 9600 baud 8N1, TX RF5, RX RF4',
    'node pc: Serial terminal', '  serial: UART 9600 baud 8N1', 'link usb: UART pic.UART ↔ pc.serial',
    'usb TX: pic RF5 → pc serial.rx', 'usb TX: pc serial.tx → pic RF4', `Process "Check System" of ${SYS} completed successfully.`]);
  assert.deepEqual([c.data.errors, c.data.warnings], [[], []]);
  assert.deepEqual(c.data.ports.pic, [{ name: 'RF5', dir: 'out', kind: 'pin', volts: 3.3, width: 1, protocol: null, role: null }, { name: 'RF4', dir: 'in', kind: 'pin', volts: 3.3, width: 1, protocol: null, role: null }]);
  // simulate: its prompt, then what the terminal types echoed
  const s = await ok('simulate', { project: 'p', top: SYS, time_ns: 20e6, type: { pc: 'Hi' } });
  assert.deepEqual([s.data.time, s.data.warnings, s.data.errors], ['20 ms', [], []]);
  const bytes = w => String.fromCharCode(...s.data.traffic.find(t => t.wire === w).bytes.map(b => b.byte));
  assert.deepEqual(s.data.traffic.map(t => [t.wire, t.from, t.to]), [['usb_pic', 'pic.RF5', 'pc.rx'], ['usb_pc', 'pc.tx', 'pic.RF4']]);
  assert.deepEqual([bytes('usb_pic'), bytes('usb_pc'), s.data.terminals], ['>Hi', 'Hi', { pc: '>Hi' }]);
  assert.equal(s.text.split('\n')[0], 'Simulate System: 20 ms simulated.');
});

test('#5484 a PIC24 node with no firmware, or an .elf: said by simulate and check_system; a drawing in its folder, its C not made', async () => {
  await ok('edit_system', { project: 'p', file: SYS, edits: [{ action: 'change_node', node: 'pic', fields: { firmware: null } }] });
  const none = await call('simulate', { project: 'p', top: SYS, time_ns: 1e6 });
  assert.deepEqual([none.isError, none.text], [true, `simulate: ${SYS}: pic: no firmware: a .hex of the project (XC16's)`]);
  await ok('write_file', { project: 'p', path: 'pic/echo.elf', text: 'x' });
  const elf = await ok('edit_system', { project: 'p', file: SYS, edits: [{ action: 'change_node', node: 'pic', fields: { firmware: 'pic/echo.elf' } }] });
  assert.deepEqual(elf.text.split('\n'), ['change_node pic', 'ERROR: pic: its firmware pic/echo.elf is not a .hex (XC16\'s Intel HEX)', `Process "Check System" of ${SYS} failed (1 error(s), 0 warning(s)).`]);
  const fsm = JSON.parse(fs.readFileSync(new URL('../examples/traffic/src/traffic.fsm.json', import.meta.url), 'utf8'));
  delete fsm.generatedFile;
  const w = await ok('write_file', { project: 'p', path: 'pic/traffic.fsm.json', text: JSON.stringify(fsm, null, 2) });
  assert.equal(w.text.split('\n').slice(1).join('\n'), "WARNING: pic/traffic.fsm.json: a drawing's C for the Explorer 16/32's PIC24FJ1024GB610 is not made yet (#5552): only an Arduino's sketch is");
});
