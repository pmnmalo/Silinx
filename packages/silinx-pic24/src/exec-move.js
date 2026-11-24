// silinx-pic24 - the moves (#5480, DS70000157 section 5): MOV in its forms (#lit16; #lit8; f; Wns to f; Ws to Wd;
// [Ws + Slit10]; WREG to f is exec-alu.js's), MOV.D, PUSH and POP f, LNK and ULNK, EXCH, SWAP, SE,
// ZE, DAW.B, the table reads and writes (TBLRDL, TBLRDH, TBLWTL, TBLWTH).

import { src, srcEA, dst, dstEA, nz, nzc, sext8 } from './operands.js';
import { C, DC, SFR } from './device.js';

const SRW = SFR.SR >> 1;
const bOf = (op) => (op >> 14) & 1, qOf = (op) => (op >> 11) & 7, dOf = (op) => (op >> 7) & 15;
const pOf = (op) => (op >> 4) & 7, sOf = (op) => op & 15;

// MOV #lit16, Wnd (0x2): its 16 bits at op<19:4>
function movLit16(cpu, op) { cpu.setW(op & 15, (op >> 4) & 0xffff); }

// MOV{.B} Ws, Wd (0x78-0x7F): any source and destination mode, [Ws+Wb] and [Wd+Wb] with op<18:15>'s Wb
function movWsWd(cpu, op) {
  const B = bOf(op), wb = (op >> 15) & 15;
  cpu.psvCost = 1;
  dst(cpu, qOf(op), dOf(op), B, src(cpu, pOf(op), sOf(op), B, wb), wb);
}

// MOV f, Wnd (0x80-0x87) and MOV Wns, f (0x88-0x8F): f<15:1> at op<19:4>, a word's
function movF(cpu, op) {
  const f = ((op >> 4) & 0x7fff) << 1, n = op & 15;
  if (op & 0x080000) cpu.wr(f, cpu.mem[n], 0);
  else cpu.setW(n, cpu.rd(f, 0));
}

// MOV f {,WREG} (0xBF, bit 15 set): N and Z of f's value, written to WREG (D = 0) or to f again (D = 1)
function movFWreg(cpu, op) {
  if (!(op & 0x8000)) return cpu.illegal(op);
  const B = bOf(op), f = op & 0x1fff, v = nz(cpu, cpu.rd(f, B), B);
  if (op & 0x2000) cpu.wr(f, v, B);
  else if (B) cpu.setWB(0, v); else cpu.setW(0, v);
}

// MOV [Ws + Slit10], Wnd (0x90-0x97) and MOV Wns, [Wd + Slit10] (0x98-0x9F): the literal's bits at op<18:15>,
// op<13:11> and op<6:4>; a word's offset is twice it
function slit10(op, B) {
  const k = (((op >> 15) & 15) << 6) | (((op >> 11) & 7) << 3) | ((op >> 4) & 7);
  const s = k & 0x200 ? k - 0x400 : k;
  return B ? s : s * 2;
}
function movOffset(cpu, op) {
  const B = bOf(op), d = dOf(op), s = sOf(op), off = slit10(op, B);
  if (op & 0x080000) {
    const ea = (cpu.ptr(d, false) + off) & 0xffff;
    if (d === 15) cpu.stackCheck(ea);
    cpu.wr(ea, B ? cpu.mem[s] & 0xff : cpu.mem[s], B);
  } else {
    cpu.psvCost = 1;
    const ea = (cpu.ptr(s, true) + off) & 0xffff;
    if (s === 15) cpu.stackCheck(ea);
    const v = cpu.rd(ea, B);
    if (B) cpu.setWB(d, v); else cpu.setW(d, v);
  }
}

// MOV.D (0xBE): Ws to Wnd:Wnd+1 (bit 15 clear: Wnd = op<10:8> * 2) and Wns:Wns+1 to Wd (bit 15 set: Wns = op<3:1> * 2);
// an indirect pointer moves by 4; two cycles
function movD(cpu, op) {
  cpu.cyc = 2;
  cpu.psvCost = 1;
  if (!(op & 0x8000)) {
    if (op & 0x7880) return cpu.illegal(op);
    const n = ((op >> 8) & 7) * 2, p = pOf(op), s = sOf(op);
    let lo, hi;
    if (p === 0) { lo = cpu.mem[s & 14]; hi = cpu.mem[(s & 14) + 1]; }
    else { const ea = srcEA(cpu, p, s, 0, -1, 4); lo = cpu.rd(ea, 0); hi = cpu.rd((ea + 2) & 0xffff, 0); }
    cpu.setW(n, lo);
    cpu.setW(n + 1, hi);
    return;
  }
  if ((op & 0x4071) !== 0) return cpu.illegal(op);
  const n = ((op >> 1) & 7) * 2, q = qOf(op), d = dOf(op), lo = cpu.mem[n], hi = cpu.mem[n + 1];
  if (q === 0) { cpu.setW(d & 14, lo); cpu.setW((d & 14) + 1, hi); return; }
  const ea = dstEA(cpu, q, d, 0, -1, 4);
  cpu.wr(ea, lo, 0);
  cpu.wr((ea + 2) & 0xffff, hi, 0);
}

// PUSH f (0xF8) and POP f (0xF9): f a word's address, op<15:1>
function pushPopF(cpu, op) {
  const f = op & 0xfffe;
  if (op & 1) return cpu.illegal(op);
  if (op >>> 16 === 0xf8) cpu.push(cpu.rd(f, 0));
  else cpu.wr(f, cpu.pop(), 0);
}

