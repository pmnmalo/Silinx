// The co-design example uart-avr and New Project's co-design projects (#4702, core/project-kind.js): its FPGA module the
// uart example's (the same sources), its Arduino's firmware the assembled hello.asm; made from the example with the MCP
// server, its System checked (its one warning, a 5 V output on the FPGA's 3.3 V input: the lesson) and simulated (the
// Arduino's "Hello from Arduino!" echoed by the FPGA, no warnings). The kinds' rules: a co-design project empty (its
// System document) or from a co-design example; a co-design example only a co-design project's.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';
import { ROOT } from './examples-lib.mjs';
import { avrAssemble, intelHex } from './avr-asm.mjs';
import { createRefusal, boardRefusal, asCodesignProject, isCodesign, CODESIGN_EXAMPLES } from '../core/project-kind.js';
import { newProjectJson } from '../core/project-defaults.js';
import { newSystemFile, readSystem } from '../core/system-doc.js';

const EX = path.join(ROOT, 'examples/uart-avr');
let tmp;
before(async () => { tmp = await scratchEnv('silinx-codesign-example-'); });
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
    assert.equal(fs.readFileSync(path.join(EX, 'src', f), 'utf8'), fs.readFileSync(path.join(ROOT, 'examples/uart/src', f), 'utf8'), `src/${f} as the uart example's`);
  }
  const asm = fs.readFileSync(path.join(EX, 'firmware/hello.asm'), 'utf8').split('\n');
  assert.equal(fs.readFileSync(path.join(EX, 'firmware/hello.hex'), 'utf8'), intelHex(avrAssemble(asm)));
  const pj = JSON.parse(fs.readFileSync(path.join(EX, 'silinx.json'), 'utf8'));
  assert.deepEqual([pj.kind, pj.board, pj.constraints, pj.top], ['codesign', null, null, '']);
  const sys = readSystem(fs.readFileSync(path.join(EX, 'uart_avr.sys.json'), 'utf8'));
  assert.deepEqual(sys.system.links, [{ id: 'serial', kind: 'uart', a: 'uno.Serial', b: 'fpga.uart' }]);
  assert.deepEqual(CODESIGN_EXAMPLES, ['uart-avr', 'spi-avr', 'i2c-avr']);
});

test('#4702 the kinds\' rules: a co-design project empty or from a co-design example; a new one\'s silinx.json and System', () => {
  assert.equal(createRefusal('codesign', 'empty'), null);
  assert.equal(createRefusal('codesign', 'uart-avr'), null);
  assert.equal(createRefusal(null, 'uart'), null);
  assert.equal(createRefusal('codesign', 'uart'), 'a co-design project starts empty or from a co-design example (uart-avr, spi-avr, i2c-avr)');
  assert.equal(createRefusal(null, 'uart-avr'), null);   // (the example's kind)
  assert.equal(createRefusal('design', 'uart-avr'), 'a design and simulation project starts empty: no example');
  assert.equal(createRefusal('fpga', 'uart-avr'), 'unknown project kind \'fpga\'');   // (an FPGA project's kind is none)
  assert.equal(boardRefusal({ name: 'uart-avr', kind: 'codesign' }, { board: 'basys2' }), 'uart-avr: a co-design project has no board: its System names each FPGA node\'s');
  assert.equal(boardRefusal({ name: 'uart', board: 'basys2' }, { board: 'nexys2' }), null);
  assert.equal(createRefusal('design', 'uart'), 'a design and simulation project starts empty: no example');
  assert.equal(createRefusal('pico', 'empty'), 'unknown project kind \'pico\'');
  const j = newProjectJson('sys1', { kind: 'codesign' });
  assert.deepEqual([j.kind, j.board, j.constraints, j.top, isCodesign(j)], ['codesign', null, null, '', true]);
  assert.deepEqual(asCodesignProject({ name: 'x', board: 'basys2', constraints: 'c.ucf', top: 'uart' }), { name: 'x', board: null, constraints: null, top: '', kind: 'codesign' });
  assert.deepEqual(newSystemFile('sys1'), { path: 'sys1.sys.json', text: '{\n  "format": "silinx-system",\n  "version": 1,\n  "name": "sys1",\n  "nodes": [],\n  "links": []\n}\n' });
});

