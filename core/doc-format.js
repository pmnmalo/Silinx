// The formats of a project's documents (#4756): the version of its description (silinx.json) and of each kind of
// drawing this Silinx reads and writes. A document a newer Silinx saved (a greater version) is read as it is, but
// never written back in this one's older format, which would drop what that one added: the interface opens it read
// only and says why, and a write of it in an older format is refused (server/projects.js writeFile, the browser
// edition's store). The numbers are the drawings' own (core/schdoc.js DOC_VERSION, core/fsm.js, core/asm.js,
// core/logic.js, core/petri.js, core/circuit.js: test/doc-format.test.js checks them). Isomorphic, no imports.

/** silinx.json's version, the one New Project writes. */
export const PROJECT_VERSION = 1;

// a drawing's kind by its file's name: [pattern, its version, what it is]
const DRAWINGS = [
  [/\.sch\.json$/i, 7, 'schematic'], [/\.fsm\.json$/i, 1, 'state diagram'], [/\.asm\.json$/i, 1, 'ASM chart'],
  [/\.(tt|bool)\.json$/i, 1, 'truth table'], [/\.pn\.json$/i, 1, 'Petri net'], [/\.circ\.json$/i, 1, 'circuit'],
];

/** The version of the format of the drawing at `path` that this Silinx writes, or null (no drawing). */
export function formatVersion(path) {
  const k = DRAWINGS.find(([re]) => re.test(String(path)));
  return k ? k[1] : null;
}

const versionOf = doc => (doc && typeof doc === 'object' && Number.isFinite(+doc.version) ? +doc.version : 0);

/** A drawing (its object) a newer Silinx saved, at `path`: { version, supported, message }, else null. */
export function newerDrawing(path, doc) {
  const supported = formatVersion(path);
  if (supported === null || versionOf(doc) <= supported) return null;
  const name = String(path).split('/').pop();
  return { version: versionOf(doc), supported, message: `${name} was saved by a newer Silinx (its format ${versionOf(doc)}; this one reads up to ${supported}): opened read-only, so that it is not saved in the older format and loses nothing: update Silinx to change it` };
}

/** A project description a newer Silinx saved: its message, else null. */
export function newerProject(pj) {
  return versionOf(pj) > PROJECT_VERSION ? `the project was saved by a newer Silinx (its format ${versionOf(pj)}; this one reads up to ${PROJECT_VERSION}): what that Silinx added to it may be lost when it is saved here: update Silinx` : null;
}

/** Why `text` may not be written over `old` at `path` (a drawing a newer Silinx saved, written in an older format: what
 *  it added lost), else null. A text that is not JSON is not this module's to judge. */
export function downgradeRefusal(path, old, text) {
  if (formatVersion(path) === null || old == null) return null;
  let a, b;
  try { a = JSON.parse(old); b = JSON.parse(text); } catch { return null; }
  const n = newerDrawing(path, a);
  if (!n || versionOf(b) >= n.version) return null;
  return `'${path}' was saved by a newer Silinx (its format ${n.version}; this one writes ${n.supported}): not written in the older format, which would lose what that Silinx added: update Silinx to change it`;
}
