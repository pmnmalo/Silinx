// The page's state (#4767), a slice of web/js/app.js S of its own: the project's files. Its modules read and write it
// here; S keeps the same fields as getters and setters onto it (the page's other code, the UI tests and window.Silinx
// read them there). Each starts undefined until a project opens. (The project itself, S.project, stays S's.)
//
//   diskTree     the project folder's files (project.js)
//   fileTree     the files shown: the folder's, less the HDL the project leaves out (project.js)
//   ucfText      the constraints file's text (project.js, implement.js, processes.js)
//   git          the project's repository status, { …, byPath }, or null (git.js)
//   reloadChain  reloadProject's calls one after another (project.js)
//   opChain      the Design pane's commands one after another (design.js serialOp)

// the slice's fields (S's getters and setters in app.js are these)
const FILES_FIELDS = ['diskTree', 'fileTree', 'ucfText', 'git', 'reloadChain', 'opChain'];

/** The slice: its fields, read and written as properties. */
export const filesState = Object.seal(Object.fromEntries(FILES_FIELDS.map(k => [k, undefined])));
