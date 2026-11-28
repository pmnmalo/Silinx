// The PIC24 emulator's program flow (#5480, packages/silinx-pic24/src/exec-flow.js): BRA on each of its 15
// conditions against the conditions' definitions over every N, OV, Z, C, with its cycles (1, 2 taken); BRA, CALL,
// RCALL, GOTO by address and by Wn; RETURN and RETLW (the stack frame, 3 cycles); CPSEQ, CPSNE, CPSGT, CPSLT (signed);
// REPEAT #lit14 and Wn (RCOUNT, RA, the count + 1 executions, #0 a NOP); DISI; PWRSAV; RESET; PUSH.S and POP.S;
// BOOTSWP; NOPR; an undefined condition illegal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exec, cpuWith, set, get, runThrough } from './pic24-lib.mjs';

const C = 1, Z = 2, OV = 4, N = 8;

test('#5480 BRA on each condition, for every N, OV, Z, C: taken as the condition defines it, 2 cycles; else 1', () => {
  const def = {
    ov: (n, v, z, c) => v, c: (n, v, z, c) => c, geu: (n, v, z, c) => c, z: (n, v, z) => z, n: (n) => n,
    le: (n, v, z) => z || n !== v, lt: (n, v) => n !== v, leu: (n, v, z, c) => !c || z, nov: (n, v) => !v,
    nc: (n, v, z, c) => !c, ltu: (n, v, z, c) => !c, nz: (n, v, z) => !z, nn: (n) => !n,
    gt: (n, v, z) => !z && n === v, ge: (n, v) => n === v, gtu: (n, v, z, c) => c && !z,
  };
  for (let sr = 0; sr < 16; sr++) {
    const [n, v, z, c] = [!!(sr & N), !!(sr & OV), !!(sr & Z), !!(sr & C)];
    for (const [cond, f] of Object.entries(def)) {
      const { cpu, cycles } = exec(`bra ${cond}, 0x0300`, { SR: sr });
      const taken = !!f(n, v, z, c);
      assert.deepEqual([cpu.pc, cycles], taken ? [0x300, 2] : [0x202, 1], `bra ${cond} with SR ${sr}`);
    }
  }
  assert.deepEqual([exec('bra 0x01f0').cpu.pc, exec('bra 0x01f0').cycles], [0x1f0, 2]);
  assert.match(exec('.pword 0x3f0000').cpu.log[0].text, /illegal instruction 0x3F0000/);
});

test('#5480 CALL and RETURN: PC+4 pushed (its low word, then PC<22:16>), the target, 2 and 3 cycles; RCALL, RETLW', () => {
  const { cpu } = cpuWith(['call 0x012340', 'nop', '.org 0x012340', 'retlw.b #0x5a, w3'], { org: 0x0200 });
  set(cpu, 'W15', 0x0900); set(cpu, 'W3', 0x1200);
  assert.equal(cpu.step(), 2);
  assert.deepEqual([cpu.pc, cpu.W(15), cpu.mem[0x480], cpu.mem[0x481]], [0x012340, 0x0904, 0x0204, 0x0000]);
  assert.equal(cpu.step(), 3);
  assert.deepEqual([cpu.pc, cpu.W(15), cpu.W(3)], [0x0204, 0x0900, 0x125a]);
  const r = cpuWith(['rcall sub', 'nop', 'sub: return']);
  set(r.cpu, 'W15', 0x0900);
  r.cpu.step();
  assert.deepEqual([r.cpu.pc, r.cpu.mem[0x480]], [r.labels.sub, 0x0202]);
  assert.equal(r.cpu.step(), 3);
  assert.equal(r.cpu.pc, 0x0202);
});

test('#5480 CALL, RCALL, GOTO, BRA by Wn: the address in Wn (PC<22:16> 0), or PC + 2 + 2 * Wn', () => {
  let c = exec('call w4', { W4: 0x0400, W15: 0x0900 });
  assert.deepEqual([c.cpu.pc, c.cycles, c.cpu.mem[0x480]], [0x400, 2, 0x0202]);
  c = exec('goto w4', { W4: 0x0401 });
  assert.equal(c.cpu.pc, 0x400, 'the address\'s bit 0 cleared');
  c = exec('rcall w2', { W2: 0x0010, W15: 0x0900 });
  assert.deepEqual([c.cpu.pc, c.cpu.mem[0x480]], [0x202 + 0x20, 0x0202]);
  c = exec('bra w2', { W2: 0xfffe });
  assert.equal(c.cpu.pc, 0x202 - 4);
});

test('#5480 CPSEQ, CPSNE, CPSGT, CPSLT: signed (a byte\'s too), the next instruction skipped; no flag changed', () => {
  for (const [line, regs, skip] of [
    ['cpseq w1, w2', { W1: 5, W2: 5 }, true], ['cpseq w1, w2', { W1: 5, W2: 6 }, false],
    ['cpsne w1, w2', { W1: 5, W2: 6 }, true], ['cpsgt w1, w2', { W1: 1, W2: 0xffff }, true],
    ['cpslt w1, w2', { W1: 0x8000, W2: 0x7fff }, true], ['cpsgt.b w1, w2', { W1: 0x0001, W2: 0x00ff }, true],
    ['cpslt.b w1, w2', { W1: 0x0101, W2: 0x0001 }, false],
  ]) {
    const { cpu } = cpuWith([line, 'nop', 'nop']);
    for (const [k, v] of Object.entries({ ...regs, SR: 0x10f })) set(cpu, k, v);
    const cycles = cpu.step();
    assert.deepEqual([cpu.pc, cycles, cpu.sr], skip ? [0x204, 2, 0x10f] : [0x202, 1, 0x10f], line);
  }
});

