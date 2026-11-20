// A project's back-ups (#4971): when it was last exported as a Silinx project (Export Project (.zip)…, the MCP's
// export_project) or sent to GitHub (the browser edition's Commit and Push, the application's Push to GitHub, the MCP's
// git_push), and when Silinx first saw it. The records, by a key (the browser edition's: the project's name; the
// server's: its folder), are kept outside the project (the browser's localStorage, web/js/backup-record.js; the
// configuration folder, server/backup-store.js). A project kept only in the browser's storage whose last back-up (or,
// with none, its first sight) is BACKUP_DAYS old or more is due a reminder (web/js/backup-reminder.js). No I/O here.

/** The days after which a project kept only in the browser's storage is due a back-up reminder. */
export const BACKUP_DAYS = 7;
const DAY = 24 * 3600 * 1000;
/** How a back-up was made: its words in a line. */
export const BACKUP_HOW = { export: 'exported (Export Project (.zip))', github: 'sent to GitHub' };

// (a record's key: `:` before it, so that no name is an object's own key)
const keyOf = k => `:${k}`;
const valid = r => (r && typeof r === 'object' ? r : null);

/** A project's record ({ since, last?, how? }), or null. */
export const backupOf = (recs, k) => valid(recs?.[keyOf(k)]);
/** A project seen (opened): its first sight recorded once. */
export function seen(recs, k, now) {
  const r = valid(recs[keyOf(k)]) ?? (recs[keyOf(k)] = {});
  if (typeof r.since !== 'number') r.since = now;
  return r;
}
/** A project backed up now (how: 'export' | 'github'). */
export function recordBackup(recs, k, how, now) {
  const r = seen(recs, k, now);
  r.last = now;
  r.how = how;
  return r;
}
/** A project's record moved with it (renamed), removed with it (deleted). */
export function moveBackup(recs, from, to) {
  const r = recs[keyOf(from)];
  delete recs[keyOf(from)];
  if (valid(r)) recs[keyOf(to)] = r;
}
export function forgetBackup(recs, k) { delete recs[keyOf(k)]; }

/** Whether a record's project is due a reminder at `now`: its last back-up, or with none its first sight, `days` old. */
export function backupDue(r, now, days = BACKUP_DAYS) {
  const from = typeof r?.last === 'number' ? r.last : r?.since;
  return typeof from === 'number' && now - from >= days * DAY;
}
/** Whole days from t to now. */
export const daysSince = (t, now) => Math.max(0, Math.floor((now - t) / DAY));

/** The console's reminder of a project kept only in the browser's storage. */
export function reminderLine(name, r, now) {
  const d = daysSince(typeof r?.last === 'number' ? r.last : r.since, now);
  return typeof r?.last === 'number'
    ? `Project '${name}' is kept only in this browser's storage and was last backed up ${d} day(s) ago: clearing the browser's data loses it. Export it, or keep it in a GitHub repository.`
    : `Project '${name}' is kept only in this browser's storage and was never backed up (${d} day(s)): clearing the browser's data loses it. Export it, or keep it in a GitHub repository.`;
}

/** A project's last back-up as project_info reports it: { at (ISO), how } or null. */
export function lastBackup(r) {
  return typeof r?.last === 'number' ? { at: new Date(r.last).toISOString(), how: r.how === 'github' ? 'github' : 'export' } : null;
}
