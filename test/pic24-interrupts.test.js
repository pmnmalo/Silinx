// The PIC24 emulator's interrupt controller (#5480, packages/silinx-pic24/src/interrupts.js, DS30010074 section 8):
// a request taken when its flag and enable are set and its priority is above the CPU's IPL, GIE set; the highest
// priority first, the natural order (the lowest vector) among equals; the vector table; the stack frame and RETFIE's
// return (SRL, IPL3, RA); nesting, NSTDIS; DISI holding priorities 1-6; the traps above every interrupt and their
// order; INTTREG; a REPEAT interrupted and resumed; the entry's and the return's cycles; a sleep woken.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpuWith, set, get } from './pic24-lib.mjs';
import { ENTRY_CYCLES, irqPriority } from '../packages/silinx-pic24/src/index.js';

const IFS0 = 0x88, IEC0 = 0x98, IPC0 = 0xa8;

// a program at 0x200 (W15 at 0x900) with ISRs: each vector of `isrs` ({ irq: address }) and its code at that address
function withIsrs(main, isrs = {}, traps = {}) {
  const program = [];
  for (const [n, a] of Object.entries(isrs)) program[(0x14 + 2 * +n) >> 1] = a;
  for (const [n, a] of Object.entries(traps)) program[(0x04 + 2 * +n) >> 1] = a;
  const r = cpuWith(main, { program });
  set(r.cpu, 'W15', 0x0900);
  return r;
}

const isr = (name, body) => [`.org ${name}`, ...body, 'retfie'];

test('#5480 an interrupt: flag, enable, a priority above the IPL; its vector, the frame (PC, SRL, IPL3), the IPL raised, INTTREG', () => {
  const { cpu } = withIsrs(['nop', 'nop', ...isr('0x400', ['inc w5, w5'])], { 3: 0x400 });
  set(cpu, 'SR', 0x0005);
  set(cpu, IPC0, 0x5000);   // T1 (IRQ 3) at priority 5
  set(cpu, IEC0, 1 << 3);
  cpu.step();
  cpu.raise(3);
  const c0 = cpu.cycles;
  cpu.step();
  assert.equal(cpu.cycles - c0, ENTRY_CYCLES);
  assert.deepEqual([cpu.pc, cpu.ipl, get(cpu, 'INTTREG')], [0x400, 5, (5 << 8) | 11], 'IRQ 3 is vector number 11');
  assert.deepEqual([cpu.mem[0x480], cpu.mem[0x481]], [0x0202, 0x0500], 'PC 0x0202, then SRL 0x05 and PC<22:16> 0');
  cpu.step();
  // RETFIE: 3 cycles, the SRL (IPL 0) restored; the flag still set (the ISR's to clear): taken again at once (2)
  assert.equal(cpu.step(), 2);
  assert.deepEqual([cpu.pc, cpu.ipl, cpu.sr & 0xff, cpu.W(15)], [0x0202, 0, 0x05, 0x0900]);
  set(cpu, IFS0, 0);
  cpu.step();
  assert.equal(cpu.pc, 0x0204);
});

test('#5480 not taken: its enable clear, its priority 0 or not above the IPL, GIE clear; IPL 7 masks every interrupt', () => {
  for (const [what, regs] of [
    ['no enable', { [IEC0]: 0 }], ['priority 0', { [IPC0]: 0x0000 }], ['IPL 4', { SR: 4 << 5 }],
    ['GIE clear', { INTCON2: 0 }], ['IPL 7', { SR: 7 << 5, [IPC0]: 0x7000 }],
  ]) {
    const { cpu } = withIsrs(['nop', 'nop'], { 3: 0x400 });
    set(cpu, IPC0, 0x4000); set(cpu, IEC0, 1 << 3); set(cpu, IFS0, 1 << 3);
    for (const [k, v] of Object.entries(regs)) set(cpu, /^\d+$/.test(k) ? +k : k, v);
    cpu.step();
    assert.equal(cpu.pc, 0x202, what);
  }
});

test('#5480 the order: the highest priority first; among equals the natural order (the lower IRQ); nesting, NSTDIS', () => {
  const { cpu } = withIsrs(['nop', 'nop'], { 0: 0x400, 1: 0x500, 3: 0x600 });
  set(cpu, IPC0, 0x3044);   // INT0 4, IC1 4, T1 3
  set(cpu, IEC0, 0b1011); set(cpu, IFS0, 0b1011);
  cpu.step();
  assert.equal(cpu.pc, 0x400, 'INT0 before IC1 (both 4), before T1 (3)');
  // nesting: T1 raised to 6 preempts INT0's handler (IPL 4)
  set(cpu, IPC0, 0x6044);
  cpu.step();
  assert.deepEqual([cpu.pc, cpu.ipl], [0x600, 6]);
  // NSTDIS: an interrupt raises the IPL to 7, nothing nests
  const n = withIsrs(['nop'], { 0: 0x400, 3: 0x600 });
  set(n.cpu, 'INTCON1', 0x8000); set(n.cpu, IPC0, 0x6001); set(n.cpu, IEC0, 0b1001); set(n.cpu, IFS0, 0b0001);
  n.cpu.step();
  assert.deepEqual([n.cpu.pc, n.cpu.ipl], [0x400, 7]);
  set(n.cpu, IFS0, 0b1001);
  n.cpu.step();
  assert.notEqual(n.cpu.pc, 0x600);
  assert.equal(irqPriority(n.cpu, 3), 6);
});

