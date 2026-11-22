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
    'Process "Check System" of uart_avr.sys.json completed successfully.'].join('\n')]);
  assert.deepEqual(data0, { project: 'u', file: 'uart_avr.sys.json', ok: true, errors: [], warnings: [] });
  // the Arduino on the FPGA's UART: its 5 V TX on the FPGA's input; the terminal then joins nothing
  await write('fw/echo.hex', ':00000001FF\n');
  const uno = { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/echo.hex', interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }] };
  const m = system({ nodes: [uno] }); m.links[0].a = 'uno.Serial';
  await write('uart_avr.sys.json', m);
  const r = await ok('check_system', { project: 'u', file: 'uart_avr.sys.json' });
  const { untrusted, system: _s, ...data } = r.data;
  assert.match(untrusted.content, /the System's names/, 'the names quoted: untrusted');
  assert.deepEqual(data, { project: 'u', file: 'uart_avr.sys.json', ok: true, errors: [], warnings: [
    { message: 'console: uno\'s D1, a 5 V output, drives fpga\'s rx (pin J3), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards', item: 'console' },
    { message: 'term joins nothing: no link reaches it', item: 'term' }] });
  const desc = t => t.split('\n').filter(l => !/^(WARNING|ERROR|Process)/.test(l));
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
