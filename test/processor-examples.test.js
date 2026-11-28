// The processor boards' examples (#5874, core/examples.js PROCESSOR_EXAMPLES): the FPGA examples' designs on each Board
// Type's board, each a Board project of its board alone (a System of its one microcontroller node, its board named),
// listed by its Board Type; made with the MCP server (new_project_from_example), checked (check_system: no warning) and
// run as the Board Emulator runs it (simulate with controls: its buttons pressed, R6 turned), its behaviour and its
// warnings asserted; a run longer than simulate's 10 s on the PIC24 node and its Explorer 16/32 themselves. The
// Explorer 16/32's: blinky, traffic, stopwatch, clock and lock in PIC24 assembly, each .hex its .asm assembled. The
// refusals, each said.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, ROOT } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';
import { asmHex } from './pic24-node-lib.mjs';
import { Pic24Node, Explorer1632 } from '../packages/silinx-pic24/src/index.js';
import { PROCESSOR_EXAMPLES, PROCESSOR_ORDER, exampleBoardType, exampleModes, orderExamples } from '../core/examples.js';
import { createRefusal } from '../core/project-kind.js';
import { modeOf } from '../core/project-mode.js';
import { BOARD_TYPES, boardType, exampleOnBoard, processorBoardOf, processorExampleText } from '../core/processor-board.js';
import { readSystem, isSystemFile, writeSystem } from '../core/system-doc.js';

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
const firmwareOf = name => readSystem(fs.readFileSync(path.join(EX(name), sysOf(name)), 'utf8')).system.nodes[0].firmware;
// a project made from the example, its System's file
async function made(example) {
  const name = `${example.replace(/-/g, '_')}_${++id}`;
  await ok('new_project_from_example', { name, example });
  return { name, sys: sysOf(example) };
}
// the Explorer 16/32 emulated to `ms` (the Board Emulator's run: simulate with controls), [control, at ms, on | value]
// each: its LEDs lit, its LCD's rows; no warning nor error
async function emulate(p, ms, controls = []) {
  const s = await ok('simulate', { project: p.name, top: p.sys, time_ns: ms * 1e6, controls: controls.map(([control, at, v = true]) => ({ node: 'pic', control, at_ns: at * 1e6, ...(typeof v === 'number' ? { value: v } : { on: v }) })) });
  assert.deepEqual([s.data.warnings, s.data.errors], [[], []], s.text);
  const b = s.data.boards.pic;
  return { leds: Object.entries(b.leds).filter(([, v]) => v > 0.5).map(([d]) => d), lcd: b.lcd };
}
const LEDS = ['D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10'];
const bits = (n, from = 0) => LEDS.filter((_, i) => i >= from && ((n >> (i - from)) & 1));
// the example's firmware on the PIC24 node and its board themselves, for a run of any length: at(ms) runs it to ms,
// press / release a button, leds(), lcd()
function onBoard(name) {
  const node = new Pic24Node({ hex: fs.readFileSync(path.join(EX(name), firmwareOf(name)), 'utf8') });
  const board = new Explorer1632(node.device);
  let t = 0;
  const b = {
    at(ms) { node.run(node.time + (ms - t) * 1e9); t = ms; return b; },
    press(x) { board.press(x); return b; },
    release(x) { board.release(x); return b; },
    leds: () => Object.entries(board.leds()).filter(([, on]) => on).map(([d]) => d),
    lcd: () => board.lcd.lines(),
  };
  return b;
}

