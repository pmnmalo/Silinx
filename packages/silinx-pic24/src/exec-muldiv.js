// silinx-pic24 - the multiplies and divides (#5480, DS70000157 section 5): MUL.UU, MUL.US, MUL.SU, MUL.SS (Wb, Ws and
// Wb, #lit5 to Wnd:Wnd+1), MUL{.B} f (to W2 or W3:W2), and the iterative DIV.S, DIV.U, DIV.SD, DIV.UD (W1:W0 / Wn,
// the quotient to W0, the remainder to W1, executed 18 times as a REPEAT #17's target).

import { src } from './operands.js';
import { N, OV, Z, SFR, RA, TRAP } from './device.js';

const SRW = SFR.SR >> 1;
const s16 = (v) => (v << 16) >> 16;

// MUL.xx (0xB8: UU, US; 0xB9: SU, SS by bit 15): Wb's signedness first, the source's second; the literal forms (ppp =
// 11x) only for UU and SU
function mul(cpu, op) {
  const signedB = (op >>> 16) & 1, signedS = (op >> 15) & 1, p = (op >> 4) & 7;
  if (p >= 6 && signedS) return cpu.illegal(op);
  const wb = cpu.mem[(op >> 11) & 15], s = p >= 6 ? op & 31 : src(cpu, p, op & 15, 0);
  const prod = (signedB ? s16(wb) : wb) * (signedS ? s16(s) : s), d = (op >> 7) & 14;
  cpu.setW(d, prod & 0xffff);
  cpu.setW(d + 1, (prod >>> 16) & 0xffff);
}

// MUL{.B} f (0xBC): WREG times f, unsigned: a byte's 16 bits to W2, a word's 32 to W3:W2
function mulF(cpu, op) {
  if (op & 0xa000) return cpu.illegal(op);
  const B = (op >> 14) & 1, f = op & 0x1fff, w = B ? cpu.mem[0] & 0xff : cpu.mem[0], prod = w * cpu.rd(f, B);
  cpu.setW(2, prod & 0xffff);
  if (!B) cpu.setW(3, (prod >>> 16) & 0xffff);
}

// DIV.S / DIV.U (0xD8, bit 15 the unsigned): t op<14:11> the dividend's high word (a double's), v op<10:7> its low
// word, W op<6> the double, s the divisor. Its first iteration copies the dividend to W1:W0 (a divisor of 0: the math
// error trap), its last writes the quotient and the remainder from them, with N (a negative remainder), OV (a
// quotient not in 16 bits) and Z (no remainder); C is the algorithm's own and left as it is.
function div(cpu, op) {
  if (op & 0x0030) return cpu.illegal(op);
  const unsigned = (op >> 15) & 1, double = (op >> 6) & 1, t = (op >> 11) & 15, v = (op >> 7) & 15, n = op & 15;
  const rep = (cpu.mem[SRW] & RA) !== 0, first = !rep || cpu.repFirst, last = !rep || cpu.mem[SFR.RCOUNT >> 1] === 0;
  const divisor = cpu.mem[n];
  if (first) {
    if (divisor === 0) { cpu.trap(TRAP.MATHERR, 'a divide by zero'); return; }
    const lo = cpu.mem[v], hi = double ? cpu.mem[t] : unsigned ? 0 : (lo & 0x8000 ? 0xffff : 0);
    cpu.setW(0, lo);
    cpu.setW(1, hi);
    cpu.divIter = 0;
  }
  cpu.divIter++;
  if (!last) return;
  if (cpu.divIter !== 18)
    cpu.say('warning', `DIV executed ${cpu.divIter} times, not 18 (as REPEAT #17's target): its result is the 18 iterations'`, 'div-iterations');
  const dividend = unsigned ? ((cpu.mem[1] << 16) | cpu.mem[0]) >>> 0 : (cpu.mem[1] << 16) | cpu.mem[0];
  const d = unsigned ? divisor : s16(divisor);
  if (d === 0) { cpu.trap(TRAP.MATHERR, 'a divide by zero'); return; }
  const q = Math.trunc(dividend / d), r = dividend - q * d;
  const over = unsigned ? q > 0xffff : q > 0x7fff || q < -0x8000;
  cpu.setW(0, q & 0xffff);
  cpu.setW(1, r & 0xffff);
  cpu.flags(N | OV | Z, (!unsigned && r < 0 ? N : 0) | (over ? OV : 0) | (r === 0 ? Z : 0));
}

/** The handlers by the instruction word's top byte. */
export function mulDivOps(ops) {
  ops[0xb8] = ops[0xb9] = mul;
  ops[0xbc] = mulF;
  ops[0xd8] = div;
}
