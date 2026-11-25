// The console (Console / Errors / Warnings tabs at the bottom): the log, the warnings and errors it
// collects, and the quick fixes of the messages (#405: out of app.js).
import { icon } from './icons.js';
import { h } from './ui.js';
import { quickFixes } from '/core/quickfix.js';
import { t, onLanguageChange, getLanguage } from './i18n.js';
import { hintRow, sevWord } from './diaghelp.js';
import { S, app } from './app.js';
import { shownDiag } from './design-only.js';
import { isTrusted, refusedProject } from '/core/trust.js';
import { needsWinUsb, WINUSB_GUIDE } from '/core/webusb-support.js';
import { severityOf } from '/core/log-severity.js';
import { lineMessage, entryOf } from '/core/message.js';
import { lineSource, isShown, shownSourcesNow, showCommandLines } from './messages.js';
import { docsState } from './state-docs.js';
import { designState } from './state-design.js';
import { filesState } from './state-files.js';
import { procState } from './state-proc.js';

const $ = id => document.getElementById(id);

const lineWatchers = new Set();
/** Calls fn(line, class, message) for each line the console shows from now on (#4002: a shared project's runs, for
 *  its followers; #4749: the line's message, core/message.js); returns the function that stops it. */
export function onLogLine(fn) { lineWatchers.add(fn); return () => lineWatchers.delete(fn); }

/** The Trust Project button's action of an untrusted project (#2830): its line said when it opens, every refusal of a
 *  process for it (#4583). */
// an error that sends the user to the WinUSB driver (#5459): its button opens the user's guide's section, in its language
const winUsbAction = () => ({ label: 'Help: The Board on Windows', run: () => { globalThis.open(WINUSB_GUIDE[getLanguage()] || WINUSB_GUIDE.en, '_blank', 'noopener'); return false; } });   // (false: it stays enabled, to open again)
export const trustAction = name => ({ label: 'Trust Project', trust: name, run: () => import('./project.js').then(m => m.trustProject(name)) });

