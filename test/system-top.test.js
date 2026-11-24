// A System as a project's top (#5402, core/system-top.js): Top-Level Source Type "System", offered where Systems are
// on (refused in a release and in a design and simulation project); an FPGA project made a System project, its System
// its top (a new one, or the one given), its board kept to come back to; a module of a System project its top again:
// an FPGA project on the board of the FPGA node that runs it (its variant's device), else on the board it had.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setBuildChannel, SYSTEMS_OFF } from '../core/build-channel.js';
import { SYSTEM_TOP, systemTopRefusal, toSystemTop, toModuleTop } from '../core/system-top.js';
import { offeredTopTypes, topTypeRefusal, projectTopType } from '../core/top-types.js';
import { newProjectJson } from '../core/project-defaults.js';
import { readSystem, newSystem } from '../core/system-doc.js';
import { resolveBoard } from '../core/devices.js';

const fpga = () => ({ ...newProjectJson('p', { board: 'nexys2', device: resolveBoard('nexys2').device }), top: 'blinky', topSourceType: 'sch' });

test('#5402 Top-Level Source Type System: offered where Systems are on; refused in a release and in a design project', () => {
  setBuildChannel('release');
  assert.equal(offeredTopTypes().some((t) => t.id === SYSTEM_TOP), false);
  assert.equal(systemTopRefusal(fpga()), SYSTEMS_OFF);
  assert.equal(topTypeRefusal(fpga(), 'system'), `top_source_type system: ${SYSTEMS_OFF}`);
  setBuildChannel('dev');
  assert.deepEqual(offeredTopTypes().map((t) => t.id).slice(-2), ['cpp', 'system']);
  assert.equal(topTypeRefusal(fpga(), 'system'), null);
  assert.equal(topTypeRefusal({ kind: 'design' }, 'system'), 'top_source_type system: a design and simulation project\'s top is a drawing: a System is a System project\'s top (New Project ▸ System)');
  // (a new System project's top type: System)
  assert.equal(projectTopType(newProjectJson('c', { kind: 'system' })).id, 'system');
});

test('#5402 an FPGA project made a System project, its System its top: a new one, or the one given; its board kept', () => {
  setBuildChannel('dev');
  const r = toSystemTop(fpga());
  assert.deepEqual([r.pj.profile, r.pj.board, r.pj.constraints, r.pj.top, r.pj.topSourceType, r.file, r.write.path], ['system', null, null, '', 'system', 'p.sys.json', 'p.sys.json']);
  assert.deepEqual(readSystem(r.write.text).system.nodes, []);
  assert.deepEqual(r.pj.fpga, { board: 'nexys2', device: resolveBoard('nexys2').device, constraints: 'constraints/top.ucf' });
  // (the one given: nothing written)
  const g = toSystemTop(fpga(), 'src/lab.sys.json');
  assert.deepEqual([g.write, g.file, g.pj.profile], [null, 'src/lab.sys.json', 'system']);   // (its profile, #5440)
  // (a System project already: what it kept, kept)
  assert.deepEqual(toSystemTop(r.pj, 'p.sys.json').pj.fpga, r.pj.fpga);
});

test('#5402 a module of a System project its top: an FPGA project on its FPGA node\'s board, else on the board it had', () => {
  setBuildChannel('dev');
  const co = toSystemTop(fpga()).pj;
  const sys = { ...newSystem('p'), nodes: [{ id: 'f', kind: 'fpga', module: 'Uart', board: 'basys2', variant: '100', pins: {}, interfaces: [] }] };
  const a = toModuleTop(co, 'uart', sys);
  assert.deepEqual([a.kind, a.board, a.device.part, a.top, a.topSourceType, a.constraints, a.fpga], [undefined, 'basys2', resolveBoard('basys2', { variant: '100' }).device.part, 'uart', 'hdl', 'constraints/top.ucf', undefined]);
  // (a module no node runs: the board it had, its constraints file)
  const b = toModuleTop(co, 'blinky', sys);
  assert.deepEqual([b.kind, b.board, b.device.part, b.constraints, b.top], [undefined, 'nexys2', resolveBoard('nexys2').device.part, 'constraints/top.ucf', 'blinky']);
  // (a System project made so: no board before, none now)
  const c = toModuleTop(newProjectJson('c', { kind: 'system' }), 'blinky', null);
  assert.deepEqual([c.kind, c.board, c.top], [undefined, null, 'blinky']);
});