test('#5874 the examples by Board Type: the FPGA examples\' designs on the Explorer 16/32; Board mode; after the Circuit versions, before the System examples; a System or a Circuit project refused', () => {
  assert.deepEqual(PROCESSOR_EXAMPLES, { avr: [], pic24: ['blinky-pic24', 'traffic-pic24', 'stopwatch-pic24', 'clock-pic24', 'lock-pic24'], rp2040: [], esp32: [] });
  assert.deepEqual(Object.keys(PROCESSOR_EXAMPLES), BOARD_TYPES.slice(1).map(t => t.id), 'every processor Board Type has its list');
  for (const n of PROCESSOR_ORDER) {
    assert.deepEqual([exampleBoardType(n), exampleModes(n)], ['pic24', ['board']], n);
    assert.ok(fs.existsSync(EX(n.replace(/-pic24$/, ''))), `${n}: the FPGA example ${n.replace(/-pic24$/, '')}'s design`);
  }
  assert.deepEqual(['gates', 'blinky', 'traffic-circuit', 'uart-avr', 'nothere'].map(exampleBoardType), ['fpga', 'fpga', null, null, 'fpga']);
  assert.deepEqual(orderExamples(['uart-avr', 'lock-pic24', 'blinky-pic24', 'lock-circuit', 'gates']), ['gates', 'lock-circuit', 'blinky-pic24', 'lock-pic24', 'uart-avr']);
  assert.deepEqual([createRefusal(null, 'blinky-pic24'), createRefusal('fpga', 'blinky-pic24'), createRefusal('system', 'clock-pic24'), createRefusal('embedded', 'lock-pic24'), createRefusal('design', 'traffic-pic24')],
    [null, null, 'clock-pic24 is a processor board\'s example: a Board project starts from it (mode board)', 'lock-pic24 is a processor board\'s example: a Board project starts from it (mode board)',
      'a design and simulation project starts empty or from a Circuit example (gates, breadboard, traffic-circuit, blinky-circuit, stopwatch-circuit, lock-circuit)']);
});

test('#5874 each example: a Board project of its board alone (its System of one node, its firmware in the node\'s folder, as New Project\'s starter); its .hex its .asm assembled, no label twice', () => {
  for (const n of PROCESSOR_ORDER) {
    const pj = JSON.parse(fs.readFileSync(path.join(EX(n), 'silinx.json'), 'utf8'));
    assert.deepEqual([pj.name, modeOf(pj), processorBoardOf(pj), boardType(pj.board), pj.top, pj.constraints], [n, 'board', 'explorer-1632', 'pic24', '', null], n);
    const r = readSystem(fs.readFileSync(path.join(EX(n), sysOf(n)), 'utf8'));
    assert.deepEqual([sysOf(n), r.system.name, r.system.links, r.system.nodes.map(x => [x.id, x.kind, x.board, x.firmware])], [`${n.replace(/-/g, '_')}.sys.json`, n.replace(/-/g, '_'), [], [['pic', 'mcu', 'explorer-1632', `pic/${n.replace(/-pic24$/, '')}.hex`]]], n);
    const asm = fs.readFileSync(path.join(EX(n), firmwareOf(n).replace(/\.hex$/, '.asm')), 'utf8').split('\n');
    assert.equal(fs.readFileSync(path.join(EX(n), firmwareOf(n)), 'utf8'), asmHex(asm), n);
    // (the tests' assembler keeps a label's last place: none twice, #5893)
    const labels = asm.map(l => /^([A-Za-z_]\w*):/.exec(l)?.[1]).filter(Boolean);
    assert.deepEqual(labels.filter((l, i) => labels.indexOf(l) !== i), [], `${n}: no label defined twice`);
  }
});

test('#5874 exampleOnBoard: an example on another board of its type (its node\'s board, its silinx.json\'s); its own board as it is; another type\'s refused', () => {
  const sys = { path: 's.sys.json', text: writeSystem({ format: 'silinx-system', version: 2, name: 's', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'uno/x.hex', interfaces: [] }], links: [] }) };
  const pj = { name: 'ex', board: 'arduino-uno', profile: 'embedded', top: '' };
  const r = exampleOnBoard(pj, sys, 'arduino-nano');
  assert.deepEqual([r.project.board, r.writes.map(w => w.path), readSystem(r.writes[0].text).system.nodes.map(x => [x.id, x.board, x.firmware])], ['arduino-nano', ['s.sys.json'], [['uno', 'arduino-nano', 'uno/x.hex']]]);
  assert.deepEqual(exampleOnBoard(pj, sys, 'arduino-uno'), { project: pj, writes: [] });
  assert.deepEqual(exampleOnBoard(pj, sys, 'pico'), { error: '\'pico\' is not a board of its type, Arduino (arduino-uno, arduino-nano)' });
  assert.deepEqual(exampleOnBoard({ ...pj, board: 'explorer-1632' }, sys, 'basys2'), { error: '\'basys2\' is not a board of its type, PIC24 (explorer-1632)' });
  assert.deepEqual(exampleOnBoard({ name: 'f', board: 'basys2' }, sys, 'arduino-uno'), { error: 'f: not a processor board\'s project' });
  assert.equal(processorExampleText('p', 'clock-pic24', 'explorer-1632', 'pic/clock.hex'), 'Board project \'p\' made from the example clock-pic24 for the Explorer 16/32: its firmware pic/clock.hex.');
});

