// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// A Boolean expression shown in part (#3939, moved from web/js/tt-results.js for the MCP server's related_view, #4150):
// a large table's (its text would be megabytes, a NAND form's tree the most) as its first MAX_NODES operators and
// literals, '…' for the rest; sizeOf, its size as written; litsOf, its number of literals.
// (A one-input NAND or NOR is written with its input twice, /(x.x): its input counted twice.)
export const MAX_NODES = 10000;   // (an 8-input canonical SOP in full: 255 terms, about 3300)
const tied = a => (a.t === 'nand' || a.t === 'nor') && a.args.length === 1;
export const sizeOf = a => 1 + (a.a ? sizeOf(a.a) : 0) + (a.args ? a.args.reduce((k, x) => k + sizeOf(x), 0) * (tied(a) ? 2 : 1) : 0);
export const litsOf = a => (a.t === 'var' ? 1 : (a.a ? litsOf(a.a) : 0) + (a.args ? a.args.reduce((k, x) => k + litsOf(x), 0) : 0));
export function part(a, left) {
  const rest = { t: 'var', name: '…' };
  if (left.n-- <= 0) return rest;
  if (a.a) return { ...a, a: part(a.a, left) };
  if (!a.args) return a;
  // (a tied NAND / NOR writes its input twice: that input given half of what is left, then counted twice, so that
  // nested ones stay within the budget too, #4150: counted after the fact, a NAND form of 16 inputs was megabytes)
  if (tied(a)) {
    const half = { n: Math.floor((left.n - 1) / 2) }, had = half.n;   // (one kept for a '…' written twice)
    if (had < 0) return rest;
    const x = part(a.args[0], half);
    left.n -= 2 * (had - half.n) + 1;
    return { ...a, args: [x] };
  }
  const args = [];
  for (const x of a.args) { if (left.n <= 0) { args.push(rest); break; } args.push(part(x, left)); }
  return { ...a, args };
}
