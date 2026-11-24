// silinx-pic24 - the arithmetic and logic instructions (#5480, DS70000157 section 5): ADD, ADDC, SUB, SUBB, SUBR,
// SUBBR, AND, XOR, IOR in their forms (Wb, Ws, Wd; Wb, #lit5, Wd; #lit10, Wn; f {,WREG}), INC, INC2, DEC, DEC2, NEG,
// COM, CLR, SETM (Ws, Wd; f {,WREG}), CP0, CP, CPB. Each handler is (cpu, op), op the 24-bit instruction word.

import { src, dst, rdF, wrF, add, sub, nz } from './operands.js';

// the fields of the formats (DS70000157 section 5's encodings: Wb www w bits 18-15, B bit 14, qqq 13-11, dddd 10-7, ppp 6-4,
// ssss 3-0; f's B bit 14, D bit 13, f bits 12-0)
const wbOf = (op) => (op >> 15) & 15, bOf = (op) => (op >> 14) & 1, qOf = (op) => (op >> 11) & 7;
const dOf = (op) => (op >> 7) & 15, pOf = (op) => (op >> 4) & 7, sOf = (op) => op & 15;

// the operations by op<23:19> (the three-operand forms) or their index below
const OPN = { 2: 'subr', 3: 'subbr', 8: 'add', 9: 'addc', 10: 'sub', 11: 'subb', 12: 'and', 13: 'xor', 14: 'ior' };

function alu(cpu, kind, a, b, B) {
  const m = B ? 0xff : 0xffff;
  switch (kind) {
    case 'add': return add(cpu, a, b, 0, B);
    case 'addc': return add(cpu, a, b, cpu.carry(), B, true);
    case 'sub': return sub(cpu, a, b, 1, B);
    case 'subb': return sub(cpu, a, b, cpu.carry(), B, true);
    case 'subr': return sub(cpu, b, a, 1, B);
    case 'subbr': return sub(cpu, b, a, cpu.carry(), B, true);
    case 'and': return nz(cpu, a & b & m, B);
    case 'xor': return nz(cpu, (a ^ b) & m, B);
    default: return nz(cpu, (a | b) & m, B);
  }
}

// Wb, Ws, Wd and Wb, #lit5, Wd (ppp = 11x: the literal), Wb's operation with the source
function threeOperand(cpu, op) {
  const B = bOf(op), wb = wbOf(op), p = pOf(op);
  const a = B ? cpu.mem[wb] & 0xff : cpu.mem[wb];
  const b = p >= 6 ? op & 31 : src(cpu, p, sOf(op), B);
  dst(cpu, qOf(op), dOf(op), B, alu(cpu, OPN[op >>> 19], a, b, B));
}

// #lit10, Wn (0xB0-0xB3, bit 15 the second of each pair): Wn's operation with the literal; MOV.B #lit8, Wn
const LIT_OPS = [['add', 'addc'], ['sub', 'subb'], ['and', 'xor'], ['ior', 'movb']];
function literal(cpu, op) {
  const kind = LIT_OPS[(op >> 16) & 3][(op >> 15) & 1], n = op & 15;
  if (kind === 'movb') {
    if (((op >> 12) & 15) !== 12) return cpu.illegal(op);
    cpu.setWB(n, (op >> 4) & 0xff);
    return;
  }
  const B = bOf(op), k = (op >> 4) & 0x3ff;
  const r = alu(cpu, kind, B ? cpu.mem[n] & 0xff : cpu.mem[n], B ? k & 0xff : k, B);
  if (B) cpu.setWB(n, r); else cpu.setW(n, r);
}

// f {,WREG} (0xB4-0xB7, 0xBD): f's operation with WREG (SUB f: f - WREG; SUBR f: WREG - f); MOV WREG, f
const F_OPS = { 0xb4: ['add', 'addc'], 0xb5: ['sub', 'subb'], 0xb6: ['and', 'xor'], 0xb7: ['ior', 'movwf'], 0xbd: ['subr', 'subbr'] };
function fileReg(cpu, op) {
  const kind = F_OPS[op >>> 16][(op >> 15) & 1], B = bOf(op), D = (op >> 13) & 1, f = op & 0x1fff;
  const w = B ? cpu.mem[0] & 0xff : cpu.mem[0];
  if (kind === 'movwf') { if (!D) return cpu.illegal(op); cpu.wr(f, w, B); return; }
  wrF(cpu, f, B, alu(cpu, kind, rdF(cpu, f, B), w, B), D);
}

