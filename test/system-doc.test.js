// A System project's System document (core/system-doc.js, #4697): its format read and written back, normalized; the
// documents that are not a System; the microcontrollers' boards; a link's ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSystem, writeSystem, newSystem, normalizeSystem, isSystemFile, linkEnd, mcuBoard, MCU_BOARDS, SYSTEM_FORMAT, SYSTEM_VERSION, OLD_SYSTEM } from '../core/system-doc.js';

const UART_AVR = {
  format: 'silinx-system', version: 2, name: 'uart_avr',
  nodes: [
    { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: { rx: 'J3', tx: 'A3' }, lang: 'vhdl',
      interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }, { name: 'leds', kind: 'gpio', pins: ['led<0>'], dir: 'out' }], x: 100, y: 40 },
    { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'firmware/echo.hex', lang: 'c', interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: -120, y: 40 },
    { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 115200, frame: '8E2' }], x: 0, y: 200 },
  ],
  links: [{ id: 'serial', kind: 'uart', a: 'uno.Serial', b: 'fpga.uart' }],
};

test('a System read and written back: the same text, the same model', () => {
  const text = `${JSON.stringify(UART_AVR, null, 2)}\n`;
  const r = readSystem(text);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.system, UART_AVR);
  assert.equal(writeSystem(r.system), text, 'written as it was read');
  assert.deepEqual(readSystem(writeSystem(r.system)).system, r.system);
});

test('normalized: the missing fields given, a kind\'s fields only, in their order', () => {
  const m = normalizeSystem({ name: 's', nodes: [
    { kind: 'fpga', id: 'f', interfaces: [{ kind: 'gpio', name: 'g', dir: 'in', pins: ['a'], extra: 1 }], firmware: 'x.hex' },
    { id: 'm', kind: 'mcu', board: 'arduino-nano', pins: { a: 'B1' } },
    { id: 't', kind: 'terminal', module: 'x' },
  ], links: [{ b: 'm.Serial', a: 't.serial', kind: 'uart', id: 'l', baud: 9600 }] });
  assert.deepEqual(m, { format: SYSTEM_FORMAT, version: SYSTEM_VERSION, name: 's', nodes: [
    { id: 'f', kind: 'fpga', module: null, board: null, lang: 'vhdl', interfaces: [{ name: 'g', kind: 'gpio', pins: ['a'], dir: 'in' }], x: 0, y: 0 },
    { id: 'm', kind: 'mcu', board: 'arduino-nano', firmware: null, lang: 'c', interfaces: [], x: 0, y: 0 },
    { id: 't', kind: 'terminal', interfaces: [], x: 0, y: 0 },
  ], links: [{ id: 'l', kind: 'uart', a: 't.serial', b: 'm.Serial' }] });
  assert.deepEqual(Object.keys(m.nodes[0]), ['id', 'kind', 'module', 'board', 'lang', 'interfaces', 'x', 'y']);
  // an interface of a kind not known: kept as it is (the check says it)
  assert.deepEqual(normalizeSystem({ nodes: [{ id: 'f', kind: 'fpga', interfaces: [{ name: 's', kind: 'can', mode: 0 }] }] }).nodes[0].interfaces, [{ name: 's', kind: 'can', mode: 0 }]);
  // (an SPI bus's: its ports, its rate and mode, 125 kHz and 0 by default, #5214)
  assert.deepEqual(normalizeSystem({ nodes: [{ id: 'f', kind: 'fpga', interfaces: [{ name: 's', kind: 'spi', x: 1, sck: 'c' }] }] }).nodes[0].interfaces, [{ name: 's', kind: 'spi', sck: 'c', hz: 125000, mode: 0 }]);
  assert.deepEqual(newSystem('top'), { format: SYSTEM_FORMAT, version: SYSTEM_VERSION, name: 'top', nodes: [], links: [] });
  assert.equal(writeSystem(newSystem('top')), '{\n  "format": "silinx-system",\n  "version": 2,\n  "name": "top",\n  "nodes": [],\n  "links": []\n}\n');
});

