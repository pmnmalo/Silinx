// silinx.json's version 2 (#5907, core/project-migrations.js, core/project-json.js migrateProject): what a project is
// written once, as its profile, never as the old kind beside it. Version 1's shapes (no kind, kind design, kind system,
// a profile, a processor board's System, no files) each migrated, the description given
// unchanged; every project of the repository (the examples, the test designs, the fixtures) in the same mode, profile
// and kind of project after its migration as before; the writers never write a kind; read through the migration in
// memory, written in version 2 on its next save, a version of the project kept before that save (the local server and
// the browser edition's stores), once; Rename Project leaves it as it was; the MCP's project_info says the same mode.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { projectV1toV2 } from '../core/project-migrations.js';
import { migrateProject, olderProject, parseDescription } from '../core/project-json.js';
import { newProjectJson, projectJsonText } from '../core/project-defaults.js';
import { PROJECT_VERSION } from '../core/doc-format.js';
import { profileOf, withProfile } from '../core/project-profile.js';
import { modeOf } from '../core/project-mode.js';
import { isDesignOnly, isSystemProject } from '../core/project-kind.js';
import { browserStore, folderStore, projectOps } from '../web/js/project-store.js';
import { fakeDirectory } from './fixtures/fs-access-fake.js';
import { memStorage } from './fixtures/mem-storage.js';
import { scratchEnv, ROOT } from './server-helpers.js';

test('version 1 → 2: each shape of before its profile, no kind, its files a list; the description given unchanged', () => {
  const cases = [
    [{ version: 1, name: 'f' }, 'fpga'],
    [{ version: 1, name: 'd', kind: 'design', board: null }, 'logic'],
    [{ version: 1, name: 's', kind: 'system', board: null }, 'system'],
    [{ version: 1, name: 'e', profile: 'embedded' }, 'embedded'],
    [{ version: 1, name: 'p', profile: 'system', board: 'arduino-uno' }, 'system'],   // (a processor board's Board project, #5756)
    [{ version: 1, name: 'c', profile: 'codesign', kind: 'design' }, 'logic'],   // (an id of before #5440: not read)
    [{ version: 1, name: 'k', profile: 'fpga', kind: 'design' }, 'fpga'],   // (its profile first, as profileOf reads it)
  ];
  for (const [pj, profile] of cases) {
    const before = structuredClone(pj);
    const v2 = projectV1toV2(pj);
    assert.deepEqual(pj, before, `${pj.name}: unchanged`);
    assert.deepEqual([v2.profile, 'kind' in v2, Array.isArray(v2.files)], [profile, false, true], pj.name);
    assert.equal(profileOf(v2), profileOf(pj), `${pj.name}: the same profile`);
    assert.equal(modeOf(v2), modeOf(pj), `${pj.name}: the same mode`);
  }
  assert.equal(modeOf(projectV1toV2(cases[4][0])), 'board', 'a processor board\'s: Board still');
  assert.deepEqual(projectV1toV2({ version: 1, files: [{ path: 'a.vhd' }] }), { version: 1, files: [{ path: 'a.vhd' }], profile: 'fpga' });
});

test('migrateProject: version 1 or none to 2; the current, a newer one, what is no description: as they are', () => {
  assert.equal(PROJECT_VERSION, 2);
  assert.deepEqual(migrateProject({ version: 1, name: 'd', kind: 'design' }), { version: 2, name: 'd', profile: 'logic', files: [] });
  assert.deepEqual(migrateProject({ name: 'n' }), { name: 'n', profile: 'fpga', files: [], version: 2 });
  for (const same of [{ version: 2, profile: 'logic', files: [] }, { version: 3, kind: 'design' }]) assert.equal(migrateProject(same), same);
  for (const x of [null, 'x', [1]]) assert.equal(migrateProject(x), x);
  assert.deepEqual([olderProject({ version: 1 }), olderProject({}), olderProject({ version: 2 }), olderProject({ version: 3 }), olderProject(null)], [true, true, false, false, false]);
  // (read migrated, or as stored)
  const text = '﻿{"version":1,"kind":"design"}';
  assert.deepEqual(parseDescription(text), { version: 2, profile: 'logic', files: [] });
  assert.deepEqual(parseDescription(text, { migrate: false }), { version: 1, kind: 'design' });
});

