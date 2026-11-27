// A project's mode changed (#5755, roadmap #5753: core/mode-change.js), on the examples: Circuit → Board (a board, nothing
// lost), Board → System (its board the first node, its files moved into the node's folder, its System document written,
// its drawings' HDL paths followed), System → Board (one FPGA node kept, the others, the links and the System document
// said lost), Board → Circuit (the board, the constraints file, its own HDL said lost), System → Circuit; each refusal's
// exact message; and the round trip Board → System → Board giving back the same board, top module and constraints.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modeChange, modeChangeText, confirmText, nodeMoves, relinked, goesDown } from '../core/mode-change.js';
import { modeOf } from '../core/project-mode.js';
import { readSystem } from '../core/system-doc.js';
import { projectSystem } from '../core/project-system.js';
import { setBuildChannel, SYSTEMS_OFF } from '../core/build-channel.js';

setBuildChannel('dev');
after(() => setBuildChannel('dev'));
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// an example: its silinx.json, its file tree, its System document's text
function example(name) {
  const dir = path.join(ROOT, 'examples', name);
  const files = [];
  const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else files.push(r); } };
  walk(dir, '');
  const texts = Object.fromEntries(files.filter(f => f.endsWith('.sys.json')).map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
  return { pj: JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8')), files: files.sort(), texts };
}
const CIRCUIT = { name: 'c', kind: 'design', board: null, constraints: null, device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, top: 'adder', files: [{ path: 'src/adder.sch.json', lang: 'schematic', role: 'design' }, { path: 'src/adder.vhd', lang: 'vhdl', role: 'design' }] };

test('#5755 up or down: Circuit < Board < System', () => {
  assert.deepEqual([goesDown('board', 'circuit'), goesDown('system', 'board'), goesDown('system', 'circuit'), goesDown('circuit', 'board'), goesDown('board', 'system')], [true, true, true, false, false]);
});

test('#5755 Circuit → Board: its board and the board\'s constraints file, nothing lost', () => {
  const r = modeChange(CIRCUIT, 'board', { board: 'nexys2', device: { family: 'spartan3e', part: 'xc3s500e', package: 'fg320', speed: '-4' } });
  assert.equal(r.error, undefined);
  assert.deepEqual([modeOf(r.project), r.project.kind, r.project.board, r.project.device.part, r.project.constraints, r.down, r.lost, r.moves, r.write], ['board', undefined, 'nexys2', 'xc3s500e', 'constraints/top.ucf', false, [], [], null]);
  assert.equal(modeChangeText('c', 'board', r), 'c: Board now (nothing lost).\n  its board nexys2\n  its constraints file constraints/top.ucf, to be written');
  // (no board: its device kept, its board chosen later)
  assert.deepEqual([modeChange(CIRCUIT, 'board').project.board, modeChange(CIRCUIT, 'board').project.device.part], [null, 'xc3s250e']);
});

test('#5755 Board → System: the blinky example\'s board its first node, its files in fpga/, its System document written', () => {
  const { pj, files } = example('blinky');
  const r = modeChange(pj, 'system', { files });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.moves, [{ from: 'constraints', to: 'fpga/constraints' }, { from: 'sim', to: 'fpga/sim' }, { from: 'src', to: 'fpga/src' }]);
  assert.equal(r.relink, true);
  assert.equal(r.write.path, 'blinky.sys.json');
  const sys = readSystem(r.write.text).system;
  assert.deepEqual(sys.nodes.map(n => [n.id, n.kind, n.module, n.board, n.variant, n.constraints, n.lang]), [['fpga', 'fpga', 'top', 'basys2', '250', 'fpga/constraints/top.ucf', 'vhdl']]);
  assert.deepEqual(sys.links, []);
  assert.deepEqual([modeOf(r.project), r.project.profile, r.project.board, r.project.constraints, r.project.top, 'topSourceType' in r.project, r.project.simTop], ['system', 'system', null, null, '', false, 'tb_top']);
  assert.deepEqual(r.project.files.map(f => f.path).sort(), pj.files.map(f => `fpga/${f.path}`).sort());
  assert.deepEqual([r.down, r.lost], [false, []]);
  assert.equal(modeChangeText('blinky', 'system', r), 'blinky: System now (nothing lost).\n  its board the System\'s first node, fpga (basys2)\n  its files moved into the node\'s folder, fpga/ (constraints, sim, src)\n  its System document blinky.sys.json written');
  // (the System it reads as: the node, from its document)
  assert.deepEqual(projectSystem(r.project, { files: [r.write.path], texts: { [r.write.path]: r.write.text } }).model.nodes.map(n => n.id), ['fpga']);
  // (a System document of its name there already: another name, nothing overwritten)
  assert.equal(modeChange(pj, 'system', { files: [...files, 'blinky.sys.json'] }).write.path, 'blinky_2.sys.json');
});

