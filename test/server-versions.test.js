// A server's projects' versions (#5740: server/versions.js on core/versions.js): kept in the project's hidden folder
// (never among its files, nor in its export); the MCP's save_version, list_versions and restore_version (the whole
// project, one file, a restore undone by restoring the version before it); a version kept before a tool that replaces
// or removes files (delete_file, remove_from_project…), none before the others; the routes the page uses (a version by
// hand, the reasons it may give, a restore); the automatic versions, a save once the project is quiet. On the traffic
// example, in a scratch workspace; the exact texts of the tools.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, startApp, sleep } from './server-helpers.js';

let tmp;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-versions-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const { handle } = await import('../server/mcp.js');
const { serverVersions, startAutoVersions, folderBackend } = await import('../server/versions.js');
const T = 'src/timer.vhd';
const file = (name, rel) => fs.readFileSync(path.join(P.projectDir(name), rel), 'utf8');
let rpc = 0;
const call = async (name, args) => { const r = (await handle({ jsonrpc: '2.0', id: ++rpc, method: 'tools/call', params: { name, arguments: args } })).result; return { text: r.content[0].text, data: r.structuredContent, isError: r.isError }; };
// (the tools' texts with the times of their versions out, and the untrusted content's closing line)
const plain = t => t.replace(/\d{4}-\d\d-\d\d \d\d:\d\d/g, 'TIME').replace(/\n\[End of untrusted content[^\n]*\]$/, '').replace(/^\[Untrusted[^\n]*\]\n/, '');

test('save_version, list_versions, restore_version: the whole project, one file; a restore undone by the version before it', async () => {
  await P.createProject({ name: 'tv', template: 'traffic' });
  const orig = file('tv', T);
  const s = await call('save_version', { project: 'tv', name: 'before the lab' });
  assert.equal(s.isError, false);
  assert.equal(plain(s.text), "Version 1 of 'tv' saved: 1  TIME  MCP  saved by hand: before the lab  (+9)");
  // in the hidden folder only: not a file of the project
  assert.ok(fs.existsSync(path.join(P.projectDir('tv'), '.silinx', 'versions', 'index.json')));
  assert.ok(!(await P.fileTree('tv')).some(f => f.includes('.silinx')));
  await P.writeFile('tv', T, '-- broken\n');
  await P.writeFile('tv', 'src/extra.vhd', '-- extra\n');
  const r = await call('restore_version', { project: 'tv', version: '1' });
  assert.equal(plain(r.text), "Restored 'tv' as version 1 had it: 1 file(s) written, 1 removed, silinx.json written; the project before it kept as version 2.\n  written src/timer.vhd\n  removed src/extra.vhd");
  assert.equal(file('tv', T), orig);
  assert.equal(fs.existsSync(path.join(P.projectDir('tv'), 'src/extra.vhd')), false);
  assert.equal((await P.readProject('tv')).files.some(f => f.path === 'src/extra.vhd'), false);
  const l = await call('list_versions', { project: 'tv' });
  assert.equal(plain(l.text), [
    "3 version(s) of 'tv', newest first:",
    '  3  TIME  MCP  restored version 1  (~1 -1)',
    '  2  TIME  MCP  before a restore  (+1 ~1)',
    '  1  TIME  MCP  saved by hand: before the lab  (+9)',
  ].join('\n'));
  assert.deepEqual(l.data.versions.map(v => v.reason), ['restore', 'before-restore', 'manual']);
  // undone: version 2 restored, one file of it
  const one = await call('restore_version', { project: 'tv', version: '2', path: T });
  assert.equal(plain(one.text), "Restored src/timer.vhd of 'tv' as version 2 had it: 1 file(s) written, 0 removed; the project before it kept as version 3.\n  written src/timer.vhd");
  assert.equal(file('tv', T), '-- broken\n');
  assert.equal(fs.existsSync(path.join(P.projectDir('tv'), 'src/extra.vhd')), false);
  // already so: nothing
  assert.equal(plain((await call('restore_version', { project: 'tv', version: '2', path: T })).text), "Src/timer.vhd of 'tv' is as version 2 has it already: nothing restored.");
  // errors
  const no = await call('restore_version', { project: 'tv', version: '99' });
  assert.deepEqual([no.isError, no.text], [true, "restore_version: no version 99 of 'tv' (list_versions: the versions kept)"]);
  const none = await call('restore_version', { project: 'tv', version: '1', path: 'src/none.vhd' });
  assert.deepEqual([none.isError, none.text], [true, "restore_version: 'src/none.vhd' is in neither the version nor the project"]);
  // (the project as the latest version has it: none saved; changed, one with no name)
  assert.equal(plain((await call('save_version', { project: 'tv' })).text), "Version 4 of 'tv' has it already: no version saved.");
  await P.writeFile('tv', T, '-- c\n');
  assert.equal(plain((await call('save_version', { project: 'tv' })).text), "Version 5 of 'tv' saved (no name): 5  TIME  MCP  saved by hand  (~1)");
});

