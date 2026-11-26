// The System example uart-avr and New Project's System projects (#4702, core/project-kind.js): its FPGA module the
// uart example's (the same sources), its Arduino's firmware the assembled hello.asm; made from the example with the MCP
// server, its System checked (its one warning, a 5 V output on the FPGA's 3.3 V input: the lesson) and simulated (the
// Arduino's "Hello from Arduino!" echoed by the FPGA, no warnings). The kinds' rules: a System project empty (its
// System document) or from a System example; a System example only a System project's.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';
import { ROOT } from './examples-lib.mjs';
import { avrAssemble, intelHex } from './avr-asm.mjs';
import { createRefusal, boardRefusal, asSystemProject, isSystemProject, SYSTEM_EXAMPLES } from '../core/project-kind.js';
import { newProjectJson } from '../core/project-defaults.js';
import { newSystemFile, readSystem } from '../core/system-doc.js';

const EX = path.join(ROOT, 'examples/uart-avr');
let tmp;
before(async () => { tmp = await scratchEnv('silinx-system-example-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

test('#4702 uart-avr: its FPGA module the uart example\'s sources, its firmware hello.asm assembled, its System the format\'s', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'examples/uart/src'))) {
    assert.equal(fs.readFileSync(path.join(EX, 'fpga', f), 'utf8'), fs.readFileSync(path.join(ROOT, 'examples/uart/src', f), 'utf8'), `fpga/${f} as the uart example's`);
  }
  const asm = fs.readFileSync(path.join(EX, 'uno/hello.asm'), 'utf8').split('\n');
  assert.equal(fs.readFileSync(path.join(EX, 'uno/hello.hex'), 'utf8'), intelHex(avrAssemble(asm)));
  const pj = JSON.parse(fs.readFileSync(path.join(EX, 'silinx.json'), 'utf8'));
  assert.deepEqual([pj.kind, pj.board, pj.constraints, pj.top], ['system', null, null, '']);   // (the example's own silinx.json: a kind of before #5440, read as the System profile)
  const sys = readSystem(fs.readFileSync(path.join(EX, 'uart_avr.sys.json'), 'utf8'));
  assert.deepEqual(sys.system.links, [{ id: 'serial', kind: 'uart', a: 'uno.Serial', b: 'fpga.uart' }]);
  assert.deepEqual(SYSTEM_EXAMPLES, ['uart-avr', 'spi-avr', 'i2c-avr', 'regs-avr', 'uart-pic24', 'adc-pmod']);
});

test('#4702 the kinds\' rules: a System project empty or from a System example; a new one\'s silinx.json and System', () => {
  assert.equal(createRefusal('system', 'empty'), null);
  assert.equal(createRefusal('system', 'uart-avr'), null);
  assert.equal(createRefusal(null, 'uart'), null);
  assert.equal(createRefusal('system', 'uart'), 'a System project starts empty or from a System example (uart-avr, spi-avr, i2c-avr, regs-avr, uart-pic24, adc-pmod)');
  assert.equal(createRefusal(null, 'uart-avr'), null);   // (the example's kind)
  assert.equal(createRefusal('design', 'uart-avr'), 'a design and simulation project starts empty: no example');
  // (fpga a profile's id, #5440: an FPGA project, never from a System example)
  assert.equal(createRefusal('fpga', 'uart-avr'), 'an FPGA project starts from an FPGA example: uart-avr is a System example');
  assert.equal(createRefusal('fpga', 'uart'), null);
  assert.equal(boardRefusal({ name: 'uart-avr', kind: 'system' }, { board: 'basys2' }), 'uart-avr: a System project has no board: its System names each FPGA node\'s');
  assert.equal(boardRefusal({ name: 'uart', board: 'basys2' }, { board: 'nexys2' }), null);
  assert.equal(createRefusal('design', 'uart'), 'a design and simulation project starts empty: no example');
  assert.equal(createRefusal('pico', 'empty'), 'unknown project kind \'pico\'');
  const j = newProjectJson('sys1', { kind: 'system' });
  assert.deepEqual([j.kind, j.profile, j.board, j.constraints, j.top, isSystemProject(j)], [undefined, 'system', null, null, '', true]);   // (its profile, #5440)
  assert.deepEqual(asSystemProject({ name: 'x', board: 'basys2', constraints: 'c.ucf', top: 'uart' }), { name: 'x', board: null, constraints: null, top: '', profile: 'system', topSourceType: 'system' });   // (its top type System, #5402)
  assert.deepEqual(newSystemFile('sys1'), { path: 'sys1.sys.json', text: '{\n  "format": "silinx-system",\n  "version": 2,\n  "name": "sys1",\n  "nodes": [],\n  "links": []\n}\n' });
});

