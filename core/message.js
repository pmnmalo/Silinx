// The console's typed message (#4749): what a line says, made where it is written and drawn from it, never read back
// from the line's English text. Its source is decided once (web/js/console.js log): its line's filter, its entry's in
// the Errors / Warnings tabs (they follow the filter), what a shared project's followers get (core/collab-runs.js).
// Its entry of the Errors / Warnings tabs is made from it (entryOf: its severity, tool, location and action), the
// console reading nothing back from the line drawn. The MCP's results hold their messages as data (messageData: step 4
// of #4749): check_syntax's, simulate's, run_process's, follow_project's runs'. A message:
//   severity: 'error' | 'warning' | 'info' | 'ok' | 'header' | 'text' (the console's classes: err, warn, info, ok, hdr, none)
//   source:   'check' | 'sim' | 'emu' | 'impl' | 'app' (the console's filters, web/js/messages.js; 'app': the application's,
//             shown under every filter)
//   text:     the line, in English (translated where it is drawn)
//   tool:     the tool that said it ("Xst:528" of "ERROR:Xst:528 - …", "Par"), or null
//   location: { file, line, col? } of the project, or null
//   action:   { label, run } a button of the line (Trust Project), or null
//   process:  the process that wrote it ("Synthesize - XST"), or null
//   run:      the run of that process it belongs to (its header's line: a rerun replaces its entries), or null
//   time:     when it was written (ms since the epoch, #5035: the console's line's, a shared project's owner's), only
//             when its writer gives it
// No DOM nor Node API: the page, the server and the MCP server import it.
import { MESSAGE_LINE } from './tool-descriptors.js';
import { messageLocation, projectPath } from './message-location.js';

export const SEVERITIES = Object.freeze(['error', 'warning', 'info', 'ok', 'header', 'text']);
export const MESSAGE_SOURCES = Object.freeze(['check', 'sim', 'emu', 'impl', 'app']);
// the console's line classes (web/js/console.js log's `cls`) and their severities
const OF_CLASS = Object.freeze({ err: 'error', warn: 'warning', info: 'info', ok: 'ok', hdr: 'header', '': 'text' });

/** The severity of a console line's class ('err' -> 'error'…; an unknown one: 'text'). */
export const severityOfClass = cls => OF_CLASS[cls] ?? 'text';

/** A message (its fields above; a field out of its values: its default, a source the application's). */
export function makeMessage({ text = '', severity = 'text', source = 'app', tool = null, location = null, action = null, process = null, run = null, time = null } = {}) {
  const loc = location && typeof location.file === 'string' && location.file && Number.isInteger(location.line) && location.line > 0
    ? { file: location.file, line: location.line, ...(Number.isInteger(location.col) && location.col > 0 ? { col: location.col } : {}) } : null;
  return {
    severity: SEVERITIES.includes(severity) ? severity : 'text',
    source: MESSAGE_SOURCES.includes(source) ? source : 'app',
    text: String(text),
    tool: typeof tool === 'string' && tool ? tool : null,
    location: loc,
    action: action && typeof action.label === 'string' ? action : null,
    process: typeof process === 'string' && process ? process : null,
    run: typeof run === 'string' && run ? run : null,
    ...(validTime(time) ? { time } : {}),
  };
}

// (a time: ms since the epoch, a whole number)
const validTime = t => Number.isSafeInteger(t) && t >= 0;

const two = n => String(n).padStart(2, '0');
/** A message's time as the console shows it (#5035): `14:03:27` (local time), with its day and month for one of
 *  another day than `now`'s (`20/11 23:58:01`); '' with no time. */
export function messageTime(time, now = Date.now()) {
  if (!validTime(time)) return '';
  const d = new Date(time), n = new Date(now);
  const clock = `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay ? clock : `${two(d.getDate())}/${two(d.getMonth() + 1)} ${clock}`;
}

/** A console line's message (#4749: made where it is written, web/js/console.js log): its severity its class's (`cls`),
 *  an error's or a warning's line's its prefix's ("WARNING: …" written as an error: a warning, as ISE's tools say);
 *  its tool its prefix's ("ERROR:Xst:528 - …": Xst:528); its location the one its writer gives, else the project's
 *  file and line its text names (`paths`: the project's files; #4746's forms, core/message-location.js); the other
 *  fields (source, action, process, run) as given. */
export function lineMessage(text, { cls = '', location = null, paths = [], ...fields } = {}) {
  text = String(text);
  const m = MESSAGE_LINE.exec(text);
  let severity = severityOfClass(cls);
  if (m && (severity === 'error' || severity === 'warning')) severity = /error|fatal/i.test(m[1]) ? 'error' : 'warning';
  if (!location) {
    const at = messageLocation(m ? m[3] : text), file = at && projectPath(at.file, paths);
    location = file ? { file, line: at.line, ...(at.col ? { col: at.col } : {}) } : null;
  }
  return makeMessage({ ...fields, text, severity, tool: m?.[2] ?? null, location });
}

/** A message's entry of the Errors / Warnings tabs (#4749: made from the message, its line never read again): an
 *  error's or a warning's `{ severity, tool, message, file, line, col?, inText, src, run, action }` (the text without
 *  its prefix; its tool's, else Silinx; its location's file and line, inText when its text names them already; src its
 *  source, the console's filter; action its button; time its message's, when it has one, #5035), else null (a line of the scripts' "=== SILINX FAILED" marker
 *  neither: the errors are their own lines, #4728). */
export function entryOf(msg) {
  if (msg.severity !== 'error' && msg.severity !== 'warning') return null;
  const m = MESSAGE_LINE.exec(msg.text);
  if (!m && /=== SILINX FAILED/.test(msg.text)) return null;
  const message = m ? m[3] : msg.text.trim();
  if (!message) return null;
  const at = msg.location;
  return {
    severity: msg.severity, tool: msg.tool || 'Silinx', message,
    file: at?.file ?? null, line: at?.line ?? 0, ...(at?.col ? { col: at.col } : {}),
    inText: !!at && messageLocation(message)?.line === at.line,
    src: msg.source, run: msg.run, action: msg.action, ...(validTime(msg.time) ? { time: msg.time } : {}),
  };
}

/** A check's diagnostic's location ({ severity, file, line, col… } of core/diag.js: its file, line and column), as its
 *  console line's message holds it (#4749: the interface's Check Syntax's and the MCP's check_syntax's), or null. */
export const diagLocation = d => (d?.file && d.line > 0 ? { file: d.file, line: d.line, ...(d.col > 0 ? { col: d.col } : {}) } : null);

/** A message as data (#4749: the MCP's results, server/mcp-*.js): its fields, its action by its label (its button's
 *  function no data), its text in English. */
export const messageData = m => ({ ...m, action: m.action?.label ?? null });
