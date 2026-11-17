// The MCP server's branches (#4213, server/mcp-git.js: git_branch, git_switch, git_merge) through the system's git,
// against a local bare repository: the branches listed, a branch made and pushed, another person's branch (only on
// GitHub) switched to and back, merged in (a drawing's different objects at once; the same object a conflict named by
// its id, then resolved with `resolve`), the texts as the interface's console says them, and the errors (a bad name, a
// change not committed, a bad choice).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratchEnv, ROOT } from './server-helpers.js';

let tmp, ws, bare, dir, rui;
const G = await import('../server/git.js');
const { handle } = await import('../server/mcp.js');
const FSM = 'src/traffic.fsm.json';
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const edit = (at, fn) => { const f = path.join(at, FSM); const m = JSON.parse(fs.readFileSync(f, 'utf8')); fn(m); fs.writeFileSync(f, `${JSON.stringify(m, null, 2)}\n`); };
const tr = (m, k) => m.transitions.find(x => x.id === k);
const fsmNow = () => JSON.parse(fs.readFileSync(path.join(dir, FSM), 'utf8'));
// Rui's change, on his branch, pushed
const ruis = (fn, msg) => { edit(rui, fn); sh(rui, 'commit', '--quiet', '-am', msg); sh(rui, 'push', '--quiet', 'origin', 'rui'); };

before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-mcp-git-branch-'));
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
  await ok('git_clone', { url: bare, name: 'traffic' });
  dir = path.join(ws, 'traffic');
  rui = path.join(tmp, 'rui');
  sh(tmp, 'clone', '--quiet', bare, rui);
  sh(rui, 'switch', '--quiet', '-c', 'rui');
});
after(() => { G.GIT_TESTING.localRemotes = false; fs.rmSync(tmp, { recursive: true, force: true }); });

test('git_branch: the branches listed; a new one made, its name checked; pushed', async () => {
  const l = await ok('git_branch', { project: 'traffic' });
  assert.equal(l.text, 'traffic: on main; 1 branch(es):\n  * main');
  assert.deepEqual(l.data.branches, [{ name: 'main', current: true, local: true, remote: true }]);
  const bad = await call('git_branch', { project: 'traffic', branch: 'ana lima' });
  assert.equal(bad.isError, true);
  assert.equal(bad.text, 'git_branch: \'ana lima\' is not a valid branch name\nHint: A branch\'s name has letters, digits, -, _, . and /, no spaces (e.g. ana, or ana/traffic-lights).');
  const n = await ok('git_branch', { project: 'traffic', branch: 'ana' });
  assert.equal(n.text, 'Branch ana made from main: the project is on it now; Push sends it to GitHub.');
  assert.equal(n.data.branch, 'ana');
  assert.equal((await ok('git_push', { project: 'traffic' })).text, 'Pushed ana to local/traffic.');
  ruis(m => { tr(m, 't2').cond = 'not req'; }, 'Rui: t2');
  const all = await ok('git_branch', { project: 'traffic' });
  assert.equal(all.text, 'traffic: on ana; 3 branch(es):\n  * ana\n  main\n  rui (on GitHub)');
});

test('git_switch: a change not committed refused; another person\'s branch, and back', async () => {
  fs.appendFileSync(path.join(dir, 'src', 'lamps.vhd'), '-- a note\n');
  const no = await call('git_switch', { project: 'traffic', branch: 'rui' });
  assert.equal(no.isError, true);
  assert.equal(no.text, 'git_switch: the project has 1 change(s) not committed\nHint: Commit your changes first, then Switch Branch….');
  sh(dir, 'checkout', '--', 'src/lamps.vhd');
  const s = await ok('git_switch', { project: 'traffic', branch: 'rui' });
  assert.equal(s.text, `Switched to rui: 1 file(s) changed.\n  ${FSM}`);
  assert.equal(tr(fsmNow(), 't2').cond, 'not req');
  assert.equal((await ok('git_switch', { project: 'traffic', branch: 'rui' })).text, 'Already on rui.');
  assert.equal((await ok('git_switch', { project: 'traffic', branch: 'ana' })).text, `Switched to ana: 1 file(s) changed.\n  ${FSM}`);
});

test('git_merge: different objects at once; the same object a conflict named, then resolved; a bad choice refused', async () => {
  edit(dir, m => { tr(m, 't3').cond = 'req and not night'; });
  await ok('git_commit', { project: 'traffic', message: 'Ana: t3' });
  const m1 = await ok('git_merge', { project: 'traffic', branch: 'rui' });
  assert.equal(m1.text, `Merged rui into ana: 2 file(s) changed.\n  ${FSM}\n  src/traffic.vhd\n${FSM}: merged by its objects, its HDL made again.`);
  assert.deepEqual([tr(fsmNow(), 't2').cond, tr(fsmNow(), 't3').cond], ['not req', 'req and not night']);
  assert.equal((await ok('git_merge', { project: 'traffic', branch: 'rui' })).text, 'Already up to date: ana has every commit of rui.');
  ruis(m => { tr(m, 't1').cond = 'night or req'; }, 'Rui: t1');
  edit(dir, m => { tr(m, 't1').cond = 'night and not req'; });
  await ok('git_commit', { project: 'traffic', message: 'Ana: t1' });
  await ok('git_branch', { project: 'traffic' });
  const c = await call('git_merge', { project: 'traffic', branch: 'rui' });
  assert.equal(c.isError, true);
  assert.equal(c.text, [`git_merge: git merge: a conflict in ${FSM}: nothing was merged, the project's files are as they were`,
    `  ${FSM}: transitions/t1 (transitions t1): mine changed (cond), theirs changed (cond)`,
    'Hint: The same objects of a drawing changed on both branches: choose mine or theirs for each, then Merge Branch… again.'].join('\n'));
  const bad = await call('git_merge', { project: 'traffic', branch: 'rui', resolve: { [FSM]: { 'transitions/t1': 'both' } } });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /^git_merge: resolve: give \{ "<drawing>": \{ "<object>": "mine" \| "theirs" \} \}/);
  const r = await ok('git_merge', { project: 'traffic', branch: 'rui', resolve: { [FSM]: { 'transitions/t1': 'theirs' } } });
  assert.equal(r.text, `Merged rui into ana: 2 file(s) changed.\n  ${FSM}\n  src/traffic.vhd\n${FSM}: merged by its objects, its HDL made again.`);
  assert.equal(tr(fsmNow(), 't1').cond, 'night or req');
  assert.deepEqual(r.data.resolved, [FSM]);
});