test('#4702 uart-avr made with the MCP server: its System checked (the 5 V warning) and simulated (the Arduino\'s hello echoed)', async () => {
  // (listed after the FPGA examples, as the System ones: uart-avr, spi-avr, i2c-avr, regs-avr, uart-pic24, adc-pmod)
  const ex = await ok('list_examples', {});
  assert.deepEqual(ex.text.split('\n').slice(-6, -2), ['uart-avr: a System example (FPGA and microcontroller nodes in a System), 5 file(s)', 'spi-avr: a System example (FPGA and microcontroller nodes in a System), 1 file(s)', 'i2c-avr: a System example (FPGA and microcontroller nodes in a System), 1 file(s)', 'regs-avr: a System example (FPGA and microcontroller nodes in a System), 2 file(s)']);
  assert.deepEqual(ex.data.examples.at(-6), { name: 'uart-avr', kind: 'system', top: null, simTop: null, board: null, device: null, files: 5 });
  await ok('new_project_from_example', { name: 'ua', example: 'uart-avr' });
  const warn = "serial: uno's D1, a 5 V output, drives fpga's rx (pin J3), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards";
  const c = await ok('check_system', { project: 'ua', file: 'uart_avr.sys.json' });
  assert.deepEqual(c.text.split('\n'), ['System uart_avr: 2 nodes, 1 link', 'node uno: Arduino Uno, firmware uno/hello.hex, in C', '  Serial: UART 9600 baud 8N1, TX D1, RX D0',
    'node fpga: FPGA, module uart on basys2-250, in VHDL', '  uart: UART 9600 baud 8N1, TX tx (A3), RX rx (J3)', 'link serial: UART uno.Serial ↔ fpga.uart',
    'serial TX: uno D1 → fpga rx (pin J3), 5 V → 3.3 V', 'serial TX: fpga tx (pin A3) → uno D0',   // (its wiring, #5216)
    `WARNING: ${warn}`, 'Process "Check System" of uart_avr.sys.json completed successfully with 1 warning(s).']);
  const s = await ok('simulate', { project: 'ua', time_ns: 30e6 });
  const text = w => String.fromCharCode(...s.data.traffic.find(t => t.wire === w).bytes.map(b => b.byte));
  assert.equal(text('serial_uno'), 'Hello from Arduino!\r\n');
  assert.equal(text('serial_fpga'), 'Hello from Arduino!\r\n');
  assert.deepEqual([s.data.warnings, s.data.errors], [[], []]);
  // emulated (Emulate System, #5212): the FPGA's LEDs the last byte it received (LF, 0x0A), the Uno's D8..D13 the last
  // byte the FPGA echoed (its PORTB: D9 and D11 high)
  const e = await ok('simulate', { project: 'ua', time_ns: 50e6, controls: [] });   // (quiet in its last 10 ms)
  assert.deepEqual(e.data.boards.fpga.leds, [0, 1, 0, 1, 0, 0, 0, 0]);
  assert.deepEqual(['D8', 'D9', 'D10', 'D11', 'D12', 'D13'].map((p) => e.data.boards.uno.pins[p]), [0, 1, 0, 1, 0, 0]);
  // (not an FPGA project's example)
  const r = await call('new_project_from_example', { name: 'ub', example: 'uart-avr', board: 'nexys2' });
  assert.deepEqual([r.isError, r.text], [true, 'new_project_from_example: ub: a System project has no board: its System names each FPGA node\'s']);
});

