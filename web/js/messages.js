// The message centre (#798, #782; in every interface since #925): the bottom panel as the one place of every
// flow's messages (web/js/tasks.js starts it; its look: web/css/messages.css).
// - Each line of the Console says where it comes from (data-src): Check Syntax (Design), Simulation, Emulation,
//   Implementation (synthesis, implementation, the constraints' checks (#2692) and programming the board: one filter,
//   #1173), or the application
//   ('app'), or the one its writer gave it (data-own-src: the collaboration's messages, Design's, #4632); the others'
//   from the processes' headers ("Started : …", "=== SILINX STEP …", iMPACT's "Programming FPGA (SRAM)..."): the lines
//   after a header are its process's (sourceOf, lineSource). Each line's source is decided once, where it is written,
//   with its message (#4749: web/js/console.js log, core/message.js), and the Errors / Warnings tabs list the entries of
//   the sources the filter shows.
// - Filters by source follow the task in front in the Tasks interface (Implement: Implementation)
//   until the viewer picks one; All shows every line (the Silinx and ISE style interfaces' default: no task). A
//   process started whose source the viewer's filter hides turns that filter to its source (#1852, #1867); a C
//   module's commands, run where it is edited, turn the task's filter too (#2262).
// - Folded (tasks.js), the panel shows its last line of the current filter.
// - SSim's console and the emulator's Messages box are hidden; their lines come here (Simulation, Emulation).
// - One command line: SSim's commands while simulating (SSim> run 1 us; Simulate in front, or an SSim window in the
//   other interfaces; its history on ↑ / ↓), else the command palette.
// - A line outside a process (after its result, before the next header) is the application's, as a line its writer
//   said is (appLog, logError, logWarning, logInfo: the Trust Project notice, refusals); the application's lines are
//   shown under every filter and task (#4729).
// The sources and the filters (sourceOf, lineSource, isShown, filterSources) have no DOM and are unit tested
// (test/messages.test.js).

import { h } from './ui.js';

export const SOURCES = ['check', 'sim', 'emu', 'impl'];
export const SOURCE_LABEL = { all: 'All', check: 'Design',   // (the design's checks: Check Syntax, Check Schematic, #994; a UCF's are Implementation's, #2692)
  sim: 'Simulation', emu: 'Emulation', impl: 'Implementation' };   // (Implementation: synthesis, implementation and the board's, #1173)
// the sources a task shows when the viewer has not picked a filter
const TASK_SOURCES = { edit: ['check'], sim: ['sim'], emu: ['emu'], impl: ['impl'], prog: ['impl'] };

/** The source of a Console line: the process a header starts, else `cur` (the lines after a header are
 *  its process's; before any, and after its end, the application's: endsProcess). An unknown process is the
 *  application's (#4729: always shown, never misfiled under Implementation). */
export function sourceOf(line, cur = 'app') {
  const s = String(line).trim();
  let m = /^Started : "([^"]+)"/.exec(s);
  if (m) {
    const p = m[1];
    // (a chart's Validate, #2730; Check, #2803; a design project's Check Design, #4716; a schematic's Try it, an exercise's
    // tests, #4729) (Check Constraints, a UCF's Check Syntax too: Implementation's, #2692)
    if (/Check Syntax|Check Schematic|^Check (Design|State Diagram|Petri Net|Circuit)$|^Validate$|^Try it$|^Run (Visible|All) Tests$/.test(p)) return 'check';
    // (a C module's runs, #1852; Verify, the Simulation view's processes, #4729)
    if (/^Simulate\b|^Save as Test Bench|^C Simulation$|^C\/RTL Co-simulation$|^Verify (Equivalence|Property|Assertions)$/.test(p)) return 'sim';
    // synthesis, Translate, Map, Place & Route and their models, timing, power, back-annotation, the FPGA view, the constraints' check
    if (/^(Synthesize\b|Translate$|Map$|Place & Route$|Implement Design$|Generate |Back-annotate |View |Validate Design Rules$|Check Constraints$|Analyze |Program)/.test(p)) return 'impl';
    return 'app';
  }
  if (/^=== SILINX STEP \w+/.test(s)) return 'impl';
  if (/^(ERROR: )?Board Emulator:/.test(s)) return 'emu';
  if (/^(Scanning JTAG chain|Programming |Verifying |Erasing |Backing up |Reloading the FPGA from the PROM)\S*.*\.\.\.$/.test(s)) return 'impl';   // (the board's: Implementation's, #1173)
  if (/^Project ".*" (opened|closed)|^Toolchain: |^Programmers found: |^Silinx \S+ (is up to date|Project Navigator)|^Browser edition: /.test(s)) return 'app';
  return cur;
}

/** Whether a line ends its process (#4729): its result ("Process "…" completed successfully", "… failed", "… stopped"),
 *  the emulator's one line; the lines after it, until the next header, are the application's, not that process's. */