// LNK #lit14 (0xFA, bit 15 clear): W14 pushed, W14 = W15, W15 += lit14; ULNK (0xFA8000): W15 = W14, W14 popped
function lnk(cpu, op) {
  if (op === 0xfa8000) { cpu.setW(15, cpu.mem[14]); cpu.setW(14, cpu.pop()); return; }
  if (op & 0xc001) return cpu.illegal(op);
  cpu.push(cpu.mem[14]);
  cpu.setW(14, cpu.mem[15]);
  cpu.setW(15, cpu.mem[15] + (op & 0x3ffe));
}

// SE Ws, Wnd (0xFB, bit 15 clear): a byte sign-extended, N, Z and C = !N; ZE (bit 15 set): zero-extended, N clear,
// C set (the source a byte: its pointer moves by 1)
function seZe(cpu, op) {
  if (op & 0x7800) return cpu.illegal(op);
  const b = src(cpu, pOf(op), sOf(op), 1), d = dOf(op);
  if (op & 0x8000) { cpu.setW(d, b); nzc(cpu, b, 0, 1); return; }
  const v = sext8(b) & 0xffff;
  cpu.setW(d, v);
  nzc(cpu, v, 0, !(v & 0x8000));
}

// EXCH Wns, Wnd; DAW.B Wn; SWAP{.B} Wn (0xFD)
function fd(cpu, op) {
  const s = op & 15;
  if ((op & 0xfff870) === 0xfd0000) {
    const d = dOf(op), a = cpu.mem[s], b = cpu.mem[d];
    cpu.setW(d, a);
    cpu.setW(s, b);
    return;
  }
  if ((op & 0xfffff0) === 0xfd4000) {
    // the decimal adjust of a BCD addition's byte (DS70000157 DAW.B): +6 to a digit above 9 or with its carry
    const sr = cpu.mem[SRW];
    let v = cpu.mem[s] & 0xff, c = sr & C;
    if ((v & 0xf) > 9 || sr & DC) v += 6;
    if (v > 0x9f || c || (v >> 4) > 9) { v += 0x60; c = C; }
    if (v > 0xff) c = C;
    cpu.setWB(s, v);
    cpu.flags(C, c);
    return;
  }
  if ((op & 0xffbff0) === 0xfd8000) {
    const v = cpu.mem[s];
    if (op & 0x4000) cpu.setWB(s, ((v & 0x0f) << 4) | ((v >> 4) & 0x0f));
    else cpu.setW(s, ((v & 0xff) << 8) | (v >> 8));
    return;
  }
  cpu.illegal(op);
}

// the table reads (0xBA: TBLRDL bit 15 clear, TBLRDH set) and writes (0xBB): the program address TBLPAG:EA, two
// cycles. A read's source and a write's destination are indirect. A write goes to the write latches (the NVM
// controller programs them, #5481), read back by the table reads until then.
function table(cpu, op) {
  cpu.cyc = 2;
  const B = bOf(op), high = (op >> 15) & 1, page = cpu.mem[SFR.TBLPAG >> 1];
  if (op >>> 16 === 0xba) {
    const p = pOf(op);
    if (p === 0 || p >= 6) return cpu.illegal(op);
    const ea = srcEA(cpu, p, sOf(op), B), addr = (page << 16) | (ea & 0xfffe), word = tableWord(cpu, addr);
    let v;
    if (high) v = B && ea & 1 ? 0 : (word >> 16) & 0xff;
    else v = B ? (ea & 1 ? (word >> 8) & 0xff : word & 0xff) : word & 0xffff;
    dst(cpu, qOf(op), dOf(op), B, v);
    return;
  }
  const q = qOf(op);
  if (q === 0 || q >= 6) return cpu.illegal(op);
  const v = src(cpu, pOf(op), sOf(op), B), ea = dstEA(cpu, q, dOf(op), B), addr = (page << 16) | (ea & 0xfffe);
  if (page & 0x80) { cpu.say('warning', 'TBLWT to the configuration space: not allowed (table reads only)', 'tblwt-config'); return; }
  let word = tableWord(cpu, addr);
  if (high) { if (!(B && ea & 1)) word = (word & 0x00ffff) | ((v & 0xff) << 16); }
  else if (B) word = ea & 1 ? (word & 0xff00ff) | ((v & 0xff) << 8) : (word & 0xffff00) | (v & 0xff);
  else word = (word & 0xff0000) | (v & 0xffff);
  cpu.latches.set(addr, word);
}
function tableWord(cpu, addr) { return cpu.latches.get(addr) ?? cpu.progWord(addr); }

/** The handlers by the instruction word's top byte. */
export function moveOps(ops) {
  for (let t = 0x20; t < 0x30; t++) ops[t] = movLit16;
  for (let t = 0x78; t < 0x80; t++) ops[t] = movWsWd;
  for (let t = 0x80; t < 0x90; t++) ops[t] = movF;
  for (let t = 0x90; t < 0xa0; t++) ops[t] = movOffset;
  ops[0xba] = ops[0xbb] = table;
  ops[0xbe] = movD;
  ops[0xbf] = movFWreg;
  ops[0xf8] = ops[0xf9] = pushPopF;
  ops[0xfa] = lnk;
  ops[0xfb] = seZe;
  ops[0xfd] = fd;
}
