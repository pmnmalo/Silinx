// Git's branches through the system's git (#4213, server/git-branch.js) against a local bare repository (no network):
// the traffic example cloned; New Branch… (its name checked as git's rules ask), the branches listed (GitHub's fetched),
// Switch Branch… (a branch only GitHub has: made here, following it; the project's changes committed first), Merge
// Branch…: another person's branch merged into the project's as a pull merges (a drawing's different objects at once,
// its HDL made again from it and simulated as its model in VHDL and Verilog; the same object a conflict named, nothing
// merged, then resolved by the choice; a text file's same lines by its hunks), its messages, and the errors.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratchEnv, ROOT } from './server-helpers.js';
import { viewHdl } from '../core/view-hdl.js';
import { normalizeFsm, generateFsm } from '../core/fsm.js';
import { randomVectors, runHdl, runModel } from './fsm-sim.js';
import { branchesText, newBranchText, switchText, mergeBranchText, pullMergeLines } from '../core/git-messages.js';

let tmp, ws, bare, dir;
const G = await import('../server/git.js');
const FSM = 'src/traffic.fsm.json', TB = 'sim/tb_traffic.vhd';
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const t = (m, id) => m.transitions.find(x => x.id === id);
// a drawing changed in a folder, its HDL made again from it (as its editor does)
function change(at, fn) {
  const f = path.join(at, FSM);
  const m = readJson(f);
  fn(m);
  fs.writeFileSync(f, `${JSON.stringify(m, null, 2)}\n`);
  const r = viewHdl(FSM, JSON.stringify(m), { linked: () => false });
  assert.deepEqual(r.errors, []);
  fs.writeFileSync(path.join(at, m.generatedFile), r.text);
  return m;
}
// Rui, the other person of the group: his clone, on his branch
let rui;
function ruis(fn, msg) {
  fn(rui);
  sh(rui, 'commit', '--quiet', '-am', msg);
  sh(rui, 'push', '--quiet', 'origin', 'rui');
}
const mine = async (fn, msg) => { fn(dir); await G.gitCommit('traffic', msg); };
const tbLine = (at, from, to) => { const f = path.join(at, TB); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(from, to)); };

before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-git-branch-'));
  ws = process.env.SILINX_WORKSPACE;
  fs.writeFileSync(path.join(tmp, 'gitconfig'), '[user]\n\tname = Ana Aluna\n\temail = ana@example.com\n[init]\n\tdefaultBranch = main\n');
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: path.join(tmp, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', HOME: tmp });
  G.GIT_TESTING.localRemotes = true;
  bare = path.join(tmp, 'traffic.git');
  fs.mkdirSync(bare);
  sh(bare, 'init', '--quiet', '--bare');
  sh(bare, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  const seed = path.join(tmp, 'seed');
  fs.cpSync(path.join(ROOT, 'examples', 'traffic'), seed, { recursive: true });
  sh(seed, 'init', '--quiet');
  sh(seed, 'add', '-A');
  sh(seed, 'commit', '--quiet', '-m', 'Starter');
  sh(seed, 'push', '--quiet', bare, 'HEAD:main');
  await G.gitClone({ url: bare, name: 'traffic' });
  dir = path.join(ws, 'traffic');
  rui = path.join(tmp, 'rui');
  sh(tmp, 'clone', '--quiet', bare, rui);
  sh(rui, 'switch', '--quiet', '-c', 'rui');
});
after(() => { G.GIT_TESTING.localRemotes = false; fs.rmSync(tmp, { recursive: true, force: true }); });

test('the branches listed: the project\'s, GitHub\'s', async () => {
  const r = await G.gitBranches('traffic');
  assert.deepEqual(r, { project: 'traffic', branch: 'main', github: true, branches: [{ name: 'main', current: true, local: true, remote: true }], warnings: [] });
  assert.equal(branchesText(r), 'traffic: on main; 1 branch(es):\n  * main');
});

