// A copy given out of a server's project and taken in (#4205: server/project-zip.js, server/project-snapshots.js, the
// MCP's export_project and import_project): Export Project as a copy makes the project's id once, names the copy's
// origin and carries its ancestor, which the project keeps (hidden: not in its file tree); an export that is no copy
// (the interface's own uses: a rename's backup, a link's comparison) is as before. An import gives the copy an id of
// its own, keeps its origin and its ancestor (checked, never a project file), and a copy of a copy carries its first
// origin. The interface's description written whole keeps the id and the origin; the snapshots are capped.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-project-copy-'));
  fs.mkdirSync(path.join(tmp, 'exchange'));
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'exchange');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const { exportProjectZip, importProjectEntries } = await import('../server/project-zip.js');
const { listSnapshots, readSnapshot, saveSnapshot } = await import('../server/project-snapshots.js');
const { ANCESTOR_FILE, SNAPSHOT_LIMITS, isProjectId, parseSnapshot, projectRev } = await import('../core/project-rev.js');
const { gateZip } = await import('../core/import-gate.js');
const { readZip, createZip } = await import('../core/zip.js');
const { NODE_CODEC } = await import('../server/impl-routes.js');
const { handle } = await import('../server/mcp.js');
const unzip = async (zip) => Object.fromEntries((await readZip(zip, NODE_CODEC)).map((e) => [e.path, Buffer.from(e.data).toString('utf8')]));
const importGated = async (name, zip) => importProjectEntries(P, name, await gateZip(zip, NODE_CODEC), (m) => new Error(m));
let rpc = 0;
const call = async (name, args) => { const r = (await handle({ jsonrpc: '2.0', id: ++rpc, method: 'tools/call', params: { name, arguments: args } })).result; assert.equal(r.isError, false, r.content[0].text); return r; };
const raw = (name) => JSON.parse(fs.readFileSync(path.join(P.projectDir(name), 'silinx.json'), 'utf8'));

test('Export as a copy: the project\'s id made once, the copy\'s origin, its ancestor carried and kept (hidden); an export that is no copy as before', async () => {
  await P.createProject({ name: 'traffic', template: 'traffic' });
  const plain = await unzip((await exportProjectZip(P, 'traffic', 'silinx')).zip);
  assert.ok(!(ANCESTOR_FILE in plain) && !('origin' in JSON.parse(plain['silinx.json'])) && !('id' in raw('traffic')));
  const z = await unzip((await exportProjectZip(P, 'traffic', 'silinx', { copy: true })).zip);
  const base = raw('traffic');
  assert.ok(isProjectId(base.id));
  const pj = JSON.parse(z['silinx.json']);
  const files = Object.fromEntries(Object.entries(z).filter(([p]) => p !== 'silinx.json' && p !== ANCESTOR_FILE));
  const rev = await projectRev(base, files);
  assert.deepEqual([pj.id, pj.origin.id, pj.origin.rev], [base.id, base.id, rev]);
  const anc = await parseSnapshot(z[ANCESTOR_FILE]);
  assert.deepEqual([anc.id, anc.rev, anc.files], [base.id, rev, files]);
  assert.deepEqual(await readSnapshot(P, 'traffic', rev), anc);
  // (hidden: not a project file, not in the next export)
  assert.ok(!(await P.fileTree('traffic')).some((f) => f.includes('.silinx') || f === ANCESTOR_FILE));
  // given out again unchanged: its id kept, one snapshot
  await exportProjectZip(P, 'traffic', 'silinx', { copy: true });
  assert.equal(raw('traffic').id, base.id);
  assert.deepEqual((await listSnapshots(P, 'traffic')).map((s) => s.rev), [rev]);
  // (a Xilinx ISE project: no origin)
  assert.ok(!Object.keys(await unzip((await exportProjectZip(P, 'traffic', 'xilinx', { copy: true })).zip)).includes(ANCESTOR_FILE));
});

