// The MCP's Board project for a processor board alone (#5756, roadmap #5753: server/mcp-processor.js on
// core/processor-board.js): new_project with an Arduino (its blink firmware written), project_info's mode and node,
// check_system and simulate on it (no error, no warning), list_devices' processor boards, a Pico under CircuitPython,
// set_design_properties mode up to System and back down to the board; the refusals, each said.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-processor-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };
const lines = t => t.split('\n').filter(l => !/^\[End of untrusted/.test(l) && l);

test('#5756 new_project with an Arduino Uno: a Board project of it alone, its blink firmware, checked and simulated', async () => {
  const r = await ok('new_project', { name: 'u1', board: 'arduino-uno' });
  assert.deepEqual(lines(r.text), ['Board project \'u1\' made for the Arduino Uno: its firmware uno/blink.hex, which blinks its LED.']);
  assert.deepEqual(r.data, { project: 'u1', mode: 'board', board: 'arduino-uno', node: 'uno', firmware: 'uno/blink.hex', system: 'u1.sys.json', trusted: false });
  assert.ok(['uno/blink.asm', 'uno/blink.hex', 'u1.sys.json'].every(f => fs.existsSync(path.join(P.projectDir('u1'), f))));
  const info = (await ok('project_info', { project: 'u1' })).data;
  assert.deepEqual([info.mode, info.board, info.nodes.map(n => [n.id, n.kind, n.board, n.files])], ['board', 'arduino-uno', [['uno', 'mcu', 'arduino-uno', ['uno/blink.hex']]]]);
  assert.equal((await ok('list_projects', {})).data.projects.find(p => p.name === 'u1').mode, 'board');
  const c = await ok('check_system', { project: 'u1', file: 'u1.sys.json' });
  assert.deepEqual([lines(c.text)[0], c.data.errors, c.data.warnings], ['System u1: 1 node, 0 links', [], []]);
  const s = await ok('simulate', { project: 'u1', top: 'u1.sys.json', time_ns: 1e6 });
  assert.deepEqual([s.data.time, s.data.errors, s.data.warnings], ['1 ms', [], []]);
});

test('#5756 a Pico under CircuitPython; list_devices\' processor boards; refusals', async () => {
  const p = await ok('new_project', { name: 'p1', board: 'pico', mode: 'board', runtime: 'circuitpython' });
  assert.equal(p.data.firmware, 'pico/code.py');
  assert.match(fs.readFileSync(path.join(P.projectDir('p1'), 'pico/code.py'), 'utf8'), /^# code\.py: the starter program of a Raspberry Pi Pico's project \(CircuitPython\)/);
  const e = await ok('new_project', { name: 'x1', board: 'explorer-1632' });
  assert.deepEqual([e.data.firmware, lines(e.text)[0]], [null, 'Board project \'x1\' made for the Explorer 16/32: no firmware yet: put its .hex (MPLAB X\'s) in its folder pic/ and make it the node\'s firmware (its row ▸ Open, or the MCP\'s edit_system).']);
  const d = await ok('list_devices', {});
  assert.deepEqual(d.data.processorBoards.map(b => [b.id, b.type]), [['arduino-uno', 'avr'], ['arduino-nano', 'avr'], ['explorer-1632', 'pic24'], ['pico', 'rp2040'], ['pico-w', 'rp2040'], ['esp32-devkitc', 'esp32']]);
  assert.deepEqual(lines(d.text).slice(-7), ['Processor boards (a Board project of one: new_project board):', '  arduino-uno: Arduino Uno (ATmega328P)', '  arduino-nano: Arduino Nano (ATmega328P)',
    '  explorer-1632: Explorer 16/32 (PIC24FJ1024GB610)', '  pico: Raspberry Pi Pico (RP2040)', '  pico-w: Raspberry Pi Pico W (RP2040)', '  esp32-devkitc: ESP32 DevKitC (ESP32-WROOM-32)']);
  await fails('new_project', { name: 'r1', board: 'arduino-uno', runtime: 'circuitpython' }, 'the Arduino Uno has no Python firmware to choose');
  await fails('new_project', { name: 'r2', board: 'pico', language: 'vhdl' }, 'language: a processor board\'s project has none (its firmware is its program)');
  await fails('new_project', { name: 'r3', runtime: 'micropython' }, 'runtime: a Raspberry Pi Pico\'s Python firmware: give a processor board (board pico or pico-w)');
  await fails('new_project', { name: 'r4', board: 'pico', mode: 'circuit' }, 'a Digital Logic project (profile logic) has no board: give profile logic or a board, not both');
  const names = (await P.listProjects()).map(x => x.name);
  for (const n of ['r1', 'r2', 'r3', 'r4']) assert.ok(!names.includes(n), `${n} not made`);
});

test('#5756 set_design_properties mode: a processor board\'s project up to System (its board\'s name dropped) and down again keeping it', async () => {
  await ok('new_project', { name: 'e1', board: 'esp32-devkitc' });
  const up = await ok('set_design_properties', { project: 'e1', mode: 'system' });
  assert.deepEqual(lines(up.text), ['e1: System now (nothing lost).', '  its board the System\'s first node, esp32 (esp32-devkitc), its files in its folder already']);
  assert.deepEqual([(await P.readProject('e1')).board, (await ok('project_info', { project: 'e1' })).data.mode], [null, 'system']);
  await fails('set_design_properties', { project: 'e1', mode: 'board', confirm: true }, 'the System of \'e1\' has no FPGA nor design node to keep: its nodes are esp32 (mcu)');
  const down = await ok('set_design_properties', { project: 'e1', mode: 'board', keep: 'esp32', confirm: true });
  assert.deepEqual(lines(down.text), ['e1: Board now (nothing deleted: what left the project stays on the disk).', '  the node esp32 the project\'s (esp32-devkitc)', 'WARNING: lost: its System document e1.sys.json rewritten with the node alone']);
  assert.deepEqual([(await P.readProject('e1')).board, (await ok('project_info', { project: 'e1' })).data.mode], ['esp32-devkitc', 'board']);
  await fails('set_design_properties', { project: 'e1', mode: 'circuit', confirm: true }, 'the project \'e1\' is a processor board\'s (ESP32 DevKitC): its firmware is no drawing, so it cannot be a Circuit project');
});

test('#5875 the ESP32\'s starter: no Pin.toggle (the ESP32\'s MicroPython has none), its level kept by the program: GPIO2 on, then off, no error', async () => {
  await ok('new_project', { name: 'e2', board: 'esp32-devkitc' });
  const py = fs.readFileSync(path.join(P.projectDir('e2'), 'esp32/main.py'), 'utf8');
  assert.ok(!py.includes('toggle') && py.includes('    on = not on\n    led.value(on)\n'), py);
  const at = async ms => { const s = await ok('simulate', { project: 'e2', top: 'e2.sys.json', time_ns: ms * 1e6, controls: [] }); assert.deepEqual([s.data.warnings, s.data.errors], [[], []], s.text); return s.data.boards.esp32.pins.GPIO2; };
  assert.deepEqual([await at(300), await at(800)], [1, 0]);
});
