// A project's constraints file from its board's pins and Check Constraints, one implementation (#4732:
// core/board-constraints.js, core/constraints-diagnostics.js): a student's ports that match no board name (a, b, y) get
// pins by direction through the MCP's set_top update_constraints too (the interface's Update Constraints gave them, the
// MCP none); the file on the examples' boards; Check Constraints in each format, its problems ConstraintSystem's.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { boardConstraintsFile, boardOfProject, ucfPort } from '../core/board-constraints.js';
import { constraintsFileDiagnostics } from '../core/constraints-diagnostics.js';
import { compile, elaborate } from '../core/compile.js';
import { checkUcf } from '../packages/silinx-fpga/src/parts.js';
import { constraintsDiagnostics } from '../core/constraints-check.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-board-constraints-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
const ok = async (name, args) => {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  assert.equal(r.isError, false, r.content[0].text);
  return { text: r.content[0].text, data: r.structuredContent };
};

const GATE = 'library ieee; use ieee.std_logic_1164.all;\nentity g is port (a, b : in std_logic; y : out std_logic; q : out std_logic_vector(1 downto 0)); end g;\narchitecture r of g is begin y <= a and b; q <= a & b; end r;\n';
const portsOf = (text, top) => elaborate(compile([{ path: 'g.vhd', lang: 'vhdl', text }]), top).top.ports.map(ucfPort);

test('ucfPort: a bit, a vector, its bounds', () => {
  assert.deepEqual(portsOf(GATE, 'g'), [
    { name: 'a', dir: 'in', width: 1, msb: null, lsb: null }, { name: 'b', dir: 'in', width: 1, msb: null, lsb: null },
    { name: 'y', dir: 'out', width: 1, msb: null, lsb: null }, { name: 'q', dir: 'out', width: 2, msb: 1, lsb: 0 }]);
});

test('boardConstraintsFile: the ports no board name matches, by direction (inputs on switches, outputs on LEDs), on every family\'s board', () => {
  for (const [board, part, loc] of [['basys2', 'xc3s100e', /NET "a"\s+LOC = "\w+"/], ['icebreaker', 'ice40up5k', /set_io a \w+/], ['ulx3s', 'lfe5u-85f', /LOCATE COMP "a" SITE "\w+"/]]) {
    const b = boardOfProject({ board, device: { part } });
    assert.ok(b, board);
    const r = boardConstraintsFile('g', portsOf(GATE, 'g'), b);
    assert.deepEqual([r.matched.sort(), r.unmatched], [['a', 'b', 'q', 'y'], []], board);
    assert.match(r.text, loc, board);
  }
  assert.equal(boardOfProject({ board: 'none' }), null);
  assert.equal(boardOfProject({}), null);
});

test('#4732 set_top update_constraints: a student\'s a, b, y get pins as the interface\'s Update Constraints gives them', async () => {
  await ok('new_project', { name: 'stu', board: 'basys2' });
  await ok('write_file', { project: 'stu', path: 'src/g.vhd', text: GATE });
  const r = await ok('set_top', { project: 'stu', top: 'g', update_constraints: true });
  const pj = await P.readProject('stu');
  assert.equal(r.text, `stu: top g, test bench (none); ${pj.constraints} written from the basys2's pins.`);
  const text = await P.readFile('stu', pj.constraints);
  assert.equal(text, boardConstraintsFile('g', portsOf(GATE, 'g'), boardOfProject(pj)).text);
  for (const net of ['a', 'b', 'y', 'q<0>', 'q<1>']) assert.match(text, new RegExp(`NET "${net}"\\s+LOC = "\\w+"`), net);
  // (and Check Constraints says nothing of it)
  const c = await ok('check_constraints', { project: 'stu' });
  assert.deepEqual([c.data.ok, c.data.errors, c.data.warnings], [true, [], []]);
});

test('constraintsFileDiagnostics: each format by its name, as checkUcf and constraintsDiagnostics say it, in the file, ConstraintSystem\'s', () => {
  const ports = portsOf(GATE, 'g');
  const board = boardOfProject({ board: 'basys2', device: { part: 'xc3s100e' } });
  const device = { part: 'xc3s100e', package: 'cp132', speed: '-4' };
  const ucf = 'NET "a" LOC = "P11";\nNET "zz" LOC = "L3";\nNET "b" LOC = "P11";\n';
  const u = constraintsFileDiagnostics('c/top.UCF', ucf, { ports, top: 'g', device, board });
  assert.deepEqual(u, checkUcf(ucf, { top: 'g', ports, lang: 'vhdl', iostandards: null, board, package: 'cp132' }).map(d => ({ ...d, file: 'c/top.UCF', tool: 'ConstraintSystem' })));
  assert.ok(u.some(d => d.severity === 'warning' || d.severity === 'error'), JSON.stringify(u));
  const pcf = 'set_io a 10\nset_io zz 11\n';
  const ice = { part: 'ice40up5k', package: 'sg48' };
  const p = constraintsFileDiagnostics('top.pcf', pcf, { ports, top: 'g', device: ice });
  assert.deepEqual(p, constraintsDiagnostics('pcf', pcf, { ports, top: 'g', device: ice, board: null }).map(d => ({ ...d, file: 'top.pcf', tool: 'ConstraintSystem' })));
  assert.ok(p.some(d => /set_io zz: the top has no such port/.test(d.message)), JSON.stringify(p));
  // (an XDC: its names only)
  const x = constraintsFileDiagnostics('top.xdc', 'set_property PACKAGE_PIN W5 [get_ports zz]\n', { ports, top: 'g', device: { part: 'xc7a35t' } });
  assert.deepEqual(x, constraintsDiagnostics('xdc', 'set_property PACKAGE_PIN W5 [get_ports zz]\n', { ports }).map(d => ({ ...d, file: 'top.xdc', tool: 'ConstraintSystem' })));
  assert.ok(x.length >= 1);
});
