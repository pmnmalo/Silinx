// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The notations of the Boolean expressions Silinx shows (#3915) and a condition (core/asm-expr.js's tree) written in
// one: the state diagram's tables (core/expr-notation.js) and the conditions the conversions write (an HDL module, an
// ASM chart or a Petri net made a drawing: core/asm-from-hdl.js, core/fsm-asm.js, core/petri-fsm.js). Its imports are
// the parser's and the overbar's only, so that those modules read it without a cycle.
import { exprToString } from './asm-expr.js';
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

const PREC = { or: 1, xor: 2, and: 3 };

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
