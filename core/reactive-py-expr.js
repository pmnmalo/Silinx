// Silinx - the synchronous reactive model's expressions written in MicroPython (#5487, core/reactive-py.js), as a student
// writes them, with the masks their widths need and no more. Python's integers have no width of their own: a sum, a
// difference, a ~, a - and a << are masked to their node's width (a sum or a shift left by a constant inside a sum of
// the same width is not: the outer mask keeps its low bits); a shift left by a variable is 0 from the width on, written
// so, as a << by a large count would make a very large integer. A logical operand that may be above 1 is compared with 0, so that `and` and `or`
// give 0 or 1 (Python's give an operand); a comparison or a `not` gives a bool, which Python computes with as 0 or 1.
// Isomorphic ES module: no DOM and no Node APIs.
import { maskOf } from './reactive-expr.js';

// Python's precedences (higher binds tighter); the comparisons chain (a < b < c), so a comparison's operand that is one
// is in parentheses
const P = { primary: 16, unary: 14, add: 12, shift: 11, band: 10, bxor: 9, bor: 8, cmp: 7, not: 6, land: 5, lor: 4, cond: 3 };
const BIN_P = { '+': P.add, '-': P.add, '<<': P.shift, '>>': P.shift, '&': P.band, '^': P.bxor, '|': P.bor };

/** A constant as Python writes it: decimal up to 9, hexadecimal above. */
export const pyConst = (v) => (v <= 9n ? v.toString() : `0x${v.toString(16).toUpperCase()}`);

const node = (s, p) => ({ s, p });
const paren = (x) => node(`(${x.s})`, P.primary);
/** x as an operand that needs at least precedence `p` (`ok(x)`: may it stand bare beside its operator). */
const at = (x, p, ok = () => true) => (x.p >= P.unary || (x.p >= p && ok(x)) ? x : paren(x));
const maskTo = (x, w) => node(`${at(x, P.unary).s} & ${pyConst(maskOf(w))}`, P.band);   // (a sum or a shift in parentheses, as a student reads it)
// (an expression whose value is 0 or 1: a logical operand as it is)
const isBool = (e) => ['not', 'and', 'or', 'cmp'].includes(e.k) || e.w === 1;

/**
 * The MicroPython of a typed expression (core/reactive-expr.js): { s (the text), p (its precedence) }. sym(name): { py
 * (its Python name), width } of a symbol. Its value is below 2^w and never negative; `bare`: its top mask left out (a sum
 * inside a sum of its width).
 */
export function pyExpr(e, sym, bare = false) {
  const X = (x) => pyExpr(x, sym);
  const masked = (x, w) => (bare ? x : maskTo(x, w));
  const logical = (x) => (isBool(x) ? X(x) : node(`${at(X(x), P.cmp + 1).s} != 0`, P.cmp));
  switch (e.k) {
    case 'const': return node(pyConst(e.v), P.primary);
    case 'ref': case 'slice': {
      const s = sym(e.name);
      let x = node(s.py, P.primary);
      if (e.k === 'slice' && e.lo) x = node(`${x.s} >> ${e.lo}`, P.shift);
      const w = e.k === 'slice' ? Math.min(e.n, e.w) : e.w;
      const full = e.k === 'slice' ? s.width - e.lo : s.width;
      return w < full ? maskTo(x, w) : x;
    }
    case 'not': return node(`not ${at(logical(e.a), P.not).s}`, P.not);
    case 'and': case 'or': {
      const p = e.k === 'and' ? P.land : P.lor;
      const ok = (x) => x.p !== P.land || e.k === 'and';   // (an and beside an or: in parentheses)
      return node(`${at(logical(e.a), p, ok).s} ${e.k} ${at(logical(e.b), p, ok).s}`, p);
    }
    case 'cmp': return node(`${at(X(e.a), P.cmp + 1).s} ${e.op} ${at(X(e.b), P.cmp + 1).s}`, P.cmp);
    case 'inv': case 'neg': return masked(node(`${e.k === 'inv' ? '~' : '-'}${at(X(e.a), P.unary).s}`, P.unary), e.w);
    case 'shift': return pyShift(e, X, masked);
    case 'arith': {
      const p = BIN_P[e.op];
      const sum = e.op === '+' || e.op === '-';
      const inner = (x) => pyExpr(x, sym, sum && x.w === e.w && ((x.k === 'arith' && (x.op === '+' || x.op === '-')) || (x.k === 'shift' && x.op === '<<' && x.b.k === 'const')));
      const same = (x) => x.p === p && (sum || x.op === e.op);   // (a & b & c, a + b - c: bare)
      const x = { ...node(`${at(inner(e.a), p, same).s} ${e.op} ${at(inner(e.b), p + 1, () => false).s}`, p), op: e.op };
      return sum ? masked(x, e.w) : x;   // (& | ^ of values below 2^w stay below it)
    }
  }
  throw new Error(`unknown expression '${e.k}'`);
}

function pyShift(e, X, masked) {
  const p = P.shift;
  const a = at(X(e.a), p + 1, () => false).s;
  if (e.b.k === 'const') {
    const k = Number(e.b.v);
    if (k >= e.w) return node('0', P.primary);
    if (e.op === '>>') return k ? node(`${a} >> ${k}`, p) : X(e.a);
    return masked(node(`${a} << ${k}`, p), e.w);
  }
  const n = at(X(e.b), p + 1, () => false).s;
  // (a shift right by a variable: 0 from the width on by itself; a shift left masked, and 0 written from the width on
  // when the count can reach it)
  if (e.op === '>>') return node(`${a} >> ${n}`, p);
  const left = masked(node(`${a} << ${n}`, p), e.w);
  if ((1n << BigInt(e.b.w ?? 1)) - 1n < BigInt(e.w)) return left;
  return node(`0 if ${at(X(e.b), P.cmp + 1).s} >= ${e.w} else ${at(left, P.cond + 1).s}`, P.cond);
}

/** The MicroPython of a value set to a target of `tw` bits: masked to it when the expression is wider. */
export function pyValue(e, tw, sym) {
  if (e.w != null && e.w > tw) return maskTo(pyExpr(e, sym), tw).s;
  return pyExpr(e, sym).s;
}
