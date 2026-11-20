// The browser edition's trust records (#4735), as the server's (server/trust-store.js): a project of a folder on the disk
// (File ▸ Open Workspace Folder…, web/js/project-store.js) is trusted only when this browser recorded it, outside the
// folder (localStorage, by the folder's name, then the project's name and id), since a folder put there by hand
// (unzipped, cloned by command-line git, synced, restored from the .trash) may hold anything. The projects the user makes
// there and the ones they trust are recorded; an import's, a clone's, the MCP's never; a project renamed takes its record
// along, one deleted loses it. The first time this browser opens a folder after the records came (none kept yet: an
// update), its projects trusted until then are recorded once (the migration). The browser's own storage needs none:
// nothing but Silinx writes it.
import { prefKey } from './prefs.js';
import { UNRECORDED } from '../../core/trust.js';

const KEY = prefKey('silinx.trust.folders');
const fold = s => String(s).toLowerCase();   // (a folder's names, on a case-insensitive disk too)
// (localStorage; where there is none, as in Node's tests, this page's memory)
let mem = null;
const area = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const load = () => {
  try { const a = area(), t = a ? a.getItem(KEY) : mem; const j = JSON.parse(t || 'null'); return j && typeof j.folders === 'object' && j.folders ? j : null; } catch { return null; }
};
const save = j => { const t = JSON.stringify(j); try { const a = area(); if (a) a.setItem(KEY, t); else mem = t; } catch { mem = t; } };
// (a folder's records, by its name: `:` before it, so that no name is an object's own key)
const recordsOf = (j, folder) => (Array.isArray(j.folders[`:${folder}`]) ? j.folders[`:${folder}`] : (j.folders[`:${folder}`] = []));
const change = (folder, fn) => { const j = load() ?? { version: 1, folders: {} }; fn(recordsOf(j, folder)); save(j); };

/** Whether a project of a folder is recorded as trusted (its name; its id when the record names one). */
function isRecorded(folder, name, id = null) {
  const j = load();
  return !!j && recordsOf(j, folder).some(r => r.name === fold(name) && (r.id == null || r.id === (id ?? null)));
}

/** A project of a folder trusted: recorded (an earlier record of its name replaced). */
export const record = (folder, name, id = null) => change(folder, rs => { rs.splice(0, rs.length, ...rs.filter(r => r.name !== fold(name)), { name: fold(name), id: id ?? null }); });
/** A project's record removed (deleted). */
export const forget = (folder, name) => change(folder, rs => { rs.splice(0, rs.length, ...rs.filter(r => r.name !== fold(name))); });
/** A project's record moved with it (renamed). */
export const moveRecord = (folder, from, to) => change(folder, rs => { const r = rs.find(x => x.name === fold(from)); if (r) r.name = fold(to); });

/** The migration, once (no records yet): the folder's projects trusted until now (their silinx.json, list()'s) recorded. */
export async function migrateOnce(folder, list) {
  if (load()) return;
  const j = { version: 1, folders: {} };
  recordsOf(j, folder).push(...(await list()).filter(p => p.trusted !== false).map(p => ({ name: fold(p.name), id: typeof p.id === 'string' ? p.id : null })));
  save(j);
}

/** A project's description as read from a folder: one with no record untrusted, said as one Silinx did not make. */
export const marked = (folder, name, json) => (json.trusted !== false && !isRecorded(folder, name, json.id) ? Object.assign(json, { trusted: false, madeBy: UNRECORDED }) : json);
/** A project's description to write: the mark of one with no record not written (the record's absence is it). */
export const unmarked = json => { if (json?.madeBy !== UNRECORDED) return json; const { trusted, madeBy, ...rest } = json; return rest; };   // eslint-disable-line no-unused-vars
