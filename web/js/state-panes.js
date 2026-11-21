// The page's state (#4767), a slice of web/js/app.js S of its own: the selection and the panes. Its modules read and write
// it here; S keeps the same fields as getters and setters onto it (the page's other code, the UI tests and window.Silinx
// read them there). The selection starts null, the trees as the user leaves them start empty, the others undefined.
//
//   sel            the Design pane's selected item, { type, module, file … }, or null (design.js select; the Processes
//                  panel lists its processes)
//   selKey         the Design pane's selected row (design.js; a follower's, the owner's: collab-activity.js)
//   selProc        the Processes panel's selected process (processes.js)
//   leftPage       the left pane's page shown (app.js showLeftPage)
//   leftChosen     the left page the user chose (app.js)
//   fpgaSyncing    the FPGA view selecting the Design pane's row (impl-views.js)
//   menus          the menu bar's menus (menus.js)
//   procCollapsed  ids of the collapsed groups of the Processes panel (processes.js)
//   treeOpen       Design hierarchy / Files trees: key -> expanded? (design.js, as the user left it)

/** The slice: its fields, read and written as properties. */
export const panes = Object.seal({
  sel: null, selKey: undefined, selProc: undefined, leftPage: undefined, leftChosen: undefined, fpgaSyncing: undefined,
  menus: undefined, procCollapsed: new Set(), treeOpen: new Map(),
});
