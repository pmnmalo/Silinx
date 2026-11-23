// A new co-design project's System document (#4702) is written inside the project's folder, through safeJoin as every
// project path (#5344): its name is the project's, which projectDir's rule checks first; a name that would carry a path
// is refused before anything is written.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-codesign-system-file-test-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');

const listing = () => fs.readdirSync(tmp, { recursive: true }).sort();

test('#5344 a co-design project: its System document in its own folder', async () => {
  await P.createProject({ name: 'cd1', kind: 'codesign' });
  const dir = P.projectDir('cd1');
  assert.ok(fs.existsSync(path.join(dir, 'cd1.sys.json')));
  const pj = await P.readProject('cd1');
  assert.equal(pj.kind, 'codesign');
});

test('#5344 a co-design project whose name carries a path: refused, nothing written', async () => {
  const before = listing();
  for (const name of ['../out', 'a/b', 'a\\b', '..', '/tmp/x', 'x/../../y']) {
    await assert.rejects(P.createProject({ name, kind: 'codesign' }),
      { status: 400, message: `invalid project name '${name}': a letter, then up to 63 letters, digits, - and _` }, name);
  }
  assert.deepEqual(listing(), before);
});