test('New Branch…: its name checked; made from the last commit, the project on it, its changes kept; pushed', async () => {
  for (const [name, why] of [['', 'a branch needs a name'], ['ana lima', '\'ana lima\' is not a valid branch name'], ['-f', '\'-f\' is not a valid branch name'],
    ['origin/ana', '\'origin/ana\' is not a valid branch name'], ['ana..b', '\'ana..b\' is not a valid branch name'], ['HEAD', '\'HEAD\' is not a valid branch name']]) {
    await assert.rejects(G.gitNewBranch('traffic', name), e => {
      assert.equal(e.message, why);
      assert.equal(e.hint, 'A branch\'s name has letters, digits, -, _, . and /, no spaces (e.g. ana, or ana/traffic-lights).');
      assert.equal(e.status, 400);
      return true;
    });
  }
  await assert.rejects(G.gitNewBranch('traffic', 'main'), { message: 'a branch \'main\' already exists', hint: 'Choose another name, or Switch Branch… to it.', status: 409 });
  const head = sh(dir, 'rev-parse', 'HEAD');
  tbLine(dir, 'begin', 'begin -- Ana');
  const r = await G.gitNewBranch('traffic', ' ana ');
  assert.deepEqual(r, { project: 'traffic', branch: 'ana', from: 'main', commit: head });
  assert.equal(newBranchText(r), 'Branch ana made from main: the project is on it now; Push sends it to GitHub.');
  assert.deepEqual((await G.gitStatus('traffic')).files, [{ path: TB, state: 'modified' }]);
  sh(dir, 'checkout', '--', TB);
  assert.deepEqual((await G.gitBranches('traffic')).branches, [{ name: 'ana', current: true, local: true, remote: false }, { name: 'main', current: false, local: true, remote: true }]);
  assert.equal(branchesText(await G.gitBranches('traffic')), 'traffic: on ana; 2 branch(es):\n  * ana (not on GitHub yet)\n  main');
  assert.deepEqual(await G.gitPush('traffic'), { project: 'traffic', branch: 'ana', remote: 'local/traffic', pushed: true });
  assert.equal(sh(bare, 'rev-parse', 'refs/heads/ana'), head);
  // (a branch GitHub has: not made again)
  sh(rui, 'push', '--quiet', 'origin', 'rui');
  await G.gitBranches('traffic');
  await assert.rejects(G.gitNewBranch('traffic', 'rui'), { message: 'a branch \'rui\' is on GitHub already', status: 409 });
});

test('Switch Branch…: the changes committed first; a branch only GitHub has made here, following it; back again', async () => {
  ruis(at => change(at, m => { t(m, 't2').cond = 'not req'; }), 'Rui: t2');
  const b = await G.gitBranches('traffic');
  assert.deepEqual(b.branches.map(x => [x.name, x.current, x.local, x.remote]), [['ana', true, true, true], ['main', false, true, true], ['rui', false, false, true]]);
  assert.equal(branchesText(b), 'traffic: on ana; 3 branch(es):\n  * ana\n  main\n  rui (on GitHub)');
  tbLine(dir, 'begin', 'begin -- not committed');
  await assert.rejects(G.gitSwitch('traffic', 'rui'), { message: 'the project has 1 change(s) not committed', hint: 'Commit your changes first, then Switch Branch….', status: 409 });
  sh(dir, 'checkout', '--', TB);
  await assert.rejects(G.gitSwitch('traffic', 'nobody'), { message: 'no branch \'nobody\', here or on GitHub', hint: 'New Branch… makes one.', status: 404 });
  const r = await G.gitSwitch('traffic', 'rui');
  assert.deepEqual(r, { project: 'traffic', branch: 'rui', from: 'ana', switched: true, files: [FSM, 'src/traffic.vhd'] });
  assert.equal(switchText(r), `Switched to rui: 2 file(s) changed.\n  ${FSM}\n  src/traffic.vhd`);
  assert.equal(t(readJson(path.join(dir, FSM)), 't2').cond, 'not req');
  assert.equal(sh(dir, 'rev-parse', '--abbrev-ref', 'rui@{upstream}'), 'origin/rui');
  assert.deepEqual(await G.gitSwitch('traffic', 'rui'), { project: 'traffic', branch: 'rui', from: 'rui', switched: false, files: [] });
  assert.equal(switchText({ branch: 'rui', switched: false }), 'Already on rui.');
  const back = await G.gitSwitch('traffic', 'ana');
  assert.deepEqual(back.files, [FSM, 'src/traffic.vhd']);
  assert.notEqual(t(readJson(path.join(dir, FSM)), 't2').cond, 'not req');
  // (the trust kept: a switch is no way to trust a project from outside)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.git', 'silinx-trust.json'), 'utf8')).trusted, false);
});

