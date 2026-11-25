// Silinx - the synchronous reactive model's expressions written in C (#5486, core/reactive-c.js), as a student writes
// them, with the masks and casts their widths need and no more. The same text is right on the AVR (int of 16 bits) and on
// a host (int of 32): a node of up to SMALL bits is computed in int (its operands below 2^SMALL, so that a sum, a
// difference or a shift by a constant never overflows a 16-bit int) and masked to its width; a wider node in uint32_t
// (its left operand cast), which wraps modulo 2^32 by itself, and masked below 32 bits (UINT32_C: unsigned long on the
// AVR, unsigned int on a host, 32 bits on both). Every value is kept non-negative, so that a comparison is the same in
// either.
// Isomorphic ES module: no DOM and no Node APIs.
import { maskOf } from './reactive-expr.js';

const SMALL = 14;   // the widest node computed in int

// C's precedences (higher binds tighter)
const P = { primary: 16, unary: 14, add: 12, shift: 11, rel: 10, eq: 9, band: 8, bxor: 7, bor: 6, land: 5, lor: 4, cond: 3 };
const BIN_P = { '+': P.add, '-': P.add, '<<': P.shift, '>>': P.shift, '<': P.rel, '>': P.rel, '<=': P.rel, '>=': P.rel, '==': P.eq, '!=': P.eq, '&': P.band, '^': P.bxor, '|': P.bor, '&&': P.land, '||': P.lor };

/** A C type for a value of `w` bits. */
export const cType = (w) => (w <= 8 ? 'uint8_t' : w <= 16 ? 'uint16_t' : 'uint32_t');
/** A constant as C writes it: decimal up to 9, hexadecimal above; UINT32_C when an int of 16 bits cannot hold it. */
export function cConst(v) {
  const t = v <= 9n ? v.toString() : `0x${v.toString(16).toUpperCase()}`;
  return v > 0x7FFFn ? `UINT32_C(${t})` : t;
}

const node = (s, p, u32 = false) => ({ s, p, u32 });
const paren = (x) => node(`(${x.s})`, P.primary, x.u32);
/** x as an operand that needs at least precedence `p` (`ok(x)`: may it stand bare beside its operator). A logical not
 *  stands bare only beside && and || (`!x && y`) and another not: beside a bitwise operator, a comparison or a sum in
 *  parentheses, as GCC's -Wparentheses asks (`(!x) | y`, its warning: '!' or '|' meant otherwise). */
const at = (x, p, ok = () => true, not = false) => ((x.op === '!' && !not) ? paren(x) : x.p >= P.unary || (x.p >= p && ok(x)) ? x : paren(x));
const cast32 = (x) => (x.u32 ? x : node(`(uint32_t)${at(x, P.unary).s}`, P.unary, true));
const maskTo = (x, w) => (w >= 32 && x.u32 ? x : node(`${at(x, P.primary).s} & ${cConst(maskOf(w))}`, P.band, x.u32 || w > SMALL));

/**
 * The C of a typed expression (core/reactive-expr.js): { s (the text), p (its precedence), u32 (its type is uint32_t) }.
 * sym(name): { c (its C name), width } of a symbol. Its value is below 2^w and never negative.
 */
