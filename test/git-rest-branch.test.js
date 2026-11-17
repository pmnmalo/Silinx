// Git's branches through GitHub's REST API (#4213, core/git-rest-branch.js: the browser edition's and SILINX_GIT=github's)
// against the fake GitHub (test/fake-github.mjs): the traffic example opened; the branches listed (GitHub's), New Branch…
// (made on GitHub at the last commit, its name checked; the next commit goes to it), Switch Branch… (the changes
// committed first; the project's files the branch's), Merge Branch…: another person's branch merged in from the two
// branches' merge base (a drawing's different objects at once and its HDL made again, the same object a conflict named
// then resolved, a text file's same lines by its hunks), a merge commit with both parents pushed; a branch only ahead
// moved forward; up to date; the errors. The same results and messages as the system git's (test/git-branch.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fakeGitHub } from './fake-github.mjs';
import { githubClient } from '../core/github-api.js';
import { restGit } from '../core/git-rest.js';
import { branchesText, newBranchText, switchText, mergeBranchText, pullMergeLines } from '../core/git-messages.js';
import { checkBranchName, BRANCH_HINT } from '../core/git-branch-name.js';

const FSM = 'src/traffic.fsm.json', TB = 'sim/tb_traffic.vhd', REPO = 'pmalo/traffic';
const FILES = {};
const dir = path.join(import.meta.dirname, '..', 'examples', 'traffic');
(function walk(base) {
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) walk(rel); else FILES[rel] = fs.readFileSync(path.join(dir, rel), 'utf8');
  }
})('');
const t = (m, id) => m.transitions.find(x => x.id === id);
const edit = (src, fn) => { const m = JSON.parse(src); fn(m); return `${JSON.stringify(m, null, 2)}\n`; };

// the browser's storage of projects (web/js/project-store.js) and the meta, as the back end sees them
async function setup() {
  const gh = fakeGitHub();
  gh.seed(REPO, FILES);
  const P = new Map(), M = new Map(), made = [];
  const projects = {
    exists: async n => P.has(n), files: async n => ({ ...P.get(n) }), create: async (n, files) => { P.set(n, { ...files }); },
    write: async (n, p, x) => { P.get(n)[p] = x; }, remove: async (n, p) => { delete P.get(n)[p]; }, regenerate: async (n, p) => { made.push(p); },
  };
  const meta = { get: async n => M.get(n) ?? null, set: async (n, m) => { M.set(n, structuredClone(m)); } };
  const git = restGit({ client: githubClient({ fetch: gh.fetch, token: () => gh.token }), projects, meta });
  await git.clone({ url: `https://github.com/${REPO}` });
  return { gh, git, made, files: () => P.get('traffic'), put: (p, x) => { P.get('traffic')[p] = x; } };
}
const rejects = (p, message, more = {}) => assert.rejects(p, e => { assert.equal(e.message, message); for (const [k, v] of Object.entries(more)) assert.deepEqual(e[k], v, k); return true; });
// Rui's commit on his branch, as he pushes it to GitHub
// (his branch made from main's first, as git push of a new branch does)
const ruis = (gh, files, message = 'Rui') => {
  const refs = gh.repos.get(REPO).refs;
  if (!refs.has('rui')) refs.set('rui', refs.get('main'));
  return gh.commitFiles(REPO, files, { branch: 'rui', message });
};

test('a branch\'s name checked as git checks it', () => {
  for (const ok of ['ana', 'ana/fsm', 'grupo-3_v2', 'a.b']) assert.equal(checkBranchName(` ${ok} `), ok);
  for (const [bad, why] of [['', 'a branch needs a name'], ['ana lima', '\'ana lima\' is not a valid branch name'], ['a..b', '\'a..b\' is not a valid branch name'],
    ['-x', '\'-x\' is not a valid branch name'], ['x/', '\'x/\' is not a valid branch name'], ['.x', '\'.x\' is not a valid branch name'], ['x.lock', '\'x.lock\' is not a valid branch name'],
    ['a:b', '\'a:b\' is not a valid branch name'], ['a@{1}', '\'a@{1}\' is not a valid branch name'], ['HEAD', '\'HEAD\' is not a valid branch name'],
    ['origin/main', '\'origin/main\' is not a valid branch name'], ['x'.repeat(101), `'${'x'.repeat(101)}' is not a valid branch name`]]) {
    assert.throws(() => checkBranchName(bad), e => { assert.equal(e.message, why); assert.equal(e.hint, BRANCH_HINT); assert.equal(e.status, 400); return true; });
  }
});

