// The browser edition's trust records (#4735, web/js/trust-records.js, web/js/project-store.js): a project of a folder on
// the disk (Open Workspace Folder…) is trusted only with this browser's record of it. The first time, the folder's
// projects trusted until then are recorded once; then the user's own projects (New Project, an example) and the ones
// they trust are recorded, an import's is not; a project put in the folder by hand (unzipped, cloned, restored) is
// untrusted, its mark never written into its silinx.json; a rename takes the record along, a delete removes it. The
// browser's own storage needs none. On fake File System Access handles (test/fixtures/fs-access-fake.js).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDirectory } from './fixtures/fs-access-fake.js';
import { browserStore, folderStore, projectOps, projectJsonText } from '../web/js/project-store.js';
import { isTrusted, UNRECORDED } from '../core/trust.js';

const mem = new Map();
const storage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), get length() { return mem.size; }, key: i => [...mem.keys()][i] ?? null };
globalThis.localStorage = storage;
beforeEach(() => mem.clear());

// a project folder put there by hand (unzipped by the system, copied): its silinx.json as given
async function byHand(root, name, extra = {}) {
  const dir = await root.getDirectoryHandle(name, { create: true });
  const w = await (await dir.getFileHandle('silinx.json', { create: true })).createWritable();
  await w.write(projectJsonText(name, { name, version: 1, device: { family: 'spartan3e', part: 'xc3s100e', package: 'cp132', speed: '-4' }, board: null, top: '', simTop: '', files: [], ...extra }));
  await w.close();
}
const onDisk = async (root, name) => JSON.parse(await (await (await (await root.getDirectoryHandle(name)).getFileHandle('silinx.json')).getFile()).text());
const setUp = () => { const root = fakeDirectory('Silinx-projects'); const store = folderStore(root); return { root, store, ops: projectOps(() => store) }; };
const trusted = async (ops, name) => isTrusted(await ops.project(name));

test('#4735 a folder\'s projects: the migration once; the user\'s own recorded, one put there by hand untrusted (nothing written), Trust Project, rename, delete', async () => {
  const { root, ops } = setUp();
  await byHand(root, 'Old');
  await byHand(root, 'Imported', { trusted: false });
  assert.deepEqual([await trusted(ops, 'Old'), await trusted(ops, 'Imported')], [true, false]);
  // (once: a project put there afterwards is not migrated)
  await byHand(root, 'Unzipped');
  const pj = await ops.project('Unzipped');
  assert.deepEqual([pj.trusted, pj.madeBy], [false, UNRECORDED]);
  await ops.saveProject('Unzipped', { ...pj, top: 'x' });
  assert.deepEqual([(await onDisk(root, 'Unzipped')).trusted, (await onDisk(root, 'Unzipped')).madeBy, (await onDisk(root, 'Unzipped')).top], [undefined, undefined, 'x']);
  assert.equal(await trusted(ops, 'Unzipped'), false);
  await ops.trustProject('Unzipped');
  assert.equal(await trusted(ops, 'Unzipped'), true);
  // the user's own: recorded; an import (put): not
  await ops.create({ name: 'Mine' });
  await ops.put('FromZip', { name: 'FromZip', version: 1, files: [] }, {});
  assert.deepEqual([await trusted(ops, 'Mine'), await trusted(ops, 'FromZip')], [true, false]);
  assert.equal((await onDisk(root, 'Mine')).trusted, undefined);
  // a rename takes the record along; the old name's folder made again by hand: untrusted
  await ops.renameProject('Mine', 'Ours');
  assert.equal(await trusted(ops, 'Ours'), true);
  await byHand(root, 'Mine');
  assert.equal(await trusted(ops, 'Mine'), false);
  // a delete removes it: a folder put back at its place is untrusted
  await ops.deleteProject('Ours');
  await byHand(root, 'Ours');
  assert.equal(await trusted(ops, 'Ours'), false);
  // another folder of the same browser: no migration (it was done once)
  const other = fakeDirectory('Downloaded');
  await byHand(other, 'Lab');
  assert.equal(isTrusted(await projectOps(() => folderStore(other)).project('Lab')), false);
});

test('#4735 a record with an id: another id at its place is untrusted', async () => {
  const { root, ops } = setUp();
  await ops.create({ name: 'First' });   // (the migration: none to record)
  await byHand(root, 'WithId', { id: 'b'.repeat(22) });
  await ops.trustProject('WithId');
  assert.equal(await trusted(ops, 'WithId'), true);
  await byHand(root, 'WithId', { id: 'c'.repeat(22) });
  assert.equal(await trusted(ops, 'WithId'), false);
});

test('#4735 the browser\'s own storage: no records needed (nothing but Silinx writes it)', async () => {
  const store = browserStore(() => storage), ops = projectOps(() => store);
  await ops.create({ name: 'Mine' });
  assert.equal(await trusted(ops, 'Mine'), true);
  assert.equal(mem.has('silinx.trust.folders'), false);
});
