// A project's nodes (#5414, #5416's phase 2, core/project-nodes.js): one implicit node for an FPGA project and for a
// design and simulation project (nothing written), a System project's nodes from its System document, each with its files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { projectNodes } from '../core/project-nodes.js';
import { writeSystem, newSystem } from '../core/system-doc.js';
import { EXAMPLE_ORDER, SYSTEM_ORDER } from '../core/examples.js';

const example = name => {
  const dir = new URL(`../examples/${name}/`, import.meta.url);
  const pj = JSON.parse(fs.readFileSync(new URL('silinx.json', dir), 'utf8'));
  const files = fs.readdirSync(dir, { recursive: true }).map(String).filter(f => fs.statSync(new URL(f, dir)).isFile());
  const texts = Object.fromEntries(files.filter(f => f.endsWith('.sys.json')).map(f => [f, fs.readFileSync(new URL(f, dir), 'utf8')]));
  return projectNodes(pj, { files, texts });
};
const short = r => r.nodes.map(n => [n.id, n.kind, n.board, n.module, n.files]);

test('#5414 an FPGA project: one implicit node, its board, top module and constraints; nothing else', () => {
  const r = projectNodes({ name: 'p', board: 'nexys2', device: { part: 'xc3s500e' }, top: 'blink', constraints: 'c/top.ucf' });
  assert.deepEqual(r, { system: null, error: null, owned: ['c/top.ucf'],
    nodes: [{ id: 'fpga', kind: 'fpga', implicit: true, board: 'nexys2', device: { part: 'xc3s500e' }, module: 'blink', lang: 'vhdl', files: ['c/top.ucf'] }] });
  // (no board, no top, no constraints: still its one node)
  assert.deepEqual(short(projectNodes({ name: 'q' })), [['fpga', 'fpga', null, null, []]]);
  assert.deepEqual(short(projectNodes(null)), [['fpga', 'fpga', null, null, []]]);
});

test('#5414 a design and simulation project: one implicit node, no board', () => {
  const r = projectNodes({ name: 'd', kind: 'design', top: 'adder' });
  assert.deepEqual(r.nodes, [{ id: 'design', kind: 'design', implicit: true, board: null, device: null, module: 'adder', lang: 'vhdl', files: [] }]);
  // (its base language the project's preferred HDL, #5488)
  assert.equal(projectNodes({ name: 'd', kind: 'design', preferredLanguage: 'verilog' }).nodes[0].lang, 'verilog');
  assert.equal(projectNodes({ name: 'f', preferredLanguage: 'verilog' }).nodes[0].lang, 'verilog');
});

test('#5414 a System project: its System document\'s nodes, each with its files; a shared file owned once', () => {
  const sys = { ...newSystem('lab'), nodes: [
    { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/a.hex' },
    { id: 'nano', kind: 'mcu', board: 'arduino-nano', firmware: 'fw/a.hex' },
    { id: 'f1', kind: 'fpga', module: 'top', board: 'basys2', variant: '250' },
    { id: 'bb', kind: 'circuit', circuit: 'src/bb.circ.json' },
    { id: 'term', kind: 'terminal' },
    { id: 'none', kind: 'mcu', board: 'arduino-uno' }] };
  const r = projectNodes({ name: 'lab', kind: 'system' }, { files: ['src/top.vhd', 'lab.sys.json', 'fw/a.hex'], texts: { 'lab.sys.json': writeSystem(sys) } });
  assert.equal(r.system, 'lab.sys.json');
  assert.deepEqual(short(r), [['uno', 'mcu', 'arduino-uno', null, ['fw/a.hex']], ['nano', 'mcu', 'arduino-nano', null, ['fw/a.hex']],
    ['f1', 'fpga', 'basys2', 'top', []], ['bb', 'circuit', null, null, ['src/bb.circ.json']], ['term', 'terminal', null, null, []], ['none', 'mcu', 'arduino-uno', null, []]]);
  assert.equal(r.nodes[2].variant, '250');
  assert.deepEqual(r.owned, ['fw/a.hex', 'src/bb.circ.json']);
  // (the old kind id of #5411 no System project's since #5440: an FPGA project's one node)
  assert.deepEqual(short(projectNodes({ name: 'lab', kind: 'codesign' }, { files: ['lab.sys.json'], texts: { 'lab.sys.json': writeSystem(sys) } })), [['fpga', 'fpga', null, null, []]]);
});

test('#5414 a System project with no System document, or one that cannot be read: no node, its error', () => {
  assert.deepEqual(projectNodes({ name: 's', kind: 'system' }, { files: ['src/a.vhd'] }), { system: null, nodes: [], owned: [], error: null });
  assert.deepEqual(projectNodes({ name: 's', kind: 'system' }, { files: ['s.sys.json'], texts: { 's.sys.json': '{' } }).nodes, []);
  assert.match(projectNodes({ name: 's', kind: 'system' }, { files: ['s.sys.json'], texts: { 's.sys.json': '{"format":"x"}' } }).error, /^not a System document/);
  // (its text not read yet: no node, an error, never a throw)
  assert.match(projectNodes({ name: 's', kind: 'system' }, { files: ['s.sys.json'] }).error, /^not a System document/);
});

test('#5414 the examples: every FPGA example one implicit node on its board; the System examples their nodes', () => {
  for (const name of [...EXAMPLE_ORDER, ...SYSTEM_ORDER]) {
    const r = example(name);
    assert.equal(r.error, null, name);
    if (r.system) continue;
    assert.deepEqual(r.nodes.map(n => [n.kind, n.implicit, n.board]), [['fpga', true, 'basys2']], name);
  }
  assert.deepEqual(short(example('uart-avr')), [['uno', 'mcu', 'arduino-uno', null, ['uno/hello.hex']], ['fpga', 'fpga', 'basys2', 'uart', []]]);
  assert.deepEqual(short(example('spi-avr')), [['uno', 'mcu', 'arduino-uno', null, ['uno/spi.hex']], ['fpga', 'fpga', 'basys2', 'spi_echo', []]]);
  assert.deepEqual(short(example('i2c-avr')), [['uno', 'mcu', 'arduino-uno', null, ['uno/i2c.hex']], ['fpga', 'fpga', 'basys2', 'i2c_leds', []]]);
  assert.deepEqual(short(example('regs-avr')), [['uno', 'mcu', 'arduino-uno', null, ['uno/regs.hex']], ['fpga', 'fpga', 'basys2', 'pwm_top', []]]);
  assert.deepEqual(short(example('blinky')), [['fpga', 'fpga', 'basys2', 'top', ['constraints/top.ucf']]]);
});