test('#5874 list_examples: each one\'s Board Type; filtered by mode and Board Type as New Project\'s Start from; none, said', async () => {
  const all = await ok('list_examples', {});
  assert.deepEqual(all.data.examples.filter(e => PROCESSOR_ORDER.includes(e.name)).map(e => e.name), PROCESSOR_ORDER);
  assert.deepEqual(all.data.examples.find(e => e.name === 'clock-pic24'), { name: 'clock-pic24', modes: ['board'], boardType: 'pic24', top: null, simTop: null, board: 'explorer-1632', device: null, files: 3 });
  assert.equal(all.data.examples.find(e => e.name === 'gates').boardType, 'fpga');
  const pic = await ok('list_examples', { mode: 'board', board_type: 'pic24' });
  assert.deepEqual(lines(pic.text), PROCESSOR_ORDER.map(n => `${n}: a PIC24 example (Board Type pic24) for the Explorer 16/32, 3 file(s)`));
  const by = async args => (await ok('list_examples', args)).data.examples.map(e => e.name);
  assert.deepEqual(await by({ board_type: 'fpga' }), ['gates', 'breadboard', 'traffic', 'blinky', 'pong', 'stopwatch', 'clock', 'vga', 'isqrt', 'uart', 'micro80', 'lock']);
  assert.deepEqual(await by({ mode: 'circuit' }), ['gates', 'breadboard', 'traffic-circuit', 'blinky-circuit', 'stopwatch-circuit', 'lock-circuit']);
  assert.deepEqual(lines((await ok('list_examples', { board_type: 'avr' })).text), ['No example of that mode and Board Type.']);
});