// action: { label, run, trust? (a Trust Project's project) }, or a list of them, a button at the end of the (last) line: what the line asks
// of the user (Trust Project, #2830); it is disabled once run (again enabled when run says false: the user said No).
// A refusal for an untrusted project carries its Trust Project button (#4583: the line said when it opened may be
// long gone), one per refusal (its "… failed:" line right after it shares the error's).
// src: the line's source in the console's filters (web/js/messages.js), kept whatever process ran last (the collaboration's,
// Design, #4632: web/js/collab-log.js; the application's, #4729: appLog, logError…); none: the process's whose header came
// last, or the application's (none running)
// goto: what its entry of the Errors / Warnings tabs does when clicked (#4746: a drawing's Check, its item shown); none:
// the file and line its text names, when the project has that file
// Each line is a message (#4749, core/message.js), made here, its source decided here once (not read again from its
// text by the message centre): its line's data-src, its entry's src, what the watchers get; the line's element holds it.
// run / process: the run the line is of (#4749: a run's own, startRun; none: the one whose header came last)
// location: the project's file and line the line is of, its writer's (#4749: SSim's line of an assertion); none: the
// ones its text names. Its entry of the Errors / Warnings tabs is made from its message (core/message.js entryOf: its
// tool, location and action), its text not read again.
// link: an error's or a warning's line that names a project's file and line a link to it (#5221), but a line its writer
// makes a link of its own (SSim's, web/js/messages.js mirror) or one with a goto (a drawing's Check)
// draw: the line as it is drawn, in the interface's language (#4749, step 5: its message's text stays English, what the
// followers and the MCP get; drawn again when the language changes); none: an application's line (src 'app') its
// translation (appText), any other line (a tool's output) as it is.
// Returns the lines' elements.
export function log(text, cls = '', { diag = true, action = null, src = null, goto = null, run = undefined, process = undefined, location = null, draw = null, link = true } = {}) {
  const el = $('console-log');
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  const refused = !action && cls === 'err' && refusedProject(text);
  // (a refusal's line right after another of the same project's shares its button, and its action: its entry's too)
  const shared = refused && el.lastElementChild?.querySelector('.ln-trust')?.dataset.trust === refused;
  const winUsb = !action && !refused && cls === 'err' && needsWinUsb(text);
  const msgAction = refused ? trustAction(refused) : winUsb ? winUsbAction() : [action].flat().find(Boolean) ?? null;
  if ((refused && !shared) || winUsb) action = msgAction;
  const lines = String(text).split('\n'), divs = [];
  // (the design's sources, and a CPU node's sketch files, which are none of its sources: an Arduino node's, #5503)
  const paths = [...(designState.sources || []).map(s => s.path), ...(filesState.fileTree || []).filter(f => /\.(ino|c|cc|cpp|h|hpp)$/.test(f))];
  const drawn = draw || (src === 'app' ? appText : null);
  lines.forEach((line, i) => {
    if (run === undefined) startsRun(line);
    else if (RUN_HEADER.test(line)) dropRun(run);   // (a run's own header: its last run's entries dropped, #4728)
    const lineRun = run === undefined ? consoleRun : run, lineProcess = process === undefined ? consoleProcess : process;
    let source = src;
    if (!source) [source, lineCur] = lineSource(line, lineCur);
    // (its action: the first of the line's, #4962)
    const msg = lineMessage(line, { cls, source, location, paths, action: i === lines.length - 1 ? msgAction : null, process: lineProcess, run: lineRun });
    const div = h('div', { class: `ln ${cls}`, 'data-src': source, ...(src ? { 'data-own-src': '' } : {}) }, drawn ? drawn(line) : line);
    div.message = msg;
    if (drawn) div.draw = () => drawn(line);
    el.append(div);
    divs.push(div);
    if (diag) consoleMessage(msg, goto, div.draw);
    if (link && !goto) fileLink(div, msg);
    if (run === undefined && RUN_END.test(line)) { consoleRun = null; consoleProcess = null; lastConsoleDiag = null; }   // (the lines after a run's result: no run's)
    for (const fn of lineWatchers) { try { fn(line, cls, msg); } catch { /* a watcher's own error: not the console's */ } }
  });
  // (several: the line's choices, #4962, all disabled once one is run)
  const buttons = [];
  for (const a of [action].flat().filter(Boolean)) {
    const enable = on => { for (const x of buttons) x.disabled = !on; };
    const b = h('button', { type: 'button', class: `btn ln-action${a.trust !== undefined ? ' ln-trust' : ''}`, onclick: async () => {
      enable(false);
      try { if (await a.run() === false) enable(true); } catch (e) { enable(true); log(`ERROR: ${e.message}`, 'err'); }
    } }, t(a.label));
    if (a.trust !== undefined) b.dataset.trust = a.trust;
    b.label = a.label;   // (drawn again in another language)
    buttons.push(b);
    el.lastElementChild.append(' ', b);
  }
  while (el.childElementCount > 5000) el.firstChild.remove();
  if (atBottom) el.scrollTop = el.scrollHeight;
  return divs;
}

// An error's or a warning's line that names a project's file and line (#5221: Check Syntax's, synthesis', simulation's):
// a link, clicked, to its file at that line, as its entry of the Errors / Warnings tabs is (a drawing's Check line its
// item's: tasks-check.js, editor-problems.js)
const FILE_LINK = 'Open the file at this line';
function fileLink(div, msg) {
  const at = msg.location;
  if (!at?.line || (msg.severity !== 'error' && msg.severity !== 'warning')) return;
  div.classList.add('mc-link', 'mc-file');
  div.title = t(FILE_LINK);
  div.addEventListener('click', () => app.openFile(at.file, at.line, at.col));
}
onLanguageChange(() => { for (const ln of document.querySelectorAll('#console-log .ln.mc-file')) ln.title = t(FILE_LINK); });

// An application's line as it is drawn (#4749, step 5): its translation, its ERROR: / WARNING: / INFO: tag kept.
const TAGGED = /^(\s*(?:ERROR|WARNING|INFO)\s*:\s*)(.*)$/s;
function appText(line) {
  const m = TAGGED.exec(line);
  return m ? m[1] + t(m[2]) : t(line);
}
// (the language changed: the lines drawn again, their texts and their buttons' labels, from their English)
function redrawLines() {
  for (const ln of $('console-log')?.children || []) {
    if (ln.draw && ln.firstChild?.nodeType === 3) ln.firstChild.nodeValue = ln.draw();
    for (const b of ln.querySelectorAll('.ln-action')) if (b.label) b.textContent = t(b.label);
  }
}

