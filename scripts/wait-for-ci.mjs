#!/usr/bin/env node
// A release only of a commit that CI passed (#416): the Release workflow does not run the tests itself, it
// waits for the CI run of the tagged commit and fails when that run failed, or when the commit has no CI
// run. CI runs at a release only (#607): the push of the tag v* starts it (a run of the tag), alongside the
// Release workflow, so it is usually still running and the script waits for it (and the toolchain package's tag
// silinx-fpga-v*, alongside its npm publishing, #1681, and the PIC24 emulator's silinx-pic24-v*, #5509); a run of
// main started by hand (Actions ▸ CI ▸ Run workflow) on that commit counts too. A pull request's or a branch's
// does not.
// A run's state is its latest attempt's (the API's run is its last attempt): a run whose failed jobs are run again
// is waited for again, and a failed run is given --rerun minutes to be run again before the release fails (#4236).
// The wait has no limit of its own but --timeout: the tags' runs go one at a time (ci.yml's concurrency), so the
// release may wait for another tag's run, its own and a re-run of its failed jobs, hours in all (#4236: 150 minutes
// were not enough). A transient error of the API (5xx, network) is retried with a backoff, a 4xx ends the wait (#5574).
//
//   node scripts/wait-for-ci.mjs <sha> [--timeout <minutes, none>] [--appear <minutes, 10>] [--rerun <minutes, 0>]
//   (in GitHub Actions: GITHUB_TOKEN with actions: read, GITHUB_REPOSITORY)
import { fileURLToPath } from 'node:url';

/**
 * The tags whose CI run a release takes: the IDE's v*, and each package's of ci.yml's tags (silinx-fpga-v*, #1681;
 * silinx-pic24-v*, #5514: its release found none of its tag's runs); test/wait-for-ci.test.js checks every tag of
 * ci.yml against it.
 */
export const RELEASE_TAG = /^(silinx-(?:fpga|pic24)-)?v\d/;

/** { state: 'success' | 'failure' | 'pending' | 'none', reason } from the CI runs of a commit (the API's workflow_runs). */
export function verdict(runs) {
  const ours = runs.filter(r => (r.event === 'push' && RELEASE_TAG.test(r.head_branch)) || (['push', 'workflow_dispatch'].includes(r.event) && r.head_branch === 'main'));
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

/**
 * A transient error of the GitHub API (#5574): a 5xx answer or a network error (fetch's TypeError) is retried, a 4xx
 * is not. The minutes to wait before the n-th retry (1, 2, 4, 8, 8…): `TRANSIENT_RETRIES` retries in a row at most,
 * about half an hour, then the error ends the wait.
 */
export const TRANSIENT_RETRIES = 5;
export const backoff = n => Math.min(8, 2 ** (n - 1));
const transient = e => e.status >= 500 || (e.status === undefined && e.name === 'TypeError');

/** The CI runs of a commit from the API (the injected fetch); an Error with its status when the API answers an error. */
async function runsOf(sha, { repo, token, fetch }) {
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=20`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw Object.assign(new Error(`GitHub API: ${r.status} ${r.statusText}`), { status: r.status });
  return (await r.json()).workflow_runs || [];
}

/**
 * Waits for the CI run of `sha`: resolves when it passed, throws when it did not (or a limit was reached). `fetch`,
 * `sleep(ms)`, `now()` and `log` are injected for the tests; a transient API error is logged and retried after its
 * backoff, within `limits.timeout`.
 */
export async function waitForCi(sha, { repo, token, limits = {}, fetch = globalThis.fetch, sleep = ms => new Promise(res => setTimeout(res, ms)), now = Date.now, log = console.log } = {}) {
  const start = now();
  const minutes = () => (now() - start) / 60000;
  let failedSince = null, errors = 0;
  for (;;) {
    let runs;
    try {
      runs = await runsOf(sha, { repo, token, fetch });
      errors = 0;
    } catch (e) {
      if (!transient(e)) throw e;
      errors++;
      const wait = backoff(errors);
      if (errors > TRANSIENT_RETRIES) throw new Error(`${e.message} (${TRANSIENT_RETRIES} retries failed)`);
      if (minutes() + wait > (limits.timeout ?? Infinity)) throw new Error(`${e.message}, and the --timeout of ${limits.timeout} minutes reached`);
      log(`${sha.slice(0, 7)}: ${e.message}: trying again in ${wait} minute${wait > 1 ? 's' : ''} (${errors} of ${TRANSIENT_RETRIES})`);
      await sleep(wait * 60000);
      continue;
    }
    const v = verdict(runs);
    log(`${sha.slice(0, 7)}: ${v.reason}`);
    let action;
    ({ action, failedSince } = next(v, minutes(), failedSince, limits));
    if (action === 'done') return;
    if (action !== 'wait') throw new Error(action);
    await sleep(60000);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? +args[i + 1] : d; };
  const sha = args[0];
  const limits = { timeout: opt('--timeout', Infinity), appear: opt('--appear', 10), rerun: opt('--rerun', 0) };
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
  if (!sha || !repo) { console.error('usage: wait-for-ci.mjs <sha> [--timeout <minutes>] [--appear <minutes>] [--rerun <minutes>] (in GitHub Actions)'); process.exit(2); }
  await waitForCi(sha, { repo, token, limits });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
