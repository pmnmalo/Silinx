// The MCP server with a System's RP2040 node (#5494, #2674: as the System editor and Simulate System): edit_system adds a
// Raspberry Pi Pico (MicroPython, its UARTs), links its UART0 to a terminal and gives it its program, a .py; check_system
// describes and checks it (its ports at 3.3 V); simulate runs the program with the terminal typing to it: each wire's
// bytes, its REPL's console as a terminal of its own; with no program, said. Its firmware CircuitPython's (#5697, as its
// Properties' Firmware): edit_system's runtime, check_system's description, simulate running its code.py with a module of
// its folder; another firmware refused. The firmware's files from the tests' shared folder (SILINX_RP2040_CACHE:
// downloaded once).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';

process.env.SILINX_RP2040_CACHE ??= path.join(os.tmpdir(), 'silinx-rp2040');
let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-system-rp2040-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const SYS = 'uart_avr.sys.json';
// (MicroPython boots in about 0.3 s of the System's time: what the terminal types before is lost, as on the board)
const PY = 'from machine import UART, Pin\nu = UART(0, 9600, tx=Pin(0), rx=Pin(1))\nu.write(b"HI")\nprint("ready")\n';

test('#5494 edit_system adds a Pico linked to a terminal; check_system describes it, its ports at 3.3 V; simulate runs its .py', async () => {
  await ok('new_project_from_example', { name: 'p', example: 'uart-avr' });
  await ok('write_file', { project: 'p', path: SYS, text: JSON.stringify({ format: 'silinx-system', version: 2, name: 'pico_echo', nodes: [], links: [] }, null, 2) });
  await ok('write_file', { project: 'p', path: 'pico/main.py', text: PY });
  const e = await ok('edit_system', { project: 'p', file: SYS, edits: [
    { action: 'add_node', fields: { kind: 'mcu', id: 'pico', board: 'pico' } },
    { action: 'change_node', node: 'pico', fields: { firmware: 'pico/main.py' } },
    { action: 'add_node', fields: { kind: 'terminal', id: 'pc', x: 300 } },
    { action: 'add_link', fields: { id: 'usb', a: 'pico.UART0', b: 'pc.serial' } },
  ] });
  assert.deepEqual(e.text.split('\n'), ['add_node pico', 'change_node pico', 'add_node pc', 'add_link usb', `Process "Check System" of ${SYS} completed successfully.`]);
  const c = await ok('check_system', { project: 'p', file: SYS });
  assert.deepEqual(c.text.split('\n'), ['System pico_echo: 2 nodes, 1 link', 'node pico: Raspberry Pi Pico, program pico/main.py, in MicroPython', '  UART0: UART 9600 baud 8N1, TX GP0, RX GP1', '  UART1: UART 9600 baud 8N1, TX GP4, RX GP5',
    'node pc: Serial terminal', '  serial: UART 9600 baud 8N1', 'link usb: UART pico.UART0 ↔ pc.serial',
    'usb TX: pico GP0 → pc serial.rx', 'usb TX: pc serial.tx → pico GP1', `Process "Check System" of ${SYS} completed successfully.`]);
  assert.deepEqual([c.data.errors, c.data.warnings], [[], []]);
  assert.deepEqual(c.data.ports.pico.slice(0, 2), [{ name: 'GP0', dir: 'out', kind: 'pin', volts: 3.3, width: 1, protocol: null, role: null }, { name: 'GP1', dir: 'in', kind: 'pin', volts: 3.3, width: 1, protocol: null, role: null }]);
  // simulate: the program's bytes on the terminal, the terminal's on the wire; the REPL's console
  const s = await ok('simulate', { project: 'p', top: SYS, time_ns: 800e6, type: { pc: 'hi' } });
  assert.deepEqual([s.data.time, s.data.warnings, s.data.errors], ['800 ms', [], []]);
  assert.deepEqual(s.data.terminals, { pc: 'HI', 'pico.repl': 'ready\r\n>>> ' });
  assert.deepEqual(s.data.traffic.map(t => [t.wire, t.from, t.to, String.fromCharCode(...t.bytes.map(b => b.byte))]), [['usb_pico', 'pico.GP0', 'pc.rx', 'HI'], ['usb_pc', 'pc.tx', 'pico.GP1', 'hi']]);
});