test('#5214 spi-avr: its firmware spi.asm assembled; made with the MCP server, its System checked (its 5 V warnings) and simulated (the counts sent, each answered with the one before plus one)', async () => {
  const SPI = path.join(ROOT, 'examples/spi-avr');
  assert.equal(fs.readFileSync(path.join(SPI, 'uno/spi.hex'), 'utf8'), intelHex(avrAssemble(fs.readFileSync(path.join(SPI, 'uno/spi.asm'), 'utf8').split('\n'))));
  assert.deepEqual(readSystem(fs.readFileSync(path.join(SPI, 'spi_avr.sys.json'), 'utf8')).system.links, [{ id: 'spi', kind: 'spi', a: 'uno.SPI', b: 'fpga.bus' }]);
  await ok('new_project_from_example', { name: 'sa', example: 'spi-avr' });
  const W = (pin, port, loc) => `WARNING: spi: uno's ${pin}, a 5 V output, drives fpga's ${port} (pin ${loc}), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards`;
  const c = await ok('check_system', { project: 'sa', file: 'spi_avr.sys.json' });
  assert.deepEqual(c.text.split('\n'), ['System spi_avr: 2 nodes, 1 link', 'node uno: Arduino Uno, firmware uno/spi.hex, in C', '  Serial: UART 9600 baud 8N1, TX D1, RX D0',
    '  SPI: SPI 125000 Hz mode 0, SCK D13, MOSI D11, MISO D12, SS D10', 'node fpga: FPGA, module spi_echo on basys2-250, in VHDL',
    '  bus: SPI 125000 Hz mode 0, SCK sck (B2), MOSI mosi (A3), MISO miso (J3), SS ss (B5)', 'link spi: SPI uno.SPI ↔ fpga.bus',
    'spi SCK: uno D13 → fpga sck (pin B2), 5 V → 3.3 V', 'spi MOSI: uno D11 → fpga mosi (pin A3), 5 V → 3.3 V', 'spi MISO: fpga miso (pin J3) → uno D12',
    'spi SS: uno D10 → fpga ss (pin B5), 5 V → 3.3 V',   // (its wiring, #5216)
    W('D13', 'sck', 'B2'), W('D11', 'mosi', 'A3'), W('D10', 'ss', 'B5'), 'Process "Check System" of spi_avr.sys.json completed successfully with 3 warning(s).']);
  // three transfers in 120 ms (one every 47 ms or so): 00 01 02 sent, 00 01 02 answered (the first 0x00, then each the one before plus one)
  const s = await ok('simulate', { project: 'sa', time_ns: 120e6 });
  assert.deepEqual(s.data.spi.map((x) => x.transfers.map((t) => [t.mosi, t.miso])), [[[0, 0], [1, 1], [2, 2]]]);
  assert.deepEqual([s.data.warnings, s.data.errors], [[], []]);
  // edit_system as the editor: the link removed, the FPGA's SPI removed, both added back (its ports, then the link)
  const e = await ok('edit_system', { project: 'sa', file: 'spi_avr.sys.json', edits: [
    { action: 'remove_link', link: 'spi' }, { action: 'remove_interface', node: 'fpga', interface: 'bus' },
    { action: 'add_interface', node: 'fpga', fields: { kind: 'spi', name: 'bus', sck: 'sck', mosi: 'mosi', miso: 'miso', ss: 'ss' } },
    { action: 'add_link', fields: { a: 'uno.SPI', b: 'fpga.bus' } }] });
  const sys = readSystem(fs.readFileSync(path.join(tmp, 'ws', 'sa', 'spi_avr.sys.json'), 'utf8')).system;
  assert.deepEqual([sys.links, sys.nodes[1].interfaces], [[{ id: 'spi', kind: 'spi', a: 'uno.SPI', b: 'fpga.bus' }], [{ name: 'bus', kind: 'spi', sck: 'sck', mosi: 'mosi', miso: 'miso', ss: 'ss', hz: 125000, mode: 0 }]]);
  assert.deepEqual(e.text.split('\n').slice(0, 4), ['remove_link spi', 'remove_interface fpga.bus', 'add_interface fpga.bus', 'add_link spi']);
});

