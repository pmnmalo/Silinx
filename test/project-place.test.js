// Where a project is kept (#4314): core/project-place.js's words (Open Project's Stored In column and tip, list_projects)
// and server/project-places.js, the server's list with each project's place: the workspace folder, its GitHub
// repository (its own repository's origin, the workspace's for a repository of several projects, none for another
// host's or with git off).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { STORED_LABEL, placeLines, placeText } from '../core/project-place.js';

test('placeLines / placeText: the storage, then the GitHub repository', () => {
  assert.deepEqual(STORED_LABEL, { folder: 'Workspace Folder', browser: 'Browser Storage' });
  assert.deepEqual(placeLines({ stored: 'folder', github: null }), ['Workspace Folder']);
  assert.deepEqual(placeLines({ stored: 'browser', github: 'course/lab1' }), ['Browser Storage', 'GitHub: course/lab1']);
  assert.equal(placeText({ stored: 'folder' }), 'Kept in the workspace folder.');
  assert.equal(placeText({ stored: 'folder', github: 'course/lab1' }), 'Kept in the workspace folder, in the GitHub repository course/lab1.');
  assert.equal(placeText({ stored: 'browser', github: 'a/b' }), 'Kept in this browser\'s storage, in the GitHub repository a/b.');
});

let tmp, ws, P, withPlaces;
const git = (cwd, ...a) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-place-'));
  ws = path.join(tmp, 'ws');
  process.env.SILINX_WORKSPACE = ws;
  P = await import('../server/projects.js');
  ({ withPlaces } = await import('../server/project-places.js'));
  for (const n of ['Local', 'Repo', 'Other']) await P.createProject({ name: n, template: 'empty' });
  git(path.join(ws, 'Repo'), 'init', '-q');
  git(path.join(ws, 'Repo'), 'remote', 'add', 'origin', 'https://github.com/course/repo.git');
  // (a remote that is not GitHub's: no repository said)
  git(path.join(ws, 'Other'), 'init', '-q');
  git(path.join(ws, 'Other'), 'remote', 'add', 'origin', 'https://gitlab.com/course/other.git');
});
after(() => { delete process.env.SILINX_GIT; fs.rmSync(tmp, { recursive: true, force: true }); });

const places = async () => (await withPlaces(await P.listProjects())).map(p => [p.name, p.stored, p.github]);

test('withPlaces: the workspace folder for each, the GitHub repository of the one in it', async () => {
  assert.deepEqual(await places(), [['Local', 'folder', null], ['Other', 'folder', null], ['Repo', 'folder', 'course/repo']]);
  // the list's own fields kept
  const [local] = await withPlaces(await P.listProjects());
  assert.equal(local.name, 'Local');
  assert.ok(local.modified > 0 && 'device' in local);
});

test('withPlaces: git off (SILINX_GIT=off): no repository said', async () => {
  process.env.SILINX_GIT = 'off';
  try { assert.deepEqual(await places(), [['Local', 'folder', null], ['Other', 'folder', null], ['Repo', 'folder', null]]); }
  finally { delete process.env.SILINX_GIT; }
});

test('withPlaces: no project, an empty list', async () => {
  assert.deepEqual(await withPlaces([]), []);
});
