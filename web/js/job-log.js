// A job's lines for the console, its error said once (#4597): a job that fails ends its log with "ERROR: <its error>"
// (server/jobs.js, the browser edition's jobs, web/js/api-local.js), and the operation that ran it then says
// "<operation> failed: <error>" (iMPACT's, web/js/impact.js; an open family's Program, web/js/program-open.js). An
// "ERROR: " line is held back until the next line comes or the job ends: the job's error itself is left to the
// operation's line, any other is shown.

/** The lines of a job given to logLine(line) as they come (line), and its end (end(result): its { error }). */
export function jobLog(logLine) {
  let held = null;
  const flush = () => { if (held !== null) { const l = held; held = null; logLine(l); } };
  return {
    line: l => { flush(); if (/^ERROR: /.test(l)) held = l; else logLine(l); },
    end: r => { if (held !== null && r?.error && held === `ERROR: ${r.error}`) held = null; flush(); },
  };
}
