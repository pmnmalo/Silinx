// Git's branches in the workspace's repository (#4213, server/git-branch.js): one repository holding two projects (the
// traffic example as 'a', gates as 'b'). A switch or a merge of 'a' changes every project of it, so another project's
// changes not committed refuse it (they are never lost: the review of #4391). A switch the import gate refuses (a NUL
// byte in an HDL file of the branch) is undone: back on the branch it was on, the project's files as they were, nothing
// of the other project touched.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratchEnv, ROOT } from './server-helpers.js';

let tmp, ws;
const G = await import('../server/git.js');
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const B_FILE = () => path.join(ws, 'b', 'src', fs.readdirSync(path.join(ws, 'b', 'src')).find(f => f.endsWith('.vhd')));

before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-git-branch-ws-'));
  ws = process.env.SILINX_WORKSPACE;
  fs.writeFileSync(path.join(tmp, 'gitconfig'), '[user]\n\tname = Ana Aluna\n\temail = ana@example.com\n[init]\n\tdefaultBranch = main\n');
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: path.join(tmp, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', HOME: tmp });
  fs.cpSync(path.join(ROOT, 'examples', 'traffic'), path.join(ws, 'a'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'examples', 'gates'), path.join(ws, 'b'), { recursive: true });
  sh(ws, 'init', '--quiet');
  sh(ws, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  sh(ws, 'add', '-A');
  sh(ws, 'commit', '--quiet', '-m', 'Two projects');
  // a branch whose file of 'a' the import gate refuses
  sh(ws, 'switch', '--quiet', '-c', 'bad');
  fs.writeFileSync(path.join(ws, 'a', 'src', 'bad.vhd'), 'entity bad is\0 end;\n');
  sh(ws, 'add', '-A');
  sh(ws, 'commit', '--quiet', '-m', 'A NUL byte');
  sh(ws, 'switch', '--quiet', 'main');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('another project\'s changes not committed refuse a switch and a merge; they are kept', async () => {
  const f = B_FILE();
  const edited = `${fs.readFileSync(f, 'utf8')}-- b's edit, not committed\n`;
  fs.writeFileSync(f, edited);
  const rel = path.relative(ws, f).split(path.sep).join('/');
  for (const [p, again] of [[() => G.gitSwitch('a', 'bad'), 'Switch Branch…'], [() => G.gitMerge('a', 'bad'), 'Merge Branch…']]) {
    await assert.rejects(p, e => {
      assert.equal(e.message, `the repository has 1 change(s) not committed outside the project (${rel})`);
      assert.equal(e.hint, `${again} changes every project of the repository: commit the other projects' changes first.`);
      assert.equal(e.status, 409);
      return true;
    });
  }
  assert.equal(sh(ws, 'symbolic-ref', '--short', 'HEAD'), 'main');
  assert.equal(fs.readFileSync(f, 'utf8'), edited);
  sh(ws, 'checkout', '--', rel);
});

test('a switch the import gate refuses is undone: on its branch again, the files as they were, the other project untouched', async () => {
  const f = B_FILE(), b = fs.readFileSync(f, 'utf8');
  const head = sh(ws, 'rev-parse', 'HEAD');
  await assert.rejects(G.gitSwitch('a', 'bad'), e => {
    assert.match(e.message, /^git switch: a\/src\/bad\.vhd: [^;]*NUL[^;]*: nothing was switched, the project's files are as they were$/);
    assert.equal(e.status, 422);
    return true;
  });
  assert.equal(sh(ws, 'symbolic-ref', '--short', 'HEAD'), 'main');
  assert.equal(sh(ws, 'rev-parse', 'HEAD'), head);
  assert.ok(!fs.existsSync(path.join(ws, 'a', 'src', 'bad.vhd')));
  assert.equal(sh(ws, 'status', '--porcelain'), '');
  assert.equal(fs.readFileSync(f, 'utf8'), b);
  // (the branch, made before: kept)
  assert.equal(sh(ws, 'branch', '--list', 'bad').replace(/^[* ]+/, ''), 'bad');
});
