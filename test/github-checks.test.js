// A commit's checks on GitHub (#3194, core/github-checks.js), against the stand-in for GitHub (test/fake-github.mjs), no
// network:
// - none yet; running; done, with the annotations the Classroom workflow writes (core/grade-annotations.js, read back as
//   GitHub's runner parses them), its conclusion; several runs, one failed: the whole a failure;
// - by a branch's name as by a commit's hash; a private repository's only with the sign-in; a wrong ref refused before
//   any request; the token only in the Authorization header, never in a URL;
// - a check's link only if it is one of github.com's; long texts clipped;
// - the console's lines of each state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeGitHub } from './fake-github.mjs';
import { githubClient, GitHubError } from '../core/github-api.js';
import { commitChecks, checksLines } from '../core/github-checks.js';

const REPO = 'course/counter4-student';
function setup({ priv = false, signed = true } = {}) {
  const gh = fakeGitHub();
  gh.seed(REPO, { 'silinx.json': '{}\n' }, { private: priv });
  const client = githubClient({ fetch: gh.fetch, token: () => (signed ? gh.token : null) });
  return { gh, client, head: gh.head(REPO) };
}
const GRADED = [
  { level: 'failure', title: 'Silinx: counter4', message: '10 / 40 points, Wrong Answer' },
  { level: 'failure', title: 'Silinx: count', message: 'WA Wrong Answer, 0 / 30: cycle 1 (vectors line 4): q is 0000, expected 0001' },
  { level: 'notice', title: 'Silinx: impl', message: 'AC Accepted, 10 / 10' },
];

test('#3194 no check yet, then running, then done with the verdicts as annotations', async () => {
  const { gh, client, head } = setup();
  const at = { owner: 'course', repo: 'counter4-student', ref: head };
  assert.deepEqual(await commitChecks(client, at), { commit: head, state: 'none', conclusion: null, runs: [] });
  gh.setChecks(REPO, head, [{ name: 'grade', status: 'in_progress' }]);
  const running = await commitChecks(client, at);
  assert.deepEqual([running.state, running.conclusion, running.runs.map(r => [r.name, r.status, r.annotations.length])], ['pending', null, [['grade', 'in_progress', 0]]]);
  gh.setChecks(REPO, head, [{ name: 'grade', status: 'completed', conclusion: 'failure', annotations: GRADED }]);
  const done = await commitChecks(client, at);
  assert.deepEqual(done, { commit: head, state: 'completed', conclusion: 'failure', runs: [{
    name: 'grade', status: 'completed', conclusion: 'failure', url: `https://github.com/${REPO}/runs/${1002}`, title: null,
    annotations: [
      { level: 'error', title: 'Silinx: counter4', message: '10 / 40 points, Wrong Answer' },
      { level: 'error', title: 'Silinx: count', message: 'WA Wrong Answer, 0 / 30: cycle 1 (vectors line 4): q is 0000, expected 0001' },
      { level: 'info', title: 'Silinx: impl', message: 'AC Accepted, 10 / 10' },
    ] }] });
  // (the token in the header only)
  for (const r of gh.requests) assert.ok(!r.url.includes(gh.token), r.url);
  assert.ok(gh.requests.filter(r => r.url.includes('check-runs')).every(r => r.headers.authorization === `Bearer ${gh.token}`));
});

test('#3194 several runs: sorted by name, one failed makes the whole a failure; all passed a success', async () => {
  const { gh, client, head } = setup();
  const at = { owner: 'course', repo: 'counter4-student', ref: 'main' };   // (a branch's name)
  gh.setChecks(REPO, head, [{ name: 'lint', status: 'completed', conclusion: 'success' }, { name: 'grade', status: 'completed', conclusion: 'success', annotations: [GRADED[2]] }]);
  const ok = await commitChecks(client, at);
  assert.deepEqual([ok.commit, ok.state, ok.conclusion, ok.runs.map(r => r.name)], ['main', 'completed', 'success', ['grade', 'lint']]);
  gh.setChecks(REPO, head, [{ name: 'lint', status: 'completed', conclusion: 'timed_out' }, { name: 'grade', status: 'queued' }]);
  const bad = await commitChecks(client, at);
  assert.deepEqual([bad.state, bad.conclusion], ['pending', 'failure']);
});

test('#3194 a private repository\'s checks only with the sign-in; a wrong ref refused before any request', async () => {
  const { gh, head } = setup({ priv: true });
  const anon = githubClient({ fetch: gh.fetch, token: () => null });
  await assert.rejects(commitChecks(anon, { owner: 'course', repo: 'counter4-student', ref: head }), e => e instanceof GitHubError && e.status === 404 && /Sign in with GitHub first/.test(e.hint));
  const n = gh.requests.length;
  for (const ref of ['', '../../user', 'a b', 'x?y=1', `${'a'.repeat(251)}`]) {
    await assert.rejects(commitChecks(anon, { owner: 'course', repo: 'counter4-student', ref }), /not a commit or a branch/);
  }
  assert.equal(gh.requests.length, n);
});

