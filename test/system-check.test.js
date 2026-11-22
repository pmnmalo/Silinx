// A System document's check (core/system-check.js, #4697): no warnings on a valid system; every check's exact errors and
// warnings, each on its node or link (the nodes, the interfaces, the links, the wires, the levels); the console's lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSystem, systemCheckLines } from '../core/system-check.js';
import { normalizeSystem } from '../core/system-doc.js';

// the uart example's top (its ports), and a module of the project whose ports are not known (it does not elaborate)
const MODULES = { uart: [{ name: 'clk', dir: 'in', width: 1 }, { name: 'rx', dir: 'in', width: 1 }, { name: 'tx', dir: 'out', width: 1 },
  { name: 'led', dir: 'out', width: 8 }, { name: 'sw', dir: 'in', width: 8 }], sevenseg: null };
// a valid system: the FPGA's UART to a serial terminal, its LED to the Arduino's input (3.3 V into 5 V: no warning)
const base = () => ({ name: 'demo', nodes: [
  { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: { rx: 'J3', tx: 'A3', 'led<0>': 'M5', 'sw<0>': 'P11' },
    interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }, { name: 'led0', kind: 'gpio', pins: ['led<0>'], dir: 'out' }, { name: 'sw0', kind: 'gpio', pins: ['sw<0>'], dir: 'in' }] },
  { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/echo.hex', interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }, { name: 'btn', kind: 'gpio', pins: ['D2'], dir: 'in' }, { name: 'out', kind: 'gpio', pins: ['D3'], dir: 'out' }] },
  { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }] },
], links: [{ id: 'console', kind: 'uart', a: 'term.serial', b: 'fpga.uart' }, { id: 'w1', kind: 'gpio', a: 'fpga.led0', b: 'uno.btn' }] });
const CTX = { modules: MODULES, files: ['fw/echo.hex'] };
const run = (mut, ctx = CTX) => { const s = base(); mut?.(s); return checkSystem(normalizeSystem(s), ctx).map(d => `${d.severity}: ${d.message} [${d.ref.kind}:${d.ref.id}]`); };
const N = (s, id) => s.nodes.find(n => n.id === id), F = (s, id, f) => N(s, id).interfaces.find(i => i.name === f);

test('a valid system: no warnings; with no modules nor files known, none either', () => {
  assert.deepEqual(run(), []);
  assert.deepEqual(run(null, {}), []);
  assert.deepEqual(run(s => { N(s, 'fpga').module = 'sevenseg'; }), [], 'a module whose ports are not known: its ports not checked');
  assert.deepEqual(run(s => { delete F(s, 'fpga', 'uart').rx; }), [], 'a UART that only sends');
  assert.deepEqual(systemCheckLines('src/demo.sys.json', checkSystem(normalizeSystem(base()), CTX)), ['Process "Check System" of demo.sys.json completed successfully.']);
});

test('an Arduino and the FPGA by UART: a 5 V output on the FPGA\'s 3.3 V input, a warning', () => {
  assert.deepEqual(run(s => { s.links[0].a = 'uno.Serial'; }), [
    'warning: console: uno\'s D1, a 5 V output, drives fpga\'s rx (pin J3), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards [link:console]',
    'warning: term joins nothing: no link reaches it [node:term]']);
  assert.deepEqual(run(s => s.links.push({ id: 'w2', kind: 'gpio', a: 'uno.out', b: 'fpga.sw0' })), [
    'warning: w2: uno\'s D3, a 5 V output, drives fpga\'s sw<0> (pin P11), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards [link:w2]']);
});

