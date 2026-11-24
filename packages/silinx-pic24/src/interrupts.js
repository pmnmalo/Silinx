// silinx-pic24 - the interrupt controller (#5480, DS30010074 section 8): the traps and the 118 interrupt requests,
// their priorities against the CPU's IPL, the vector table, the exception's entry (its stack frame) and RETFIE's
// return (exec-flow.js's). A peripheral (#5481) requests an interrupt by setting its flag: cpu.raise(n), or its IFSx bit written.

import { SFR, TRAPS, IRQS, irqVector, GIE, DISI_BIT, NSTDIS, RA, IPL3 } from './device.js';

const SRW = SFR.SR >> 1, CORW = SFR.CORCON >> 1;
const IFS = SFR.IFS0 >> 1, IEC = SFR.IEC0 >> 1, IPC = SFR.IPC0 >> 1;

// the cycles from an instruction's end to the first of its handler's (DS70000157 3.2.1 counts RETFIE's; the entry's
// latency is the family reference manual's, checked against MPLAB X's simulator in #5483)
export const ENTRY_CYCLES = 4;

/** IRQ n's priority (0: disabled), from its IPCx bits. */
export function irqPriority(cpu, n) {
  return (cpu.mem[IPC + (n >> 2)] >> ((n & 3) * 4)) & 7;
}
export function irqFlag(cpu, n) { return (cpu.mem[IFS + (n >> 4)] >> (n & 15)) & 1; }
export function irqEnabled(cpu, n) { return (cpu.mem[IEC + (n >> 4)] >> (n & 15)) & 1; }

/** IRQ n's flag set (a peripheral's event) or cleared. */
export function setIrqFlag(cpu, n, on = true) {
  if (!(n >= 0 && n < IRQS)) throw new Error(`no interrupt request ${n}`);
  const w = IFS + (n >> 4), b = 1 << (n & 15);
  cpu.mem[w] = on ? cpu.mem[w] | b : cpu.mem[w] & ~b;
  cpu.intDirty = true;
}

// the exception to take at this instruction boundary, or null: the trap of the highest priority above the CPU's IPL;
// else, interrupts enabled (GIE), the flagged and enabled request of the highest priority above it (the lowest
// vector first among equals: the natural order), priorities 1-6 held while DISI counts
export function nextException(cpu) {
  cpu.intDirty = false;
  const ipl = cpu.ipl;
  if (cpu.trapReq) {
    let best = -1;
    for (let n = 0; n < TRAPS.length; n++)
      if ((cpu.trapReq >> n) & 1 && TRAPS[n].priority > ipl && (best < 0 || TRAPS[n].priority > TRAPS[best].priority)) best = n;
    if (best >= 0) return { trap: best, priority: TRAPS[best].priority, vector: TRAPS[best].vector };
  }
  const intcon2 = cpu.mem[SFR.INTCON2 >> 1];
  if (!(intcon2 & GIE) || ipl >= 7) return null;
  const disi = (intcon2 & DISI_BIT) !== 0;
  let best = -1, bp = 0;
  for (let k = 0; k < 8; k++) {
    let m = cpu.mem[IFS + k] & cpu.mem[IEC + k];
    while (m) {
      const bit = 31 - Math.clz32(m & -m), n = k * 16 + bit;
      m &= m - 1;
      const p = irqPriority(cpu, n);
      if (p > ipl && p > bp && !(disi && p < 7)) { best = n; bp = p; }
    }
  }
  if (best < 0) {
    // asleep, an enabled request at a priority not above the IPL wakes the CPU without its vector
    if (cpu.sleeping && wakes(cpu)) cpu.sleeping = null;
    return null;
  }
  return { irq: best, priority: bp, vector: irqVector(best) };
}

function wakes(cpu) {
  for (let k = 0; k < 8; k++) {
    let m = cpu.mem[IFS + k] & cpu.mem[IEC + k];
    for (; m; m &= m - 1) if (irqPriority(cpu, k * 16 + 31 - Math.clz32(m & -m)) > 0) return true;
  }
  return false;
}

// the entry (DS30010074 4.2.6): PC<15:0>, then SRL, IPL3 and PC<22:16> pushed; the IPL raised to the exception's
// (to 7 for an interrupt while nesting is disabled), RA cleared; INTTREG's ILR and VECNUM; the vector's address
export function enterException(cpu, e) {
  const pc = cpu.pc, sr = cpu.mem[SRW];
  cpu.dmask = 0;
  cpu.push(pc & 0xffff);
  cpu.push(((sr & 0xff) << 8) | (cpu.mem[CORW] & IPL3 ? 0x80 : 0) | ((pc >> 16) & 0x7f));
  cpu.mem[SRW] &= ~RA;
  if (e.trap != null) {
    cpu.trapReq &= ~(1 << e.trap);
    cpu.mem[SFR.INTCON1 >> 1] |= TRAPS[e.trap].flag;
    cpu.ipl = e.priority;
    cpu.mem[SFR.INTTREG >> 1] = (e.priority << 8) | e.trap;
  } else {
    cpu.ipl = cpu.mem[SFR.INTCON1 >> 1] & NSTDIS ? 7 : e.priority;
    cpu.mem[SFR.INTTREG >> 1] = (e.priority << 8) | (e.irq + 8);
  }
  cpu.pc = cpu.progWord(e.vector) & 0x7ffffe;
  cpu.cycles += ENTRY_CYCLES;
  cpu.intDirty = true;
}

/** RETFIE's return (DS70000157 RETFIE): the frame popped, SRL, IPL3 and the PC restored. */
export function returnFromException(cpu) {
  const hi = cpu.pop(), lo = cpu.pop();
  cpu.mem[SRW] = (cpu.mem[SRW] & 0xff00) | (hi >> 8);
  cpu.mem[CORW] = (cpu.mem[CORW] & ~IPL3) | (hi & 0x80 ? IPL3 : 0);
  cpu.npc = ((hi & 0x7f) << 16) | (lo & 0xfffe);
  cpu.intDirty = true;
}