// INC, INC2, DEC, DEC2, NEG, COM, CLR, SETM: 0xE8-0xEB on Ws (to Wd), 0xEC-0xEF on f (to f or WREG)
const UN_OPS = [['inc', 'inc2'], ['dec', 'dec2'], ['neg', 'com'], ['clr', 'setm']];
function unary(cpu, kind, x, B) {
  const m = B ? 0xff : 0xffff;
  switch (kind) {
    case 'inc': return add(cpu, x, 1, 0, B);
    case 'inc2': return add(cpu, x, 2, 0, B);
    case 'dec': return sub(cpu, x, 1, 1, B);
    case 'dec2': return sub(cpu, x, 2, 1, B);
    case 'neg': return sub(cpu, 0, x, 1, B);
    case 'com': return nz(cpu, ~x & m, B);
    case 'clr': return 0;
    default: return m;
  }
}
function unaryW(cpu, op) {
  const kind = UN_OPS[(op >> 16) & 3][(op >> 15) & 1], B = bOf(op);
  if ((kind === 'clr' || kind === 'setm') && op & 0x7f) return cpu.illegal(op);
  const x = kind === 'clr' || kind === 'setm' ? 0 : src(cpu, pOf(op), sOf(op), B);
  dst(cpu, qOf(op), dOf(op), B, unary(cpu, kind, x, B));
}
function unaryF(cpu, op) {
  const kind = UN_OPS[(op >> 16) & 3][(op >> 15) & 1], B = bOf(op), D = (op >> 13) & 1, f = op & 0x1fff;
  const x = kind === 'clr' || kind === 'setm' ? 0 : rdF(cpu, f, B);
  wrF(cpu, f, B, unary(cpu, kind, x, B), D);
}

// CP0 Ws; CP / CPB Wb, Ws and Wb, #lit5 (their B is bit 10); CP0 f, CP f, CPB f: the flags of a subtraction
function compareW(cpu, op) {
  const B = (op >> 10) & 1, p = pOf(op), s = sOf(op);
  if (op >>> 16 === 0xe0) {
    if (op & 0xfb80) return cpu.illegal(op);
    sub(cpu, src(cpu, p, s, B), 0, 1, B);
    return;
  }
  if (op & 0x0380) return cpu.illegal(op);
  const wb = (op >> 11) & 15, a = B ? cpu.mem[wb] & 0xff : cpu.mem[wb];
  const b = p >= 6 ? op & 31 : src(cpu, p, s, B);
  if (op & 0x8000) sub(cpu, a, b, cpu.carry(), B, true); else sub(cpu, a, b, 1, B);
}
function compareF(cpu, op) {
  const B = bOf(op), f = op & 0x1fff, x = rdF(cpu, f, B), w = B ? cpu.mem[0] & 0xff : cpu.mem[0];
  if (op & 0x2000 || (op >>> 16 === 0xe2 && op & 0x8000)) return cpu.illegal(op);
  if (op >>> 16 === 0xe2) sub(cpu, x, 0, 1, B);
  else if (op & 0x8000) sub(cpu, x, w, cpu.carry(), B, true);
  else sub(cpu, x, w, 1, B);
}

/** The handlers by the instruction word's top byte. */
export function aluOps(ops) {
  for (let t = 0x10; t < 0x20; t++) ops[t] = threeOperand;
  for (let t = 0x40; t < 0x78; t++) ops[t] = threeOperand;
  for (let t = 0xb0; t <= 0xb3; t++) ops[t] = literal;
  for (const t of [0xb4, 0xb5, 0xb6, 0xb7, 0xbd]) ops[t] = fileReg;
  for (let t = 0xe8; t <= 0xeb; t++) ops[t] = unaryW;
  for (let t = 0xec; t <= 0xef; t++) ops[t] = unaryF;
  ops[0xe0] = ops[0xe1] = compareW;
  ops[0xe2] = ops[0xe3] = compareF;
}