export function cExpr(e, sym, bare = false) {
  const C = (x) => cExpr(x, sym);
  const masked = (x, w) => (bare ? x : maskTo(x, w));   // (bare: the assignment that takes it truncates it the same)
  switch (e.k) {
    case 'const': return node(cConst(e.v), P.primary);
    case 'ref': case 'slice': {
      const s = sym(e.name);
      const u32 = s.width > 16;
      let x = node(s.c, P.primary, u32);
      if (e.k === 'slice' && e.lo) x = node(`${x.s} >> ${e.lo}`, P.shift, u32);
      const w = e.k === 'slice' ? Math.min(e.n, e.w) : e.w;
      const full = e.k === 'slice' ? s.width - e.lo : s.width;
      return w < full ? masked(x, w) : x;
    }
    case 'not': return { ...node(`!${at(C(e.a), P.unary, undefined, true).s}`, P.unary), op: '!' };
    case 'and': case 'or': {
      const op = e.k === 'and' ? '&&' : '||';
      const ok = (x) => x.p !== P.land || op === '&&';   // (an && beside an ||: in parentheses)
      return node(`${at(C(e.a), BIN_P[op], ok, true).s} ${op} ${at(C(e.b), BIN_P[op], ok, true).s}`, BIN_P[op]);
    }
    case 'cmp': {
      const p = BIN_P[e.op];
      const ok = (x) => x.p === P.add;   // (a sum or a difference bare; a shift, a bitwise operation in parentheses)
      return node(`${at(C(e.a), p, ok).s} ${e.op} ${at(C(e.b), p + 1, ok).s}`, p);
    }
    case 'inv': case 'neg': {
      const op = e.k === 'inv' ? '~' : '-';
      const a = e.w > SMALL ? cast32(C(e.a)) : C(e.a);
      return masked(node(`${op}${at(a, P.unary).s}`, P.unary, a.u32), e.w);
    }
    case 'shift': return cShift(e, C, masked);
    case 'arith': {
      const p = BIN_P[e.op];
      const sum = e.op === '+' || e.op === '-';
      // (in uint32_t, which wraps modulo 2^32, an operand of a sum at its width needs no mask of its own: the sum's keeps
      // its low bits)
      const inner = (x) => cExpr(x, sym, sum && e.w > SMALL && x.w === e.w && (x.k === 'arith' || (x.k === 'shift' && x.op === '<<' && x.b.k === 'const')));
      const a0 = inner(e.a), b = inner(e.b);
      const a = sum && e.w > SMALL && !a0.u32 && !b.u32 ? cast32(a0) : a0;   // (one operand of uint32_t: the other converted)
      const same = (x) => x.p === p && (sum || x.op === e.op);   // (a & b & c, a + b - c: bare; a & b | c: in parentheses)
      const x = { ...node(`${at(a, p, same).s} ${e.op} ${at(b, p + 1, () => false).s}`, p, a.u32 || b.u32), op: e.op };
      return e.op === '+' || e.op === '-' ? masked(x, e.w) : x;   // (& | ^ of values below 2^w stay below it)
    }
  }
  throw new Error(`unknown expression '${e.k}'`);
}

function cShift(e, C, masked) {
  const p = P.shift;
  if (e.b.k === 'const') {
    const k = Number(e.b.v);
    if (k >= e.w) return node('0', P.primary);
    if (e.op === '>>') return k ? node(`${at(C(e.a), p + 1, () => false).s} >> ${k}`, p, C(e.a).u32) : C(e.a);
    const a = e.w + k > SMALL + 1 ? cast32(C(e.a)) : C(e.a);
    return masked(node(`${at(a, p + 1, () => false).s} << ${k}`, p, a.u32), e.w);
  }
  // (a shift by a variable: 0 from the width on, as Verilog's; C's own shift by 32 or more is undefined)
  const n = C(e.b);
  const raw = e.op === '>>' ? node(`${at(C(e.a), p + 1, () => false).s} >> ${at(n, p + 1, () => false).s}`, p, C(e.a).u32)
    : (() => { const a = 2 * e.w - 1 > SMALL + 1 ? cast32(C(e.a)) : C(e.a); return masked(node(`${at(a, p + 1, () => false).s} << ${at(n, p + 1, () => false).s}`, p, a.u32), e.w); })();
  return node(`${at(n, P.rel + 1, () => false).s} >= ${e.w} ? 0 : ${at(raw, P.cond + 1).s}`, P.cond, raw.u32);
}

/** The C of a value set to a target of `tw` bits (its C type cType(tw)): its top mask left out when the assignment
 *  truncates the same (a target of 8, 16 or 32 bits). */
export function cValue(e, tw, sym) {
  const full = tw === 8 || tw === 16 || tw === 32;
  if (e.w != null && e.w > tw) return maskTo(cExpr(e, sym), tw).s;
  return cExpr(e, sym, full && e.w === tw).s;
}
