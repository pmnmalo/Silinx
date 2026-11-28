// A System's PIC24 node (#5484, core/system-sim-pic24.js): the Explorer 16/32's PIC24FJ1024GB610 run by silinx-pic24
// behind the node contract, its firmware a .hex made by the tests' assembler (test/pic24-node-lib.mjs): a button
// lighting an LED, a pin following a link's, a UART echo through the System's link to a terminal, two PIC24s by GPIO;
// its firmware not read; the board in the System's check (its .hex, its UART, a 5 V output on its 3.3 V input), its
// edits (added with its UART; an Uno changed into it, its Serial renamed with its link), a drawing in its folder (its
// C not made yet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pic24Board, pic24Contract, PIC24_FIDELITY } from '../core/system-sim-pic24.js';
import { contractProblems } from '../core/system-contract.js';
import { MCU_BOARDS, mcuBoard, normalizeSystem } from '../core/system-doc.js';
import { systemPlan, buildSystem } from '../core/system-build.js';
import { checkSystem } from '../core/system-check.js';
import { addNode, changeNode, addLink } from '../core/system-edit.js';
import { drawingCode } from '../core/drawing-code.js';
import { Ports } from '../packages/silinx-pic24/src/index.js';
import { buttonLedHex, echoHex } from './pic24-node-lib.mjs';

const MS = 1e9;
const fw = (data, name = 'pic/fw.hex') => ({ name, data });

test('#5484 the Explorer 16/32 among the microcontrollers\' boards: its PIC24, its pins the device\'s, 3.3 V, its UART the USB-UART\'s', () => {
  const b = mcuBoard('explorer-1632');
  assert.deepEqual([b.name, b.arch, b.mcu, b.vio, b.firmwares, b.uarts, b.spis, b.i2cs], ['Explorer 16/32', 'pic24', 'PIC24FJ1024GB610', 3.3, ['hex'], { UART: { tx: 'RF5', rx: 'RF4' } }, {}, {}]);
  // (the device's port pins, as silinx-pic24 has them: 84 of the 100-pin package)
  const pic = new Pic24Board({ firmware: fw(buttonLedHex()) });
  assert.deepEqual(b.pins, pic.pic.device.ports.names);
  assert.equal(b.pins.length, 84);
  assert.ok(b.pins.every(p => Ports.parse(p)));
  assert.deepEqual(MCU_BOARDS.map(m => [m.id, m.arch, m.firmwares]), [['arduino-uno', 'avr', ['hex', 'elf']], ['arduino-nano', 'avr', ['hex', 'elf']], ['explorer-1632', 'pic24', ['hex']], ['pico', 'rp2040', ['py']], ['pico-w', 'rp2040', ['py']], ['esp32-devkitc', 'esp32', ['py']]]);
});

test('#5484 the PIC24 on its board: S3 pressed lights D3 (RA0); RA1 follows RD13 from outside, at the instruction that reads it', () => {
  const pic = new Pic24Board({ firmware: fw(buttonLedHex()) });
  assert.equal(pic.pic.fcy, 2e6, 'the erased oscillator words\': the FRC divided');
  assert.deepEqual([pic.value('RD6'), pic.value('RD13'), pic.value('RA0')], [1, 1, null], 'the buttons\' pull-ups; RA0 an input at reset');
  let r = pic.run(MS);
  assert.deepEqual(r.outputs.filter(o => ['RA0', 'RA1', 'RA2'].includes(o.pin)).map(o => [o.pin, o.value]), [['RA0', 0], ['RA1', 0], ['RA2', 0], ['RA1', 1], ['RA2', 1]]);
  assert.deepEqual([pic.value('RA0'), pic.value('RA1'), pic.value('RA2')], [0, 1, 1]);
  pic.explorer.press('S3');
  r = pic.run(2 * MS, [{ pin: 'RD13', t: 1.5 * MS, value: 0 }]);
  assert.deepEqual(r.outputs.map(o => [o.pin, o.value]), [['RA0', 1], ['RA1', 0]]);
  const ra1 = r.outputs.find(o => o.pin === 'RA1').t;
  assert.ok(ra1 > 1.5 * MS && ra1 < 1.5 * MS + 20e6, `RA1 within 40 cycles of RD13 (${ra1} ps)`);
  assert.deepEqual(pic.messages(), []);
  assert.equal(pic.finished, null);
});

