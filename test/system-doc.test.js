// A co-design project's System document (core/system-doc.js, #4697): its format read and written back, normalized; the
// documents that are not a System; the microcontrollers' boards; a link's ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSystem, writeSystem, newSystem, normalizeSystem, isSystemFile, linkEnd, mcuBoard, MCU_BOARDS, SYSTEM_FORMAT, SYSTEM_VERSION } from '../core/system-doc.js';

const UART_AVR = {
  format: 'silinx-system', version: 1, name: 'uart_avr',
  nodes: [
    { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: { rx: 'J3', tx: 'A3' },
      interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }, { name: 'leds', kind: 'gpio', pins: ['led<0>'], dir: 'out' }], x: 100, y: 40 },
    { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'firmware/echo.hex', interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: -120, y: 40 },
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
    { id: 'f', kind: 'fpga', module: null, board: null, pins: {}, interfaces: [{ name: 'g', kind: 'gpio', pins: ['a'], dir: 'in' }], x: 0, y: 0 },
    { id: 'm', kind: 'mcu', board: 'arduino-nano', firmware: null, interfaces: [], x: 0, y: 0 },
    { id: 't', kind: 'terminal', interfaces: [], x: 0, y: 0 },
  ], links: [{ id: 'l', kind: 'uart', a: 't.serial', b: 'm.Serial' }] });
  assert.deepEqual(Object.keys(m.nodes[0]), ['id', 'kind', 'module', 'board', 'pins', 'interfaces', 'x', 'y']);
  // an interface of a kind not known: kept as it is (the check says it)
  assert.deepEqual(normalizeSystem({ nodes: [{ id: 'f', kind: 'fpga', interfaces: [{ name: 's', kind: 'spi', mode: 0 }] }] }).nodes[0].interfaces, [{ name: 's', kind: 'spi', mode: 0 }]);
  assert.deepEqual(newSystem('top'), { format: SYSTEM_FORMAT, version: SYSTEM_VERSION, name: 'top', nodes: [], links: [] });
  assert.equal(writeSystem(newSystem('top')), '{\n  "format": "silinx-system",\n  "version": 1,\n  "name": "top",\n  "nodes": [],\n  "links": []\n}\n');
});

test('not a System: not JSON, another format, no version, a newer version', () => {
  assert.match(readSystem('{ nodes').error, /^not a System document: /);
  assert.deepEqual(readSystem('[]'), { error: 'not a System document (its format is not \'silinx-system\')' });
  assert.deepEqual(readSystem('{"format":"silinx-schematic","version":1}'), { error: 'not a System document (its format is not \'silinx-system\')' });
  assert.deepEqual(readSystem('{"format":"silinx-system"}'), { error: 'not a System document (no version)' });
  assert.deepEqual(readSystem('{"format":"silinx-system","version":0}'), { error: 'not a System document (no version)' });
  assert.deepEqual(readSystem('{"format":"silinx-system","version":2}'), { error: 'a System document of version 2: this Silinx reads version 1' });
  assert.deepEqual(readSystem('{"format":"silinx-system","version":1}').system, { format: SYSTEM_FORMAT, version: 1, name: 'system', nodes: [], links: [] });
});

test('the files, the links\' ends, the microcontrollers\' boards', () => {
  assert.equal(isSystemFile('uart_avr.sys.json'), true);
  assert.equal(isSystemFile('src/A.SYS.JSON'), true);
  assert.equal(isSystemFile('src/a.sch.json'), false);
  assert.equal(isSystemFile(null), false);
  assert.deepEqual(linkEnd('uno.Serial'), { node: 'uno', iface: 'Serial' });
  assert.deepEqual(linkEnd('fpga.uart.x'), { node: 'fpga', iface: 'uart.x' });
  for (const e of ['uno', '.Serial', 'uno.', '', null]) assert.equal(linkEnd(e), null, String(e));
  assert.deepEqual(MCU_BOARDS.map(b => b.id), ['arduino-uno', 'arduino-nano']);
  const uno = mcuBoard('arduino-uno');
  assert.equal(uno.vio, 5);
  assert.deepEqual(uno.uarts, { Serial: { tx: 'D1', rx: 'D0' } });
  assert.equal(uno.pins.length, 20);
  assert.deepEqual(mcuBoard('arduino-nano').pins.slice(-2), ['A6', 'A7']);
  assert.equal(mcuBoard('esp32'), null);
});
