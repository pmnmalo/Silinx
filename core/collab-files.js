// What an editor of a shared project does to its files and its description (#4418), beyond the text of its files
// (#3182) and its drawings (#3183): a file created (New Source…, Add Source…), deleted (Delete File…), renamed
// (Rename…), and the project's description changed (its sources added and removed, its top, its settings). On the
// editor's side (the page's follower backend, the MCP's follow_project), each one into the shared document
// (core/collab-doc.js); on the owner's (the page's, share_project's), each one the document received written to the
// disk through the import gate, the project untrusted first (#3355), as Merge Contribution takes another's copy:
//   createFile(doc, path, text), deleteFile(doc, path), renameFile(doc, from, to), setDescription(doc, json)
//   sourceChange(doc, { action, path, to, text })    the MCP's: add / remove / delete / rename, file and description
//   editorDescription(owner, text) -> json | null      an editor's silinx.json, its id, name, origin and trust the owner's
//   applyEdits(doc, { changes, project }, store, opts) -> { written, removed, project, undone, refused }
// What the owner never takes: a new file over one of its folder's that is not shared (too large, unreadable), a change of
// a file an editor does not change as text (a drawing's generated HDL, a drawing edited live), what the gate refuses.
import { sharedPath, editablePath, docFile, putFile, dropFile, putProject, gateEdit, FILE_MAX } from './collab-doc.js';
import { liveDrawing } from './collab-kinds.js';
import { drawingModel } from './collab-model.js';

const fail = m => new Error(m);

/** A new file of the project, at an editor's (an error for a path a shared project may not hold, one it has, or a text
 *  too large). */
export function createFile(doc, path, text) {
  if (!sharedPath(path)) throw fail(`${path}: not a path of the project's files`);
  if (docFile(doc, path) !== null) throw fail(`${path}: a file of the project already`);
  if (typeof text !== 'string' || text.length > FILE_MAX) throw fail(`${path}: too large to share (${FILE_MAX >> 20} MB at most)`);
  putFile(doc, path, text);
}
/** A file of the project deleted, at an editor's. */
export function deleteFile(doc, path) {
  if (docFile(doc, path) === null) throw fail(`${path}: not a file of the project`);
  dropFile(doc, path);
}
/** A file renamed, at an editor's: the new one created with its text, the old one deleted, in one change. */
export function renameFile(doc, from, to) {
  const text = docFile(doc, from);
  if (text === null) throw fail(`${from}: not a file of the project`);
  if (!sharedPath(to)) throw fail(`${to}: not a path of the project's files`);
  if (docFile(doc, to) !== null) throw fail(`${to}: a file of the project already`);
  doc.transact(() => { putFile(doc, to, text); dropFile(doc, from); });
}
/** The project's description changed, at an editor's (its fileTree left out). */
export const setDescription = (doc, json) => putProject(doc, json);