test('#5755 the moves: the root\'s entries but silinx.json, build, labs, hidden folders, read-me, licence and System documents', () => {
  assert.deepEqual(nodeMoves(['silinx.json', 'build/x.bit', '.gitignore', '.github/w.yml', 'README.md', 'LICENSE', 'labs/l.lab.json', 'a.sys.json', 'src/a.vhd', 'top.ucf', 'fpga/b.vhd'], 'fpga'),
    [{ from: 'src', to: 'fpga/src' }, { from: 'top.ucf', to: 'fpga/top.ucf' }]);
  // (only the entries that hold the project's own files: another node's folder left there stays)
  assert.deepEqual(nodeMoves(['src/a.vhd', 'uno/hello.hex', 'docs/n.txt'], 'fpga', ['src/a.vhd']), [{ from: 'src', to: 'fpga/src' }]);
  assert.deepEqual(modeChange({ ...CIRCUIT, files: [{ path: 'src/adder.sch.json', role: 'design' }] }, 'system', { files: ['src/adder.sch.json', 'uno/hello.hex'] }).moves, [{ from: 'src', to: 'design/src' }]);
  // (a drawing's HDL path followed; one that does not move, or no drawing, left as it is)
  const sch = JSON.stringify({ format: 'x', generatedFile: 'src/adder.vhd' });
  assert.equal(JSON.parse(relinked('src/adder.sch.json', sch, [{ from: 'src', to: 'fpga/src' }])).generatedFile, 'fpga/src/adder.vhd');
  assert.equal(relinked('src/adder.sch.json', sch, [{ from: 'sim', to: 'fpga/sim' }]), null);
  assert.equal(relinked('src/adder.vhd', sch, [{ from: 'src', to: 'fpga/src' }]), null);
  assert.equal(relinked('src/bad.fsm.json', '{', [{ from: 'src', to: 'fpga/src' }]), null);
});

