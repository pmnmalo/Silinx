// A project's description, silinx.json, read from its text (#4755): a byte order mark at its start (an editor's on
// Windows, a file saved as "UTF-8 with BOM") is not part of the JSON and is skipped, as the ISE files' readers do
// (core/isesch.js). What is not JSON throws, its parser's message kept: the caller says which project it was. Read
// through its migrations (#5907, core/doc-envelope.js: version 1's kind as its profile), in memory: written in the new
// form on its next save (core/project-defaults.js projectJsonText, every writer's), a version of the project kept
// before (the stores').
import { DOCUMENTS, runMigrations, versionField } from './doc-envelope.js';

const PROJECT = DOCUMENTS.find(d => d.type === 'project');
const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

/** A description (its object) of an older version taken to this Silinx's (#5907): a new object; the current one, a
 *  newer one (read as it is: core/doc-format.js newerProject says it) or what is not a description: as it is. */
export function migrateProject(pj) {
  if (!isObject(pj)) return pj;
  const from = versionField(pj) ?? 1;
  return from < PROJECT.version ? runMigrations(PROJECT, pj, from, 'silinx.json').doc : pj;
}

/** Whether a description (its object, as stored) is of an older version than this Silinx writes: its next save
 *  migrates it (a version of the project kept first). */
export const olderProject = pj => isObject(pj) && (versionField(pj) ?? 1) < PROJECT.version;

// (a value's text with its objects' keys in order: two descriptions compared whatever their fields' order)
const canonical = v => JSON.stringify(v, (k, x) => (isObject(x) ? Object.fromEntries(Object.keys(x).sort().map(n => [n, x[n]])) : x));
/** Whether writing `next` over the stored description `stored` would change nothing but its version's form (#5907): the
 *  stores then keep the stored text as it is (a clone's silinx.json not made modified by a save that changes nothing;
 *  no version kept). */
export const sameDescription = (stored, next) => isObject(stored) && isObject(next) && canonical(migrateProject(stored)) === canonical(migrateProject(next));

/** The description in `text` (a silinx.json), its byte order mark skipped -> its object, migrated (`migrate: false`:
 *  as stored); throws a SyntaxError. A Top-Level Source Type of before #5786 (`topSourceType`, a System's too: its mode
 *  says it now) is dropped. */
export function parseDescription(text, { migrate = true } = {}) {
  const s = String(text);
  const pj = JSON.parse(s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  if (pj && typeof pj === 'object' && !Array.isArray(pj)) delete pj.topSourceType;
  return migrate ? migrateProject(pj) : pj;
}
