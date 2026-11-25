// Tests of a drawing's generated code by its node's base language (#5486, core/drawing-code.js): a drawing in a System's
// CPU node (base language C or C++) gets its C (the Arduino sketch of core/reactive-c.js), next to it as <module>.ino; in
// an FPGA node, an FPGA project or at a System's root its HDL, as before (core/view-hdl.js); a schematic, a circuit and
// a register map refused in a CPU node, with their messages; in a MicroPython node its MicroPython (core/reactive-py.js,
// #5487), <module>.py, on an Arduino board the ESP32's, said; the node's GPIO interfaces named as the drawing's ports
// give their pins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CPU_LANGS, codeExt, codeName, hlsRefusal, inCpuNode, cpuDrawingRefusal, drawingC, drawingCode, drawingNode, drawnCodePath, isCodeFile, isCpuLang, nodeCodeOpts, nodePins } from '../core/drawing-code.js';
import { reactiveFromFile } from '../core/reactive-from.js';
import { generateArduino } from '../core/reactive-c.js';
import { generateMicroPython } from '../core/reactive-py.js';
import { viewHdl } from '../core/view-hdl.js';
import { port, portsProblems } from '../core/system-ports.js';
import { ROOT } from './reactive-lib.mjs';

const TRAFFIC = fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8');
const SYS = fs.readFileSync(path.join(ROOT, 'examples/uart-avr/uart_avr.sys.json'), 'utf8');
const PJ = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/uart-avr/silinx.json'), 'utf8'));
const files = ['uart_avr.sys.json', 'uno/traffic.fsm.json', 'fpga/traffic.fsm.json', 'fpga/uart.vhd'];
const texts = { 'uart_avr.sys.json': SYS };

test('a drawing\'s node: its folder\'s, its base language; none at the root, nor in an FPGA project', () => {
  const uno = drawingNode(PJ, 'uno/traffic.fsm.json', { files, texts });
  assert.deepEqual([uno.node.id, uno.lang], ['uno', 'c']);
  assert.deepEqual([drawingNode(PJ, 'UNO/a.fsm.json', { files, texts }).node.id], ['uno']);   // (an id as ids compare)
  assert.equal(drawingNode(PJ, 'fpga/traffic.fsm.json', { files, texts }).lang, 'vhdl');
  assert.equal(drawingNode(PJ, 'traffic.fsm.json', { files, texts }), null);
  assert.equal(drawingNode(PJ, 'src/traffic.fsm.json', { files, texts }), null);
  const fpga = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/traffic/silinx.json'), 'utf8'));
  assert.equal(drawingNode(fpga, 'src/traffic.fsm.json', { files: ['src/traffic.fsm.json'] }), null);
  assert.deepEqual(CPU_LANGS, ['c', 'cpp', 'micropython']);
  assert.deepEqual(['c', 'cpp', 'micropython', 'vhdl', 'verilog', null].map(isCpuLang), [true, true, true, false, false, false]);
});

test('a drawing in a C node: its sketch, the model\'s generateArduino\'s, next to it; its pins its node\'s GPIO interfaces named as its ports', () => {
  const node = { id: 'uno', kind: 'mcu', interfaces: [{ name: 'Serial', kind: 'uart' }, { name: 'phase', kind: 'gpio', pins: ['A0', 'A1', 'A2'], dir: 'out' }, { name: 'other', kind: 'gpio', pins: ['D9'], dir: 'in' }] };
  assert.deepEqual(nodePins(node), { phase: ['A0', 'A1', 'A2'], other: ['D9'] });
  const r = drawingCode('uno/traffic.fsm.json', TRAFFIC, { nodeLang: 'c', node });
  const want = generateArduino(reactiveFromFile('uno/traffic.fsm.json', TRAFFIC).model, { pins: { phase: ['A0', 'A1', 'A2'] } });
  assert.deepEqual(r, { path: 'uno/traffic.fsm.json', lang: 'c', text: want.code, module: 'traffic', target: 'uno/traffic.ino', errors: [], warnings: [],
    pins: { phase: ['A0', 'A1', 'A2'], req: ['D2'], done: ['D3'], night: ['D4'] },
    ports: [port({ name: 'req', dir: 'in', volts: 5 }), port({ name: 'done', dir: 'in', volts: 5 }), port({ name: 'night', dir: 'in', volts: 5 }), port({ name: 'phase', dir: 'out', volts: 5, width: 3 })] });
  assert.deepEqual(portsProblems(r.ports), []);   // (the node contract's typed ports, #5485)
  assert.equal(drawingCode('uno/traffic.fsm.json', TRAFFIC, { nodeLang: 'cpp', node }).lang, 'cpp');
  assert.deepEqual([drawnCodePath('uno/a.fsm.json', 'traffic'), drawnCodePath('a.fsm.json', 'x'), isCodeFile('uno/x.INO'), isCodeFile('src/x.vhd')], ['uno/traffic.ino', 'src/x.ino', true, false]);
  // (in an FPGA node, or none: its HDL, viewHdl's)
  assert.deepEqual(drawingCode('fpga/traffic.fsm.json', TRAFFIC, { nodeLang: 'vhdl' }), viewHdl('fpga/traffic.fsm.json', TRAFFIC));
  assert.deepEqual(drawingCode('src/traffic.fsm.json', TRAFFIC), viewHdl('src/traffic.fsm.json', TRAFFIC));
});

