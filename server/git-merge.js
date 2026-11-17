// A pull's drawings merged object by object (#3197, server/git.js gitPull): git never merges a drawing's JSON as text
// (the repository's info/attributes gives the drawings git's binary merge: a drawing both sides changed is in conflict,
// left as mine), and Silinx merges it by its objects (core/git-resolve.js): with no object in conflict, at once; with
// some, by the user's choices (resolve: { path: { id: 'mine' | 'theirs' } }), the result checked as Check Drawing checks
// it. Its HDL file (its generatedFile) is made from it again (server/drawing-sync.js), whatever git did with that file.
// A text file in conflict (an HDL file, a test bench, constraints, #4214) is merged again from its three versions by
// its lines (core/text-merge.js): its conflicts resolved by the user's choices (resolve: { path: { hunk: 'mine' |
// 'theirs' | 'both' | { text } } }, the merge view's), never with git's conflict markers. Any other conflict (a file
// removed on one side and changed on the other, a binary file) stays one: the pull is aborted, as before.
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { DRAWING_RE } from '../core/drawing-merge.js';
import { drawingConflicts, resolveConflict } from '../core/git-resolve.js';
import { mergeText, resolveText, checkTextChoice } from '../core/text-merge.js';
import { syncDrawing } from './drawing-sync.js';

const MARK = '# Silinx (#3197): the drawings are merged by their objects, never as text';
const DRAWING_ATTRIBUTES = `${MARK}\n${['sch', 'asm', 'fsm', 'tt', 'bool', 'pn', 'circ'].map(k => `*.${k}.json merge=binary`).join('\n')}\n`;
// Silinx's lines as an older Silinx wrote them (the circuit's missing, #4203): replaced
const OLD_LINES = new RegExp(`${MARK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\n(?:\\*\\.\\w+\\.json merge=binary\n)*`);

/** The repository's info/attributes with Silinx's lines (once; what else it holds kept; an older Silinx's lines made
 *  the current ones). */
export async function ensureDrawingAttributes(gitDir) {
  const f = path.join(gitDir, 'info', 'attributes');
  let cur = '';
  try { cur = await fsp.readFile(f, 'utf8'); } catch { /* none yet */ }
  if (cur.includes(DRAWING_ATTRIBUTES)) return false;
  await fsp.mkdir(path.dirname(f), { recursive: true });
  await fsp.writeFile(f, cur.includes(MARK) ? cur.replace(OLD_LINES, DRAWING_ATTRIBUTES) : `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}${DRAWING_ATTRIBUTES}`);
  return true;
}

/** The unmerged files of a pull ({ files: the project's paths }): { done: true, resolved, merged } (the drawings and
 *  the text files written, the drawings' HDL made again: the caller adds and commits), or { done: false, drawings (each one's
 *  conflicts still to choose), texts (the text files whose conflicts are still to choose: { path, base, mine, theirs,
 *  hunks }), others (the files that can be neither) }; written: the HDL files made again (and removed); a resolution
 *  that is no valid drawing throws. */
export async function resolveOnPull({ run, prefix, name, files, resolve = null }) {
  const show = async (n, f) => { const r = await run(['show', `:${n}:${prefix}${f}`]); return r.code ? null : r.stdout; };
  const drawings = [], pending = [], rest = [];
  for (const f of files) {
    if (!DRAWING_RE.test(f)) { rest.push(f); continue; }
    const v = { base: await show(1, f), mine: await show(2, f), theirs: await show(3, f) };
    const c = v.mine !== null && v.theirs !== null ? drawingConflicts(f, v.base, v.mine, v.theirs) : null;
    if (!c) { rest.push(f); continue; }
    drawings.push({ ...c, v });
    if (c.conflicts.length && !c.conflicts.every(x => resolve?.[f]?.[x.id] === 'mine' || resolve?.[f]?.[x.id] === 'theirs')) pending.push(c);
  }
  // a drawing's HDL file in conflict is made again from it: no conflict of its own
  const generated = new Set();
  for (const d of drawings) for (const t of [d.v.mine, d.v.theirs]) { try { const g = JSON.parse(t).generatedFile; if (g) generated.add(g); } catch { /* none */ } }
  // the text files: merged by their lines (both sides' versions there, no NUL byte)
  const texts = [], waiting = [], others = [];
  for (const f of rest.filter(x => !generated.has(x))) {
    const v = { base: await show(1, f), mine: await show(2, f), theirs: await show(3, f) };
    if (DRAWING_RE.test(f) || v.mine === null || v.theirs === null || [v.base, v.mine, v.theirs].some(t => t?.includes('\0'))) { others.push(f); continue; }
    const m = mergeText(v.base, v.mine, v.theirs);
    texts.push({ path: f, v, m });
    if (m.conflicts.some(id => !checkTextChoice(resolve?.[f]?.[id]))) waiting.push({ path: f, ...v, hunks: m.hunks.filter(h => h.kind === 'conflict') });
  }
  if (pending.length || waiting.length || others.length) return { done: false, drawings: pending, texts: waiting, others };
  const dir = P.projectDir(name);
  for (const d of drawings) {
    const r = await resolveConflict(d.path, d.v.base, d.v.mine, d.v.theirs, resolve?.[d.path] || {});
    await fsp.writeFile(P.safeJoin(dir, d.path), r.text);
  }
  // (the HDL files: mine first, as they were, then each made from its drawing: one whose drawing has errors stays mine)
  for (const f of rest.filter(x => generated.has(x))) { const m = await show(2, f); if (m !== null) await fsp.writeFile(P.safeJoin(dir, f), m); }
  for (const t of texts) await fsp.writeFile(P.safeJoin(dir, t.path), resolveText(t.m, resolve?.[t.path] || {}));
  // (an HDL file made again that was in no conflict: in the merge commit too)
  const written = [];
  for (const d of drawings) { const r = await syncDrawing(P, name, d.path); for (const f of [r?.written, r?.removed]) if (f) written.push(f); }
  return { done: true, resolved: drawings.map(d => d.path), merged: texts.map(t => t.path), written };
}
