// A shared project's wires' style each participant's own (#4239): a follower's or an editor's choice of Direct,
// Orthogonal or Curved (a schematic's or a circuit's ⋮ menu, core/wire-style.js) is how they see the drawing, never an
// edit of it (core/collab-model.js leaves it out of the structure; the owner's file keeps the owner's). It is remembered
// on this computer for that shared project (its owner, its name and the drawing's path), applied when the drawing opens
// (the file's style until a choice is made) and saved when it changes; never sent.
//   keepWireStyles(docs, where)      where: { owner, project }; called on every track of collab-follow.js
import { editorOf } from './collab-drawing.js';
import { isWireStyle } from '/core/wire-style.js';

const KEY = 'silinx.collab.wireStyles', MAX = 200;
const seen = new WeakMap();   // an editor -> the style it was last seen drawn in
const docPath = d => d?.path || (/^(sch|circ):/.test(String(d?.id || '')) ? String(d.id).replace(/^[a-z]+:/, '') : null);
const keyOf = ({ owner, project }, path) => JSON.stringify([owner, project, path]);

function stored() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
function store(k, style) {
  const all = stored();
  delete all[k];
  all[k] = style;
  const keys = Object.keys(all);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX))) delete all[old];   // (the oldest choices forgotten)
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* this page only */ }
}

/** Each open schematic's and circuit's editor of the project followed: its Wires choice made the participant's own
 *  (the first time it is seen: the style remembered for that drawing applied), a choice made since remembered. */
export function keepWireStyles(docs, where) {
  for (const d of docs) {
    const ed = editorOf(d), path = docPath(d);
    if (!ed?.ownWireStyle || !path) continue;
    const k = keyOf(where, path);
    if (!seen.has(ed)) {
      ed.ownWireStyle(true);
      const s = stored()[k];
      if (isWireStyle(s) && s !== ed.wireStyle()) ed.setWireStyle(s);
      seen.set(ed, ed.wireStyle());
    } else if (ed.wireStyle() !== seen.get(ed)) {
      seen.set(ed, ed.wireStyle());
      store(k, ed.wireStyle());
    }
  }
}
