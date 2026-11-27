// A System as a project's top (#5402, core/system-top.js): refused in a release and in a design and simulation project
// (no Top-Level Source Type since #5786: Set as Top Module on a System document); an FPGA project made a System project, its System
// its top (a new one, or the one given), its board kept; a module of a System project as the top: its FPGA node's top
// module, the System still the project's top (#5583).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setBuildChannel, SYSTEMS_OFF } from '../core/build-channel.js';
import { systemTopRefusal, toSystemTop, nodeTop, NODE_UNSET_REFUSAL } from '../core/system-top.js';
import { newProjectJson } from '../core/project-defaults.js';
import { readSystem, newSystem } from '../core/system-doc.js';
import { resolveBoard } from '../core/devices.js';

const fpga = () => ({ ...newProjectJson('p', { board: 'nexys2', device: resolveBoard('nexys2').device }), top: 'blinky' });

test('#5402 a System as the top: refused in a release and in a design project, with the interface\'s messages', () => {
  setBuildChannel('release');
  assert.equal(systemTopRefusal(fpga()), SYSTEMS_OFF);
  setBuildChannel('dev');
  assert.equal(systemTopRefusal(fpga()), null);
  assert.equal(systemTopRefusal({ kind: 'design' }), 'a design and simulation project\'s top is a drawing: a System is a System project\'s top (New Project ▸ System)');
});

test('#5402 an FPGA project made a System project, its System its top: a new one, or the one given; its board kept', () => {
  setBuildChannel('dev');
  const r = toSystemTop(fpga());
  assert.deepEqual([r.pj.profile, r.pj.board, r.pj.constraints, r.pj.top, 'topSourceType' in r.pj, r.file, r.write.path], ['system', null, null, '', false, 'p.sys.json', 'p.sys.json']);
  assert.deepEqual(readSystem(r.write.text).system.nodes, []);
  assert.deepEqual(r.pj.fpga, { board: 'nexys2', device: resolveBoard('nexys2').device, constraints: 'constraints/top.ucf' });
  // (the one given: nothing written)
  const g = toSystemTop(fpga(), 'src/lab.sys.json');
  assert.deepEqual([g.write, g.file, g.pj.profile], [null, 'src/lab.sys.json', 'system']);   // (its profile, #5440)
  // (a System project already: what it kept, kept)
  assert.deepEqual(toSystemTop(r.pj, 'p.sys.json').pj.fpga, r.pj.fpga);
});

test('#5583 a module of a System project as the top: its FPGA node\'s top module, the System still the project\'s top; refused outside an FPGA node\'s folder', () => {
  setBuildChannel('dev');
  const sys = { ...newSystem('lab'), nodes: [
    { id: 'fpga', kind: 'fpga', module: 'Uart', board: 'basys2', variant: '100', lang: 'vhdl', interfaces: [] },
    { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'uno/a.hex', lang: 'c', interfaces: [] }] };
  // (another module of its folder: now its top, the document's only change)
  const a = nodeTop(sys, 'blinky', 'fpga/blinky.vhd');
  assert.deepEqual([a.node, a.text, a.system.nodes[0].module, a.system.nodes.map((n) => n.id)], ['fpga', '\'blinky\' is now fpga\'s top module (the System lab stays the project\'s top)', 'blinky', ['fpga', 'uno']]);
  assert.deepEqual({ ...a.system.nodes[0], module: 'Uart' }, { ...sys.nodes[0], x: 0, y: 0 });   // (normalized: its place)
  assert.equal(sys.nodes[0].module, 'Uart', 'the System given unchanged');
  // (its top already, whatever its case: nothing to write)
  assert.deepEqual(nodeTop(sys, 'uart', 'fpga/uart.vhd'), { system: null, node: 'fpga', text: '\'uart\' is already fpga\'s top module' });
  // refused: a module in no node's folder, in a microcontroller's
  assert.deepEqual(nodeTop(sys, 'blinky', 'src/blinky.vhd'), { error: '\'blinky\' is in no node\'s folder of the System lab: a System project\'s top is its System, and an FPGA node\'s top module is a module of its folder' });
  assert.deepEqual(nodeTop(sys, 'blinky', null), { error: '\'blinky\' is in no node\'s folder of the System lab: a System project\'s top is its System, and an FPGA node\'s top module is a module of its folder' });
  assert.deepEqual(nodeTop(sys, 'ctl', 'uno/ctl.vhd'), { error: '\'ctl\' is in the folder of uno, a Microcontroller node: only an FPGA node has a top module' });
  assert.equal(NODE_UNSET_REFUSAL, 'a System project\'s top is its System, and each FPGA node always has a top module: Set as Top Module on another module of its folder changes it');
});
