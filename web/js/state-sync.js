// The page's state (#4767), a slice of web/js/app.js S of its own: the drawings' HDL kept in step. Its modules read and
// write it here; S keeps the same fields as getters and setters onto it (the page's other code and the UI tests, through
// window.Silinx, read them there). Each starts undefined until the project opens.
//
//   outOfSync       a drawing whose HDL file is older than it -> why (drawings.js syncDrawingHdl)
//   staleHdl        an HDL file a drawing could not make again -> { from, why } (drawings.js staleHdl, #303)
//   staleSeen       a stale HDL file -> what was already said of it (app.js)
//   hdlClash        a drawing -> its HDL file's clash with another file (drawings.js drawnHdlClashes)
//   hdlClashWarned  the clashes already said in the console (drawings.js)

// the slice's fields (S's getters and setters in app.js are these)
const SYNC_FIELDS = ['outOfSync', 'staleHdl', 'staleSeen', 'hdlClash', 'hdlClashWarned'];

/** The slice: its fields, read and written as properties. */
export const syncState = Object.seal(Object.fromEntries(SYNC_FIELDS.map(k => [k, undefined])));

/** A project opened or closed: nothing out of step, stale or clashing, nothing said yet. */
export function resetSync() {
  Object.assign(syncState, { outOfSync: {}, staleHdl: {}, staleSeen: new Map(), hdlClash: {}, hdlClashWarned: new Set() });
}
