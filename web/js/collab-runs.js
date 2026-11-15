// The processes a shared project's owner runs, in the page (#4002, part 2; core/collab-runs.js): the owner's page sends
// its processes' marks, the console's lines of the run going on (or of the last one), the Design Summary's data
// (`runs`, at most once a second while a run goes on) and the reports of the build it has open (`reports`); a follower's
// page, while it follows the owner, shows the same marks in its Processes, the run's lines in its console (from where
// it was: none twice), the owner's Design Summary, and opens the owner's reports (read from what came, as its other
// files are: web/js/collab-follow-api.js).
import { api } from './api.js';
import { S, closeDoc, openFile, refreshSummary } from './app.js';
import { log, onLogLine } from './console.js';
import { renderProcesses } from './processes.js';
import { RUN_LIMITS, followedReports, followedRuns, redact, reportPath, reportsActivity, runSecrets, runsActivity } from '/core/collab-runs.js';

const RUNS_MS = 1000;

/** The owner's runs, sent: publish() (in its sharing's tracking), stop(). */
export function runsPublisher(session) {
  let run = { id: 0, lines: [], dropped: 0, busy: false }, summary = null, last = 0, reportsKey = null;
  const secrets = () => runSecrets(S.toolchain);
  const off = onLogLine((line, cls) => {
    if (!S.busy) return;
    if (!run.busy) run = { id: run.id + 1, lines: [], dropped: 0, busy: true };
    run.lines.push([redact(line, secrets()), cls]);
    // (the end of a long run's lines kept: what a follower gets is RUN_LIMITS.lines at most)
    if (run.lines.length > 2 * RUN_LIMITS.lines) { const n = run.lines.length - RUN_LIMITS.lines; run.lines.splice(0, n); run.dropped += n; }
  });
  const readSummary = async () => {
    const name = S.project?.name;
    try { const r = name ? await api.reports(name) : null; summary = r && r.available !== false ? r : null; } catch { summary = null; }
    last = 0;   // (sent at the next tick)
  };
  readSummary();
  return {
    publish() {
      if (!S.project) return;
      if (run.busy && !S.busy) { run.busy = false; readSummary(); }
      const now = Date.now();
      if (!S.busy || now - last >= RUNS_MS) {
        last = now;
        try { const v = runsActivity({ ...run, status: S.status, summary }); v.from += run.dropped; session.publish('runs', v); } catch { /* not sent */ }
      }
      const open = S.docs.filter(d => reportPath(d.path) && d.editor?.getValue);
      const key = open.map(d => `${d.path}:${d.editor.getValue().length}`).join('\n');
      if (key !== reportsKey) {
        reportsKey = key;
        try { session.publish('reports', reportsActivity(open.map(d => [d.path, redact(d.editor.getValue(), secrets())]))); } catch { /* not sent */ }
      }
    },
    stop: off,
  };
}

/** The owner's runs put on a follower's page (`st`: collab-activity.js followState; `get`: the session's activity);
 *  true when its reports changed (the owner's view then put again: a report it has open may open now). */
export async function followRuns(st, get) {
  const runs = get('runs');
  if (runs !== null && st.applied.runs !== runs) {
    st.applied.runs = runs;
    const r = followedRuns(runs);
    if (r) applyRuns(st, r);
  }
  const reports = get('reports');
  if (reports === null || st.applied.reports === reports) return false;
  st.applied.reports = reports;
  const f = followedReports(reports);
  if (!f) return false;
  // (a report open here that the owner's run made again: opened again, with its new text)
  for (const d of [...S.docs]) {
    const t = f.files[d.path];
    if (typeof t === 'string' && d.editor?.getValue && d.editor.getValue() !== t) { d.dirty = false; await closeDoc(d); await openFile(d.path).catch(() => {}); }
  }
  return true;
}

function applyRuns(st, r) {
  for (const k of Object.keys(S.status)) delete S.status[k];
  Object.assign(S.status, r.status);
  renderProcesses();
  // (a run's lines from where this page was: a new run's from its first line kept)
  if (st.run?.id !== r.id) st.run = { id: r.id, shown: r.from };
  for (let i = Math.max(0, st.run.shown - r.from); i < r.lines.length; i++) log(r.lines[i][0], r.lines[i][1]);
  st.run.shown = Math.max(st.run.shown, r.from + r.lines.length);
  const key = JSON.stringify(r.summary);
  if (st.summaryKey !== key) { st.summaryKey = key; refreshSummary(); }
}

/** A report of the owner's open (a document `file:build/…`): opened here when its text came (false: not one, or
 *  not come yet). */
export async function openReport(id, get) {
  const p = /^file:(.+)$/.exec(id)?.[1];
  if (!reportPath(p) || typeof followedReports(get('reports'))?.files[p] !== 'string') return false;
  try { await openFile(p); return true; } catch { return false; }
}