test('a version before a tool that replaces or removes files (none before the others), with its reason', async () => {
  await P.createProject({ name: 'tr', template: 'traffic' });
  assert.equal(plain((await call('list_versions', { project: 'tr' })).text), "No versions of 'tr' yet (save_version keeps one).");
  await call('read_file', { project: 'tr', path: T });
  await call('write_file', { project: 'tr', path: T, text: '-- a\n' });
  assert.deepEqual(await serverVersions(P).list('tr'), []);
  const d = await call('delete_file', { project: 'tr', path: 'src/sevenseg.v' });
  assert.equal(d.isError, false);
  const l = await serverVersions(P).list('tr');
  assert.deepEqual(l.map(v => [v.id, v.reason, v.author]), [['1', 'before-delete', 'MCP']]);
  assert.equal((await serverVersions(P).read('tr', '1')).files['src/sevenseg.v'], fs.readFileSync(path.join(import.meta.dirname, '..', 'examples', 'traffic', 'src', 'sevenseg.v'), 'utf8'));
  assert.equal((await serverVersions(P).read('tr', '1')).files[T], '-- a\n');
  // the tool's own error on a project that is not there: no version, no warning
  const x = await call('delete_file', { project: 'none', path: 'a' });
  assert.equal(x.isError, true);
  assert.doesNotMatch(x.text, /version/);
});

test('the routes: listed, one by hand (the page\'s reasons only), read, restored', async () => {
  const app = await startApp();
  try {
    await P.createProject({ name: 'rt', template: 'traffic' });
    assert.deepEqual((await app.call('GET', '/projects/rt/versions')).body, { versions: [] });
    const s = await app.call('POST', '/projects/rt/versions', { label: 'one', author: 'Ana' });
    assert.equal(s.status, 200);
    assert.deepEqual([s.body.saved, s.body.version.id, s.body.version.reason, s.body.version.author], [true, '1', 'manual', 'Ana']);
    const bad = await app.call('POST', '/projects/rt/versions', { reason: 'restore' });
    assert.deepEqual([bad.status, bad.body.error], [400, 'reason: manual, or before-remove, before-delete, before-convert, before-import, before-merge, before-git, before-mode']);
    assert.equal((await app.call('POST', '/projects/rt/versions', { label: 3 })).status, 400);
    await P.writeFile('rt', T, '-- b\n');
    assert.equal((await app.call('POST', '/projects/rt/versions', { reason: 'before-remove' })).body.version.reason, 'before-remove');
    const r1 = await app.call('GET', '/projects/rt/versions/1');
    assert.equal(r1.body.files[T], fs.readFileSync(path.join(import.meta.dirname, '..', 'examples', 'traffic', T), 'utf8'));
    assert.equal((await app.call('GET', '/projects/rt/versions/7')).status, 404);
    // (#5741) what differs from now
    assert.deepEqual((await app.call('GET', '/projects/rt/versions/1/diff')).body.files, [{ path: T, state: 'changed' }]);
    assert.equal((await app.call('GET', '/projects/rt/versions/7/diff')).status, 404);
    // (path null: the whole project, as the page sends it)
    const r = await app.call('POST', '/projects/rt/versions/1/restore', { path: null, author: 'Ana' });
    assert.deepEqual([r.status, r.body.written, r.body.removed, r.body.before.id, r.body.version.of], [200, [T], [], '2', '1']);
    assert.equal(file('rt', T), r1.body.files[T]);
    assert.equal((await app.call('GET', '/projects/none/versions')).status, 404);
  } finally { await app.close(); }
});

