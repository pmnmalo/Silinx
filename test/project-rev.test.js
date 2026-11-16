// A project's ancestor recorded when a copy is given out (#4205, core/project-rev.js): its revision (against an
// independent computation with node:crypto, and a fixed vector, so that the browser's and the server's agree), what
// a copy given out carries (an id made once, the origin, the snapshot), a copy of a copy (its origin kept), a copy taken
// in (an id of its own, its ancestor checked), the snapshots from outside refused (paths, kinds, a revision that is not
// its files'), the snapshots a project keeps (capped); and every example given out and its snapshot read back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ANCESTOR_FILE, SNAPSHOT_LIMITS, designOf, giveCopy, isProjectId, keepSnapshots, originOf, parseSnapshot, projectRev,
  receivedCopy, snapshotBytes, snapshotText,
} from '../core/project-rev.js';

const ROOT = path.join(import.meta.dirname, '..');
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
// the revision as its definition says it, computed apart
const reference = (json, files) => {
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  const { id, origin, trusted, madeBy, ...design } = json;   // eslint-disable-line no-unused-vars
  return sha([JSON.stringify(canon(design)), ...Object.keys(files).filter((p) => p !== 'silinx.json').sort().map((p) => `${JSON.stringify(p)} ${sha(files[p])}`)].join('\n'));
};
const json = { name: 'a', top: 't', files: [{ path: 'src/a.vhd', lang: 'vhdl', role: 'design' }], impl: { optLevel: 1, optMode: 'Speed' } };
const files = { 'src/a.vhd': 'entity a is end;\n', 'sim/tb.vhd': '-- tb\n' };

test('projectRev: a fixed vector; as computed apart; the files\' order and the description\'s keys, id, origin and trust aside; any change another', async () => {
  assert.equal(await projectRev({ name: 'a', top: 't' }, { 'src/a.vhd': 'entity a is end;\n', 'silinx.json': 'x' }), '5a463bceb54f49cf92bf32ebc526ff70b6b7ba65f35c509e4060cc60edb7136f');
  const rev = await projectRev(json, files);
  assert.equal(rev, reference(json, files));
  assert.equal(await projectRev({ impl: { optMode: 'Speed', optLevel: 1 }, files: json.files, top: 't', name: 'a' }, { 'sim/tb.vhd': files['sim/tb.vhd'], 'src/a.vhd': files['src/a.vhd'] }), rev);
  assert.equal(await projectRev({ ...json, id: crypto.randomUUID(), origin: { id: 'x', rev: 'y' }, trusted: false, madeBy: 'mcp' }, files), rev);
  for (const [j, f] of [[{ ...json, top: 'u' }, files], [json, { ...files, 'src/a.vhd': 'entity a is end; \n' }], [json, { ...files, 'src/b.vhd': '' }],
    [json, { 'src/a.vhd': files['src/a.vhd'], 'sim/tb2.vhd': files['sim/tb.vhd'] }]]) assert.notEqual(await projectRev(j, f), rev);
});

test('giveCopy: a project\'s first copy makes its id; the copy names its origin and carries the snapshot the project keeps; again, the same', async () => {
  const at = '2026-11-16T10:00:00.000Z';
  const c = await giveCopy(json, { 'silinx.json': '{}', ...files, [ANCESTOR_FILE]: 'stale' }, { at });
  assert.equal(c.changed, true);
  assert.ok(isProjectId(c.base.id));
  assert.deepEqual({ ...c.base, id: undefined }, { ...json, id: undefined });
  const rev = reference(json, files);
  assert.deepEqual(c.copy.origin, { id: c.base.id, rev, at });
  assert.deepEqual(c.snapshot, { format: 'silinx-base', version: 1, id: c.base.id, rev, at, json: designOf(json), files });
  assert.equal(c.keep, true);
  assert.equal(c.copy.id, c.base.id);
  // (given again, its id kept, the same revision: the same snapshot)
  const again = await giveCopy(c.base, files, { at });
  assert.deepEqual([again.changed, again.base.id, again.copy.origin.rev], [false, c.base.id, rev]);
  // a copy's copy: its origin kept, the snapshot it kept carried, nothing kept anew
  const sub = await giveCopy({ ...c.copy, id: crypto.randomUUID(), top: 'changed' }, files, { kept: c.snapshot });
  assert.deepEqual([sub.changed, sub.keep, sub.copy.origin, sub.snapshot], [false, false, c.copy.origin, c.snapshot]);
  assert.equal((await giveCopy(c.copy, files, { kept: { ...c.snapshot, rev: 'f'.repeat(64) } })).snapshot, null);
  assert.equal((await giveCopy(c.copy, files)).snapshot, null);
  // (an origin that is none: a project of its own)
  assert.equal(originOf({ origin: { id: 'x', rev } }), null);
  assert.equal((await giveCopy({ ...json, origin: { id: 'x', rev: 'y' } }, files)).keep, true);
});

