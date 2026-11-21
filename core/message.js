// The console's typed message (#4749): what a line says, made where it is written and drawn from it, never read back
// from the line's English text. Its source is decided once (web/js/console.js log): its line's filter, its entry's in
// the Errors / Warnings tabs (they follow the filter), what a shared project's followers get (core/collab-runs.js).
// (The processes stating their messages' fields themselves, without the console reading them from the lines, and the
// MCP's results as messages are the next steps: the pull request of #4749.) A message:
//   severity: 'error' | 'warning' | 'info' | 'ok' | 'header' | 'text' (the console's classes: err, warn, info, ok, hdr, none)
//   source:   'check' | 'sim' | 'emu' | 'impl' | 'app' (the console's filters, web/js/messages.js; 'app': the application's,
//             shown under every filter)
//   text:     the line, in English (translated where it is drawn)
//   location: { file, line, col? } of the project, or null
//   action:   { label, run } a button of the line (Trust Project), or null
//   process:  the process that wrote it ("Synthesize - XST"), or null
//   run:      the run of that process it belongs to (its header's line: a rerun replaces its entries), or null
//   time:     when it was written (ms since 1970: Date.now(); a shared project's follower's, the owner's), or null
// No DOM nor Node API: the page, the server and the MCP server import it.

export const SEVERITIES = Object.freeze(['error', 'warning', 'info', 'ok', 'header', 'text']);
export const MESSAGE_SOURCES = Object.freeze(['check', 'sim', 'emu', 'impl', 'app']);
// the console's line classes (web/js/console.js log's `cls`) and their severities
const OF_CLASS = Object.freeze({ err: 'error', warn: 'warning', info: 'info', ok: 'ok', hdr: 'header', '': 'text' });

/** The severity of a console line's class ('err' -> 'error'…; an unknown one: 'text'). */
export const severityOfClass = cls => OF_CLASS[cls] ?? 'text';

/** A message (its fields above; a field out of its values: its default, a source the application's). */
export function makeMessage({ text = '', severity = 'text', source = 'app', location = null, action = null, process = null, run = null, time = null } = {}) {
  const loc = location && typeof location.file === 'string' && location.file && Number.isInteger(location.line) && location.line > 0
    ? { file: location.file, line: location.line, ...(Number.isInteger(location.col) && location.col > 0 ? { col: location.col } : {}) } : null;
  return {
    severity: SEVERITIES.includes(severity) ? severity : 'text',
    source: MESSAGE_SOURCES.includes(source) ? source : 'app',
    text: String(text),
    location: loc,
    action: action && typeof action.label === 'string' ? action : null,
    process: typeof process === 'string' && process ? process : null,
    run: typeof run === 'string' && run ? run : null,
    time: Number.isFinite(time) && time >= 0 ? time : null,
  };
}

const two = n => String(n).padStart(2, '0');
/** A message's time as the console shows it before the line (#5035): `14:03:27`, the hour of the day it was
 *  written; `20/11 23:58:01` when that day is not `now`'s (the computer's local time); '' of no time. */
export function consoleTime(time, now = Date.now()) {
  if (!Number.isFinite(time)) return '';
  const d = new Date(time), n = new Date(now);
  const hms = `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay ? hms : `${two(d.getDate())}/${two(d.getMonth() + 1)} ${hms}`;
}
