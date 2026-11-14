// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The notation Silinx shows Boolean expressions in (#3915): a user's preference (the browser's, web/js/notation.js;
// the MCP server's, config.json), one of five. The truth table's expressions (core/logic.js's trees: showExpr) and the
// conditions of a state diagram or an ASM chart (core/asm-expr.js's trees: showCond) are written in it; the parsers
// read every one back (the overbar: core/overline.js). A drawing's condition is shown as it was typed: the notation
// is for what Silinx derives (its tables, results, groups).
import { formatExpr } from './logic.js';
import { exprToString } from './asm-expr.js';
import { parseCond, isOtherwise } from './fsm.js';
import { overline } from './overline.js';

/** The notations: [id, the name shown, an example]; the first the default. */
export const NOTATIONS = [
  ['engineering', 'Electronics / Engineering', 'a̅·b + c'],
  ['slash', 'Text only', '/a.b + c'],
  ['logic', 'Logic / Set theory', '¬a ∧ b ∨ c'],
  ['vhdl', 'VHDL', '(not a and b) or c'],
  ['verilog', 'Verilog', '(~a & b) | c'],
];
export const NOTATION_IDS = NOTATIONS.map(([id]) => id);
export const DEFAULT_NOTATION = 'engineering';
/** A notation's id, or the default for one that is not. */
export const notationOf = (v) => (NOTATION_IDS.includes(v) ? v : DEFAULT_NOTATION);

// the symbols of the notations that core/logic.js's formatExpr does not have
const SYM = {
  engineering: { and: '·', or: ' + ', xor: ' ⊕ ', not: (s) => overline(s), notGroup: (s) => overline(s) },
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

// a condition's operators (core/asm-expr.js's tree) per notation: the logical ones and the bitwise ones alike (a
// condition's operands are bits, mostly); the comparisons, the arithmetic and the literals as exprToString writes them
const COND = {
  engineering: { and: '·', or: ' + ', orArith: ' OR ', xor: ' ⊕ ', not: (s) => overline(s), notGroup: (s) => overline(s), eq: '==', ne: '!=' },
  slash: { and: '.', or: ' + ', orArith: ' OR ', xor: ' ⊕ ', not: (s) => `/${s}`, notGroup: (s) => `/(${s})`, eq: '==', ne: '!=' },
  logic: { and: ' ∧ ', or: ' ∨ ', orArith: ' ∨ ', xor: ' ⊕ ', not: (s) => `¬${s}`, notGroup: (s) => `¬(${s})`, eq: '==', ne: '!=' },
  vhdl: { and: ' and ', or: ' or ', orArith: ' or ', xor: ' xor ', not: (s) => `not ${s}`, notGroup: (s) => `not (${s})`, eq: '=', ne: '/=' },
  verilog: { and: ' & ', or: ' | ', orArith: ' | ', xor: ' ^ ', not: (s) => `~${s}`, notGroup: (s) => `~(${s})`, eq: '==', ne: '!=' },
};
const LOGIC_OP = { '&&': 'and', '&': 'and', '||': 'or', '|': 'or', '^': 'xor' };

/** A condition's tree (core/asm-expr.js's) in a notation. A '+' that is an OR is written so that it reads back as one:
 *  in a comparison's operand, where '+' adds, as OR (engineering, text). Every operand of a comparison, a shift or an
 *  addition in parentheses, as exprToString writes them. */
export function showCond(ast, notation = DEFAULT_NOTATION) {
  const N = COND[notationOf(notation)];
  const leaf = (x) => x.k === 'id' || x.k === 'sel' || x.k === 'lit';
  const f = (x, parent, arith) => {
    if (leaf(x)) return exprToString(x);
    if (x.k === 'un') {
      if (x.op === '-') return `-${leaf(x.a) ? f(x.a, null, arith) : `(${f(x.a, null, arith)})`}`;
      const inner = f(x.a, null, arith);
      return leaf(x.a) || (x.a.k === 'un' && x.a.op !== '-') ? N.not(inner) : N.notGroup(inner);
    }
    const lo = LOGIC_OP[x.op];
    if (lo) {
      const s = `${f(x.a, lo, arith)}${lo === 'or' && arith ? N.orArith : N[lo]}${f(x.b, lo, arith)}`;
      // (no parentheses: the same operator chained, an AND or an XOR in an OR, an AND in an XOR)
      // (VHDL, Verilog: parentheses between two different operators, as VHDL requires them and formatExpr writes both)
      const bare = !parent || parent === lo || (PREC[lo] > PREC[parent] && parent !== 'arith' && notation !== 'vhdl' && notation !== 'verilog');
      return bare ? s : `(${s})`;
    }
    const op = x.op === '==' ? N.eq : x.op === '!=' ? N.ne : x.op;
    const s = `${f(x.a, 'arith', true)} ${op} ${f(x.b, 'arith', true)}`;
    return parent ? `(${s})` : s;
  };
  return f(ast, null, false);
}

/** A transition's condition as typed, shown in a notation: the otherwise words and a condition that is not valid as
 *  they are. */
export function showCondText(text, notation = DEFAULT_NOTATION) {
  if (isOtherwise(text)) return String(text ?? '');
  const p = parseCond(text);
  return p.error ? String(text) : showCond(p.ast, notation);
}