test('#3194 a check\'s link only github.com\'s; long texts clipped', async () => {
  const { client } = setup();
  const runs = [{ id: 7, name: 'x'.repeat(300), status: 'completed', conclusion: 'success', html_url: 'javascript:alert(1)', output: { title: 'T', annotations_count: 1 } }];
  const fake = { repo: client.repo, pathOf: client.pathOf, request: async (m, p) => (p.includes('/annotations') ? [{ annotation_level: 'warning', title: null, message: 'm'.repeat(2000) }] : { check_runs: runs }) };
  const [r] = (await commitChecks(fake, { owner: 'o', repo: 'r', ref: 'main' })).runs;
  assert.deepEqual([r.url, r.name.length, r.title, r.annotations[0].level, r.annotations[0].title, r.annotations[0].message.length], [null, 201, 'T', 'warning', null, 1001]);
});

test('#3194 the console\'s lines: none, running, done with each verdict', () => {
  const sha = 'abcdef0123456789abcdef0123456789abcdef01';
  assert.deepEqual(checksLines({ commit: sha, state: 'none', runs: [] }), [{ level: 'info', text: 'No check on GitHub for commit abcdef0: the repository has no workflow, or it has not started yet.' }]);
  assert.deepEqual(checksLines({ commit: sha, state: 'pending', runs: [{ name: 'grade', status: 'queued', annotations: [] }] }), [{ level: 'info', text: 'grade: queued (commit abcdef0); Checks again shows its result.' }]);
  assert.deepEqual(checksLines({ commit: sha, state: 'completed', runs: [
    { name: 'grade', status: 'completed', conclusion: 'failure', url: 'https://github.com/o/r/runs/1', title: null, annotations: [{ level: 'error', title: 'Silinx: count', message: 'WA Wrong Answer, 0 / 30' }, { level: 'info', title: null, message: 'ok' }] },
    { name: 'lint', status: 'completed', conclusion: 'success', url: null, title: 'All good', annotations: [] }] }), [
    { level: 'error', text: 'grade: failure (commit abcdef0): https://github.com/o/r/runs/1' },
    { level: 'error', text: '  Silinx: count: WA Wrong Answer, 0 / 30' },
    { level: 'info', text: '  ok' },
    { level: 'info', text: 'lint: success (All good) (commit abcdef0)' },
  ]);
});

// (#4237) a fine-grained personal access token: GitHub's Checks refused ("Resource not accessible by personal access
// token"), the workflow runs' jobs and the commit's statuses read instead
const FALLBACK = 'This token cannot read GitHub\'s Checks (a fine-grained personal access token has no such permission): the workflows\' jobs and the commit\'s statuses instead, without the tests\' verdicts (their annotations).';
function fine(grants) {
  const s = setup();
  s.gh.fineGrained(grants);
  s.gh.setChecks(REPO, s.head, [{ name: 'grade', status: 'completed', conclusion: 'failure', annotations: GRADED }]);   // (unreadable with it)
  s.gh.setRuns(REPO, s.head, [{ name: 'GitHub Classroom Workflow', status: 'completed', conclusion: 'failure', jobs: [{ name: 'grade', status: 'completed', conclusion: 'failure' }, { name: 'lint', status: 'completed', conclusion: 'success' }] }]);
  s.gh.setStatuses(REPO, s.head, [{ context: 'ci/extra', state: 'success', description: 'All good', url: 'https://github.com/course/counter4-student/extra' }]);
  return s;
}

