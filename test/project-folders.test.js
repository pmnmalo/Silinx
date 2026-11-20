// Project folders (#4755): a silinx.json with a byte order mark is read; one that is no description lists its project
// as damaged (its name taken, opened with why), never hidden nor written over as a new one; a write, rename or deletion
// after Delete Project or Rename Project is refused, never makes the folder again; two renames crossed (A to B, B to A
// in another process) never wait for each other for ever.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseDescription } from '../core/project-json.js';
import { gateEntries } from '../core/import-gate.js';
import { scratchEnv, sleep } from './server-helpers.js';

let tmp, P, L;
before(async () => {
  tmp = await scratchEnv('silinx-project-folders-');
  P = await import('../server/projects.js');
  L = await import('../server/project-lock.js');
});
after(() => fs.rm(tmp, { recursive: true, force: true }));
const has = async p => fs.access(p).then(() => true, () => false);
const descOf = name => path.join(P.projectDir(name), 'silinx.json');

test('parseDescription: a byte order mark skipped; not JSON, the parser\'s error', () => {
  assert.deepEqual(parseDescription('﻿{"a":1}'), { a: 1 });
  assert.deepEqual(parseDescription('{"a":1}'), { a: 1 });
  assert.deepEqual(parseDescription(' \n{"top":"x"}\n'), { top: 'x' });
  assert.throws(() => parseDescription('﻿﻿{}'), SyntaxError, 'one mark only: a second one is text');
  assert.throws(() => parseDescription('<<<<<<< HEAD\n{}'), SyntaxError);
  assert.throws(() => parseDescription(''), SyntaxError);
});

test('a silinx.json saved with a byte order mark: listed, opened, written to as any project', async () => {
  await P.createProject({ name: 'Bom' });
  const text = await fs.readFile(descOf('Bom'), 'utf8');
  await fs.writeFile(descOf('Bom'), `﻿${text}`);
  const row = (await P.listProjects()).find(p => p.name === 'Bom');
  assert.ok(row && !row.damaged && row.device, 'listed as a project, its device read');
  assert.equal((await P.readProject('Bom')).name, 'Bom');
  await P.writeFile('Bom', 'src/a.vhd', 'entity a is end;\n');
  assert.deepEqual((await P.readProject('Bom')).files.map(f => f.path), ['src/a.vhd']);
  assert.notEqual((await fs.readFile(descOf('Bom'), 'utf8')).charCodeAt(0), 0xfeff, 'written back without it');
});

test('a silinx.json that is no description: listed damaged with why, opened with why, never written over', async () => {
  await P.createProject({ name: 'Damaged' });
  await fs.writeFile(descOf('Damaged'), '<<<<<<< HEAD\n{"top":"a"}\n=======\n{"top":"b"}\n>>>>>>> theirs\n');
  const row = (await P.listProjects()).find(p => p.name === 'Damaged');
  assert.equal(Object.keys(row).sort().join(), 'damaged,modified,name');
  assert.match(row.damaged, /^its silinx\.json cannot be read: .*JSON/);
  await assert.rejects(P.readProject('Damaged'), e => e.status === 422
    && /^the project 'Damaged' is damaged: its silinx\.json cannot be read: .* \(correct it in a text editor, or delete the project\)$/.test(e.message));
  // (an array, a number: no description either)
  await fs.writeFile(descOf('Damaged'), '[1, 2]');
  assert.match((await P.listProjects()).find(p => p.name === 'Damaged').damaged, /cannot be read: not an object$/);
  // its name taken: a new project of that name refused; the page's description never written over it as a new project's
  await assert.rejects(P.createProject({ name: 'damaged' }), e => e.status === 409);
  await assert.rejects(P.writeProject('Damaged', { name: 'Damaged', files: [] }), e => e.status === 422);
  assert.equal(await fs.readFile(descOf('Damaged'), 'utf8'), '[1, 2]', 'kept as it was');
  // deleted as any project
  await P.deleteProject('Damaged');
  assert.equal((await P.listProjects()).some(p => p.name === 'Damaged'), false);
});

test('#4755 after Delete Project: a write, a rename, a deletion of its files refused (404), its folder not made again', async () => {
  await P.createProject({ name: 'Gone' });
  await P.writeFile('Gone', 'src/a.vhd', 'entity a is end;\n');
  const dir = P.projectDir('Gone');
  await P.deleteProject('Gone');
  await assert.rejects(P.writeFile('Gone', 'src/b.vhd', '--\n'), e => e.status === 404 && e.message === "project 'Gone' not found");
  assert.equal(await has(dir), false, 'the folder not made again by the write');
  await assert.rejects(P.renameFile('Gone', 'src/a.vhd', 'src/c.vhd'), e => e.status === 404);
  await assert.rejects(P.deleteFile('Gone', 'src/a.vhd'), e => e.status === 404);
  assert.equal(await has(dir), false);
  // a write and a deletion at once: whichever comes first, no folder left after both
  await P.createProject({ name: 'Race' });
  const both = await Promise.allSettled([P.writeFile('Race', 'src/r.vhd', '--\n'), P.deleteProject('Race'), P.writeFile('Race', 'src/s.vhd', '--\n')]);
  assert.equal(both[1].status, 'fulfilled');
  assert.equal(await has(P.projectDir('Race')), false);
  for (const r of [both[0], both[2]]) if (r.status === 'rejected') assert.equal(r.reason.status, 404);
});

test('after Rename Project: a write to the old name refused, the old folder not made again', async () => {
  await P.createProject({ name: 'Before' });
  await P.renameProject('Before', 'After');
  await assert.rejects(P.writeFile('Before', 'src/x.vhd', '--\n'), e => e.status === 404);
  assert.equal(await has(P.projectDir('Before')), false);
  await P.writeFile('After', 'src/x.vhd', '--\n');
  assert.deepEqual((await P.readProject('After')).files.map(f => f.path), ['src/x.vhd']);
});

test('#4755 crossed renames: B to A here while another process, holding A, waits for B: both end', { timeout: 20_000 }, async () => {
  await P.createProject({ name: 'Beta' });
  const ws = P.workspaceDir();
  let other;
  // (another process's rename A to B, as it takes its locks: A's first, then B's)
  const held = new Promise(r => {
    other = L.withFileLock(ws, 'alpha', async () => { r(); await sleep(200); return L.withFileLock(ws, 'beta', async () => 'other done'); });
  });
  await held;
  const mine = P.renameProject('Beta', 'Alpha');
  assert.equal(await other, 'other done');
  assert.deepEqual(await mine, { name: 'Alpha' });
  assert.equal((await P.readProject('Alpha')).name, 'Alpha');
});

test('an import whose silinx.json is no JSON: a warning, the project made with its sources', async () => {
  const { importProjectEntries } = await import('../server/project-zip.js');
  const enc = s => new TextEncoder().encode(s);
  const res = await importProjectEntries(P, 'Imported', gateEntries([{ path: 'silinx.json', data: enc('{oops') }, { path: 'src/top.vhd', data: enc('entity top is end;\n') }]), m => new Error(m));
  assert.ok(res.warnings.some(w => /^silinx\.json: not read \(.*\): its settings not restored$/.test(w)), res.warnings.join('\n'));
  assert.ok(await has(path.join(P.projectDir('Imported'), 'src', 'top.vhd')));
  assert.ok(!(await P.listProjects()).find(p => p.name === 'Imported').damaged);
});
