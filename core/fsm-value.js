// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// A state diagram's output value (#4891): a constant of 0s and 1s (0, 1, 4'b1010, 5, "0101"), or a don't care, the
// whole output's (X, -, 'X', '-', 1'bx) or some of its bits' ("1X0", "1-0", 3'b1x0, 8'hx5). Read by core/fsm.js
// (Check, the reference simulation, the tables), core/fsm-outputs.js (the Properties' and the MCP's checks) and
// core/fsm-hdl.js (each language's don't care: VHDL '-', Verilog x). Its import is the parser's only (no cycle with
// core/fsm.js); a don't care's grammar is the parser's (core/asm-expr.js dontCareConst: an ASM chart's actions too, #4895).
import { dontCareConst, parseCondition } from './asm-expr.js';

/** An output's value: { v, x, w } (its 1 bits, its don't-care bits, its width as written; w null: a number, or a whole
 *  don't care, x -1n, that takes the output's width), or null when it is not a constant. A Verilog literal's leftmost
 *  x is extended to its width (3'bx is xxx), as Verilog's is. */
export function outputConst(text) {
  const s = String(text ?? '').trim();
  const r = parseCondition(s);
  if (!r.error && r.ast.k === 'lit') return { v: r.ast.v, x: 0n, w: r.ast.w ?? null };
  return dontCareConst(s);
}

const ones = (w) => (1n << BigInt(w)) - 1n;

/** The value `c` (outputConst's) at `width` bits: { v, x } (v's don't-care bits 0). */
export function atWidth(c, width) {
  const x = c.x === -1n ? ones(width) : c.x & ones(width);
  return { v: c.v & ones(width) & ~x, x };
}

/** Whether the value `c` (outputConst's) fits in `width` bits (a whole don't care always does). */
export const outputFits = (c, width) => c.x === -1n || ((c.v | c.x) >> BigInt(width)) === 0n;

/** A value's bits at `width` (v, and x its don't-care bits), MSB first: 0, 1 and X. */
export function bitsText(v, x, width) {
  let s = '';
  for (let b = width - 1; b >= 0; b--) {
    const k = 1n << BigInt(b);
    s += (x ?? 0n) & k ? 'X' : (v & k ? '1' : '0');
  }
  return s;
}
