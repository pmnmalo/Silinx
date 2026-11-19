// A long list folded (#4571): a list of the Collaboration tab (web/js/collab-tab.js: a live share's participants, #4643)
// past a threshold shows its first items, the urgent ones first (never hidden), then "N more…", which unfolds the rest.
/** The list's limits: past `limit` items, the first `shown` and the rest folded (never a fold of one or two). */
export const FOLD_LIMITS = Object.freeze({ limit: 12, shown: 10 });

/** A list as shown: { shown, more } (more: how many are folded, 0 when none or when `open`); the items `first` says
 *  (a predicate) ahead of the others, each group in its order. */
export function foldList(items, { open = false, first = null, limits = FOLD_LIMITS } = {}) {
  const all = first ? [...items.filter(first), ...items.filter(x => !first(x))] : [...items];
  if (open || all.length <= limits.limit) return { shown: all, more: 0 };
  const n = Math.max(limits.shown, all.filter(x => first?.(x)).length);   // (the urgent ones all shown)
  return n >= all.length ? { shown: all, more: 0 } : { shown: all.slice(0, n), more: all.length - n };
}
