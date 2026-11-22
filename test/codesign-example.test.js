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
  assert.deepEqual(CODESIGN_EXAMPLES, ['uart-avr']);
});

test('#4702 the kinds\' rules: a co-design project empty or from a co-design example; a new one\'s silinx.json and System', () => {
  assert.equal(createRefusal('codesign', 'empty'), null);
  assert.equal(createRefusal('codesign', 'uart-avr'), null);
  assert.equal(createRefusal(null, 'uart'), null);
  assert.equal(createRefusal('codesign', 'uart'), 'a co-design project starts empty or from a co-design example (uart-avr)');
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
  // (listed after the FPGA examples, as a co-design one)
  const ex = await ok('list_examples', {});
  assert.equal(ex.text.split('\n').at(-1), 'uart-avr: a co-design example (FPGA and microcontroller nodes in a System), 5 file(s)');
  assert.deepEqual(ex.data.examples.at(-1), { name: 'uart-avr', kind: 'codesign', top: null, simTop: null, board: null, device: null, files: 5 });
  await ok('new_project_from_example', { name: 'ua', example: 'uart-avr' });
  const warn = "serial: uno's D1, a 5 V output, drives fpga's rx (pin J3), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards";
  const c = await ok('check_system', { project: 'ua', file: 'uart_avr.sys.json' });
  assert.deepEqual(c.text.split('\n'), ['System uart_avr: 2 nodes, 1 link', 'node uno: Arduino Uno, firmware firmware/hello.hex', '  Serial: UART 9600 baud 8N1, TX D1, RX D0',
    'node fpga: FPGA, module uart on basys2-250', '  uart: UART 9600 baud 8N1, TX tx (A3), RX rx (J3)', 'link serial: UART uno.Serial ↔ fpga.uart',
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
