// The console (Console / Errors / Warnings tabs at the bottom): the log, the warnings and errors it
// collects, and the quick fixes of the messages (#405: out of app.js).
import { icon } from './icons.js';
import { h } from './ui.js';
import { quickFixes } from '/core/quickfix.js';
import { t, onLanguageChange } from './i18n.js';
import { hintRow, sevWord } from './diaghelp.js';
import { S, app } from './app.js';
import { MESSAGE_LINE } from './tool-descriptors.js';
import { shownDiag } from './design-only.js';
import { isTrusted, refusedProject } from '/core/trust.js';
import { severityOf } from '/core/log-severity.js';
import { messageLocation, projectPath } from '/core/message-location.js';

const $ = id => document.getElementById(id);

const lineWatchers = new Set();
/** Calls fn(line, class) for each line the console shows from now on (#4002: a shared project's runs, for its
 *  followers); returns the function that stops it. */
export function onLogLine(fn) { lineWatchers.add(fn); return () => lineWatchers.delete(fn); }

/** The Trust Project button's action of an untrusted project (#2830): its line said when it opens, every refusal of a
 *  process for it (#4583). */
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
export function log(text, cls = '', { diag = true, action = null, src = null, goto = null } = {}) {
  const el = $('console-log');
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  const refused = !action && cls === 'err' && refusedProject(text);
  if (refused && el.lastElementChild?.querySelector('.ln-trust')?.dataset.trust !== refused) action = trustAction(refused);
  for (const line of String(text).split('\n')) {
    startsRun(line);
    el.append(h('div', { class: `ln ${cls}`, ...(src ? { 'data-src': src, 'data-own-src': '' } : {}) }, line));
    if (diag) consoleMessage(line, cls, goto);
    if (RUN_END.test(line)) { consoleRun = null; lastConsoleDiag = null; }   // (the lines after a run's result: no run's)
    for (const fn of lineWatchers) { try { fn(line, cls); } catch { /* a watcher's own error: not the console's */ } }
  }
  // (several: the line's choices, #4962, all disabled once one is run)
  const buttons = [];
  for (const a of [action].flat().filter(Boolean)) {
    const enable = on => { for (const x of buttons) x.disabled = !on; };
    const b = h('button', { type: 'button', class: `btn ln-action${a.trust !== undefined ? ' ln-trust' : ''}`, onclick: async () => {
      enable(false);
      try { if (await a.run() === false) enable(true); } catch (e) { enable(true); log(`ERROR: ${e.message}`, 'err'); }
    } }, t(a.label));
    if (a.trust !== undefined) b.dataset.trust = a.trust;
    buttons.push(b);
    el.lastElementChild.append(' ', b);
  }
  while (el.childElementCount > 5000) el.firstChild.remove();
  if (atBottom) el.scrollTop = el.scrollHeight;
}

// The run that writes the console's lines (#4728): a process's header ("Started : "Check Schematic" of gates.") starts
// it, and its rerun first drops the entries the previous one gave the Errors / Warnings tabs (a fixed error is not
// listed again, nor N times after N runs); none before any header, nor after a run's result ("Process … completed /
// failed / stopped"). An entry of no run listed again replaces the same entry (a refusal said twice: listed once).
let consoleRun = null;
const RUN_HEADER = /^\s*Started : "[^"]+".*$/, RUN_END = /^\s*Process ("[^"]*" (completed|failed|stopped)|(failed|stopped)\b)/;
// a run's result, never an entry ("Process failed: <the job's error>" is: implement.js's jobLog leaves the error to it)
const RUN_SUMMARY = /^\s*Process "[^"]*" (completed|failed|stopped)/;
function startsRun(line) {
  if (!RUN_HEADER.test(line)) return;
  consoleRun = line.trim().replace(/[.\s]+$/, '');
  const n = S.diags.length;
  S.diags = S.diags.filter(d => !(d.source === 'console' && d.run === consoleRun));
  lastConsoleDiag = null;
  if (S.diags.length !== n) renderDiagnosticsSoon();
}
const sameEntry = (a, b) => a.severity === b.severity && a.tool === b.tool && a.message === b.message;

// Every warning/error shown in the console also goes to the Warnings / Errors tabs (but a run's result, "Process "…"
// failed", and the scripts' "=== SILINX FAILED step" marker, #4728: the errors are their own lines).
// Recognised forms: "ERROR:Tool:123 - msg", "WARNING:Tool - msg", "ERROR: msg", "WARNING: msg";
// indented lines right after one are its continuation (ISE wraps long messages) — unless the
// message is already complete (ends a sentence) or the line is report output (XST's indented
// "Found finite state machine…", tables, rules), which would otherwise be glued to the warning.
let lastConsoleDiag = null;
const continuesDiag = (d, line) => /^\s{2,}\S/.test(line) && !/[.!?:]\s*$/.test(d.message)
  && !/^\s*([|=+-]{2,}|\||Found\b|Summary:|Unit\b|Synthesizing\b|inferred\b)/.test(line);