test('parseSnapshot: a snapshot\'s text read back; refused when it is no snapshot, a path is not a project\'s, a file is no text, its files are not its revision\'s', async () => {
  const { snapshot } = await giveCopy(json, files);
  assert.deepEqual(await parseSnapshot(snapshotText(snapshot)), snapshot);
  const bad = async (s, reason) => assert.rejects(parseSnapshot(typeof s === 'string' ? s : JSON.stringify(s)), { message: `${ANCESTOR_FILE}: ${reason}` });
  await bad('{', 'not JSON');
  await bad({ ...snapshot, format: 'other' }, 'not a Silinx ancestor');
  await bad({ ...snapshot, version: 2 }, 'not a Silinx ancestor');
  await bad({ ...snapshot, id: 'me' }, 'no project id or revision');
  await bad({ ...snapshot, files: [] }, 'no description or files');
  for (const p of ['../x.vhd', '.git/config', 'src/.hidden', '/etc/passwd', 'silinx.json', ANCESTOR_FILE, 'src//a.vhd']) await bad({ ...snapshot, files: { ...files, [p]: '' } }, `a file's path: ${p}`);
  await bad({ ...snapshot, files: { ...files, 'src/b.vhd': 7 } }, 'a file that is no text: src/b.vhd');
  await bad({ ...snapshot, files: { ...files, 'src/a.vhd': 'tampered' } }, 'its files are not its revision\'s');
  await bad({ ...snapshot, json: { ...snapshot.json, top: 'x' } }, 'its files are not its revision\'s');
  await bad({ ...snapshot, files: Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`src/f${i}.vhd`, ''])) }, 'too many files');
  await bad('x'.repeat((64 << 20) + 1), 'too large');
});

test('receivedCopy: an id of its own, its origin kept, its ancestor kept when it is the origin\'s; warned and not kept otherwise', async () => {
  const c = await giveCopy(json, files);
  const r = await receivedCopy({ ...c.copy, trusted: false }, snapshotText(c.snapshot));
  assert.ok(isProjectId(r.json.id) && r.json.id !== c.base.id);
  assert.deepEqual([r.json.origin, r.snapshot, r.warnings, r.json.trusted], [c.copy.origin, c.snapshot, [], false]);
  assert.deepEqual(await receivedCopy(c.copy, null).then((x) => [x.json.origin, x.snapshot, x.warnings]), [c.copy.origin, null, []]);
  const other = (await giveCopy({ ...json, top: 'other' }, files)).snapshot;
  assert.deepEqual((await receivedCopy(c.copy, snapshotText(other))).warnings, [`${ANCESTOR_FILE}: not the project's origin: not kept`]);
  assert.deepEqual((await receivedCopy(c.copy, '{')).warnings, [`${ANCESTOR_FILE}: not JSON: not kept (a merge of this project back is two-way)`]);
  // (no origin, or one that is none: a project of its own)
  const plain = await receivedCopy({ ...json, id: c.base.id, origin: { id: 1 } }, snapshotText(c.snapshot));
  assert.deepEqual([plain.json.id === c.base.id, 'origin' in plain.json, plain.snapshot], [false, false, null]);
});

test('keepSnapshots: the newest kept, at most the count and the size; the one added always', async () => {
  const s = (rev, at, bytes) => ({ rev, at, bytes });
  const { snapshot } = await giveCopy(json, files, { at: '2026-01-01T00:00:00Z' });
  const old = Array.from({ length: 25 }, (_, i) => s(String(i).padStart(64, '0'), `2025-01-${String(i + 1).padStart(2, '0')}`, 100));
  const k = keepSnapshots(old, snapshot);
  assert.equal(k.keep.length, SNAPSHOT_LIMITS.max);
  assert.equal(k.keep[0], snapshot.rev);
  assert.deepEqual(k.keep.slice(1), old.slice().reverse().slice(0, SNAPSHOT_LIMITS.max - 1).map((x) => x.rev));
  assert.equal(k.drop.length, 25 - (SNAPSHOT_LIMITS.max - 1));
  const big = keepSnapshots([s('a'.repeat(64), '2025-02-01', SNAPSHOT_LIMITS.bytes)], snapshot);
  assert.deepEqual(big, { keep: [snapshot.rev], drop: ['a'.repeat(64)] });
  assert.deepEqual(keepSnapshots([s(snapshot.rev, '2020', 5)], snapshot), { keep: [snapshot.rev], drop: [] });
  assert.equal(snapshotBytes(snapshot), Buffer.byteLength(snapshotText(snapshot)));
});

test('every example given out: its revision as computed apart, its snapshot read back the same', async () => {
  const dir = path.join(ROOT, 'examples');
  let n = 0;
  for (const ex of fs.readdirSync(dir)) {
    const root = path.join(dir, ex);
    if (!fs.existsSync(path.join(root, 'silinx.json'))) continue;
    const walk = (rel = '') => fs.readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap((e) => (e.name.startsWith('.') ? [] : e.isDirectory() ? walk(path.posix.join(rel, e.name)) : [path.posix.join(rel, e.name)]));
    const fl = Object.fromEntries(walk().filter((p) => p !== 'silinx.json').map((p) => [p, fs.readFileSync(path.join(root, p), 'utf8')]));
    const pj = JSON.parse(fs.readFileSync(path.join(root, 'silinx.json'), 'utf8'));
    const c = await giveCopy(pj, fl);
    assert.equal(c.snapshot.rev, reference(pj, fl), ex);
    assert.deepEqual(await parseSnapshot(snapshotText(c.snapshot)), c.snapshot, ex);
    n++;
  }
  assert.ok(n >= 11, n);
});