test('the branches listed; New Branch… on GitHub, the next commit on it; Switch Branch… and back', async () => {
  const { gh, git, files, put } = await setup();
  const l = await git.branches('traffic');
  assert.deepEqual(l, { project: 'traffic', branch: 'main', github: true, branches: [{ name: 'main', current: true, local: true, remote: true }], warnings: [] });
  assert.equal(branchesText(l), 'traffic: on main; 1 branch(es):\n  * main');
  await rejects(git.newBranch('traffic', 'ana lima'), '\'ana lima\' is not a valid branch name', { hint: BRANCH_HINT, status: 400 });
  await rejects(git.newBranch('traffic', 'main'), 'a branch \'main\' already exists', { hint: 'Choose another name, or Switch Branch… to it.', status: 409 });
  const head = gh.head(REPO);
  const n = await git.newBranch('traffic', 'ana');
  assert.deepEqual(n, { project: 'traffic', branch: 'ana', from: 'main', commit: head, pushed: true });
  assert.equal(newBranchText(n), 'Branch ana made from main: the project is on it now, on GitHub too.');
  assert.equal(gh.head(REPO, 'ana'), head);
  put(TB, files()[TB].replace('begin', 'begin -- Ana'));
  const c = await git.commit('traffic', 'Ana: a note');
  assert.equal(c.branch, 'ana');
  assert.equal(gh.head(REPO, 'ana'), c.commit);
  assert.equal(gh.head(REPO, 'main'), head);
  ruis(gh, { [FSM]: edit(FILES[FSM], m => { t(m, 't2').cond = 'not req'; }) });
  assert.equal(branchesText(await git.branches('traffic')), 'traffic: on ana; 3 branch(es):\n  * ana\n  main\n  rui');
  // Switch Branch…
  put(TB, `${files()[TB]}-- not committed\n`);
  await rejects(git.switchBranch('traffic', 'rui'), 'the project has 1 change(s) not committed', { hint: 'Commit your changes first, then Switch Branch….', status: 409 });
  put(TB, files()[TB].replace('-- not committed\n', ''));
  await rejects(git.switchBranch('traffic', 'nobody'), 'no branch \'nobody\' on GitHub', { hint: 'New Branch… makes one.', status: 404 });
  const s = await git.switchBranch('traffic', 'rui');
  assert.deepEqual(s, { project: 'traffic', branch: 'rui', from: 'ana', switched: true, files: [TB, FSM] });
  assert.equal(switchText(s), `Switched to rui: 2 file(s) changed.\n  ${TB}\n  ${FSM}`);
  assert.equal(t(JSON.parse(files()[FSM]), 't2').cond, 'not req');
  assert.equal(files()[TB], FILES[TB]);
  assert.deepEqual((await git.status('traffic')).files, []);
  assert.equal((await git.status('traffic')).branch, 'rui');
  assert.deepEqual(await git.switchBranch('traffic', 'rui'), { project: 'traffic', branch: 'rui', from: 'rui', switched: false, files: [] });
  const back = await git.switchBranch('traffic', 'ana');
  assert.deepEqual(back.files, [TB, FSM]);
  assert.ok(files()[TB].includes('begin -- Ana'));
});