function consoleMessage(line, cls, goto) {
  if (RUN_SUMMARY.test(line)) return;   // (its errors are listed already: their own lines, #4728)
  if (lastConsoleDiag && !cls && continuesDiag(lastConsoleDiag, line)) {
    lastConsoleDiag.message += ' ' + line.trim();
    renderDiagnosticsSoon();
    return;
  }
  lastConsoleDiag = null;
  if (cls !== 'err' && cls !== 'warn') return;
  const m = MESSAGE_LINE.exec(line);
  let severity = cls === 'err' ? 'error' : 'warning', tool = 'Silinx', message = line.trim();
  if (m) { severity = /error|fatal/i.test(m[1]) ? 'error' : 'warning'; tool = m[2] || 'Silinx'; message = m[3]; }
  else if (/=== SILINX FAILED/.test(line)) return;
  if (!message) return;
  const d = { severity, tool, message, file: null, line: 0, source: 'console', run: consoleRun, ...(goto ? { goto } : located(message)) };
  if (consoleRun === null) S.diags = S.diags.filter(x => !(x.source === 'console' && x.run === null && sameEntry(x, d)));
  S.diags.push(d);
  lastConsoleDiag = d;
  renderDiagnosticsSoon();
}

// the project's file and line a message names (#4746: ISE's `"…/f.vhd" Line 12`, Vivado's `[…/f.vhd:12]`, a
// compiler's `f.vhd:12:5:`), its row clicked opening it; written in its text already (inText: not again before it)
function located(message) {
  const at = messageLocation(message);
  const file = at && projectPath(at.file, (S.sources || []).map(s => s.path));
  return file ? { file, line: at.line, ...(at.col ? { col: at.col } : {}), inText: true } : {};
}