test('#5484 the PIC24 behind the node contract: 84 ports at 3.3 V, its fidelity notes; saved and restored, the same run', () => {
  const node = pic24Contract({ firmware: fw(buttonLedHex()) });
  assert.deepEqual(contractProblems(node), []);
  assert.equal(node.ports.length, 84);
  assert.ok(node.ports.every(p => p.dir === 'inout' && p.volts === 3.3 && p.kind === 'pin'));
  assert.deepEqual(node.fidelity, PIC24_FIDELITY);
  assert.deepEqual(PIC24_FIDELITY.map(f => f.kind), ['models', 'models', 'approximates', 'omits']);
  const ev = (t, value) => ({ pin: 'RD8', t, value });
  node.run(MS, [ev(0.2 * MS, 1)]);
  const s = node.save();
  const a = node.run(3 * MS, [ev(1.5 * MS, 0), ev(2.5 * MS, 1)]);
  node.restore(s);
  const b = node.run(3 * MS, [ev(1.5 * MS, 0), ev(2.5 * MS, 1)]);
  assert.deepEqual(b, a);
  assert.deepEqual(a.outputs.map(o => [o.pin, o.value]), [['RA2', 1], ['RA2', 0]], 'RA2 is RD8\'s inverse');
});

test('#5484 a firmware that is not read: an .elf, a broken .hex; the node stopped at once, why logged', () => {
  const elf = new Pic24Board({ firmware: fw('', 'pic/fw.elf') });
  assert.deepEqual([elf.finished, elf.messages()], ['error', [{ kind: 'error', time: 0, text: 'its firmware pic/fw.elf: pic/fw.elf is not a .hex' }]]);
  assert.deepEqual(elf.run(MS), { outputs: [], t: MS });
  const bad = new Pic24Board({ firmware: fw(':00000001FE\n') });
  assert.deepEqual(bad.messages(), [{ kind: 'error', time: 0, text: 'its firmware pic/fw.hex: line 1: a wrong checksum' }]);
  assert.throws(() => new Pic24Board({ board: 'arduino-uno', firmware: fw('') }), /no PIC24 board 'arduino-uno'/);
});

const uartSystem = () => normalizeSystem({ name: 's', nodes: [
  { id: 'pic', kind: 'mcu', board: 'explorer-1632', firmware: 'pic/echo.hex', interfaces: [{ name: 'UART', kind: 'uart', baud: 9600, frame: '8N1' }] },
  { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }] }],
links: [{ id: 'usb', kind: 'uart', a: 'pic.UART', b: 'term.serial' }] });

test('#5484 a System: the PIC24\'s UART (PPS: U2TX on RF5, U2RX on RF4) to a terminal: its prompt, then each character echoed', () => {
  const sys = uartSystem();
  assert.deepEqual(checkSystem(sys, { files: ['pic/echo.hex'] }), []);
  const plan = systemPlan(sys, {});
  assert.deepEqual([plan.errors, plan.wires.map(w => [w.name, w.from, w.to]), plan.idle], [[], [['usb_pic', 'pic.RF5', 'term.rx'], ['usb_term', 'term.tx', 'pic.RF4']], []]);
  const { sim, terminals } = buildSystem(sys, plan, { firmware: { pic: fw(echoHex(), 'pic/echo.hex') } });
  const term = terminals.get('term');
  sim.run(5 * MS);
  term.send([...Buffer.from('Hi')]);
  sim.run(20 * MS);
  assert.equal(String.fromCharCode(...term.received.map(x => x.byte)), '>Hi');
  assert.deepEqual([term.received.map(x => x.error), sim.log, sim.finished], [[null, null, null], [], null]);
});