test('#5480 REPEAT #lit14 and REPEAT Wn: RCOUNT, RA, the target count + 1 times, one cycle each; #0 a NOP', () => {
  let { cpu, end } = cpuWith(['repeat #9', 'inc w0, w0', 'nop']);
  set(cpu, 'W0', 0);
  cpu.step();
  assert.deepEqual([get(cpu, 'RCOUNT'), cpu.sr & 0x10, cpu.pc], [9, 0x10, 0x202], 'the manual\'s example 1');
  const cycles = runThrough(cpu, 0x202, 0x204);
  assert.deepEqual([cpu.W(0), cycles, cpu.sr & 0x10, get(cpu, 'RCOUNT')], [10, 10, 0, 0]);
  ({ cpu, end } = cpuWith(['repeat w5', 'clr [w6++]']));
  set(cpu, 'W5', 3); set(cpu, 'W6', 0x1000);
  for (let a = 0x1000; a < 0x1010; a += 2) set(cpu, a, 0xffff);
  runThrough(cpu, 0x200, end);
  assert.deepEqual([cpu.W(6), cpu.mem[0x803], cpu.mem[0x804]], [0x1008, 0, 0xffff]);
  ({ cpu } = cpuWith(['repeat #0', 'inc w0, w0']));
  set(cpu, 'W0', 0);
  cpu.step();
  assert.equal(cpu.sr & 0x10, 0, 'REPEAT #0: RA not set');
  cpu.step();
  assert.deepEqual([cpu.W(0), cpu.pc], [1, 0x204]);
});

test('#5480 DISI #n: DISICNT counts the cycles down, INTCON2\'s DISI while it does', () => {
  const { cpu } = cpuWith(['disi #3', 'nop', 'nop', 'nop', 'nop']);
  cpu.step();
  assert.deepEqual([get(cpu, 'DISICNT'), get(cpu, 'INTCON2') & 0x4000], [3, 0x4000]);
  cpu.step(); cpu.step();
  assert.equal(get(cpu, 'DISICNT'), 1);
  cpu.step();
  assert.deepEqual([get(cpu, 'DISICNT'), get(cpu, 'INTCON2') & 0x4000], [0, 0]);
});

test('#5480 PWRSAV, RESET, CLRWDT, BOOTSWP, NOPR, PUSH.S and POP.S', () => {
  let { cpu } = exec('pwrsav #0');
  assert.equal(cpu.sleeping, 'sleep');
  ({ cpu } = exec('pwrsav #1'));
  assert.equal(cpu.sleeping, 'idle');
  // asleep with nothing to wake it: the cycles go by, the PC stays
  const pc = cpu.pc, c0 = cpu.cycles;
  cpu.run(100);
  assert.deepEqual([cpu.pc, cpu.cycles - c0], [pc, 100]);
  ({ cpu } = exec('reset', { W3: 0x1234, W15: 0x1000 }));
  assert.deepEqual([cpu.pc, cpu.W(3), cpu.W(15), cpu.resetCause], [0, 0, 0x0800, 'RESET instruction']);
  assert.equal(exec('clrwdt').cycles, 1);
  ({ cpu } = exec('bootswp'));
  assert.match(cpu.log[0].text, /BOOTSWP: the dual partitions' swap is not emulated/);
  assert.deepEqual([exec('nopr').cpu.pc, exec('.pword 0xffffff').cpu.pc], [0x202, 0x202], 'NOPR and the erased flash');
  const s = cpuWith(['push.s', 'mov #1, w0', 'mov #2, w3', 'pop.s']);
  for (const [k, v] of Object.entries({ W0: 0xa, W1: 0xb, W2: 0xc, W3: 0xd, SR: 0x10f })) set(s.cpu, k, v);
  for (let i = 0; i < 3; i++) s.cpu.step();
  set(s.cpu, 'SR', 0);
  s.cpu.step();
  assert.deepEqual([s.cpu.W(0), s.cpu.W(1), s.cpu.W(2), s.cpu.W(3), s.cpu.sr], [0xa, 0xb, 0xc, 0xd, 0x10f]);
});

test('#5480 a loop counting down: its cycles by hand (DS70000157\'s counts)', () => {
  // mov #10, w0 (1); loop: dec w0, w0 (1); bra nz, loop (2 taken, 1 the last); then 10 * 3 - 1 + 1 = 30 cycles
  const { cpu, end } = cpuWith(['mov #10, w0', 'loop: dec w0, w0', 'bra nz, loop', 'done: nop']);
  const cycles = runThrough(cpu, 0x200, end - 2);
  assert.deepEqual([cpu.W(0), cycles, cpu.pc], [0, 30, end - 2]);
});