function endsProcess(line) {
  const s = String(line).trim();
  return /^Process "[^"]*" (completed|failed|stopped)|^Process (failed|stopped)\b|^(ERROR: )?Board Emulator:/.test(s);
}

/** A line's source after the line whose source carried on was `cur`, and the source the line after it carries on:
 *  [source, next]. */
export function lineSource(line, cur = 'app') {
  const src = sourceOf(line, cur);
  return [src, endsProcess(line) ? 'app' : src];
}

/** Whether lines of `src` are shown when the sources `set` are (null: every one): the application's always are
 *  (#4729: the Trust Project notice, the app's own information, warnings and errors, under every filter and task). */
export const isShown = (set, src) => !set || src === 'app' || set.includes(src);

/** The sources shown: `filter` picked by the viewer ('all' or a source), else the task's (null: every source). */
export function filterSources(filter, task) {
  if (filter === 'all') return null;
  if (SOURCES.includes(filter)) return [filter];
  return TASK_SOURCES[task] || null;
}

/** The filter once a process of `src` starts (#1852): its source when the filter the viewer picked hides it (a process
 *  the viewer starts never seems to do nothing), else the filter as it is (one following the task stays the task's). */
export function filterForProcess(src, filter, task) {
  if (!SOURCES.includes(filter)) return filter;
  const set = filterSources(filter, task);
  return set.includes(src) ? filter : src;
}

/** The filter once the viewer runs a command of `src` (#2262): its source when the filter hides it, the task's too (the
 *  C commands run in the Edit task, whose filter shows Design's lines only), else the filter as it is. */
export function filterForCommand(src, filter, task) {
  const set = filterSources(filter, task);
  return !set || set.includes(src) ? filter : src;
}

// ------------------------------------------------------------------ the page
let app = null, picked = null, task = null, built = false;
const $ = id => document.getElementById(id);
const shownSources = () => filterSources(picked, task);
/** The sources the console's filter shows now (null: every one; the message centre not built: every one), for the
 *  Errors / Warnings tabs (#4749: web/js/console.js renderDiagnostics). */
export const shownSourcesNow = () => (built ? shownSources() : null);
// (the simulation in front: there may be several, #1161)
const isimInput = () => document.querySelector('#workspace > .doc:not([hidden]) .isim .isim-cmdline input');
// SSim's commands: in the Tasks interface while Simulate is in front, in the others while an SSim window is
const simulating = () => !!isimInput() && (task === 'sim' || (task === null && /^isim(:|$)/.test(app?.S.active?.id || '')));

// (a line's source: its message's, decided where it was written, #4749: web/js/console.js log; a line of none, the
// application's)
function tag(ln, started = true) {
  ln.dataset.src ||= 'app';
  // (a process started: shown, the filter turned to its source if it hid it, #1852)
  if (started && /^Started : "/.test(ln.textContent.trim()) && built && ln.dataset.src !== 'app') {
    const f = filterForProcess(ln.dataset.src, picked, task);
    if (f !== picked) { picked = f; refilter(); return; }
  }
  ln.classList.toggle('mc-off', !isShown(shownSources(), ln.dataset.src));
}
function retagAll() {
  for (const ln of $('console-log').children) tag(ln, false);
}
function refilter() {
  const set = shownSources();
  for (const ln of $('console-log').children) ln.classList.toggle('mc-off', !isShown(set, ln.dataset.src));
  // (pressed: the sources shown; All when every one is)
  for (const b of document.querySelectorAll('#mc-filters .filt')) b.setAttribute('aria-pressed', String(set ? set.includes(b.dataset.src) : b.dataset.src === 'all'));
  showLast();
  const log = $('console-log');
  log.scrollTop = log.scrollHeight;
  document.dispatchEvent(new CustomEvent('silinx:console-filter'));   // (the Errors / Warnings tabs follow it, #4749)
}
// the folded panel's line: the last one of the filter
function showLast() {
  const last = $('mc-last');
  if (!last) return;
  const ln = [...$('console-log').children].reverse().find(l => !l.classList.contains('mc-off') && l.textContent.trim());
  last.textContent = ln ? ln.textContent : '';
  last.className = ln ? ln.className.replace(/\bmc-off\b/, '') : '';
}

