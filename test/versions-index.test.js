// A project's versions' index checked (#5908, core/versions.js checkIndex): an entry that cannot be read left out and the
// others kept (before, one bad entry made the whole history read as none, and the next save started again from 1); a
// damaged index (not JSON, not an index) set aside, never written over, and rebuilt from each version's own record;
// a version's number never given again; the repair said in its exact words (the store's save and warning, the MCP's
// list_versions and save_version); a change written texts and record first, then the index (one transaction where the
// backend has one); the changes one at a time under the project's lock, across processes too (two processes saving
// at once on one project: every version kept, no number twice).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { checkIndex, indexWarning, versionStore, entryOk } from '../core/versions.js';
import { scratchEnv } from './server-helpers.js';

const H = 'a'.repeat(64), H2 = 'b'.repeat(64), H3 = 'c'.repeat(64);
const entry = (id, more = {}) => ({ id: String(id), at: `2026-11-27T10:0${id}:00.000Z`, reason: 'manual', label: '', author: '', json: H, files: { 'src/a.vhd': H2 }, changed: { added: [], changed: [], removed: [] }, ...more });

test('checkIndex: a good index as it is; a bad entry left out, the others kept; none: empty', () => {
  const good = { version: 1, next: 3, versions: [entry(1), entry(2)], sizes: { [H]: 10, [H2]: 20 } };
  assert.deepEqual(checkIndex(good, [entry(1), entry(2)]), { index: good, damaged: null, dropped: [], rebuilt: [], unrecorded: [] });
  assert.deepEqual(checkIndex(null), { index: { version: 1, next: 1, versions: [], sizes: {} }, damaged: null, dropped: [], rebuilt: [], unrecorded: [] });
  // (#5908: before, `checked` read this whole index as none)
  const one = checkIndex({ version: 1, next: 4, versions: [entry(1), { ...entry(2), json: 'nothex' }, entry(3)], sizes: { [H]: 1, bad: 2, [H3]: -1 } });
  assert.deepEqual(one.index.versions.map(v => v.id), ['1', '3']);
  assert.deepEqual([one.damaged, one.dropped, one.index.next, one.index.sizes], [null, ['2'], 4, { [H]: 1 }]);
  assert.deepEqual(one.unrecorded.map(v => v.id), ['1', '3'], 'an index of before: no records yet');
  for (const bad of [{ ...entry(1), id: 1 }, { ...entry(1), id: '01' }, { ...entry(1), at: 'x' }, { ...entry(1), reason: 'nope' }, { ...entry(1), files: { a: 'x' } }, { ...entry(1), files: [] }, null, 'x'])
    assert.equal(entryOk(bad), false, JSON.stringify(bad));
  assert.equal(entryOk(entry(9)), true);
});

test('checkIndex: a damaged index rebuilt from the records and what survives; its numbers never given again; a duplicate once', () => {
  const text = '{"version":1,"next":9,"versions":[{"id":"7","at":"2026-1';   // (cut short: not JSON)
  const r = checkIndex(text, [entry(2), entry(1), { broken: true }]);
  assert.deepEqual([r.damaged, r.dropped, r.rebuilt], ['not JSON', [], ['2', '1']]);
  assert.deepEqual(r.index.versions.map(v => v.id), ['1', '2'], 'by number');
  assert.equal(r.index.next, 8, 'past the 7 the damaged text names');
  assert.deepEqual(checkIndex({ version: 2, versions: 'x' }, []).damaged, 'not a versions\' index');
  assert.deepEqual(checkIndex([1, 2], []).damaged, 'not JSON');
  // (an entry bad in the index, whole in its record: taken from the record, not counted as left out)
  const fixed = checkIndex({ version: 1, next: 3, versions: [entry(1), { ...entry(2), at: 'x' }] }, [entry(1), entry(2)]);
  assert.deepEqual([fixed.dropped, fixed.rebuilt, fixed.index.versions.length], [[], ['2'], 2]);
  const dup = checkIndex({ version: 1, next: 2, versions: [entry(1), entry(1, { label: 'again' })] });
  assert.deepEqual([dup.index.versions.length, dup.index.versions[0].label, dup.dropped], [1, '', ['1']]);
});