test('#5484 two PIC24s by GPIO: S3 on one lights its D3 (RA0), which drives the other\'s RD13, whose RA1 follows', () => {
  const sys = normalizeSystem({ name: 'g', nodes: [
    { id: 'a', kind: 'mcu', board: 'explorer-1632', firmware: 'a/b.hex', interfaces: [{ name: 'led', kind: 'gpio', pins: ['RA0'], dir: 'out' }] },
    { id: 'b', kind: 'mcu', board: 'explorer-1632', firmware: 'b/b.hex', interfaces: [{ name: 'in', kind: 'gpio', pins: ['RD13'], dir: 'in' }] }],
  links: [{ id: 'w', kind: 'gpio', a: 'a.led', b: 'b.in' }] });
  assert.deepEqual(checkSystem(sys, { files: ['a/b.hex', 'b/b.hex'] }), []);
  const plan = systemPlan(sys, {});
  const { sim } = buildSystem(sys, plan, { firmware: { a: fw(buttonLedHex(), 'a/b.hex'), b: fw(buttonLedHex(), 'b/b.hex') } });
  sim.run(2 * MS);
  assert.deepEqual([sim.nodes.get('a').value('RA0'), sim.nodes.get('b').value('RA1')], [0, 0]);
  sim.nodes.get('a').node.engine.explorer.press('S3');
  sim.run(4 * MS);
  assert.deepEqual([sim.nodes.get('a').value('RA0'), sim.nodes.get('b').value('RA1')], [1, 1]);
  assert.deepEqual(sim.log, []);
});

test('#5484 the check: a PIC24\'s firmware a .hex, its UART the board\'s, a 5 V output on its 3.3 V input warned, no SPI', () => {
  const sys = uartSystem();
  const msgs = s => checkSystem(normalizeSystem(s), { files: ['pic/echo.hex', 'pic/echo.elf'] }).map(d => [d.severity, d.message]);
  const pic = (over) => ({ ...sys, nodes: [{ ...sys.nodes[0], ...over }, sys.nodes[1]] });
  assert.deepEqual(msgs(pic({ firmware: 'pic/echo.elf' })), [['error', 'pic: its firmware pic/echo.elf is not a .hex (XC16\'s Intel HEX)']]);
  assert.deepEqual(msgs(pic({ board: 'pic24' })), [['error', 'pic: no microcontroller board \'pic24\' (the boards: arduino-uno, arduino-nano, explorer-1632, pico, pico-w, esp32-devkitc)']]);
  assert.deepEqual(msgs({ ...pic({ interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }] }), links: [{ id: 'usb', kind: 'uart', a: 'pic.Serial', b: 'term.serial' }] }),
    [['error', 'pic: the Explorer 16/32 has no UART Serial (its UART: UART)']]);
  assert.deepEqual(msgs(pic({ interfaces: [...sys.nodes[0].interfaces, { name: 'SPI', kind: 'spi' }] })), [['error', 'pic: the Explorer 16/32 has no SPI bus SPI (its SPI: none)']]);
  assert.deepEqual(msgs(pic({ interfaces: [...sys.nodes[0].interfaces, { name: 'x', kind: 'gpio', pins: ['D2'], dir: 'in' }] })), [['error', 'pic.x: D2 is not a pin of the Explorer 16/32']]);
  // an Arduino's 5 V D2 on the PIC24's RD13: warned, as on an FPGA's input; the other way, 3.3 V on the Arduino's, not
  const uno = { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'pic/echo.hex', interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }, { name: 'o', kind: 'gpio', pins: ['D2'], dir: 'out' }, { name: 'i', kind: 'gpio', pins: ['D3'], dir: 'in' }] };
  const gp = { ...sys, nodes: [{ ...sys.nodes[0], interfaces: [...sys.nodes[0].interfaces, { name: 'i', kind: 'gpio', pins: ['RD13'], dir: 'in' }, { name: 'o', kind: 'gpio', pins: ['RA0'], dir: 'out' }] }, sys.nodes[1], uno],
    links: [...sys.links, { id: 'up', kind: 'gpio', a: 'uno.o', b: 'pic.i' }, { id: 'down', kind: 'gpio', a: 'pic.o', b: 'uno.i' }] };
  assert.deepEqual(msgs(gp), [['warning', 'up: uno\'s D2, a 5 V output, drives pic\'s RD13, a 3.3 V input of the Explorer 16/32: a level shifter or a divider on the real boards']]);
});

