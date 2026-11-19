// The MCP's git_clone onto a project of the same name (#4618, server/git-clone.js, server/mcp-git.js) against a local bare
// repository (no network): the old error by default (what the interface asks, said), if_exists "open", "rename",
// "replace" (the old project in the workspace's .trash folder; refused with changes nowhere else, named, unless
// discard_changes), a project in no repository, and the route's 409 carrying `existing` for the interface's question.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratchEnv, ROOT } from './server-helpers.js';

let tmp, ws, bare;
const G = await import('../server/git.js');
const { handle } = await import('../server/mcp.js');
const { gitCloneChoosing } = await import('../server/git-clone.js');
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };
const UNTRUSTED = ' It is untrusted, as every project from outside: Xilinx ISE and programming a board or a PROM wait until the user trusts it in the interface (Trust Project); the Silinx toolchain runs.';
const trash = () => (fs.existsSync(path.join(ws, '.trash')) ? fs.readdirSync(path.join(ws, '.trash')).map(n => n.replace(/-\d+$/, '')).sort() : []);

before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-mcp-git-exists-'));
  ws = process.env.SILINX_WORKSPACE;
  fs.writeFileSync(path.join(tmp, 'gitconfig'), '[user]\n\tname = Ana Aluna\n\temail = ana@example.com\n[init]\n\tdefaultBranch = main\n');
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: path.join(tmp, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', HOME: tmp });
  G.GIT_TESTING.localRemotes = true;
  bare = path.join(tmp, 'lab1.git');
  fs.mkdirSync(bare);
  sh(bare, 'init', '--quiet', '--bare');
  const seed = path.join(tmp, 'seed');
  fs.cpSync(path.join(ROOT, 'examples', 'blinky'), seed, { recursive: true });
  sh(seed, 'init', '--quiet');
  sh(seed, 'add', '-A');
  sh(seed, 'commit', '--quiet', '-m', 'Starter');
  sh(seed, 'push', '--quiet', bare, 'HEAD:main');
});
after(() => { G.GIT_TESTING.localRemotes = false; fs.rmSync(tmp, { recursive: true, force: true }); });