// a line of SSim's console or of the emulator's Messages box, written here with its source, each of its lines: its own
// (#4729: the lines after it stay the process's, not the simulation's)
// (#4746: not the Errors tab's, which the simulator's own messages fill, web/js/console.js simDiagnostics; a line that
// goes to its source, double-clicked, goes there here too, each line of it, with its message's location, #4749)
function mirror(text, cls, src, el) {
  const lines = app.log(text, cls, { diag: false, src, location: el?.message?.location ?? null });
  if (!el?.classList.contains('link')) return;
  for (const ln of lines) {
    ln.classList.add('mc-link');
    ln.title = el.title;
    ln.addEventListener('dblclick', () => el.dispatchEvent(new MouseEvent('dblclick')));
  }
}
const ISIM_CLS = { 'k-error': 'err', 'k-failure': 'err', 'k-warning': 'warn', 'k-cmd': 'hdr' };
const isimCls = el => Object.entries(ISIM_CLS).find(([k]) => el.classList.contains(k))?.[1] || '';
// SSim's console and the emulator's log, followed while they are open (their own copies are hidden)
const followed = new WeakSet();
function follow() {
  if (!built) return;
  for (const cons of document.querySelectorAll('#workspace .isim-console')) {
    if (followed.has(cons)) continue;
    followed.add(cons);
    for (const el of cons.children) mirror(el.textContent, isimCls(el), 'sim', el);
    new MutationObserver(ms => { if (built) for (const m of ms) for (const el of m.addedNodes) if (el.nodeType === 1) mirror(el.textContent, isimCls(el), 'sim', el); }).observe(cons, { childList: true });
  }
  for (const logEl of document.querySelectorAll('#workspace .emu-log')) {
    if (followed.has(logEl)) continue;
    followed.add(logEl);
    const cls = el => (el.classList.contains('error') ? 'err' : el.classList.contains('warning') ? 'warn' : '');
    for (const el of logEl.children) mirror(el.textContent, cls(el), 'emu', el);
    new MutationObserver(ms => { if (built) for (const m of ms) for (const el of m.addedNodes) if (el.nodeType === 1) mirror(el.textContent, cls(el), 'emu', el); }).observe(logEl, { childList: true });
  }
}

// the command line: SSim's commands while simulating, else the command palette
async function runCommand(input) {
  const v = input.value.trim();
  if (!v) return;
  input.value = '';
  const isim = isimInput();
  if (simulating()) {
    isim.value = v;
    isim.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return;
  }
  const { showPalette } = await import('./menus.js');
  showPalette();
  const q = document.querySelector('.pal-input');
  if (q) { q.value = v; q.dispatchEvent(new Event('input', { bubbles: true })); }
}
function prompt() {
  const sim = simulating();
  const p = document.querySelector('#mc-cmd .mc-prompt'), input = document.querySelector('#mc-cmd input');
  if (!p) return;
  p.textContent = sim ? 'SSim>' : '›';
  input.placeholder = sim ? 'Type an SSim command (help)' : 'Type a command or a file name';
}

/** Builds the message centre (the Tasks interface). `a` is the app (web/js/app.js). */
function build() {
  built = true;
  $('console-tabs').append(h('div', { id: 'mc-filters', role: 'group', 'aria-label': 'Messages from' },
    ...['all', ...SOURCES].map(src => h('button', { class: 'filt', type: 'button', 'data-src': src, onclick: () => { picked = src; refilter(); } }, SOURCE_LABEL[src]))),
    h('div', { id: 'mc-last', 'data-no-i18n': true }));
  const input = h('input', { type: 'text', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Command line' });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); runCommand(input); return; }
    // (SSim's history: its own command line's, which keeps it)
    const isim = isimInput();
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isim && simulating()) {
      e.preventDefault();
      isim.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true }));
      input.value = isim.value;
    }
  });
  // (under the console's lines: Silinx's grid row 3, ISE style's before the tabs under them; web/css/messages.css)
  $('console-body').after(h('div', { id: 'mc-cmd' }, h('span', { class: 'mc-prompt' }), input));
  retagAll();
  refilter();
  prompt();
  follow();
}
/** The task in front (the Tasks interface; null in the others: every source): the filter follows it (what the
 *  viewer picked is forgotten). */
export function messagesTask(t) {
  task = t;
  picked = null;
  if (!built) return;
  refilter();
  prompt();
}

/** A command the viewer ran, of source `src` (#2262): its lines shown, whatever the filter (filterForCommand). */
export function showCommandLines(src) {
  if (!built) return;
  const f = filterForCommand(src, picked, task);
  if (f !== picked) { picked = f; refilter(); }
}

/** Builds the message centre and follows the Console's new lines, the documents opened (SSim, the emulator) and the
 *  one in front (the command line's prompt). `a` is the app (web/js/app.js). */
export function initMessages(a) {
  app = a;
  build();
  new MutationObserver(ms => {
    if (!built) return;
    for (const m of ms) for (const el of m.addedNodes) if (el.nodeType === 1) tag(el);
    showLast();
  }).observe($('console-log'), { childList: true });
  // (SSim and the emulator build their windows after their documents open: looked for once a frame at most)
  let soon = false;
  new MutationObserver(() => {
    if (!built || soon) return;
    soon = true;
    requestAnimationFrame(() => { soon = false; follow(); prompt(); });
  }).observe($('workspace'), { childList: true, subtree: true });
  new MutationObserver(() => prompt()).observe($('doc-tabs'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}