test('#4237 a fine-grained token: the jobs of the commit\'s workflow runs and its statuses, without the annotations; the console says so', async () => {
  const { gh, client, head } = fine({ actions: true, statuses: true });
  const c = await commitChecks(client, { owner: 'course', repo: 'counter4-student', ref: head });
  const RUN = 1002;   // (the workflow run's id; its jobs' ids from it)
  assert.deepEqual(c, { commit: head, state: 'completed', conclusion: 'failure', via: 'actions', unread: [], runs: [
    { name: 'ci/extra', status: 'completed', conclusion: 'success', url: 'https://github.com/course/counter4-student/extra', title: 'All good', annotations: [] },
    { name: 'grade', status: 'completed', conclusion: 'failure', url: `https://github.com/${REPO}/actions/runs/${RUN}/job/${RUN * 100}`, title: null, annotations: [] },
    { name: 'lint', status: 'completed', conclusion: 'success', url: `https://github.com/${REPO}/actions/runs/${RUN}/job/${RUN * 100 + 1}`, title: null, annotations: [] }] });
  assert.deepEqual(checksLines(c), [
    { level: 'info', text: FALLBACK },
    { level: 'info', text: 'ci/extra: success (All good) (commit ' + head.slice(0, 7) + '): https://github.com/course/counter4-student/extra' },
    { level: 'error', text: `grade: failure (commit ${head.slice(0, 7)}): https://github.com/${REPO}/actions/runs/${RUN}/job/${RUN * 100}` },
    { level: 'info', text: `lint: success (commit ${head.slice(0, 7)}): https://github.com/${REPO}/actions/runs/${RUN}/job/${RUN * 100 + 1}` },
  ]);
  // (the requests: the Checks refused once, then the runs by the commit's hash, its jobs, its status; the token in the header only)
  assert.deepEqual(gh.requests.map(r => r.url.replace(/\/repos\/course\/counter4-student/, '').replace(head, 'HEAD')), [
    '/commits/HEAD/check-runs?per_page=100', '/actions/runs?head_sha=HEAD&per_page=100', '/commits/HEAD/status', `/actions/runs/${RUN}/jobs?per_page=100`]);
  for (const r of gh.requests) assert.ok(!r.url.includes(gh.token) && r.headers.authorization === `Bearer ${gh.token}`, r.url);
});

test('#4237 a fine-grained token: by a branch\'s name; running; no workflow and no status: none', async () => {
  const { gh, client, head } = fine({ actions: true, statuses: true });
  gh.setRuns(REPO, head, [{ name: 'CI', status: 'queued', jobs: [] }]);   // (no job yet: the run itself)
  gh.setStatuses(REPO, head, []);
  const c = await commitChecks(client, { owner: 'course', repo: 'counter4-student', ref: 'main' });
  assert.deepEqual([c.commit, c.state, c.conclusion, c.via, c.runs.map(r => [r.name, r.status])], ['main', 'pending', null, 'actions', [['CI', 'queued']]]);
  gh.setRuns(REPO, head, []);
  const none = await commitChecks(client, { owner: 'course', repo: 'counter4-student', ref: head });
  assert.deepEqual([none.state, none.conclusion, none.runs], ['none', null, []]);
  assert.deepEqual(checksLines(none), [{ level: 'info', text: FALLBACK }, { level: 'info', text: `No check on GitHub for commit ${head.slice(0, 7)}: the repository has no workflow, or it has not started yet.` }]);
});

test('#4237 a fine-grained token with one of the two permissions: what it reads, the other said as a warning', async () => {
  const only = async (grants) => { const { client, head } = fine(grants); return commitChecks(client, { owner: 'course', repo: 'counter4-student', ref: head }); };
  const a = await only({ actions: true });
  assert.deepEqual([a.unread, a.runs.map(r => r.name), a.conclusion], [['Commit statuses: read'], ['grade', 'lint'], 'failure']);
  assert.deepEqual(checksLines(a).slice(0, 2), [{ level: 'info', text: FALLBACK }, { level: 'warning', text: 'GitHub refused the commit\'s statuses: the token needs Commit statuses: read on the repository.' }]);
  const s = await only({ statuses: true });
  assert.deepEqual([s.unread, s.runs.map(r => r.name), s.conclusion], [['Actions: read'], ['ci/extra'], 'success']);
  assert.deepEqual(checksLines(s)[1], { level: 'warning', text: 'GitHub refused the workflow runs: the token needs Actions: read on the repository.' });
});

test('#4237 a fine-grained token with neither: the error names the permissions to add; a rate limit is no refusal', async () => {
  const { client, head } = fine({});
  await assert.rejects(commitChecks(client, { owner: 'course', repo: 'counter4-student', ref: head }), e => e instanceof GitHubError && e.status === 403
    && e.message === 'GitHub refused this token the commit\'s checks: a fine-grained personal access token needs Actions: read and Commit statuses: read on course/counter4-student'
    && e.hint === 'Edit the token on GitHub (Settings ▸ Developer settings ▸ Fine-grained tokens) and add those two repository permissions. The tests\' verdicts (GitHub\'s Checks) need a classic token or Sign in with GitHub….');
  // (a rate limit: GitHub's own error, nothing else asked)
  const asked = [];
  const limited = { repo: client.repo, pathOf: client.pathOf, request: async (m, p) => { asked.push(p); throw new GitHubError('GitHub refused the request (API rate limit exceeded for this address.)', 'Wait an hour.', 403); } };
  await assert.rejects(commitChecks(limited, { owner: 'o', repo: 'r', ref: 'main' }), /API rate limit exceeded/);
  assert.equal(asked.length, 1);
});