test('indexWarning: each repair in its words; nothing repaired: null', () => {
  assert.equal(indexWarning('P', { damaged: null, dropped: [], rebuilt: [] }), null);
  assert.equal(indexWarning('P', { damaged: 'not JSON', dropped: [], rebuilt: ['1', '2'] }, '.silinx/versions/index.json.damaged-X'),
    "the versions' index of 'P' was damaged (not JSON): set aside as .silinx/versions/index.json.damaged-X and rebuilt, 2 version(s) taken from their own records; no version that could be read is lost");
  assert.equal(indexWarning('P', { damaged: 'not a versions\' index', dropped: [], rebuilt: [] }),
    "the versions' index of 'P' was damaged (not a versions' index): rebuilt, 0 version(s) taken from their own records; no version that could be read is lost");
  assert.equal(indexWarning('P', { damaged: null, dropped: ['2', '5'], rebuilt: ['3'] }),
    "the versions' index of 'P' was repaired: 2 entry(ies) that could not be read left out (2, 5); 1 version(s) taken from their own records; the others kept");
  assert.equal(indexWarning('P', { damaged: null, dropped: [], rebuilt: ['3'] }), "the versions' index of 'P' was repaired: 1 version(s) taken from their own records; the others kept");
});

// a backend in memory with each version's record, its damaged index set aside, its writes logged
function memory({ commit = false } = {}) {
  const ix = new Map(), texts = new Map(), entries = new Map(), aside = [], log = [];
  const b = {
    ix, texts, entries, aside, log,
    readIndex: async n => (ix.has(n) ? structuredClone(ix.get(n)) : null),
    writeIndex: async (n, i) => { log.push('index'); ix.set(n, structuredClone(i)); },
    getText: async (n, h) => texts.get(`${n}/${h}`) ?? null,
    putText: async (n, h, t) => { log.push('text'); texts.set(`${n}/${h}`, t); },
    dropText: async (n, h) => { log.push('drop'); texts.delete(`${n}/${h}`); },
    forget: async n => { ix.delete(n); },
    listEntries: async n => [...entries.entries()].filter(([k]) => k.startsWith(`${n}/`)).map(([, v]) => structuredClone(v)),
    putEntry: async (n, e) => { log.push(`entry ${e.id}`); entries.set(`${n}/${e.id}`, structuredClone(e)); },
    dropEntry: async (n, id) => { log.push(`unentry ${id}`); entries.delete(`${n}/${id}`); },
    setAside: async n => { aside.push(ix.get(n)); ix.delete(n); return `aside-${aside.length}`; },
  };
  if (commit) b.commit = async (n, ops) => { log.push(['commit', ops.texts.length, ops.entries.map(e => e.id), ops.dropEntries, ops.dropTexts.length]); for (const [h, t] of ops.texts) texts.set(`${n}/${h}`, t); for (const e of ops.entries) entries.set(`${n}/${e.id}`, e); ix.set(n, structuredClone(ops.index)); };
  return b;
}
const project = (t = 'x') => ({ json: { name: 'P', files: [] }, files: { 'src/a.vhd': `-- ${t}\n` } });
const T0 = Date.parse('2026-11-27T10:00:00Z');

