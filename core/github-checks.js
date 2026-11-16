// A commit's checks on GitHub (#3194): what GitHub's workflows said of a pushed commit, read through GitHub's REST API
// (core/github-api.js's client: the browser's sign-in, a server's GH_TOKEN, or none for a public repository). A GitHub
// Classroom assignment's workflow (server/classroom.js) runs the exercise's visible tests on each push and says each
// verdict as an annotation of its check run (core/grade-annotations.js): Git ▸ Checks and the MCP's git_checks give them
// to the student where the student works. A check's name, title and annotations are the repository's text (its
// workflows', a design's names): data, which the callers mark untrusted. Isomorphic.
// A fine-grained personal access token cannot read GitHub's Checks (GitHub gives those tokens no Checks permission:
// "Resource not accessible by personal access token", #4237): the commit's workflow runs and their jobs (Actions: read)
// and its statuses (Commit statuses: read) are read instead, in the same shape, without the annotations (via:
// 'actions'); refused too, the error names the permissions to add.
import { GitHubError } from './github-api.js';

const PER_PAGE = 100;
const MAX_ANNOTATIONS = 50;   // (of a run: GitHub keeps fifty of a job's)
const clip = (s, n = 1000) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n)}…` : t; };
const FAILED = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale']);
// a branch's name as git allows it (no .. or // or a segment starting with a dot): never a path of the API's own
const isBranch = b => /^[A-Za-z0-9._/-]{1,250}$/.test(b) && !b.split('/').some(x => !x || x.startsWith('.') || x.endsWith('.lock'));
const LEVEL = { notice: 'info', warning: 'warning', failure: 'error' };

/** A commit's checks: { commit, state ('none' | 'pending' | 'completed'), conclusion ('success' | 'failure' | null), runs:
 *  [{ name, status, conclusion, url, title, annotations: [{ level ('info' | 'warning' | 'error'), title, message }] }] }.
 *  ref: the commit's hash (or a branch). A run's annotations are read once it is completed. */
export async function commitChecks(client, { owner, repo, ref }) {
  if (!/^[0-9a-f]{40}$/.test(String(ref)) && !isBranch(String(ref))) throw new GitHubError(`not a commit or a branch: ${clip(ref, 80)}`, null, 400);
  const base = client.repo(owner, repo);
  let j;
  try { j = await client.request('GET', `${base}/commits/${client.pathOf(ref)}/check-runs?per_page=${PER_PAGE}`); } catch (e) {
    if (!refused(e)) throw e;
    return actionsChecks(client, { base, owner, repo, ref });
  }
  const runs = [];
  for (const c of (j?.check_runs || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const run = { name: clip(c.name, 200), status: c.status, conclusion: c.conclusion ?? null, url: safeUrl(c.html_url), title: c.output?.title ? clip(c.output.title, 300) : null, annotations: [] };
    if (c.status === 'completed' && c.output?.annotations_count > 0 && Number.isInteger(c.id)) {
      const list = await client.request('GET', `${base}/check-runs/${c.id}/annotations?per_page=${MAX_ANNOTATIONS}`);
      run.annotations = (Array.isArray(list) ? list : []).slice(0, MAX_ANNOTATIONS)
        .map(a => ({ level: LEVEL[a.annotation_level] || 'info', title: a.title ? clip(a.title, 200) : null, message: clip(a.message) }));
    }
    runs.push(run);
  }
  return { commit: ref, ...summary(runs), runs };
}

// the whole of a commit's runs: none, pending (one not completed) or completed; failed if one failed
function summary(runs) {
  const state = !runs.length ? 'none' : runs.every(r => r.status === 'completed') ? 'completed' : 'pending';
  return { state, conclusion: runs.some(r => FAILED.has(r.conclusion)) ? 'failure' : state === 'completed' ? 'success' : null };
}

// GitHub refused this token a read (its permissions), not a rate limit: what the fallback reads instead
const refused = e => e instanceof GitHubError && e.status === 403 && !/rate limit/i.test(e.message);
const ACTIONS = 'Actions: read', STATUSES = 'Commit statuses: read';

/** (#4237) A commit's checks from its workflow runs' jobs and its statuses, for a token that cannot read GitHub's Checks
 *  (a fine-grained personal access token): commitChecks's shape, via 'actions', unread: the permissions refused (one of
 *  the two). Both refused: an error naming them. */
async function actionsChecks(client, { base, owner, repo, ref }) {
  const sha = /^[0-9a-f]{40}$/.test(String(ref));
  const unread = [];
  const tryRead = async (path, permission) => { try { return await client.request('GET', path); } catch (e) { if (!refused(e)) throw e; unread.push(permission); return null; } };
  const wr = await tryRead(`${base}/actions/runs?${sha ? `head_sha=${ref}` : `branch=${encodeURIComponent(ref)}`}&per_page=${PER_PAGE}`, ACTIONS);
  const st = await tryRead(`${base}/commits/${client.pathOf(ref)}/status`, STATUSES);
  if (!wr && !st) {
    throw new GitHubError(`GitHub refused this token the commit's checks: a fine-grained personal access token needs ${ACTIONS} and ${STATUSES} on ${owner}/${repo}`,
      'Edit the token on GitHub (Settings ▸ Developer settings ▸ Fine-grained tokens) and add those two repository permissions. The tests\' verdicts (GitHub\'s Checks) need a classic token or Sign in with GitHub….', 403, { permissions: [ACTIONS, STATUSES] });
  }
  // (a branch: its newest commit's runs, the first listed)
  const all = wr?.workflow_runs || [];
  const head = sha ? ref : all[0]?.head_sha;
  const runs = [];
  for (const w of all.filter(x => x.head_sha === head)) {
    const jobs = (await client.request('GET', `${base}/actions/runs/${Number(w.id)}/jobs?per_page=${PER_PAGE}`))?.jobs || [];
    for (const k of jobs.length ? jobs : [w]) runs.push({ name: clip(k.name, 200), status: k.status, conclusion: k.conclusion ?? null, url: safeUrl(k.html_url), title: null, annotations: [] });
  }
  for (const t of st?.statuses || []) {
    runs.push({ name: clip(t.context, 200), status: t.state === 'pending' ? 'pending' : 'completed', conclusion: t.state === 'pending' ? null : t.state === 'error' ? 'failure' : t.state,
      url: safeUrl(t.target_url), title: t.description ? clip(t.description, 300) : null, annotations: [] });
  }
  runs.sort((a, b) => a.name.localeCompare(b.name));
  return { commit: ref, ...summary(runs), runs, via: 'actions', unread };
}

