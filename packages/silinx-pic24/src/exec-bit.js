// silinx-pic24 - the bit instructions (#5480, DS70000157 section 5): BSET, BCLR, BTG, BTST, BTSTS, BSW, BTSC, BTSS on
// Ws and on f, and the bit searches FBCL, FF1L, FF1R.

import { srcEA } from './operands.js';
import { C, Z, SFR } from './device.js';

const SRW = SFR.SR >> 1;
const pOf = (op) => (op >> 4) & 7, sOf = (op) => op & 15;

/** The next instruction skipped (a skip's 2 cycles, 3 over a two-word CALL or GOTO). */
export function skipNext(cpu) {
  const top = cpu.progWord(cpu.npc) >>> 16;
  const two = top === 0x02 || top === 0x04;
  cpu.npc = (cpu.npc + (two ? 4 : 2)) & 0x7ffffe;
  cpu.cyc = two ? 3 : 2;
}

// an operand read, changed and written back: Ws direct or at its EA (byte or word)
function rmw(cpu, p, s, B, fn) {
  if (p === 0) {
    const v = B ? cpu.mem[s] & 0xff : cpu.mem[s], r = fn(v);
    if (r !== undefined) { if (B) cpu.setWB(s, r); else cpu.setW(s, r); }
    return;
  }
  const ea = srcEA(cpu, p, s, B), v = cpu.rd(ea, B), r = fn(v);
  if (r !== undefined) cpu.wr(ea, r, B);
}

const test = (cpu, v, bit, toC) => {
  const one = (v >> bit) & 1;
  if (toC) cpu.flags(C, one ? C : 0); else cpu.flags(Z, one ? 0 : Z);
};

// 0xA0-0xA7 on Ws: BSET, BCLR, BTG (#bit4, B at bit 10); BTST and BTSTS #bit4 (.Z at bit 11); BTST Ws, Wb (.Z at
// bit 15, Wb at 14-11); BTSS and BTSC #bit4
function bitW(cpu, op) {
  const t = op >>> 16, p = pOf(op), s = sOf(op), bit4 = (op >> 12) & 15;
  if (p >= 6) return cpu.illegal(op);
  switch (t) {
    case 0xa0: case 0xa1: case 0xa2: {
      const B = (op >> 10) & 1;
      if (op & 0x0b80 || (B && bit4 > 7)) return cpu.illegal(op);
      const m = 1 << bit4;
      rmw(cpu, p, s, B, (v) => (t === 0xa0 ? v | m : t === 0xa1 ? v & ~m : v ^ m));
      return;
    }
    case 0xa3: case 0xa4: {
      if (op & 0x0780) return cpu.illegal(op);
      const toC = !((op >> 11) & 1);
      rmw(cpu, p, s, 0, (v) => { test(cpu, v, bit4, toC); return t === 0xa4 ? v | (1 << bit4) : undefined; });
      return;
    }
    case 0xa5: {
      if (op & 0x0780) return cpu.illegal(op);
      const toC = !((op >> 15) & 1), bit = cpu.mem[(op >> 11) & 15] & 15;
      rmw(cpu, p, s, 0, (v) => { test(cpu, v, bit, toC); });
      return;
    }
    default: {
      if (op & 0x0f80) return cpu.illegal(op);
      let one = 0;
      rmw(cpu, p, s, 0, (v) => { one = (v >> bit4) & 1; });
      if (one === (t === 0xa6 ? 1 : 0)) skipNext(cpu);
    }
  }
}

// BSW.C / BSW.Z Ws, Wb (0xAD): Ws's bit Wb<3:0> written with C, or with Z's complement
function bsw(cpu, op) {
  const p = pOf(op);
  if (op & 0x0780 || p >= 6) return cpu.illegal(op);
  const toC = !((op >> 15) & 1), bit = cpu.mem[(op >> 11) & 15] & 15, sr = cpu.mem[SRW];
  const one = toC ? sr & C : !(sr & Z);
  rmw(cpu, p, sOf(op), 0, (v) => (one ? v | (1 << bit) : v & ~(1 << bit)));
}

// 0xA8-0xAC, 0xAE, 0xAF on f: a word's f at op<12:1> (the assembler turns a byte's bit into its word's), bit4<2:0> at
// op<15:13> and bit4<3> at op<0>, a byte's address's LSB (XC16's encodings, #6017: `bclr.b 0x6a7, #5` 0xA9A6A7)
function bitF(cpu, op) {
  const t = op >>> 16, f = op & 0x1ffe, bit = ((op & 1) << 3) | ((op >> 13) & 7), m = 1 << bit;
  const v = cpu.rd(f, 0);
  switch (t) {
    case 0xa8: cpu.wr(f, v | m, 0); return;
    case 0xa9: cpu.wr(f, v & ~m, 0); return;
    case 0xaa: cpu.wr(f, v ^ m, 0); return;
    case 0xab: test(cpu, v, bit, false); return;
    case 0xac: test(cpu, v, bit, false); cpu.wr(f, v | m, 0); return;
    case 0xae: if (v & m) skipNext(cpu); return;
    default: if (!(v & m)) skipNext(cpu);
  }
}

// FBCL Ws, Wnd (0xDF): the first bit change from the left after the sign, as 0 to -14 (-15 and C when none)
function fbcl(cpu, op) {
  if (op & 0xf800) return cpu.illegal(op);
  const v = readWord(cpu, op), sign = v & 0x8000;
  let t = (v << 1) & 0xffff, shift = 0;
  while (shift < 15 && (t & 0x8000) === sign) { t = (t << 1) & 0xffff; shift++; }
  cpu.setW((op >> 7) & 15, -shift & 0xffff);
  cpu.flags(C, shift === 15 ? C : 0);
}

// FF1L (0xCF, bit 15 set) and FF1R (clear): the first 1 from the left (1 the MSb) or from the right (1 the LSb), 0
// and C when none
function ff1(cpu, op) {
  if (op & 0x7800) return cpu.illegal(op);
  const v = readWord(cpu, op);
  let n = 0;
  if (v) n = op & 0x8000 ? Math.clz32(v) - 15 : 32 - Math.clz32(v & -v);
  cpu.setW((op >> 7) & 15, n);
  cpu.flags(C, n ? 0 : C);
}

function readWord(cpu, op) {
  const p = pOf(op), s = sOf(op);
  return p === 0 ? cpu.mem[s] : cpu.rd(srcEA(cpu, p, s, 0), 0);
}

/** The handlers by the instruction word's top byte. */
export function bitOps(ops) {
  for (let t = 0xa0; t <= 0xa7; t++) ops[t] = bitW;
  for (const t of [0xa8, 0xa9, 0xaa, 0xab, 0xac, 0xae, 0xaf]) ops[t] = bitF;
  ops[0xad] = bsw;
  ops[0xdf] = fbcl;
  ops[0xcf] = ff1;
}