// the project's description in the document (null: none, or not one)
function docDescription(doc) {
  try { const j = JSON.parse(doc.getMap('project').get('json') ?? 'null'); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch { return null; }
}

// a source's entry, as Add to Project makes it (an HDL file: its language, a test bench's role)
const langOf = p => (/\.vhdl?$/i.test(p) ? 'vhdl' : /\.(v|sv)$/i.test(p) ? 'verilog' : null);
const roleOf = p => (/^(sim|tb|test)\//.test(p) || /(^|\/)tb_|_tb\./.test(p) ? 'sim' : 'design');

/** The MCP's change of a source, at an editor's (follow_project's source): add (a new file with `text`, or a file of the
 *  room's, put in the project as Add to Project does), remove (out of the project, the file kept), delete (out of the
 *  project and of its folder), rename (the file, and the project's entries of it, to `to`). Returns its words. */
export function sourceChange(doc, { action, path, to, text }) {
  const pj = docDescription(doc);
  if (!pj) throw fail('the shared project has not arrived yet');
  const files = Array.isArray(pj.files) ? pj.files : [];
  const listed = files.some(f => f?.path === path);
  if (action === 'add') {
    if (text === undefined && docFile(doc, path) === null) throw fail(`${path}: not a file of the project (text: a new file's)`);
    const lang = langOf(path);
    const excluded = (pj.excluded || []).filter(f => f !== path);
    const next = { ...pj, excluded, files: lang && !listed ? [...files, { path, lang, role: roleOf(path) }] : files };
    if (/\.ucf$/i.test(path) && !pj.constraints) next.constraints = path;
    // (one change: the file and the description together)
    doc.transact(() => { if (text !== undefined) createFile(doc, path, String(text)); setDescription(doc, next); });
    const e = next.files.find(f => f.path === path);
    return `${path} added to the project${e ? ` (${e.lang}, ${e.role})` : ''}.`;
  }
  if (action === 'remove' || action === 'delete') {
    if (docFile(doc, path) === null) throw fail(`${path}: not a file of the project`);
    const next = { ...pj, files: files.filter(f => f?.path !== path) };
    if (pj.constraints === path) next.constraints = '';
    if (action === 'remove' && !listed) next.excluded = [...new Set([...(pj.excluded || []), path])];
    if (action === 'delete') next.excluded = (pj.excluded || []).filter(f => f !== path);
    doc.transact(() => { setDescription(doc, next); if (action === 'delete') dropFile(doc, path); });
    return action === 'remove' ? `Removed ${path} from the project (the file is kept in the project folder).` : `${path} deleted.`;
  }
  if (action === 'rename') {
    if (typeof to !== 'string' || !to) throw fail('to: the file\'s new path');
    const next = { ...pj, files: files.map(f => (f?.path === path ? { ...f, path: to } : f)) };
    if (pj.constraints === path) next.constraints = to;
    if (Array.isArray(pj.excluded)) next.excluded = pj.excluded.map(f => (f === path ? to : f));
    doc.transact(() => { renameFile(doc, path, to); setDescription(doc, next); });
    return `${path} renamed ${to}.`;
  }
  throw fail('action: add, remove, delete or rename');
}

/** The fields of a project's description that stay the owner's whatever an editor writes (as Merge Contribution's,
 *  core/project-merge.js): its id, name, origin and trust, its layout's version. */
export const OWNER_FIELDS = Object.freeze(['id', 'name', 'origin', 'trusted', 'madeBy', 'version']);

/** An editor's silinx.json (its text, the document's) as the owner takes it: its fields, but OWNER_FIELDS the owner's
 *  (`owner`: its description now), its paths (sources, constraints, excluded) only the project's files' (null: not a
 *  project's description). */
export function editorDescription(owner, text) {
  let pj;
  try { pj = JSON.parse(text); } catch { return null; }
  if (!pj || typeof pj !== 'object' || Array.isArray(pj)) return null;
  const { fileTree, ...out } = pj;   // eslint-disable-line no-unused-vars
  for (const k of OWNER_FIELDS) { delete out[k]; if (owner && Object.hasOwn(owner, k)) out[k] = owner[k]; }
  if (out.files !== undefined) out.files = Array.isArray(out.files) ? out.files.filter(f => f && typeof f === 'object' && sharedPath(f.path)) : [];
  if (out.constraints && !sharedPath(out.constraints)) out.constraints = '';
  if (out.excluded !== undefined) out.excluded = Array.isArray(out.excluded) ? out.excluded.filter(sharedPath) : [];
  return out;
}
const fieldsOf = pj => { const { fileTree, ...rest } = pj || {}; return JSON.stringify(rest); };   // eslint-disable-line no-unused-vars

/** Whether an editor changes `path`'s text at the owner's (a change of an existing file): a text file an editor
 *  changes that no drawing generates (`generated`), or a drawing of no structure yet (one just created, as text). */
export const textEditable = (doc, path, generated = new Set()) => (editablePath(path) && !generated.has(path)) || (liveDrawing(path) && !drawingModel(doc, path));

/** An editor's changes the owner received (core/collab-doc.js watchDoc's: { changes, project }), written to its disk:
 *  store { read() -> { json (its description), fileTree (its folder's files) }, write(path, text), remove(path),
 *  saveJson(json), untrust() (the project untrusted, said, once) }; opts { generated (its drawings' HDL files: never an
 *  editor's text to change), warn(text) }. A new or changed file through the import gate, the project untrusted before
 *  it is written; a file deleted (the caller's remove: into the .trash where there is one); the description as
 *  editorDescription takes it. Returns { written, removed, project (written), undone (paths: what was not taken, the
 *  caller publishes the project again from the disk), refused (the gate refused one) }. */
export async function applyEdits(doc, { changes = [], project = false }, store, { generated = new Set(), warn = () => {} } = {}) {
  const out = { written: [], removed: [], project: false, undone: [], refused: false };
  let disk = await store.read();
  const onDisk = new Set(disk.fileTree || []);
  // (a new file and a changed one first, the deleted ones after: a rename the gate refuses keeps its old file)
  for (const c of changes.filter(x => x.kind !== 'deleted')) {
    const text = docFile(doc, c.path);
    if (typeof text !== 'string') continue;   // (deleted since: its own change)
    const ok = c.kind === 'created' ? !onDisk.has(c.path) : onDisk.has(c.path) && textEditable(doc, c.path, generated);
    if (!ok) { out.undone.push(c.path); continue; }
    let gated;
    try { gated = gateEdit(c.path, text); } catch (e) { warn(`${c.path}: an editor's change not written: ${e.reason || e.message}`); out.refused = true; continue; }
    try {
      await store.untrust();
      await store.write(c.path, gated);
      out.written.push(c.path);
    } catch (e) { warn(`${c.path}: an editor's change not written: ${e.message}`); out.refused = true; }
  }
  // (a write refused: the deletions of the same change undone, a rename's old file kept)
  for (const c of changes.filter(x => x.kind === 'deleted')) {
    if (!onDisk.has(c.path) || docFile(doc, c.path) !== null) continue;
    if (out.refused) { out.undone.push(c.path); continue; }
    try { await store.remove(c.path); out.removed.push(c.path); } catch (e) { warn(`${c.path}: an editor's deletion not made: ${e.message}`); out.refused = true; }
  }
  if (project) {
    const next = editorDescription(disk.json, doc.getMap('project').get('json') ?? '');
    if (!next) out.undone.push('silinx.json');
    else if (fieldsOf(next) !== fieldsOf(disk.json)) {
      try {
        await store.untrust();
        disk = await store.read();   // (its trust as untrust() left it)
        const json = { ...next };
        for (const k of OWNER_FIELDS) { delete json[k]; if (Object.hasOwn(disk.json, k)) json[k] = disk.json[k]; }
        await store.saveJson(json);
        out.project = true;
      } catch (e) { warn(`silinx.json: an editor's change not written: ${e.message}`); out.refused = true; }
    }
  }
  return out;
}

/** The owner's queue of the editors' changes (watchDoc's callback, `push`): each one applied after the one before (#4110:
 *  `apply(ev)`, its result whether the project is to be published again from the disk), and the project published
 *  again (`publish()`) only once none is waiting (#4418: a change still to be written, a file an editor deleted after
 *  saving the description, would be put back). `again()`: the project published again (the disk changed), now or, while
 *  changes wait, after them; in the queue too, so that a read of the disk never publishes after a newer one (its
 *  promise, the publishing done). `publish(fresh)` puts what it read into the document only if `fresh()` (#4480: an
 *  editor's change that arrived during the read is in the document, not yet on the disk: the read published would put
 *  the old back over it and the change, applied from the document after, would be lost); it is published again after
 *  that change. */
export function editQueue(apply, publish) {
  let chain = Promise.resolve(), waiting = 0, due = false;
  const fresh = () => waiting === 0;
  const flush = async () => { if (waiting === 0 && due) { due = false; await publish(fresh); if (waiting > 0) due = true; } };
  return {
    push(ev) {
      waiting++;
      chain = chain.then(async () => {
        try { if (await apply(ev)) due = true; } catch { due = true; }
        finally { waiting--; }
        await flush();
      }).catch(() => { /* the next change */ });
    },
    again() { due = true; chain = chain.then(flush).catch(() => {}); return chain; },
    busy: () => waiting > 0,
  };
}