// a run's page on GitHub, only if it is one (the console makes it a link)
const safeUrl = u => (typeof u === 'string' && /^https:\/\/github\.com\/[^\s"'<>]+$/.test(u) ? u : null);

const STATE = { queued: 'queued', in_progress: 'running', waiting: 'waiting', pending: 'waiting', requested: 'waiting' };

/** The console's lines of a commit's checks: [{ level ('info' | 'warning' | 'error'), text }]. Read from the workflow
 *  runs (via 'actions', #4237): said first, and a permission refused as a warning. */
export function checksLines({ commit, state, runs, via = 'checks', unread = [] }) {
  const short = String(commit).slice(0, 7);
  const lines = via !== 'actions' ? [] : [
    { level: 'info', text: 'This token cannot read GitHub\'s Checks (a fine-grained personal access token has no such permission): the workflows\' jobs and the commit\'s statuses instead, without the tests\' verdicts (their annotations).' },
    ...unread.map(p => ({ level: 'warning', text: `GitHub refused ${p === ACTIONS ? 'the workflow runs' : 'the commit\'s statuses'}: the token needs ${p} on the repository.` }))];
  if (state === 'none') return [...lines, { level: 'info', text: `No check on GitHub for commit ${short}: the repository has no workflow, or it has not started yet.` }];
  for (const r of runs) {
    if (r.status !== 'completed') { lines.push({ level: 'info', text: `${r.name}: ${STATE[r.status] || r.status} (commit ${short}); Checks again shows its result.` }); continue; }
    const failed = FAILED.has(r.conclusion);
    lines.push({ level: failed ? 'error' : 'info', text: `${r.name}: ${r.conclusion}${r.title ? ` (${r.title})` : ''} (commit ${short})${r.url ? `: ${r.url}` : ''}` });
    for (const a of r.annotations) lines.push({ level: a.level, text: `  ${a.title ? `${a.title}: ` : ''}${a.message}` });
  }
  return lines;
}
