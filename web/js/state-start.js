// The page's state (#4767), a slice of web/js/app.js S of its own: the page's start. Its modules write it here; S keeps
// the same fields as getters and setters onto it (the UI tests wait for them through window.Silinx). Each starts
// undefined until the start-up gets there.
//
//   linkOpened      a design link in the address opened, or its opening ended (app.js, link-hash.js)
//   linksWatched    the address's links watched (app.js; the UI tests wait for it before they change the hash, #3331)
//   startupChecked  the start-up's checks written (app.js; the UI tests wait for it)

// the slice's fields (S's getters and setters in app.js are these)
const START_FIELDS = ['linkOpened', 'linksWatched', 'startupChecked'];

/** The slice: its fields, read and written as properties. */
export const startState = Object.seal(Object.fromEntries(START_FIELDS.map(k => [k, undefined])));
