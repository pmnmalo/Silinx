// An Undo / Redo of a project's command merged into the project as it is now (#5739, phase 1 of #5743), for a project
// edited by several people at once (shared live with editors): only the command's own changes are reverted (or made
// again), the changes made since by anyone else stay. Three ways, as Merge Contribution… merges (core/project-merge.js):
// the base is the step's other side (what the command left, for an Undo), theirs the side it goes to (what the project
// was before it), mine the project now; a text file by its lines, a drawing by its objects, silinx.json by its fields, a
// renamed file's later changes carried to its old path. Where the command's change and a later one overlap (the same
// lines, objects or fields), nothing is undone: the conflicts are returned, the caller says them. Isomorphic.
//   await mergeStep(step, side, now) -> { write, remove, json, regenerate, conflicts }
import { compareProjects, mergeProjects, openConflicts } from './project-merge.js';

const VOLATILE = ['id', 'origin', 'trusted', 'madeBy', 'name'];
const filesOf = (files, side) => Object.fromEntries(files.filter(f => typeof f[side] === 'string').map(f => [f.path, f[side]]));

/** step: a step of web/js/history.js ({ files: [{ path, before, after }] (null: no file), settings: { before, after }
 *  (silinx.json's texts) | null }); side: 'before' (an Undo) or 'after' (a Redo); now: { json (silinx.json now, without
 *  its fileTree), files: { path: text | null } (the step's paths now) }. Returns what to write: { write ({ path: text }),
 *  remove ([path]), json (silinx.json to save, null: unchanged), regenerate ([drawing]: whose HDL to make again),
 *  conflicts ([{ path, id?, field?, reason? }]: none written when there is any) }. */
export async function mergeStep(step, side, now) {
  const other = side === 'before' ? 'after' : 'before';
  const json = s => (step.settings ? JSON.parse(step.settings[s]) : now.json);
  const mine = { json: now.json, files: filesOf(Object.entries(now.files).map(([path, t]) => ({ path, now: t })), 'now') };
  const cmp = compareProjects({ ancestor: { json: json(other), files: filesOf(step.files, other) }, mine, theirs: { json: json(side), files: filesOf(step.files, side) } });
  const conflicts = openConflicts(cmp);
  const none = { write: {}, remove: [], json: null, regenerate: [] };
  if (conflicts.length) return { ...none, conflicts };
  let m;
  try { m = await mergeProjects(cmp); } catch (e) {
    // (a drawing whose merge is not a valid one: as a conflict, nothing written)
    return { ...none, conflicts: (e.errors ? [{ path: /^(\S+):/.exec(e.message)?.[1] || '', reason: e.message }] : e.left) || [{ path: '', reason: e.message }] };
  }
  const saved = m.taken.includes('silinx.json') ? { ...m.json } : null;
  if (saved) for (const k of VOLATILE) { if (now.json[k] !== undefined) saved[k] = now.json[k]; else delete saved[k]; }
  return { write: m.write, remove: m.remove, json: saved, regenerate: m.regenerate, conflicts: [] };
}

/** The conflicts said in a line: the files, with their objects or lines where the merge names them. */
export const conflictsLine = conflicts => [...new Set(conflicts.map(c => (c.field ? `silinx.json (${c.field})` : c.path)))].join(', ');
