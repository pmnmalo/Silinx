// A project's versions (core/versions.js, #5740): saved on a backend (here in memory) with their texts once each by
// their SHA-256, listed newest first with what they changed, read back whole; none when nothing changed or a save
// comes too soon; the pruning by age, count and bytes (named versions and the latest kept); a restore's plan (the
// whole project, one file, the project's own id / name / trust kept); a restore on a storage, kept as versions before
// and after; a broken index ignored. On the traffic example; the hashes checked against node:crypto's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { versionStore, pruneVersions, restorePlan, restoreVersion, autoVersions, versionLine, versionChanges, VERSION_LIMITS, REASONS } from '../core/versions.js';

const ROOT = path.join(import.meta.dirname, '..', 'examples', 'traffic');
const walk = (rel = '') => fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }).flatMap(e => (e.name.startsWith('.') ? [] : e.isDirectory() ? walk(path.posix.join(rel, e.name)) : [path.posix.join(rel, e.name)]));
const traffic = () => ({ json: JSON.parse(fs.readFileSync(path.join(ROOT, 'silinx.json'), 'utf8')), files: Object.fromEntries(walk().filter(p => p !== 'silinx.json').map(p => [p, fs.readFileSync(path.join(ROOT, p), 'utf8')])) });
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const T = 'src/timer.vhd';
const H = 3600e3, D = 24 * H;

function memory() {
  const ix = new Map(), texts = new Map();
  const log = [];
  return {
    texts, log, ix,
    readIndex: async n => (ix.has(n) ? structuredClone(ix.get(n)) : null),
    writeIndex: async (n, i) => { ix.set(n, structuredClone(i)); },
    getText: async (n, h) => texts.get(`${n}/${h}`) ?? null,
    putText: async (n, h, t) => { log.push(['put', h]); texts.set(`${n}/${h}`, t); },
    dropText: async (n, h) => { log.push(['drop', h]); texts.delete(`${n}/${h}`); },
    forget: async n => { ix.delete(n); for (const k of [...texts.keys()]) if (k.startsWith(`${n}/`)) texts.delete(k); },
  };
}

test('versions saved, listed newest first with what they changed, read back whole; each text kept once, by its SHA-256', async () => {
  const b = memory(), V = versionStore(b);
  const p = traffic();
  const t0 = Date.parse('2026-11-26T10:00:00Z');
  const a = await V.save('P', p, { reason: 'manual', label: '  before\tthe lab ', author: 'Ana', at: t0 });
  assert.deepEqual(a, { saved: true, version: { id: '1', at: '2026-11-26T10:00:00.000Z', reason: 'manual', label: 'before the lab', author: 'Ana', files: Object.keys(p.files).length, changed: { added: Object.keys(p.files).sort(), changed: [], removed: [] } } });
  assert.equal(b.texts.get(`P/${sha(p.files[T])}`), p.files[T]);
  assert.equal(b.log.length, Object.keys(p.files).length + 1);   // (every file and silinx.json)
  // one file changed, one added, one removed: only the new texts written
  const q = structuredClone(p);
  q.files[T] += '-- changed\n';
  q.files['src/new.vhd'] = '-- new\n';
  delete q.files['src/sevenseg.v'];
  b.log.length = 0;
  const v2 = await V.save('P', q, { reason: 'before-merge', at: t0 + 60e3 });
  assert.deepEqual(v2.version.changed, { added: ['src/new.vhd'], changed: [T], removed: ['src/sevenseg.v'] });
  assert.deepEqual(b.log.map(x => x[0]), ['put', 'put']);
  assert.deepEqual((await V.list('P')).map(v => [v.id, v.reason, v.label]), [['2', 'before-merge', ''], ['1', 'manual', 'before the lab']]);
  const r = await V.read('P', '1');
  assert.deepEqual([r.files, r.json], [p.files, p.json]);
  assert.deepEqual((await V.read('P', 2)).files, q.files);
  await assert.rejects(V.read('P', '9'), { status: 404, message: "no version 9 of 'P' (list_versions: the versions kept)" });
  assert.equal(versionLine(v2.version), '2  2026-11-26 10:01  before Merge Contribution  (+1 ~1 -1)');
  assert.equal(versionLine(a.version), `1  2026-11-26 10:00  Ana  saved by hand: before the lab  (+${Object.keys(p.files).length})`);
});

