// The processor boards' examples (#5874, core/examples.js PROCESSOR_EXAMPLES): each a Board project of its board alone (a
// System of its one microcontroller node, its board named), listed by its Board Type; made with the MCP server
// (new_project_from_example, on another board of its type too), checked (check_system: no warning) and run as the Board
// Emulator runs it (simulate with controls), its behaviour and its warnings asserted: the Arduino's sketches (their .hex
// arduino-cli's: compiled again when it is here), the Explorer 16/32's assembly (its .hex the tests' assembler's), the
// Pico's and the ESP32's MicroPython (their consoles, their pins); the refusals, each said.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scratchEnv, waitJob, ROOT } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';
import { asmHex } from './pic24-node-lib.mjs';
import { PROCESSOR_EXAMPLES, PROCESSOR_ORDER, exampleBoardType, exampleModes, orderExamples } from '../core/examples.js';
import { createRefusal } from '../core/project-kind.js';
import { modeOf } from '../core/project-mode.js';
import { BOARD_TYPES, boardType, exampleOnBoard, processorBoardOf, processorExampleText } from '../core/processor-board.js';
import { readSystem, isSystemFile } from '../core/system-doc.js';
import { prepareSystem, systemReport } from '../core/system-run.js';

process.env.SILINX_RP2040_CACHE ??= path.join(os.tmpdir(), 'silinx-rp2040');
let tmp;
before(async () => { tmp = await scratchEnv('silinx-processor-examples-'); });
after(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text.split('\n')[0], `${name}: ${message}`); };
const lines = t => t.split('\n').filter(l => l && !/^\[End of untrusted/.test(l));
const EX = name => path.join(ROOT, 'examples', name);
const sysOf = name => fs.readdirSync(EX(name)).find(isSystemFile);
// a project made from the example (its System named as the example's), its System's file
async function made(example, args = {}) {
  const name = `${example.replace(/-/g, '_')}_${++id}`;
  await ok('new_project_from_example', { name, example, ...args });
  return { name, sys: sysOf(example) };
}
// the run emulated to `ms` with `controls` (the Board Emulator's): its board, its console, no warning nor error
async function emulate({ name, sys }, ms, controls = []) {
  const s = await ok('simulate', { project: name, top: sys, time_ns: ms * 1e6, controls });
  assert.deepEqual([s.data.warnings, s.data.errors], [[], []], s.text);
  return { board: Object.values(s.data.boards ?? {})[0] ?? null, console: Object.values(s.data.terminals)[0] ?? null };
}
const lit = leds => Object.entries(leds).filter(([, v]) => v > 0.5).map(([d]) => d);

test('#5874 the examples by Board Type: each type\'s, in the teaching order; Board mode; after the Circuit versions, before the System examples; a System or a Circuit project refused', () => {
  assert.deepEqual(PROCESSOR_EXAMPLES, {
    avr: ['blinky-arduino', 'counter-arduino'],
    pic24: ['blinky-pic24', 'buttons-pic24', 'counter-pic24', 'adc-pic24'],
    rp2040: ['blinky-pico', 'counter-pico', 'echo-pico'],
    esp32: ['blinky-esp32', 'counter-esp32'],
  });
  assert.deepEqual(Object.keys(PROCESSOR_EXAMPLES), BOARD_TYPES.slice(1).map(t => t.id), 'every processor Board Type has its examples');
  for (const [type, names] of Object.entries(PROCESSOR_EXAMPLES)) for (const n of names) assert.deepEqual([exampleBoardType(n), exampleModes(n)], [type, ['board']], n);
  assert.deepEqual(['gates', 'blinky', 'traffic-circuit', 'uart-avr', 'nothere'].map(exampleBoardType), ['fpga', 'fpga', null, null, 'fpga']);
  assert.deepEqual(orderExamples(['uart-avr', 'echo-pico', 'blinky-arduino', 'lock-circuit', 'gates']), ['gates', 'lock-circuit', 'blinky-arduino', 'echo-pico', 'uart-avr']);
  assert.deepEqual([createRefusal(null, 'blinky-pico'), createRefusal('fpga', 'blinky-pico'), createRefusal('system', 'blinky-pico'), createRefusal('embedded', 'adc-pic24'), createRefusal('design', 'blinky-esp32')],
    [null, null, 'blinky-pico is a processor board\'s example: a Board project starts from it (mode board)', 'adc-pic24 is a processor board\'s example: a Board project starts from it (mode board)',
      'a design and simulation project starts empty or from a Circuit example (gates, breadboard, traffic-circuit, blinky-circuit, stopwatch-circuit, lock-circuit)']);
});

test('#5874 each example: a Board project of its board alone (its System of one node, its firmware in the node\'s folder, as New Project\'s starter); its board of its Board Type', () => {
  for (const n of PROCESSOR_ORDER) {
    const pj = JSON.parse(fs.readFileSync(path.join(EX(n), 'silinx.json'), 'utf8'));
    assert.deepEqual([pj.name, modeOf(pj), processorBoardOf(pj), boardType(pj.board), pj.top, pj.constraints], [n, 'board', pj.board, exampleBoardType(n), '', null], n);
    const sys = sysOf(n), r = readSystem(fs.readFileSync(path.join(EX(n), sys), 'utf8'));
    assert.ok(!r.error, `${n}: ${r.error}`);
    assert.deepEqual([sys, r.system.name, r.system.links, r.system.nodes.map(x => [x.kind, x.board])], [`${n.replace(/-/g, '_')}.sys.json`, n.replace(/-/g, '_'), [], [['mcu', pj.board]]], n);
    const node = r.system.nodes[0];
    assert.ok(node.firmware.startsWith(`${node.id}/`) && fs.existsSync(path.join(EX(n), node.firmware)), `${n}: its firmware ${node.firmware}`);
  }
});

test('#5874 exampleOnBoard: an example on another board of its type (its node\'s board, its silinx.json\'s); its own board as it is; another type\'s refused', () => {
  const pj = JSON.parse(fs.readFileSync(path.join(EX('blinky-arduino'), 'silinx.json'), 'utf8'));
  const sys = { path: 'blinky_arduino.sys.json', text: fs.readFileSync(path.join(EX('blinky-arduino'), 'blinky_arduino.sys.json'), 'utf8') };
  const r = exampleOnBoard(pj, sys, 'arduino-nano');
  assert.deepEqual([r.project.board, r.writes.map(w => w.path), readSystem(r.writes[0].text).system.nodes.map(x => [x.id, x.board, x.firmware])], ['arduino-nano', ['blinky_arduino.sys.json'], [['uno', 'arduino-nano', 'uno/blink.hex']]]);
  assert.deepEqual(exampleOnBoard(pj, sys, 'arduino-uno'), { project: pj, writes: [] });
  assert.deepEqual(exampleOnBoard(pj, sys, 'pico'), { error: '\'pico\' is not a board of its type, Arduino (arduino-uno, arduino-nano)' });
  assert.deepEqual(exampleOnBoard(pj, sys, 'basys2'), { error: '\'basys2\' is not a board of its type, Arduino (arduino-uno, arduino-nano)' });
  assert.deepEqual(exampleOnBoard({ name: 'f', board: 'basys2' }, sys, 'arduino-uno'), { error: 'f: not a processor board\'s project' });
  assert.equal(processorExampleText('p', 'blinky-arduino', 'arduino-nano', 'uno/blink.hex'), 'Board project \'p\' made from the example blinky-arduino for the Arduino Nano: its firmware uno/blink.hex.');
});

test('#5874 list_examples: each one\'s Board Type; filtered by mode and Board Type as New Project\'s Start from; none, said', async () => {
  const all = await ok('list_examples', {});
  assert.deepEqual(all.data.examples.filter(e => PROCESSOR_ORDER.includes(e.name)).map(e => e.name), PROCESSOR_ORDER);
  assert.deepEqual(all.data.examples.find(e => e.name === 'blinky-arduino'), { name: 'blinky-arduino', modes: ['board'], boardType: 'avr', top: null, simTop: null, board: 'arduino-uno', device: null, files: 3 });
  assert.equal(all.data.examples.find(e => e.name === 'gates').boardType, 'fpga');
  const avr = await ok('list_examples', { mode: 'board', board_type: 'avr' });
  assert.deepEqual(lines(avr.text), ['blinky-arduino: an Arduino example (Board Type avr) for the Arduino Uno, 3 file(s)', 'counter-arduino: an Arduino example (Board Type avr) for the Arduino Uno, 3 file(s)']);
  const by = async args => (await ok('list_examples', args)).data.examples.map(e => e.name);
  assert.deepEqual(await by({ board_type: 'pic24' }), PROCESSOR_EXAMPLES.pic24);
  assert.deepEqual(await by({ board_type: 'rp2040' }), PROCESSOR_EXAMPLES.rp2040);
  assert.deepEqual(await by({ board_type: 'esp32' }), PROCESSOR_EXAMPLES.esp32);
  assert.deepEqual(await by({ board_type: 'fpga' }), ['gates', 'breadboard', 'traffic', 'blinky', 'pong', 'stopwatch', 'clock', 'vga', 'isqrt', 'uart', 'micro80', 'lock']);
  assert.deepEqual(await by({ mode: 'circuit' }), ['gates', 'breadboard', 'traffic-circuit', 'blinky-circuit', 'stopwatch-circuit', 'lock-circuit']);
  assert.deepEqual(lines((await ok('list_examples', { mode: 'system', board_type: 'avr' })).text), ['No example of that mode and Board Type.']);
});

test('#5874 new_project_from_example: a processor board\'s example made, on another board of its type; the refusals, nothing made', async () => {
  const a = await ok('new_project_from_example', { name: 'n1', example: 'blinky-arduino', board: 'arduino-nano' });
  assert.deepEqual(lines(a.text), ['Board project \'n1\' made from the example blinky-arduino for the Arduino Nano: its firmware uno/blink.hex.']);
  assert.deepEqual(a.data, { project: 'n1', mode: 'board', board: 'arduino-nano', node: 'uno', firmware: 'uno/blink.hex', system: 'blinky_arduino.sys.json', trusted: false });
  const info = (await ok('project_info', { project: 'n1' })).data;
  assert.deepEqual([info.mode, info.board, info.nodes.map(n => [n.id, n.board])], ['board', 'arduino-nano', [['uno', 'arduino-nano']]]);
  const w = await ok('new_project_from_example', { name: 'n2', example: 'echo-pico', board: 'pico-w' });
  assert.deepEqual([w.data.board, w.data.firmware], ['pico-w', 'pico/main.py']);
  await fails('new_project_from_example', { name: 'r1', example: 'blinky-arduino', board: 'pico' }, 'board: \'pico\' is not a board of its type, Arduino (arduino-uno, arduino-nano)');
  await fails('new_project_from_example', { name: 'r2', example: 'blinky-pic24', mode: 'system' }, 'blinky-pic24 is not a system example (its modes: board)');
  await fails('new_project_from_example', { name: 'r3', example: 'blinky-pic24', mode: 'circuit' }, 'blinky-pic24 is not a circuit example (its modes: board)');
  await fails('new_project_from_example', { name: 'r4', example: 'blinky-pico', variant: '250' }, 'variant: a processor board has none');
  const names = (await P.listProjects()).map(x => x.name);
  for (const n of ['r1', 'r2', 'r3', 'r4']) assert.ok(!names.includes(n), `${n} not made`);
});

test('#5874 every example checked: its one node, no warning', async () => {
  for (const n of PROCESSOR_ORDER) {
    const p = await made(n);
    const c = await ok('check_system', { project: p.name, file: p.sys });
    assert.deepEqual([lines(c.text)[0], c.data.errors, c.data.warnings], [`System ${n.replace(/-/g, '_')}: 1 node, 0 links`, [], []], n);
  }
});

test('#5874 blinky-arduino: its LED L (D13) on for half a second, off for half a second; on the Nano too', async () => {
  for (const board of ['arduino-uno', 'arduino-nano']) {
    const p = await made('blinky-arduino', { board });
    const at = async ms => (await emulate(p, ms)).board;
    assert.deepEqual([(await at(300)).led, (await at(800)).led, (await at(1300)).led], [1, 0, 1], board);
    assert.equal((await at(800)).pins.D13, 0);
  }
});

test('#5874 counter-arduino: D8..D13 counting in binary, one count every quarter of a second', async () => {
  const p = await made('counter-arduino');
  for (const [ms, count] of [[100, 0], [400, 1], [900, 3], [1400, 5]]) {
    const { pins } = (await emulate(p, ms)).board;
    assert.deepEqual(['D8', 'D9', 'D10', 'D11', 'D12', 'D13'].map(d => pins[d]), [0, 1, 2, 3, 4, 5].map(b => (count >> b) & 1), `${ms} ms: ${count}`);
  }
});

// (arduino-cli and its AVR core on this computer: the sketches compiled again, their .hex run as the shipped ones)
const { detectAvrCompiler, startFirmwareCompile } = await import('../server/avr-compile.js');
const cli = await detectAvrCompiler({});
test('#5874 the Arduino examples\' sketches compiled by arduino-cli: no warning; their .hex blink and count as the shipped ones', { skip: !cli.available && `no arduino-cli with its AVR core here (${cli.reason})`, timeout: 300000 }, async () => {
  const jobs = await import('../server/jobs.js');
  for (const [n, sketch] of [['blinky-arduino', 'uno/blink.ino'], ['counter-arduino', 'uno/counter.ino']]) {
    // (made by the user, trusted: arduino-cli runs on a trusted project only)
    const p = { name: `cli_${n.replace(/-/g, '_')}`, sys: sysOf(n) };
    await P.createProject({ name: p.name, template: n });
    const j = await waitJob(jobs, (await startFirmwareCompile(p.name, { node: 'uno' })).id, { timeoutMs: 280000 });
    assert.equal(j.status, 'ok', j.lines.join('\n'));
    assert.deepEqual(j.lines.filter(l => /^(ERROR|WARNING)/.test(l)), [], `${n}: no warning`);
    assert.match(j.lines[0], new RegExp(`^System node uno: its sketch ${sketch} \\(1 file\\(s\\) of uno/\\) for arduino-uno`));
    const b = (await emulate(p, 1300)).board;
    assert.deepEqual(n === 'blinky-arduino' ? b.led : ['D8', 'D9', 'D10'].map(d => b.pins[d]), n === 'blinky-arduino' ? 1 : [1, 0, 1], n);
  }
});

test('#5874 the PIC24 examples: each .hex its .asm assembled', () => {
  for (const n of PROCESSOR_EXAMPLES.pic24) {
    const fw = readSystem(fs.readFileSync(path.join(EX(n), sysOf(n)), 'utf8')).system.nodes[0].firmware;
    assert.equal(fs.readFileSync(path.join(EX(n), fw), 'utf8'), asmHex(fs.readFileSync(path.join(EX(n), fw.replace(/\.hex$/, '.asm')), 'utf8').split('\n')), n);
  }
});

test('#5874 blinky-pic24: D3 on for a quarter of a second, then off; the other LEDs off', async () => {
  const p = await made('blinky-pic24');
  for (const [ms, on] of [[100, ['D3']], [400, []], [600, ['D3']]]) assert.deepEqual(lit((await emulate(p, ms)).board.leds), on, `${ms} ms`);
});

test('#5874 buttons-pic24: each button held lights its LED (S3 D3, S4 D4, S6 D6, S5 D7); let go, off', async () => {
  const p = await made('buttons-pic24');
  const leds = async controls => lit((await emulate(p, 60, controls)).board.leds).filter(d => d !== 'D10');   // (D10: RA7, S5's input here, shown lit while S5 holds it low: #5880)
  assert.deepEqual(await leds([]), []);
  const press = (...bs) => bs.map(b => ({ node: 'pic', control: b, on: true, at_ns: 20e6 }));
  assert.deepEqual(await leds(press('S3')), ['D3']);
  assert.deepEqual(await leds(press('S4', 'S6')), ['D4', 'D6']);
  assert.deepEqual(await leds(press('S5')), ['D7']);
  assert.deepEqual(await leds([...press('S3', 'S4'), { node: 'pic', control: 'S3', on: false, at_ns: 30e6 }]), ['D4']);
});

test('#5874 counter-pic24: the LEDs D3..D10 counting in binary every quarter of a second; the LCD "Counter" and the count in hexadecimal', async () => {
  const p = await made('counter-pic24');
  for (const [ms, count] of [[100, 0], [400, 1], [1400, 5]]) {
    const b = (await emulate(p, ms)).board;
    assert.deepEqual(lit(b.leds), ['D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10'].filter((_, i) => (count >> i) & 1), `${ms} ms`);
    assert.deepEqual(b.lcd, ['Counter         ', `0x0${count}            `], `${ms} ms`);
  }
});

test('#5874 adc-pic24: R6\'s position a bar on the LEDs: none at one end, all eight at the other', async () => {
  const p = await made('adc-pic24');
  const bar = async v => lit((await emulate(p, 40, [{ node: 'pic', control: 'R6', value: v, at_ns: 5e6 }])).board.leds);
  const first = n => ['D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10'].slice(0, n);
  assert.deepEqual([await bar(0), await bar(0.25), await bar(0.6), await bar(1)], [[], first(2), first(5), first(8)]);
  assert.deepEqual(lit((await emulate(p, 40)).board.leds), first(4), 'R6 at its middle, at rest');
});

test('#5874 blinky-pico: its LED toggled every half second, said in its console', async () => {
  const p = await made('blinky-pico');
  assert.equal((await emulate(p, 1200)).console, 'LED on\r\nLED off\r\nLED on\r\n');
});

test('#5874 counter-pico: GP6..GP9 counting in binary every quarter of a second, each count in its console', async () => {
  const p = await made('counter-pico');
  assert.equal((await emulate(p, 1200)).console, 'count 0\r\ncount 1\r\ncount 2\r\ncount 3\r\ncount 4\r\n');
  // (its pins: the Pico has no board drawn, its node's levels read)
  await import('../server/rp2040-firmware.js');
  const sys = readSystem(fs.readFileSync(path.join(EX('counter-pico'), 'counter_pico.sys.json'), 'utf8')).system;
  const r = await prepareSystem(sys, { firmware: async f => fs.readFileSync(path.join(EX('counter-pico'), f), 'utf8') });
  assert.ok(!r.error, r.error);
  for (const [ms, count] of [[100, 0], [350, 1], [600, 2], [850, 3]]) {
    r.sim.run(ms * 1e9);
    assert.deepEqual(['GP6', 'GP7', 'GP8', 'GP9'].map(g => r.sim.nodes.get('pico').value(g)), [0, 1, 2, 3].map(b => (count >> b) & 1), `${ms} ms`);
  }
  assert.deepEqual([systemReport(r).warnings, systemReport(r).errors], [[], []]);
});

test('#5874 echo-pico: its Simulation Properties\' stimulus types "hello" in its console: echoed, no warning', async () => {
  const p = await made('echo-pico');
  const s = await ok('simulate', { project: p.name, top: p.sys });
  assert.deepEqual([s.data.time, s.data.stimulus, s.data.terminals], ['600 ms', 'echo.stim.json', { 'pico.repl': 'Type a line and press Enter.\r\n> hello\r\necho: hello\r\n> ' }]);
  assert.deepEqual([s.data.warnings, s.data.errors], [[], []]);
});

test('#5874 blinky-esp32: GPIO2 toggled every half second, said in its console', async () => {
  const p = await made('blinky-esp32');
  const a = await emulate(p, 300), b = await emulate(p, 800);
  assert.deepEqual([a.board.pins.GPIO2, a.console, b.board.pins.GPIO2, b.console], [1, 'GPIO2 on\n', 0, 'GPIO2 on\nGPIO2 off\n']);
});

test('#5874 counter-esp32: GPIO32, GPIO33, GPIO25 and GPIO26 counting in binary every quarter of a second, each count in its console', async () => {
  const p = await made('counter-esp32');
  const e = await emulate(p, 1200);
  assert.equal(e.console, 'count 0\ncount 1\ncount 2\ncount 3\ncount 4\n');
  assert.deepEqual(['GPIO32', 'GPIO33', 'GPIO25', 'GPIO26'].map(g => e.board.pins[g]), [0, 0, 1, 0]);
  const f = await emulate(p, 900);
  assert.deepEqual(['GPIO32', 'GPIO33', 'GPIO25', 'GPIO26'].map(g => f.board.pins[g]), [1, 1, 0, 0]);
});
