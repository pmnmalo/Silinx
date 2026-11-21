// The page's state (#4767), a slice of web/js/app.js S of its own: the implementation's run. Its modules read and write it
// here; S keeps the same fields as getters and setters onto it (the page's other code, the UI tests and window.Silinx read
// them there). Each starts undefined until the first run.
//
//   currentJob     the implementation's job running on the server, or null (implement.js; Stop cancels it)
//   stopRequested  Stop pressed during that job (implement.js)
//   synthDone      the synthesis's result kept for the next steps, { fingerprint, status }, or null (implement.js,
//                  processes.js: read again from the project's status file as it opens)

// the slice's fields (S's getters and setters in app.js are these)
const RUN_FIELDS = ['currentJob', 'stopRequested', 'synthDone'];

/** The slice: its fields, read and written as properties. */
export const runState = Object.seal(Object.fromEntries(RUN_FIELDS.map(k => [k, undefined])));