test('#4702 uart-avr made with the MCP server: its System checked (the 5 V warning) and simulated (the Arduino\'s hello echoed)', async () => {
  // (listed after the FPGA examples, as the co-design ones: uart-avr, spi-avr, i2c-avr)
  const ex = await ok('list_examples', {});
  assert.deepEqual(ex.text.split('\n').slice(-3), ['uart-avr: a co-design example (FPGA and microcontroller nodes in a System), 5 file(s)', 'spi-avr: a co-design example (FPGA and microcontroller nodes in a System), 1 file(s)', 'i2c-avr: a co-design example (FPGA and microcontroller nodes in a System), 1 file(s)']);
  assert.deepEqual(ex.data.examples.at(-3), { name: 'uart-avr', kind: 'codesign', top: null, simTop: null, board: null, device: null, files: 5 });
  await ok('new_project_from_example', { name: 'ua', example: 'uart-avr' });
  const warn = "serial: uno's D1, a 5 V output, drives fpga's rx (pin J3), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards";
  const c = await ok('check_system', { project: 'ua', file: 'uart_avr.sys.json' });
  assert.deepEqual(c.text.split('\n'), ['System uart_avr: 2 nodes, 1 link', 'node uno: Arduino Uno, firmware firmware/hello.hex', '  Serial: UART 9600 baud 8N1, TX D1, RX D0',
    'node fpga: FPGA, module uart on basys2-250', '  uart: UART 9600 baud 8N1, TX tx (A3), RX rx (J3)', 'link serial: UART uno.Serial ↔ fpga.uart',
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
  assert.deepEqual([r.isError, r.text], [true, 'new_project_from_example: ub: a co-design project has no board: its System names each FPGA node\'s']);
});

test('#5214 spi-avr: its firmware spi.asm assembled; made with the MCP server, its System checked (its 5 V warnings) and simulated (the counts sent, each answered with the one before plus one)', async () => {
  const SPI = path.join(ROOT, 'examples/spi-avr');
  assert.equal(fs.readFileSync(path.join(SPI, 'firmware/spi.hex'), 'utf8'), intelHex(avrAssemble(fs.readFileSync(path.join(SPI, 'firmware/spi.asm'), 'utf8').split('\n'))));
  assert.deepEqual(readSystem(fs.readFileSync(path.join(SPI, 'spi_avr.sys.json'), 'utf8')).system.links, [{ id: 'spi', kind: 'spi', a: 'uno.SPI', b: 'fpga.bus' }]);
  await ok('new_project_from_example', { name: 'sa', example: 'spi-avr' });
  const W = (pin, port, loc) => `WARNING: spi: uno's ${pin}, a 5 V output, drives fpga's ${port} (pin ${loc}), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards`;
  const c = await ok('check_system', { project: 'sa', file: 'spi_avr.sys.json' });
  assert.deepEqual(c.text.split('\n'), ['System spi_avr: 2 nodes, 1 link', 'node uno: Arduino Uno, firmware firmware/spi.hex', '  Serial: UART 9600 baud 8N1, TX D1, RX D0',
    '  SPI: SPI 125000 Hz mode 0, SCK D13, MOSI D11, MISO D12, SS D10', 'node fpga: FPGA, module spi_echo on basys2-250',
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
  assert.equal(fs.readFileSync(path.join(I2C, 'firmware/i2c.hex'), 'utf8'), intelHex(avrAssemble(fs.readFileSync(path.join(I2C, 'firmware/i2c.asm'), 'utf8').split('\n'))));
  assert.deepEqual(readSystem(fs.readFileSync(path.join(I2C, 'i2c_avr.sys.json'), 'utf8')).system.links, [{ id: 'i2c', kind: 'i2c', a: 'uno.Wire', b: 'fpga.bus' }]);
  await ok('new_project_from_example', { name: 'ia', example: 'i2c-avr' });
  const W = (pin, port, loc) => `WARNING: i2c: uno's ${pin}, a 5 V output, drives fpga's ${port} (pin ${loc}), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards`;
  const c = await ok('check_system', { project: 'ia', file: 'i2c_avr.sys.json' });
  assert.deepEqual(c.text.split('\n'), ['System i2c_avr: 2 nodes, 1 link', 'node uno: Arduino Uno, firmware firmware/i2c.hex', '  Wire: I²C 100000 Hz, SCL A5, SDA A4',
    'node fpga: FPGA, module i2c_leds on basys2-250', '  bus: I²C 100000 Hz, SCL scl (B2), SDA sda (A3)', 'link i2c: I²C uno.Wire ↔ fpga.bus',
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