test('every project of the repository: the same mode, profile and kind of project after its migration; version 2, no kind', () => {
  const files = execFileSync('git', ['ls-files', '*silinx.json'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(files.length > 80, `${files.length} projects`);
  let kinds = 0;
  for (const f of files) {
    let pj;
    try { pj = parseDescription(execFileSync('git', ['show', `HEAD:${f}`], { cwd: ROOT, encoding: 'utf8' }), { migrate: false }); } catch { continue; }
    if (!pj || typeof pj !== 'object' || Array.isArray(pj)) continue;
    if ('kind' in pj) kinds++;
    const v2 = migrateProject(pj);
    assert.deepEqual([modeOf(v2), profileOf(v2), isDesignOnly(v2), isSystemProject(v2)], [modeOf(pj), profileOf(pj), isDesignOnly(pj), isSystemProject(pj)], f);
    if ((pj.version ?? 1) <= 1) assert.deepEqual([v2.version, 'kind' in v2, typeof v2.profile], [2, false, 'string'], f);
  }
  assert.ok(kinds >= 12, `${kinds} with a kind`);
});

test('the writers: never a kind; every profile written; New Project\'s version 2', () => {
  for (const k of [null, 'fpga', 'design', 'logic', 'system', 'embedded']) {
    const j = newProjectJson('n', { kind: k });
    assert.deepEqual([j.version, 'kind' in j, typeof j.profile], [2, false, 'string'], String(k));
  }
  const text = projectJsonText('d', { version: 1, name: 'd', kind: 'design', board: null, files: [] });
  assert.deepEqual(JSON.parse(text), { version: 2, name: 'd', board: null, files: [], profile: 'logic' });
  for (const id of ['logic', 'fpga', 'embedded', 'system']) assert.equal('kind' in withProfile({ kind: 'design' }, id), false, id);
});

let tmp, P, V, handle;
before(async () => {
  tmp = await scratchEnv('silinx-project-migrations-');
  P = await import('../server/projects.js');
  V = await import('../server/versions.js');
  ({ handle } = await import('../server/mcp.js'));
});
after(() => fs.rm(tmp, { recursive: true, force: true }));

const V1 = { name: 'Old', version: 1, kind: 'design', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, board: null, top: '', simTop: '', files: [], constraints: null, stimuli: {}, impl: { optMode: 'Speed', optLevel: 1 } };
const V1_TEXT = `${JSON.stringify(V1, null, 2)}\n`;
let rpc = 0;
const call = async (name, args) => { const r = (await handle({ jsonrpc: '2.0', id: ++rpc, method: 'tools/call', params: { name, arguments: args } })).result; return { text: r.content[0].text, data: r.structuredContent, isError: r.isError }; };

test('#5907 the local server: read migrated, the file as it was; its next save version 2, a version kept first, once; Rename leaves it', async () => {
  await P.createProject({ name: 'Old', kind: 'design' });
  const file = path.join(P.projectDir('Old'), 'silinx.json');
  await fs.writeFile(file, V1_TEXT);
  const pj = await P.readProject('Old');
  assert.deepEqual([pj.version, pj.profile, 'kind' in pj, modeOf(pj)], [2, 'logic', false, 'circuit']);
  assert.equal(await fs.readFile(file, 'utf8'), V1_TEXT, 'not written on read');
  assert.equal((await call('project_info', { project: 'Old' })).data.mode, 'circuit', 'the MCP: the same mode');
  // (a save that changes nothing but its version's form: its text kept, no version; a clone's not made modified)
  await P.updateProject('Old', p => ({ ...p, simTop: '' }));
  assert.equal(await fs.readFile(file, 'utf8'), V1_TEXT, 'nothing changed: kept as it was');
  assert.deepEqual(await V.serverVersions(P).list('Old'), []);
  await P.updateProject('Old', p => ({ ...p, excluded: ['src/x.vhd'] }));
  const now = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual([now.version, now.profile, 'kind' in now], [2, 'logic', false]);
  const versions = await V.serverVersions(P).list('Old');
  assert.deepEqual(versions.map(v => v.reason), ['before-migrate']);
  assert.equal((await V.serverVersions(P).read('Old', versions[0].id)).json.kind, 'design', 'the old form kept');
  await P.updateProject('Old', p => ({ ...p, excluded: [] }));
  assert.equal((await V.serverVersions(P).list('Old')).length, 1, 'once');
  // (Rename Project: its name only, a description of before left as it was, migrated on its next save)
  await P.createProject({ name: 'Old2' });
  await fs.writeFile(path.join(P.projectDir('Old2'), 'silinx.json'), V1_TEXT.replace('"Old"', '"Old2"'));
  await P.renameProject('Old2', 'Old3');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(P.projectDir('Old3'), 'silinx.json'), 'utf8')), { ...V1, name: 'Old3' });
  // (the MCP's set_top writes it too: version 2)
  await fs.writeFile(path.join(P.projectDir('Old3'), 'silinx.json'), V1_TEXT.replace('"Old"', '"Old3"').replace('"kind": "design"', '"kind": "system"'));
  assert.equal((await call('project_info', { project: 'Old3' })).data.mode, 'system');
});