test('Import of a copy: an id of its own, its origin and ancestor kept (not a project file); a copy of the copy carries the first origin', async () => {
  const zip = (await exportProjectZip(P, 'traffic', 'silinx', { copy: true })).zip;
  const z = await unzip(zip);
  const origin = JSON.parse(z['silinx.json']).origin;
  const r = await importGated('ana', zip);
  assert.deepEqual(r.warnings, []);
  const ana = raw('ana');
  assert.ok(isProjectId(ana.id) && ana.id !== raw('traffic').id);
  assert.deepEqual([ana.origin, ana.trusted], [origin, false]);
  assert.ok(!(await P.fileTree('ana')).includes(ANCESTOR_FILE) && !r.extra.includes(ANCESTOR_FILE));
  assert.deepEqual(await readSnapshot(P, 'ana', origin.rev), await parseSnapshot(z[ANCESTOR_FILE]));
  // ana's work given out (back to the teacher, or to a colleague): the first origin, the first ancestor
  fs.appendFileSync(path.join(P.projectDir('ana'), 'src/timer.vhd'), '-- ana\n');
  const back = await unzip((await exportProjectZip(P, 'ana', 'silinx', { copy: true })).zip);
  assert.deepEqual(JSON.parse(back['silinx.json']).origin, origin);
  assert.equal(back[ANCESTOR_FILE], z[ANCESTOR_FILE]);
  assert.match(back['src/timer.vhd'], /-- ana\n$/);
  assert.equal(raw('ana').id, ana.id);
});

test('Import of a copy whose ancestor is not its origin\'s, or tampered: warned, not kept, the project imported', async () => {
  const z = await unzip((await exportProjectZip(P, 'traffic', 'silinx', { copy: true })).zip);
  const anc = JSON.parse(z[ANCESTOR_FILE]);
  anc.files['src/timer.vhd'] += '-- changed\n';
  const entries = Object.entries({ ...z, [ANCESTOR_FILE]: JSON.stringify(anc) }).map(([p, t]) => ({ path: p, data: Buffer.from(t) }));
  const r = await importGated('bea', await createZip(entries, NODE_CODEC));
  assert.deepEqual(r.warnings, [`${ANCESTOR_FILE}: its files are not its revision's: not kept (a merge of this project back is two-way)`]);
  assert.deepEqual(await listSnapshots(P, 'bea'), []);
  assert.deepEqual(raw('bea').origin, JSON.parse(z['silinx.json']).origin);
});

test('The interface\'s description written whole keeps the id and the origin; a project made new by it keeps its own', async () => {
  const { id, origin, ...stale } = raw('ana');   // eslint-disable-line no-unused-vars
  await P.writeProject('ana', { ...stale, top: 'top', id: crypto.randomUUID(), origin: { id: 'x', rev: 'y' } });
  assert.deepEqual([raw('ana').id, raw('ana').origin], [id, origin]);
  await P.writeProject('ana', stale);
  assert.deepEqual([raw('ana').id, raw('ana').origin], [id, origin]);
});

test('The snapshots a project keeps: the newest, at most SNAPSHOT_LIMITS.max', async () => {
  const s = (i) => ({ format: 'silinx-base', version: 1, id: raw('traffic').id, rev: '', at: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`, json: {}, files: { 'src/x.vhd': `-- ${i}\n` } });
  for (let i = 0; i < SNAPSHOT_LIMITS.max + 3; i++) { const x = s(i); x.rev = await projectRev(x.json, x.files); await saveSnapshot(P, 'traffic', x); }
  assert.equal((await listSnapshots(P, 'traffic')).length, SNAPSHOT_LIMITS.max);
  // (a file in the folder that is no snapshot's: never read as one)
  const dir = path.join(P.projectDir('traffic'), '.silinx', 'snapshots');
  fs.writeFileSync(path.join(dir, `${'a'.repeat(64)}.json`), '{"format":"silinx-base"}');
  assert.equal(await readSnapshot(P, 'traffic', 'a'.repeat(64)), null);
  assert.equal(await readSnapshot(P, 'traffic', '../silinx'), null);
});

test('The MCP\'s export_project gives a copy as the menu\'s Export does; import_project keeps its origin and ancestor', async () => {
  await call('new_project_from_example', { name: 'gates', example: 'gates' });
  await call('export_project', { project: 'gates', kind: 'silinx', path: 'gates-silinx.zip' });
  const z = await unzip(fs.readFileSync(path.join(tmp, 'exchange', 'gates-silinx.zip')));
  const origin = JSON.parse(z['silinx.json']).origin;
  assert.equal(origin.id, raw('gates').id);
  assert.ok(ANCESTOR_FILE in z);
  const i = await call('import_project', { name: 'gates_copy', from: 'gates-silinx.zip' });
  assert.ok(!i.structuredContent.extra.includes(ANCESTOR_FILE));
  assert.deepEqual(raw('gates_copy').origin, origin);
  assert.ok(await readSnapshot(P, 'gates_copy', origin.rev));
});
