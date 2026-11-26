// The MCP server with a System's ESP32 node (#5495, #2674: as the System editor and Simulate System): edit_system adds an
// ESP32 DevKitC (MicroPython, its UART2), links it to a terminal and gives it its program, a .py; check_system describes
// and checks it (its ports at 3.3 V); simulate runs the program in its Worker (server/esp32-spawn.js), the terminal
// typing to it: each wire's bytes, its console a terminal of its own, its Worker ended after; with no program, said.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-system-esp32-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const { esp32Backend } = await import('../core/system-sim-esp32.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const SYS = 'uart_avr.sys.json';
const PY = 'from machine import UART\nu = UART(2, 9600)\nu.write(b"HI")\nprint("ready")\nwhile True:\n    if u.any():\n        u.write(u.read(1).upper())\n';

test('#5495 edit_system adds an ESP32 linked to a terminal; check_system describes it, its ports at 3.3 V; simulate runs its .py', async () => {
  await ok('new_project_from_example', { name: 'p', example: 'uart-avr' });
  await ok('write_file', { project: 'p', path: SYS, text: JSON.stringify({ format: 'silinx-system', version: 2, name: 'esp_echo', nodes: [], links: [] }, null, 2) });
  await ok('write_file', { project: 'p', path: 'esp/main.py', text: PY });
  const e = await ok('edit_system', { project: 'p', file: SYS, edits: [
    { action: 'add_node', fields: { kind: 'mcu', id: 'esp', board: 'esp32-devkitc' } },
    { action: 'change_node', node: 'esp', fields: { firmware: 'esp/main.py' } },
    { action: 'add_node', fields: { kind: 'terminal', id: 'pc', x: 300 } },
    { action: 'add_link', fields: { id: 'usb', a: 'esp.UART2', b: 'pc.serial' } },
  ] });
  assert.deepEqual(e.text.split('\n'), ['add_node esp', 'change_node esp', 'add_node pc', 'add_link usb', `Process "Check System" of ${SYS} completed successfully.`]);
  const c = await ok('check_system', { project: 'p', file: SYS });
  assert.deepEqual(c.text.split('\n'), ['System esp_echo: 2 nodes, 1 link', 'node esp: ESP32 DevKitC, program esp/main.py, in MicroPython', '  UART2: UART 9600 baud 8N1, TX GPIO17, RX GPIO16',
    'node pc: Serial terminal', '  serial: UART 9600 baud 8N1', 'link usb: UART esp.UART2 ↔ pc.serial',
    'usb TX: esp GPIO17 → pc serial.rx', 'usb TX: pc serial.tx → esp GPIO16', `Process "Check System" of ${SYS} completed successfully.`]);
  assert.deepEqual([c.data.errors, c.data.warnings], [[], []]);
  assert.deepEqual(c.data.ports.esp.slice(0, 2), [{ name: 'GPIO17', dir: 'out', kind: 'pin', volts: 3.3, width: 1, protocol: null, role: null }, { name: 'GPIO16', dir: 'in', kind: 'pin', volts: 3.3, width: 1, protocol: null, role: null }]);
  // simulate: the program's bytes on the terminal, the terminal's on the wire; the REPL's console
  const s = await ok('simulate', { project: 'p', top: SYS, time_ns: 20e6, type: { pc: 'hi' } });
  assert.deepEqual([s.data.time, s.data.warnings, s.data.errors], ['20 ms', [], []]);
  assert.deepEqual(s.data.terminals, { 'esp.repl': 'ready\n', pc: 'HIHI' });
  // (its back end said, #5658: JSPI where this Node has it, else its Worker)
  assert.ok(s.text.split('\n').includes(`ESP32 esp: MicroPython ${esp32Backend() === 'jspi' ? 'on this thread (JSPI)' : 'in a Worker (Atomics)'}`), s.text);
  assert.deepEqual(s.data.traffic.map(t => [t.wire, t.from, t.to, String.fromCharCode(...t.bytes.map(b => b.byte))]), [['usb_esp', 'esp.GPIO17', 'pc.rx', 'HIHI'], ['usb_pc', 'pc.tx', 'esp.GPIO16', 'hi']]);
});

test('#5495 an ESP32 with no program: said by simulate', async () => {
  await ok('edit_system', { project: 'p', file: SYS, edits: [{ action: 'change_node', node: 'esp', fields: { firmware: null } }] });
  const none = await call('simulate', { project: 'p', top: SYS, time_ns: 1e6 });
  assert.deepEqual([none.isError, none.text], [true, `simulate: ${SYS}: esp: no program: a .py of the project (MicroPython)`]);
});