test('#5484 the edits: an Explorer 16/32 added with its UART; an Uno changed into one, its Serial its UART, its link following', () => {
  let r = addNode(normalizeSystem({ name: 'e', nodes: [], links: [] }), { kind: 'mcu', board: 'explorer-1632', id: 'pic' });
  assert.deepEqual(r.system.nodes[0], { id: 'pic', kind: 'mcu', board: 'explorer-1632', firmware: null, lang: 'c', interfaces: [{ name: 'UART', kind: 'uart', baud: 9600, frame: '8N1' }], x: 0, y: 0 });
  r = addNode(r.system, { kind: 'mcu', id: 'uno' });
  r = addNode(r.system, { kind: 'terminal', id: 'term' });
  r = addLink(r.system, { a: 'uno.Serial', b: 'term.serial' });
  const c = changeNode(r.system, 'uno', { board: 'explorer-1632' });
  assert.deepEqual([c.error, c.system.nodes[1].board, c.system.nodes[1].interfaces.map(f => f.name), c.system.links.map(l => [l.a, l.b])], [undefined, 'explorer-1632', ['UART'], [['uno.UART', 'term.serial']]]);
  const back = changeNode(c.system, 'uno', { board: 'arduino-nano' });
  assert.deepEqual([back.system.nodes[1].interfaces.map(f => f.name), back.system.links.map(l => l.a)], [['Serial'], ['uno.Serial']]);
  assert.deepEqual(addNode(r.system, { kind: 'mcu', board: 'pic24' }), { error: 'no microcontroller board \'pic24\': arduino-uno, arduino-nano, explorer-1632, pico, pico-w, esp32-devkitc' });
});

test('#5484 #5552 a drawing in a PIC24 node: its C made on the PIC24\'s registers (its LED RA0 an output: TRISA, ANSA, LATA); C++ refused', () => {
  const fsm = JSON.stringify({ format: 'silinx-fsm', name: 'blink', inputs: [], outputs: [{ name: 'led', width: 1 }], states: [{ name: 'S0' }], transitions: [] });
  const node = { id: 'pic', kind: 'mcu', board: 'explorer-1632', lang: 'c', interfaces: [] };
  const r = drawingCode('pic/blink.fsm.json', fsm, { nodeLang: 'c', node });
  assert.deepEqual([r.errors, r.warnings, r.target, r.pins, r.ports.map((p) => [p.name, p.volts])], [[], [], 'pic/blink.c', { led: ['RA0'] }, [['led', 3.3]]]);
  for (const l of ['#include <xc.h>', '  ANSA &= ~(1u << 0);', '  TRISA &= ~(1u << 0);   // RA0 an output', '  if (led) LATA |= 1u << 0; else LATA &= ~(1u << 0);   // RA0']) assert.ok(r.text.split('\n').includes(l), l);
  assert.ok(!/digitalWrite|Arduino/.test(r.text), 'no Arduino API');
  const cpp = drawingCode('pic/blink.fsm.json', fsm, { nodeLang: 'cpp', node: { ...node, lang: 'cpp' } });
  assert.deepEqual([cpp.errors, cpp.notMade, cpp.target], [["pic/blink.fsm.json: the Explorer 16/32's PIC24FJ1024GB610 runs C (XC16's): its node's language is C, not C++"], true, null]);
});