test('#5214 i2c-avr: its firmware i2c.asm assembled; made with the MCP server, its System checked (its 5 V warnings), simulated (the counts written, the switches read) and emulated (SW1, SW3 and SW6 on: the Uno\'s D3 and D6)', async () => {
  const I2C = path.join(ROOT, 'examples/i2c-avr');
  assert.equal(fs.readFileSync(path.join(I2C, 'uno/i2c.hex'), 'utf8'), intelHex(avrAssemble(fs.readFileSync(path.join(I2C, 'uno/i2c.asm'), 'utf8').split('\n'))));
  assert.deepEqual(readSystem(fs.readFileSync(path.join(I2C, 'i2c_avr.sys.json'), 'utf8')).system.links, [{ id: 'i2c', kind: 'i2c', a: 'uno.Wire', b: 'fpga.bus' }]);
  await ok('new_project_from_example', { name: 'ia', example: 'i2c-avr' });
  const W = (pin, port, loc) => `WARNING: i2c: uno's ${pin}, a 5 V output, drives fpga's ${port} (pin ${loc}), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards`;
  const c = await ok('check_system', { project: 'ia', file: 'i2c_avr.sys.json' });
  assert.deepEqual(c.text.split('\n'), ['System i2c_avr: 2 nodes, 1 link', 'node uno: Arduino Uno, firmware uno/i2c.hex, in C', '  Wire: I²C 100000 Hz, SCL A5, SDA A4',
    'node fpga: FPGA, module i2c_leds on basys2-250, in VHDL', '  bus: I²C 100000 Hz, SCL scl (B2), SDA sda (A3)', 'link i2c: I²C uno.Wire ↔ fpga.bus',
    'i2c SCL: uno A5 → fpga scl (pin B2), 5 V → 3.3 V', 'i2c SDA: uno A4 → fpga sda (pin A3), 5 V → 3.3 V',   // (its wiring, #5216)
    W('A5', 'scl', 'B2'), W('A4', 'sda', 'A3'), 'Process "Check System" of i2c_avr.sys.json completed successfully with 2 warning(s).']);
  // two counts in 60 ms (one every 47 ms or so): 00 then 01 written, the switches (all off: 00) read after each
  const s = await ok('simulate', { project: 'ia', time_ns: 60e6 });
  assert.deepEqual(s.data.i2c.map((x) => [x.link, x.hz, x.transfers.map((t) => [t.read, t.addr, t.data.map((d) => d.byte)])]), [['i2c', 100000, [[false, 0x42, [0]], [true, 0x42, [0]], [false, 0x42, [1]], [true, 0x42, [0]]]]]);
  assert.deepEqual([s.data.warnings, s.data.errors], [[], []]);
  // emulated: SW1, SW3 and SW6 on from the start (0x4A): read back, on the Uno's D3 and D6 (its PORTD's bits 2..7); the
  // FPGA's LEDs the last count, 1
  const e = await ok('simulate', { project: 'ia', time_ns: 60e6, controls: [1, 3, 6].map((k) => ({ node: 'fpga', control: `sw${k}`, on: true, at_ns: 0 })) });
  assert.deepEqual(['D2', 'D3', 'D4', 'D5', 'D6', 'D7'].map((p) => e.data.boards.uno.pins[p]), [0, 1, 0, 0, 1, 0]);
  assert.deepEqual(e.data.boards.fpga.leds, [1, 0, 0, 0, 0, 0, 0, 0]);
  // edit_system as the editor: the link removed, the FPGA's I²C removed, both added back (its ports, then the link)
  const ed = await ok('edit_system', { project: 'ia', file: 'i2c_avr.sys.json', edits: [
    { action: 'remove_link', link: 'i2c' }, { action: 'remove_interface', node: 'fpga', interface: 'bus' },
    { action: 'add_interface', node: 'fpga', fields: { kind: 'i2c', name: 'bus', scl: 'scl', sda: 'sda' } },
    { action: 'add_link', fields: { a: 'uno.Wire', b: 'fpga.bus' } }] });
  const sys = readSystem(fs.readFileSync(path.join(tmp, 'ws', 'ia', 'i2c_avr.sys.json'), 'utf8')).system;
  assert.deepEqual([sys.links, sys.nodes[1].interfaces], [[{ id: 'i2c', kind: 'i2c', a: 'uno.Wire', b: 'fpga.bus' }], [{ name: 'bus', kind: 'i2c', scl: 'scl', sda: 'sda', hz: 100000 }]]);
  assert.deepEqual(ed.text.split('\n').slice(0, 4), ['remove_link i2c', 'remove_interface fpga.bus', 'add_interface fpga.bus', 'add_link i2c']);
});

