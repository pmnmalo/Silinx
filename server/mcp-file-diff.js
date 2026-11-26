// A file between two of its texts, as the MCP says it (git_diff, #3197; version_diff, #5741): a drawing by its objects
// (added, removed, moved, changed: each by its id, its name), any other file as a unified diff (clipped).
import { clip } from './mcp-util.js';
import { drawingKind, diffDrawings } from '../core/drawing-merge.js';
import { unifiedDiff } from '../core/text-diff.js';

/** The file `rel`'s change from text `a` to text `b` (null: no file), from `fromL` to `toL` (what each side is):
 *  { text, data (`data` with the drawing's diff or whether it changed), untrusted }. */
export function fileDiff(rel, a, b, { fromL, toL, data = {} }) {
  if (drawingKind(rel)) {
    let A = null, Bm = null;
    try { A = a === null ? {} : JSON.parse(a); Bm = b === null ? {} : JSON.parse(b); } catch { A = null; }
    if (A) {
      const d = diffDrawings(A, Bm);
      const name = (coll, key) => { const o = [...(Bm[coll] || []), ...(A[coll] || [])].find(x => String(x?.id ?? x?.name) === key); return o?.name && o.name !== key ? ` (${o.name})` : ''; };
      const lines = [...d.added.map(x => `added ${x.coll}/${x.key}${name(x.coll, x.key)}`), ...d.removed.map(x => `removed ${x.coll}/${x.key}${name(x.coll, x.key)}`),
        ...d.moved.map(x => `moved ${x.coll}/${x.key}${name(x.coll, x.key)}`), ...d.changed.map(x => `changed ${x.coll}/${x.key}${name(x.coll, x.key)}${x.fields.length ? `: ${x.fields.join(', ')}` : ''}`), ...d.props.map(p => `changed ${p}`)];
      return { text: [`${rel}, ${fromL} to ${toL}: ${lines.length ? `${lines.length} change(s)` : 'no change'}.`, ...lines.map(l => `  ${l}`)].join('\n'), data: { ...data, diff: d }, untrusted: `the changes of ${rel}` };
    }
  }
  const u = unifiedDiff(a ?? '', b ?? '', { from: `${rel} (${fromL})`, to: `${rel} (${toL})` });
  return { text: u ? clip(u) : `${rel}, ${fromL} to ${toL}: no change.`, data: { ...data, changed: !!u }, untrusted: u ? `the changes of ${rel}` : undefined };
}