// A simulation's messages in the Errors / Warnings tabs (#4746): its assertions' and reports' errors and failures
// (VHDL's `severity error / failure`, Verilog's $error / $fatal), its warnings, each with its file and line; `run` the
// simulation's (its document's id), run again replacing its own entries. Returns the simulator's onLog: an entry
// listed once (an assertion in a loop: not a thousand times), at most SIM_ENTRIES of a run.
const SIM_SEVERITY = { error: 'error', failure: 'error', fatal: 'error', warning: 'warning' }, SIM_ENTRIES = 200;
export function simDiagnostics(run) {
  S.diags = S.diags.filter(d => !(d.source === 'sim' && d.run === run));
  renderDiagnosticsSoon();
  const seen = new Set();
  return e => {
    const severity = SIM_SEVERITY[e?.kind];
    if (!severity || seen.size >= SIM_ENTRIES) return;
    const d = { severity, tool: 'SSim', message: String(e.text ?? ''), file: e.file || null, line: e.line || 0, source: 'sim', run };
    if (seen.has(diagKey(d))) return;
    seen.add(diagKey(d));
    S.diags.push(d);
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
/** A line of the application's own (`cls`, `opts` as log's), outside any process (#4729): its source the application's,
 *  shown under every filter and task, whatever process ran last. */
export const appLog = (text, cls = '', opts = {}) => log(text, cls, { ...opts, src: 'app' });
/** An error of the app's own (#3540: a file it cannot read; #3591: a refusal, a menu action's error): an ERROR line
 *  of the console, in the interface's language, its Errors tab in front (no toasted message). */
export function logError(text) {
  log(`ERROR: ${t(text)}`, 'err', { src: 'app' });
  bringForward('errors');
}
/** A warning of the app's own (#3591): a WARNING line of the console, its Warnings tab in front. */
export function logWarning(text) {
  log(`WARNING: ${t(text)}`, 'warn', { src: 'app' });
  bringForward('warnings');
}
/** A piece of information of the app's own (#3591: why a command does nothing): an INFO line of the console, the
 *  console's page in front. */
export function logInfo(text) {
  log(`INFO: ${t(text)}`, 'info', { src: 'app' });
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
  for (const m of lines.length ? lines : ['']) log(`${tag}: ${t(title)}: ${t(m)}`.replace(/: $/, ''), cls, { src: 'app' });
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
  S.diags = [...diags, ...S.diags.filter(d => (keepConsole && (d.source === 'console' || d.source === 'sim')) || d.source === 'editor')];
  lastConsoleDiag = null;
  renderDiagnostics();
  // push file-local diagnostics to open editors
  for (const doc of S.docs) if (doc.editor) doc.editor.setDiagnostics(diags.filter(d => d.file === doc.path && d.source !== 'parse'));
}

// an untrusted project's refusal in the Errors tab (#4589: the tab a refusal brings to the front): its Trust Project
// button, as the console's line; disabled once the project open is trusted
function trustButton(d) {
  const name = d.severity === 'error' && refusedProject(d.message);
  if (!name) return null;
  const b = h('button', { type: 'button', class: 'btn ln-action ln-trust', onclick: async e => {
    e.stopPropagation();
    b.disabled = true;
    try { if (await trustAction(name).run() === false) b.disabled = false; } catch (err) { b.disabled = false; log(`ERROR: ${err.message}`, 'err'); }
  } }, t('Trust Project'));
  b.dataset.trust = name;
  b.disabled = S.project?.name === name && isTrusted(S.project);
  return b;
}

export function renderDiagnostics() {
  const diags = S.diags;
  const errs = diags.filter(d => d.severity === 'error'), warns = diags.filter(d => d.severity !== 'error');
  const fill = (el, list, ico) => {
    el.innerHTML = '';
    if (!list.length) { el.append(h('div', { class: 'ln info' }, t('No messages.'))); return; }
    for (const d of list) {
      const hint = hintRow(d);   // plain-language explanation + fix, expandable under the message
      const row = h('div', { class: 'diag' }, icon(ico),
        h('span', {}, `${sevWord(d)}:${d.tool || 'HDLCompiler'} - `),
        d.file && !d.inText ? h('span', { class: 'loc' }, d.line ? `"${d.file}" Line ${d.line}` : `"${d.file}"`) : null,
        h('span', { 'data-no-i18n': true }, d.file && !d.inText ? `: ${d.message}` : d.message), hint?.toggle,
        ...diagFixes(d).map(f => h('span', { class: 'diag-fix', role: 'button', 'data-no-i18n': true, onclick: e => { e.stopPropagation(); applyDiagFix(d, f); } }, `${t('Fix:')} ${t(f.title)}`)),
        trustButton(d));
      // (an editor's problem: its item selected, editor-problems.js)
      row.addEventListener('click', () => (d.goto ? d.goto() : d.file && app.openFile(d.file, d.line, d.col)));
      el.append(row);
      if (hint) el.append(hint.box);
    }
  };
  fill($('console-errors'), errs, 'err');
  fill($('console-warnings'), warns, 'warn');
  $('err-count').textContent = errs.length ? `(${errs.length})` : '';
  $('warn-count').textContent = warns.length ? `(${warns.length})` : '';
  focusNewDiagnostics(errs, warns);
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
function focusNewDiagnostics(errs, warns) {
  const before = listedDiags;
  listedDiags = new Map();   // (each message's count: one listed more times than before is new)
  const isNew = d => {
    const k = diagKey(d), n = (listedDiags.get(k) || 0) + 1;
    listedDiags.set(k, n);
    const fresh = d.source === 'console' && !seenConsoleDiags.has(d);
    if (d.source === 'console') seenConsoleDiags.add(d);
    return n > (before.get(k) || 0) || fresh;
  };
  const newErr = errs.map(isNew).some(Boolean), newWarn = warns.map(d => isNew(d) && d.severity === 'warning').some(Boolean);
  const page = newErr ? 'errors' : newWarn && !(errs.length && pageShown() === 'errors') ? 'warnings' : null;
  if (!page) {
    if (broughtForward && pageShown() === broughtForward && !(broughtForward === 'errors' ? errs : warns).length) showConsolePage('console');
    return;
  }
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
onLanguageChange(() => renderDiagnostics());

// Quick fixes of a message (core/quickfix.js): "Fix: …" in its row of the Errors / Warnings tabs.
// Applied in the file's editor (one Undo there); the file's messages are then checked again.
const fixModules = () => S.modules.map(m => ({ name: m.name, ports: (m.portList || []).map(p => p.name), params: m.paramList || [] }));
function diagFixes(d) {
  const src = d.file && S.sources.find(s => s.path === d.file);
  // (not a drawing's generated HDL, with a file of its own or not: read-only, #1176)
  if (!src || src.view || S.hdlToSch?.[src.path] || (src.lang !== 'vhdl' && src.lang !== 'verilog')) return [];
  const text = S.docs.find(o => o.path === d.file && o.editor)?.editor.getValue() ?? src.text;
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
  S.diags = [];
  lastConsoleDiag = null;
  renderDiagnostics();
}
