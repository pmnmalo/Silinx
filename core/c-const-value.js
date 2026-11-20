// Silinx HLS: the value of a C constant expression, core/c-check.js's (#1524). A module of its own (#4723): the C
// interpreter's tasks (core/c-interp-task.js) need it, and importing c-check there closed the cycle c-interp → c-check →
// c-const-init → c-interp, which made core/c-interp-lib.js fail when imported alone.
// Isomorphic ES module: no DOM and no Node APIs.

/** The value of a constant expression (numbers, the constants known, C's operators, sizeof if sizeOf is given), or null
 *  if it is not one. */
export function constValue(e, consts = new Map(), sizeOf = null) {
  if (!e) return null;
  switch (e.kind) {
    case 'num': case 'chr': return e.value;
    case 'id': return consts.has(e.name) ? consts.get(e.name) : null;
    case 'unary': {
      const v = constValue(e.e, consts, sizeOf);
      if (v === null) return null;
      return e.op === '-' ? -v : e.op === '+' ? v : e.op === '!' ? (v ? 0n : 1n) : e.op === '~' ? ~v : null;
    }
    case 'sizeof': return sizeOf ? sizeOf(e) : null;   // (sizeOf(e): its bytes, core/c-sizeof.js, #2643)
    case 'cast': return constValue(e.e, consts, sizeOf);
    case 'cond': { const c = constValue(e.c, consts, sizeOf); return c === null ? null : constValue(c ? e.a : e.b, consts, sizeOf); }
    case 'binary': {
      const a = constValue(e.l, consts, sizeOf), b = constValue(e.r, consts, sizeOf);
      if (a === null || b === null) return null;
      switch (e.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': return b ? a / b : null; case '%': return b ? a % b : null;
        case '<<': return b >= 0n && b < 4096n ? a << b : null; case '>>': return b >= 0n ? a >> b : null;
        case '&': return a & b; case '|': return a | b; case '^': return a ^ b;
        case '&&': return a && b ? 1n : 0n; case '||': return a || b ? 1n : 0n;
        case '==': return a === b ? 1n : 0n; case '!=': return a !== b ? 1n : 0n;
        case '<': return a < b ? 1n : 0n; case '>': return a > b ? 1n : 0n; case '<=': return a <= b ? 1n : 0n; case '>=': return a >= b ? 1n : 0n;
        default: return null;
      }
    }
    default: return null;
  }
}