test('Merge Branch…: Rui\'s branch, different objects: merged at once, the HDL made again and simulated as its model; then up to date', async () => {
  await mine(at => change(at, m => { t(m, 't3').cond = 'req and not night'; }), 'Ana: t3');
  // (Rui pushed again since this repository's copy of his branch: GitHub's is merged)
  ruis(at => change(at, m => { m.states[0].x += 40; }), 'Rui: s0 moved');
  await G.gitBranches('traffic');
  const r = await G.gitMerge('traffic', 'rui');
  assert.deepEqual(r, { project: 'traffic', branch: 'ana', from: 'rui', upToDate: false, files: [FSM, 'src/traffic.vhd'], resolved: [FSM] });
  assert.equal(mergeBranchText(r), `Merged rui into ana: 2 file(s) changed.\n  ${FSM}\n  src/traffic.vhd`);
  assert.deepEqual(pullMergeLines(r), [`${FSM}: merged by its objects, its HDL made again.`]);
  const m = readJson(path.join(dir, FSM));
  assert.deepEqual([t(m, 't2').cond, t(m, 't3').cond], ['not req', 'req and not night']);
  assert.equal(m.states[0].x, readJson(path.join(ROOT, 'examples', 'traffic', FSM)).states[0].x + 40);
  const hdl = fs.readFileSync(path.join(dir, m.generatedFile), 'utf8');
  assert.equal(hdl, viewHdl(FSM, JSON.stringify(m), { linked: () => false }).text);
  const fm = normalizeFsm(m);
  const vectors = randomVectors(fm, 100, 7);
  assert.deepEqual(runHdl(hdl, 'vhdl', fm, vectors), runModel(fm, vectors));
  assert.deepEqual(runHdl(generateFsm(fm, 'verilog').code, 'verilog', fm, vectors), runModel(fm, vectors));
  assert.equal(sh(dir, 'log', '-1', '--format=%s'), 'Merge branch \'rui\' into ana');
  assert.equal(sh(dir, 'log', '-1', '--format=%P').split(' ').length, 2);
  assert.deepEqual((await G.gitStatus('traffic')).files, []);
  const again = await G.gitMerge('traffic', 'rui');
  assert.deepEqual(again, { project: 'traffic', branch: 'ana', from: 'rui', upToDate: true, files: [] });
  assert.equal(mergeBranchText(again), 'Already up to date: ana has every commit of rui.');
});

test('Merge Branch…: the same object changed on both branches: nothing merged, its conflict named; resolved theirs', async () => {
  ruis(at => change(at, m => { t(m, 't1').cond = 'night or req'; }), 'Rui: t1');
  await mine(at => change(at, m => { t(m, 't1').cond = 'night and not req'; }), 'Ana: t1');
  await G.gitBranches('traffic');
  const head = sh(dir, 'rev-parse', 'HEAD');
  await assert.rejects(G.gitMerge('traffic', 'rui'), e => {
    assert.equal(e.message, `git merge: a conflict in ${FSM}, src/traffic.vhd: nothing was merged, the project's files are as they were`);
    assert.equal(e.hint, 'The same objects of a drawing changed on both branches: choose mine or theirs for each, then Merge Branch… again.');
    assert.equal(e.status, 409);
    assert.equal(e.resolvable, true);
    assert.deepEqual(e.drawings, [{ path: FSM, kind: 'fsm', conflicts: [{ id: 'transitions/t1', label: 'transitions t1', mine: 'changed (cond)', theirs: 'changed (cond)' }] }]);
    assert.deepEqual(e.texts, []);
    return true;
  });
  assert.equal(sh(dir, 'rev-parse', 'HEAD'), head);
  assert.ok(!fs.existsSync(path.join(dir, '.git', 'MERGE_HEAD')));
  assert.equal(t(readJson(path.join(dir, FSM)), 't1').cond, 'night and not req');
  const r = await G.gitMerge('traffic', 'rui', { resolve: { [FSM]: { 'transitions/t1': 'theirs' } } });
  assert.deepEqual([r.upToDate, r.resolved, r.warnings], [false, [FSM], undefined]);
  assert.equal(t(readJson(path.join(dir, FSM)), 't1').cond, 'night or req');
  assert.deepEqual((await G.gitStatus('traffic')).files, []);
});

