// Renaming a module on the server (#2674, server/rename-module.js), as the interface's Rename does: the modules of the
// project's HDL files, the file following the name, the stimuli and the test bench renamed with it, and a rename
// refused before anything is moved (a drawing's new path taken).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-rename-module-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const R = await import('../server/rename-module.js');

test('projectModules: the modules of the HDL files, with their file', async () => {
  await P.createProject({ name: 'b', template: 'blinky' });
  const mods = await R.projectModules(P, 'b');
  assert.deepEqual(mods.map(m => `${m.name}:${m.file}`).sort(), ['bcd_counter:src/bcd_counter.vhd', 'knight:src/knight.vhd', 'prescaler:src/counter.v', 'sevenseg:src/sevenseg.v', 'speed_ctrl:src/speed_ctrl.vhd', 'tb_top:sim/tb_top.vhd', 'top:src/top.vhd']);
});

test('followingFile: the file named after the module follows it, another one stays', () => {
  assert.equal(R.followingFile('src/top.vhd', 'top', 'main'), 'src/main.vhd');
  assert.equal(R.followingFile('src/TOP.vhd', 'top', 'main'), 'src/main.vhd');
  assert.equal(R.followingFile('sim/tb_top.vhd', 'top', 'main'), null);
  assert.equal(R.followingFile('top.v', 'top', 'main'), 'main.v');
});

test('renameModule: the test bench and its stimuli renamed with it', async () => {
  await P.updateProject('b', p => ({ ...p, stimuli: { tb_top: { cycles: 4 } } }));
  const r = await R.renameModule(P, 'b', 'tb_top', 'tb_blinky');
  assert.equal(r.message, 'Rename: module \'tb_top\' renamed to \'tb_blinky\' (1 file(s) updated).');
  const pj = await P.readProject('b');
  assert.deepEqual([pj.simTop, pj.stimuli], ['tb_blinky', { tb_blinky: { cycles: 4 } }]);
});

test('renameModule: refused before anything moves when a drawing\'s new path is taken', async () => {
  await P.writeFile('b', 'src/pace.asm.json', '{}');
  const before = JSON.stringify(await P.readProject('b'));
  await assert.rejects(R.renameModule(P, 'b', 'speed_ctrl', 'pace', { to: 'src/pace.vhd' }), { rename: true, message: 'src/pace.asm.json already exists.' });
  assert.equal(JSON.stringify(await P.readProject('b')), before);
  assert.ok(fs.existsSync(path.join(P.projectDir('b'), 'src/speed_ctrl.vhd')) && fs.existsSync(path.join(P.projectDir('b'), 'src/speed_ctrl.asm.json')));
  assert.match(fs.readFileSync(path.join(P.projectDir('b'), 'src/top.vhd'), 'utf8'), /speed_ctrl/);
});

// (#4731) core/rename-module.js, the interface's too: `before` called once the checks passed, with the files to change
// and to move, before any moves (the interface closes their editors); never on a refusal; a circuit's module renamed
// with its drawing, its HDL made again by its kind
test('#4731 renameModule: before() with the plan, not on a refusal; a circuit renamed with its drawing', async () => {
  const C = await import('../core/rename-module.js');
  assert.equal(C.renameModule, R.renameModule);
  await P.createProject({ name: 'c', template: 'breadboard' });
  const calls = [];
  await assert.rejects(C.renameModule(P, 'c', 'breadboard', 'entity', { before: p => calls.push(p) }), { rename: true });
  assert.deepEqual(calls, []);
  const hdl = (await R.projectModules(P, 'c')).find(m => m.name === 'breadboard').file;
  const r = await C.renameModule(P, 'c', 'breadboard', 'board1', { to: R.followingFile(hdl, 'breadboard', 'board1'), before: p => calls.push(p) });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].moved, [['src/breadboard.circ.json', 'src/board1.circ.json'], [hdl, hdl.replace('breadboard', 'board1')]]);
  assert.ok(calls[0].changed.includes('src/breadboard.circ.json'), JSON.stringify(calls[0].changed));
  assert.equal(r.file, hdl.replace('breadboard', 'board1'));
  const text = await P.readFile('c', r.file);
  assert.match(text, /\b(entity|module) board1\b/);
  assert.ok(!/\bbreadboard\b/.test(text), 'no old name left in its HDL');
  assert.equal(JSON.parse(await P.readFile('c', 'src/board1.circ.json')).generatedFile, r.file);
  assert.equal((await P.readProject('c')).top, 'board1');
});
