// Merge Contribution… (#4206, phase 2 of #4204): another person's copy of a project (a contribution) merged into the
// project, file by file, three-way through their common ancestor (core/project-rev.js: the snapshot the contribution
// carries, or the project's own of the contribution's origin), two-way with none. Each file of the project (mine), of
// the contribution (theirs) and of the ancestor (base):
//   same      the same on both sides (or changed alike)
//   theirs    changed by the contribution only: taken
//   added     added by the contribution only: taken
//   removed   removed by the contribution, unchanged here: removed
//   mine      changed (or added, or removed) here only: kept
//   merged    a drawing both sides changed, different objects: merged by its objects (core/drawing-merge.js)
//   conflict  changed on both sides (a drawing's same objects; a text file, whole): Mine or Theirs, the user's choice
//             (a drawing's per object); with no ancestor, every file that differs
// A drawing's generated HDL file (its generatedFile) is never a conflict: it is made again from the merged drawing by
// the caller. silinx.json is merged by its fields (its files' list by path, the process properties by name); its id,
// origin and trust are the project's, never the contribution's. Isomorphic.
//   contributionOf(gated) -> { json, files, ancestorText }       a contribution's zip or folder, as the import gate let it
//   compareProjects({ ancestor, mine, theirs }) -> comparison    each file's state, the drawings' conflicts, silinx.json's
//   mergeProjects(comparison, resolve) -> { json, write, remove, taken, regenerate }   or an Error (conflicts left)
import { requireGated, normalizePath } from './import-gate.js';
import { ANCESTOR_FILE, designOf } from './project-rev.js';
import { DRAWING_RE, mergeDrawings } from './drawing-merge.js';
import { drawingConflicts, checkResolved } from './git-resolve.js';

