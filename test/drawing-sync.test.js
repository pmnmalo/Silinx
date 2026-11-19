// A drawing's HDL file kept in sync with it on the server (#2674, server/drawing-sync.js). The reference: the HDL files
// of the repository's drawings, written by the interface's editors; made again on the server, each is the same, byte
// for byte (nothing written). Then a change, a drawing with errors (stale), the drawings in a language and back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scratchEnv } from './server-helpers.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let tmp;
before(async () => { tmp = await scratchEnv('silinx-drawing-sync-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const D = await import('../server/drawing-sync.js');
const read = (name, f) => fs.readFileSync(path.join(P.projectDir(name), f), 'utf8');

// the examples and test designs with a drawing linked to its HDL file
const linked = ['examples', 'test-designs'].flatMap(dir => fs.readdirSync(path.join(ROOT, dir)).filter(n => fs.existsSync(path.join(ROOT, dir, n, 'silinx.json'))))
  .filter(n => [P.EXAMPLES_DIR, P.TEST_DESIGNS_DIR].some(d => fs.existsSync(path.join(d, n)) && JSON.stringify(fs.readdirSync(path.join(d, n), { recursive: true })).match(/\.(sch|asm|fsm|tt|bool|pn)\.json"/)));

test('the repository\'s drawings: their HDL made again is the interface\'s, byte for byte', async () => {
  let checked = 0;
  for (const n of linked) {
    await P.createProject({ name: `c_${n}`, template: n });
    for (const f of (await P.fileTree(`c_${n}`)).filter(f => /\.(sch|asm|fsm|tt|bool|pn)\.json$/.test(f))) {
      const r = await D.syncDrawing(P, `c_${n}`, f);
      if (!r) continue;
      assert.deepEqual(r, { target: r.target, written: null, removed: null, stale: null, messages: [] }, `${n}/${f}`);
      checked++;
    }
    assert.deepEqual(await D.staleDrawings(P, `c_${n}`), [], n);
  }
  // (blinky's ASM chart, gates' schematic, traffic's state diagram and truth table at least)
  assert.ok(checked >= 4, `${checked} drawings`);
});

test('syncDrawing: a change written into the HDL file; a drawing with errors leaves it, stale; not a drawing', async () => {
  await P.createProject({ name: 'tr', template: 'traffic' });
  const tt = JSON.parse(read('tr', 'src/lamps.bool.json'));
  const before = read('tr', 'src/lamps.vhd');
  tt.table.car_g = `10${tt.table.car_g.slice(2)}`;
  await P.writeFile('tr', 'src/lamps.bool.json', JSON.stringify(tt, null, 2));
  assert.deepEqual(await D.syncDrawing(P, 'tr', 'src/lamps.bool.json'), { target: 'src/lamps.vhd', written: 'src/lamps.vhd', removed: null, stale: null, messages: ['src/lamps.vhd updated from src/lamps.bool.json'] });
  assert.notEqual(read('tr', 'src/lamps.vhd'), before);
  const fsm = JSON.parse(read('tr', 'src/traffic.fsm.json'));
  fsm.transitions[0].to = 's99';
  await P.writeFile('tr', 'src/traffic.fsm.json', JSON.stringify(fsm, null, 2));
  const hdl = read('tr', 'src/traffic.vhd');
  const why = 'A transition starts or ends at a state that does not exist';
  assert.deepEqual(await D.syncDrawing(P, 'tr', 'src/traffic.fsm.json'), { target: 'src/traffic.vhd', written: null, removed: null, stale: why, messages: [`WARNING: src/traffic.vhd not updated: src/traffic.fsm.json has errors: ${why}`] });
  assert.equal(read('tr', 'src/traffic.vhd'), hdl);
  assert.deepEqual(await D.staleDrawings(P, 'tr'), [{ target: 'src/traffic.vhd', from: 'src/traffic.fsm.json', why: `it has errors: ${why}` }]);
  assert.equal(await D.syncDrawing(P, 'tr', 'src/top.vhd'), null);
  assert.equal(await D.syncDrawing(P, 'tr', 'constraints/traffic.ucf'), null);
});

test('drawingsInLanguage / setSourceLanguage: the drawings in Verilog, their HDL files with them; one of its own kept', async () => {
  await P.createProject({ name: 'tl', template: 'traffic' });
  assert.equal(await D.drawingLanguage(P, 'tl', 'src/traffic.fsm.json'), 'vhdl');
  const own = await D.setSourceLanguage(P, 'tl', 'src/lamps.bool.json', 'vhdl');
  assert.deepEqual(own, { changed: false, language: 'vhdl', messages: [] });
  assert.deepEqual((await P.readProject('tl')).sourceLanguage, { 'src/lamps.bool.json': 'vhdl' });
  await P.updateProject('tl', p => ({ ...p, preferredLanguage: 'verilog' }));
  const r = await D.drawingsInLanguage(P, 'tl', 'verilog');
  assert.deepEqual(r, { changed: ['src/traffic.fsm.json'], messages: ['src/traffic.fsm.json: its HDL is now in Verilog, src/traffic.v (src/traffic.vhd removed)'] });
  assert.ok(!fs.existsSync(path.join(P.projectDir('tl'), 'src/traffic.vhd')));
  assert.equal(JSON.parse(read('tl', 'src/traffic.fsm.json')).generatedFile, 'src/traffic.v');
  assert.match(read('tl', 'src/traffic.v'), /^\s*module traffic/m);
  // its own back to the project's: Verilog now
  const back = await D.setSourceLanguage(P, 'tl', 'src/lamps.bool.json', '');
  assert.deepEqual(back, { changed: true, language: 'verilog', messages: ['src/lamps.bool.json: its HDL is now in Verilog, src/lamps.v (src/lamps.vhd removed)'] });
  assert.equal((await P.readProject('tl')).sourceLanguage, undefined);
});

test('adoptDrawing: a drawing whose HDL file is in the way says why, a design project\'s naming its module (#4693)', async () => {
  const same = { kind: 'same', path: 'src/m.sch.json', module: 'm', target: 'src/m.vhd', file: 'src/m.vhd' };
  const other = { kind: 'other', path: 'src/m.sch.json', module: 'm', target: 'src/m.vhd', file: 'src/m.vhd', free: 'src/m_sch.vhd' };
  const drawn = { ...same, kind: 'drawn', other: 'src/n.sch.json' };
  assert.deepEqual([same, other, drawn].map(c => D.clashWarning(c)), [
    'WARNING: src/m.sch.json has no HDL file: src/m.vhd exists already and defines its module m. Generate HDL File… (its right-click menu in the Design pane), or the drawing written with "generatedFile": "src/m.vhd", replaces src/m.vhd with the HDL generated from it.',
    'WARNING: src/m.sch.json has no HDL file: src/m.vhd exists already and holds something else. Generate HDL File… (its right-click menu in the Design pane) writes its HDL to src/m_sch.vhd.',
    'WARNING: src/m.sch.json has no HDL file: its module m is the module of src/n.sch.json (src/m.vhd). Rename one of them.',
  ]);
  assert.deepEqual([same, other, drawn].map(c => D.clashWarning(c, true)), [
    'WARNING: src/m.sch.json: Not made: another file of the project folder defines its module m. Make Module… (right-click), or the drawing written with "generatedFile": "src/m.vhd", replaces it with the drawing\'s.',
    'WARNING: src/m.sch.json: Not made: another file of the project folder has its name. Make Module… (right-click) makes it under another name.',
    'WARNING: src/m.sch.json: Not made: its module m is the module of src/n.sch.json. Rename one of them.',
  ]);
  // on a project: the HDL file left as it was, the drawing not linked
  await P.createProject({ name: 'clash' });
  const hand = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity maj is\n  port (a, b, c : in std_logic; f : out std_logic);\nend maj;\narchitecture rtl of maj is\nbegin\n  f <= a;\nend rtl;\n';
  await P.writeFile('clash', 'src/maj.vhd', hand);
  await P.updateProject('clash', pj => ({ ...pj, files: [...pj.files, { path: 'src/maj.vhd', lang: 'vhdl', role: 'design' }] }));
  await P.writeFile('clash', 'src/maj.bool.json', JSON.stringify({ version: 1, name: 'maj', inputs: ['a', 'b', 'c'], outputs: ['f'], table: { f: '00010111' }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' }));
  const r = await D.adoptDrawing(P, 'clash', 'src/maj.bool.json');
  assert.deepEqual({ ...r, messages: r.messages.length }, { target: null, written: null, removed: null, stale: null, clash: { kind: 'same', path: 'src/maj.bool.json', module: 'maj', target: 'src/maj.vhd', file: 'src/maj.vhd' }, messages: 1 });
  assert.equal(read('clash', 'src/maj.vhd'), hand);
  assert.equal(JSON.parse(read('clash', 'src/maj.bool.json')).generatedFile, undefined);
});