test('#5907 the browser edition\'s stores: read migrated; the next save version 2, beforeMigrate first, once', async () => {
  // (a description of before, as stored: the browser's storage keeps the object; a folder, its file's text)
  const raw = async (dir, name) => { const f = await (await dir.getDirectoryHandle(name)).getFileHandle('silinx.json', { create: true }); const w = await f.createWritable(); await w.write(V1_TEXT); await w.close(); };
  for (const make of [() => { const s = browserStore(memStorage()); return [s, () => s.saveJson('Old', V1)]; }, () => { const d = fakeDirectory('Silinx-projects'); return [folderStore(d), () => raw(d, 'Old')]; }]) {
    const [store, writeOld] = make();
    const calls = [];
    const ops = projectOps(() => store, {}, { beforeMigrate: async (name, { json }) => { calls.push([name, (await store.load(name)).json.kind, json.kind]); } });
    await ops.create({ name: 'Old', template: 'empty' });
    await writeOld();
    const p = await ops.project('Old');
    assert.deepEqual([p.version, p.profile, 'kind' in p, modeOf(p)], [2, 'logic', false, 'circuit'], store.kind);
    assert.equal((await store.load('Old', { fresh: true })).json.kind, 'design', `${store.kind}: not written on read`);
    assert.deepEqual(calls, []);
    await ops.saveProject('Old', { ...p, simTop: '' });   // (nothing changed but its version's form: kept)
    assert.equal((await store.load('Old', { fresh: true })).json.kind, 'design', `${store.kind}: a save that changes nothing`);
    await ops.writeFile('Old', 'src/a.vhd', '-- a\n');   // (registered: its description saved)
    const saved = (await store.load('Old')).json;
    assert.deepEqual([saved.version, saved.profile, 'kind' in saved], [2, 'logic', false], store.kind);
    assert.deepEqual(calls, [['Old', 'design', 'design']], `${store.kind}: before, as it was`);
    await ops.writeFile('Old', 'src/b.vhd', '-- b\n');
    assert.equal(calls.length, 1, `${store.kind}: once`);
  }
});

test('#5914 the browser edition\'s folder store: a silinx.json with a byte order mark opens, as the local server\'s (#4755)', async () => {
  const d = fakeDirectory('Silinx-projects'), store = folderStore(d), ops = projectOps(() => store, {});
  await ops.create({ name: 'Bom', template: 'empty' });
  const f = await (await d.getDirectoryHandle('Bom')).getFileHandle('silinx.json');
  const w = await f.createWritable();
  await w.write(`﻿${V1_TEXT.replace('"Old"', '"Bom"')}`);
  await w.close();
  const p = await ops.project('Bom');
  assert.deepEqual([p.name, p.profile, modeOf(p)], ['Bom', 'logic', 'circuit']);
  assert.ok((await ops.list()).some(x => x.name === 'Bom'), 'listed');
});