test('a store: texts, the version\'s record, then the index; a damaged index set aside, rebuilt, said; the next number past all', async () => {
  const b = memory(), V = versionStore(b);
  await V.save('P', project('1'), { at: T0 });
  assert.deepEqual(b.log, ['text', 'text', 'entry 1', 'index'], 'its record before the index');
  await V.save('P', project('2'), { at: T0 + 1000 });
  assert.equal(await V.warning('P'), null);
  // the index damaged (a crash of another tool, a sync's copy): the versions read from their records, said
  b.ix.set('P', '{"version":1,"next":3,"versions":[{"id":"2"');
  assert.deepEqual((await V.list('P')).map(v => v.id), ['2', '1']);
  assert.equal(await V.warning('P'), "the versions' index of 'P' was damaged (not JSON): rebuilt, 2 version(s) taken from their own records; no version that could be read is lost");
  assert.equal(b.aside.length, 0, 'a read sets nothing aside');
  const s = await V.save('P', project('3'), { at: T0 + 2000 });
  assert.equal(s.version.id, '3', 'never 1 again');
  assert.equal(s.warning, "the versions' index of 'P' was damaged (not JSON): set aside as aside-1 and rebuilt, 2 version(s) taken from their own records; no version that could be read is lost");
  assert.deepEqual(b.aside, ['{"version":1,"next":3,"versions":[{"id":"2"'], 'kept, never written over');
  assert.deepEqual((await V.list('P')).map(v => v.id), ['3', '2', '1']);
  assert.equal(await V.warning('P'), null, 'repaired once');
  assert.equal((await V.read('P', '1')).files['src/a.vhd'], '-- 1\n', 'its texts still there');
});

test('#5908 regression: one bad entry no longer loses the history; an index of before gets its records on its next change', async () => {
  const b = memory(), V = versionStore(b);
  delete b.listEntries; delete b.putEntry; delete b.dropEntry; delete b.setAside;   // (a backend of before: no records)
  await V.save('P', project('1'), { at: T0 });
  await V.save('P', project('2'), { at: T0 + 1000 });
  const ix = b.ix.get('P');
  ix.versions[0].reason = 'unknown';   // (written by a later Silinx, or hand-edited)
  b.ix.set('P', ix);
  assert.deepEqual((await V.list('P')).map(v => v.id), ['2']);
  assert.equal(await V.warning('P'), "the versions' index of 'P' was repaired: 1 entry(ies) that could not be read left out (1); the others kept");
  const s = await V.save('P', project('3'), { at: T0 + 2000 });
  assert.equal(s.version.id, '3');
  assert.deepEqual((await V.list('P')).map(v => v.id), ['3', '2']);
  // (records written for the versions of before, on the next change, even one that saves no version)
  const r = memory(), W = versionStore(r);
  await W.save('Q', project('1'), { at: T0 });
  r.entries.clear();
  await W.save('Q', project('1'), { at: T0 + 1000 });
  assert.deepEqual([...r.entries.keys()], ['Q/1']);
});

test('a backend with commit: one change, one transaction (texts, records, index, what was dropped)', async () => {
  const b = memory({ commit: true }), V = versionStore(b, { limits: { max: 2, bytes: 1e9, all: 1e12, hourly: 1e12, daily: 1e12, saveGap: 0 } });
  for (let i = 1; i <= 3; i++) await V.save('P', project(String(i)), { at: T0 + i * 1000 });
  assert.deepEqual(b.log, [['commit', 2, ['1'], [], 0], ['commit', 1, ['2'], [], 0], ['commit', 1, ['3'], ['1'], 1]]);
});

test('a lock: every change of the versions inside it, none outside; a read takes none', async () => {
  const b = memory(), held = [];
  let inside = 0;
  const V = versionStore(b, { lock: async (name, fn) => { inside++; held.push(name); try { return await fn(); } finally { inside--; } } });
  const w = b.writeIndex;
  b.writeIndex = async (n, i) => { assert.equal(inside, 1, 'written inside the lock'); return w(n, i); };
  await V.save('P', project('1'), { at: T0 });
  await V.forget('P');
  assert.deepEqual(held, ['P', 'P']);
  await V.list('P');
  assert.equal(held.length, 2);
});