test('#5288 regs-avr: its map\'s slave generated from it, its firmware regs.asm assembled; made with the MCP server, checked, simulated (the register accesses: clear, duty written, count read) and emulated (its LEDs the duty)', async () => {
  const RA = path.join(ROOT, 'examples/regs-avr');
  const { readRegmap } = await import('../core/regmap.js');
  const { generateRegmap } = await import('../core/regmap-hdl.js');
  const map = readRegmap(fs.readFileSync(path.join(RA, 'fpga/pwm_regs.regs.json'), 'utf8')).regmap;
  assert.equal(fs.readFileSync(path.join(RA, 'fpga/pwm_regs.vhd'), 'utf8'), generateRegmap(map, { lang: 'vhdl' }).code, 'its slave as the map generates it');
  assert.equal(fs.readFileSync(path.join(RA, 'uno/regs.hex'), 'utf8'), intelHex(avrAssemble(fs.readFileSync(path.join(RA, 'uno/regs.asm'), 'utf8').split('\n'))));
  await ok('new_project_from_example', { name: 'ra', example: 'regs-avr' });
  const W = (pin, port, loc) => `WARNING: spi: uno's ${pin}, a 5 V output, drives fpga's ${port} (pin ${loc}), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards`;
  const c = await ok('check_system', { project: 'ra', file: 'regs_avr.sys.json' });
  assert.deepEqual(c.text.split('\n'), ['System regs_avr: 2 nodes, 1 link', 'node uno: Arduino Uno, firmware uno/regs.hex, in C', '  SPI: SPI 125000 Hz mode 0, SCK D13, MOSI D11, MISO D12, SS D10',
    'node fpga: FPGA, module pwm_top on basys2-250, in VHDL', '  bus: SPI 125000 Hz mode 0, SCK sck (B2), MOSI mosi (A3), MISO miso (J3), SS ss (B5)', 'link spi: SPI uno.SPI ↔ fpga.bus',
    // (its wires, the Wiring view's, #5216, #5320)
    'spi SCK: uno D13 → fpga sck (pin B2), 5 V → 3.3 V', 'spi MOSI: uno D11 → fpga mosi (pin A3), 5 V → 3.3 V', 'spi MISO: fpga miso (pin J3) → uno D12', 'spi SS: uno D10 → fpga ss (pin B5), 5 V → 3.3 V',
    W('D13', 'sck', 'B2'), W('D11', 'mosi', 'A3'), W('D10', 'ss', 'B5'), 'Process "Check System" of regs_avr.sys.json completed successfully with 3 warning(s).']);
  assert.equal((await ok('check_drawing', { project: 'ra', file: 'fpga/pwm_regs.regs.json' })).text, 'Process "Check Register Map" of pwm_regs.regs.json completed successfully.');
  assert.match((await ok('check_syntax', { project: 'ra', top: 'pwm_top' })).text, /^Process "Check Syntax" of <pwm_top> completed successfully \(\d+ signals, \d+ process(es)?\)\.$/);
  // 100 ms: clear written, then twice duty written (0, then 1) and count read (the milliseconds since the clear)
  const s = await ok('simulate', { project: 'ra', time_ns: 100e6 });
  const acc = s.data.regs[0].accesses.map((a) => [a.op, a.reg, a.value]);
  assert.deepEqual(acc.map(([op, reg]) => `${op} ${reg}`), ['write clear', 'write duty', 'read count', 'write duty', 'read count', 'write duty', 'read count']);
  assert.deepEqual(acc.filter(([op]) => op === 'write').map(([, , v]) => v), [1, 0, 1, 2]);
  const counts = acc.filter(([op]) => op === 'read').map(([, , v]) => v);
  assert.ok(counts[0] <= 1 && counts[1] >= 45 && counts[1] <= 50 && counts[2] - counts[1] >= 45, `the milliseconds since the clear: ${counts}`);
  assert.ok(s.text.includes(`spi (registers of pwm_regs): 7 access(es): write clear = 0x01; write duty = 0x00; read count → 0x${counts[0].toString(16).padStart(4, '0')}`), s.text);
  assert.deepEqual([s.data.warnings, s.data.errors], [[], []]);
  // emulated: LD7..LD1 the duty's bits (2 from 94 ms: LD1, in the last 10 ms), LD0 its PWM (2 of 256: dim)
  const e = await ok('simulate', { project: 'ra', time_ns: 120e6, controls: [] });
  assert.deepEqual(e.data.boards.fpga.leds.slice(1), [1, 0, 0, 0, 0, 0, 0]);
  assert.ok(e.data.boards.fpga.leds[0] > 0 && e.data.boards.fpga.leds[0] < 0.05, `LD0: ${e.data.boards.fpga.leds[0]}`);
});

