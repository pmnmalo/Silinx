// Rename Project… (#4641): the checks and messages (core/project-rename.js), the local server's rename
// (server/projects.js renameProject, server/project-rename.js: a process running refused, a project shared refused),
// and the browser edition's stores (web/js/project-store.js: the browser's storage, a workspace folder on the disk):
// a rename, a clash, an invalid name, a change of case alone, a failure in the middle leaving the old project as it
// was, a git project (its .git moved with it, its remote kept), a <name>.xise and the workspace repository's trust mark
// following it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratchEnv } from './server-helpers.js';
import { fakeDirectory, dump } from './fixtures/fs-access-fake.js';
import { renameProblem, renamedMessage, renamedFile, runningProblem, sharedProblem, followedProblem } from '../core/project-rename.js';
import { browserStore, folderStore, projectOps } from '../web/js/project-store.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-rename-project-'); });
after(async () => { await fsp.rm(tmp, { recursive: true, force: true }); });
const P = await import('../server/projects.js');
const { renameProjectChecked } = await import('../server/project-rename.js');
const { createJob } = await import('../server/jobs.js');

const rejects = (p, status, message) => assert.rejects(p, e => { assert.equal(e.message, message); if (status) assert.equal(e.status, status); return true; });
const tree = dir => {
  const out = [];
  const walk = sub => { for (const e of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) { const r = sub ? `${sub}/${e.name}` : e.name; if (e.isDirectory()) walk(r); else out.push(r); } };
  walk('');
  return out.sort();
};
const hasGit = (() => { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('renameProblem: New Project\'s rule, the same name, a clash in any case; a change of case alone is a rename', () => {
  assert.equal(renameProblem('a', 'b', ['a', 'c']), null);
  assert.equal(renameProblem('blinky', 'Blinky', ['blinky', 'c']), null);
  assert.deepEqual(renameProblem('a', '2a', ['a']), { status: 400, message: 'invalid project name \'2a\': a letter, then up to 63 letters, digits, - and _' });
  assert.deepEqual(renameProblem('a', 'a b', ['a']), { status: 400, message: 'invalid project name \'a b\': a letter, then up to 63 letters, digits, - and _' });
  assert.deepEqual(renameProblem('a', '', ['a']), { status: 400, message: 'invalid project name \'\': a letter, then up to 63 letters, digits, - and _' });
  assert.deepEqual(renameProblem('a', 'a', ['a']), { status: 400, message: '\'a\' is the project\'s name already' });
  assert.deepEqual(renameProblem('a', 'C', ['a', 'c']), { status: 409, message: 'a project named \'c\' already exists: choose another name' });
  assert.deepEqual(renameProblem('a', 'c', [{ name: 'a' }, { name: 'c' }]), { status: 409, message: 'a project named \'c\' already exists: choose another name' });
  assert.equal(renamedMessage('a', 'b'), 'Project \'a\' renamed to \'b\'.');
  assert.equal(runningProblem('a'), '\'a\' is not renamed while a process of it runs: stop it (or wait for it to finish) first');
  assert.equal(sharedProblem('a'), '\'a\' is not renamed while it is shared live: stop sharing it first');
  assert.equal(followedProblem('a'), '\'a\' is another person\'s project, followed live: it is not renamed');
  assert.equal(renamedFile('a.xise', 'a', 'b'), 'b.xise');
  assert.equal(renamedFile('A.XISE', 'a', 'b'), 'b.xise');
  assert.equal(renamedFile('src/a.xise', 'a', 'b'), null);
  assert.equal(renamedFile('a.vhd', 'a', 'b'), null);
});

test('the server: a project renamed, its folder moved whole (its files, its .xise, silinx.json\'s name), listed under its new name', async () => {
  await P.createProject({ name: 'r1', template: 'blinky' });
  const dir = P.projectDir('r1');
  fs.writeFileSync(path.join(dir, 'r1.xise'), '<project/>\n');
  fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'build/top.bit'), 'bits');
  const before = tree(dir).map(f => (f === 'r1.xise' ? 'r1b.xise' : f)).sort();
  const pj = await P.readProject('r1');
  assert.deepEqual(await P.renameProject('r1', 'r1b'), { name: 'r1b' });
  assert.ok(!fs.existsSync(dir));
  assert.deepEqual(tree(P.projectDir('r1b')), before);
  assert.equal(fs.readFileSync(path.join(P.projectDir('r1b'), 'r1b.xise'), 'utf8'), '<project/>\n');
  assert.equal(fs.readFileSync(path.join(P.projectDir('r1b'), 'build/top.bit'), 'utf8'), 'bits');
  assert.equal(JSON.parse(fs.readFileSync(path.join(P.projectDir('r1b'), 'silinx.json'), 'utf8')).name, 'r1b');
  assert.deepEqual(await P.readProject('r1b'), { ...pj, name: 'r1b' });
  const names = (await P.listProjects()).map(p => p.name);
  assert.ok(names.includes('r1b') && !names.includes('r1'));
});