test('#5755 Circuit → System: its drawings the System\'s design node, in design/', () => {
  const r = modeChange(CIRCUIT, 'system', { files: ['silinx.json', 'src/adder.sch.json', 'src/adder.vhd'] });
  const sys = readSystem(r.write.text).system;
  assert.deepEqual(sys.nodes.map(n => [n.id, n.kind, n.module, n.constraints]), [['design', 'design', 'adder', undefined]]);
  assert.deepEqual([r.moves, modeOf(r.project), r.project.kind], [[{ from: 'src', to: 'design/src' }], 'system', undefined]);
  assert.match(modeChangeText('c', 'system', r), /its drawings the System's first node, design\n/);
});

test('#5755 System → Board: the uart-avr example keeps its FPGA node; the Arduino node, the link and the System document said lost', () => {
  const { pj, files, texts } = example('uart-avr');
  const r = modeChange(pj, 'board', { files, texts });
  assert.equal(r.error, undefined);
  assert.deepEqual([modeOf(r.project), r.project.kind, r.project.profile, r.project.board, r.project.device.part, r.project.constraints, r.project.top, r.kept, r.down, r.moves, r.write],
    ['board', undefined, undefined, 'basys2', 'xc3s250e', 'fpga/uart.ucf', 'uart', 'fpga', true, [], null]);
  assert.deepEqual(r.lost, ['the node uno (mcu, arduino-uno) leaves the project: its folder uno/ stays on the disk', 'its 1 link (serial)', 'its System document uart_avr.sys.json (it stays in the folder, out of the flow)']);
  assert.equal(modeChangeText('uart-avr', 'board', r), 'uart-avr: Board now (nothing deleted: what left the project stays on the disk).\n  the node fpga the project\'s (basys2)\nWARNING: lost: the node uno (mcu, arduino-uno) leaves the project: its folder uno/ stays on the disk\nWARNING: lost: its 1 link (serial)\nWARNING: lost: its System document uart_avr.sys.json (it stays in the folder, out of the flow)');
  assert.equal(confirmText('uart-avr', 'board', r), 'going down to Board loses, in \'uart-avr\': the node uno (mcu, arduino-uno) leaves the project: its folder uno/ stays on the disk; its 1 link (serial); its System document uart_avr.sys.json (it stays in the folder, out of the flow). Give confirm true to do it (nothing is deleted from the disk).');
  // (the FPGA node's sources stay the project's)
  assert.deepEqual(r.project.files.map(f => f.path), pj.files.map(f => f.path));
  // (a node to keep that is not, or is no FPGA node: refused, named)
  assert.deepEqual(modeChange(pj, 'board', { files, texts, keep: 'nope' }), { error: 'the System has no node \'nope\' (its nodes: uno, fpga)' });
  // (its Arduino kept instead: a processor board's project, #5756: test/processor-board.test.js)
  assert.equal(modeChange(pj, 'board', { files, texts, keep: 'uno' }).project.board, 'arduino-uno');
});

test('#5755 Board → System → Board: the same board, device, top module, constraints and sources', () => {
  const { pj, files } = example('blinky');
  const up = modeChange(pj, 'system', { files });
  const after = [...files.filter(f => !up.moves.some(m => f.startsWith(`${m.from}/`))), ...files.filter(f => up.moves.some(m => f.startsWith(`${m.from}/`))).map(f => `fpga/${f}`), up.write.path];
  const down = modeChange(up.project, 'board', { files: after, texts: { [up.write.path]: up.write.text } });
  assert.equal(down.error, undefined);
  assert.deepEqual([down.project.board, down.project.device, down.project.top, down.project.constraints, down.project.simTop], [pj.board, pj.device, pj.top, 'fpga/constraints/top.ucf', pj.simTop]);
  assert.deepEqual(down.project.files.map(f => f.path).sort(), pj.files.map(f => `fpga/${f.path}`).sort());
  assert.deepEqual(down.lost, ['its System document blinky.sys.json (it stays in the folder, out of the flow)']);
});

test('#5755 Board → Circuit: the board, the constraints file and its own HDL said lost; a drawing\'s HDL kept', () => {
  const { pj, files } = example('blinky');
  // (speed_ctrl.vhd is its ASM chart's: kept; the others are its own)
  const r = modeChange(pj, 'circuit', { files, generated: ['src/speed_ctrl.vhd'] });
  assert.deepEqual([modeOf(r.project), r.project.board, r.project.constraints, r.down], ['circuit', null, null, true]);
  assert.deepEqual(r.project.files.map(f => f.path), pj.files.filter(f => f.role === 'sim' || ['src/speed_ctrl.vhd', 'src/speed_ctrl.asm.json'].includes(f.path)).map(f => f.path));
  assert.deepEqual(r.lost, ['its board, basys2', 'its constraints file constraints/top.ucf (it stays on the disk)',
    'its HDL and C sources no drawing makes leave the project (they stay on the disk): src/counter.v, src/knight.vhd, src/bcd_counter.vhd, src/sevenseg.v, src/top.vhd',
    'its implementation, emulation and programming']);
});

test('#5755 System → Circuit: the FPGA node kept, then made a Circuit: both losses said', () => {
  const { pj, files, texts } = example('uart-avr');
  const r = modeChange(pj, 'circuit', { files, texts });
  assert.deepEqual([modeOf(r.project), r.project.board, r.kept], ['circuit', null, 'fpga']);
  assert.equal(r.lost.length, 3 + 4);   // (System → Board's three, Board → Circuit's four)
  assert.match(r.lost[3], /^its board, basys2$/);
});

test('#5755 refused: the same mode, no such mode, a board not going to Board, a node kept with no System, Systems off', () => {
  const { pj, files } = example('blinky');
  assert.deepEqual(modeChange(pj, 'board', { files }), { error: 'the project \'blinky\' is a Board project already' });
  assert.deepEqual(modeChange(pj, 'fpga', { files }), { error: 'no mode \'fpga\' (the modes: circuit, board, system)' });
  assert.deepEqual(modeChange(pj, 'system', { files, board: 'nexys2' }), { error: 'a board or a device is given going from Circuit to Board only' });
  assert.deepEqual(modeChange(pj, 'circuit', { files, keep: 'fpga' }), { error: 'keep: the node a System keeps going down; this project has no System' });
  setBuildChannel('release');
  try { assert.deepEqual(modeChange(pj, 'system', { files }), { error: SYSTEMS_OFF }); } finally { setBuildChannel('dev'); }
});
