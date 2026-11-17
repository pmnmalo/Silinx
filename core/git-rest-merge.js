// A pull's text files through GitHub's API (#4214, core/git-rest.js's pull): the text files changed on both sides
// merged by their lines (core/text-merge.js), their conflicts per hunk left to the user's choices; and the files
// renamed on one side and changed on the other, found by their lines, so that the change is merged into the renamed
// file. Isomorphic.
import { DRAWING_RE } from './drawing-merge.js';
import { mergeText, checkTextChoice, findRenames } from './text-merge.js';

/** The text files merged by their lines (items: [{ path, v: { base, mine, theirs }, from?, side? }]; resolve: the
 *  choices per hunk): { texts (each with its merge, m), waiting (those whose conflicts are still to choose: { path,
 *  base, mine, theirs, hunks, renamedFrom? }), left (no text merge: a side removed, a drawing, no text) }. */
export function mergeTexts(items, resolve) {
  const texts = [], waiting = [], left = [];
  for (const x of items) {
    const { path: p, v } = x;
    if (DRAWING_RE.test(p) || v.mine === null || v.theirs === null || [v.base, v.mine, v.theirs].some(t => t?.includes('\0'))) { left.push(p); continue; }
    const t = { ...x, m: mergeText(v.base, v.mine, v.theirs) };
    texts.push(t);
    if (t.m.conflicts.some(id => !checkTextChoice(resolve?.[p]?.[id]))) waiting.push({ path: p, ...v, hunks: t.m.hunks.filter(h => h.kind === 'conflict'), ...(x.from ? { renamedFrom: x.from } : {}) });
  }
  return { texts, waiting, left };
}

/** The files renamed on one side and changed on the other: on GitHub (a conflict's file GitHub removed, a file it
 *  added like it) or here (one removed here, one added here like it): [{ path (the new one), from, side ('theirs':
 *  GitHub renamed it, 'mine'), v: { base, mine, theirs } }]. paths: the project's last pull's (core/git-rest.js meta),
 *  blobs: GitHub's head's, mine: the project's files, conflicts and take: the pull's; base(path), theirs(path): texts. */
export async function pullRenames({ paths, blobs, mine, conflicts, take, base, theirs }) {
  const text = p => !DRAWING_RE.test(p);
  const all = async (list, fn) => Object.fromEntries(await Promise.all(list.map(async p => [p, await fn(p)])));
  const goneThere = conflicts.filter(p => text(p) && !blobs[p] && mine[p] !== undefined);
  const goneHere = conflicts.filter(p => text(p) && mine[p] === undefined && blobs[p]);
  const addedThere = take.filter(p => text(p) && !paths[p]), addedHere = Object.keys(mine).filter(p => text(p) && !paths[p] && !blobs[p]);
  const out = [];
  if (goneThere.length && addedThere.length) {
    const removed = await all(goneThere, base), added = await all(addedThere, theirs);
    for (const r of findRenames(removed, added)) out.push({ path: r.to, from: r.from, side: 'theirs', v: { base: removed[r.from], mine: mine[r.from], theirs: added[r.to] } });
  }
  if (goneHere.length && addedHere.length) {
    const removed = await all(goneHere, base);
    for (const r of findRenames(removed, Object.fromEntries(addedHere.map(p => [p, mine[p]])))) out.push({ path: r.to, from: r.from, side: 'mine', v: { base: removed[r.from], mine: mine[r.to], theirs: await theirs(r.from) } });
  }
  return out;
}
