// Silinx - the synchronous reactive model's expressions (#5486): a drawing's condition or action (core/asm-expr.js's
// syntax and AST) lowered to a typed expression, each node at the width it is evaluated at, by Verilog's width rules
// (as the drawings' generated HDL and their simulators, core/fsm.js and core/asm-sim.js); its value; its narrowing to the
// bits its consumer keeps. A generator (core/reactive-c.js) writes each node as it is, with its masks: the model has no
// width rule of its own left.
//
// The typed expression (`w`: the width of its value, which is always below 2^w):
//   { k: 'const', v: BigInt, w }
//   { k: 'ref', name, w }                    a symbol's present value (an input, a variable, a registered output, a
//                                            constant), at w bits (masked when w is below the symbol's width)
//   { k: 'slice', name, lo, n, w }           bits lo .. lo+n-1 of a symbol
//   { k: 'not', a }  { k: 'and' | 'or', a, b }   logical: 1 bit, an operand true when it is not 0
//   { k: 'cmp', op: == != < > <= >=, a, b }  1 bit; both operands at the comparison's width
//   { k: 'arith', op: + - & | ^, a, b, w }   modulo 2^w
//   { k: 'inv' | 'neg', a, w }               ~a, -a modulo 2^w
//   { k: 'shift', op: << >>, a, b, w }       a at w bits, b at its own width; 0 when b >= w
//
// Isomorphic ES module: no DOM and no Node APIs.

const ARITH = new Set(['+', '-', '&', '|', '^']);
const SHIFT = new Set(['<<', '>>']);
const CMP = new Set(['==', '!=', '<', '>', '<=', '>=']);
export const maskOf = (w) => (1n << BigInt(w)) - 1n;
const UNSIZED = 32;   // an unsized literal and a constant (a generic): 32 bits, as Verilog's

/** An expression's own width (Verilog's self-determined width); width(name): a symbol's, null when it has none. */
export function selfWidth(ast, width) {
  switch (ast.k) {
    case 'lit': return ast.w ?? UNSIZED;
    case 'id': return width(ast.name) ?? 1;
    case 'sel': return ast.hi - ast.lo + 1;
    case 'un': return ast.op === '!' ? 1 : selfWidth(ast.a, width);
    case 'bin':
      if (ARITH.has(ast.op)) return Math.max(selfWidth(ast.a, width), selfWidth(ast.b, width));
      if (SHIFT.has(ast.op)) return selfWidth(ast.a, width);
      return 1;
  }
  return 1;
}

/**
 * The AST evaluated at the width W, as a typed expression; width(name): the symbol's width (null: no such symbol,
 * which reads 0, as the simulators read it).
 */
export function lower(ast, W, width) {
  const own = (x) => lower(x, selfWidth(x, width), width);
  switch (ast.k) {
    case 'lit': return { k: 'const', v: ast.v & maskOf(W), w: W };
    case 'id': return width(ast.name) == null ? { k: 'const', v: 0n, w: W } : { k: 'ref', name: ast.name, w: W };
    case 'sel': {
      const n = ast.hi - ast.lo + 1;
      return width(ast.name) == null ? { k: 'const', v: 0n, w: Math.min(W, n) } : { k: 'slice', name: ast.name, lo: ast.lo, n, w: Math.min(W, n) };
    }
    case 'un':
      if (ast.op === '!') return { k: 'not', a: own(ast.a) };
      return { k: ast.op === '~' ? 'inv' : 'neg', a: lower(ast.a, W, width), w: W };
    case 'bin': {
      const { op } = ast;
      if (op === '&&' || op === '||') return { k: op === '&&' ? 'and' : 'or', a: own(ast.a), b: own(ast.b) };
      if (CMP.has(op)) {
        const cw = Math.max(selfWidth(ast.a, width), selfWidth(ast.b, width));
        return { k: 'cmp', op, a: lower(ast.a, cw, width), b: lower(ast.b, cw, width) };
      }
      if (SHIFT.has(op)) return { k: 'shift', op, a: lower(ast.a, W, width), b: own(ast.b), w: W };
      return { k: 'arith', op, a: lower(ast.a, W, width), b: lower(ast.b, W, width), w: W };
    }
  }
  return { k: 'const', v: 0n, w: W };
}

/** A condition: true when its value (at its own width) is not 0. */
export const lowerCond = (ast, width) => lower(ast, selfWidth(ast, width), width);

/** An action's value for a target of `tw` bits: evaluated at the wider of the two, then kept to the target's bits. */
export const lowerAction = (ast, tw, width) => narrow(lower(ast, Math.max(tw, selfWidth(ast, width)), width), tw);

/**
 * The expression with only its low t bits kept: + - & | ^ ~ - << and the leaves computed at t bits (their low bits
 * depend only on their operands' low bits), the others as they are (their consumer masks them).
 */
export function narrow(e, t) {
  if (e.w == null || e.w <= t) return e;
  switch (e.k) {
    case 'const': return { ...e, v: e.v & maskOf(t), w: t };
    case 'ref': case 'slice': return { ...e, w: t };
    case 'arith': return { ...e, a: narrow(e.a, t), b: narrow(e.b, t), w: t };
    case 'inv': case 'neg': return { ...e, a: narrow(e.a, t), w: t };
    case 'shift': return e.op === '<<' ? { ...e, a: narrow(e.a, t), w: t } : e;
  }
  return e;
}

/** An expression's width: its value's (1 for a logical one). */
const widthOf = (e) => e.w ?? 1;

/** Its value (a BigInt below 2^w); read(name): a symbol's present value (a BigInt). */
export function evalExpr(e, read) {
  const ev = (x) => evalExpr(x, read);
  switch (e.k) {
    case 'const': return e.v;
    case 'ref': return BigInt(read(e.name)) & maskOf(e.w);
    case 'slice': return (BigInt(read(e.name)) >> BigInt(e.lo)) & maskOf(e.n) & maskOf(e.w);
    case 'not': return ev(e.a) === 0n ? 1n : 0n;
    case 'and': return ev(e.a) !== 0n && ev(e.b) !== 0n ? 1n : 0n;
    case 'or': return ev(e.a) !== 0n || ev(e.b) !== 0n ? 1n : 0n;
    case 'cmp': {
      const a = ev(e.a), b = ev(e.b);
      return ({ '==': a === b, '!=': a !== b, '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b }[e.op]) ? 1n : 0n;
    }
    case 'inv': return ~ev(e.a) & maskOf(e.w);
    case 'neg': return -ev(e.a) & maskOf(e.w);
    case 'shift': {
      const a = ev(e.a), n = ev(e.b);
      if (n >= BigInt(e.w)) return 0n;
      return (e.op === '<<' ? a << n : a >> n) & maskOf(e.w);
    }
    case 'arith': {
      const a = ev(e.a), b = ev(e.b);
      const v = e.op === '+' ? a + b : e.op === '-' ? a - b : e.op === '&' ? a & b : e.op === '|' ? a | b : a ^ b;
      return v & maskOf(e.w);
    }
  }
  return 0n;
}

/** The names an expression reads. */
export function exprReads(e, out = new Set()) {
  if (e.k === 'ref' || e.k === 'slice') out.add(e.name);
  if (e.a) exprReads(e.a, out);
  if (e.b) exprReads(e.b, out);
  return out;
}

/** The widest node of an expression. */
export function exprMaxWidth(e) {
  return Math.max(widthOf(e), e.a ? exprMaxWidth(e.a) : 0, e.b ? exprMaxWidth(e.b) : 0);
}
