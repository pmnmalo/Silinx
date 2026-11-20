// A project's description (silinx.json) changed by the page and, meanwhile, by someone else (the MCP server, another
// tab: #4726): the page's change merged into the current description, three ways. `base` is the description the page
// read, `mine` the one it would write, `theirs` the one on disk now. What the page changed (mine against base) is taken
// from mine, everything else from theirs: field by field, a plain object (sourceLanguage…) key by key, the files by
// their path and a list of names (excluded…) name by name, so that a file someone else added or removed meanwhile stays
// so. Where both changed the same thing, the page's (the user's last action) wins.

const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const entryList = v => Array.isArray(v) && v.every(e => plain(e) && typeof e.path === 'string');
const nameList = v => Array.isArray(v) && v.every(e => typeof e === 'string');
const listOf = (kind, v) => (v === undefined ? true : kind(v));

// a list merged entry by entry (by key): theirs' order, then the page's new ones in its order
function mergeList(base = [], mine = [], theirs = [], key) {
  const map = l => new Map(l.map(e => [key(e), e]));
  const b = map(base), m = map(mine), t = map(theirs);
  const pick = k => (same(m.get(k), b.get(k)) ? t.get(k) : m.get(k));
  const out = [];
  for (const k of t.keys()) { const e = pick(k); if (e !== undefined) out.push(e); }
  for (const k of m.keys()) if (!t.has(k)) { const e = pick(k); if (e !== undefined) out.push(e); }
  return out;
}

function mergeValue(base, mine, theirs) {
  if (same(mine, base)) return theirs;   // (not the page's change: theirs, whatever it is)
  if (same(theirs, base) || same(mine, theirs)) return mine;
  if (plain(mine) && plain(theirs) && (base === undefined || plain(base))) return mergeObject(base || {}, mine, theirs);
  if ([mine, theirs, base].every(v => listOf(entryList, v))) return mergeList(base, mine, theirs, e => e.path);
  if ([mine, theirs, base].every(v => listOf(nameList, v))) return mergeList(base, mine, theirs, e => e);
  return mine;   // (both changed it: the page's)
}

function mergeObject(base, mine, theirs) {
  const out = {};
  for (const k of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
    const v = mergeValue(base[k], mine[k], theirs[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// what the server adds to a description it sends (not the page's to write)
const SENT_ONLY = ['fileTree'];
const bare = pj => { const o = { ...(pj || {}) }; for (const k of SENT_ONLY) delete o[k]; return o; };

/** The page's description `mine` (changed from `base`) merged into `theirs`, the current one. */
export function mergeDescription(base, mine, theirs) {
  return mergeObject(bare(base), bare(mine), bare(theirs));
}
