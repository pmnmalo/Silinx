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
import { failing } from './fixtures/fs-access-failing.js';
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

// #4760: a failure at each step moves everything back; an undo that fails too is said (never the first error alone, as
// if nothing had changed), with what it left and no path of the server's
test('#4760 the server: a failure at each step undone; an undo that fails said, with what it left', async () => {
  await P.createProject({ name: 'u1', template: 'gates' });
  fs.writeFileSync(path.join(P.projectDir('u1'), 'u1.xise'), '<project/>\n');
  const was = tree(P.projectDir('u1')), text = fs.readFileSync(path.join(P.projectDir('u1'), 'silinx.json'), 'utf8');
  for (const at of ['moved', 'mark', 'files', 'json']) {
    P.RENAME_TESTING.failAt = at;
    try { await rejects(P.renameProject('u1', 'u2'), undefined, 'rename failed (test)'); } finally { P.RENAME_TESTING.failAt = null; }
    assert.deepEqual(tree(P.projectDir('u1')), was, at);
    assert.equal(fs.readFileSync(path.join(P.projectDir('u1'), 'silinx.json'), 'utf8'), text, at);
    assert.ok(!fs.existsSync(P.projectDir('u2')), at);
  }
  // the moves back failing: the project left under its new name, said
  Object.assign(P.RENAME_TESTING, { failAt: 'files', failUndo: true });
  try {
    await rejects(P.renameProject('u1', 'u2'), 500, 'could not rename the project \'u1\' to \'u2\' (rename failed (test)), and putting it back failed too: u2/u2.xise → u2/u1.xise (EPERM), u2 → u1 (EPERM). Look at the workspace\'s folders \'u1\' and \'u2\'.');
  } finally { Object.assign(P.RENAME_TESTING, { failAt: null, failUndo: false }); }
  assert.ok(fs.existsSync(path.join(P.projectDir('u2'), 'u2.xise')) && !fs.existsSync(P.projectDir('u1')));
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

test('#4866 GitHub\'s record of a project: a project\'s name only, its file in its workspace\'s folder; any other name refused, no file moved', async () => {
  const { moveGithubMeta, metaFile } = await import('../server/git-github.js');
  const crypto = await import('node:crypto');
  const ws = crypto.createHash('sha256').update(path.resolve(P.workspaceDir())).digest('hex').slice(0, 16);
  const dir = path.join(process.env.SILINX_CONFIG_DIR, 'github-git', ws);
  assert.equal(await metaFile('r1'), path.join(path.resolve(dir), 'r1.json'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'r1.json'), '{"repo":"a/b"}');
  // (outside the workspace's folder: a record a name with .. or an absolute path would reach)
  fs.writeFileSync(path.join(dir, '..', 'evil.json'), '{"repo":"c/d"}');
  const abs = path.join(tmp, 'outside');
  const message = n => `invalid project name '${n}': a letter, then up to 63 letters, digits, - and _`;
  for (const bad of ['../evil', '..', `${abs}`, 'r1/../../evil', 'a\\..\\evil', '', 'r1.json']) {
    await rejects(metaFile(bad), 400, message(bad));
    await rejects(moveGithubMeta(bad, 'r2'), 400, message(bad));
    await rejects(moveGithubMeta('r1', bad), 400, message(bad));
  }
  assert.equal(fs.readFileSync(path.join(dir, 'r1.json'), 'utf8'), '{"repo":"a/b"}');
  assert.ok(!fs.existsSync(path.join(dir, 'r2.json')));
  assert.equal(fs.readFileSync(path.join(dir, '..', 'evil.json'), 'utf8'), '{"repo":"c/d"}');
  assert.ok(!fs.existsSync(`${abs}.json`));
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
  // the old folder not removed at all (its silinx.json kept): the copy removed, the old project as it was
  const was = await dump(root);
  const undo = failing(root, 'removeEntry', (dir, name) => dir.name === 'p' && name === 'silinx.json');
  await assert.rejects(ops.renameProject('p', 'p2'), /NoModificationAllowedError/);
  undo();
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

// ---- #4724: a workspace folder's Rename Project never removes the only complete copy, whichever step fails
const projectOf = (tree, name) => Object.fromEntries(Object.entries(tree).filter(([k]) => k.startsWith(`${name}/`) && !k.endsWith('silinx.json'))
  .map(([k, v]) => [k.slice(name.length + 1), v]));
async function folderWithP() {
  const root = fakeDirectory('Silinx-projects');
  const store = folderStore(root), ops = projectOps(() => store);
  await store.create('p', JSON0, FILES, { dirs: ['sim'] });
  await store.writeBuild('p', 'build/top.bit', new Uint8Array([1, 2, 3]));
  return { root, store, ops, was: projectOf(await dump(root), 'p') };
}
// (the old folder's removal stopped half way: its src/ gone, then an error, as a file held open by another program)
const halfRemoved = (root, name) => failing(root, 'removeEntry', async (dir, n, o, real) => {
  if (dir !== root || n !== name || !o?.recursive) return false;
  await (await real.getDirectoryHandle.call(root, name)).removeEntry('src', { recursive: true });
  return true;
}, { once: true });

test('#4724 a workspace folder: Rename Project with the copy failing leaves the old project as it was, no copy', async () => {
  const { root, ops } = await folderWithP();
  const before = await dump(root);
  const undo = failing(root, 'getFileHandle', (dir, n, o) => dir.name === 'p2' && o?.create && n === 'p.xise');
  await assert.rejects(ops.renameProject('p', 'p2'), /NoModificationAllowedError/);
  undo();
  assert.deepEqual(await dump(root), before);
});

test('#4724 a workspace folder: the old folder removed only half way keeps the new, complete copy, and says what is left', async () => {
  const { root, store, ops, was } = await folderWithP();
  const undo = halfRemoved(root, 'p');
  await assert.rejects(ops.renameProject('p', 'p2'), { message: '\'p\' was renamed \'p2\', but its old folder could not be removed entirely (NoModificationAllowedError): \'p2\' is complete, remove what is left of the folder \'p\'' });
  undo();
  const after = await dump(root);
  const { 'p.xise': xise, ...rest } = was;
  assert.deepEqual(projectOf(after, 'p2'), { ...rest, 'p2.xise': xise });
  assert.equal(JSON.parse(after['p2/silinx.json']).name, 'p2');
  // (what is left of the old folder is no project: its silinx.json went first)
  assert.deepEqual((await store.list()).map(p => p.name), ['p2']);
  assert.equal(after['p/silinx.json'], undefined);
});

test('#4724 a workspace folder: a change of case alone, each step failing, never loses the project', async () => {
  // the old folder's silinx.json not removed: the old project whole, the hidden copy removed
  {
    const { root, ops } = await folderWithP();
    const before = await dump(root);
    const undo = failing(root, 'removeEntry', (dir, n) => dir.name === 'p' && n === 'silinx.json');
    await assert.rejects(ops.renameProject('p', 'P'), /NoModificationAllowedError/);
    undo();
    assert.deepEqual(await dump(root), before);
  }
  // the old folder removed half way: the project made whole again under its old name, from the hidden copy
  {
    const { root, store, ops, was } = await folderWithP();
    const undo = halfRemoved(root, 'p');
    await assert.rejects(ops.renameProject('p', 'P'), { message: '\'p\' was not renamed: NoModificationAllowedError' });
    undo();
    const after = await dump(root);
    const { 'p.xise': xise, ...rest } = was;
    assert.deepEqual(projectOf(after, 'p'), { ...rest, 'p.xise': xise, 'P.xise': xise });
    assert.ok(!Object.keys(after).some(k => k.startsWith('.rename-') || k.startsWith('P/')));
    assert.deepEqual((await store.list()).map(p => p.name), ['p']);
  }
  // the copy under the new name failing: the project made again under its old name, the partial copy and the hidden one removed
  {
    const { root, store, ops, was } = await folderWithP();
    const undo = failing(root, 'getFileHandle', (dir, n, o) => dir.name === 'P' && o?.create && n === 'P.xise');
    await assert.rejects(ops.renameProject('p', 'P'), { message: '\'p\' was not renamed: NoModificationAllowedError' });
    undo();
    const after = await dump(root);
    assert.deepEqual(projectOf(after, 'p'), { ...Object.fromEntries(Object.entries(was).filter(([k]) => k !== 'p.xise')), 'P.xise': was['p.xise'] });
    assert.ok(!Object.keys(after).some(k => k.startsWith('.rename-') || k.startsWith('P/')));
    assert.deepEqual((await store.list()).map(p => p.name), ['p']);
  }
  // neither made again: the hidden copy, the only complete one, kept and named
  {
    const { root, ops, was } = await folderWithP();
    const undo = failing(root, 'getFileHandle', (dir, n, o) => (dir.name === 'P' || dir.name === 'p') && o?.create && /\.xise$/.test(n));
    const e = await ops.renameProject('p', 'P').then(() => null, x => x);
    undo();
    const tmp = /the folder '(\.rename-P-\d+)'$/.exec(e?.message)?.[1];
    assert.ok(tmp, e?.message);
    assert.match(e.message, /^Rename Project: 'p' could not be made again \(NoModificationAllowedError\): its complete copy is the folder '\.rename-P-\d+'$/);
    const { 'p.xise': xise, ...rest } = was;
    assert.deepEqual(projectOf(await dump(root), tmp), { ...rest, 'P.xise': xise });
  }
});

test('#4724 a workspace folder: Rename of a file or a folder in a project, a step failing, loses nothing', async () => {
  const { root, store, ops } = await folderWithP();
  await ops.writeFile('p', 'lib/a.vhd', 'a');
  await ops.writeFile('p', 'lib/b.vhd', 'b');
  const before = await dump(root);
  // a folder's copy failing: no partial copy left, the folder as it was
  let undo = failing(root, 'getFileHandle', (dir, n, o) => dir.name === 'rtl' && o?.create && n === 'b.vhd');
  await assert.rejects(ops.renameFile('p', 'lib', 'rtl'), /NoModificationAllowedError/);
  undo();
  assert.deepEqual(await dump(root), before);
  // a file not removed: its copy removed, the file as it was
  undo = failing(root, 'removeEntry', (dir, n) => dir.name === 'lib' && n === 'a.vhd');
  await assert.rejects(ops.renameFile('p', 'lib/a.vhd', 'lib/c.vhd'), /NoModificationAllowedError/);
  undo();
  assert.deepEqual(await dump(root), before);
  // a folder not removed: its copy kept, complete, and said; the project read again
  undo = failing(root, 'removeEntry', (dir, n) => dir.name === 'p' && n === 'lib');
  await assert.rejects(ops.renameFile('p', 'lib', 'rtl'), { message: '\'lib\' was copied to \'rtl\', but \'lib\' could not be removed entirely (NoModificationAllowedError): the copy is complete, remove what is left of \'lib\'' });
  undo();
  const p = await store.load('p');
  assert.equal(p.files['rtl/a.vhd'], 'a');
  assert.equal(p.files['rtl/b.vhd'], 'b');
});
