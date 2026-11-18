// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The overbar of the Electronics / Engineering notation (#3915): NOT as a bar over a name or a group, written with the
// combining overline (U+0305) after each character it covers (a̅, a̅·̅b̅). overline() draws one, overlineToSlash() reads
// one back as the text notation's /( … ), which the expression parsers read (core/asm-expr.js, core/logic.js).
// barRuns() and barLines() place its bars as lines, where an SVG text is drawn (#4484).

export const OVERLINE = '\u0305';
// the bars counted on a character, at most (deeper is the parsers' nesting error, DRAWING_NESTING)
const MAX_BARS = 200;

/** `text` under a bar: each of its characters (its blanks too: one bar over the group) followed by U+0305 (a bar under
 *  it already: one more on its character, a̅ under a bar a̅̅). */
export const overline = (text) => [...String(text)].map((c) => (c === OVERLINE ? c : c + OVERLINE)).join('');

/** The text with its bars as /( … ): a run of characters under a bar is NOT that run (a̅·̅b̅ is /(a.b), a̅·b̅ is /(a)./(b)),
 *  a bar under a bar a NOT inside it. A text with no bar is returned as it is. */
export function overlineToSlash(src) {
  const s = String(src ?? '');
  if (!s.includes(OVERLINE)) return s;
  const cs = [];
  for (const ch of s) {
    if (ch === OVERLINE) { if (cs.length) cs[cs.length - 1].n = Math.min(MAX_BARS, cs[cs.length - 1].n + 1); continue; }
    cs.push({ ch, n: 0 });
  }
  // (one level at a time, without recursing: the runs of each level made into /( … ) from the outermost in)
  let out = '';
  const stack = [{ items: cs, i: 0, close: false }];
  while (stack.length) {
    const fr = stack[stack.length - 1];
    if (fr.i >= fr.items.length) { stack.pop(); if (fr.close) out += ')'; continue; }
    const c = fr.items[fr.i];
    if (c.n === 0) { out += c.ch; fr.i++; continue; }
    let j = fr.i;
    while (j < fr.items.length && fr.items[j].n > 0) j++;
    const run = fr.items.slice(fr.i, j).map((x) => ({ ch: x.ch, n: x.n - 1 }));
    fr.i = j;
    out += '/(';
    stack.push({ items: run, i: 0, close: true });
  }
  return out;
}

/** A text with its bars as it is drawn in SVG (#4484): its characters without the overlines (`plain`) and its bars,
 *  one per run of characters under a bar at each level ({ level, from, to, raise }: the indices in `plain` of the run's
 *  first and last characters, a̅·̅b̅ one bar over the three, a̅·b̅ two; `raise` the depth of the bars under it in its run,
 *  each drawn above them: an outer bar over the inner ones). A text with no bar: no bars. */
export function barRuns(src) {
  const cs = [];
  for (const ch of String(src ?? '')) {
    if (ch === OVERLINE) { if (cs.length) cs[cs.length - 1].n = Math.min(MAX_BARS, cs[cs.length - 1].n + 1); continue; }
    cs.push({ ch, n: 0 });
  }
  // (the indices in UTF-16 units, as the SVG's characters are counted)
  let plain = '';
  for (const c of cs) { c.i = plain.length; plain += c.ch; c.last = plain.length - 1; }
  const bars = [];
  const deepest = Math.max(0, ...cs.map((c) => c.n));
  for (let level = 1; level <= deepest; level++) {
    for (let k = 0; k < cs.length; k++) {
      if (cs[k].n < level) continue;
      let j = k;
      while (j + 1 < cs.length && cs[j + 1].n >= level) j++;
      const raise = Math.max(...cs.slice(k, j + 1).map((c) => c.n)) - level;
      bars.push({ level, from: cs[k].i, to: cs[j].last, raise });
      k = j;
    }
  }
  return { plain, bars };
}

// (a bar's place: one with no bar under it this much of the font's size under the top of its characters' cells (just
// over their tallest letters), one over others above the highest of them by `BAR_STEP`; its width `BAR_WIDTH` of the size)
export const BAR_DROP = 0.1, BAR_STEP = 0.22, BAR_WIDTH = 0.075;

/** The lines of a text's bars (#4484): `bars` as barRuns returns them, `extentOf(i)` the cell ({ x, y, width, height })
 *  its character `i` is drawn in, `size` its font's size. Each bar one line ({ level, x1, x2, y }) from the left of its
 *  run's first character to the right of its last, over its characters' cells; the bars with no bar under them at one
 *  height, a bar over bars a step above the highest of them.
 *  Null when the text is not laid out (a cell of no width: the text not shown). */
export function barLines(bars, extentOf, size) {
  if (!bars.length) return [];
  const cells = new Map();
  const cell = (i) => { if (!cells.has(i)) cells.set(i, extentOf(i)); return cells.get(i); };
  const lines = [];
  for (const b of bars) {
    let x1 = Infinity, x2 = -Infinity;
    for (let i = b.from; i <= b.to; i++) {
      const e = cell(i);
      if (!e || !(e.width > 0)) return null;
      x1 = Math.min(x1, e.x); x2 = Math.max(x2, e.x + e.width);
    }
    lines.push({ level: b.level, raise: b.raise, x1, x2 });
  }
  const top = Math.min(...[...cells.values()].map((e) => e.y));
  return lines.map(({ raise, ...l }) => ({ ...l, y: top + size * BAR_DROP - raise * size * BAR_STEP }));
}
