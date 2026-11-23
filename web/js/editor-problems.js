// A drawing editor's problems (its chart's validation: the ASM chart's, #2730; the FSM's, the Petri net's, #2803) in the
// console, never in the editor's window (#2718, docs/UI-GUIDELINES.md "Messages"): its errors and warnings in the Errors
// and Warnings tabs while it is open, updated as it is edited, a click on one going to its item; Validate (Check) writes
// them in the Console too, as a schematic's Check (tasks-check.js checkLines), each line's click going to its item.
//
//   const p = editorProblems({ file, tool: 'ASM', what: 'Validate', goto: (d) => … });
//   (inLanguage: their messages in the interface's language, the tabs' again when it changes: the FSM's, the Petri
//   net's, the circuit's, #5185)
//   p.set(diags);    // the editor's validation ({ severity, message, … }), as it is now
//   p.log(diags);    // Validate / Check: its lines in the Console, its Errors (else Warnings, else Console) tab in front
//   p.clear();       // the editor closed
import { S } from './app.js';
import { log, renderDiagnostics, showConsolePage, showProblems } from './console.js';
import { checkLines } from './tasks-check.js';
import { t, onLanguageChange } from './i18n.js';
import { procState } from './state-proc.js';

const SHOW = 'Show it in the drawing';

export function editorProblems({ file, tool, what = 'Validate', goto, inLanguage = false }) {
  const mine = (d) => d.source === 'editor' && d.file === file;
  const said = (diags) => (inLanguage ? diags.map((x) => ({ ...x, message: t(x.message) })) : diags);
  let last = [];
  const offLang = inLanguage ? onLanguageChange(() => set(last)) : () => {};
  const set = (given) => {
    last = given;
    const diags = said(given);
    procState.diags = [...procState.diags.filter((d) => !mine(d)), ...diags.filter((d) => d.severity === 'error' || d.severity === 'warning')
      .map((d) => ({ severity: d.severity, tool, message: d.message, file, line: 0, source: 'editor', goto: () => goto(d) }))];
    renderDiagnostics();
  };
  return {
    set,
    log(given) {
      const diags = said(given);
      for (const l of checkLines(what, file.split('/').pop(), diags)) {
        log(l.text, l.cls, { diag: false });   // (the tabs: set's, kept as the chart is edited)
        if (!l.diag) continue;
        const ln = document.getElementById('console-log').lastElementChild;
        ln.classList.add('mc-link', 'mc-draw');
        ln.title = t(SHOW);
        ln.addEventListener('click', () => goto(l.diag));
      }
      // (its errors or warnings in front, else the Console's lines, #2803)
      if (!showProblems(diags)) showConsolePage('console');
    },
    clear: () => { offLang(); set([]); },
  };
}
onLanguageChange(() => { for (const ln of document.querySelectorAll('#console-log .ln.mc-draw')) ln.title = t(SHOW); });