test('no version when nothing changed (unless it is named), nor a save sooner than saveGap after the last version', async () => {
  const b = memory(), V = versionStore(b);
  const p = traffic(), t0 = Date.parse('2026-11-26T10:00:00Z');
  await V.save('P', p, { reason: 'save', at: t0 });
  assert.equal((await V.save('P', p, { reason: 'before-remove', at: t0 + H })).saved, false);
  assert.equal((await V.save('P', p, { reason: 'manual', label: 'named', at: t0 + H })).saved, true);
  const q = structuredClone(p);
  q.files[T] += '-- x\n';
  assert.equal((await V.save('P', q, { reason: 'save', at: t0 + H + VERSION_LIMITS.saveGap - 1 })).saved, false);
  assert.equal((await V.save('P', q, { reason: 'save', at: t0 + H + VERSION_LIMITS.saveGap })).saved, true);
  // a risky command's version is never held back by the gap
  q.files[T] += '-- y\n';
  assert.equal((await V.save('P', q, { reason: 'before-convert', at: t0 + H + VERSION_LIMITS.saveGap + 1 })).saved, true);
  assert.throws(() => V.save('P', q, { reason: 'whatever' }), { status: 400, message: `reason: one of ${Object.keys(REASONS).join(', ')}` });
  // silinx.json changed alone: a version too
  const j = structuredClone(q);
  j.json.top = 'traffic';
  assert.equal((await V.save('P', j, { reason: 'before-git', at: t0 + 2 * H })).saved, true);
  assert.deepEqual((await V.read('P', '5')).json.top, 'traffic');
});

test('pruning: all for an hour, one an hour for a day, one a day for a month, none older; named and the latest kept; count and bytes', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  const v = (id, ago, label = '') => ({ id, at: new Date(now - ago).toISOString(), label, json: 'j', files: { a: `h${id}` } });
  const list = [v('1', 40 * D), v('2', 40 * D, 'kept'), v('3', 5 * D + 2 * H), v('4', 5 * D + H), v('5', 3 * H + 30 * 60e3), v('6', 3 * H + 10 * 60e3), v('7', 30 * 60e3), v('8', 10 * 60e3)];
  const { keep, drop } = pruneVersions(list, VERSION_LIMITS, now);
  // (per bucket the newest: 4 of its day, 6 of its hour; 1 too old; 2 named)
  assert.deepEqual(keep.map(x => x.id), ['2', '4', '6', '7', '8']);
  assert.deepEqual(drop.map(x => x.id), ['1', '3', '5']);
  // count: the oldest unnamed ones first, the latest and the named ones never
  assert.deepEqual(pruneVersions(list.slice(1), { ...VERSION_LIMITS, max: 2 }, now).keep.map(x => x.id), ['2', '8']);
  // bytes: texts shared by versions counted once
  const sizes = { j: 10, h4: 100, h6: 100, h7: 100, h8: 100, h2: 100 };
  assert.deepEqual(pruneVersions(list, { ...VERSION_LIMITS, bytes: 320 }, now, sizes).keep.map(x => x.id), ['2', '7', '8']);
});

test('pruning in a store: dropped versions\' texts deleted, the ones still held kept', async () => {
  const b = memory(), V = versionStore(b, { limits: { ...VERSION_LIMITS, max: 2 } });
  const p = traffic(), t0 = Date.parse('2026-11-26T10:00:00Z');
  for (let i = 0; i < 3; i++) { p.files[T] = `-- ${i}\n`; await V.save('P', p, { reason: 'before-remove', at: t0 + i * 60e3 }); }
  assert.deepEqual((await V.list('P')).map(v => v.id), ['3', '2']);
  assert.equal(b.texts.has(`P/${sha('-- 0\n')}`), false);
  assert.equal(b.texts.has(`P/${sha('-- 1\n')}`), true);
  assert.equal(b.texts.has(`P/${sha(traffic().files['src/top.vhd'])}`), true);
  assert.deepEqual(Object.keys(b.ix.get('P').sizes).length, Object.keys(p.files).length + 2);
  await V.forget('P');
  assert.deepEqual([await V.list('P'), b.texts.size], [[], 0]);
});

test('a broken index (a folder anyone may change) is no versions, never an error', async () => {
  const b = memory(), V = versionStore(b);
  b.ix.set('P', { version: 1, next: 2, versions: [{ id: '1', at: 'x', reason: 'save', json: 'nothex', files: {} }] });
  assert.deepEqual(await V.list('P'), []);
  b.ix.set('P', { version: 2 });
  assert.deepEqual(await V.list('P'), []);
});

