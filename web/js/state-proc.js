// The page's state (#4767), a slice of web/js/app.js S of its own: the processes and their results. Its modules read and
// write it here; S keeps the same fields as getters and setters onto it (the page's other code, the UI tests and
// window.Silinx read them there). Nothing run, nothing said, at the start.
//
//   status        a process's id -> its state ('ok', 'warn', 'err', 'running'…) (processes.js, implement.js)
//   diags         the Errors / Warnings tabs' messages, { file, line, severity, text, … } (app.js setDiagnostics)
//   busy          a process of the page running (processes.js)
//   diagsCleared  how many times the Errors / Warnings tabs were cleared (a project opened or closed)

/** The slice: its fields, read and written as properties. */
export const procState = Object.seal({ status: {}, diags: [], busy: false, diagsCleared: 0 });