test('#5484 uart-pic24: its firmware lcd_uart.asm assembled, its FPGA module uart-avr\'s; made with the MCP server, checked (no warning: 3.3 V on both sides), simulated (the PIC24\'s hello echoed) and emulated (its LCD the echo, BTN0\'s message, its LEDs the last byte)', async () => {
  const UP = path.join(ROOT, 'examples/uart-pic24');
  const { asmHex } = await import('./pic24-node-lib.mjs');
  assert.equal(fs.readFileSync(path.join(UP, 'pic/lcd_uart.hex'), 'utf8'), asmHex(fs.readFileSync(path.join(UP, 'pic/lcd_uart.asm'), 'utf8').split('\n')));
  for (const f of fs.readdirSync(path.join(EX, 'fpga'))) assert.equal(fs.readFileSync(path.join(UP, 'fpga', f), 'utf8'), fs.readFileSync(path.join(EX, 'fpga', f), 'utf8'), f);
  const ex = await ok('list_examples', {});
  assert.equal(ex.text.split('\n').at(-2), 'uart-pic24: a System example (FPGA and microcontroller nodes in a System), 5 file(s)');
  await ok('new_project_from_example', { name: 'up', example: 'uart-pic24' });
  const c = await ok('check_system', { project: 'up', file: 'uart_pic24.sys.json' });
  assert.deepEqual(c.text.split('\n'), ['System uart_pic24: 2 nodes, 1 link', 'node pic: Explorer 16/32, firmware pic/lcd_uart.hex, in C', '  UART: UART 9600 baud 8N1, TX RF5, RX RF4',
    'node fpga: FPGA, module uart on basys2-250, in VHDL', '  uart: UART 9600 baud 8N1, TX tx (A3), RX rx (J3)', 'link serial: UART pic.UART ↔ fpga.uart',
    'serial TX: pic RF5 → fpga rx (pin J3)', 'serial TX: fpga tx (pin A3) → pic RF4', 'Process "Check System" of uart_pic24.sys.json completed successfully.']);
  const s = await ok('simulate', { project: 'up', time_ns: 40e6 });
  const text = w => String.fromCharCode(...s.data.traffic.find(t => t.wire === w).bytes.map(b => b.byte));
  assert.deepEqual([text('serial_pic'), text('serial_fpga')], ['Hi from PIC24!\r\n', 'Hi from PIC24!\r\n']);
  assert.deepEqual([s.data.warnings, s.data.errors], [[], []]);
  // emulated: the LCD its title and the echo; BTN0 held from 40 to 70 ms (debounced): the FPGA's message on its second row (its first 16
  // characters), its last byte (LF, 0x0A) on the LEDs D4 and D6
  const e = await ok('simulate', { project: 'up', time_ns: 35e6, controls: [] });
  assert.deepEqual(e.data.boards.pic.lcd, ['PIC24 + FPGA    ', 'Hi from PIC24!  ']);
  const b = await ok('simulate', { project: 'up', time_ns: 120e6, controls: [{ node: 'fpga', control: 'btn0', on: true, at_ns: 40e6 }, { node: 'fpga', control: 'btn0', on: false, at_ns: 70e6 }] });
  assert.deepEqual(b.data.boards.pic.lcd, ['PIC24 + FPGA    ', 'Hello from Silin']);
  assert.deepEqual(Object.entries(b.data.boards.pic.leds).filter(([, v]) => v > 0.5).map(([d]) => d), ['D4', 'D6']);
  assert.deepEqual([b.data.warnings, b.data.errors], [[], []]);
});

test('#5581 uart-avr\'s nodes run alone with the MCP server: the FPGA with a terminal in the Uno\'s place (a byte typed, echoed), the Uno with one on its Serial (its hello); Emulation Properties\' nodes run by the emulation; refusals', async () => {
  await ok('new_project_from_example', { name: 'un', example: 'uart-avr' });
  const warnF = 'link serial: uno is not run, its end fpga.uart is the terminal serial here (9600 baud, 8N1)';
  const f = await ok('simulate', { project: 'un', top: '#fpga', time_ns: 5e6, type: { serial: 'A' } });
  assert.deepEqual([f.data.nodes, f.data.terminals, f.data.warnings, f.data.errors], [['fpga', 'serial'], { serial: 'A' }, [`WARNING: Simulate Node fpga: ${warnF}`], []]);
  assert.equal(f.text.split('\n')[0], `WARNING: Simulate Node fpga: ${warnF}`);
  // (the document named, the same)
  const g = await ok('simulate', { project: 'un', top: 'uart_avr.sys.json#fpga', time_ns: 5e6, type: { serial: 'A' } });
  assert.deepEqual(g.data.terminals, { serial: 'A' });
  const u = await ok('simulate', { project: 'un', top: '#uno', time_ns: 30e6 });
  assert.deepEqual([u.data.nodes, u.data.terminals, u.data.warnings], [['uno', 'serial'], { serial: 'Hello from Arduino!\r\n' }, ['WARNING: Simulate Node uno: link serial: fpga is not run, its end uno.Serial is the terminal serial here (9600 baud, 8N1)']]);
  // (both: the System as it is, no warning)
  const b = await ok('simulate', { project: 'un', top: '#uno,fpga', time_ns: 30e6 });
  assert.deepEqual([b.data.nodes, b.data.terminals, b.data.warnings], [['uno', 'fpga'], {}, []]);
  // the Emulation Properties: the FPGA alone, in silinx.json; the emulation (controls) runs it, the simulation every node
  const p = await ok('set_process_properties', { project: 'un', emulate_nodes: ['fpga'] });
  assert.deepEqual([p.text, p.data], ['un: Emulate System runs fpga.', { project: 'un', emulateNodes: ['fpga'], emulateModels: {} }]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'ws', 'un', 'silinx.json'), 'utf8')).system, { emulate: { nodes: ['fpga'] } });
  const e = await ok('simulate', { project: 'un', time_ns: 20e6, controls: [] });
  assert.deepEqual([e.data.nodes, Object.keys(e.data.boards), e.data.warnings], [['fpga', 'serial'], ['fpga'], [`WARNING: Emulate Node fpga: ${warnF}`]]);
  const s = await ok('simulate', { project: 'un', time_ns: 1e6 });
  assert.deepEqual([s.data.nodes, s.data.warnings], [undefined, []]);
  const all = await ok('set_process_properties', { project: 'un', emulate_nodes: [] });
  assert.deepEqual([all.text, all.data], ['un: Emulate System runs every node.', { project: 'un', emulateNodes: ['uno', 'fpga'], emulateModels: {} }]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'ws', 'un', 'silinx.json'), 'utf8')).system, undefined);
  // refused
  const no = async (name, args, text) => { const r = await call(name, args); assert.deepEqual([r.isError, r.text], [true, text]); };
  await no('simulate', { project: 'un', top: '#x', time_ns: 1e6 }, 'simulate: top: x: no such node to run in uart_avr (its nodes: uno, fpga)');
  await no('set_process_properties', { project: 'un', emulate_nodes: ['x'] }, 'set_process_properties: emulate_nodes: x: no such node to run in uart_avr (its nodes: uno, fpga)');
  await no('set_process_properties', { project: 'un', emulate_nodes: ['fpga'], optimization: 'area' }, 'set_process_properties: emulate_nodes: a System\'s, given alone (its FPGA nodes\' properties are not the project\'s)');
  await ok('new_project_from_example', { name: 'ug', example: 'gates' });
  await no('set_process_properties', { project: 'ug', emulate_nodes: ['fpga'] }, 'set_process_properties: emulate_nodes: the project \'ug\' is not a System project');
  await no('simulate', { project: 'ug', top: '#fpga', time_ns: 1e6 }, 'simulate: top: #fpga: the project \'ug\' is not a System project');
});

