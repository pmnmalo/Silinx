// The formats of a project's documents (#4756): the version of its description (silinx.json) and of each kind of
// document this Silinx reads and writes, from the documents' registry (core/doc-envelope.js, #5906). A document a newer
// Silinx saved (a greater version) is read as it is, but never written back in this one's older format, which would
// drop what that one added: the interface opens it read only and says why, and a write of it in an older format is
// refused (server/projects.js writeFile, the browser edition's store). One in an older format is read in the new one
// and written so on its next save, a version of the project kept before that write (migratingWrite: the stores'). The
// numbers are the documents' own (core/schdoc.js DOC_VERSION, core/fsm.js, core/asm.js, core/logic.js, core/petri.js,
// core/circuit.js, core/regmap.js, core/symbol-layout.js, core/system-doc.js, core/system-stimulus.js:
// test/doc-format.test.js and test/doc-envelope.test.js check them). Isomorphic.
import { DOCUMENTS, documentKind, checkEnvelope, versionField, newerMessage, an } from './doc-envelope.js';

/** silinx.json's version, the one New Project writes. */
export const PROJECT_VERSION = DOCUMENTS.find(d => d.type === 'project').version;

// a project's file that is one of Silinx's documents (not silinx.json, nor the versions' index: written apart)
const fileKind = path => { const k = documentKind(path); return k && k.file !== false ? k : null; };

/** The version of the format of the document at `path` that this Silinx writes, or null (none of its documents). */
export function formatVersion(path) {
  return fileKind(path)?.version ?? null;
}

/** A document (its object) a newer Silinx saved, at `path`: { version, supported, message }, else null. */
export function newerDrawing(path, doc) {
  if (!fileKind(path)) return null;
  const c = checkEnvelope(path, doc);
  return c.state === 'newer' ? { version: c.version, supported: c.kind.version, message: c.message } : null;
}

/** A document (its object) at `path` in an older format, read in this Silinx's (#5906): its message, else null. */
export function olderDrawing(path, doc) {
  if (!fileKind(path)) return null;
  const c = checkEnvelope(path, doc);
  return c.state === 'older' ? c.message : null;
}

/** A project description a newer Silinx saved: its message, else null. */
export function newerProject(pj) {
  return (versionField(pj) ?? 0) > PROJECT_VERSION ? `the project was saved by a newer Silinx (its format ${versionField(pj)}; this one reads up to ${PROJECT_VERSION}): what that Silinx added to it may be lost when it is saved here: update Silinx` : null;
}

const parsed = text => { try { return JSON.parse(String(text).replace(/^﻿/, '')); } catch { return undefined; } };

/** Why `text` may not be written over `old` at `path` (a document a newer Silinx saved, written in an older format:
 *  what it added lost), else null. A text that is not JSON is not this module's to judge. */
export function downgradeRefusal(path, old, text) {
  if (formatVersion(path) === null || old == null) return null;
  const a = parsed(old), b = parsed(text);
  if (a === undefined || b === undefined) return null;
  const n = newerDrawing(path, a);
  if (!n || (versionField(b) ?? 0) >= n.version) return null;
  return `'${path}' was saved by a newer Silinx (its format ${n.version}; this one writes ${n.supported}): not written in the older format, which would lose what that Silinx added: update Silinx to change it`;
}

/** Whether writing `text` over `old` at `path` migrates a document (#5906): its old text in an older format (its
 *  migrations' first save), the new one in a later: { kind (its type), from, to }, else null. The stores keep a version
 *  of the project (reason 'before-migrate') before such a write, so that the old form can be had back. */
export function migratingWrite(path, old, text) {
  if (formatVersion(path) === null || old == null) return null;
  const a = parsed(old), b = parsed(text);
  if (a === undefined || b === undefined) return null;
  const was = checkEnvelope(path, a), is = checkEnvelope(path, b);
  if (!['older', 'too-old'].includes(was.state) || is.state === 'damaged' || is.version <= was.version) return null;
  return { kind: was.kind.type, from: was.version, to: is.version };
}

export { newerMessage };

/** What a project's documents' formats say (#5906; the MCP's project_info, the interface's as each opens): `texts`
 *  ({ path: text }) -> [{ path, state ('newer', 'older', 'too-old', 'damaged'), message }], by path; the current ones
 *  and those with no version (read as 1) say nothing. */
export function documentNotices(texts) {
  const out = [];
  for (const path of Object.keys(texts).sort()) {
    if (formatVersion(path) === null) continue;
    const doc = parsed(texts[path]);
    const c = checkEnvelope(path, doc === undefined ? null : doc);
    if (doc === undefined) out.push({ path, state: 'damaged', message: `${path.split('/').pop()} is not ${an(c.kind.what)}: not JSON` });
    else if (c.message) out.push({ path, state: c.state, message: c.message });
  }
  return out;
}