test('a drawing\'s C refused: the hardware drawings in a CPU node, its errors, its pins\'; its warnings', () => {
  assert.equal(cpuDrawingRefusal('uno/c.sch.json', 'c'), 'uno/c.sch.json: A schematic is hardware: it cannot run on a CPU. Draw the module as a state diagram, an ASM chart, a Petri net or a truth table, or write its code.');
  assert.equal(cpuDrawingRefusal('uno/b.circ.json', 'cpp'), 'uno/b.circ.json: A circuit is hardware: it cannot run on a CPU.');
  assert.equal(cpuDrawingRefusal('uno/r.regs.json', 'micropython'), 'uno/r.regs.json: A register map is hardware: it cannot run on a CPU.');
  assert.equal(cpuDrawingRefusal('fpga/c.sch.json', 'vhdl'), null);
  assert.equal(cpuDrawingRefusal('uno/t.fsm.json', 'c'), null);
  const fail = (r) => { assert.deepEqual(r.ports, []); return [r.text, r.target, r.errors]; };
  assert.deepEqual(fail(drawingC('uno/c.sch.json', '{}')), ['', null, ['uno/c.sch.json: A schematic is hardware: it cannot run on a CPU. Draw the module as a state diagram, an ASM chart, a Petri net or a truth table, or write its code.']]);
  assert.deepEqual(fail(drawingC('uno/t.fsm.json', TRAFFIC, { pins: { req: 'D99' } })), ['', null, ["uno/t.fsm.json: 'D99' is not a digital pin of the board (D0 to D13, A0 to A5)"]]);
  assert.match(drawingC('uno/t.fsm.json', TRAFFIC.replace('"cond": "done"', '"cond": "done &&"')).errors[0], /^uno\/t\.fsm\.json: /);
  const delay = TRAFFIC.replace(/\bdone\b/g, 'delay');
  assert.deepEqual(drawingC('uno/t.fsm.json', delay).warnings, ["uno/t.fsm.json: 'delay' is a word of C or of the Arduino API, or a name of the sketch's: it is delay_v in the sketch"]);
  assert.deepEqual(drawingC('uno/t.fsm.json', TRAFFIC, { pins: { req: 'D0' } }).warnings, ["uno/t.fsm.json: D0 is the USB serial port's: 'req' on it disturbs the upload of the program"]);
});

