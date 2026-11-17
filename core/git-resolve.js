// A pull's conflicts in drawings, resolved object by object (#3197): the server's git (server/git.js) and GitHub's API
// (core/git-rest.js) give a drawing in conflict its three versions (the base, mine, theirs); its conflicts are listed,
// each object's with what each side did to it, the user chooses "mine" or "theirs" for each, and the drawing that
// results is checked as Check Drawing checks it (an ASM chart's Validate, a state diagram's Check, a Petri net's Check,
// a circuit's Check Circuit; for every kind, no object pointing at one the resolution left out) before it is written. Its HDL file (its
// generatedFile, in conflict too when both sides changed the drawing) is made from it again by the caller. A drawing's
// JSON is never merged as text. Isomorphic.
import { drawingKind, diffDrawings, mergeDrawings, resolveDrawing, conflictId, danglingRefs } from './drawing-merge.js';
import { checkTextChoice } from './text-merge.js';

const parse = t => { try { const j = JSON.parse(t); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch { return null; } };
// what a side did to an object, from the base: added, removed, moved, changed (its fields)
function what(base, side, c) {
  if (c.prop) return side === undefined ? 'removed' : 'changed';
  if (side === null) return 'removed';
  if (c.base === null) return 'added';
  const d = diffDrawings({ [c.coll]: [c.base] }, { [c.coll]: [side] });
  return d.moved.length ? 'moved' : `changed (${(d.changed[0]?.fields || []).join(', ')})`;
}
const labelOf = c => (c.prop ? c.prop : `${c.coll} ${(c.mine || c.theirs || c.base)?.name ?? c.key}`);

/** A drawing's conflicts: { path, kind, conflicts: [{ id, label, mine, theirs }] }, or null (not a drawing, or a version
 *  that is not one: its conflict stays a file's). */
export function drawingConflicts(path, baseText, mineText, theirsText) {
  const kind = drawingKind(path);
  if (!kind) return null;
  const base = baseText == null ? {} : parse(baseText), mine = parse(mineText), theirs = parse(theirsText);
  if (!base || !mine || !theirs) return null;
  const { conflicts } = mergeDrawings(base, mine, theirs);
  return {
    path, kind,
    conflicts: conflicts.map(c => ({ id: conflictId(c), label: labelOf(c), mine: what(c.base, c.mine, c), theirs: what(c.base, c.theirs, c) })),
  };
}

const CHECKS = {
  asm: async m => (await import('./asm.js')).validate(m),
  fsm: async m => (await import('./fsm.js')).validateFsm(m),
  pn: async m => (await import('./petri-analysis.js')).checkPetri(m),
  circ: async m => (await import('./circuit-check.js')).checkCircuit((await import('./circuit.js')).normalizeCircuit(m)),   // (#4203)
};

/** The drawing's errors as Check Drawing gives them (its warnings left: a resolution may keep the sides' own). */
export async function checkResolved(kind, model) {
  const errs = danglingRefs(model).map(r => `${r.coll ? `${r.coll} ${r.key}` : r.key}: points at ${r.to}, which the resolution left out`);
  if (CHECKS[kind]) for (const d of await CHECKS[kind](model)) if (d.severity === 'error') errs.push(d.message);
  return errs;
}

/** A drawing in conflict resolved by the choices ({ [id]: 'mine' | 'theirs' }): { text, model }, or an Error (a choice
 *  missing, or the result not a valid drawing: its errors). */
export async function resolveConflict(path, baseText, mineText, theirsText, choices = {}) {
  const kind = drawingKind(path);
  const base = baseText == null ? {} : parse(baseText), mine = parse(mineText), theirs = parse(theirsText);
  if (!kind || !base || !mine || !theirs) throw Object.assign(new Error(`'${path}' is no drawing whose conflicts can be resolved object by object`), { status: 400 });
  let model;
  try { model = resolveDrawing(base, mine, theirs, choices); } catch (e) { throw Object.assign(new Error(`${path}: ${e.message}`), { status: 400, left: e.left }); }
  const errs = await checkResolved(kind, model);
  if (errs.length) throw Object.assign(new Error(`${path}: the resolution is not a valid drawing: ${errs.join('; ')}`), { status: 422, errors: errs });
  const indent = kind === 'sch' ? 1 : 2;
  return { text: `${JSON.stringify(model, null, indent)}\n`, model };
}

/** The choices of a pull, checked: a copy, or an Error (400). resolve: { "<drawing>": { "<object>": "mine" | "theirs" } }
 *  for a drawing's objects, { "<text file>": { "<hunk>": "mine" | "theirs" | "both" | { "text": "…" } } } for a text
 *  file's conflicts (#4214, core/text-merge.js). */
export function checkChoices(resolve) {
  if (resolve == null) return null;
  const bad = () => Object.assign(new Error('resolve: give { "<drawing>": { "<object>": "mine" | "theirs" } } and { "<text file>": { "<hunk>": "mine" | "theirs" | "both" | { "text": "…" } } }'), { status: 400 });
  if (typeof resolve !== 'object' || Array.isArray(resolve)) throw bad();
  const out = {};
  for (const [p, c] of Object.entries(resolve)) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw bad();
    out[p] = {};
    for (const [id, side] of Object.entries(c)) {
      if (drawingKind(p) ? side !== 'mine' && side !== 'theirs' : !checkTextChoice(side)) throw bad();
      out[p][id] = typeof side === 'object' ? { text: side.text } : side;
    }
  }
  return out;
}

/** What a pull stopped by conflicts asks of the user (the GitError's hint), and whether Silinx can resolve them all
 *  (the drawings' objects, the text files' hunks: Pull again with the choices) or not (a file removed on one side and
 *  changed on the other, a file that is no text). */
export function pullConflictHint({ drawings = [], texts = [], others = [] }) {
  if (others.length) return { resolvable: false, hint: 'The same file changed here and on GitHub. Commit your version under another name, or ask the other author, then Pull again.' };
  if (!texts.length) return { resolvable: true, hint: 'The same objects of a drawing changed here and on GitHub: choose mine or theirs for each, then Pull again.' };
  return { resolvable: true, hint: `The same lines of a file changed here and on GitHub: choose mine, theirs or both for each conflict, or write its lines${drawings.length ? ' (and mine or theirs for each object of a drawing)' : ''}, then Pull again.` };
}