test('#5581 an FPGA node\'s constraints file with the MCP server: check_constraints against its module and its board; a port that is not the module\'s, its exact error', async () => {
  await ok('new_project_from_example', { name: 'uk', example: 'uart-avr' });
  const c = await ok('check_constraints', { project: 'uk', file: 'fpga/uart.ucf' });
  assert.deepEqual([c.text.split('\n'), c.data.ok, c.data.errors, c.data.warnings], [['Started : "Check Constraints" of fpga/uart.ucf.', 'Process "Check Constraints" completed successfully'], true, [], []]);
  const ucf = fs.readFileSync(path.join(tmp, 'ws', 'uk', 'fpga/uart.ucf'), 'utf8');
  await ok('write_file', { project: 'uk', path: 'fpga/uart.ucf', text: `${ucf}NET "nope" LOC = "B2" ;\n` });
  const w = await call('check_constraints', { project: 'uk', file: 'fpga/uart.ucf' });
  assert.deepEqual(w.text.split('\n'), ['Started : "Check Constraints" of fpga/uart.ucf.', 'ERROR:ConstraintSystem - "fpga/uart.ucf" Line 32: NET "nope" does not exist in the top module \'uart\' (no port named \'nope\')',
    'Process "Check Constraints" failed (1 error(s), 0 warning(s))']);
  assert.deepEqual([w.data.ok, w.data.warnings], [false, []]);
  // (the project has no constraints of its own: a System's are its nodes')
  const r = await call('check_constraints', { project: 'uk' });
  assert.deepEqual([r.isError, r.text], [true, 'check_constraints: the project \'uk\' has no constraints file: give file']);
});