test('a UART: the same baud and frame at both ends; its baud, its frame', () => {
  assert.deepEqual(run(s => { Object.assign(F(s, 'term', 'serial'), { baud: 115200, frame: '8E1' }); }), [
    'error: console: term.serial at 115200 baud, fpga.uart at 9600: a UART\'s ends at one baud [link:console]',
    'error: console: term.serial\'s frame 8E1, fpga.uart\'s 8N1: a UART\'s ends with one frame [link:console]']);
  assert.deepEqual(run(s => { F(s, 'term', 'serial').baud = 'fast'; }), ['error: term.serial: its baud \'fast\' is not a rate (bits per second) [node:term]']);
  assert.deepEqual(run(s => { F(s, 'term', 'serial').baud = 250000; F(s, 'fpga', 'uart').baud = 250000; }), [
    'warning: fpga.uart: 250000 baud is no standard rate (1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200) [node:fpga]',
    'warning: term.serial: 250000 baud is no standard rate (1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200) [node:term]']);
  assert.deepEqual(run(s => { F(s, 'fpga', 'uart').frame = '9N1'; }), ['error: fpga.uart: its frame \'9N1\' is not a frame (8N1: data bits 5 to 8, parity N, E or O, stop bits 1 or 2) [node:fpga]']);
  assert.deepEqual(run(s => { Object.assign(F(s, 'fpga', 'uart'), { tx: undefined, rx: undefined }); }), ['error: fpga.uart: a UART with no tx nor rx port [node:fpga]']);
});

test('TX crossed with RX: an FPGA\'s TX an input of its module; an Arduino\'s TX and RX not its board\'s', () => {
  assert.deepEqual(run(s => { Object.assign(F(s, 'fpga', 'uart'), { tx: 'rx', rx: 'tx' }); }), [
    'error: fpga.uart: its TX rx is an input of uart: TX and RX crossed? [node:fpga]',
    'error: fpga.uart: its RX tx is an output of uart: TX and RX crossed? [node:fpga]']);
  assert.deepEqual(run(s => { s.links[0].a = 'uno.Serial'; Object.assign(F(s, 'uno', 'Serial'), { tx: 'D0', rx: 'D1' }); }), [
    'error: uno.Serial: TX and RX crossed: the Arduino Uno\'s TX is D1, its RX D0 [node:uno]',
    'warning: term joins nothing: no link reaches it [node:term]']);
  assert.deepEqual(run(s => { F(s, 'uno', 'Serial').tx = 'D5'; }), ['error: uno.Serial: the Arduino Uno\'s Serial is TX D1, RX D0 [node:uno]']);
  assert.deepEqual(run(s => { F(s, 'uno', 'Serial').name = 'Serial1'; }), ['error: uno: the Arduino Uno has no UART Serial1 (its UART: Serial) [node:uno]']);
});

test('an FPGA node\'s ports: of its module, in their direction, each on a pin of its board, one per pin', () => {
  assert.deepEqual(run(s => { F(s, 'fpga', 'led0').pins = ['leds<0>']; }), ['error: fpga.led0: leds<0> is no port of uart [node:fpga]']);
  assert.deepEqual(run(s => { F(s, 'fpga', 'led0').pins = ['rx<0>']; }), ['error: fpga.led0: rx<0> is no port of uart [node:fpga]'], 'a bit of a port of one bit');
  assert.deepEqual(run(s => { delete N(s, 'fpga').pins['led<0>']; }), ['error: fpga.led0: led<0> has no pin of the board [node:fpga]']);
  assert.deepEqual(run(s => { N(s, 'fpga').pins['led<0>'] = 'Z99'; }), ['error: fpga: led<0>\'s pin Z99 is not a pin of the Digilent Basys2 [node:fpga]']);
  assert.deepEqual(run(s => { N(s, 'fpga').pins['sw<0>'] = 'M5'; }), ['error: fpga: led<0> and sw<0> are both on pin M5 [node:fpga]']);
  assert.deepEqual(run(s => { F(s, 'fpga', 'led0').dir = 'in'; }), ['error: fpga.led0: led<0> is an output of uart, the interface an input [node:fpga]']);
});

