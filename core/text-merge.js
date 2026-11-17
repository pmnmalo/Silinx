// A text file's three-way merge by lines (#4214, phase 3 of #4204): an HDL file, a test bench, constraints, C/C++
// changed on both sides (a pull from GitHub, a contribution merged, a branch), merged through their common ancestor
// as diff3 does it, on core/text-diff.js's diff. Each side's changes from the base are its hunks; a hunk changed on
// one side only is taken from that side, one changed alike on both is taken once, and hunks of the two sides that
// overlap (or touch, as git's merge has it) are a conflict, the user's choice: Mine, Theirs, Both (mine then theirs)
// or a text of their own. With no ancestor (a two-way merge), every difference is a conflict. The lines are compared
// with their CR taken off: a side that changed the line ends only changes them, merged as a property of the file as
// its final newline is; the result is written with the line end the merge gives. Conflict markers are never written:
// a conflict is resolved, or nothing is merged. Isomorphic.
//   mergeText(base, mine, theirs) -> { hunks, conflicts (ids), text (null while conflicts are left), eol, final }
//   resolveText(merge, choices) -> text           choices: { [id]: 'mine' | 'theirs' | 'both' | { text } }
//   textConflicts(path, base, mine, theirs) -> { path, hunks } | null   the conflicts as a pull's error, the merge view
//                                                                        and the MCP give them
//   checkTextChoice(v) -> boolean                 a resolution's value for a hunk
//   similarity(a, b) -> 0..1, findRenames(removed, added) -> [{ from, to, score }]   a file renamed (and changed)
import { diffLines } from './text-diff.js';

const SIDES = new Set(['mine', 'theirs', 'both']);

// a text's lines (without their line end), its line end and whether it ends with one
function read(text) {
  const s = String(text ?? '');
  const crlf = (s.match(/\r\n/g) || []).length, lf = (s.match(/\n/g) || []).length;
  const l = s.replace(/\r\n/g, '\n').split('\n');
  const final = l.at(-1) === '';
  if (final) l.pop();
  return { lines: l, eol: crlf && crlf * 2 >= lf ? '\r\n' : '\n', final: final || !s };
}
const join = l => (l.length ? `${l.join('\n')}\n` : '');

// a side's changes from the base: [{ b0, b1 (the base's lines replaced, 0-based, end excluded), s0, s1 (the side's) }]
function chunks(base, side) {
  const out = [];
  let bi = 0, si = 0, cur = null;
  for (const o of diffLines(join(base), join(side))) {
    if (o.op === '=') { if (cur) { out.push({ ...cur, b1: bi, s1: si }); cur = null; } bi++; si++; continue; }
    cur ||= { b0: bi, s0: si };
    if (o.op === '-') bi++; else si++;
  }
  if (cur) out.push({ ...cur, b1: bi, s1: si });
  return out;
}

// a side's lines over the base's [b0, b1), from its chunks in it (none: the base's own)
function sideLines(base, side, list, b0, b1) {
  if (!list.length) return base.slice(b0, b1);
  const first = list[0], last = list.at(-1);
  return side.slice(first.s0 - (first.b0 - b0), last.s1 + (b1 - last.b1));
}
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
// a file's property (its line end, its final newline) merged three-way: a side that changed it wins
const prop = (b, m, t) => (m === t || m !== b ? m : t);

/** The three-way merge of a text (base null: a two-way merge): { hunks: [{ kind: 'same' | 'mine' | 'theirs' | 'both' |
 *  'conflict', id ('h1'…: a conflict's), base, mine, theirs (their lines), at: { base, mine, theirs } (its first line
 *  in each, 1-based) }], conflicts: [id], text (the merge; null while a conflict is left), eol, final }. */
export function mergeText(baseText, mineText, theirsText) {
  const M = read(mineText), T = read(theirsText);
  if (baseText == null) return twoWay(M, T);
  const B = read(baseText);
  const all = [...chunks(B.lines, M.lines).map(c => ({ ...c, side: 'mine' })), ...chunks(B.lines, T.lines).map(c => ({ ...c, side: 'theirs' }))]
    .sort((x, y) => x.b0 - y.b0 || x.b1 - y.b1);
  // (the chunks grouped: those that overlap or touch are one hunk)
  const groups = [];
  for (const c of all) {
    const g = groups.at(-1);
    if (g && c.b0 <= g.b1) { g.b1 = Math.max(g.b1, c.b1); g[c.side].push(c); } else groups.push({ b0: c.b0, b1: c.b1, mine: c.side === 'mine' ? [c] : [], theirs: c.side === 'theirs' ? [c] : [] });
  }
  const hunks = [];
  let bi = 0, mi = 0, ti = 0, n = 0;
  const push = (kind, base, mine, theirs) => {
    hunks.push({ kind, ...(kind === 'conflict' ? { id: `h${++n}` } : {}), base, mine, theirs, at: { base: bi + 1, mine: mi + 1, theirs: ti + 1 } });
    bi += base.length; mi += mine.length; ti += theirs.length;
  };
  for (const g of groups) {
    if (g.b0 > bi) { const same = B.lines.slice(bi, g.b0); push('same', same, same, same); }
    const base = B.lines.slice(g.b0, g.b1), mine = sideLines(B.lines, M.lines, g.mine, g.b0, g.b1), theirs = sideLines(B.lines, T.lines, g.theirs, g.b0, g.b1);
    push(!g.theirs.length ? 'mine' : !g.mine.length ? 'theirs' : eq(mine, theirs) ? 'both' : 'conflict', base, mine, theirs);
  }
  if (bi < B.lines.length) { const same = B.lines.slice(bi); push('same', same, same, same); }
  return done(hunks, prop(B.eol, M.eol, T.eol), prop(B.final, M.final, T.final));
}

