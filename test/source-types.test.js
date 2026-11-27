// Unit tests (#5873): the sources each kind of device takes (core/source-types.js), New Source's and Import Source's in
// the interface and the MCP server's: the table, a node's kind of device, the refusals' words, where a System's new
// source goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_SOURCES, DEVICE_IMPORTS, deviceKind, sourceTypesOf, importsOf, importAcceptOf, sourceTypeRefusal, importRefusal, noSourcesText, devicePlace } from '../core/source-types.js';
import { SOURCE_KINDS } from '../core/new-source-text.js';
import { MCU_BOARDS } from '../core/system-doc.js';

const WIZARDS = ['clock_manager', 'block_memory', 'xadc'];   // (their own tools in the MCP server: New Source's Wizard >)

test('the table: every kind of device, every type a source New Source makes (or a wizard of an FPGA), no constraints file', () => {
  assert.deepEqual(Object.keys(DEVICE_SOURCES), ['fpga', 'design', 'avr', 'rp2040', 'esp32', 'pic24']);
  assert.deepEqual(Object.keys(DEVICE_IMPORTS), Object.keys(DEVICE_SOURCES));
  for (const [kind, types] of Object.entries(DEVICE_SOURCES)) {
    assert.equal(new Set(types).size, types.length, kind);
    for (const t of types) assert.ok(SOURCE_KINDS.includes(t) || (kind === 'fpga' && WIZARDS.includes(t)), `${kind}: ${t}`);
    assert.ok(!types.includes('constraints'), kind);
  }
  assert.deepEqual(DEVICE_SOURCES.design, ['boolean', 'circuit', 'schematic', 'fsm', 'asm', 'petri', 'lab']);   // (#3780's: no HDL)
  assert.deepEqual(DEVICE_SOURCES.avr, ['sketch', 'c_source', 'cpp_source', 'assembly', 'fsm', 'asm', 'petri', 'boolean']);
  assert.deepEqual(DEVICE_SOURCES.rp2040, ['python', 'fsm', 'asm', 'petri', 'boolean']);
  assert.deepEqual(DEVICE_SOURCES.esp32, DEVICE_SOURCES.rp2040);
  assert.deepEqual(DEVICE_SOURCES.pic24, []);
  // (an FPGA: no microcontroller's program; a microcontroller: no HDL, no schematic, no HLS)
  for (const t of ['sketch', 'c_source', 'cpp_source', 'assembly', 'python']) assert.ok(!DEVICE_SOURCES.fpga.includes(t), t);
  for (const k of ['avr', 'rp2040', 'esp32']) for (const t of ['module', 'test_bench', 'schematic', 'circuit', 'c', 'cpp']) assert.ok(!DEVICE_SOURCES[k].includes(t), `${k}: ${t}`);
  assert.deepEqual(sourceTypesOf('nope'), []);
  assert.deepEqual(sourceTypesOf(null), []);
  assert.deepEqual(sourceTypesOf('__proto__'), []);
});

test('deviceKind: an FPGA, a design node, each microcontroller board by its architecture; none for a terminal, a circuit, an unknown board', () => {
  assert.equal(deviceKind({ kind: 'fpga' }), 'fpga');
  assert.equal(deviceKind({ kind: 'design' }), 'design');
  const want = { 'arduino-uno': 'avr', 'arduino-nano': 'avr', 'explorer-1632': 'pic24', pico: 'rp2040', 'pico-w': 'rp2040', 'esp32-devkitc': 'esp32' };
  assert.deepEqual(Object.fromEntries(MCU_BOARDS.map(b => [b.id, deviceKind({ kind: 'mcu', board: b.id })])), want);
  for (const n of [{ kind: 'terminal' }, { kind: 'circuit' }, { kind: 'broker' }, { kind: 'mcu', board: 'nope' }, { kind: 'mcu' }, null, undefined]) assert.equal(deviceKind(n), null);
});