test('the wires: driven twice, driven by nothing, a pin or an interface in two links, the widths', () => {
  assert.deepEqual(run(s => { s.links[1].b = 'uno.out'; }), ['error: w1: fpga\'s led<0> (pin M5) and uno\'s D3 are both outputs: a wire driven twice [link:w1]']);
  assert.deepEqual(run(s => { s.links[1].a = 'fpga.sw0'; }), ['warning: w1: fpga\'s sw<0> (pin P11) and uno\'s D2 are both inputs: nothing drives the wire [link:w1]']);
  assert.deepEqual(run(s => {
    N(s, 'uno').interfaces.push({ name: 'btn2', kind: 'gpio', pins: ['D2'], dir: 'in' });
    N(s, 'fpga').interfaces.push({ name: 'led0b', kind: 'gpio', pins: ['led<0>'], dir: 'out' });
    s.links.push({ id: 'w2', kind: 'gpio', a: 'fpga.led0b', b: 'uno.btn2' });
  }), ['error: fpga\'s led<0> (pin M5) is used by two links, w1 and w2 [link:w2]', 'error: uno\'s D2 is used by two links, w1 and w2 [link:w2]']);
  assert.deepEqual(run(s => s.links.push({ id: 'w2', kind: 'gpio', a: 'fpga.led0', b: 'uno.btn' })), ['error: w2: fpga.led0 is already w1\'s [link:w2]', 'error: w2: uno.btn is already w1\'s [link:w2]']);
  assert.deepEqual(run(s => s.links.push({ id: 'ser', kind: 'uart', a: 'uno.Serial', b: 'fpga.uart' })), ['error: ser: fpga.uart is already console\'s [link:ser]']);
  assert.deepEqual(run(s => { F(s, 'uno', 'btn').pins = ['D2', 'D4']; }), ['error: w1: fpga.led0 has 1 pin(s), uno.btn 2: a GPIO link\'s ends have as many pins [link:w1]']);
});

test('the links: their ids, kinds and ends', () => {
  assert.deepEqual(run(s => { s.links[1].b = 'uno.Serial'; }), ['error: w1: a GPIO link, uno.Serial is a UART [link:w1]']);
  assert.deepEqual(run(s => { s.links[1].b = 'fpga.sw0'; }), ['error: w1: both ends on fpga: a link joins two nodes [link:w1]', 'warning: uno joins nothing: no link reaches it [node:uno]']);
  assert.deepEqual(run(s => s.links.push({ id: 'w3', kind: 'gpio', a: 'fpga', b: 'nobody.x' }, { id: 'w4', kind: 'gpio', a: 'uno.nothing', b: 'fpga.sw0' })), [
    'error: w3: its end \'fpga\' is not node.interface [link:w3]', 'error: w3: no node nobody [link:w3]', 'error: w4: uno has no interface nothing [link:w4]']);
  assert.deepEqual(run(s => s.links.push({ id: 'w1', kind: 'gpio', a: 'uno.out', b: 'fpga.sw0' }, { id: '', kind: 'gpio', a: 'uno.out', b: 'fpga.sw0' }, { id: 'w5', kind: 'can', a: 'uno.out', b: 'fpga.sw0' })), [
    'error: Two links are named w1 [link:w1]', 'error: A link (uno.out to fpga.sw0) has no id [link:]', 'error: w5: no link kind \'can\' (the kinds: uart, gpio, spi) [link:w5]']);
  assert.deepEqual(run(s => { s.links.splice(1, 1); }), ['warning: uno joins nothing: no link reaches it [node:uno]']);
});

test('the nodes: ids, kinds, modules, boards, firmware', () => {
  assert.deepEqual(run(s => s.nodes.push({ id: 'uno', kind: 'mcu', board: 'arduino-uno' }, { kind: 'terminal' }, { id: 'x', kind: 'robot' })), [
    'error: Two nodes are named uno [node:uno]', 'error: A node (terminal) has no id [node:]', 'error: x: no node kind \'robot\' (the kinds: fpga, mcu, terminal) [node:x]']);
  assert.deepEqual(run(s => { Object.assign(N(s, 'fpga'), { module: 'nomod', board: 'zedboard' }); Object.assign(N(s, 'uno'), { board: 'esp32', firmware: 'fw/echo.bin' }); }), [
    'error: fpga: no module \'nomod\' in the project [node:fpga]', 'error: fpga: no FPGA board \'zedboard\' (variant 250) [node:fpga]',
    'error: uno: no microcontroller board \'esp32\' (the boards: arduino-uno, arduino-nano) [node:uno]', 'error: uno: its firmware fw/echo.bin is not a .hex or an .elf [node:uno]']);
  assert.deepEqual(run(s => { Object.assign(N(s, 'fpga'), { module: null, board: null }); N(s, 'uno').board = null; }), [
    'error: fpga: an FPGA node with no module [node:fpga]', 'error: fpga: an FPGA node with no board [node:fpga]', 'error: uno: a microcontroller with no board [node:uno]']);
  assert.deepEqual(run(s => { N(s, 'uno').firmware = 'fw/other.hex'; }), ['error: uno: no firmware fw/other.hex in the project [node:uno]']);
  assert.deepEqual(run(s => { N(s, 'uno').firmware = null; }), [], 'no firmware yet: not an error of the System');
});

