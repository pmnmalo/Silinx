// Project writes (#4758): every write of a project's file whole or not at all and on the disk before it is renamed in
// (writeAtomic, its temporary file flushed: fsync); an import that fails halfway leaves no project (the import done
// again, no 409); the .trash emptied of what was deleted more than TRASH_DAYS days ago (the server's and the browser
// edition's folder store), a deleted project's build/ not kept, a rename's folder a crash left moved into it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TRASH_DAYS, trashTime, expiredTrash } from '../core/trash.js';
import { gateEntries } from '../core/import-gate.js';
import { fakeDirectory, dump } from './fixtures/fs-access-fake.js';
import { folderStore, projectOps } from '../web/js/project-store.js';
import { scratchEnv } from './server-helpers.js';

let tmp, P;
before(async () => { tmp = await scratchEnv('silinx-project-writes-'); P = await import('../server/projects.js'); });
after(() => fs.rm(tmp, { recursive: true, force: true }));
const DAY = 24 * 60 * 60 * 1000;
const has = async p => fs.access(p).then(() => true, () => false);
const enc = s => new TextEncoder().encode(s);

// the file handles flushed while fn runs (FileHandle.prototype.sync counted)
async function syncs(fn) {
  const fh = await fs.open(path.join(tmp, 'probe'), 'w');
  const proto = Object.getPrototypeOf(fh);
  await fh.close();
  const real = proto.sync;
  let n = 0;
  proto.sync = function (...a) { n++; return real.apply(this, a); };
  try { await fn(); } finally { proto.sync = real; }
  return n;
}
const tempsIn = async dir => (await fs.readdir(dir, { recursive: true })).filter(f => /\.tmp$/.test(f));

test('trash: the time in an entry\'s name; older than TRASH_DAYS, emptied; a name of no time, never', () => {
  assert.equal(TRASH_DAYS, 30);
  const now = Date.UTC(2026, 10, 20);
  assert.equal(trashTime(`blinky-${now}`), now);
  assert.equal(trashTime(`blinky-${now}-2`), now);
  assert.equal(trashTime(`my-proj-2-${now}`), now, 'a name with dashes and digits of its own');
  assert.equal(trashTime('blinky'), null);
  assert.equal(trashTime('blinky-12'), null, 'a short number is the name\'s, not a time');
  assert.equal(expiredTrash(`a-${now - 31 * DAY}`, now), true);
  assert.equal(expiredTrash(`a-${now - 29 * DAY}`, now), false);
  assert.equal(expiredTrash(`a-${now - 30 * DAY}`, now), false, 'thirty days exactly: kept');
  assert.equal(expiredTrash('notes', now), false);
  assert.equal(expiredTrash(`a-${now - 2 * DAY}`, now, 1), true, 'another number of days');
});

test('#4758 a file, the description, the merge\'s backup, an import\'s files: flushed to the disk, no temporary file left', async () => {
  await P.createProject({ name: 'Synced' });
  const dir = P.projectDir('Synced');
  assert.ok(await syncs(() => P.writeFile('Synced', 'src/a.vhd', 'entity a is end;\n')) >= 2, 'the file and the description');
  assert.equal(await syncs(() => P.writeAtomic(path.join(dir, 'notes.txt'), 'x')), 1);
  assert.equal(await syncs(() => P.updateProject('Synced', pj => ({ ...pj, top: 'a' }))), 1);
  const { mergeStorage } = await import('../server/merge-projects.js');
  assert.equal(await syncs(() => mergeStorage(P).backup.set('Synced', { files: {} })), 1);
  const { importProjectEntries } = await import('../server/project-zip.js');
  const files = [['silinx.json', JSON.stringify({ name: 'x', files: [{ path: 'src/b.vhd', lang: 'vhdl' }] })], ['src/b.vhd', 'entity b is end;\n'], ['doc/n.txt', 'n']];
  assert.ok(await syncs(() => importProjectEntries(P, 'SyncedZip', gateEntries(files.map(([p, t]) => ({ path: p, data: enc(t) }))), m => new Error(m))) >= 4);
  assert.deepEqual(await tempsIn(dir), []);
  assert.deepEqual(await tempsIn(P.projectDir('SyncedZip')), []);
});