test('#5874 new_project_from_example: a processor board\'s example made; the refusals, nothing made', async () => {
  const a = await ok('new_project_from_example', { name: 'n1', example: 'clock-pic24' });
  assert.deepEqual(lines(a.text), ['Board project \'n1\' made from the example clock-pic24 for the Explorer 16/32: its firmware pic/clock.hex.']);
  assert.deepEqual(a.data, { project: 'n1', mode: 'board', board: 'explorer-1632', node: 'pic', firmware: 'pic/clock.hex', system: 'clock_pic24.sys.json', trusted: false });
  const info = (await ok('project_info', { project: 'n1' })).data;
  assert.deepEqual([info.mode, info.board, info.nodes.map(n => [n.id, n.board])], ['board', 'explorer-1632', [['pic', 'explorer-1632']]]);
  await fails('new_project_from_example', { name: 'r1', example: 'clock-pic24', board: 'pico' }, 'board: \'pico\' is not a board of its type, PIC24 (explorer-1632)');
  await fails('new_project_from_example', { name: 'r2', example: 'blinky-pic24', mode: 'system' }, 'blinky-pic24 is not a system example (its modes: board)');
  await fails('new_project_from_example', { name: 'r3', example: 'blinky-pic24', mode: 'circuit' }, 'blinky-pic24 is not a circuit example (its modes: board)');
  await fails('new_project_from_example', { name: 'r4', example: 'lock-pic24', variant: '250' }, 'variant: a processor board has none');
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

test('#5874 blinky-pic24: the knight rider on D3..D10, a step every 320 ms, counted on the LCD; S3 the binary counter, S4 / S6 faster / slower', async () => {
  const p = await made('blinky-pic24');
  for (const [ms, led, steps] of [[100, 'D3', 0], [400, 'D4', 1], [2400, 'D10', 7], [2700, 'D9', 8]]) {
    assert.deepEqual(await emulate(p, ms), { leds: [led], lcd: ['Knight rider    ', `Steps ${String(steps).padStart(4, '0')}  sp 5`] }, `${ms} ms`);
  }
  // (S3: the steps in binary; 3 steps at 1 s)
  assert.deepEqual(await emulate(p, 1000, [['S3', 500]]), { leds: bits(3), lcd: ['Binary counter  ', 'Steps 0003  sp 5'] });
  // (S4 twice: speed 3, a step every 80 ms from then on; S6: slower)
  assert.equal((await emulate(p, 600, [['S4', 100], ['S4', 200, false], ['S4', 300]])).lcd[1], 'Steps 0005  sp 3');
  assert.equal((await emulate(p, 300, [['S6', 100]])).lcd[1], 'Steps 0000  sp 6');
});

test('#5874 traffic-pic24: the cars\' green until S3; yellow, all red, walk (the seconds left to cross), walk blinking, all red, green again; S6 night', async () => {
  const p = await made('traffic-pic24');
  const CARS = ['D4', 'D8'], BLANK = '                ';
  assert.deepEqual(await emulate(p, 7000), { leds: CARS, lcd: ['Cars: green     ', BLANK] }, 'no request: the cars keep their green');
  // (a request at 1 s: the cars' green to 5 s, yellow to 7 s, all red to 8 s, walk from 8 s: 8 - its seconds left)
  assert.deepEqual(await emulate(p, 6000, [['S3', 1000]]), { leds: ['D4', 'D9'], lcd: ['Cars: yellow    ', BLANK] });
  assert.deepEqual(await emulate(p, 7500, [['S3', 1000]]), { leds: ['D4', 'D10'], lcd: ['All red         ', BLANK] });
  assert.deepEqual(await emulate(p, 9500, [['S3', 1000]]), { leds: ['D3', 'D10'], lcd: ['Walk            ', 'Cross: 7 s      '] });
  // (the rest, past simulate's 10 s, on the board itself: the green blinking 13 to 16 s (2 Hz: on in each second's first
  // and third quarter), all red to 17 s, the cars' green from 17 s)
  const b = onBoard('traffic-pic24').at(1000).press('S3').at(1100).release('S3');
  const seen = ms => { b.at(ms); return [b.leds(), b.lcd()]; };
  assert.deepEqual(seen(13100), [['D3', 'D10'], ['Walk: hurry     ', 'Cross: 3 s      ']]);
  assert.deepEqual(seen(13400), [['D10'], ['Walk: hurry     ', 'Cross: 3 s      ']]);
  assert.deepEqual(seen(15600), [['D3', 'D10'], ['Walk: hurry     ', 'Cross: 1 s      ']]);
  assert.deepEqual(seen(16500), [['D4', 'D10'], ['All red         ', BLANK]]);
  assert.deepEqual(seen(17500), [CARS, ['Cars: green     ', BLANK]]);
  // (night: the cars' yellow flashing, the pedestrians' lamps off; S6 again: the cars' green)
  assert.deepEqual(await emulate(p, 3250, [['S6', 100]]), { leds: ['D9'], lcd: ['Night           ', BLANK] });
  assert.deepEqual((await emulate(p, 3000, [['S6', 100]])).leds, []);
  assert.deepEqual(await emulate(p, 3000, [['S6', 100], ['S6', 200, false], ['S6', 300]]), { leds: CARS, lcd: ['Cars: green     ', BLANK] });
});

test('#5874 stopwatch-pic24: S3 start / stop, S4 laps (D3..D9 their count), S5 recall, S6 clear when stopped', async () => {
  const p = await made('stopwatch-pic24');
  const D = l => l.filter(d => d !== 'D10');   // (D10: RA7, S5's input here, lit by its pull-up while S5 is up: #5880)
  const run = async (ms, controls) => { const e = await emulate(p, ms, controls); return [D(e.leds), e.lcd]; };
  const LAPS = [['S3', 100], ['S4', 600], ['S4', 800, false], ['S4', 1000]];
  assert.deepEqual(await run(500, []), [[], ['Time    00.00   ', 'Laps 00  stopped']]);
  assert.deepEqual(await run(1300, [['S3', 100]]), [[], ['Time    01.20   ', 'Laps 00  running']]);
  assert.deepEqual(await run(1300, LAPS), [bits(2), ['Time    01.20   ', 'Laps 02  running']]);
  // (recalled: lap 1, its time 0.50 s; S3: back to the running time)
  assert.deepEqual(await run(2000, [...LAPS, ['S5', 1500]]), [bits(1), ['Lap 01  00.50   ', 'Laps 02  running']]);
  assert.deepEqual(await run(2000, [...LAPS, ['S5', 1500], ['S3', 1600, false], ['S3', 1700]]), [bits(2), ['Time    01.90   ', 'Laps 02  running']]);
  // (stopped at 0.6 s, then cleared)
  assert.deepEqual(await run(1200, [['S3', 100], ['S3', 500, false], ['S3', 600]]), [[], ['Time    00.50   ', 'Laps 00  stopped']]);
  assert.deepEqual(await run(2000, [['S3', 100], ['S3', 500, false], ['S3', 600], ['S6', 1500]]), [[], ['Time    00.00   ', 'Laps 00  stopped']]);
});

test('#5874 clock-pic24: HH:MM, its colon blinking; the seconds on D3..D8, D9 each second\'s first half; S3 / S4 hours / minutes + 1, S6 the seconds to 0, S5 MM:SS', async () => {
  const p = await made('clock-pic24');
  const D = l => l.filter(d => d !== 'D10');   // (D10: RA7, S5's input, its pull-up: #5880)
  const run = async (ms, controls = []) => { const e = await emulate(p, ms, controls); return [D(e.leds), e.lcd]; };
  assert.deepEqual(await run(2300), [[...bits(2), 'D9'], ['     00:00      ', ' Hours:minutes  ']]);
  assert.deepEqual(await run(2700), [bits(2), ['     00 00      ', ' Hours:minutes  ']]);
  assert.deepEqual(await run(1300, [['S3', 100], ['S3', 200, false], ['S3', 300], ['S4', 500]]), [[...bits(1), 'D9'], ['     02:01      ', ' Hours:minutes  ']]);
  assert.deepEqual(await run(2300, [['S5', 100]]), [[...bits(2), 'D9'], ['     00:02      ', 'Minutes:seconds ']]);
  assert.deepEqual(await run(1300, [['S6', 900]]), [['D9'], ['     00:00      ', ' Hours:minutes  ']]);
  // (on the board itself: 23 hours and 59 minutes set, then a minute: 00:00)
  const b = onBoard('clock-pic24');
  for (let k = 0; k < 23; k++) b.at(100 + 200 * k).press('S3').at(200 + 200 * k).release('S3');
  for (let k = 0; k < 59; k++) b.at(5000 + 200 * k).press('S4').at(5100 + 200 * k).release('S4');
  b.at(17200);   // (in a second's first half: the colon lit)
  assert.equal(b.lcd()[0], '     23:59      ');
  b.at(17200 + 60000);
  assert.equal(b.lcd()[0], '     00:00      ');
});

test('#5874 lock-pic24: R6 the digit, S3 Enter: 2 0 2 6 opens; a wrong one locks out 3 s, then 6 s; the third the alarm until reset; S6 Clear', async () => {
  const p = await made('lock-pic24');
  const digit = d => (d + 0.5) / 10;   // (R6's travel for the digit d)
  const enter = ds => ds.flatMap((d, i) => [['R6', 300 + 400 * i, digit(d)], ['S3', 400 + 400 * i], ['S3', 500 + 400 * i, false]]);
  assert.deepEqual(await emulate(p, 200, [['R6', 5, digit(5)]]), { leds: bits(5, 4), lcd: ['Code _ _ _ _    ', 'Digit 5         '] });
  assert.deepEqual(await emulate(p, 2000, enter([2, 0, 2])), { leds: bits(2, 4), lcd: ['Code 2 0 2 _    ', 'Digit 2         '] });
  assert.deepEqual(await emulate(p, 2000, enter([2, 0, 2, 6])), { leds: ['D3', ...bits(6, 4)], lcd: ['Code 2 0 2 6    ', 'Open            '] });
  assert.deepEqual(await emulate(p, 2500, [...enter([2, 0, 2, 6]), ['S6', 2000]]), { leds: bits(6, 4), lcd: ['Code _ _ _ _    ', 'Digit 6         '] });
  // (a wrong digit: locked out 3 s, the seconds left shown; then a new code)
  assert.deepEqual(await emulate(p, 1000, enter([9])), { leds: ['D5', ...bits(9, 4)], lcd: ['Code 9 _ _ _    ', 'Wait 3 s        '] });
  assert.deepEqual(await emulate(p, 4000, enter([9])), { leds: bits(9, 4), lcd: ['Code _ _ _ _    ', 'Digit 9         '] });
  // (on the board itself, R6 at its middle, 5: a wrong first digit each time; the second locks out 6 s, the third
  // sounds the alarm, until reset)
  const b = onBoard('lock-pic24');
  const typed = ms => b.at(ms).press('S3').at(ms + 100).release('S3');
  typed(300).at(1500);
  assert.equal(b.lcd()[1], 'Wait 2 s        ');
  typed(3500).at(4000);
  assert.equal(b.lcd()[1], 'Wait 6 s        ');
  b.at(9400);
  assert.equal(b.lcd()[1], 'Wait 1 s        ');
  typed(9600).at(10000);
  assert.deepEqual([b.lcd()[1], b.leds().filter(d => ['D3', 'D4', 'D5'].includes(d))], ['ALARM           ', ['D4', 'D5']]);
  b.at(30000);
  assert.equal(b.lcd()[1], 'ALARM           ', 'until reset');
});
