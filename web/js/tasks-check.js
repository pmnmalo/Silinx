// A schematic's Check, and a Try it it refuses, in the console (#993, #782; in every interface, #2805), as every
// process's messages are (the message centre, web/js/messages.js): a header, its errors and warnings, its result, under
// the Design source; each message's line takes the editor to the item it is about. The editor has no panel of its own
// (docs/UI-GUIDELINES.md, Messages): it sends a 'silinx-diagnostics' event (web/js/sch-try.js showDiags).
// checkLines has no DOM and is unit tested (test/tasks.test.js).
import { t, onLanguageChange } from './i18n.js';
import { docsState } from './state-docs.js';

const SHOW = 'Show it in the drawing';
const SEVERITY = { error: ['ERROR', 'err'], warning: ['WARNING', 'warn'] };

/** The console's lines of a check `what` of `name` that found `diags` ({ severity, message }): { text, cls, diag? }. */
export function checkLines(what, name, diags) {
  const errs = diags.filter(d => d.severity === 'error').length, warns = diags.filter(d => d.severity === 'warning').length;
  return [
    { text: `\nStarted : "${what}" of ${name}.\n`, cls: 'hdr' },
    ...diags.map(d => { const [tag, cls] = SEVERITY[d.severity] || ['INFO', '']; return { text: `${tag}: ${d.message}`, cls, diag: d }; }),
    errs ? { text: `\nProcess "${what}" failed`, cls: 'err' }
      : { text: `\nProcess "${what}" completed successfully${warns ? ` with ${warns} warning(s)` : ''}`, cls: 'ok' },
  ];
}

/** Writes a schematic's Check or refused Try it in the console (`log`: web/js/console.js), `showConsole(diags)` showing
 *  it (its Errors, else Warnings tab in front, #2803). */
export function initCheckMessages(showConsole, log) {
  document.addEventListener('silinx-diagnostics', e => {
    const { what, name, diags, focus } = e.detail;
    // (its run's lines, #4749: Design's, whatever else writes meanwhile; run again, its entries replaced, #4728)
    const own = { src: 'check', run: `Started : "${what}" of ${name}`, process: what };
    for (const l of checkLines(what, name, diags)) {
      // (the Errors and Warnings tabs: its errors and warnings, not its result; an entry clicked shows its item, #4746)
      log(l.text, l.cls, { diag: !!l.diag, ...own, ...(l.diag ? { goto: () => show(e.target, () => focus(l.diag)) } : {}) });
      if (!l.diag) continue;
      const ln = document.getElementById('console-log').lastElementChild;
      ln.classList.add('mc-link');
      ln.title = t(SHOW);   // (the console's lines are not translated: their tooltip here, again when the language changes)
      ln.addEventListener('click', () => focus(l.diag));
    }
    showConsole(diags);
  });
  // (the drawing brought to the front first: an entry of the Errors tab is clicked with another document in front)
  const show = (el, then) => import('./app.js').then(({ S, activateDoc }) => {
    const doc = docsState.docs.find(d => d.el?.contains(el));
    if (doc && docsState.active !== doc) activateDoc(doc);
    then();
  });
  onLanguageChange(() => { for (const ln of document.querySelectorAll('#console-log .ln.mc-link:not(.mc-file)')) ln.title = t(SHOW); });
}