test('a restore\'s plan: the whole project (its files the version has not removed), one file, the project\'s own fields kept', () => {
  const v = traffic();
  const now = structuredClone(v);
  now.files[T] = '-- broken\n';
  now.files['src/extra.vhd'] = '-- extra\n';
  delete now.files['src/sevenseg.v'];
  now.json = { ...now.json, top: 'timer', id: 'p-now', name: 'Mine', trusted: false, madeBy: 'merge', fileTree: ['x'] };
  const whole = restorePlan(v, now);
  assert.deepEqual(whole.write, { [T]: v.files[T], 'src/sevenseg.v': v.files['src/sevenseg.v'] });
  assert.deepEqual(whole.remove, ['src/extra.vhd']);
  assert.deepEqual(whole.json, { ...v.json, id: 'p-now', name: 'Mine', trusted: false, madeBy: 'merge' });
  // one file: its text, its entry in silinx.json (back where it was)
  const one = restorePlan(v, now, { path: 'src/sevenseg.v' });
  assert.deepEqual([one.write, one.remove], [{ 'src/sevenseg.v': v.files['src/sevenseg.v'] }, []]);
  const { fileTree, ...base } = now.json;   // eslint-disable-line no-unused-vars
  const entry = v.json.files.find(f => f.path === 'src/sevenseg.v');
  assert.deepEqual(one.json, now.json.files.some(f => f.path === 'src/sevenseg.v') ? null : { ...base, files: [...base.files, entry] });
  // a file the version has not: removed, its entry out
  const extra = restorePlan(v, { ...now, json: { ...base, files: [...base.files, { path: 'src/extra.vhd', lang: 'vhdl', role: 'design' }] } }, { path: 'src/extra.vhd' });
  assert.deepEqual([extra.write, extra.remove, extra.json.files.some(f => f.path === 'src/extra.vhd')], [{}, ['src/extra.vhd'], false]);
  assert.throws(() => restorePlan(v, now, { path: 'src/none.vhd' }), { status: 404, message: "'src/none.vhd' is in neither the version nor the project" });
  // the version itself: nothing to do
  assert.deepEqual(restorePlan(v, v), { write: {}, remove: [], json: null });
});

test('a restore on a storage: the project kept first, written, its drawings\' HDL made again, kept as a version of its own', async () => {
  const V = versionStore(memory());
  let proj = traffic();
  const calls = [];
  const storage = {
    read: async () => structuredClone(proj),
    write: async (n, p, t) => { calls.push(['write', p]); proj.files[p] = t; },
    remove: async (n, p) => { calls.push(['remove', p]); delete proj.files[p]; },
    saveJson: async (n, j) => { calls.push(['json']); proj.json = j; },
    regenerate: async (n, p) => { calls.push(['regenerate', p]); },
  };
  await V.save('P', proj, { reason: 'manual', label: 'good', at: Date.parse('2026-11-26T10:00:00Z') });
  const F = 'src/traffic.fsm.json';
  proj.files[F] = proj.files[F].replace('"CARS"', '"CARZ"');
  proj.files['src/extra.vhd'] = '-- extra\n';
  const r = await restoreVersion(storage, V, 'P', '1', { author: 'Rui' });
  assert.deepEqual(calls, [['remove', 'src/extra.vhd'], ['write', F], ['regenerate', F]]);
  assert.deepEqual([r.written, r.removed, r.json], [[F], ['src/extra.vhd'], false]);
  assert.deepEqual([r.before.id, r.before.reason, r.before.author, r.version.id, r.version.reason, r.version.of], ['2', 'before-restore', 'Rui', '3', 'restore', '1']);
  assert.deepEqual(proj.files, traffic().files);
  assert.match(versionLine(r.version), /^3 {2}\d{4}-\d\d-\d\d \d\d:\d\d {2}Rui {2}restored version 1 {2}\(~1 -1\)$/);
  // undone: the version before the restore restored
  calls.length = 0;
  await restoreVersion(storage, V, 'P', r.before.id);
  assert.equal(proj.files['src/extra.vhd'], '-- extra\n');
  // the project as the version is already: nothing written, no version
  calls.length = 0;
  const n = (await V.list('P')).length;
  await restoreVersion(storage, V, 'P', '4');
  assert.deepEqual([calls, (await V.list('P')).length], [[], n]);
});

test('automatic versions: one save once the project is quiet, each change putting it off', async () => {
  const saved = [];
  const changed = autoVersions(name => saved.push(name), { quiet: 40 });
  changed('P'); await new Promise(r => setTimeout(r, 20));
  changed('P'); changed('Q'); await new Promise(r => setTimeout(r, 25));
  assert.deepEqual(saved, []);
  await new Promise(r => setTimeout(r, 40));
  assert.deepEqual(saved.sort(), ['P', 'Q']);
  changed('P'); changed.cancel();
  await new Promise(r => setTimeout(r, 60));
  assert.deepEqual(saved.length, 2);
});

test('#5741 what differs between a version and now: the files changed, added and removed since, silinx.json (its own fields aside)', () => {
  const v = traffic();
  assert.deepEqual(versionChanges(v, structuredClone(v)), { files: [], json: false });
  const now = structuredClone(v);
  now.files[T] = '-- changed\n';
  now.files['src/a_new.vhd'] = '-- new\n';
  delete now.files['src/sevenseg.v'];
  assert.deepEqual(versionChanges(v, now), { files: [{ path: 'src/a_new.vhd', state: 'added' }, { path: 'src/sevenseg.v', state: 'removed' }, { path: T, state: 'changed' }], json: false });
  // (the project's own id, name and trust are no change; its top is)
  assert.equal(versionChanges(v, { ...v, json: { ...v.json, id: 'x', name: 'Other', trusted: false } }).json, false);
  assert.equal(versionChanges(v, { ...v, json: { ...v.json, top: 'timer' } }).json, true);
});
