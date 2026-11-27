// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// Delete of projects (#5785): Open Project's Delete and the MCP's delete_project share their checks and messages
// (core/project-delete.js: the question, the console's lines, the refusals); the server's checked delete
// (server/project-delete.js: a process running refused, a project shared refused, then its folder in the .trash), and
// the browser's stores (the browser's storage: gone; a workspace folder on the disk: into its .trash).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { fakeDirectory, dump } from './fixtures/fs-access-fake.js';
import { memStorage } from './fixtures/mem-storage.js';
import { closedMessage, deletedMessage, deleteList, deleteQuestion, followedProblem, runningProblem, sharedProblem } from '../core/project-delete.js';
import { browserStore, folderStore, projectOps } from '../web/js/project-store.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-delete-project-'); });
after(async () => { await fsp.rm(tmp, { recursive: true, force: true }); });
const P = await import('../server/projects.js');
const { checkDelete, deleteProjectChecked } = await import('../server/project-delete.js');
const { createJob } = await import('../server/jobs.js');

const rejects = (p, status, message) => assert.rejects(p, e => { assert.equal(e.message, message); if (status) assert.equal(e.status, status); return true; });

test('the messages: deleted (into the .trash, or gone), closed, the refusals', () => {
  assert.equal(deletedMessage('a'), 'Project \'a\' deleted (moved to the workspace\'s .trash folder).');
  assert.equal(deletedMessage('a', { trash: false }), 'Project \'a\' deleted.');
  assert.equal(closedMessage('a'), 'Project \'a\' closed, to be deleted.');
  assert.equal(runningProblem('a'), '\'a\' is not deleted while a process of it runs: stop it (or wait for it to finish) first');
  assert.equal(sharedProblem('a'), '\'a\' is not deleted while it is shared live: stop sharing it first');
  assert.equal(followedProblem('a'), '\'a\' is another person\'s project, followed live: it is not deleted');
});

test('the question: one project named, several listed, where they go, the open one closed first, that it cannot be undone', () => {
  assert.equal(deleteQuestion(['a']), 'Delete the project \'a\'?\n\nIts folder is moved to the workspace\'s .trash folder.\nThis cannot be undone.');
  assert.equal(deleteQuestion(['a'], { trash: false }), 'Delete the project \'a\'?\n\nIt is deleted from this browser\'s storage.\nThis cannot be undone.');
  assert.equal(deleteQuestion(['a', 'b'], { open: 'b' }), 'Delete these 2 projects?\n\'a\'\n\'b\'\n\nTheir folders are moved to the workspace\'s .trash folder.\n\'b\' is open: it is closed first.\nThis cannot be undone.');
  assert.equal(deleteQuestion(['a', 'b', 'c'], { trash: false, open: 'z' }), 'Delete these 3 projects?\n\'a\'\n\'b\'\n\'c\'\n\nThey are deleted from this browser\'s storage.\nThis cannot be undone.');
});

test('deleteList: each project once in any case, in its order; none an error', () => {
  assert.deepEqual(deleteList(['b', 'a', 'B', 'a']), ['b', 'a']);
  assert.deepEqual(deleteList(['x']), ['x']);
  assert.throws(() => deleteList([]), { message: 'no project to delete' });
  assert.throws(() => deleteList(undefined), { message: 'no project to delete' });
});

test('the server: a process running refused, a project shared refused, then deleted into the .trash; a missing one, an invalid name', async () => {
  await P.createProject({ name: 'k1' });
  let end;
  const running = new Promise(r => { end = r; });
  const job = createJob('implement', () => running, { meta: { project: 'K1' } });
  await rejects(deleteProjectChecked('k1'), 409, runningProblem('k1'));
  assert.throws(() => checkDelete('k1'), { message: runningProblem('k1') });
  end();
  while (job.status === 'running') await new Promise(r => setTimeout(r, 5));
  await rejects(deleteProjectChecked('k1', { shared: n => n === 'k1' }), 409, sharedProblem('k1'));
  assert.ok(fs.existsSync(P.projectDir('k1')));
  assert.deepEqual(await deleteProjectChecked('k1'), { name: 'k1', message: deletedMessage('k1') });
  assert.ok(!fs.existsSync(P.projectDir('k1')));
  const trashed = fs.readdirSync(path.join(P.workspaceDir(), '.trash'));
  assert.equal(trashed.filter(n => /^k1-\d+$/.test(n)).length, 1);
  await rejects(deleteProjectChecked('k1'), 404, 'not found');
  await rejects(deleteProjectChecked('1k'), 400, 'invalid project name \'1k\': a letter, then up to 63 letters, digits, - and _');
});

const JSON0 = { version: 1, device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, board: null, top: 'top', simTop: '', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], constraints: null };
const FILES = { 'src/top.vhd': 'entity top is end;\narchitecture a of top is begin end;\n' };

test('the browser\'s storage: the projects deleted one after another, the others kept; a missing one said', async () => {
  const st = memStorage();
  const store = browserStore(st), ops = projectOps(() => store);
  for (const n of ['p', 'q', 'r']) await store.create(n, JSON0, FILES);
  for (const n of deleteList(['p', 'r'])) assert.deepEqual(await ops.deleteProject(n), { ok: true });
  assert.deepEqual((await browserStore(st).list()).map(p => p.name), ['q']);
  await assert.rejects(ops.deleteProject('p'), { message: 'project \'p\' not found' });
});

test('a workspace folder on the disk: each project\'s folder into its .trash, the others kept', async () => {
  const root = fakeDirectory('Silinx-projects');
  const store = folderStore(root), ops = projectOps(() => store);
  for (const n of ['p', 'q']) await store.create(n, JSON0, FILES);
  await ops.deleteProject('p');
  assert.deepEqual((await store.list()).map(p => p.name), ['q']);
  const files = Object.keys(await dump(root));
  assert.ok(files.some(f => /^\.trash\/p-\d+\/src\/top\.vhd$/.test(f)), files.join(', '));
  assert.ok(files.includes('q/src/top.vhd'));
});