test('automatic versions: one once the project is quiet, after the server\'s writes; none again before saveGap', async () => {
  await P.createProject({ name: 'au', template: 'traffic' });
  // (#5768: no timing a loaded machine breaks: the writes well inside the quiet time, the version awaited, not slept for)
  const QUIET = 400;
  const until = async (fn, what, ms = 10000) => { for (let t = Date.now(); Date.now() - t < ms; await sleep(25)) if (await fn()) return; assert.fail(`timed out: ${what}`); };
  const stop = startAutoVersions(P, { quiet: QUIET });
  try {
    await P.writeFile('au', T, '-- 1\n');
    await P.writeFile('au', T, '-- 2\n');
    // (build/'s files are not the project's changes)
    await P.writeFile('au', 'build/x.txt', 'x');
    await until(async () => (await serverVersions(P).list('au')).length > 0, 'the automatic version');
    await sleep(2 * QUIET);
    const l = await serverVersions(P).list('au');
    assert.deepEqual(l.map(v => [v.id, v.reason]), [['1', 'save']]);
    assert.equal((await serverVersions(P).read('au', '1')).files[T], '-- 2\n');
    await P.writeFile('au', T, '-- 3\n');
    await sleep(3 * QUIET);
    assert.equal((await serverVersions(P).list('au')).length, 1);
  } finally { stop(); }
  // stopped: no more
  await P.writeFile('au', T, '-- 4\n');
  await sleep(3 * QUIET);
  assert.equal((await serverVersions(P).list('au')).length, 1);
});

test('the folder\'s texts by their hash only: a name that is no hash refused', async () => {
  const b = folderBackend(P);
  await P.createProject({ name: 'fb', template: 'traffic' });
  await assert.rejects(b.putText('fb', '../../x', 't'), /not a text's hash/);
  assert.equal(await b.getText('fb', 'a'.repeat(64)), null);
  assert.equal(await b.readIndex('fb'), null);
});

test('#5741 version_diff: the files that differ from now; one file\'s change, a text file\'s lines, a drawing\'s objects', async () => {
  await P.createProject({ name: 'vd', template: 'traffic' });
  const F = 'src/traffic.fsm.json';
  await call('save_version', { project: 'vd', name: 'v1' });
  assert.equal(plain((await call('version_diff', { project: 'vd', version: '1' })).text), "'vd' is as version 1 has it.");
  await P.writeFile('vd', T, file('vd', T).replace(/^/, '-- a line\n'));
  const m = JSON.parse(file('vd', F));
  m.states[0].x += 40;
  await P.writeFile('vd', F, `${JSON.stringify(m, null, 2)}\n`);
  await P.writeFile('vd', 'src/extra.vhd', '-- extra\n');
  const all = await call('version_diff', { project: 'vd', version: '1' });
  assert.equal(plain(all.text), [
    "'vd' against version 1: 4 file(s) differ.",
    '  src/extra.vhd: added since',
    `  ${T}: changed since`,
    `  ${F}: changed since`,
    '  silinx.json: changed since',
  ].join('\n'));
  assert.deepEqual(all.data.files.map(f => f.state), ['added', 'changed', 'changed']);
  const text = await call('version_diff', { project: 'vd', version: '1', path: T });
  assert.match(plain(text.text), /^--- src\/timer\.vhd \(version 1\)\n\+\+\+ src\/timer\.vhd \(now\)\n@@ [^\n]+\n\+-- a line\n/);
  const id = JSON.parse(file('vd', F)).states[0].id;
  assert.equal(plain((await call('version_diff', { project: 'vd', version: '1', path: F })).text), `${F}, version 1 to now: 1 change(s).\n  moved states/${id} (${m.states[0].name})`);
  assert.equal(plain((await call('version_diff', { project: 'vd', version: '1', path: 'src/sevenseg.v' })).text), 'src/sevenseg.v, version 1 to now: no change.');
  const no = await call('version_diff', { project: 'vd', version: '1', path: 'src/none.vhd' });
  assert.deepEqual([no.isError, no.text], [true, "version_diff: 'src/none.vhd' is in neither version 1 nor the project"]);
  const bad = await call('version_diff', { project: 'vd', version: '9' });
  assert.deepEqual([bad.isError, bad.text], [true, "version_diff: no version 9 of 'vd' (list_versions: the versions kept)"]);
});