// with no ancestor: each difference of the two sides a conflict (mine's line end and final newline where they differ)
function twoWay(M, T) {
  const hunks = [];
  let mi = 0, ti = 0, n = 0;
  const push = (kind, mine, theirs) => {
    hunks.push({ kind, ...(kind === 'conflict' ? { id: `h${++n}` } : {}), base: kind === 'same' ? mine : [], mine, theirs, at: { base: null, mine: mi + 1, theirs: ti + 1 } });
    mi += mine.length; ti += theirs.length;
  };
  for (const c of chunks(M.lines, T.lines)) {
    if (c.b0 > mi) { const same = M.lines.slice(mi, c.b0); push('same', same, same); }
    push('conflict', M.lines.slice(c.b0, c.b1), T.lines.slice(c.s0, c.s1));
  }
  if (mi < M.lines.length) { const same = M.lines.slice(mi); push('same', same, same); }
  return done(hunks, M.eol, M.final);
}

function done(hunks, eol, final) {
  const merge = { hunks, conflicts: hunks.filter(h => h.kind === 'conflict').map(h => h.id), eol, final, text: null };
  if (!merge.conflicts.length) merge.text = resolveText(merge, {});
  return merge;
}

/** A hunk's resolution is one: 'mine', 'theirs', 'both' (mine's lines, then theirs') or { text } (the user's own). */
export function checkTextChoice(v) {
  return SIDES.has(v) || (!!v && typeof v === 'object' && !Array.isArray(v) && typeof v.text === 'string' && Object.keys(v).length === 1);
}

/** The merge's text, each conflict resolved by its choice; an Error (400, `left`: the ids) when one is not. */
export function resolveText(merge, choices = {}) {
  const left = merge.conflicts.filter(id => !checkTextChoice(choices?.[id]));
  if (left.length) throw Object.assign(new Error(`not every conflict is resolved: ${left.join(', ')}`), { status: 400, left });
  const out = [];
  for (const h of merge.hunks) {
    if (h.kind !== 'conflict') { out.push(...(h.kind === 'theirs' ? h.theirs : h.mine)); continue; }
    const c = choices[h.id];
    out.push(...(c === 'mine' ? h.mine : c === 'theirs' ? h.theirs : c === 'both' ? [...h.mine, ...h.theirs] : read(c.text).lines));
  }
  return out.length ? out.join(merge.eol) + (merge.final ? merge.eol : '') : '';
}

/** A text's conflicts: { path, hunks: [{ id, base, mine, theirs, at }] } (with none left: hunks []), as a pull's error,
 *  the merge view and the MCP give them; null for a side that is no text (removed). */
export function textConflicts(path, baseText, mineText, theirsText) {
  if (mineText == null || theirsText == null) return null;
  const m = mergeText(baseText, mineText, theirsText);
  return { path, hunks: m.hunks.filter(h => h.kind === 'conflict').map(({ id, base, mine, theirs, at }) => ({ id, base, mine, theirs, at })) };
}

/** How alike two texts are, by their lines: twice the lines they share over the lines of both (git's rename score). */
export function similarity(aText, bText) {
  const a = read(aText).lines, b = read(bText).lines;
  if (!a.length && !b.length) return 1;
  const same = diffLines(join(a), join(b)).filter(o => o.op === '=').length;
  return (2 * same) / (a.length + b.length);
}

/** The files renamed: removed ({ path: text }: a file one side no longer has) paired with added ({ path: text }: one it
 *  added), the most alike first, each at least `threshold` alike (git's 50 %) and of the same extension:
 *  [{ from, to, score }]. */
export function findRenames(removed, added, { threshold = 0.5, max = 100 } = {}) {
  const ext = p => (/\.[^./]+$/.exec(p)?.[0] || '').toLowerCase();
  const R = Object.keys(removed || {}).slice(0, max), A = Object.keys(added || {}).slice(0, max);
  const pairs = [];
  for (const from of R) for (const to of A) {
    if (ext(from) !== ext(to)) continue;
    // (an upper bound first: texts of very different lengths are not diffed)
    const na = read(removed[from]).lines.length, nb = read(added[to]).lines.length;
    if (na + nb && (2 * Math.min(na, nb)) / (na + nb) < threshold) continue;
    const score = similarity(removed[from], added[to]);
    if (score >= threshold) pairs.push({ from, to, score });
  }
  pairs.sort((x, y) => y.score - x.score || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
  const used = new Set(), out = [];
  for (const p of pairs) if (!used.has(p.from) && !used.has(`>${p.to}`)) { used.add(p.from); used.add(`>${p.to}`); out.push(p); }
  return out.sort((x, y) => x.from.localeCompare(y.from));
}
