// The MCP's set_mode (#5755, roadmap #5753: server/mcp-mode.js on core/mode-change.js), on projects made from the examples:
// Circuit → Board with a board (its constraints file written from the board's pins); Board → System (the blinky example's
// files moved into fpga/, its ASM chart's HDL path followed, its System document written and checked by check_system);
// System → Board refused unless confirm, then done with each loss a WARNING; Board → Circuit; a version kept before each;
// the files never deleted.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-mode-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };
const there = (p, f) => fs.existsSync(path.join(P.projectDir(p), f));
// (the text before the untrusted content's end, the lines of the tool alone)
const lines = t => t.split('\n').filter(l => !/^\[End of untrusted/.test(l) && l);

test('#5755 set_mode: Circuit → Board with a board, its constraints from the board\'s pins; nothing lost', async () => {
  await ok('new_project', { name: 'c1', mode: 'circuit' });
  await ok('write_file', { project: 'c1', path: 'src/traffic.fsm.json', text: fs.readFileSync('examples/traffic/src/traffic.fsm.json', 'utf8') });
  await ok('set_top', { project: 'c1', top: 'traffic' });
  const r = await ok('set_mode', { project: 'c1', mode: 'board', board: 'basys2' });
  assert.deepEqual(lines(r.text), ['c1: Board now (nothing lost).', '  its board basys2', '  its constraints file constraints/top.ucf, to be written']);
  const pj = await P.readProject('c1');
  assert.deepEqual([pj.kind, pj.board, pj.constraints, (await ok('project_info', { project: 'c1' })).data.mode], [undefined, 'basys2', 'constraints/top.ucf', 'board']);
  assert.ok(there('c1', 'constraints/top.ucf'), 'its constraints written');
  assert.deepEqual([r.data.lost, r.data.moved, r.data.system], [[], [], null]);
  // (the same mode again; a board going elsewhere; an unknown mode)
  await fails('set_mode', { project: 'c1', mode: 'board' }, 'the project \'c1\' is a Board project already');
  await fails('set_mode', { project: 'c1', mode: 'system', board: 'basys2' }, 'board, variant: given going from Circuit to Board only');
  await fails('set_mode', { project: 'c1', mode: 'fpga' }, 'mode: one of circuit, board, system');
});

test('#5755 set_mode: blinky Board → System → Board, its board the first node and back, its files moved and kept', async () => {
  await ok('new_project_from_example', { name: 'b1', example: 'blinky' });
  const r = await ok('set_mode', { project: 'b1', mode: 'system' });
  assert.deepEqual(lines(r.text), ['b1: System now (nothing lost).', '  its board the System\'s first node, fpga (basys2)', '  its files moved into the node\'s folder, fpga/ (constraints, sim, src)', '  its System document b1.sys.json written']);
  assert.deepEqual([there('b1', 'src'), there('b1', 'fpga/src/top.vhd'), there('b1', 'fpga/constraints/top.ucf'), there('b1', 'b1.sys.json')], [false, true, true, true]);
  // (its ASM chart's HDL followed it)
  assert.equal(JSON.parse(fs.readFileSync(path.join(P.projectDir('b1'), 'fpga/src/speed_ctrl.asm.json'), 'utf8')).generatedFile, 'fpga/src/speed_ctrl.vhd');
  const info = (await ok('project_info', { project: 'b1' })).data;
  assert.deepEqual([info.mode, info.nodes.map(n => [n.id, n.kind, n.board, n.module])], ['system', [['fpga', 'fpga', 'basys2', 'top']]]);
  assert.equal(lines((await ok('check_system', { project: 'b1', file: 'b1.sys.json' })).text)[0], 'System b1: 1 node, 0 links');
  // (down: refused unless confirmed, what would be lost said; then done, each loss a WARNING; the System document kept)
  await fails('set_mode', { project: 'b1', mode: 'board' }, 'going down to Board loses, in \'b1\': its System document b1.sys.json (it stays in the folder, out of the flow). Give confirm true to do it (nothing is deleted from the disk).');
  assert.equal((await ok('project_info', { project: 'b1' })).data.mode, 'system', 'not changed');
  const d = await ok('set_mode', { project: 'b1', mode: 'board', confirm: true });
  assert.deepEqual(lines(d.text), ['b1: Board now (nothing deleted: what left the project stays on the disk).', '  the node fpga the project\'s (basys2)', 'WARNING: lost: its System document b1.sys.json (it stays in the folder, out of the flow)']);
  const pj = await P.readProject('b1');
  assert.deepEqual([pj.board, pj.top, pj.constraints, pj.simTop, pj.profile, there('b1', 'b1.sys.json')], ['basys2', 'top', 'fpga/constraints/top.ucf', 'tb_top', undefined, true]);
  assert.ok(pj.files.every(f => f.path.startsWith('fpga/')), JSON.stringify(pj.files));
  // (its HDL still checks, at its new paths)
  const chk = await call('check_syntax', { project: 'b1' });
  assert.equal(chk.isError, false, chk.text);
  assert.deepEqual(lines(chk.text), ['Process "Check Syntax" of <top> completed successfully (53 signals, 26 processes).']);   // (no warning)
  // (a version kept before each change, #5740)
  const v = await ok('list_versions', { project: 'b1' });
  assert.deepEqual(v.data.versions.map(x => x.reason).filter(x => x === 'before-mode').length, 2);
});

test('#5755 set_mode: the uart-avr System down to Board, the Arduino node and the link said lost; to Circuit, its own HDL too', async () => {
  await ok('new_project_from_example', { name: 's1', example: 'uart-avr' });
  await fails('set_mode', { project: 's1', mode: 'board', keep: 'uno', confirm: true }, 'uno is a mcu node: only an FPGA or a design node can be kept');
  const d = await ok('set_mode', { project: 's1', mode: 'board', confirm: true });
  assert.deepEqual(lines(d.text).filter(l => l.startsWith('WARNING')), [
    'WARNING: lost: the node uno (mcu, arduino-uno) leaves the project: its folder uno/ stays on the disk',
    'WARNING: lost: its 1 link (serial)',
    'WARNING: lost: its System document uart_avr.sys.json (it stays in the folder, out of the flow)']);
  assert.deepEqual([d.data.kept, there('s1', 'uno/hello.hex'), (await P.readProject('s1')).board], ['fpga', true, 'basys2']);
  await fails('set_mode', { project: 's1', mode: 'circuit' }, 'going down to Circuit loses, in \'s1\': its board, basys2; its constraints file fpga/uart.ucf (it stays on the disk); its HDL and C sources no drawing makes leave the project (they stay on the disk): fpga/uart_rx.vhd, fpga/uart_tx.vhd, fpga/debounce.vhd, fpga/sevenseg.vhd, fpga/uart.vhd; its implementation, emulation and programming. Give confirm true to do it (nothing is deleted from the disk).');
  const c = await ok('set_mode', { project: 's1', mode: 'circuit', confirm: true });
  assert.equal(lines(c.text)[0], 's1: Circuit now (nothing deleted: what left the project stays on the disk).');
  const pj = await P.readProject('s1');
  assert.deepEqual([pj.kind, pj.board, pj.constraints, pj.files.length, there('s1', 'fpga/uart.vhd'), there('s1', 'fpga/uart.ucf')], ['design', null, null, 0, true, true]);
});
