// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The overbar of the Electronics / Engineering notation (#3915): NOT as a bar over a name or a group, written with the
// combining overline (U+0305) after each character it covers (a̅, a̅·̅b̅). overline() draws one, overlineToSlash() reads
// one back as the text notation's /( … ), which the expression parsers read (core/asm-expr.js, core/logic.js).

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
