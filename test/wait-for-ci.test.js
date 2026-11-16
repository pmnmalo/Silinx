// A release only of a commit that CI passed, the tests not run again (#416); CI at a release only, started
// by the tag (#607): scripts/wait-for-ci.mjs and .github/workflows/release.yml.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verdict, next } from '../scripts/wait-for-ci.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (id, status, conclusion = null, event = 'push', head_branch = 'v15.12.0') =>
  ({ id, status, conclusion, event, head_branch, html_url: `https://github.com/o/r/actions/runs/${id}` });

test('wait for CI: the verdict from the runs of the commit', () => {
  assert.deepEqual(verdict([run(1, 'completed', 'success')]), { state: 'success', reason: 'CI passed (v15.12.0): https://github.com/o/r/actions/runs/1' });
  assert.deepEqual(verdict([run(2, 'in_progress')]), { state: 'pending', reason: 'CI (v15.12.0) is in progress: https://github.com/o/r/actions/runs/2' });
  assert.deepEqual(verdict([run(3, 'queued')]), { state: 'pending', reason: 'CI (v15.12.0) is queued: https://github.com/o/r/actions/runs/3' });
  assert.deepEqual(verdict([run(4, 'completed', 'failure')]), { state: 'failure', reason: 'CI did not pass (failure): https://github.com/o/r/actions/runs/4' });
  assert.deepEqual(verdict([run(4, 'completed', 'failure'), run(5, 'completed', 'cancelled')]),
    { state: 'failure', reason: 'CI did not pass (failure, cancelled): https://github.com/o/r/actions/runs/4, https://github.com/o/r/actions/runs/5' });
  assert.deepEqual(verdict([]), { state: 'none', reason: 'no CI run of the tag or of main for this commit' });
  // a run of main counts: by hand (Actions ▸ Run workflow), or a push from before #607
  assert.equal(verdict([run(12, 'completed', 'success', 'workflow_dispatch', 'main')]).reason, 'CI passed (main): https://github.com/o/r/actions/runs/12');
  assert.equal(verdict([run(13, 'completed', 'success', 'push', 'main')]).state, 'success');
  // a pull request's run, a branch's, or one by hand on a branch, is not the release's
  assert.equal(verdict([run(6, 'completed', 'success', 'pull_request', 'claude/x')]).state, 'none');
  assert.equal(verdict([run(7, 'completed', 'success', 'push', 'claude/x')]).state, 'none');
  assert.equal(verdict([run(14, 'completed', 'success', 'workflow_dispatch', 'claude/x')]).state, 'none');
  assert.equal(verdict([run(15, 'completed', 'success', 'push', 'version-notes')]).state, 'none', 'a branch named like a word, not a tag');
  // one passed (a re-run) is enough; one still running is waited for
  assert.equal(verdict([run(8, 'completed', 'failure'), run(9, 'completed', 'success')]).state, 'success');
  assert.equal(verdict([run(8, 'completed', 'failure'), run(10, 'in_progress')]).state, 'pending');
  assert.equal(verdict([{ id: 11, status: 'completed', conclusion: 'success', event: 'push', head_branch: 'v1.2.3' }]).reason, 'CI passed (v1.2.3): run 11');
  // the toolchain package's tag (#1681) counts as the IDE's; a tag named like it but not a version does not
  assert.equal(verdict([run(16, 'completed', 'success', 'push', 'silinx-fpga-v0.1.0')]).reason, 'CI passed (silinx-fpga-v0.1.0): https://github.com/o/r/actions/runs/16');
  assert.equal(verdict([run(17, 'in_progress', null, 'push', 'silinx-fpga-v0.1.0')]).state, 'pending');
  assert.equal(verdict([run(18, 'completed', 'success', 'push', 'silinx-fpga-next')]).state, 'none');
  assert.equal(verdict([run(19, 'completed', 'success', 'push', 'other-v1.0.0')]).state, 'none');
});

test('wait for CI: a scheduled run of main is not a release\'s (#3423)', () => {
  // the nightly run of the whole CI (ci.yml's schedule) passed or failed on the commit: the tag's run is still waited for
  const nightly = (id, status, conclusion) => run(id, status, conclusion, 'schedule', 'main');
  assert.equal(verdict([nightly(1, 'completed', 'success')]).state, 'none');
  assert.equal(verdict([nightly(1, 'completed', 'failure'), run(2, 'in_progress')]).state, 'pending');
  assert.equal(verdict([nightly(1, 'completed', 'failure'), run(2, 'completed', 'success')]).state, 'success');
  assert.equal(verdict([nightly(1, 'completed', 'success'), run(2, 'completed', 'failure')]).state, 'failure');
});

