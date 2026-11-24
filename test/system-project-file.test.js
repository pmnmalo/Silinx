// A new System project's System document (#4702) is written inside the project's folder, through safeJoin as every
// project path (#5344): its name is the project's, which projectDir's rule checks first; a name that would carry a path
// is refused before anything is written.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-system-project-file-test-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');

const listing = () => fs.readdirSync(tmp, { recursive: true }).sort();

test('#5344 a System project: its System document in its own folder', async () => {
  await P.createProject({ name: 'cd1', kind: 'system' });
  const dir = P.projectDir('cd1');
  assert.ok(fs.existsSync(path.join(dir, 'cd1.sys.json')));
  const pj = await P.readProject('cd1');
  assert.equal(pj.kind, 'system');
});

test('#5344 a System project whose name carries a path: refused, nothing written', async () => {
  const before = listing();
  for (const name of ['../out', 'a/b', 'a\\b', '..', '/tmp/x', 'x/../../y']) {
    await assert.rejects(P.createProject({ name, kind: 'system' }),
      { status: 400, message: `invalid project name '${name}': a letter, then up to 63 letters, digits, - and _` }, name);
  }
  assert.deepEqual(listing(), before);
});

test('#5411 a System project saved with the old kind id (codesign): read as a System project, written with the new id', async () => {
  await P.createProject({ name: 'old1', kind: 'system' });
  const file = path.join(P.projectDir('old1'), 'silinx.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), kind: 'codesign' }, null, 2));
  assert.equal((await P.readProject('old1')).kind, 'system');
  assert.equal((await P.listProjects()).find(p => p.name === 'old1').kind, 'system');
  await P.updateProject('old1', pj => ({ ...pj, simTop: '' }));
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).kind, 'system');
  // (the browser edition's reading, and the predicate every reader uses)
  const { normalizeProjectJson } = await import('../web/js/project-store.js');
  const { isSystemProject, withKind } = await import('../core/project-kind.js');
  assert.deepEqual([normalizeProjectJson({ name: 'old1', kind: 'codesign' }, 'old1').json.kind, isSystemProject({ kind: 'codesign' }), isSystemProject({ kind: 'system' }),
    isSystemProject({ kind: 'design' }), withKind({ kind: 'fpga' }).kind], ['system', true, true, false, 'fpga']);
});
