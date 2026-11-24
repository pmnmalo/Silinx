// The MCP server's check_system (server/mcp-system.js, #4697, #2674): a System document checked as Check System does, with
// the project's modules (the uart example's top elaborated: its ports' directions) and files (the firmware); the exact
// errors and warnings with their node or link; a file that is not a System, not there, not a System document's text.
// The System described before its check, and edit_system (#4700): edited as the System editor does (core/system-edit.js),
// written and checked; an edit refused writes nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-system-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

const system = (over = {}) => ({ format: 'silinx-system', version: 1, name: 'uart_avr', nodes: [
  { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: { rx: 'J3', tx: 'A3' }, interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }] },
  { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }] },
  ...(over.nodes || []),
], links: [{ id: 'console', kind: 'uart', a: 'term.serial', b: 'fpga.uart' }, ...(over.links || [])] });
const write = (path, m) => ok('write_file', { project: 'u', path, text: typeof m === 'string' ? m : JSON.stringify(m, null, 2) });

test('check_system: a valid System, no warnings; an Arduino at 5 V, its warning; the module\'s ports and the firmware checked', async () => {
  await ok('new_project_from_example', { name: 'u', example: 'uart' });
  await write('uart_avr.sys.json', system());
  const v = await ok('check_system', { project: 'u', file: 'uart_avr.sys.json' });
  const { untrusted: u0, system: sys0, ...data0 } = v.data;
  assert.match(u0.content, /the System's names/, 'the names quoted: untrusted');
  assert.deepEqual(sys0.nodes.map(n => n.id), ['fpga', 'term']);
  assert.deepEqual([v.isError, v.text], [false, ['System uart_avr: 2 nodes, 1 link', 'node fpga: FPGA, module uart on basys2-250', '  uart: UART 9600 baud 8N1, TX tx (A3), RX rx (J3)',
    'node term: Serial terminal', '  serial: UART 9600 baud 8N1', 'link console: UART term.serial ↔ fpga.uart',
    'console TX: term serial.tx → fpga rx (pin J3)', 'console TX: fpga tx (pin A3) → term serial.rx',   // (its wiring, #5216)
    'Process "Check System" of uart_avr.sys.json completed successfully.'].join('\n')]);
  const { wires: w0, ...rest0 } = data0;
  assert.deepEqual(rest0, { project: 'u', file: 'uart_avr.sys.json', ok: true, errors: [], warnings: [] });
  // (its wires, the Wiring view's, #5216: each end's pin, package pin, levels and what the board says the pin is)
  assert.deepEqual(w0[0], { link: 'console', kind: 'uart', signal: 'TX', warnings: [],
    from: { node: 'term', pin: 'serial.tx', loc: null, dir: 'out', volts: null, std: null, place: null },
    to: { node: 'fpga', pin: 'rx', loc: 'J3', dir: 'in', volts: 3.3, std: 'LVCMOS33', place: 'UART RX on a PmodUSBUART in JA (its TXD, JA3)' } });
  // the Arduino on the FPGA's UART: its 5 V TX on the FPGA's input; the terminal then joins nothing
  await write('fw/echo.hex', ':00000001FF\n');
  const uno = { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/echo.hex', interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }] };
  const m = system({ nodes: [uno] }); m.links[0].a = 'uno.Serial';
  await write('uart_avr.sys.json', m);
  const r = await ok('check_system', { project: 'u', file: 'uart_avr.sys.json' });
  const { untrusted, system: _s, wires, ...data } = r.data;
  assert.deepEqual(wires.map(w => [w.from.node, w.to.node, w.warnings.length]), [['uno', 'fpga', 1], ['fpga', 'uno', 0]]);
  assert.match(untrusted.content, /the System's names/, 'the names quoted: untrusted');
  assert.deepEqual(data, { project: 'u', file: 'uart_avr.sys.json', ok: true, errors: [], warnings: [
    { message: 'console: uno\'s D1, a 5 V output, drives fpga\'s rx (pin J3), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards', item: 'console' },
    { message: 'term joins nothing: no link reaches it', item: 'term' }] });
  const desc = t => t.split('\n').filter(l => !/^(WARNING|ERROR|Process)/.test(l));
  assert.ok(r.text.includes('console TX: uno D1 → fpga rx (pin J3), 5 V → 3.3 V\n'), r.text);
  assert.equal(r.text, [...desc(r.text), ...data.warnings.map(w => `WARNING: ${w.message}`), 'Process "Check System" of uart_avr.sys.json completed successfully with 2 warning(s).'].join('\n'));
  // the module's ports, elaborated: TX and RX crossed; a module not in the project; a firmware not in it
  const bad = system({ nodes: [{ ...uno, firmware: 'fw/none.hex' }, { id: 'f2', kind: 'fpga', module: 'nothing', board: 'nexys2', pins: {}, interfaces: [] }] });
  Object.assign(bad.nodes[0].interfaces[0], { tx: 'rx', rx: 'tx' });
  await write('bad.sys.json', bad);
  const e = await ok('check_system', { project: 'u', file: 'bad.sys.json' });
  assert.deepEqual(e.data.errors, [
    { message: 'fpga.uart: its TX rx is an input of uart: TX and RX crossed?', item: 'fpga' },
    { message: 'fpga.uart: its RX tx is an output of uart: TX and RX crossed?', item: 'fpga' },
    { message: 'uno: no firmware fw/none.hex in the project', item: 'uno' },
    { message: 'f2: no module \'nothing\' in the project', item: 'f2' }]);
  assert.deepEqual(e.data.warnings, [{ message: 'uno joins nothing: no link reaches it', item: 'uno' }, { message: 'f2 joins nothing: no link reaches it', item: 'f2' }]);
  assert.equal(e.data.ok, false);
  assert.equal(e.text, [...desc(e.text), ...e.data.errors.map(w => `ERROR: ${w.message}`), ...e.data.warnings.map(w => `WARNING: ${w.message}`),
    'Process "Check System" of bad.sys.json failed (4 error(s), 2 warning(s)).'].join('\n'));
});

test('check_system: not a System document, not in the project, not a System\'s text', async () => {
  const err = async (args, message) => { const r = await call('check_system', args); assert.equal(r.isError, true); assert.equal(r.text, `check_system: ${message}`); };
  await err({ project: 'u', file: 'src/uart.vhd' }, '\'src/uart.vhd\' is not a System document (.sys.json)');
  await err({ project: 'u', file: 'none.sys.json' }, 'no System \'none.sys.json\' in the project \'u\'');
  await write('x.sys.json', '{"format":"silinx-schematic","version":1}');
  await err({ project: 'u', file: 'x.sys.json' }, 'x.sys.json: not a System document (its format is not \'silinx-system\')');
  await write('x.sys.json', '{"format":"silinx-system","version":9}');
  await err({ project: 'u', file: 'x.sys.json' }, 'x.sys.json: a System document of version 9: this Silinx reads version 1');
  await err({ project: 'nope', file: 'x.sys.json' }, 'no System \'x.sys.json\' in the project \'nope\'');
});

test('#4700 edit_system: edits applied in order, written, checked (its warnings); one refused writes nothing', async () => {
  await write('e.sys.json', { format: 'silinx-system', version: 1, name: 'e', nodes: [], links: [] });
  const r = await ok('edit_system', { project: 'u', file: 'e.sys.json', edits: [
    { action: 'add_node', fields: { kind: 'fpga', module: 'uart', board: 'basys2' } },
    { action: 'change_node', node: 'fpga', fields: { variant: '250', pins: { rx: 'J3', tx: 'A3' } } },
    { action: 'add_interface', node: 'fpga', fields: { kind: 'uart', name: 'uart', tx: 'tx', rx: 'rx' } },
    { action: 'add_node', fields: { kind: 'mcu', x: -200 } },
    { action: 'add_link', fields: { a: 'mcu.Serial', b: 'fpga.uart' } },
  ] });
  const warn = "serial: mcu's D1, a 5 V output, drives fpga's rx (pin J3), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards";
  assert.deepEqual(r.text.split('\n'), ['add_node fpga', 'change_node fpga', 'add_interface fpga.uart', 'add_node mcu', 'add_link serial',
    `WARNING: ${warn}`, 'Process "Check System" of e.sys.json completed successfully with 1 warning(s).']);
  assert.deepEqual(r.data.warnings, [{ message: warn, item: 'serial' }]);
  const saved = await ok('check_system', { project: 'u', file: 'e.sys.json' });
  assert.deepEqual(saved.data.system.links, [{ id: 'serial', kind: 'uart', a: 'mcu.Serial', b: 'fpga.uart' }]);
  // one refused: nothing written, and why
  const bad = await call('edit_system', { project: 'u', file: 'e.sys.json', edits: [{ action: 'remove_link', link: 'serial' }, { action: 'add_link', fields: { a: 'mcu.Serial', b: 'nope.x' } }] });
  assert.deepEqual([bad.isError, bad.text], [true, "edit_system: edit 1 (add_link): no node 'nope' in the System (nothing written)"]);
  assert.deepEqual((await ok('check_system', { project: 'u', file: 'e.sys.json' })).data.system.links.length, 1);
  const none = await call('edit_system', { project: 'u', file: 'e.sys.json', edits: [{ action: 'spin' }] });
  assert.deepEqual([none.isError, none.text], [true, 'edit_system: edits[0].action: one of add_node, change_node, remove_node, add_interface, change_interface, remove_interface, add_link, change_link, remove_link']);
});

test('#4701 simulate of a System (Simulate System): an AVR and the uart example\'s FPGA by UART, each wire\'s bytes, the waves\' VCD; what cannot be simulated', async () => {
  const { intelHex, echoProgram } = await import('./avr-asm.mjs');
  await write('fw/echo.hex', intelHex(echoProgram()));
  const uno = { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/echo.hex', interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }] };
  const m = system({ nodes: [uno] }); m.links[0].a = 'uno.Serial';
  m.nodes = m.nodes.filter(n => n.id !== 'term');
  await write('sim.sys.json', m);
  const r = await ok('simulate', { project: 'u', top: 'sim.sys.json', time_ns: 8e6 });
  const { untrusted, ...data } = r.data;
  assert.match(untrusted.content, /the bytes its nodes sent/);
  const text = w => String.fromCharCode(...data.traffic.find(t => t.wire === w).bytes.map(b => b.byte));
  assert.deepEqual(data.traffic.map(t => [t.wire, t.from, t.to]), [['console_uno', 'uno.D1', 'fpga.rx'], ['console_fpga', 'fpga.tx', 'uno.D0']]);
  assert.equal(text('console_uno').slice(0, 6), 'HiIjJk');
  assert.equal(text('console_fpga').slice(0, 5), 'HiIjJ');
  assert.deepEqual([data.time, data.warnings, data.errors, data.vcd, data.terminals], ['8 ms', [], [], 'build/uart_avr.vcd', {}]);
  const lines = r.text.split('\n');
  assert.equal(lines[0], 'Simulate System: 8 ms simulated.');
  assert.match(lines[1], /^console_uno \(uno\.D1 → fpga\.rx, 9600 8N1\): \d+ byte\(s\), the first at [\d.]+ µs: "HiIjJk/);
  assert.equal(lines.at(-1), 'The waves: build/uart_avr.vcd.');
  const vcd = (await ok('read_file', { project: 'u', path: 'build/uart_avr.vcd' })).text;
  assert.match(vcd, /\$scope module uart_avr \$end/);
  assert.match(vcd, /\$var wire 1 \S+ console_uno \$end/);
  // a terminal typing to the FPGA, read back
  const t = system({ nodes: [] });
  await write('term.sys.json', t);
  const e = await ok('simulate', { project: 'u', top: 'term.sys.json', time_ns: 6e6, type: { term: 'OK' } });
  assert.deepEqual(e.data.terminals, { term: 'OK' });
  // the firmware an .elf (avr-gcc's): its bytes read by server/projects.js readFileBytes, the page's read (#5198); the same bytes
  const { avrElf } = await import('./avr-asm.mjs');
  const P = await import('../server/projects.js');
  fs.writeFileSync(`${P.projectDir('u')}/fw/echo.elf`, avrElf(echoProgram()));
  await write('elf.sys.json', { ...m, nodes: m.nodes.map(n => (n.id === 'uno' ? { ...n, firmware: 'fw/echo.elf' } : n)) });
  const elf = await ok('simulate', { project: 'u', top: 'elf.sys.json', time_ns: 8e6 });
  assert.deepEqual([elf.data.traffic.map(t => t.bytes.map(b => b.byte)), elf.data.warnings], [data.traffic.map(t => t.bytes.map(b => b.byte)), []]);
  // what cannot be simulated: said, nothing run
  const bad = async (args, message) => { const x = await call('simulate', args); assert.deepEqual([x.isError, x.text], [true, `simulate: ${message}`]); };
  await write('nofw.sys.json', { ...m, nodes: m.nodes.map(n => (n.id === 'uno' ? { ...n, firmware: null } : n)) });
  await bad({ project: 'u', top: 'nofw.sys.json' }, 'nofw.sys.json: uno: no firmware: a .hex or an .elf of the project');
  await bad({ project: 'u', top: 'term.sys.json', type: { nope: 'x' } }, 'type: no terminal \'nope\' in the System');
  await bad({ project: 'u', type: { term: 'x' } }, 'type: a System\'s terminals (top: a .sys.json)');
});

test('#5212 simulate of a System with controls (Emulate System): BTN0 pressed on the FPGA\'s board, its message in the terminal, what the boards show; the wrong controls refused', async () => {
  // the FPGA node's pins its UCF's: BTN0, LD7..LD0, the display
  const ucf = fs.readFileSync(new URL('../examples/uart/constraints/top.ucf', import.meta.url), 'utf8');
  const pins = Object.fromEntries([...ucf.matchAll(/^NET "([^"]+)"\s+LOC = "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
  const m = system();
  m.nodes = m.nodes.map((n) => (n.id === 'fpga' ? { ...n, pins } : n));
  await write('emu.sys.json', m);
  const r = await ok('simulate', { project: 'u', top: 'emu.sys.json', time_ns: 60e6, type: { term: 'A' }, controls: [{ node: 'fpga', control: 'btn0', on: true, at_ns: 5e6 }, { node: 'fpga', control: 'btn0', on: false, at_ns: 30e6 }] });
  assert.equal(r.data.terminals.term, 'AHello from Silinx!\r\n');
  assert.deepEqual(r.data.boards.fpga.leds, [1, 0, 0, 0, 0, 0, 1, 0], 'the last byte received: A');
  const lines = r.text.split('\n');
  assert.equal(lines.at(-2), 'fpga\'s board: LEDs LD0 LD6; display 0141.');
  assert.deepEqual([r.data.warnings, r.data.errors], [[], []]);
  // (with no controls: no board emulated, as before)
  assert.equal((await ok('simulate', { project: 'u', top: 'emu.sys.json', time_ns: 2e6 })).data.boards, undefined);
  const bad = async (controls, message) => { const x = await call('simulate', { project: 'u', top: 'emu.sys.json', time_ns: 2e6, controls }); assert.deepEqual([x.isError, x.text], [true, `simulate: ${message}`]); };
  await bad([{ node: 'term', control: 'btn0', on: true }], 'controls[0]: no FPGA node \'term\' with a board, nor a circuit, in the System');
  await bad([{ node: 'fpga', control: 'sw3', on: true }], 'controls[0]: no switch or button \'sw3\' of fpga\'s board linked to its module (btn0)');
  await bad([{ node: 'fpga', control: 'btn0', on: true, at_ns: 5e6 }], 'controls[0]: at_ns from 0 to the run\'s time');
});

test('#5215 a circuit node by edit_system, checked and simulated: the Uno\'s D2 lights its LED and presses the FPGA\'s button; the FPGA\'s LD0 lights the other', async () => {
  const { intelHex, avrAssemble } = await import('./avr-asm.mjs');
  // the Uno: D2 an output, high
  await write('fw/d2.hex', intelHex(avrAssemble(['ldi r16, 0x04', 'out 0x0a, r16', 'out 0x0b, r16', 'loop:', 'rjmp loop'])));
  // the bench: the Uno's D2 to the Basys2's JB1 (the FPGA's btn<0>, C6) and to the LED D1; the Basys2's JB3 (led<0>, C5) to D2
  await write('src/bench.circ.json', { format: 'silinx-circuit', version: 1, name: 'bench', lang: 'vhdl',
    parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'F1', type: 'fpga-basys2', x: 0, y: 30, label: 'fpga' }, { id: 'D1', type: 'led', x: 20, y: -5, color: 'red' }, { id: 'D2', type: 'led', x: 12, y: 26, color: 'red' }],
    wires: [{ id: 'w1', points: [[16, 0], [9, 30]], color: 'blue' }, { id: 'w2', points: [[16, 0], [20, -5]], color: 'blue' }, { id: 'w3', points: [[21, -5], [3, 0]], color: 'black' },
      { id: 'w5', points: [[11, 30], [12, 26]], color: 'blue' }, { id: 'w6', points: [[13, 26], [4, 30]], color: 'black' }] });
  const m = system({ nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/d2.hex', interfaces: [] }] });
  m.nodes[0].pins = { clk: 'B8', rx: 'J3', tx: 'A3', 'btn<0>': 'C6', 'led<0>': 'C5' };
  await write('bench.sys.json', m);
  const e = await ok('edit_system', { project: 'u', file: 'bench.sys.json', edits: [{ action: 'add_node', fields: { kind: 'circuit', id: 'bench', circuit: 'src/bench.circ.json', x: 300, y: 0 } }] });
  const HOT = 'bench: A1 D2 (uno\'s, 5 V) and F1 JB1 (fpga\'s btn<0>, pin C6, a 3.3 V input) are on one net: a level shifter or a divider on the real boards';
  assert.deepEqual(e.text.split('\n'), ['add_node bench', `WARNING: ${HOT}`, 'Process "Check System" of bench.sys.json completed successfully with 1 warning(s).']);
  // checked: described (the circuit node), its 5 V pin on the FPGA's 3.3 V input; the Uno, reached by the circuit, joins something
  const c = await ok('check_system', { project: 'u', file: 'bench.sys.json' });
  assert.ok(c.text.split('\n').includes('node bench: circuit src/bench.circ.json'));
  assert.deepEqual(c.text.split('\n').slice(-2), [`WARNING: ${HOT}`, 'Process "Check System" of bench.sys.json completed successfully with 1 warning(s).']);
  assert.deepEqual(c.data.warnings, [{ message: HOT, item: 'bench' }]);
  // simulated: A echoed, then the button's message (pressed by the Uno's D2 through the circuit); both LEDs lit
  const r = await ok('simulate', { project: 'u', top: 'bench.sys.json', time_ns: 60e6, type: { term: 'A' } });
  assert.equal(r.data.terminals.term, 'AHello from Silinx!\r\n');
  assert.deepEqual(r.data.circuits, { bench: { D1: { on: true, times: 1 }, D2: { on: true, times: 1 } } });
  const lines = r.text.split('\n');
  assert.deepEqual(lines.slice(3, 8), ['bench_A1_D2 (uno.D2 → bench.A1:D2): 3 change(s)', 'bench_A1_D2_back (bench.A1:D2 → uno.D2): 3 change(s)', 'bench_F1_JB1 (bench.F1:JB1 → fpga.btn): 3 change(s)',
    'bench_F1_JB3 (fpga.led[0] → bench.F1:JB3): 2 change(s)', 'terminal term: "AHello from Silinx!\\r\\n"']);
  assert.equal(lines[8], 'circuit bench: D1 on, lit 1 time(s); D2 on, lit 1 time(s)');
  assert.deepEqual([r.data.warnings, r.data.errors], [[], []]);
  // its circuit not there: the run refused, said
  await ok('edit_system', { project: 'u', file: 'bench.sys.json', edits: [{ action: 'change_node', node: 'bench', fields: { circuit: 'src/none.circ.json' } }] });
  const x = await call('simulate', { project: 'u', top: 'bench.sys.json', time_ns: 1e6 });
  assert.equal(x.isError, true);
  assert.match(x.text, /^simulate: bench\.sys\.json: bench: its circuit src\/none\.circ\.json cannot be read: /);
});

test('#5322 simulate with controls on a circuit node: its switch S1 set at 5 ms presses the FPGA\'s button (its message); what its LEDs show; a wrong control refused', async () => {
  // the bench: the Basys2's JB1 (the FPGA's btn<0>, C6) driven by the logic switch S1, its JB3 (led<0>, C5) lighting D2
  await write('src/emu.circ.json', { format: 'silinx-circuit', version: 1, name: 'emu', lang: 'vhdl',
    parts: [{ id: 'F1', type: 'fpga-basys2', x: 0, y: 30, label: 'fpga' }, { id: 'S1', type: 'logic-switch', x: 8, y: 25 }, { id: 'D2', type: 'led', x: 12, y: 26, color: 'red' }],
    wires: [{ id: 'w1', points: [[8, 25], [9, 30]], color: 'blue' }, { id: 'w5', points: [[11, 30], [12, 26]], color: 'blue' }, { id: 'w6', points: [[13, 26], [4, 30]], color: 'black' }] });
  const m = system({ nodes: [{ id: 'bench', kind: 'circuit', circuit: 'src/emu.circ.json', interfaces: [] }] });
  m.nodes[0].pins = { clk: 'B8', rx: 'J3', tx: 'A3', 'btn<0>': 'C6', 'led<0>': 'C5' };
  await write('emuc.sys.json', m);
  const r = await ok('simulate', { project: 'u', top: 'emuc.sys.json', time_ns: 60e6, type: { term: 'A' }, controls: [{ node: 'bench', control: 'S1', on: true, at_ns: 5e6 }] });
  assert.equal(r.data.terminals.term, 'AHello from Silinx!\r\n');
  assert.deepEqual(r.data.boards.bench, { leds: { D2: 'on' }, lcds: {}, oleds: {}, sensors: {}, servos: {}, buzzers: {}, steppers: {}, sds: {}, sonars: {}, pirs: {}, dhts: {}, inputs: { S1: true }, lit: ['D2'] }, 'LD0: the last byte\'s bit 0 (no LCD, OLED, sensor, servo, buzzer, stepper, SD card, ultrasonic, motion nor DHT sensor: #5345, #5371, #5454, #5456, #5463, #5470, #5476, #5477)');
  assert.deepEqual(r.text.split('\n').slice(-3, -1), ['fpga\'s board: LEDs off.', 'bench\'s circuit: lit D2.'], r.text);
  assert.deepEqual([r.data.warnings, r.data.errors], [[], []]);
  const x = await call('simulate', { project: 'u', top: 'emuc.sys.json', time_ns: 2e6, controls: [{ node: 'bench', control: 'S9', on: true }] });
  assert.deepEqual([x.isError, x.text], [true, 'simulate: controls[0]: no switch or button \'S9\' in the circuit bench (S1)']);
  const y = await call('simulate', { project: 'u', top: 'emuc.sys.json', time_ns: 2e6, controls: [{ node: 'term', control: 'S1', on: true }] });
  assert.deepEqual([y.isError, y.text], [true, 'simulate: controls[0]: no FPGA node \'term\' with a board, nor a circuit, in the System']);
});

test('#5342 simulate with a control on a circuit\'s temperature sensor: its value (°C) at its time, its OS; a value that is no temperature refused', async () => {
  const uno = (name) => ({ D2: [16, 0], GND: [3, 0], '5V': [5, 19] })[name];
  // the LM75 powered by the Uno, its OS pulled up
  await write('src/temp.circ.json', { format: 'silinx-circuit', version: 1, name: 'temp', lang: 'vhdl',
    parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'U1', type: 'lm75', x: 30, y: 25, temp: 25 }, { id: 'R1', type: 'pull-up', x: 36, y: 20 }],
    wires: [{ id: 'v', points: [uno('5V'), [30, 22]], color: 'red' }, { id: 'g', points: [uno('GND'), [33, 25]], color: 'black' }, { id: 'o', points: [[36, 20], [32, 25]], color: 'blue' }] });
  const m = { format: 'silinx-system', version: 1, name: 'temp', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/d2.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/temp.circ.json', interfaces: [] }], links: [] };
  await write('temp.sys.json', m);
  const r = await ok('simulate', { project: 'u', top: 'temp.sys.json', time_ns: 5e6, controls: [{ node: 'bench', control: 'U1', value: 90, at_ns: 1e6 }] });
  const lines = r.text.split('\n');
  assert.ok(lines.includes('circuit bench: U1 90.0 °C, OS active'), r.text);
  assert.equal(lines.at(-2), 'bench\'s circuit: lit none; U1 90.0 °C.');
  assert.deepEqual(r.data.boards.bench.sensors.U1.temp, 90);
  const x = await call('simulate', { project: 'u', top: 'temp.sys.json', time_ns: 2e6, controls: [{ node: 'bench', control: 'U1', value: 'hot' }] });
  assert.deepEqual([x.isError, x.text], [true, 'simulate: controls[0]: U1\'s value: a temperature (°C)']);
});

test('#5456 simulate with a control on a circuit\'s ultrasonic sensor: its distance (cm) at its time, an Uno measuring it; a distance out of its range refused', async () => {
  const uno = (name) => ({ D8: [9, 0], D7: [11, 0], GND: [3, 0], '5V': [8, 19] })[name];
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  // the Uno's D8 its Trig (1 for about 13 µs after 1 ms), D7 its Echo, waited for and timed by Timer1 at clk/8
  await write('fw/sonar.hex', intelHex(avrAssemble(['ldi r16, 0x01', 'out 0x04, r16', 'ldi r16, 0x02', 'sts 0x81, r16', 'ldi r18, 0', 'wait:', 'ldi r17, 255', 'w1:', 'dec r17', 'brne w1', 'inc r18', 'sbrs r18, 5', 'rjmp wait',
    'ldi r16, 0x01', 'out 0x05, r16', 'ldi r17, 70', 'trig:', 'dec r17', 'brne trig', 'ldi r16, 0x00', 'out 0x05, r16', 'end:', 'rjmp end'])));
  await write('src/son.circ.json', { format: 'silinx-circuit', version: 1, name: 'son', lang: 'vhdl',
    parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'US1', type: 'hc-sr04', x: 30, y: 30, cm: 50 }],
    wires: [{ id: 'v', points: [uno('5V'), [30, 30]], color: 'red' }, { id: 't', points: [uno('D8'), [31, 30]], color: 'blue' }, { id: 'e', points: [uno('D7'), [32, 30]], color: 'blue' }, { id: 'g', points: [uno('GND'), [33, 30]], color: 'black' }] });
  await write('son.sys.json', { format: 'silinx-system', version: 1, name: 'son', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/sonar.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/son.circ.json', interfaces: [] }], links: [] });
  const r = await ok('simulate', { project: 'u', top: 'son.sys.json', time_ns: 12e6, controls: [{ node: 'bench', control: 'US1', value: 120, at_ns: 0 }] });
  const lines = r.text.split('\n');
  assert.ok(lines.includes('circuit bench: US1 120 cm, its last echo 6997.1 µs'), r.text);
  assert.equal(lines.at(-2), 'bench\'s circuit: lit none; US1 120 cm.');
  assert.deepEqual(r.data.boards.bench.sonars.US1, { cm: 120, measuring: false, echo: 6997.1 });
  const x = await call('simulate', { project: 'u', top: 'son.sys.json', time_ns: 2e6, controls: [{ node: 'bench', control: 'US1', value: 500 }] });
  assert.deepEqual([x.isError, x.text], [true, 'simulate: controls[0]: US1\'s value: distance (cm) from 2 to 400']);
});

test('#5463 simulate with a control on a circuit\'s motion sensor: someone moving at its time (on, then off), an Uno copying its OUT to D13; its line', async () => {
  const uno = (name) => ({ D2: [16, 0], GND: [3, 0], '5V': [8, 19] })[name];
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  await write('fw/pir.hex', intelHex(avrAssemble(['ldi r16, 0x20', 'out 0x04, r16', 'loop:', 'in r16, 0x09', 'sbrs r16, 2', 'rjmp off', 'ldi r17, 0x20', 'out 0x05, r17', 'rjmp loop', 'off:', 'ldi r17, 0x00', 'out 0x05, r17', 'rjmp loop'])));
  await write('src/pir.circ.json', { format: 'silinx-circuit', version: 1, name: 'pir', lang: 'vhdl',
    parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'PIR1', type: 'hc-sr501', x: 30, y: 30 }],
    wires: [{ id: 'v', points: [uno('5V'), [30, 30]], color: 'red' }, { id: 'o', points: [uno('D2'), [31, 30]], color: 'blue' }, { id: 'g', points: [uno('GND'), [32, 30]], color: 'black' }] });
  await write('pir.sys.json', { format: 'silinx-system', version: 1, name: 'pir', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/pir.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/pir.circ.json', interfaces: [] }], links: [] });
  const r = await ok('simulate', { project: 'u', top: 'pir.sys.json', time_ns: 2e9, controls: [{ node: 'bench', control: 'PIR1', on: true, at_ns: 1e6 }, { node: 'bench', control: 'PIR1', on: false, at_ns: 5e8 }] });
  const lines = r.text.split('\n');
  assert.ok(lines.includes('circuit bench: PIR1 sees movement (OUT 1)'), r.text);
  assert.equal(lines.at(-2), 'bench\'s circuit: lit none; PIR1 OUT 1.');
  assert.deepEqual(r.data.boards.bench.pirs.PIR1, { moving: false, out: true, blind: false });
  assert.equal(r.data.boards.uno.pins.D13, 1, 'the Uno lights its LED');
});

test('#5470 simulate with controls on a circuit\'s DHT22: its temperature and humidity by DHT1.temp and DHT1.hum; out of range refused', async () => {
  const uno = (name) => ({ D2: [16, 0], GND: [3, 0], '5V': [8, 19] })[name];
  await write('src/dht.circ.json', { format: 'silinx-circuit', version: 1, name: 'dht', lang: 'vhdl',
    parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'DHT1', type: 'dht22', x: 30, y: 30 }, { id: 'R1', type: 'pull-up', x: 31, y: 33 }],
    wires: [{ id: 'v', points: [uno('5V'), [30, 30]], color: 'red' }, { id: 'd', points: [uno('D2'), [31, 30]], color: 'blue' }, { id: 'r', points: [[31, 30], [31, 33]], color: 'blue' }, { id: 'g', points: [uno('GND'), [33, 30]], color: 'black' }] });
  await write('dht.sys.json', { format: 'silinx-system', version: 1, name: 'dht', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/d2.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/dht.circ.json', interfaces: [] }], links: [] });
  const r = await ok('simulate', { project: 'u', top: 'dht.sys.json', time_ns: 2e6, controls: [{ node: 'bench', control: 'DHT1.temp', value: -5.5, at_ns: 0 }, { node: 'bench', control: 'DHT1.hum', value: 72.4, at_ns: 1e6 }] });
  const lines = r.text.split('\n');
  assert.ok(lines.includes('circuit bench: DHT1 -5.5 °C, 72.4 %, 0 read(s) answered'), r.text);
  assert.equal(lines.at(-2), 'bench\'s circuit: lit none; DHT1 -5.5 °C 72.4 %.');
  assert.deepEqual(r.data.boards.bench.dhts.DHT1, { temp: -5.5, hum: 72.4, reads: 0 });
  const x = await call('simulate', { project: 'u', top: 'dht.sys.json', time_ns: 2e6, controls: [{ node: 'bench', control: 'DHT1.hum', value: 120 }] });
  assert.deepEqual([x.isError, x.text], [true, 'simulate: controls[0]: DHT1.hum\'s value: humidity (%) from 0 to 100']);
});
