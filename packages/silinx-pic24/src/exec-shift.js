// silinx-pic24 - the shifts and rotates (#5480, DS70000157 section 5): SL, LSR, ASR, RLC, RLNC, RRC, RRNC on Ws (to
// Wd) and on f (to f or WREG), and the multi-bit SL, LSR, ASR of Wb by Wns or #lit4.

import { src, dst, wrF, nz, nzc } from './operands.js';
import { C, SFR } from './device.js';

const SRW = SFR.SR >> 1;
const bOf = (op) => (op >> 14) & 1;

// by op<17:16> and bit 15: 0 SL, 1 LSR / ASR, 2 RLNC / RLC, 3 RRNC / RRC
const KINDS = [['sl', null], ['lsr', 'asr'], ['rlnc', 'rlc'], ['rrnc', 'rrc']];

function shift1(cpu, kind, v, B) {
  const msb = B ? 0x80 : 0x8000, m = B ? 0xff : 0xffff, cin = cpu.mem[SRW] & C;
  switch (kind) {
    case 'sl': return nzc(cpu, (v << 1) & m, B, v & msb);
    case 'lsr': return nzc(cpu, v >> 1, B, v & 1);
    case 'asr': return nzc(cpu, (v >> 1) | (v & msb), B, v & 1);
    case 'rlc': return nzc(cpu, ((v << 1) & m) | cin, B, v & msb);
    case 'rlnc': return nz(cpu, ((v << 1) & m) | (v & msb ? 1 : 0), B);
    case 'rrc': return nzc(cpu, (v >> 1) | (cin ? msb : 0), B, v & 1);
    default: return nz(cpu, (v >> 1) | (v & 1 ? msb : 0), B);
  }
}

// 0xD0-0xD3: Ws to Wd
function shiftW(cpu, op) {
  const kind = KINDS[(op >> 16) & 3][(op >> 15) & 1];
  if (!kind) return cpu.illegal(op);
  const B = bOf(op), p = (op >> 4) & 7;
  if (p >= 6) return cpu.illegal(op);
  dst(cpu, (op >> 11) & 7, (op >> 7) & 15, B, shift1(cpu, kind, src(cpu, p, op & 15, B), B));
}

// 0xD4-0xD7: f to f (D = 1) or to WREG
function shiftF(cpu, op) {
  const kind = KINDS[(op >> 16) & 3][(op >> 15) & 1];
  if (!kind) return cpu.illegal(op);
  const B = bOf(op), f = op & 0x1fff;
  wrF(cpu, f, B, shift1(cpu, kind, cpu.rd(f, B), B), (op >> 13) & 1);
}

// SL (0xDD), LSR and ASR (0xDE) Wb by Wns<4:0> (op<6:4> = 000) or #lit4 (100) to Wnd: N and Z; by more than 15 a
// shift's 0 (ASR's sign)
function shiftN(cpu, op) {
  const t = op >>> 16, mode = (op >> 4) & 7;
  if ((t === 0xdd && op & 0x8000) || (mode !== 0 && mode !== 4)) return cpu.illegal(op);
  const v = cpu.mem[(op >> 11) & 15], n = mode === 4 ? op & 15 : cpu.mem[op & 15] & 31;
  let r;
  if (t === 0xdd) r = n > 15 ? 0 : (v << n) & 0xffff;
  else if (op & 0x8000) r = ((v << 16 >> 16) >> Math.min(n, 15)) & 0xffff;
  else r = n > 15 ? 0 : v >> n;
  cpu.setW((op >> 7) & 15, nz(cpu, r, 0));
}

/** The handlers by the instruction word's top byte. */
export function shiftOps(ops) {
  for (let t = 0xd0; t <= 0xd3; t++) ops[t] = shiftW;
  for (let t = 0xd4; t <= 0xd7; t++) ops[t] = shiftF;
  ops[0xdd] = ops[0xde] = shiftN;
}