test('wait for CI: a run\'s latest attempt (#4236)', () => {
  // the API's run is its latest attempt: a re-run of the failed jobs makes the run going again, then passed
  const attempt = (n, status, conclusion) => ({ ...run(20, status, conclusion), run_attempt: n });
  assert.deepEqual(verdict([attempt(2, 'in_progress')]), { state: 'pending', reason: 'CI (v15.12.0) is in progress: https://github.com/o/r/actions/runs/20 (attempt 2)' });
  assert.deepEqual(verdict([attempt(2, 'completed', 'success')]), { state: 'success', reason: 'CI passed (v15.12.0): https://github.com/o/r/actions/runs/20 (attempt 2)' });
  assert.equal(verdict([attempt(3, 'completed', 'failure')]).reason, 'CI did not pass (failure): https://github.com/o/r/actions/runs/20 (attempt 3)');
  assert.equal(verdict([attempt(1, 'completed', 'failure')]).reason, 'CI did not pass (failure): https://github.com/o/r/actions/runs/20');
});

test('wait for CI: when to stop waiting', () => {
  const ok = { state: 'success', reason: 'CI passed' }, going = { state: 'pending', reason: 'CI is in progress' };
  const failed = { state: 'failure', reason: 'CI did not pass (failure)' }, none = { state: 'none', reason: 'no CI run' };
  assert.deepEqual(next(ok, 500, null), { action: 'done', failedSince: null });
  // no limit by default while CI is going
  assert.deepEqual(next(going, 10000, null), { action: 'wait', failedSince: null });
  assert.deepEqual(next(going, 99, null, { timeout: 100 }), { action: 'wait', failedSince: null });
  assert.deepEqual(next(going, 100, null, { timeout: 100 }), { action: 'CI is in progress after 100 minutes: run this workflow again once CI has passed', failedSince: null });
  // a failure fails at once, or after --rerun minutes with no new attempt
  assert.deepEqual(next(failed, 5, null), { action: 'CI did not pass (failure)', failedSince: 5 });
  assert.deepEqual(next(failed, 5, null, { rerun: 30 }), { action: 'wait', failedSince: 5 });
  assert.deepEqual(next(failed, 34, 5, { rerun: 30 }), { action: 'wait', failedSince: 5 });
  assert.deepEqual(next(failed, 35, 5, { rerun: 30 }), { action: 'CI did not pass (failure), and not run again in 30 minutes', failedSince: 5 });
  // run again: going, the failure forgotten (a second failure has its own 30 minutes)
  assert.deepEqual(next(going, 20, 5, { rerun: 30 }), { action: 'wait', failedSince: null });
  assert.deepEqual(next(failed, 100, null, { rerun: 30 }), { action: 'wait', failedSince: 100 });
  // the timeout ends a wait for a re-run too
  assert.equal(next(failed, 200, 190, { rerun: 30, timeout: 200 }).action, 'CI did not pass (failure) after 200 minutes: run this workflow again once CI has passed');
  // no run: --appear minutes for one to start
  assert.deepEqual(next(none, 9, null), { action: 'wait', failedSince: null });
  assert.equal(next(none, 10, null).action, 'no CI run after 10 minutes: did CI start on the tag?');
  assert.equal(next(none, 3, null, { appear: 3 }).action, 'no CI run after 3 minutes: did CI start on the tag?');
});

// the Release workflows' options for the script (--timeout, --appear, --rerun)
function waitOptions(yml) {
  const line = /run: node scripts\/wait-for-ci\.mjs "\$GITHUB_SHA"(.*)\n/.exec(yml)[1];
  const opt = name => { const m = new RegExp(`--${name} (\\d+)`).exec(line); return m ? +m[1] : undefined; };
  return { timeout: opt('timeout'), appear: opt('appear'), rerun: opt('rerun') };
}