test('#5488 a node\'s base language: its own kept, its kind\'s default when not given, none for a terminal or a circuit; one not its kind\'s refused', () => {
  const m = normalizeSystem({ nodes: [{ id: 'f', kind: 'fpga', lang: 'verilog' }, { id: 'm', kind: 'mcu', lang: 'micropython' }, { id: 'd', kind: 'design' },
    { id: 't', kind: 'terminal', lang: 'c' }, { id: 'c', kind: 'circuit' }] });
  assert.deepEqual(m.nodes.map(n => n.lang), ['verilog', 'micropython', 'vhdl', undefined, undefined]);
  const doc = l => JSON.stringify({ format: 'silinx-system', version: 2, nodes: [{ id: 'f', kind: 'fpga', lang: l }] });
  assert.deepEqual(readSystem(doc('c')), { error: 'node f: \'c\' is not an FPGA node\'s base language: vhdl, verilog' });
  assert.deepEqual(readSystem(doc('Verilog')), { error: 'node f: \'Verilog\' is not an FPGA node\'s base language: vhdl, verilog' });
  assert.equal(readSystem(doc('verilog')).system.nodes[0].lang, 'verilog');
  // (a terminal's language ignored: its kind has none)
  assert.equal(readSystem(JSON.stringify({ format: 'silinx-system', version: 2, nodes: [{ id: 't', kind: 'terminal', lang: 'x' }] })).system.nodes[0].lang, undefined);
});

test('not a System: not JSON, another format, no version, a newer version, an old one (#5488)', () => {
  assert.match(readSystem('{ nodes').error, /^not a System document: /);
  assert.deepEqual(readSystem('[]'), { error: 'not a System document (its format is not \'silinx-system\')' });
  assert.deepEqual(readSystem('{"format":"silinx-schematic","version":1}'), { error: 'not a System document (its format is not \'silinx-system\')' });
  assert.deepEqual(readSystem('{"format":"silinx-system"}'), { error: 'not a System document (no version)' });
  assert.deepEqual(readSystem('{"format":"silinx-system","version":0}'), { error: 'not a System document (no version)' });
  assert.deepEqual(readSystem('{"format":"silinx-system","version":3}'), { error: 'a System document of version 3: this Silinx reads version 2' });
  assert.deepEqual(readSystem('{"format":"silinx-system","version":2}').system, { format: SYSTEM_FORMAT, version: 2, name: 'system', nodes: [], links: [] });
  // (version 1's, before a node was a folder, #5488: not read, no backward compatibility, its message)
  assert.equal(OLD_SYSTEM, 'a System document of version 1, made before each node was a folder of its project (#5488): this Silinx does not read it; make the System again in a new System project, each node\'s files in its folder');
  assert.deepEqual(readSystem('{"format":"silinx-system","version":1,"nodes":[{"id":"uno","kind":"mcu","firmware":"firmware/a.hex"}]}'), { error: OLD_SYSTEM });
});

test('the files, the links\' ends, the microcontrollers\' boards', () => {
  assert.equal(isSystemFile('uart_avr.sys.json'), true);
  assert.equal(isSystemFile('src/A.SYS.JSON'), true);
  assert.equal(isSystemFile('src/a.sch.json'), false);
  assert.equal(isSystemFile(null), false);
  assert.deepEqual(linkEnd('uno.Serial'), { node: 'uno', iface: 'Serial' });
  assert.deepEqual(linkEnd('fpga.uart.x'), { node: 'fpga', iface: 'uart.x' });
  for (const e of ['uno', '.Serial', 'uno.', '', null]) assert.equal(linkEnd(e), null, String(e));
  assert.deepEqual(MCU_BOARDS.map(b => b.id), ['arduino-uno', 'arduino-nano', 'explorer-1632', 'pico', 'pico-w']);
  const uno = mcuBoard('arduino-uno');
  assert.equal(uno.vio, 5);
  assert.deepEqual(uno.uarts, { Serial: { tx: 'D1', rx: 'D0' } });
  assert.equal(uno.pins.length, 20);
  assert.deepEqual(mcuBoard('arduino-nano').pins.slice(-2), ['A6', 'A7']);
  assert.equal(mcuBoard('esp32'), null);
});
