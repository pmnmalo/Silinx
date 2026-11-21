// The page's state (#4767), a slice of web/js/app.js S of its own: the C sources'. Its modules read and write it here; S
// keeps the same fields as getters and setters onto it (the page's other code, and window.Silinx, read them there). Each
// starts undefined until the project opens.
//
//   hls           the C sources' black boxes, the project's RTL models of its C functions (project.js, #1903)
//   bbUndeclared  the black boxes no HDL declares: their diagnostics (c-source.js)
//   cFailed       a C source whose HDL cannot be made -> { module, diagnostics } (c-source.js, #2995)
//   cFailedSaid   a failed C source -> what was already said of it in the console (c-source.js)

// the slice's fields (S's getters and setters in app.js are these)
const C_FIELDS = ['hls', 'bbUndeclared', 'cFailed', 'cFailedSaid'];

/** The slice: its fields, read and written as properties. */
export const cState = Object.seal(Object.fromEntries(C_FIELDS.map(k => [k, undefined])));

/** A project opened or closed: no C source failed, nothing said yet (its black boxes are read again as it opens). */
export function resetC() {
  Object.assign(cState, { cFailed: {}, cFailedSaid: new Map() });
}