test('#5581 Simulate System with the MCP server: the Simulation Properties (the FPGA alone, 60 ms, a stimulus file: a line typed, BTN0 pressed) set by set_process_properties and run by simulate; refusals', async () => {
  await ok('new_project_from_example', { name: 'us', example: 'uart-avr' });
  const stim = { format: 'silinx-stimulus', version: 1, type: [{ terminal: 'serial', text: 'A\n', at_ns: 2e6 }],
    controls: [{ node: 'fpga', control: 'btn0', on: true, at_ns: 10e6 }, { node: 'fpga', control: 'btn0', on: false, at_ns: 30e6 }] };
  await ok('write_file', { project: 'us', path: 'us.stim.json', text: JSON.stringify(stim, null, 2) });
  const p = await ok('set_process_properties', { project: 'us', simulation: { nodes: ['fpga'], ms: 60, stimulus: 'us.stim.json' } });
  assert.deepEqual([p.text, p.data], ['us: Simulate System runs fpga for 60 ms, its stimulus us.stim.json.',
    { project: 'us', simulation: { nodes: ['fpga'], ms: 60, stimulus: 'us.stim.json' } }]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'ws', 'us', 'silinx.json'), 'utf8')).system, { simulate: { nodes: ['fpga'], ms: 60, stimulus: 'us.stim.json' } });
  // simulate: the FPGA alone for 60 ms, the line echoed, BTN0's message
  const warn = 'WARNING: Simulate Node fpga: link serial: uno is not run, its end fpga.uart is the terminal serial here (9600 baud, 8N1)';
  const s = await ok('simulate', { project: 'us' });
  assert.deepEqual([s.data.nodes, s.data.time, s.data.stimulus, s.data.terminals, s.data.warnings], [['fpga', 'serial'], '60 ms', 'us.stim.json', { serial: 'A\nHello from Silinx!\r\n' }, [warn]]);
  // (time_ns given: its time; controls: Emulate System's, no stimulus)
  assert.equal((await ok('simulate', { project: 'us', time_ns: 5e6 })).data.time, '5 ms');
  assert.equal((await ok('simulate', { project: 'us', time_ns: 5e6, controls: [] })).data.stimulus, undefined);
  // refusals: a step that cannot be; a file that is not one; the properties' own
  await ok('write_file', { project: 'us', path: 'us.stim.json', text: JSON.stringify({ ...stim, type: [{ terminal: 'nope', text: 'x' }] }) });
  const r = await call('simulate', { project: 'us' });
  assert.deepEqual([r.isError, r.text], [true, 'simulate: us.stim.json: type[0]: no terminal \'nope\' in the System (serial)']);
  await ok('write_file', { project: 'us', path: 'us.stim.json', text: '{}' });
  assert.deepEqual((await call('simulate', { project: 'us' })).text, 'simulate: us.stim.json: not a stimulus file (its format is not \'silinx-stimulus\')');
  const no = async (simulation, text) => { const x = await call('set_process_properties', { project: 'us', simulation }); assert.deepEqual([x.isError, x.text], [true, `set_process_properties: ${text}`]); };
  await no({ ms: 0 }, 'simulation: its run\'s time: from 0 to 10000 ms (10 s)');
  await no({ stimulus: 'none.stim.json' }, 'simulation: none.stim.json: no such file in the project');
  await no({ time: 5 }, 'simulation: { nodes, ms, stimulus }');
  // (every node, its default time, no stimulus: the setting left out)
  await ok('set_process_properties', { project: 'us', simulation: { nodes: [], ms: 100, stimulus: '' } });
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'ws', 'us', 'silinx.json'), 'utf8')).system, undefined);
});

test('#5612 an FPGA node emulated on its Post-Synthesis model with the MCP server: refused before it is made (said how), made by run_process with its node, then its LEDs the byte typed as the RTL\'s; refusals', async () => {
  await ok('new_project_from_example', { name: 'um', example: 'uart-avr' });
  const p = await ok('set_process_properties', { project: 'um', emulate_nodes: ['fpga@postsynth'] });
  assert.deepEqual([p.text, p.data.emulateNodes, p.data.emulateModels], ['um: Emulate System runs fpga, fpga on its Post-Synthesis model.', ['fpga'], { fpga: 'postsynth' }]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'ws', 'um', 'silinx.json'), 'utf8')).system, { emulate: { nodes: ['fpga'], models: { fpga: 'postsynth' } } });
  // (not made yet: refused, said how)
  const no = await call('simulate', { project: 'um', time_ns: 20e6, type: { serial: 'A\n' }, controls: [] });
  assert.deepEqual([no.isError, no.text], [true, 'simulate: fpga\'s post-synthesis model is not made yet: run_process post_synthesis_model with node fpga first']);
  const m = await ok('run_process', { project: 'um', process: 'post_synthesis_model', node: 'fpga', toolchain: 'silinx' });
  assert.ok(m.text.includes('build/netgen/synthesis/uart_synthesis.vhd'), m.text);
  // (its LEDs the last byte it received, LF, as the RTL's)
  const e = await ok('simulate', { project: 'um', time_ns: 20e6, type: { serial: 'A\n' }, controls: [] });
  assert.deepEqual([e.data.nodes, e.data.terminals, e.data.boards.fpga.leds, e.data.errors], [['fpga', 'serial'], { serial: 'A\n' }, [0, 1, 0, 1, 0, 0, 0, 0], []]);
  const bad = async (emulate_nodes, text) => { const x = await call('set_process_properties', { project: 'um', emulate_nodes }); assert.deepEqual([x.isError, x.text], [true, `set_process_properties: ${text}`]); };
  await bad(['fpga@nope'], 'emulate_nodes: fpga: no model \'nope\' (its board\'s toolchain makes rtl, postsynth, posttrans, postmap, postpar)');
  await bad(['uno@postsynth'], 'emulate_nodes: uno: only an FPGA node has models');
  // (the node named alone: its RTL again)
  const r = await ok('set_process_properties', { project: 'um', emulate_nodes: ['fpga'] });
  assert.deepEqual(r.data.emulateModels, {});
});