test('Import Source: the files of each kind of device, its accept; a constraints file still an FPGA\'s', () => {
  assert.equal(importAcceptOf('fpga'), '.v,.vhd,.vhdl,.ucf,.pcf,.lpf,.cst,.ccf,.xdc,.qsf,.mem,.hex,.json');
  assert.equal(importAcceptOf('design'), '.json');
  assert.equal(importAcceptOf('avr'), '.ino,.c,.cpp,.h,.hpp,.asm,.hex,.json');
  assert.equal(importAcceptOf('rp2040'), '.py,.json');
  assert.equal(importAcceptOf('pic24'), '.hex');
  assert.deepEqual(importsOf('terminal'), []);
  for (const f of ['a.v', 'A.VHD', 'a.vhdl', 'pins.ucf', 'pins.XDC', 'rom.mem', 'a.fsm.json']) assert.equal(importRefusal('fpga', f), null, f);
  for (const f of ['blink.ino', 'x.c', 'x.H', 'b.asm', 'fw.hex', 'a.fsm.json']) assert.equal(importRefusal('avr', f), null, f);
  assert.equal(importRefusal('fpga', 'main.py'), 'main.py: not a file of an FPGA (.v, .vhd, .vhdl, .ucf, .pcf, .lpf, .cst, .ccf, .xdc, .qsf, .mem, .hex, .json)');
  assert.equal(importRefusal('rp2040', 'top.vhd'), 'top.vhd: not a file of an RP2040 (Pico) (.py, .json)');
  assert.equal(importRefusal('design', 'top.vhd'), 'top.vhd: not a file of a design and simulation project (.json)');
  assert.equal(importRefusal('pic24', 'x.c'), 'x.c: not a file of a PIC24 (.hex)');
  assert.equal(importRefusal('terminal', 'x.c'), 'x.c: this device takes no source');
});

test('New Source\'s refusals and a PIC24\'s words', () => {
  assert.equal(sourceTypeRefusal('fpga', 'module', 'Module (HDL)'), null);
  assert.equal(sourceTypeRefusal('avr', 'module', 'Module (HDL)'), 'Module (HDL): not a source of an AVR (Arduino)');
  assert.equal(sourceTypeRefusal('esp32', 'sketch', 'Arduino Sketch'), 'Arduino Sketch: not a source of an ESP32');
  assert.equal(sourceTypeRefusal('design', 'c'), 'c: not a source of a design and simulation project');
  assert.equal(noSourcesText('pic24'), 'A PIC24 takes no new source: Import Source copies its files.');
});

test('devicePlace: the node asked, else the first FPGA node, else the first with sources; a terminal never; its kind of device', () => {
  const sys = { nodes: [{ id: 'term', kind: 'terminal' }, { id: 'uno', kind: 'mcu', board: 'arduino-uno', lang: 'cpp' }, { id: 'f1', kind: 'fpga', lang: 'verilog' }, { id: 'pic', kind: 'mcu', board: 'explorer-1632' }] };
  assert.deepEqual(devicePlace(sys), { node: 'f1', location: 'f1', lang: 'verilog', kind: 'fpga' });
  assert.deepEqual(devicePlace(sys, { id: 'uno' }), { node: 'uno', location: 'uno', lang: 'cpp', kind: 'avr' });
  assert.deepEqual(devicePlace(sys, { id: 'f1', dir: 'sim' }), { node: 'f1', location: 'f1/sim', lang: 'verilog', kind: 'fpga' });
  assert.equal(devicePlace(sys, { id: 'pic' }).kind, 'pic24');
  assert.equal(devicePlace(sys, { id: 'term' }).node, 'f1');
  // (a processor board's Board project: its one node)
  assert.deepEqual(devicePlace({ nodes: [{ id: 'pico', kind: 'mcu', board: 'pico', lang: 'micropython' }] }), { node: 'pico', location: 'pico', lang: 'micropython', kind: 'rp2040' });
  assert.equal(devicePlace({ nodes: [{ id: 't', kind: 'terminal' }] }), null);
  assert.equal(devicePlace(null), null);
});
