// silinx-pic24 - the addressing modes (#5480, DS70000157 4.1) and the ALU's flags. A mode is an instruction's 3 bits
// (ppp for the source, qqq for the destination): 0 Wn, 1 [Wn], 2 [Wn--], 3 [Wn++], 4 [--Wn], 5 [++Wn], 6-7 [Wn+Wb]
// (MOV's only); a byte operation's steps are 1, a word's 2.

import { C, Z, OV, N, DC } from './device.js';

/** A source operand's EA (its pointer modified, by `step`: MOV.D's 4). */
export function srcEA(cpu, p, s, B, wb = -1, step = B ? 1 : 2) {
  const a = cpu.ptr(s, true);
  let ea;
  switch (p) {
    case 1: ea = a; break;
    case 2: ea = a; cpu.mod(s, a - step, false); break;
    case 3: ea = a; cpu.mod(s, a + step, false); break;
    case 4: ea = (a - step) & 0xffff; cpu.mod(s, ea, false); break;
    case 5: ea = (a + step) & 0xffff; cpu.mod(s, ea, false); break;
    default: ea = (a + cpu.mem[wb < 0 ? 0 : wb]) & 0xffff; break;
  }
  if (s === 15) cpu.stackCheck(ea);
  return ea;
}

/** A source operand's value (a byte's or a word's). */
export function src(cpu, p, s, B, wb) {
  if (p === 0) return B ? cpu.mem[s] & 0xff : cpu.mem[s];
  return cpu.rd(srcEA(cpu, p, s, B, wb), B);
}

/** A destination's EA (its pointer modified: a destination's write, for the RAW stalls). */
export function dstEA(cpu, q, d, B, wb = -1, step = B ? 1 : 2) {
  const a = cpu.ptr(d, false);
  let ea;
  switch (q) {
    case 1: ea = a; break;
    case 2: ea = a; cpu.mod(d, a - step, true); break;
    case 3: ea = a; cpu.mod(d, a + step, true); break;
    case 4: ea = (a - step) & 0xffff; cpu.mod(d, ea, true); break;
    case 5: ea = (a + step) & 0xffff; cpu.mod(d, ea, true); break;
    default: ea = (a + cpu.mem[wb < 0 ? 0 : wb]) & 0xffff; break;
  }
  if (d === 15) cpu.stackCheck(ea);
  return ea;
}

/** A destination written: Wd (a byte its low byte) or the memory at its EA. */
export function dst(cpu, q, d, B, v, wb) {
  if (q === 0) { if (B) cpu.setWB(d, v); else cpu.setW(d, v); return; }
  cpu.wr(dstEA(cpu, q, d, B, wb), v, B);
}

// a file register's value and its write (f: a byte address of the near data space, 0-8191; a word's even)
export const rdF = (cpu, f, B) => cpu.rd(f, B);
export function wrF(cpu, f, B, v, D) {
  if (D) cpu.wr(f, v, B);
  else if (B) cpu.setWB(0, v);
  else cpu.setW(0, v);
}

// ---- the flags (DS30010074 register 3-1: DC is the carry out of bit 3 of a byte, of bit 7 of a word)
const ALL = DC | N | OV | Z | C;

/** a + b + cin, its flags (DC, N, OV, Z, C); Z only cleared when `sticky` (the carry-in instructions). */
export function add(cpu, a, b, cin, B, sticky = false) {
  const m = B ? 0xff : 0xffff, msb = B ? 0x80 : 0x8000, half = B ? 0xf : 0xff;
  const r = a + b + cin, res = r & m;
  let f = 0;
  if (r > m) f |= C;
  if ((a & half) + (b & half) + cin > half) f |= DC;
  if (~(a ^ b) & (a ^ res) & msb) f |= OV;
  if (res & msb) f |= N;
  f |= sticky ? cpu.stickyZ(res) : res === 0 ? Z : 0;
  cpu.flags(ALL, f);
  return res;
}

/** a - b - !cin, as a + ~b + cin: C and DC set when nothing is borrowed (the adder's carries; the manual's examples
 *  disagree with one another on DC after a subtraction: MPLAB X's simulator settles it, #5483). */
export function sub(cpu, a, b, cin, B, sticky = false) {
  return add(cpu, a, ~b & (B ? 0xff : 0xffff), cin, B, sticky);
}

/** A logic result's N and Z. */
export function nz(cpu, res, B) {
  cpu.flags(N | Z, (res & (B ? 0x80 : 0x8000) ? N : 0) | (res === 0 ? Z : 0));
  return res;
}

/** N, Z and C (a shift's or a rotate's). */
export function nzc(cpu, res, B, c) {
  cpu.flags(N | Z | C, (res & (B ? 0x80 : 0x8000) ? N : 0) | (res === 0 ? Z : 0) | (c ? C : 0));
  return res;
}

export const sext8 = (v) => (v & 0x80 ? v | ~0xff : v & 0xff);
