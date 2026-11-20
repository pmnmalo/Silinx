// The documents' formats (#4756, core/doc-format.js): each kind of drawing's version is the one its module writes; a
// drawing a newer Silinx saved (a greater version) is known as such, and never written over in an older format, by the
// local server (writeFile: a 409 that says why) nor by the browser edition's stores; a description a newer Silinx saved
// is said.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_VERSION, formatVersion, newerDrawing, newerProject, downgradeRefusal } from '../core/doc-format.js';
import { newDoc, normalizeDoc } from '../core/schdoc.js';
import { newFsm, normalizeFsm } from '../core/fsm.js';
import { newModel, normalizeModel } from '../core/asm.js';
import { newTable, normalizeTable } from '../core/logic.js';
import { newPetri, normalizePetri } from '../core/petri.js';
import { newCircuit, normalizeCircuit } from '../core/circuit.js';
import { browserStore, folderStore, projectOps } from '../web/js/project-store.js';
import { fakeDirectory } from './fixtures/fs-access-fake.js';
import { memStorage } from './fixtures/mem-storage.js';
import { scratchEnv } from './server-helpers.js';

let tmp, P;
before(async () => { tmp = await scratchEnv('silinx-doc-format-'); P = await import('../server/projects.js'); });
after(() => fs.rm(tmp, { recursive: true, force: true }));

test('each drawing\'s version: the one its module writes, new and normalized; silinx.json\'s, New Project\'s', async () => {
  for (const [file, made, norm] of [['a.sch.json', newDoc(), normalizeDoc], ['a.fsm.json', newFsm(), normalizeFsm], ['a.asm.json', newModel(), normalizeModel],
    ['a.tt.json', newTable(), normalizeTable], ['a.bool.json', newTable(), normalizeTable], ['a.pn.json', newPetri(), normalizePetri], ['a.circ.json', newCircuit(), normalizeCircuit]]) {
    assert.equal(formatVersion(file), made.version, file);
    assert.equal(norm(made).version, made.version, `${file}: normalized`);
  }
  assert.equal(formatVersion('src/top.vhd'), null);
  assert.equal(formatVersion('silinx.json'), null);
  await P.createProject({ name: 'Fresh' });
  assert.equal((await P.readProject('Fresh')).version, PROJECT_VERSION);
});

test('a drawing a newer Silinx saved: known, said; the same or an older one: not', () => {
  assert.equal(newerDrawing('src/a.sch.json', { version: 7 }), null);
  assert.equal(newerDrawing('src/a.sch.json', { version: 3 }), null);
  assert.equal(newerDrawing('src/a.sch.json', {}), null);
  assert.equal(newerDrawing('src/a.vhd', { version: 99 }), null);
  assert.deepEqual(newerDrawing('src/a.sch.json', { version: 8 }), { version: 8, supported: 7,
    message: 'a.sch.json was saved by a newer Silinx (its format 8; this one reads up to 7): opened read-only, so that it is not saved in the older format and loses nothing: update Silinx to change it' });
  assert.equal(newerDrawing('m.fsm.json', { version: '2' }).version, 2);
  assert.equal(newerProject({ version: PROJECT_VERSION }), null);
  assert.equal(newerProject({}), null);
  assert.equal(newerProject({ version: 2 }), 'the project was saved by a newer Silinx (its format 2; this one reads up to 1): what that Silinx added to it may be lost when it is saved here: update Silinx');
});

test('downgradeRefusal: a newer drawing written over in an older format, refused; in its own or newer, a new one, any other file: not', () => {
  // (a symbol's field this Silinx does not know: dropped by normalizeDoc, which rebuilds each symbol from its own)
  const newer = JSON.stringify({ version: 9, symbols: [{ id: 's1', type: 'and2', x: 0, y: 0, future: { x: 1 } }], wires: [] });
  const older = JSON.stringify(normalizeDoc(JSON.parse(newer)));
  assert.equal(JSON.parse(older).symbols[0].future, undefined, 'what normalizeDoc drops: why it is refused');
  assert.equal(downgradeRefusal('src/a.sch.json', newer, older),
    "'src/a.sch.json' was saved by a newer Silinx (its format 9; this one writes 7): not written in the older format, which would lose what that Silinx added: update Silinx to change it");
  assert.equal(downgradeRefusal('src/a.sch.json', newer, newer), null, 'as it is (its version kept)');
  assert.equal(downgradeRefusal('src/a.sch.json', newer, JSON.stringify({ version: 10 })), null);
  assert.equal(downgradeRefusal('src/a.sch.json', null, older), null, 'a new file');
  assert.equal(downgradeRefusal('src/a.sch.json', older, older), null);
  assert.equal(downgradeRefusal('src/a.sch.json', 'not json', older), null);
  assert.equal(downgradeRefusal('src/a.vhd', newer, older), null);
});

test('#4756 the local server: a newer drawing not written over in an older format (409), the file kept; its own format written', async () => {
  await P.createProject({ name: 'Newer' });
  const newer = `${JSON.stringify({ ...newFsm('m'), version: 3, lanes: ['a future field'] }, null, 2)}\n`;
  await fs.writeFile(path.join(P.projectDir('Newer'), 'src', 'm.fsm.json'), newer);
  const older = JSON.stringify(normalizeFsm(JSON.parse(newer)));
  await assert.rejects(P.writeFile('Newer', 'src/m.fsm.json', older), (e) => e.status === 409 && /^'src\/m\.fsm\.json' was saved by a newer Silinx \(its format 3; this one writes 1\)/.test(e.message));
  assert.equal(await fs.readFile(path.join(P.projectDir('Newer'), 'src', 'm.fsm.json'), 'utf8'), newer, 'kept');
  await P.writeFile('Newer', 'src/m.fsm.json', newer.replace('a future field', 'changed'));
  await P.writeFile('Newer', 'src/n.fsm.json', older);
});

test('#4756 the browser edition\'s stores: a newer drawing not written over in an older format', async () => {
  for (const store of [browserStore(memStorage()), folderStore(fakeDirectory('Silinx-projects'))]) {
    const ops = projectOps(() => store);
    await ops.create({ name: 'Newer', template: 'empty' });
    const newer = JSON.stringify({ ...newPetri('p'), version: 4 });
    await ops.writeFile('Newer', 'src/p.pn.json', newer);
    await assert.rejects(ops.writeFile('Newer', 'src/p.pn.json', JSON.stringify(normalizePetri(JSON.parse(newer)))), (e) => e.status === 409 && /was saved by a newer Silinx \(its format 4; this one writes 1\)/.test(e.message));
    assert.equal(await ops.readFile('Newer', 'src/p.pn.json'), newer, `${store.kind}: kept`);
  }
});
