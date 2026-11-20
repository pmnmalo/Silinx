// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The notation Silinx shows Boolean expressions in (#3915): a user's preference (the browser's, web/js/notation.js;
// the MCP server's, config.json), one of five. The truth table's expressions (core/logic.js's trees: showExpr) and the
// conditions of a state diagram or an ASM chart (core/asm-expr.js's trees: showCond) are written in it; the parsers
// read every one back (the overbar: core/overline.js). A drawing's condition is shown as it was typed (drawnAsTyped,
// #4888): the notation is for what Silinx derives (its tables, results, groups).
import { formatExpr } from './logic.js';
import { parseCond, isOtherwise } from './fsm.js';
import { overline } from './overline.js';
import { DEFAULT_NOTATION, showCond } from './cond-notation.js';

// (the notations and a condition's: core/cond-notation.js, which the conversions read without this module's imports)
export { NOTATIONS, NOTATION_IDS, DEFAULT_NOTATION, notationOf, showCond } from './cond-notation.js';

// the symbols of the notations that core/logic.js's formatExpr does not have
const SYM = {
  engineering: { and: '.', or: ' + ', xor: ' ⊕ ', not: (s) => overline(s), notGroup: (s) => overline(s) },   // (AND a point, #4094)
  logic: { and: ' ∧ ', or: ' ∨ ', xor: ' ⊕ ', not: (s) => `¬${s}`, notGroup: (s) => `¬(${s})` },
};
const PREC = { or: 1, xor: 2, and: 3 };

/** A Boolean expression (core/logic.js's tree) in a notation: its own for 'engineering' and 'logic', formatExpr's
 *  for the others (and the older ones it has: 'textbook', 'compact', 'ascii'…). */
export function showExpr(e, notation = DEFAULT_NOTATION) {
  const S = SYM[notation];
  if (!S) return formatExpr(e, notation);
  const atom = (x) => x.t === 'var' || x.t === 'const' || (x.t === 'not' && notation === 'engineering');
  const f = (x, parentOp) => {
    switch (x.t) {
      case 'const': return x.v ? '1' : '0';
      case 'var': return x.name;
      case 'nand': case 'nor': {
        const args = x.args.length === 1 ? [x.args[0], x.args[0]] : x.args;   // (one input: tied, as formatExpr's, #3785)
        return f({ t: 'not', a: { t: x.t === 'nand' ? 'and' : 'or', args } }, parentOp);
      }
      case 'not': return atom(x.a) || x.a.t === 'not' ? S.not(f(x.a)) : S.notGroup(f(x.a));
      default: {
        const s = x.args.map((a) => f(a, x.t)).join(S[x.t]);
        return parentOp && PREC[x.t] < PREC[parentOp] ? `(${s})` : s;
      }
    }
  };
  // (a bar over a group needs no parentheses: the bar is the group's)
  return f(e);
}

/** A transition's condition as typed, shown in a notation: the otherwise words and a condition that is not valid as
 *  they are. */
export function showCondText(text, notation = DEFAULT_NOTATION) {
  if (isOtherwise(text)) return String(text ?? '');
  const p = parseCond(text);
  return p.error ? String(text) : showCond(p.ast, notation);
}

/** A drawing's condition as its arc or its decision box draws it (#4888): as it was typed, in the Properties or in
 *  place ("000" stays "000", = stays =, and stays and), never written again from its tree; in the Electronics /
 *  Engineering notation its NOTs typed as a slash drawn as its bars (/a.b as a̅.b, /(a + b) as one bar over the group).
 *  A condition that is not valid, and the otherwise words, as they are. */
export function drawnAsTyped(text, notation = DEFAULT_NOTATION) {
  const s = String(text ?? '');
  if (notation !== 'engineering' || !s.includes('/') || isOtherwise(s) || parseCond(s).error) return s;
  return slashToBars(s);
}

// where an operand that starts at j ends (j itself: none): a name or a number (its index [..] too), a literal in quotes,
// a group in parentheses, or a NOT of one (/ /a)
function operandEnd(s, j) {
  const close = (k, open, shut) => {   // (the index after the bracket that closes the one at k; none: k)
    for (let d = 0, i = k; i < s.length; i++) {
      if (s[i] === open) d++;
      else if (s[i] === shut && --d === 0) return i + 1;
    }
    return k;
  };
  const c = s[j];
  if (c === '/' && s[j + 1] !== '=') { let k = j + 1; while (s[k] === ' ') k++; const e = operandEnd(s, k); return e > k ? e : j; }
  if (c === '(') return close(j, '(', ')');
  if (c === '"' || c === "'") { const e = s.indexOf(c, j + 1); return e < 0 ? j : e + 1; }
  let k = j;
  while (k < s.length && /[A-Za-z0-9_]/.test(s[k])) k++;
  if (k > j && s[k] === '[') { const e = close(k, '[', ']'); if (e > k) k = e; }
  return k;
}

// the text's slash NOTs as bars: /x as x̅, /(…) as a bar over the group (its parentheses the bar's), the rest as it is
function slashToBars(s) {
  let out = '';
  for (let i = 0; i < s.length;) {
    let j = i + 1;
    while (s[j] === ' ') j++;
    const end = s[i] === '/' && s[i + 1] !== '=' ? operandEnd(s, j) : j;
    if (s[i] !== '/' || s[i + 1] === '=' || end <= j) { out += s[i++]; continue; }
    const op = s.slice(j, end);
    out += overline(slashToBars(op[0] === '(' ? op.slice(1, -1) : op));
    i = end;
  }
  return out;
}