test('the server: a clash (in any case), an invalid name, the same name, a project that is not there: refused, nothing moved', async () => {
  await P.createProject({ name: 'c1' });
  await P.createProject({ name: 'c2' });
  const was = tree(P.projectDir('c1'));
  await rejects(P.renameProject('c1', 'C2'), 409, 'a project named \'c2\' already exists: choose another name');
  await rejects(P.renameProject('c1', '9x'), 400, 'invalid project name \'9x\': a letter, then up to 63 letters, digits, - and _');
  await rejects(P.renameProject('c1', '../x'), 400, 'invalid project name \'../x\': a letter, then up to 63 letters, digits, - and _');
  await rejects(P.renameProject('c1', 'c1'), 400, '\'c1\' is the project\'s name already');
  await rejects(P.renameProject('nope', 'n2'), 404, 'project \'nope\' not found');
  assert.deepEqual(tree(P.projectDir('c1')), was);
  assert.ok(!fs.existsSync(P.projectDir('C2')) || fs.existsSync(path.join(P.projectDir('c2'), 'silinx.json')));
});

test('the server: a change of case alone (through a hidden name)', async () => {
  await P.createProject({ name: 'casey' });
  await P.renameProject('casey', 'Casey');
  const names = fs.readdirSync(P.workspaceDir());
  assert.ok(names.includes('Casey') && !names.includes('casey'));
  assert.ok(!names.some(n => n.startsWith('.rename-')));
  assert.equal((await P.readProject('Casey')).name, 'Casey');
});

test('the server: a failure in the middle moves everything back, the old project as it was', async () => {
  await P.createProject({ name: 'f1', template: 'gates' });
  fs.writeFileSync(path.join(P.projectDir('f1'), 'f1.xise'), '<project/>\n');
  const was = tree(P.projectDir('f1')), text = fs.readFileSync(path.join(P.projectDir('f1'), 'silinx.json'), 'utf8');
  P.RENAME_TESTING.failAt = 'moved';
  try { await rejects(P.renameProject('f1', 'f2'), undefined, 'rename failed (test)'); } finally { P.RENAME_TESTING.failAt = null; }
  assert.deepEqual(tree(P.projectDir('f1')), was);
  assert.equal(fs.readFileSync(path.join(P.projectDir('f1'), 'silinx.json'), 'utf8'), text);
  assert.ok(!fs.existsSync(P.projectDir('f2')));
  // (and renamed once the failure is gone)
  await P.renameProject('f1', 'f2');
  assert.ok(fs.existsSync(path.join(P.projectDir('f2'), 'f2.xise')));
});

test('the server: a git project, its .git moved with it, its remote and its history kept; the workspace repository\'s trust mark follows it', { skip: !hasGit && 'no git' }, async () => {
  await P.createProject({ name: 'g1', template: 'blinky' });
  const dir = P.projectDir('g1');
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
  git(dir, 'init', '-q');
  git(dir, 'remote', 'add', 'origin', 'https://github.com/someone/blinky.git');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'first');
  const head = git(dir, 'rev-parse', 'HEAD');
  // an untrusted project of a workspace repository: its mark in the workspace's .git (#2830)
  const mark = path.join(P.workspaceDir(), '.git', 'silinx-trust', 'g1.json');
  fs.mkdirSync(path.dirname(mark), { recursive: true });
  fs.writeFileSync(mark, '{"trusted":false}\n');
  await P.renameProject('g1', 'g2');
  const nd = P.projectDir('g2');
  assert.ok(fs.existsSync(path.join(nd, '.git', 'HEAD')));
  assert.equal(git(nd, 'remote', 'get-url', 'origin'), 'https://github.com/someone/blinky.git');
  assert.equal(git(nd, 'rev-parse', 'HEAD'), head);
  assert.equal(git(nd, 'status', '--porcelain'), 'M silinx.json');   // (its name in it: the one change)
  assert.ok(!fs.existsSync(mark));
  assert.equal(fs.readFileSync(path.join(P.workspaceDir(), '.git', 'silinx-trust', 'g2.json'), 'utf8'), '{"trusted":false}\n');
  assert.equal((await P.readProject('g2')).trusted, false);
  fs.rmSync(path.join(P.workspaceDir(), '.git'), { recursive: true, force: true });
});

