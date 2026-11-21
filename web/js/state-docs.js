// The page's state (#4767), a slice of web/js/app.js S of its own: the documents. Its modules read and write it here; S
// keeps the same fields as getters and setters onto it (the page's other code, the UI tests and window.Silinx read them
// there). No document is open at the start.
//
//   docs    the open documents, in their tabs' order: { id, path, title, editor?, … } (app.js openDoc / closeDoc)
//   active  the document in front, or null (app.js activateDoc)

/** The slice: its fields, read and written as properties. */
export const docsState = Object.seal({ docs: [], active: null });