// ---- the local server's: records on the disk, the project's lock across processes
let tmp, P, SV;
before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-versions-index-'));
  P = await import('../server/projects.js');
  SV = await import('../server/versions.js');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('the local server: each version a record v/<id>.json; a damaged index set aside as index.json.damaged-<time>, rebuilt; the MCP says it', async () => {
  await P.createProject({ name: 'Ix' });
  const dir = path.join(P.projectDir('Ix'), '.silinx', 'versions');
  await SV.saveVersion(P, 'Ix', { reason: 'manual', label: 'one' });
  await P.writeFile('Ix', 'src/b.vhd', '-- b\n');
  await SV.saveVersion(P, 'Ix', { reason: 'manual', label: 'two' });
  assert.deepEqual(fs.readdirSync(path.join(dir, 'v')).sort(), ['1.json', '2.json']);
  fs.writeFileSync(path.join(dir, 'index.json'), '{"version":1,');
  const { handle } = await import('../server/mcp.js');
  const call = async (name, args) => { const r = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).result; return { text: r.content[0].text, data: r.structuredContent }; };
  const l = await call('list_versions', { project: 'Ix' });
  assert.equal(l.data.warning, "the versions' index of 'Ix' was damaged (not JSON): rebuilt, 2 version(s) taken from their own records; no version that could be read is lost");
  assert.match(l.text, /^(\[[^\n]*\]\n)?WARNING: the versions' index of 'Ix' was damaged \(not JSON\): rebuilt, 2 version\(s\) taken from their own records; no version that could be read is lost\n2 version\(s\) of 'Ix', newest first:/);
  const s = await call('save_version', { project: 'Ix', name: 'three' });
  assert.match(s.data.warning, /^the versions' index of 'Ix' was damaged \(not JSON\): set aside as \.silinx\/versions\/index\.json\.damaged-[\dTZ-]+ and rebuilt, 2 version\(s\) taken from their own records; no version that could be read is lost$/);
  assert.match(s.text, /^(\[[^\n]*\]\n)?WARNING: the versions' index of 'Ix' was damaged[^\n]*\nVersion 3 of 'Ix' saved: /);
  const aside = fs.readdirSync(dir).filter(f => f.startsWith('index.json.damaged-'));
  assert.equal(aside.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, aside[0]), 'utf8'), '{"version":1,', 'kept as it was');
  assert.deepEqual((await SV.serverVersions(P).list('Ix')).map(v => `${v.id} ${v.label}`), ['3 three', '2 two', '1 one']);
  assert.equal((await call('list_versions', { project: 'Ix' })).data.warning, undefined, 'repaired');
  // (the records go with the project: not among its files)
  assert.ok(!(await P.fileTree('Ix')).some(f => f.includes('.silinx')));
});

// a child process saving versions of a project at the same time as this one: the project's lock across processes
const N = 20;
const CHILD = `
const P = await import(${JSON.stringify(new URL('../server/projects.js', import.meta.url).href)});
const { saveVersion } = await import(${JSON.stringify(new URL('../server/versions.js', import.meta.url).href)});
process.stdout.write('ready');
await new Promise(r => process.stdin.once('data', r));
for (let i = 0; i < ${N}; i++) await saveVersion(P, 'Race', { reason: 'manual', label: 'child ' + i });
process.exit(0);
`;

test('two processes saving versions of one project at once: every version kept, no number twice (the project\'s lock)', async () => {
  await P.createProject({ name: 'Race' });
  const child = spawn(process.execPath, ['--input-type=module', '-e', CHILD], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', d => { err += d; });
  const done = new Promise(r => child.on('exit', r));
  await new Promise((r, j) => { child.stdout.once('data', r); child.once('exit', c => j(new Error(`the child ended (${c}): ${err}`))); });   // (both loaded: then at once)
  child.stdin.write('go\n');
  for (let i = 0; i < N; i++) await SV.saveVersion(P, 'Race', { reason: 'manual', label: `parent ${i}` });
  assert.equal(await done, 0, err);
  const list = await SV.serverVersions(P).list('Race');
  assert.equal(list.length, 2 * N);
  assert.deepEqual(list.map(v => v.id).sort((a, b) => a - b), Array.from({ length: 2 * N }, (_, i) => String(i + 1)));
  assert.equal(new Set(list.map(v => v.label)).size, 2 * N, 'none lost');
  assert.equal(await SV.serverVersions(P).warning('Race'), null);
});