// The run that writes the console's lines (#4728): a process's header ("Started : "Check Schematic" of gates.") starts
// it, and its rerun first drops the entries the previous one gave the Errors / Warnings tabs (a fixed error is not
// listed again, nor N times after N runs); none before any header, nor after a run's result ("Process … completed /
// failed / stopped"). An entry of no run listed again replaces the same entry (a refusal said twice: listed once).
let consoleRun = null, consoleProcess = null;
// (the source the next line carries on, a line of no source given: its process's, else the application's, #4749)
let lineCur = 'app';
const RUN_HEADER = /^\s*Started : "([^"]+)".*$/, RUN_END = /^\s*Process ("[^"]*" (completed|failed|stopped)|(failed|stopped)\b)/;
// a run's result, never an entry ("Process failed: <the job's error>" is: implement.js's jobLog leaves the error to it)
const RUN_SUMMARY = /^\s*Process "[^"]*" (completed|failed|stopped)/;
function startsRun(line) {
  const m = RUN_HEADER.exec(line);
  if (!m) return;
  consoleRun = line.trim().replace(/[.\s]+$/, '');
  consoleProcess = m[1];
  dropRun(consoleRun);
}
/** The Errors / Warnings tabs' entries of a run dropped (its Console lines kept): a rerun's (#4728), or a group of lines
 *  given a run of their own whose cause is gone (a drawing's HDL made again, #5008). */
export function dropRun(run) {
  const n = procState.diags.length;
  procState.diags = procState.diags.filter(d => !(d.source === 'console' && d.run === run));
  lastConsoleDiag = null;
  if (procState.diags.length !== n) renderDiagnosticsSoon();
}
const sameEntry = (a, b) => a.severity === b.severity && a.tool === b.tool && a.message === b.message;

// Every warning/error shown in the console also goes to the Warnings / Errors tabs (but a run's result, "Process "…"
// failed", and the scripts' "=== SILINX FAILED step" marker, #4728: the errors are their own lines), its entry made from
// its message (#4749, core/message.js entryOf: "ERROR:Tool:123 - msg", "WARNING:Tool - msg", "ERROR: msg"…);
// indented lines right after one are its continuation (ISE wraps long messages) — unless the
// message is already complete (ends a sentence) or the line is report output (XST's indented
// "Found finite state machine…", tables, rules), which would otherwise be glued to the warning.
let lastConsoleDiag = null;
const continuesDiag = (d, line) => /^\s{2,}\S/.test(line) && !/[.!?:]\s*$/.test(d.message)
  && !/^\s*([|=+-]{2,}|\||Found\b|Summary:|Unit\b|Synthesizing\b|inferred\b)/.test(line);
function consoleMessage(msg, goto, draw = null) {
  const line = msg.text;
  if (RUN_SUMMARY.test(line)) return;   // (its errors are listed already: their own lines, #4728)
  if (lastConsoleDiag && msg.severity === 'text' && continuesDiag(lastConsoleDiag, line)) {
    lastConsoleDiag.message += ' ' + line.trim();
    renderDiagnosticsSoon();
    return;
  }
  lastConsoleDiag = null;
  const e = entryOf(msg);
  if (!e) return;
  // (a drawing's Check: its item shown, not a file opened)
  const d = { ...e, source: 'console', ...(goto ? { goto, file: null, line: 0, inText: false } : {}) };
  // (an application's: drawn in the interface's language, its tag left out as its message's, #4749)
  if (draw) Object.defineProperty(d, 'draw', { value: () => draw().replace(TAGGED, '$2').trim(), enumerable: false });
  if (e.run === null) procState.diags = procState.diags.filter(x => !(x.source === 'console' && x.run === null && sameEntry(x, d)));
  procState.diags.push(d);
  lastConsoleDiag = d;
  renderDiagnosticsSoon();
}

// A simulation's messages in the Errors / Warnings tabs (#4746): its assertions' and reports' errors and failures
// (VHDL's `severity error / failure`, Verilog's $error / $fatal), its warnings, each with its file and line; `run` the
// simulation's (its document's id), run again replacing its own entries. Returns the simulator's onLog: an entry
// listed once (an assertion in a loop: not a thousand times), at most SIM_ENTRIES of a run.
const SIM_SEVERITY = { error: 'error', failure: 'error', fatal: 'error', warning: 'warning' }, SIM_ENTRIES = 200;
export function simDiagnostics(run) {
  procState.diags = procState.diags.filter(d => !(d.source === 'sim' && d.run === run));
  renderDiagnosticsSoon();
  const seen = new Set();
  return e => {
    const severity = SIM_SEVERITY[e?.kind];
    if (!severity || seen.size >= SIM_ENTRIES) return;
    const d = { severity, tool: 'SSim', message: String(e.text ?? ''), file: e.file || null, line: e.line || 0, source: 'sim', run, src: 'sim' };   // (src: Simulation's filter, #4749)
    if (seen.has(diagKey(d))) return;
    seen.add(diagKey(d));
    procState.diags.push(d);
    renderDiagnosticsSoon();
  };
}

