// A shared project's participant's selection (#4192): what it has selected in the document it looks at, in its
// awareness state's view (core/collab-client.js: { path, line, ch, sel }), presence and not an edit, so that a viewer
// sees it too. `sel` is { ranges, items, look }, each optional:
// - ranges: a text editor's (HDL, C, C++) selections, [[anchorLine, anchorCh, headLine, headCh], …], 0-based, the main
//   one first (a cursor: a range of no length);
// - items: a drawing's objects, 'kind:id' (a schematic's 'sym:S1', 'wire:W3', 'label:L2'; a state diagram's
//   'state:S0', 'trans:T1'; an ASM chart's 'node:N1', 'edge:E1'; a Petri net's 'place:p1', 'transition:t1', 'arc:a1'; a
//   circuit's 'part:U1', 'wire:W1'; a truth table's 'out:Y'; a symbol's 'pin:A');
// - look: a drawing's view a follower follows with it (#4193: a truth table's SOP / POS, its Karnaugh map and
//   Quine-McCluskey's steps shown), { name: a short string or a boolean }.
// The same function reads it when sent and when it arrives (untrusted: what is not one left out), and caps it: an
// awareness frame stays well under the relay's (#4173: 8 kB). Its sending is coalesced (selectionPacer): while dragging
// or typing, at most one view every `ms`, the last one always sent.
export const SELECTION_LIMITS = Object.freeze({ bytes: 4096, ranges: 32, items: 200, item: 96, look: 8, pos: 1e7 });
const ITEM_RE = /^[a-z]{1,12}:[^\u0000-\u001f]{1,}$/;
const LOOK_RE = /^[a-z][a-zA-Z]{0,15}$/;
const pos = n => Number.isInteger(n) && n >= 0 && n <= SELECTION_LIMITS.pos;
const L = SELECTION_LIMITS;

/** A selection as it is sent and as it arrives: { ranges?, items?, look?, more? (the items left out past the cap) };
 *  null: none (nothing selected, or not one). */
export function selectionValue(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  if (Array.isArray(v.ranges)) {
    const r = v.ranges.slice(0, L.ranges).filter(x => Array.isArray(x) && x.length === 4 && x.every(pos)).map(x => [...x]);
    if (r.length) out.ranges = r;
  }
  if (Array.isArray(v.items)) {
    const seen = new Set();
    for (const x of v.items) {
      if (typeof x !== 'string' || x.length > L.item || !ITEM_RE.test(x) || seen.has(x)) continue;
      seen.add(x);
    }
    const all = [...seen];
    if (all.length) out.items = all.slice(0, L.items);
    if (all.length > L.items) out.more = all.length - L.items;
  }
  if (v.look && typeof v.look === 'object' && !Array.isArray(v.look)) {
    const look = {};
    for (const [k, x] of Object.entries(v.look).slice(0, L.look)) {
      if (LOOK_RE.test(k) && (typeof x === 'boolean' || (typeof x === 'string' && x.length <= 32))) look[k] = x;
    }
    if (Object.keys(look).length) out.look = look;
  }
  if (!out.ranges && !out.items && !out.look) return null;
  // (past the bytes' cap: the last items left out, counted)
  while (out.items && JSON.stringify(out).length > L.bytes) {
    const cut = Math.max(1, Math.ceil(out.items.length / 4));
    out.items = out.items.slice(0, -cut);
    out.more = (out.more || 0) + cut;
    if (!out.items.length) delete out.items;
  }
  if (JSON.stringify(out).length > L.bytes) delete out.ranges;   // (32 ranges are less: never, unless items were none)
  return out.ranges || out.items || out.look ? out : null;
}

/** The selection a participant's view has in the document at `path` (null: another document, or none): a module
 *  renamed, its document's path changed, shows none until the view comes again. */
export const selectionAt = (view, path) => (view && view.path === path ? view.sel || null : null);

/** A drawing's items that are still there (`has('kind:id')`): one deleted meanwhile is not drawn. */
export const liveItems = (sel, has) => (sel?.items || []).filter(x => has(x));

/** A text range kept inside the text (lineCount lines, lineLength(i) the i-th's): [from, to] as { line, ch } each. */
export function clampRange([al, ac, hl, hc], lineCount, lineLength) {
  const at = (l, c) => {
    if (lineCount <= 0) return { line: 0, ch: 0 };
    const line = Math.min(l, lineCount - 1);
    return { line, ch: l > lineCount - 1 ? lineLength(line) : Math.min(c, lineLength(line)) };
  };
  return [at(al, ac), at(hl, hc)];
}

/** A selection in words (the MCP's follow_project): '' when none. */
export function selectionWords(sel) {
  if (!sel) return '';
  const parts = [];
  if (sel.ranges) {
    const at = (l, c) => `${l + 1}:${c + 1}`;
    const t = sel.ranges.map(([al, ac, hl, hc]) => (al === hl && ac === hc ? `the cursor at ${at(hl, hc)}` : `${at(al, ac)} to ${at(hl, hc)}`));
    parts.push(t.join(', '));
  }
  if (sel.items) parts.push(sel.items.join(', ') + (sel.more ? ` and ${sel.more} more` : ''));
  if (sel.look) parts.push(Object.entries(sel.look).map(([k, v]) => `${k} ${v}`).join(', '));
  return parts.join('; ');
}

/** The sending of a participant's view coalesced (#4192): push(value, send) sends it at once when the last one went
 *  `ms` ago or more, else once `ms` has passed since (the latest value pushed meanwhile only); cancel() drops a pending
 *  one. `now` and `timer` (setTimeout's) for the tests. */
export function selectionPacer({ ms = 250, now = Date.now, timer = setTimeout, clear = clearTimeout } = {}) {
  let last = -Infinity, pending = null, t = null;
  const fire = () => { t = null; if (!pending) return; const p = pending; pending = null; last = now(); p.send(p.value); };
  return {
    push(value, send) {
      const wait = last + ms - now();
      if (wait <= 0 && !t) { last = now(); pending = null; send(value); return true; }
      pending = { value, send };
      if (!t) { t = timer(fire, Math.max(0, wait)); t?.unref?.(); }
      return false;
    },
    cancel() { pending = null; if (t) clear(t); t = null; },
    pending: () => !!pending,
  };
}
