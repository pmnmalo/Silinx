#!/usr/bin/env node
// A release only of a commit that CI passed (#416): the Release workflow does not run the tests itself, it
// waits for the CI run of the tagged commit and fails when that run failed, or when the commit has no CI
// run. CI runs at a release only (#607): the push of the tag v* starts it (a run of the tag), alongside the
// Release workflow, so it is usually still running and the script waits for it (and the toolchain package's tag
// silinx-fpga-v*, alongside its npm publishing, #1681); a run of main started by
// hand (Actions ▸ CI ▸ Run workflow) on that commit counts too. A pull request's or a branch's does not.
// A run's state is its latest attempt's (the API's run is its last attempt): a run whose failed jobs are run again
// is waited for again, and a failed run is given --rerun minutes to be run again before the release fails (#4236).
// The wait has no limit of its own but --timeout: the tags' runs go one at a time (ci.yml's concurrency), so the
// release may wait for another tag's run, its own and a re-run of its failed jobs, hours in all (#4236: 150 minutes
// were not enough).
//
//   node scripts/wait-for-ci.mjs <sha> [--timeout <minutes, none>] [--appear <minutes, 10>] [--rerun <minutes, 0>]
//   (in GitHub Actions: GITHUB_TOKEN with actions: read, GITHUB_REPOSITORY)
import { fileURLToPath } from 'node:url';

/** { state: 'success' | 'failure' | 'pending' | 'none', reason } from the CI runs of a commit (the API's workflow_runs). */
export function verdict(runs) {
  const ours = runs.filter(r => (r.event === 'push' && /^(silinx-fpga-)?v\d/.test(r.head_branch)) || (['push', 'workflow_dispatch'].includes(r.event) && r.head_branch === 'main'));
  const url = r => (r.html_url || `run ${r.id}`) + (r.run_attempt > 1 ? ` (attempt ${r.run_attempt})` : '');
  const passed = ours.find(r => r.status === 'completed' && r.conclusion === 'success');
  if (passed) return { state: 'success', reason: `CI passed (${passed.head_branch}): ${url(passed)}` };
  const going = ours.find(r => r.status !== 'completed');
  if (going) return { state: 'pending', reason: `CI (${going.head_branch}) is ${going.status.replace('_', ' ')}: ${url(going)}` };
  if (ours.length) return { state: 'failure', reason: `CI did not pass (${ours.map(r => r.conclusion).join(', ')}): ${ours.map(url).join(', ')}` };
  return { state: 'none', reason: 'no CI run of the tag or of main for this commit' };
}

/**
 * What to do after a verdict, at `minutes` since the start: 'done', 'wait', or an Error's message. `failedSince` is
 * the minute the runs were first seen failed (null while one is going): a failure waits `rerun` minutes for its
 * failed jobs to be run again. Returns { action, failedSince }.
 */
export function next({ state, reason }, minutes, failedSince, { timeout = Infinity, appear = 10, rerun = 0 } = {}) {
  if (state === 'success') return { action: 'done', failedSince: null };
  if (state === 'failure') {
    failedSince ??= minutes;
    if (minutes - failedSince >= rerun) return { action: rerun ? `${reason}, and not run again in ${rerun} minutes` : reason, failedSince };
  } else failedSince = null;
  if (state === 'none' && minutes >= appear) return { action: `${reason} after ${appear} minutes: did CI start on the tag?`, failedSince };
  if (minutes >= timeout) return { action: `${reason} after ${timeout} minutes: run this workflow again once CI has passed`, failedSince };
  return { action: 'wait', failedSince };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? +args[i + 1] : d; };
  const sha = args[0];
  const limits = { timeout: opt('--timeout', Infinity), appear: opt('--appear', 10), rerun: opt('--rerun', 0) };
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
  if (!sha || !repo) { console.error('usage: wait-for-ci.mjs <sha> [--timeout <minutes>] [--appear <minutes>] [--rerun <minutes>] (in GitHub Actions)'); process.exit(2); }
  const start = Date.now();
  let failedSince = null;
  for (;;) {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=20`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(`GitHub API: ${r.status} ${r.statusText}`);
    const v = verdict((await r.json()).workflow_runs || []);
    console.log(`${sha.slice(0, 7)}: ${v.reason}`);
    let action;
    ({ action, failedSince } = next(v, (Date.now() - start) / 60000, failedSince, limits));
    if (action === 'done') return;
    if (action !== 'wait') throw new Error(action);
    await new Promise(res => setTimeout(res, 60000));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