let diagTimer = null;
function renderDiagnosticsSoon() {
  if (diagTimer) return;
  diagTimer = setTimeout(() => { diagTimer = null; renderDiagnostics(); }, 50);
}
export function logLine(line, opts) {
  let cls = '';
  const sev = severityOf(line);   // (the process's count's and the MCP's, #4730)
  if (sev === 'error' || /=== SILINX FAILED/.test(line)) cls = 'err';
  else if (sev === 'warning') cls = 'warn';
  else if (/=== SILINX (STEP|DONE)/.test(line) || /completed successfully/i.test(line)) cls = 'ok';
  log(line, cls, opts);
}
/** A process's run (#4749): its header written (`Started : "<process>"<of>.`), every line it writes then its own —
 *  its source, its run (its header: a rerun drops the entries the last one listed), whatever else writes meanwhile
 *  (another run's lines, the application's). `{ log(text, cls, opts), line(toolLine, opts), end(text, cls) }`: end
 *  writes its result, the lines after it no more its. */
export function startRun({ process, source, of = '' }) {
  const header = `Started : "${process}"${of}`;
  const run = header.replace(/[.\s]+$/, '');
  const own = { src: source, run, process };
  log(`\n${header}.\n`, 'hdr', own);
  let open = true;
  return {
    log: (text, cls = '', opts = {}) => log(text, cls, { ...opts, ...own }),
    line: (line, opts = {}) => logLine(line, { ...opts, ...own }),
    end(text, cls = '') { if (!open) return; open = false; log(text, cls, own); },
  };
}
/** A line of the application's own (`cls`, `opts` as log's), outside any process (#4729): its source the application's,
 *  shown under every filter and task, whatever process ran last. */
export const appLog = (text, cls = '', opts = {}) => log(text, cls, { ...opts, src: 'app' });
/** An error of the app's own (#3540: a file it cannot read; #3591: a refusal, a menu action's error): an ERROR line
 *  of the console, in the interface's language, its Errors tab in front (no toasted message). */
export function logError(text) {
  log(`ERROR: ${text}`, 'err', { src: 'app' });
  bringForward('errors');
}
/** A warning of the app's own (#3591): a WARNING line of the console, its Warnings tab in front. */
export function logWarning(text) {
  log(`WARNING: ${text}`, 'warn', { src: 'app' });
  bringForward('warnings');
}
/** A piece of information of the app's own (#3591: why a command does nothing): an INFO line of the console, the
 *  console's page in front. */
export function logInfo(text) {
  log(`INFO: ${text}`, 'info', { src: 'app' });
  bringForward('console');
}
/** A command's failure (#4747: in the console, never a modal box, docs/UI-GUIDELINES.md): `ERROR: <command>: <message>`,
 *  each line of the message (a list of a design's errors) a line and an entry of its own, the Errors tab in front; the
 *  command's name and each message translated apart. */