test('Merge Branch…: different objects at once, a merge commit with both parents; the same object a conflict, resolved; a text file\'s hunk; up to date', async () => {
  const { gh, git, made, files, put } = await setup();
  await git.newBranch('traffic', 'ana');
  put(FSM, edit(files()[FSM], m => { t(m, 't3').cond = 'req and not night'; }));
  await git.commit('traffic', 'Ana: t3');
  ruis(gh, { [FSM]: edit(FILES[FSM], m => { t(m, 't2').cond = 'not req'; m.states[0].x += 40; }) });
  const ana = gh.head(REPO, 'ana'), rui = gh.head(REPO, 'rui');
  const r = await git.merge('traffic', 'rui');
  assert.deepEqual(r, { project: 'traffic', branch: 'ana', from: 'rui', upToDate: false, files: [FSM], resolved: [FSM] });
  assert.equal(mergeBranchText(r), `Merged rui into ana: 1 file(s) changed.\n  ${FSM}`);
  assert.deepEqual(pullMergeLines(r), [`${FSM}: merged by its objects, its HDL made again.`]);
  assert.deepEqual(made, [FSM]);
  const m = JSON.parse(files()[FSM]);
  assert.deepEqual([t(m, 't2').cond, t(m, 't3').cond], ['not req', 'req and not night']);
  const merge = gh.commitOf(REPO, gh.head(REPO, 'ana'));
  assert.deepEqual(merge.parents, [ana, rui]);
  assert.equal(merge.message, 'Merge branch \'rui\' into ana');
  assert.equal(gh.filesAt(REPO, 'ana')[FSM], files()[FSM]);
  assert.deepEqual((await git.status('traffic')).files, []);
  const again = await git.merge('traffic', 'rui');
  assert.deepEqual(again, { project: 'traffic', branch: 'ana', from: 'rui', upToDate: true, files: [] });
  assert.equal(mergeBranchText(again), 'Already up to date: ana has every commit of rui.');
  // the same object changed differently on both branches
  ruis(gh, { [FSM]: edit(gh.filesAt(REPO, 'rui')[FSM], x => { t(x, 't1').cond = 'night or req'; }) });
  put(FSM, edit(files()[FSM], x => { t(x, 't1').cond = 'night and not req'; }));
  await git.commit('traffic', 'Ana: t1');
  const before = gh.head(REPO, 'ana');
  await rejects(git.merge('traffic', 'rui'), `git merge: a conflict in ${FSM}: nothing was merged, the project's files are as they were`, {
    hint: 'The same objects of a drawing changed on both branches: choose mine or theirs for each, then Merge Branch… again.', status: 409, resolvable: true,
    drawings: [{ path: FSM, kind: 'fsm', conflicts: [{ id: 'transitions/t1', label: 'transitions t1', mine: 'changed (cond)', theirs: 'changed (cond)' }] }], texts: [],
  });
  assert.equal(gh.head(REPO, 'ana'), before);
  assert.equal(t(JSON.parse(files()[FSM]), 't1').cond, 'night and not req');
  const ok = await git.merge('traffic', 'rui', { resolve: { [FSM]: { 'transitions/t1': 'theirs' } } });
  assert.deepEqual(ok.resolved, [FSM]);
  assert.equal(t(JSON.parse(gh.filesAt(REPO, 'ana')[FSM]), 't1').cond, 'night or req');
  // a text file's same lines: its hunk, resolved both
  ruis(gh, { [TB]: FILES[TB].replace('begin', 'begin -- Rui') });
  put(TB, files()[TB].replace('begin', 'begin -- Ana'));
  await git.commit('traffic', 'Ana: the test bench');
  await rejects(git.merge('traffic', 'rui'), `git merge: a conflict in ${TB}: nothing was merged, the project's files are as they were`, {
    hint: 'The same lines of a file changed on both branches: choose mine, theirs or both for each conflict, or write its lines, then Merge Branch… again.', status: 409, resolvable: true,
  });
  const both = await git.merge('traffic', 'rui', { resolve: { [TB]: { h1: 'both' } } });
  assert.deepEqual(both.merged, [TB]);
  assert.ok(gh.filesAt(REPO, 'ana')[TB].includes('-- Ana') && gh.filesAt(REPO, 'ana')[TB].includes('-- Rui'));
  assert.doesNotMatch(files()[TB], /^(<<<<<<<|=======|>>>>>>>)/m);
});

test('Merge Branch…: a branch only ahead moved forward, its files taken; the errors', async () => {
  const { gh, git, files, put } = await setup();
  ruis(gh, { [TB]: FILES[TB].replace('begin', 'begin -- Rui') }, 'Rui');
  // (main never moved: rui is only ahead of it)
  const r = await git.merge('traffic', 'rui');
  assert.deepEqual(r, { project: 'traffic', branch: 'main', from: 'rui', upToDate: false, files: [TB] });
  assert.equal(gh.head(REPO, 'main'), gh.head(REPO, 'rui'));
  assert.ok(files()[TB].includes('-- Rui'));
  assert.deepEqual((await git.status('traffic')).files, []);
  await rejects(git.merge('traffic', 'main'), '\'main\' is the project\'s branch: a branch is not merged into itself', { hint: 'Choose another branch.', status: 400 });
  await rejects(git.merge('traffic', 'nobody'), 'no branch \'nobody\' on GitHub', { hint: 'Switch Branch… lists the branches.', status: 404 });
  put(TB, `${files()[TB]}-- not committed\n`);
  await rejects(git.merge('traffic', 'rui'), 'the project has 1 change(s) not committed', { hint: 'Commit your changes first, then Merge Branch….', status: 409 });
});