test('#5487 a drawing in a MicroPython node: its program, the model\'s generateMicroPython\'s, next to it as <module>.py; on the ESP32 or the Pico its pins its node\'s, at 3.3 V; on an Arduino the ESP32\'s, said', () => {
  const model = reactiveFromFile('esp/traffic.fsm.json', TRAFFIC).model;
  const esp = { id: 'esp', kind: 'mcu', board: 'esp32-devkit', lang: 'micropython', interfaces: [{ name: 'phase', kind: 'gpio', pins: ['GPIO25', 'GPIO26', 'GPIO27'], dir: 'out' }] };
  assert.deepEqual(nodeCodeOpts(esp), { pins: { phase: ['GPIO25', 'GPIO26', 'GPIO27'] }, board: 'esp32-devkit' });
  const r = drawingCode('esp/traffic.fsm.json', TRAFFIC, { nodeLang: 'micropython', node: esp });
  assert.deepEqual(r, { path: 'esp/traffic.fsm.json', lang: 'micropython', text: generateMicroPython(model, { pins: { phase: ['GPIO25', 'GPIO26', 'GPIO27'] } }).code, module: 'traffic', target: 'esp/traffic.py', errors: [], warnings: [],
    pins: { phase: [25, 26, 27], req: [4], done: [13], night: [14] },
    ports: [port({ name: 'req', dir: 'in', volts: 3.3 }), port({ name: 'done', dir: 'in', volts: 3.3 }), port({ name: 'night', dir: 'in', volts: 3.3 }), port({ name: 'phase', dir: 'out', volts: 3.3, width: 3 })] });
  assert.deepEqual(portsProblems(r.ports), []);
  const pico = drawingC('pico/traffic.fsm.json', TRAFFIC, { lang: 'micropython', board: 'rp2040-pico' });
  assert.deepEqual([pico.text, pico.target, pico.warnings], [generateMicroPython(model, { board: 'pico' }).code, 'pico/traffic.py', []]);
  // (no board: the ESP32's; an Arduino: the ESP32's, on its free pins, its node's D pins not used, said)
  assert.equal(drawingC('esp/traffic.fsm.json', TRAFFIC, { lang: 'micropython' }).text, generateMicroPython(model).code);
  const uno = drawingC('uno/traffic.fsm.json', TRAFFIC, { lang: 'micropython', board: 'arduino-uno', pins: { phase: ['A0', 'A1', 'A2'] } });
  assert.deepEqual([uno.text, uno.target, uno.errors, uno.warnings], [generateMicroPython(model).code, 'uno/traffic.py', [],
    ["uno/traffic.fsm.json: the node's board, the Arduino Uno, does not run MicroPython: its program is the ESP32 DevKit's, on its free pins"]]);
  // (its errors and its warnings, the generator's, each with its path)
  assert.deepEqual(drawingC('esp/t.fsm.json', TRAFFIC, { lang: 'micropython', board: 'esp32', pins: { req: 'GPIO7' } }).errors, ["esp/t.fsm.json: GPIO7 is the ESP32 DevKit's flash memory's: 'req' cannot use it"]);
  assert.deepEqual(drawingC('esp/t.fsm.json', TRAFFIC.replace(/\bdone\b/g, 'pass'), { lang: 'micropython' }).warnings, ["esp/t.fsm.json: 'pass' is a word of Python or of MicroPython, or a name of the program's: it is pass_v in the program"]);
  assert.deepEqual([codeExt('micropython'), codeExt('c'), codeExt('cpp'), codeName('micropython'), codeName('cpp')], ['py', 'ino', 'ino', 'MicroPython', 'C']);
  assert.deepEqual([drawnCodePath('esp/a.fsm.json', 'traffic', 'py'), isCodeFile('esp/x.py'), isCodeFile('esp/x.pyc')], ['esp/traffic.py', true, false]);
});

test('a path in a CPU node\'s folder: its board\'s program, not Silinx HLS\'s nor the FPGA\'s design (#5486); none in an FPGA project', () => {
  const cpu = inCpuNode(PJ, { files, texts });
  assert.deepEqual(['uno/f.c', 'UNO/t.fsm.json', 'fpga/f.c', 'src/f.c', 'f.c'].map(cpu), [true, true, false, false, false]);
  assert.equal(hlsRefusal('uno/f.c', cpu), "uno/f.c is a microcontroller node's C: it is built for its board, not by Silinx HLS");
  assert.equal(hlsRefusal('src/f.c', cpu), null);
  const fpga = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/traffic/silinx.json'), 'utf8'));
  assert.equal(inCpuNode(fpga, { files: ['uno/f.c'] })('uno/f.c'), false);
  assert.equal(inCpuNode(PJ, { files, texts: {} })('uno/f.c'), false);   // (its System document unread: no node)
});
