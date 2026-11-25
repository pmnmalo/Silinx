// silinx-pic24 - the program flow (#5480, DS70000157 section 5): NOP and NOPR; BRA (always, on a condition, Wn), CALL,
// RCALL, GOTO (an address, Wn); RETURN, RETLW, RETFIE; REPEAT; CPSEQ, CPSNE, CPSGT, CPSLT; DISI; and the control
// instructions RESET, PWRSAV, CLRWDT, BOOTSWP, PUSH.S, POP.S. A change of the PC takes 2 cycles (the second a NOP),
// a return 3 (2 when an exception is pending).

import { skipNext } from './exec-bit.js';
import { pushPopShadow } from './exec-move.js';
import { nextException, returnFromException } from './interrupts.js';
import { C, Z, OV, N, RA, SFR, DISI_BIT } from './device.js';

const SRW = SFR.SR >> 1;
const s16 = (v) => (v << 16) >> 16;
const rel = (cpu, n) => (cpu.npc + 2 * n) & 0x7ffffe;   // (PC + 2) + 2 * Slit16

// the conditions of BRA (0x30-0x3E, by op<19:16>): OV, C (GEU), Z, N, LE, LT, LEU, always, NOV, NC (LTU), NZ, NN, GT,
// GE, GTU
const COND = [
  (s) => s & OV, (s) => s & C, (s) => s & Z, (s) => s & N,
  (s) => s & Z || !(s & N) !== !(s & OV), (s) => !(s & N) !== !(s & OV), (s) => !(s & C) || s & Z, () => true,
  (s) => !(s & OV), (s) => !(s & C), (s) => !(s & Z), (s) => !(s & N),
  (s) => !(s & Z) && !(s & N) === !(s & OV), (s) => !(s & N) === !(s & OV), (s) => s & C && !(s & Z),
];
function bra(cpu, op) {
  const c = (op >> 16) & 15;
  if (c === 15) return cpu.illegal(op);
  if (COND[c](cpu.mem[SRW])) { cpu.npc = rel(cpu, s16(op)); cpu.cyc = 2; }
}

// a return address pushed as CALL does (PC<15:0>, then PC<22:16>: DS30010074 figure 4-7)
function pushPC(cpu, pc) {
  cpu.push(pc & 0xffff);
  cpu.push((pc >> 16) & 0x7f);
}
function popPC(cpu) {
  const hi = cpu.pop(), lo = cpu.pop();
  return ((hi & 0x7f) << 16) | (lo & 0xfffe);
}

// CALL / GOTO lit23 (0x02, 0x04): two words, the address's bits 15:1 in the first, 22:16 in the second's 6:0
function callGoto(cpu, op) {
  if (op & 1) return cpu.illegal(op);
  const w2 = cpu.progWord(cpu.npc), target = ((w2 & 0x7f) << 16) | (op & 0xfffe), ret = (cpu.npc + 2) & 0x7ffffe;
  if (op >>> 16 === 0x02) pushPC(cpu, ret);
  cpu.npc = target;
  cpu.cyc = 2;
}

// RCALL Slit16 (0x07)
function rcall(cpu, op) {
  pushPC(cpu, cpu.npc);
  cpu.npc = rel(cpu, s16(op));
  cpu.cyc = 2;
}

// CALL Wn, RCALL Wn, GOTO Wn, BRA Wn (0x01: op<15:4> 0x000, 0x200, 0x400, 0x600)
function computed(cpu, op) {
  const w = cpu.mem[op & 15];
  cpu.cyc = 2;
  switch (op & 0xfff0) {
    case 0x0000: pushPC(cpu, cpu.npc); cpu.npc = w & 0xfffe; return;
    case 0x2000: pushPC(cpu, cpu.npc); cpu.npc = rel(cpu, s16(w)); return;
    case 0x4000: cpu.npc = w & 0xfffe; return;
    case 0x6000: cpu.npc = rel(cpu, s16(w)); return;
    default: cpu.illegal(op);
  }
}

// 3 cycles, 2 when an exception is pending at its end
function returned(cpu) {
  cpu.irq = nextException(cpu);
  cpu.cyc = cpu.irq ? 2 : 3;
}