test('git_clone onto a project of the name: the error by default, then open, rename and replace', async () => {
  await ok('git_clone', { url: bare });
  // the regression: the old error, as before (with what if_exists may do)
  await fails('git_clone', { url: bare }, ['project \'lab1\' already exists',
    'It is a clone of the same repository; replacing it would lose nothing (every change committed and pushed).',
    'if_exists: "open" opens it (git_pull brings it up to date), "replace" replaces it, "rename" opens the repository as \'lab1-2\'.',
    'Hint: Choose another name for the project.'].join('\n'));
  await fails('git_clone', { url: bare, if_exists: 'error' }, ['project \'lab1\' already exists',
    'It is a clone of the same repository; replacing it would lose nothing (every change committed and pushed).',
    'if_exists: "open" opens it (git_pull brings it up to date), "replace" replaces it, "rename" opens the repository as \'lab1-2\'.',
    'Hint: Choose another name for the project.'].join('\n'));
  // open: as it is
  const o = await ok('git_clone', { url: bare, if_exists: 'open' });
  assert.equal(o.text, 'Project \'lab1\' already exists: opened as it is; it is a clone of local/lab1, which Pull brings up to date.');
  assert.deepEqual(o.data, { project: 'lab1', opened: true, url: bare, repository: 'local/lab1', sameRepository: true, warnings: [] });
  // rename: both kept
  const k = await ok('git_clone', { url: bare, if_exists: 'rename' });
  assert.equal(k.text, `Project 'lab1' kept as it is: the repository opened as 'lab1-2'.\nProject 'lab1-2' opened from the GitHub repository local/lab1.${UNTRUSTED}`);
  assert.deepEqual([k.data.project, k.data.renamedFrom, k.data.trusted], ['lab1-2', 'lab1', false]);
  // replace, nothing to lose: the old one in .trash
  const r = await ok('git_clone', { url: bare, if_exists: 'replace' });
  assert.equal(r.text, `Project 'lab1' replaced (the old one is in the workspace .trash folder).\nProject 'lab1' opened from the GitHub repository local/lab1.${UNTRUSTED}`);
  assert.deepEqual(r.data.replaced, { project: 'lab1', trashed: true, lost: [] });
  assert.deepEqual(trash(), ['lab1']);
  // a change, and a commit not pushed: refused, named; the project as it was
  await ok('write_file', { project: 'lab1', path: 'src/extra.v', text: 'module extra; endmodule\n' });
  await ok('git_commit', { project: 'lab1', message: 'Mine' });
  await ok('write_file', { project: 'lab1', path: 'src/more.v', text: 'module more; endmodule\n' });
  await fails('git_clone', { url: bare, if_exists: 'replace' }, ['project \'lab1\' not replaced: 2 uncommitted change(s); 1 commit(s) not pushed to GitHub',
    'It is a clone of the same repository; replacing it would lose: 2 uncommitted change(s); 1 commit(s) not pushed to GitHub.',
    'if_exists: "open" opens it (git_pull brings it up to date), "replace" replaces it (with discard_changes: true, losing that), "rename" opens the repository as \'lab1-3\'.',
    'Hint: Commit and push them first; or replace it anyway, losing them.'].join('\n'));
  assert.ok(fs.existsSync(path.join(ws, 'lab1', 'src', 'more.v')));
  assert.deepEqual(trash(), ['lab1']);
  // discard_changes: replaced, what it had said
  const d = await ok('git_clone', { url: bare, if_exists: 'replace', discard_changes: true });
  assert.equal(d.text.split('\n')[0], 'Project \'lab1\' replaced (the old one is in the workspace .trash folder): it had 2 uncommitted change(s); 1 commit(s) not pushed to GitHub.');
  assert.ok(!fs.existsSync(path.join(ws, 'lab1', 'src', 'more.v')));
  assert.deepEqual(trash(), ['lab1', 'lab1']);
  assert.ok(fs.readdirSync(path.join(ws, '.trash')).some(n => fs.existsSync(path.join(ws, '.trash', n, 'src', 'more.v'))), 'the old project kept in .trash');
});

test('git_clone onto a project in no repository: not the same repository, all of it would be lost', async () => {
  await ok('new_project', { name: 'mine' });
  await fails('git_clone', { url: bare, name: 'mine' }, ['project \'mine\' already exists',
    'It is not a clone of local/lab1; replacing it would lose: it is in no git repository: its files are nowhere else.',
    'if_exists: "open" opens it, "replace" replaces it (with discard_changes: true, losing that), "rename" opens the repository as \'mine-2\'.',
    'Hint: Choose another name for the project.'].join('\n'));
  const o = await ok('git_clone', { url: bare, name: 'mine', if_exists: 'open' });
  assert.equal(o.text, 'Project \'mine\' already exists: opened as it is; it is not a clone of local/lab1.');
  await fails('git_clone', { url: bare, name: 'mine', if_exists: 'replace' }, ['project \'mine\' not replaced: it is in no git repository: its files are nowhere else',
    'It is not a clone of local/lab1; replacing it would lose: it is in no git repository: its files are nowhere else.',
    'if_exists: "open" opens it, "replace" replaces it (with discard_changes: true, losing that), "rename" opens the repository as \'mine-2\'.',
    'Hint: Commit and push them first; or replace it anyway, losing them.'].join('\n'));
});

test('the route\'s function: the 409 carries what the interface asks', async () => {
  await assert.rejects(gitCloneChoosing({ url: bare, name: 'lab1' }), e => {
    assert.deepEqual([e.status, e.message, e.existing], [409, 'project \'lab1\' already exists', { project: 'lab1', repository: 'local/lab1', sameRepository: true, loss: [], suggested: 'lab1-3' }]);
    return true;
  });
});