test('the server\'s checks (the route\'s, the MCP\'s): a process running refused, a project shared refused, the message', async () => {
  await P.createProject({ name: 'k1' });
  let end;
  const running = new Promise(r => { end = r; });
  const job = createJob('implement', () => running, { meta: { project: 'K1' } });
  await rejects(renameProjectChecked('k1', 'k2'), 409, '\'k1\' is not renamed while a process of it runs: stop it (or wait for it to finish) first');
  end();
  while (job.status === 'running') await new Promise(r => setTimeout(r, 5));
  await rejects(renameProjectChecked('k1', 'k2', { shared: n => n === 'k1' }), 409, '\'k1\' is not renamed while it is shared live: stop sharing it first');
  assert.ok(fs.existsSync(P.projectDir('k1')));
  assert.deepEqual(await renameProjectChecked('k1', 'k2'), { name: 'k2', message: 'Project \'k1\' renamed to \'k2\'.' });
  // (GitHub's record of SILINX_GIT=github follows it, #3196)
  const cfg = path.join(process.env.SILINX_CONFIG_DIR, 'github-git');
  const { moveGithubMeta } = await import('../server/git-github.js');
  await P.createProject({ name: 'm1' });
  await moveGithubMeta('m1', 'm0');   // (none: nothing done)
  const crypto = await import('node:crypto');
  const ws = crypto.createHash('sha256').update(path.resolve(P.workspaceDir())).digest('hex').slice(0, 16);
  fs.mkdirSync(path.join(cfg, ws), { recursive: true });
  fs.writeFileSync(path.join(cfg, ws, 'm1.json'), '{"repo":"a/b"}');
  await renameProjectChecked('m1', 'm2');
  assert.deepEqual(fs.readdirSync(path.join(cfg, ws)), ['m2.json']);
});

// ---- the browser edition
import { memStorage } from './fixtures/mem-storage.js';   // (localStorage's interface, #4725)
const JSON0 = { version: 1, device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, board: null, top: 'top', simTop: '', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], constraints: null };
const FILES = { 'src/top.vhd': 'entity top is end;\narchitecture a of top is begin end;\n', 'p.xise': '<project/>\n' };

test('the browser\'s storage: renamed, a clash, an invalid name, a change of case; a storage that fails leaves the old project', async () => {
  let failing = false;
  const st = memStorage(() => failing);
  const store = browserStore(st), ops = projectOps(() => store);
  await store.create('p', JSON0, FILES);
  await store.create('q', JSON0, {});
  await assert.rejects(ops.renameProject('p', 'Q'), { message: 'a project named \'q\' already exists: choose another name' });
  await assert.rejects(ops.renameProject('p', '_p'), { message: 'invalid project name \'_p\': a letter, then up to 63 letters, digits, - and _' });
  await assert.rejects(ops.renameProject('zz', 'z2'), { message: 'project \'zz\' not found' });
  failing = true;
  await assert.rejects(ops.renameProject('p', 'p2'), /QuotaExceededError/);
  failing = false;
  assert.deepEqual((await store.list()).map(p => p.name), ['p', 'q']);
  assert.deepEqual((await store.load('p')).files, FILES);
  assert.deepEqual(await ops.renameProject('p', 'p2'), { name: 'p2' });
  assert.deepEqual((await store.list()).map(p => p.name), ['p2', 'q']);
  const p2 = await store.load('p2');
  assert.equal(p2.json.name, 'p2');
  assert.deepEqual(p2.files, { 'src/top.vhd': FILES['src/top.vhd'], 'p2.xise': '<project/>\n' });
  // (kept: read again from the storage)
  assert.deepEqual((await browserStore(st).list()).map(p => p.name), ['p2', 'q']);
  await ops.renameProject('p2', 'P2');
  assert.deepEqual((await store.list()).map(p => p.name), ['P2', 'q']);
});

test('a workspace folder on the disk: the folder copied under the new name, the old removed; a failure leaves the old project', async () => {
  const root = fakeDirectory('Silinx-projects');
  const store = folderStore(root), ops = projectOps(() => store);
  await store.create('p', JSON0, FILES, { dirs: ['sim'] });
  await store.writeBuild('p', 'build/top.bit', new Uint8Array([1, 2, 3]));
  await store.create('q', JSON0, {});
  await assert.rejects(ops.renameProject('p', 'q'), { message: 'a project named \'q\' already exists: choose another name' });
  // the old folder not removed: the copy removed, the old project as it was
  const was = await dump(root);
  const remove = root.removeEntry.bind(root);
  root.removeEntry = async (name, o) => { if (name === 'p') throw new Error('NoModificationAllowedError'); return remove(name, o); };
  await assert.rejects(ops.renameProject('p', 'p2'), /NoModificationAllowedError/);
  root.removeEntry = remove;
  assert.deepEqual(await dump(root), was);
  await ops.renameProject('p', 'p2');
  const after = await dump(root);
  assert.ok(!Object.keys(after).some(k => k.startsWith('p/')));
  assert.equal(after['p2/src/top.vhd'], FILES['src/top.vhd']);
  assert.equal(after['p2/p2.xise'], '<project/>\n');
  assert.ok(!('p2/p.xise' in after));
  assert.ok('p2/sim/' in after && 'p2/build/top.bit' in after);
  assert.equal(JSON.parse(after['p2/silinx.json']).name, 'p2');
  assert.deepEqual((await store.list()).map(p => p.name), ['p2', 'q']);
  assert.equal((await store.load('p2')).json.name, 'p2');
  // a change of case alone: through a hidden copy, none left
  await ops.renameProject('p2', 'P2');
  const keys = Object.keys(await dump(root));
  assert.ok(keys.includes('P2/src/top.vhd') && !keys.some(k => k.startsWith('p2/') || k.startsWith('.rename-')));
});