// RETURN (0x060000), RETFIE (0x064000)
function ret(cpu, op) {
  if (op === 0x060000) cpu.npc = popPC(cpu);
  else if (op === 0x064000) returnFromException(cpu);
  else return cpu.illegal(op);
  returned(cpu);
}

// RETLW{.B} #lit10, Wn (0x05)
function retlw(cpu, op) {
  if (op & 0x8000) return cpu.illegal(op);
  const k = (op >> 4) & 0x3ff, n = op & 15;
  cpu.npc = popPC(cpu);
  if (op & 0x4000) cpu.setWB(n, k); else cpu.setW(n, k);
  returned(cpu);
}

// REPEAT #lit14 (0x09, op<15:14> = 00) and REPEAT Wn (op<15:4> = 0x800): the next instruction count + 1 times; a
// count of 0 a NOP (RA not set)
function repeat(cpu, op) {
  let k;
  if ((op & 0xc000) === 0) k = op & 0x3fff;
  else if ((op & 0xfff0) === 0x8000) k = cpu.mem[op & 15] & 0x3fff;
  else return cpu.illegal(op);
  if (!k) return;
  cpu.mem[SFR.RCOUNT >> 1] = k;
  cpu.mem[SRW] |= RA;
  cpu.repFirst = true;
}

// CPSGT, CPSLT (0xE6), CPSNE, CPSEQ (0xE7): Wb against Wn (signed), the next instruction skipped when it holds; no
// flag changed (B at bit 10)
function cps(cpu, op) {
  if (op & 0x03f0) return cpu.illegal(op);
  const B = (op >> 10) & 1, wb = cpu.mem[(op >> 11) & 15], wn = cpu.mem[op & 15];
  const a = B ? (wb << 24) >> 24 : s16(wb), b = B ? (wn << 24) >> 24 : s16(wn);
  const kind = ((op >> 16) & 1) * 2 + ((op >> 15) & 1);   // 0 GT, 1 LT, 2 NE, 3 EQ
  if ([a > b, a < b, a !== b, a === b][kind]) skipNext(cpu);
}

// DISI #lit14 (0xFC): the interrupts of priority 1 to 6 held for lit14 + 1 cycles (DISICNT counts them down)
function disi(cpu, op) {
  if (op & 0xc000) return cpu.illegal(op);
  cpu.mem[SFR.DISICNT >> 1] = (op & 0x3fff) + 1;
  cpu.mem[SFR.INTCON2 >> 1] |= DISI_BIT;
  cpu.intDirty = true;
}

// 0xFE: RESET, BOOTSWP, PWRSAV #lit1 (0 Sleep, 1 Idle), CLRWDT, POP.S, PUSH.S
function control(cpu, op) {
  if (pushPopShadow(cpu, op)) return;
  if (op === 0xfe0000) { cpu.reset('RESET instruction'); cpu.npc = 0; return; }
  if (op === 0xfe6000) { cpu.onClrwdt?.(); return; }   // (the watchdog's, wdt.js)
  if (op === 0xfe2000) {
    cpu.cyc = 2;
    cpu.say('warning', 'BOOTSWP: the dual partitions\' swap is not emulated', 'bootswp');
    return;
  }
  if ((op & 0xfffffe) === 0xfe4000) { cpu.sleeping = op & 1 ? 'idle' : 'sleep'; cpu.intDirty = true; cpu.onPwrsav?.(cpu.sleeping); return; }
  cpu.illegal(op);
}

function nop() {}

/** The handlers by the instruction word's top byte. */
export function flowOps(ops) {
  ops[0x00] = nop;
  ops[0xff] = nop;   // NOPR (and the erased flash's 0xFFFFFF)
  ops[0x01] = computed;
  ops[0x02] = ops[0x04] = callGoto;
  ops[0x05] = retlw;
  ops[0x06] = ret;
  ops[0x07] = rcall;
  ops[0x09] = repeat;
  for (let t = 0x30; t < 0x40; t++) ops[t] = bra;
  ops[0xe6] = ops[0xe7] = cps;
  ops[0xfc] = disi;
  ops[0xfe] = control;
}
