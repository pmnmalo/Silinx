// The page's state (#4767), a slice of web/js/app.js S of its own: the compiled design. Its modules read and write it
// here; S keeps the same fields as getters and setters onto it (the page's other code, the UI tests and window.Silinx
// read them there). The view starts the Implementation's, nothing compiled; the drawings' fields are undefined until a
// project opens.
//
//   view            the Design pane's view: 'impl' (Implementation) or 'sim' (Simulation) (app.js setView)
//   sources         the project's HDL sources, { path, lang, text, role, … } (project.js)
//   lib             the compiled library of the sources and the drawings' HDL, or null (app.js compileProject)
//   modules         its modules, { name, file, ports, … } (app.js compileProject)
//   viewSources     the drawings' generated HDL, compiled with the sources (app.js compileProject)
//   viewTexts       a drawing's file -> its text (project.js, app.js)
//   viewElsewhere   a drawing whose module another file defines -> that module (app.js compileProject)
//   viewModule      a drawing's file -> its module (project.js)
//   schOwners       a drawing linked to its HDL file -> that file (project.js)
//   hdlToSch        a drawing's HDL file -> the drawing (project.js)
//   symbolFiles     a symbol file -> its text (project.js, symbol-doc.js)
//   partModules     a circuit's parts as modules (app.js compileProject)
//   failedDrawings  the drawings whose module cannot be made (app.js compileProject, #3934)

const LATER = ['viewSources', 'viewTexts', 'viewElsewhere', 'viewModule', 'schOwners', 'hdlToSch', 'symbolFiles', 'partModules',
  'failedDrawings'];

/** The slice: its fields, read and written as properties. */
export const designState = Object.seal({
  view: 'impl', sources: [], lib: null, modules: [], ...Object.fromEntries(LATER.map(k => [k, undefined])),
});