const VOLATILE = new Set(['id', 'origin', 'trusted', 'madeBy', 'name']);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const parse = t => { try { const j = JSON.parse(t); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch { return null; } };
const fail = (message, extra = {}) => Object.assign(new Error(message), { status: 400, ...extra });

/** A contribution as the import gate let it through (a Silinx project's zip or folder): { json (its silinx.json), files
 *  ({ path: text }: its project's files, its root folder taken off; build/ and hidden files never), ancestorText (its
 *  ANCESTOR_FILE, or null), skipped (paths left out) }; an Error when it is no Silinx project (an ISE project's: import it). */
export function contributionOf(gated) {
  const entries = requireGated(gated, 'contributionOf');
  const pj = entries.filter(e => /(^|\/)silinx\.json$/.test(e.path)).sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
  if (!pj) {
    if (entries.some(e => /\.xise$/i.test(e.path))) throw fail('the contribution is a Xilinx ISE project: only a Silinx project (its .zip or its folder) is merged');
    throw fail('the contribution has no silinx.json: it is no Silinx project');
  }
  const json = parse(pj.text);
  if (!json) throw fail('the contribution\'s silinx.json is not a project\'s description');
  const root = pj.path.includes('/') ? pj.path.slice(0, pj.path.lastIndexOf('/') + 1) : '';
  const files = {}, skipped = [];
  let ancestorText = null;
  for (const e of entries) {
    if (e === pj || !e.path.startsWith(root)) continue;
    const rel = e.path.slice(root.length);
    if (rel === ANCESTOR_FILE) { ancestorText = e.text ?? null; continue; }
    const n = normalizePath(rel);
    if (n.reason || /^build\//.test(n.path) || /\.xise$/i.test(n.path) || /(^|\/)silinx\.json$/i.test(n.path) || typeof e.text !== 'string') { skipped.push(rel); continue; }
    files[n.path] = e.text;
  }
  // (its description's paths are a project's, by the import gate's rules, as an import keeps them: one that is none is
  // dropped, and said)
  const pathOk = p => { const n = normalizePath(p); return typeof p === 'string' && !n.reason && n.path === p && !/(^|\/)silinx\.json$/i.test(p) && !/^build\//.test(p); };
  if (Array.isArray(json.files)) json.files = json.files.filter(f => pathOk(f?.path) || (skipped.push(`silinx.json: ${JSON.stringify(f?.path ?? f)}`), false));
  else if (json.files !== undefined) { skipped.push('silinx.json: its files\' list'); delete json.files; }
  if (json.constraints != null && !pathOk(json.constraints)) { skipped.push(`silinx.json: constraints ${JSON.stringify(json.constraints)}`); delete json.constraints; }
  if (Array.isArray(json.excluded)) json.excluded = json.excluded.filter(p => pathOk(p) || (skipped.push(`silinx.json: excluded ${JSON.stringify(p)}`), false));
  return { json, files, ancestorText, skipped };
}

// the generated HDL files of a version's drawings
function generated(files) {
  const out = new Map();
  for (const [p, t] of Object.entries(files || {})) if (DRAWING_RE.test(p)) { const g = parse(t)?.generatedFile; if (typeof g === 'string') out.set(g, p); }
  return out;
}

/** The fields of silinx.json merged (mine, theirs and the base's descriptions, designOf's): { json: the merged fields
 *  (the project's own id, origin and trust left to the caller), conflicts: [{ field, mine, theirs }] } ; resolve: { field:
 *  'mine' | 'theirs' }. With no base, a field that differs is a conflict. */
export function mergeDescription(base, mine, theirs, resolve = {}) {
  const b = base ? designOf(base) : null, m = designOf(mine), t = designOf(theirs);
  const conflicts = [];
  const pick = (field, x, y, z) => {
    if (same(y, z)) return y;
    if (x !== undefined || b) {
      if (same(x, y)) return z;
      if (same(x, z)) return y;
    }
    conflicts.push({ field, mine: y, theirs: z });
    return resolve[field] === 'theirs' ? z : y;
  };
  const out = {};
  const keys = [...new Set([...Object.keys(mine), ...Object.keys(theirs)])].filter(k => !VOLATILE.has(k));
  for (const k of keys) {
    let v;
    if (k === 'files') v = mergeFileList(b?.files, m.files, t.files);
    else if (k === 'impl' && [b?.impl, m.impl, t.impl].every(x => x === undefined || (x && typeof x === 'object' && !Array.isArray(x)))) {
      v = {};
      for (const f of [...new Set([...Object.keys(m.impl || {}), ...Object.keys(t.impl || {})])]) {
        const r = pick(`impl.${f}`, b ? b.impl?.[f] : undefined, m.impl?.[f], t.impl?.[f]);
        if (r !== undefined) v[f] = r;
      }
    } else v = pick(k, b ? b[k] : undefined, m[k], t[k]);
    if (v !== undefined) out[k] = v;
  }
  return { json: out, conflicts };
}
// the files' list by path: an entry one side added, removed or changed taken; both changed: mine's
function mergeFileList(b, m = [], t = []) {
  const key = f => f?.path;
  const B = new Map((b || []).map(f => [key(f), f])), M = new Map(m.map(f => [key(f), f])), T = new Map(t.map(f => [key(f), f]));
  const out = [];
  for (const p of [...new Set([...M.keys(), ...T.keys()])]) {
    const x = B.get(p), y = M.get(p), z = T.get(p);
    let v;
    if (same(y, z)) v = y;
    else if (b && same(x, y)) v = z;
    else v = y ?? (b && x !== undefined ? undefined : z);   // (removed here: gone; added there, no base: taken)
    if (v !== undefined) out.push(v);
  }
  return out;
}

/** Each file compared ({ ancestor: a snapshot or null, mine, theirs: { json, files } }): { threeWay, files: [{ path,
 *  state, generatedBy?, conflicts? (a drawing's: [{ id, label, mine, theirs }]) }] (in the paths' order), project: {
 *  conflicts } (silinx.json's), counts }. */
export function compareProjects({ ancestor = null, mine, theirs }) {
  const A = ancestor?.files || null, M = mine.files, T = theirs.files;
  const gen = new Map([...generated(A), ...generated(M), ...generated(T)]);
  const files = [];
  for (const path of [...new Set([...Object.keys(M), ...Object.keys(T), ...Object.keys(A || {})])].sort()) {
    const a = A ? A[path] : undefined, m = M[path], t = T[path];
    if (m === undefined && t === undefined) continue;   // (removed on both sides)
    const row = { path, state: stateOf(A, a, m, t) };
    if (gen.has(path)) row.generatedBy = gen.get(path);
    if (row.state === 'conflict' && A && DRAWING_RE.test(path) && m !== undefined && t !== undefined) {
      const c = drawingConflicts(path, a ?? null, m, t);
      if (c) { row.conflicts = c.conflicts; if (!c.conflicts.length) row.state = 'merged'; }
    }
    // (a generated file follows its drawing: made again, never a conflict of its own)
    if (row.generatedBy && row.state === 'conflict') row.state = 'generated';
    files.push(row);
  }
  const project = mergeDescription(ancestor?.json ?? null, mine.json, theirs.json);
  const counts = {};
  for (const f of files) counts[f.state] = (counts[f.state] || 0) + 1;
  return { threeWay: !!A, files, project: { conflicts: project.conflicts }, counts, mine, theirs, ancestor };
}
function stateOf(A, a, m, t) {
  if (m === t) return 'same';
  if (!A) return m === undefined ? 'added' : t === undefined ? 'mine' : 'conflict';
  if (m === a) return t === undefined ? 'removed' : a === undefined ? 'added' : 'theirs';
  if (t === a) return 'mine';
  return 'conflict';
}

/** The conflicts a comparison leaves to the user: [{ path, id? (a drawing's object), field? (silinx.json's) }], and how
 *  a resolution answers them: resolve { [path]: 'mine' | 'theirs' | { [objectId]: 'mine' | 'theirs' }, 'silinx.json':
 *  { [field]: 'mine' | 'theirs' } }. */
export function openConflicts(cmp, resolve = {}) {
  const side = v => v === 'mine' || v === 'theirs';
  const left = [];
  for (const f of cmp.files) {
    if (f.state !== 'conflict') continue;
    const r = resolve[f.path];
    if (f.conflicts?.length && !side(r)) { for (const c of f.conflicts) if (!side(r?.[c.id])) left.push({ path: f.path, id: c.id }); } else if (!side(r)) left.push({ path: f.path });
  }
  for (const c of cmp.project.conflicts) if (!side(resolve['silinx.json']?.[c.field])) left.push({ path: 'silinx.json', field: c.field });
  return left;
}

/** The merge, every conflict resolved: { json (silinx.json's merged fields: the caller keeps the project's id, origin,
 *  trust), write ({ path: text }), remove ([path]), taken ([path]: the contribution's), regenerate ([drawing]: whose HDL
 *  the caller makes again) }; an Error (400) naming the conflicts left, or (422) a drawing whose resolution is invalid. */
export async function mergeProjects(cmp, resolve = {}) {
  const left = openConflicts(cmp, resolve);
  if (left.length) throw fail(`not every conflict is resolved: ${left.map(x => (x.id ? `${x.path} ${x.id}` : x.field ? `silinx.json ${x.field}` : x.path)).join(', ')}`, { left });
  const A = cmp.ancestor?.files || {}, M = cmp.mine.files, T = cmp.theirs.files;
  const write = {}, remove = [], taken = [], regenerate = new Set();
  for (const f of cmp.files) {
    const r = resolve[f.path];
    let side = { same: 'mine', mine: 'mine', theirs: 'theirs', added: 'theirs', removed: 'theirs', generated: 'mine' }[f.state];
    if (f.state === 'merged' || (f.state === 'conflict' && f.conflicts?.length && typeof r === 'object' && r)) {
      const base = parse(A[f.path] ?? '{}') || {}, mine = parse(M[f.path]), theirs = parse(T[f.path]);
      const choices = f.state === 'merged' ? {} : Object.fromEntries(f.conflicts.map(c => [c.id, r[c.id]]));
      const { merged } = mergeDrawings(base, mine, theirs, choices);
      const kind = DRAWING_RE.exec(f.path)[1].toLowerCase();
      const errs = await checkResolved(kind === 'bool' ? 'tt' : kind, merged);
      if (errs.length) throw Object.assign(new Error(`${f.path}: the merge is not a valid drawing: ${errs.join('; ')}`), { status: 422, errors: errs });
      write[f.path] = `${JSON.stringify(merged, null, kind === 'sch' ? 1 : 2)}\n`;
      taken.push(f.path);
      regenerate.add(f.path);
      continue;
    }
    if (f.state === 'conflict') side = r === 'theirs' || (r && typeof r === 'object') ? 'theirs' : 'mine';
    if (side !== 'theirs' || f.state === 'same') continue;
    if (T[f.path] === undefined) { if (M[f.path] !== undefined) remove.push(f.path); } else if (T[f.path] !== M[f.path]) write[f.path] = T[f.path];
    taken.push(f.path);
    if (DRAWING_RE.test(f.path) && T[f.path] !== undefined) regenerate.add(f.path);
  }
  // (a generated file whose drawing is gone: as the side that removed the drawing has it)
  const project = mergeDescription(cmp.ancestor?.json ?? null, cmp.mine.json, cmp.theirs.json, resolve['silinx.json'] || {});
  const json = project.json;
  const fields = j => { const { name, ...rest } = designOf(j); return rest; };   // eslint-disable-line no-unused-vars
  if (!same(fields(json), fields(cmp.mine.json))) taken.push('silinx.json');
  return { json, write, remove, taken, regenerate: [...regenerate].filter(p => !remove.includes(p)) };
}