test('#5480 DISI holds priorities 1-6 for its cycles; a priority-7 interrupt is taken', () => {
  const { cpu } = withIsrs(['disi #2', 'nop', 'nop', 'nop', 'nop'], { 3: 0x400 });
  set(cpu, IPC0, 0x6000); set(cpu, IEC0, 1 << 3);
  cpu.step();
  cpu.raise(3);
  cpu.step();
  assert.equal(cpu.pc, 0x204, 'held');
  cpu.step();
  cpu.step();
  assert.equal(cpu.pc, 0x400, 'DISICNT at 0: taken');
  const s = withIsrs(['disi #100', 'nop'], { 3: 0x400 });
  set(s.cpu, IPC0, 0x7000); set(s.cpu, IEC0, 1 << 3);
  s.cpu.step();
  s.cpu.raise(3);
  s.cpu.step();
  assert.equal(s.cpu.pc, 0x400);
});

test('#5480 the traps: above every interrupt, their own priorities (an address error before a stack error), GIE no matter', () => {
  const { cpu } = withIsrs(['nop', 'nop'], { 3: 0x400 }, { 1: 0x700, 3: 0x800 });
  set(cpu, IPC0, 0x7000); set(cpu, IEC0, 1 << 3); set(cpu, IFS0, 1 << 3); set(cpu, 'INTCON2', 0);
  cpu.trap(3); cpu.trap(1);
  cpu.step();
  assert.deepEqual([cpu.pc, cpu.ipl, get(cpu, 'INTTREG')], [0x700, 13, (13 << 8) | 1]);
  // inside the address error's handler (IPL 13) the stack error (12) waits
  cpu.step();
  assert.equal(cpu.pc, 0x702);
  assert.equal(get(cpu, 'INTCON1') & 0x08, 0x08);
  // INTCON2's SWTRAP: the software trap; INTCON4's SGHT: the hardware one
  const sw = withIsrs(['mov #0xa000, w0', 'mov w0, 0x0082', 'nop'], {}, { 6: 0x900 });
  sw.cpu.step(); sw.cpu.step(); sw.cpu.step();
  assert.equal(sw.cpu.pc, 0x900);
});

test('#5480 a REPEAT interrupted: the target\'s PC and RA stacked, RCOUNT kept; RETFIE resumes it to its count', () => {
  const { cpu } = withIsrs(['repeat #9', 'inc w0, w0', 'nop', ...isr('0x400', ['inc w7, w7'])], { 3: 0x400 });
  set(cpu, 'W0', 0); set(cpu, 'W7', 0);
  set(cpu, IPC0, 0x4000); set(cpu, IEC0, 1 << 3);
  cpu.step(); cpu.step(); cpu.step(); cpu.step();   // REPEAT, then 3 of the 10
  cpu.raise(3);
  cpu.step();
  assert.deepEqual([cpu.pc, cpu.sr & 0x10, get(cpu, 'RCOUNT'), cpu.mem[0x481] >> 8 & 0x10], [0x400, 0, 6, 0x10]);
  cpu.step();
  set(cpu, IFS0, 0);
  cpu.step();   // RETFIE
  assert.deepEqual([cpu.pc, cpu.sr & 0x10], [0x202, 0x10]);
  for (let i = 0; i < 7; i++) cpu.step();
  assert.deepEqual([cpu.W(0), cpu.W(7), cpu.pc, cpu.sr & 0x10], [10, 1, 0x204, 0]);
});

test('#5480 PWRSAV: an interrupt wakes the CPU and is taken; one at a priority not above the IPL wakes it to go on', () => {
  const { cpu } = withIsrs(['pwrsav #0', 'inc w1, w1', ...isr('0x400', ['inc w2, w2'])], { 3: 0x400 });
  set(cpu, 'W1', 0); set(cpu, 'W2', 0);
  set(cpu, IPC0, 0x4000); set(cpu, IEC0, 1 << 3);
  cpu.step();
  cpu.addClockEvent(() => cpu.raise(3), 50);
  cpu.step();
  assert.equal(cpu.sleeping, 'sleep');
  while (cpu.pc !== 0x400) cpu.step();
  assert.ok(cpu.cycles >= 51 && cpu.sleeping === null);
  const w = withIsrs(['pwrsav #1', 'inc w1, w1'], { 3: 0x400 });
  set(w.cpu, 'SR', 5 << 5); set(w.cpu, IPC0, 0x4000); set(w.cpu, IEC0, 1 << 3); set(w.cpu, 'W1', 0);
  w.cpu.step();
  w.cpu.raise(3);
  w.cpu.step();   // (woken, and the next instruction run in the same step)
  assert.deepEqual([w.cpu.sleeping, w.cpu.W(1), w.cpu.pc], [null, 1, 0x204]);
});
