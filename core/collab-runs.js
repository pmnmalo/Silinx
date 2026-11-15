// The processes a shared project's owner runs, as its followers follow them (#4002, part 2; core/collab-activity.js):
// the channel `runs` (each process's mark, the current run's console lines, the Design Summary's data) and the channel
// `reports` (the reports of the build the owner has open: their texts). Each value as the owner makes it (capped: the
// lines of the run kept from its end, a report too large left out) and as a follower takes it (untrusted input: what is
// not one left out); the lines and the reports without the owner's computer's names (redact: its home folder, the ISE
// host it reaches over SSH, as the MCP's run_process gives them: server/mcp-util.js redactor).

/** The limits of what a run's follower gets: the lines of a run (kept from its end), a line's length, the Design
 *  Summary's JSON, a report's text, the reports' together (bytes). */
export const RUN_LIMITS = Object.freeze({ lines: 1000, line: 1000, linesBytes: 256 << 10, summary: 256 << 10, report: 512 << 10, reports: 768 << 10 });
const STATES = ['running', 'ok', 'warn', 'err', 'stale'];
const CLASSES = ['', 'hdr', 'ok', 'err', 'warn', 'info'];
const PROC_RE = /^[a-z][a-z0-9-]{0,31}$/;
// (a report of the build: build/<its path>, no hidden part, no '..')
const REPORT_RE = /^build\/(?:[\w-][\w.-]*\/){0,3}[\w-][\w.-]{0,127}$/;
export const reportPath = p => typeof p === 'string' && REPORT_RE.test(p) && !p.split('/').some(s => s === '..' || s.startsWith('.'));

const bytes = s => new TextEncoder().encode(s).length;

/** What the owner's computer's names are replaced with in what its followers get: [secret, placeholder], longest first
 *  (`toolchain`: api.toolchain()'s: its SSH host for ISE, its configuration's path, whose home folder it is in). */
export function runSecrets(toolchain) {
  const out = [];
  const ssh = toolchain?.config?.ssh || {};
  if (ssh.user && ssh.host) out.push([`${ssh.user}@${ssh.host}`, '<ISE host>']);
  if (ssh.host) out.push([String(ssh.host), '<ISE host>']);
  const home = /^((?:\/Users|\/home)\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/.exec(String(toolchain?.configPath || ''))?.[1];
  if (home) out.push([home, '~']);
  return out.filter(([s]) => s.length > 2).sort((a, b) => b[0].length - a[0].length);
}
/** A text with the secrets replaced. */
export const redact = (text, secrets = []) => secrets.reduce((t, [s, r]) => t.split(s).join(r), String(text));

/** The `runs` value: { id (the run's number), status: { process: state }, from (the index of the run's first line
 *  kept), lines: [[text, class]], summary (the Design Summary's data, null: none or too large) }; the lines kept from
 *  the run's end within RUN_LIMITS. */
export function runsActivity({ id = 0, status = {}, lines = [], summary = null }, limits = RUN_LIMITS) {
  const st = {};
  for (const [k, v] of Object.entries(status || {})) if (PROC_RE.test(k) && STATES.includes(v)) st[k] = v;
  const kept = [];
  let size = 0, from = lines.length;
  for (let i = lines.length - 1; i >= 0 && kept.length < limits.lines; i--) {
    const [text, cls] = lines[i];
    const line = [String(text).slice(0, limits.line), CLASSES.includes(cls) ? cls : ''];
    size += bytes(line[0]) + 8;
    if (size > limits.linesBytes) break;
    kept.unshift(line);
    from = i;
  }
  const s = summary && bytes(JSON.stringify(summary)) <= limits.summary ? summary : null;
  return { id, status: st, from, lines: kept, summary: s };
}

/** A `runs` value as a follower takes it (untrusted): what is not one left out; null: not one. */
export function followedRuns(v, limits = RUN_LIMITS) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || !Number.isSafeInteger(v.id) || v.id < 0) return null;
  const status = {};
  if (v.status && typeof v.status === 'object' && !Array.isArray(v.status)) for (const [k, s] of Object.entries(v.status)) if (PROC_RE.test(k) && STATES.includes(s)) status[k] = s;
  const lines = Array.isArray(v.lines) ? v.lines.slice(0, limits.lines).filter(l => Array.isArray(l) && typeof l[0] === 'string').map(([t, c]) => [t.slice(0, limits.line), CLASSES.includes(c) ? c : '']) : [];
  const from = Number.isSafeInteger(v.from) && v.from >= 0 ? v.from : 0;
  const summary = v.summary && typeof v.summary === 'object' && !Array.isArray(v.summary) ? v.summary : null;
  return { id: v.id, status, from, lines, summary };
}

/** The `reports` value: { files: { path: text | null (too large) } } of the reports of the build given ([path, text]). */
export function reportsActivity(files, limits = RUN_LIMITS) {
  const out = {};
  let size = 0;
  for (const [p, text] of files) {
    if (!reportPath(p) || typeof text !== 'string') continue;
    const n = bytes(text);
    if (n > limits.report || size + n > limits.reports) { out[p] = null; continue; }
    size += n;
    out[p] = text;
  }
  return { files: out };
}

/** A `reports` value as a follower takes it: { files: { path: text | null } }; null: not one. */
export function followedReports(v, limits = RUN_LIMITS) {
  if (!v || typeof v !== 'object' || !v.files || typeof v.files !== 'object' || Array.isArray(v.files)) return null;
  const files = {};
  for (const [p, t] of Object.entries(v.files)) if (reportPath(p) && (t === null || (typeof t === 'string' && t.length <= limits.report))) files[p] = t;
  return { files };
}

/** The runs in words (the MCP's follow_project): the processes' marks, the run's last lines. */
export function runLines(v, last = 10) {
  const r = followedRuns(v);
  if (!r) return [];
  const marks = Object.entries(r.status).map(([k, s]) => `${k} ${s}`);
  return [
    ...(marks.length ? [`Their processes: ${marks.join(', ')}.`] : []),
    ...(r.lines.length ? [`The end of their last run's log:`, ...r.lines.slice(-last).map(([t]) => `  ${t}`)] : []),
  ];
}