test('#4758 an import that fails halfway: no project left; done again, imported', async () => {
  const { importProjectEntries } = await import('../server/project-zip.js');
  const entries = () => gateEntries([['silinx.json', '{"files":[]}'], ['src/a.vhd', '--a\n'], ['src/b.vhd', '--b\n']].map(([p, t]) => ({ path: p, data: enc(t) })));
  // (the disk full at its second file)
  const failing = { ...P, writeAtomic: (f, ...a) => (/b\.vhd$/.test(f) ? Promise.reject(Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })) : P.writeAtomic(f, ...a)) };
  await assert.rejects(importProjectEntries(failing, 'Half', entries(), m => new Error(m)), /ENOSPC/);
  assert.equal(await has(P.projectDir('Half')), false, 'no half-built project');
  assert.equal((await P.listProjects()).some(p => p.name === 'Half'), false);
  const done = await importProjectEntries(P, 'Half', entries(), m => new Error(m));
  assert.deepEqual(done.extra.sort(), ['src/a.vhd', 'src/b.vhd']);
  // a project that was there: kept as it was when an import into it fails (its 409)
  await assert.rejects(importProjectEntries(P, 'Half', entries(), m => new Error(m)), e => e.status === 409);
  assert.equal(await fs.readFile(path.join(P.projectDir('Half'), 'src', 'b.vhd'), 'utf8'), '--b\n');
});

test('#4758 the .trash: a deleted project without its build/; what was deleted long ago emptied; a rename\'s left folder kept in it', async () => {
  const ws = P.workspaceDir(), trash = path.join(ws, '.trash');
  await fs.mkdir(trash, { recursive: true });
  const old = `Old-${Date.now() - 40 * DAY}`, recent = `Recent-${Date.now() - 2 * DAY}`, other = 'kept-by-hand';
  for (const n of [old, recent, other]) await fs.mkdir(path.join(trash, n, 'src'), { recursive: true });
  // (a Rename Project a crash stopped: its hidden folder, the project whole, two hours old; a new one, in progress)
  const crashed = `.rename-Moved-${Date.now() - 2 * 60 * 60 * 1000}`, running = `.rename-Now-${Date.now()}`;
  for (const n of [crashed, running]) await fs.mkdir(path.join(ws, n), { recursive: true });
  await P.createProject({ name: 'Built' });
  await fs.mkdir(path.join(P.projectDir('Built'), 'build'), { recursive: true });
  await fs.writeFile(path.join(P.projectDir('Built'), 'build', 'top.bit'), 'x');
  await P.deleteProject('Built');
  const now = await fs.readdir(trash);
  const built = now.find(n => /^Built-\d+$/.test(n));
  assert.ok(built, now.join(' '));
  assert.deepEqual((await fs.readdir(path.join(trash, built))).includes('build'), false, 'its build/ not kept');
  assert.ok(await has(path.join(trash, built, 'silinx.json')));
  assert.equal(now.includes(old), false, 'forty days old: emptied');
  assert.ok(now.includes(recent) && now.includes(other));
  assert.ok(now.includes(crashed.slice('.rename-'.length)), 'the crashed rename\'s folder: in the .trash');
  assert.ok(await has(path.join(ws, running)), 'a rename in progress left alone');
  // a file deleted into the .trash empties it too
  const older = `Older-${Date.now() - 31 * DAY}`;
  await fs.mkdir(path.join(trash, older));
  await P.createProject({ name: 'Files' });
  await P.writeFile('Files', 'src/x.vhd', '--\n');
  await P.deleteFile('Files', 'src/x.vhd', { trash: true });
  assert.equal(await has(path.join(trash, older)), false);
  // emptyTrash at another time: the recent one too
  await P.emptyTrash(Date.now() + 40 * DAY);
  assert.deepEqual((await fs.readdir(trash)).sort(), [other]);
});

test('#4758 the browser edition\'s folder: a deleted project without its build/, what was deleted long ago emptied', async () => {
  const root = fakeDirectory('Silinx-projects');
  const store = folderStore(root), ops = projectOps(() => store);
  await ops.create({ name: 'Aaa', template: 'empty' });
  await ops.writeFile('Aaa', 'build/top.bit', 'x');
  await ops.writeFile('Aaa', 'src/top.vhd', 'entity top is end;\n');
  const trash = await root.getDirectoryHandle('.trash', { create: true });
  const old = `Gone-${Date.now() - 31 * DAY}`, recent = `Kept-${Date.now() - DAY}`;
  for (const n of [old, recent]) await (await trash.getDirectoryHandle(n, { create: true })).getFileHandle('a.txt', { create: true });
  await ops.deleteProject('Aaa');
  const tree = Object.keys(await dump(root));
  const aaa = tree.find(k => /^\.trash\/Aaa-\d+\/$/.test(k));
  assert.ok(aaa, tree.join(' '));
  assert.ok(tree.includes(`${aaa}src/top.vhd`));
  assert.equal(tree.some(k => k.startsWith(`${aaa}build`)), false, 'its build/ not kept');
  assert.equal(tree.some(k => k.startsWith(`.trash/${old}`)), false, 'emptied');
  assert.ok(tree.includes(`.trash/${recent}/a.txt`));
});