test('Merge Branch…: a text file\'s same lines: nothing merged, its hunk named; resolved both, never with git\'s markers', async () => {
  ruis(at => tbLine(at, 'begin', 'begin -- Rui'), 'Rui: the test bench');
  await mine(at => tbLine(at, 'begin', 'begin -- Ana'), 'Ana: the test bench');
  await G.gitBranches('traffic');
  let hunk;
  await assert.rejects(G.gitMerge('traffic', 'rui'), e => {
    assert.equal(e.message, `git merge: a conflict in ${TB}: nothing was merged, the project's files are as they were`);
    assert.equal(e.hint, 'The same lines of a file changed on both branches: choose mine, theirs or both for each conflict, or write its lines, then Merge Branch… again.');
    assert.deepEqual(e.drawings, []);
    assert.equal(e.texts.length, 1);
    assert.equal(e.texts[0].path, TB);
    [hunk] = e.texts[0].hunks;
    assert.equal(hunk.id, 'h1');
    assert.ok(hunk.mine.some(l => l.includes('-- Ana')) && hunk.theirs.some(l => l.includes('-- Rui')));
    return true;
  });
  const r = await G.gitMerge('traffic', 'rui', { resolve: { [TB]: { h1: 'both' } } });
  assert.deepEqual(r.merged, [TB]);
  assert.deepEqual(pullMergeLines(r), [`${TB}: merged by its lines.`]);
  const text = fs.readFileSync(path.join(dir, TB), 'utf8');
  assert.ok(text.includes('-- Ana') && text.includes('-- Rui'));
  assert.doesNotMatch(text, /^(<<<<<<<|=======|>>>>>>>)/m);
});

test('Merge Branch…\'s errors: the project\'s own branch, a branch nowhere, changes not committed', async () => {
  await assert.rejects(G.gitMerge('traffic', 'ana'), { message: '\'ana\' is the project\'s branch: a branch is not merged into itself', hint: 'Choose another branch.', status: 400 });
  await assert.rejects(G.gitMerge('traffic', 'nobody'), { message: 'no branch \'nobody\', here or on GitHub', hint: 'Switch Branch… lists the branches.', status: 404 });
  await assert.rejects(G.gitMerge('traffic', 'bad name'), { message: '\'bad name\' is not a valid branch name' });
  tbLine(dir, 'begin', 'begin -- not committed');
  await assert.rejects(G.gitMerge('traffic', 'main'), { message: 'the project has 1 change(s) not committed', hint: 'Commit your changes first, then Merge Branch….', status: 409 });
  sh(dir, 'checkout', '--', TB);
  // (main: behind ana, merged in nothing)
  assert.equal((await G.gitMerge('traffic', 'main')).upToDate, true);
});

test('a project in no repository: the branches\' commands say so', async () => {
  fs.cpSync(path.join(ROOT, 'examples', 'gates'), path.join(ws, 'gates'), { recursive: true });
  for (const f of [() => G.gitBranches('gates'), () => G.gitNewBranch('gates', 'ana'), () => G.gitSwitch('gates', 'ana'), () => G.gitMerge('gates', 'ana')]) {
    await assert.rejects(f, { message: 'the project \'gates\' is not in a git repository', status: 409 });
  }
});