test('the interfaces: names, kinds, pins, directions', () => {
  assert.deepEqual(run(s => N(s, 'uno').interfaces.push({ name: '', kind: 'gpio' }, { name: 'btn', kind: 'gpio', pins: ['D7'], dir: 'in' }, { name: 'g', kind: 'gpio', pins: [], dir: 'in' },
    { name: 'h', kind: 'gpio', pins: ['D8'], dir: 'both' }, { name: 's', kind: 'can' }, { name: 'k', kind: 'gpio', pins: ['D20', 'A9'], dir: 'in' })), [
    'error: uno: an interface has no name [node:uno]', 'error: uno: two interfaces are named btn [node:uno]', 'error: uno.g: a GPIO interface with no pins [node:uno]',
    'error: uno.h: its direction \'both\' is not in or out [node:uno]', 'error: uno.s: no interface kind \'can\' (the kinds: uart, gpio, spi) [node:uno]',
    'error: uno.k: D20, A9 are not pins of the Arduino Uno [node:uno]']);
  assert.deepEqual(run(s => N(s, 'term').interfaces.push({ name: 'g', kind: 'gpio', pins: ['x'], dir: 'in' })), ['error: term: a serial terminal has UART interfaces only (g is gpio) [node:term]']);
  assert.deepEqual(run(s => { N(s, 'uno').board = 'arduino-nano'; F(s, 'uno', 'out').pins = ['A6', 'A7']; }), ['error: uno.out: A6, A7 of the Arduino Nano are inputs only [node:uno]']);
});

test('the console\'s lines: each message, then the summary', () => {
  const s = base(); s.links[1].b = 'uno.out'; s.links[1].a = 'fpga.led0'; F(s, 'term', 'serial').baud = 250000; F(s, 'fpga', 'uart').baud = 250000;
  assert.deepEqual(systemCheckLines('demo.sys.json', checkSystem(normalizeSystem(s), CTX)), [
    'WARNING: fpga.uart: 250000 baud is no standard rate (1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200)',
    'WARNING: term.serial: 250000 baud is no standard rate (1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200)',
    'ERROR: w1: fpga\'s led<0> (pin M5) and uno\'s D3 are both outputs: a wire driven twice',
    'Process "Check System" of demo.sys.json failed (1 error(s), 2 warning(s)).']);
  const w = base(); F(w, 'term', 'serial').baud = 250000; F(w, 'fpga', 'uart').baud = 250000;
  assert.equal(systemCheckLines('demo.sys.json', checkSystem(normalizeSystem(w), CTX)).at(-1), 'Process "Check System" of demo.sys.json completed successfully with 2 warning(s).');
});

test('#5213 a 1-bit port\'s pin by either spelling (btn, btn<0>: a UCF\'s): found, its levels checked; a bus\'s bit by its own only', () => {
  const MODS = { ...MODULES, uart: [...MODULES.uart, { name: 'btn', dir: 'in', width: 1 }] };
  const press = (s, pins) => {
    N(s, 'fpga').pins['btn<0>'] = 'G12';
    N(s, 'fpga').interfaces.push({ name: 'press', kind: 'gpio', pins, dir: 'in' });
    s.links.push({ id: 'p', kind: 'gpio', a: 'uno.out', b: 'fpga.press' });
  };
  const W = 'warning: p: uno\'s D3, a 5 V output, drives fpga\'s btn (pin G12), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards [link:p]';
  assert.deepEqual(run(s => press(s, ['btn']), { ...CTX, modules: MODS }), [W]);
  // (an 8-bit port's: its bit's pin, led<0>, is not the whole port's, led)
  assert.deepEqual(run(s => { F(s, 'fpga', 'led0').pins = ['led']; }), ['error: fpga.led0: led has no pin of the board [node:fpga]']);
});