test('#5494 a Pico with no program: said by simulate', async () => {
  await ok('edit_system', { project: 'p', file: SYS, edits: [{ action: 'change_node', node: 'pico', fields: { firmware: null } }] });
  const none = await call('simulate', { project: 'p', top: SYS, time_ns: 1e6 });
  assert.deepEqual([none.isError, none.text], [true, `simulate: ${SYS}: pico: no program: a .py of the project (MicroPython or CircuitPython)`]);
});

test('#5697 edit_system makes the Pico\'s firmware CircuitPython: check_system says it, simulate runs its program as code.py with its folder\'s module; another refused', async () => {
  await ok('write_file', { project: 'p', path: 'pico/main.py', text: 'import board, busio\nfrom greet import TEXT\nu = busio.UART(board.GP0, board.GP1, baudrate=9600)\nu.write(TEXT)\nprint("ready")\nwhile True:\n    pass\n' });
  await ok('write_file', { project: 'p', path: 'pico/greet.py', text: 'TEXT = b"CP"\n' });
  const e = await ok('edit_system', { project: 'p', file: SYS, edits: [{ action: 'change_node', node: 'pico', fields: { firmware: 'pico/main.py', runtime: 'circuitpython' } }] });
  assert.deepEqual([e.data.errors, e.data.warnings], [[], []]);
  assert.match((await ok('read_file', { project: 'p', path: SYS })).text, /"firmware": "pico\/main\.py",\n {6}"runtime": "circuitpython",/);
  const c = await ok('check_system', { project: 'p', file: SYS });
  assert.equal(c.text.split('\n')[1], 'node pico: Raspberry Pi Pico, CircuitPython, program pico/main.py');
  assert.deepEqual(c.data.plan.nodes.map(n => [n.id, n.programmer, n.reason]), [['pico', 'circuitpy', 'a CircuitPython program runs as it is']]);
  const s = await ok('simulate', { project: 'p', top: SYS, time_ns: 500e6 });
  assert.deepEqual([s.data.warnings, s.data.errors], [[], []]);
  assert.deepEqual(s.data.terminals, { pc: 'CP', 'pico.repl': 'code.py output:\r\nready\r\n' });
  const bad = await call('edit_system', { project: 'p', file: SYS, edits: [{ action: 'change_node', node: 'pico', fields: { runtime: 'lua' } }] });
  assert.deepEqual([bad.isError, bad.text], [true, 'edit_system: edit 0 (change_node): pico: the Raspberry Pi Pico\'s firmware is micropython or circuitpython, not lua (nothing written)']);
  await ok('edit_system', { project: 'p', file: SYS, edits: [{ action: 'change_node', node: 'pico', fields: { runtime: 'micropython' } }] });
  assert.equal((await ok('check_system', { project: 'p', file: SYS })).text.split('\n')[1], 'node pico: Raspberry Pi Pico, program pico/main.py, in MicroPython');
});

test('#5909 regression: a Pico emulated (simulate with controls, as Emulate System): its board, each of its pins\' level, its LED on GP25; its line says them', async () => {
  await ok('write_file', { project: 'p', path: 'pico/main.py', text: 'from machine import Pin\nimport time\nPin(25, Pin.OUT).value(1)\nPin(2, Pin.OUT).value(1)\nPin(3, Pin.OUT).value(0)\nwhile True:\n    time.sleep_ms(1)\n' });
  const e = await ok('simulate', { project: 'p', top: SYS, time_ns: 300e6, controls: [] });
  const pico = e.data.boards.pico;
  assert.deepEqual(Object.keys(pico), ['pins', 'led'], 'its board (none on the old code)');
  assert.deepEqual(Object.keys(pico.pins), [...[...Array(23).keys()], 25, 26, 27, 28].map((n) => `GP${n}`));
  assert.deepEqual(['GP25', 'GP2', 'GP3', 'GP0'].map((p) => pico.pins[p]), [1, 1, 0, 0], 'GP0, its UART0\'s TX, not set up by this program');
  assert.ok(pico.led > 0.99, `its LED: ${pico.led}`);
  // (GP5: UART1's RX, which no link drives, held idle at 1)
  assert.ok(e.text.split('\n').includes('pico\'s board: LED (GP25) on; pins high GP2 GP5 GP25.'), e.text);
  assert.deepEqual([e.data.warnings, e.data.errors], [[], []]);
});