test('wait for CI: v15.26.0\'s release, which gave up while CI\'s second attempt ran (#4236)', () => {
  // the commit's two tags pushed together at 05:51: CI's runs one at a time (ci.yml's concurrency). v15.26.0's run
  // failed at 06:56; its failed jobs run again at 06:59 waited for silinx-fpga-v0.4.3's run (failed at 07:55), then
  // passed at 08:24, 153 minutes after the release started
  const ide = (status, conclusion, n = 1) => ({ ...run(1, status, conclusion, 'push', 'v15.26.0'), run_attempt: n });
  const fpga = (status, conclusion) => run(2, status, conclusion, 'push', 'silinx-fpga-v0.4.3');
  const at = m => m < 65 ? [ide('in_progress'), fpga('pending')]
    : m < 68 ? [ide('completed', 'failure'), fpga('queued')]
    : m < 124 ? [ide('pending', null, 2), fpga('in_progress')]
    : m < 153 ? [ide('in_progress', null, 2), fpga('completed', 'failure')]
    : [ide('completed', 'success', 2), fpga('completed', 'failure')];
  const replay = options => {
    let failedSince = null;
    for (let m = 0; ; m++) {
      let action;
      ({ action, failedSince } = next(verdict(at(m)), m, failedSince, options));
      if (action !== 'wait') return { action, m };
    }
  };
  // before: 150 minutes, at most
  assert.deepEqual(replay({ timeout: 150, appear: 10 }), { action: 'CI (v15.26.0) is in progress: https://github.com/o/r/actions/runs/1 (attempt 2) after 150 minutes: run this workflow again once CI has passed', m: 150 });
  for (const file of ['release.yml', 'silinx-fpga-release.yml']) {
    const options = waitOptions(fs.readFileSync(path.join(ROOT, '.github/workflows', file), 'utf8'));
    assert.deepEqual(replay(options), { action: 'done', m: 153 }, file);
    // and had the tag's run been the only one, its failure would have waited for the re-run too
    let failedSince = null;
    for (let m = 0; m < 153; m++) {
      const runs = at(m).filter(r => r.id === 1);
      let action;
      ({ action, failedSince } = next(verdict(runs), m, failedSince, options));
      assert.equal(action, 'wait', `${file}, minute ${m}`);
    }
  }
});

test('wait for CI: the command line without its arguments', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/wait-for-ci.mjs')], { encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: '' } });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'usage: wait-for-ci.mjs <sha> [--timeout <minutes>] [--appear <minutes>] [--rerun <minutes>] (in GitHub Actions)\n');
});

test('release: CI on the tagged commit instead of npm test, the commit on main; the packages still checked', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
  assert.doesNotMatch(yml, /npm test\b/);
  // the CI run read by the build job; the writing permissions are the publish job's (test/release-workflow.test.js, #2644)
  assert.match(yml, /\npermissions:\n {2}actions: read .*\n {2}contents: read\n/);
  assert.match(yml, /- name: CI passed\n\s+run: node scripts\/wait-for-ci\.mjs "\$GITHUB_SHA" --timeout (\d+) --appear \d+ --rerun \d+\n\s+env:\n\s+GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  // the tagged commit on main (#607: CI runs on the tag, so a tag elsewhere would pass it too)
  assert.match(yml, /uses: actions\/checkout@.+\n\s+with:\n\s+fetch-depth: 0\n/);
  assert.match(yml, /- name: The commit is on main\n\s+run: git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main\n/);
  // CI starts on the tag, with the release (ci.yml)
  assert.match(fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'), /^on:\n {2}push:\n {4}tags: \['v\*', 'silinx-fpga-v\*'\]\n {2}schedule:\n {4}- cron: .*\n {2}workflow_dispatch:\n/m);
  // the job's limit above the wait's, with time to package and check
  const wait = +/--timeout (\d+)/.exec(yml)[1], job = +/\n {4}timeout-minutes: (\d+)\n/.exec(yml)[1];
  assert.ok(job >= wait + 15, `${job} >= ${wait} + 15`);
  // as long as a job may run (GitHub's limit, 360 minutes): another tag's CI, this one's and a re-run (#4236)
  assert.ok(job <= 360 && wait >= 300, `${wait} minutes' wait in a job of ${job}`);
  // in order: CI, the single-file edition, the packages, their test, the release
  const at = s => { const i = yml.indexOf(s); assert.ok(i > 0, s); return i; };
  const order = ['run: git merge-base --is-ancestor', 'run: node scripts/wait-for-ci.mjs', 'run: node scripts/build-standalone.mjs', 'run: node scripts/package-release.mjs', 'run: npm run test:release', 'gh release create'].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});