export function commandError(title, message) { commandLines('ERROR', 'err', title, message); bringForward('errors'); }
/** A command's warning (#4747): `WARNING: <command>: <message>`, the Warnings tab in front. */
export function commandWarning(title, message) { commandLines('WARNING', 'warn', title, message); bringForward('warnings'); }
/** Why a command does nothing (#4747): `INFO: <command>: <message>`, the console in front. */
export function commandInfo(title, message) { commandLines('INFO', 'info', title, message); bringForward('console'); }
function commandLines(tag, cls, title, message) {
  const lines = (Array.isArray(message) ? message : String(message ?? '').split('\n')).map(m => String(m).trim()).filter(Boolean);
  // (its English the message's text, #4749: drawn translated, the command's name and the message apart)
  for (const m of lines.length ? lines : ['']) log(`${tag}: ${title}: ${m}`.replace(/: $/, ''), cls, { src: 'app', draw: () => `${tag}: ${t(title)}: ${t(m)}`.replace(/: $/, '') });
}
export function showConsolePage(page) {
  // (a tab of the console only: the keyboard's focus stays where it is, an editor's typing goes on)
  broughtForward = null;
  document.querySelectorAll('#console-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  document.querySelectorAll('.console-page').forEach(p => { p.hidden = p.dataset.page !== page; });
}

// Diagnostics (Errors / Warnings tabs)
export function setDiagnostics(diags, { keepConsole = true } = {}) {
  diags = diags.map(shownDiag);   // (a design project's: its drawings', never its HDL's, #3891)
  // a check replaces its own entries; warnings/errors collected from the console (e.g. a running
  // implementation) are kept unless keepConsole is false, and the open editors' problems (editor-problems.js) always
  procState.diags = [...diags, ...procState.diags.filter(d => (keepConsole && (d.source === 'console' || d.source === 'sim')) || d.source === 'editor')];
  lastConsoleDiag = null;
  renderDiagnostics();
  // push file-local diagnostics to open editors
  for (const doc of docsState.docs) if (doc.editor) doc.editor.setDiagnostics(diags.filter(d => d.file === doc.path && d.source !== 'parse'));
}

// an entry's action (#4749: its message's, the console line's first; #4589: an untrusted project's refusal, its Trust
// Project button, as the console's line, in the tab a refusal brings to the front): disabled once run, and a Trust
// Project's once the project open is trusted
function actionButton(d) {
  const a = d.action;
  if (!a) return null;
  const b = h('button', { type: 'button', class: `btn ln-action${a.trust !== undefined ? ' ln-trust' : ''}`, onclick: async e => {
    e.stopPropagation();
    b.disabled = true;
    try { if (await a.run() === false) b.disabled = false; } catch (err) { b.disabled = false; log(`ERROR: ${err.message}`, 'err'); }
  } }, t(a.label));
  if (a.trust !== undefined) {
    b.dataset.trust = a.trust;
    b.disabled = S.project?.name === a.trust && isTrusted(S.project);
  }
  return b;
}

// (the tabs list the entries of the sources the console's filter shows, #4749: an entry of the console's lines its
// line's source; the checks' and the editors' entries, of no source, always)
export function renderDiagnostics({ quiet = false } = {}) {
  const diags = procState.diags;
  const errs = diags.filter(d => d.severity === 'error'), warns = diags.filter(d => d.severity !== 'error');
  const set = shownSourcesNow(), shown = d => !d.src || isShown(set, d.src);
  const fill = (el, list, ico) => {
    el.innerHTML = '';
    if (!list.length) { el.append(h('div', { class: 'ln info' }, t('No messages.'))); return; }
    for (const d of list) {
      const hint = hintRow(d);   // plain-language explanation + fix, expandable under the message
      const row = h('div', { class: 'diag' }, icon(ico),
        h('span', {}, `${sevWord(d)}:${d.tool || 'HDLCompiler'} - `),
        d.file && !d.inText ? h('span', { class: 'loc' }, d.line ? `"${d.file}" Line ${d.line}` : `"${d.file}"`) : null,
        h('span', { 'data-no-i18n': true }, d.file && !d.inText ? `: ${d.draw?.() ?? d.message}` : d.draw?.() ?? d.message), hint?.toggle,
        ...diagFixes(d).map(f => h('span', { class: 'diag-fix', role: 'button', 'data-no-i18n': true, onclick: e => { e.stopPropagation(); applyDiagFix(d, f); } }, `${t('Fix:')} ${t(f.title)}`)),
        actionButton(d));
      // (an editor's problem: its item selected, editor-problems.js)
      row.addEventListener('click', () => (d.goto ? d.goto() : d.file && app.openFile(d.file, d.line, d.col)));
      el.append(row);
      if (hint) el.append(hint.box);
    }
  };
  const shownErrs = errs.filter(shown), shownWarns = warns.filter(shown);
  fill($('console-errors'), shownErrs, 'err');
  fill($('console-warnings'), shownWarns, 'warn');
  $('err-count').textContent = shownErrs.length ? `(${shownErrs.length})` : '';
  $('warn-count').textContent = shownWarns.length ? `(${shownWarns.length})` : '';
  focusNewDiagnostics(errs, warns, shown, quiet);
}

// A new error brings the Errors tab forward, else a new warning the Warnings one (#2733), whoever wrote it: once per
// drawing (the console's lines are drawn at most every 50 ms: a run's batch, errors winning), a message already listed
// (an editor's problem checked again as it is typed) not again, but one written again (a process run again: listed
// twice) is new, and a warning leaves the Errors tab in front while it lists errors. A tab so brought forward goes back
// to the Console once it lists nothing (cleared, another project opened: the start-up checks' warnings); one the viewer
// picked stays. The Tasks interface opens its folded messages on the event (web/js/tasks.js).
let listedDiags = new Map(), broughtForward = null;
// (a console line's entry seen already: one written again replaces its twin since #4728, the count unchanged, and is new)
const seenConsoleDiags = new WeakSet();
const diagKey = d => `${d.severity}|${d.tool || ''}|${d.file || ''}|${d.line || 0}|${d.message}`;
const pageShown = () => document.querySelector('#console-tabs .tab.active')?.dataset.page;
// (quiet: the filter changed, the entries it shows again not new: no tab brought forward)
// (every entry counted, those the filter hides too, #5074: one of them new turns the filter to its source, as a process
// started does, #1852, and its tab is brought forward listing it; a filter's change, quiet, is no entry's news)
function focusNewDiagnostics(errs, warns, shown, quiet = false) {
  const before = listedDiags;
  listedDiags = new Map();   // (each message's count: one listed more times than before is new)
  const isNew = d => {
    const k = diagKey(d), n = (listedDiags.get(k) || 0) + 1;
    listedDiags.set(k, n);
    const fresh = d.source === 'console' && !seenConsoleDiags.has(d);
    if (d.source === 'console') seenConsoleDiags.add(d);
    return n > (before.get(k) || 0) || fresh;
  };
  const newErrs = errs.filter(isNew), newWarns = warns.filter(d => isNew(d) && d.severity === 'warning');
  if (quiet) return;
  const shownErrs = errs.filter(shown), shownWarns = warns.filter(shown);
  const page = newErrs.length ? 'errors' : newWarns.length && !(shownErrs.length && pageShown() === 'errors') ? 'warnings' : null;
  if (!page) {
    if (broughtForward && pageShown() === broughtForward && !(broughtForward === 'errors' ? shownErrs : shownWarns).length) showConsolePage('console');
    return;
  }
  const news = page === 'errors' ? newErrs : newWarns;
  if (!news.some(shown)) showCommandLines(news.find(d => d.src)?.src);   // (its source shown: the tab lists it)
  bringForward(page);
}
function bringForward(page) {
  showConsolePage(page);
  broughtForward = page;
  document.dispatchEvent(new CustomEvent('silinx:console-problems', { detail: { page } }));
}

/** The end of a check (#2803: Check Syntax, Check Constraints, a drawing's Check or Validate): its errors bring the
 *  Errors tab forward, else its warnings the Warnings tab, also when they were listed already (the same check run
 *  again). Its page, or null when it found neither (the tabs as they were). */
export function showProblems(diags) {
  const page = diags.some(d => d.severity === 'error') ? 'errors' : diags.some(d => d.severity === 'warning') ? 'warnings' : null;
  if (page) bringForward(page);
  return page;
}
onLanguageChange(() => { redrawLines(); renderDiagnostics(); });

// Quick fixes of a message (core/quickfix.js): "Fix: …" in its row of the Errors / Warnings tabs.
// Applied in the file's editor (one Undo there); the file's messages are then checked again.
const fixModules = () => designState.modules.map(m => ({ name: m.name, ports: (m.portList || []).map(p => p.name), params: m.paramList || [] }));
function diagFixes(d) {
  const src = d.file && designState.sources.find(s => s.path === d.file);
  // (not a drawing's generated HDL, with a file of its own or not: read-only, #1176)
  if (!src || src.view || designState.hdlToSch?.[src.path] || (src.lang !== 'vhdl' && src.lang !== 'verilog')) return [];
  const text = docsState.docs.find(o => o.path === d.file && o.editor)?.editor.getValue() ?? src.text;
  try { return quickFixes(text, src.lang, d, { modules: fixModules() }).slice(0, 3); } catch { return []; }
}
async function applyDiagFix(d, f) {
  const doc = await app.openFile(d.file, d.line, d.col);
  const ed = doc?.editor;
  if (!ed) return;
  // the same fix on the editor's text now (it may have changed since the row was drawn)
  const fix = ed.quickFixes(d).find(x => x.title === f.title);
  if (fix) ed.applyFix(fix); else logInfo('No quick fix here.');
}

// the Clear button: the console's lines and the messages of the tabs
export function clearConsole() {
  $('console-log').innerHTML = '';
  lineCur = 'app';
  procState.diags = [];
  lastConsoleDiag = null;
  renderDiagnostics();
}
// (the console's filter changed, web/js/messages.js: the tabs list its sources' entries, #4749)
document.addEventListener('silinx:console-filter', () => renderDiagnostics({ quiet: true }));
