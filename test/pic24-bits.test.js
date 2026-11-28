// The PIC24 emulator's bit, shift, multiply and divide instructions (#5480, packages/silinx-pic24/src/exec-bit.js,
// exec-shift.js, exec-muldiv.js): BSET, BCLR, BTG, BTST, BTSTS, BSW on Ws and on f; FBCL, FF1L, FF1R; the shifts and
// rotates in both modes and by Wns / #lit4; MUL.UU / US / SU / SS and MUL f against the integers' products; the
// iterative DIV.S / U / SD / UD as REPEAT #17's target against the integers' quotients and remainders, their
// flags, their cycles (18 + REPEAT's 1), a divide by zero's math error trap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exec, cpuWith, set, runThrough, hex4 } from './pic24-lib.mjs';

const C = 1, Z = 2, OV = 4, N = 8;

test('#5480 BSET, BCLR, BTG on Ws (byte and word, indirect too) and on f (a byte\'s bit as its word\'s)', () => {
  assert.equal(exec('bset w1, #15', { W1: 0 }).cpu.W(1), 0x8000);
  assert.equal(exec('bclr.b w1, #7', { W1: 0xffff }).cpu.W(1), 0xff7f);
  assert.equal(exec('btg [w1++], #0', { W1: 0x1000, 'Data 1000': 0x00ff }).cpu.mem[0x800], 0x00fe);
  assert.equal(exec('bset.b [w1], #3', { W1: 0x1001, 'Data 1000': 0 }).cpu.mem[0x800], 0x0800);
  assert.equal(exec('bset.b 0x1001, #3', { 'Data 1000': 0 }).cpu.mem[0x800], 0x0800);
  assert.equal(exec('bclr 0x1000, #12', { 'Data 1000': 0xffff }).cpu.mem[0x800], 0xefff);
  assert.equal(exec('btg 0x1000, #1', { 'Data 1000': 0x0002, SR: 0x10f }).cpu.sr, 0x10f, 'no flag changed');
});

test('#5480 BTST, BTSTS (.Z: Z the bit\'s complement; .C: C the bit), BTST Ws, Wb, BSW.C / .Z', () => {
  assert.equal(exec('btst.z w1, #4', { W1: 0x0010, SR: Z }).cpu.sr & Z, 0);
  assert.equal(exec('btst.c w1, #4', { W1: 0x0010, SR: 0 }).cpu.sr & C, C);
  assert.equal(exec('btst 0x1000, #9', { 'Data 1000': 0, SR: 0 }).cpu.sr & Z, Z);
  const s = exec('btsts.c w1, #2', { W1: 0, SR: C }).cpu;
  assert.deepEqual([s.W(1), s.sr & C], [4, 0]);
  const f = exec('btsts 0x1000, #0', { 'Data 1000': 0, SR: 0 }).cpu;
  assert.deepEqual([f.mem[0x800], f.sr & Z], [1, Z]);
  assert.equal(exec('btst.c w1, w2', { W1: 0x0800, W2: 0x001b, SR: 0 }).cpu.sr & C, C, 'Wb\'s 4 LSbs: bit 11');
  assert.equal(exec('bsw.c w1, w2', { W1: 0, W2: 5, SR: C }).cpu.W(1), 0x0020);
  assert.equal(exec('bsw.z w1, w2', { W1: 0xffff, W2: 5, SR: Z }).cpu.W(1), 0xffdf, '.Z writes Z\'s complement');
});

// (XC16 2.10's words at -O1, as xc16-objdump decodes them: a bit on f its op<15:13>, plus 8 when op<0>, a byte's
// address's LSB; the drawings' programs of #5552 waited on T1IF with btst.b 0x88, #3, read as bit 6 before #6017)
const XC16_BITS = [[0xab6088, 'btst.b 0x88, #3'], [0xa9a6a7, 'bclr.b 0x6a7, #5'], [0xa8a69f, 'bset.b 0x69f, #5'], [0xa92662, 'bclr.b 0x662, #1'],
  [0xa90677, 'bclr.b 0x677, #0'], [0xa8e67a, 'bset.b 0x67a, #7'], [0xa84044, 'bset.b 0x44, #2']];

// (one of XC16's words at 0x200, run)
const xc16 = (word, regs) => exec([], regs, { program: Object.assign([], { [0x200 >> 1]: word }) });

test('#6017 a bit on f in XC16\'s words: its bit4<2:0> at op<15:13>, its bit4<3> at op<0>; the assembler\'s the same', () => {
  for (const [word, line] of XC16_BITS) {
    const [, m, f, b] = /^(\w+)\.b 0x([0-9a-f]+), #(\d)$/.exec(line), byte = parseInt(f, 16), bit = Number(b) + 8 * (byte & 1), at = byte & ~1;
    const before = m === 'bset' ? 0 : 0xffff, data = { [`Data ${at.toString(16)}`]: before, SR: 0 };
    const cpu = xc16(word, data).cpu, after = cpu.mem[at >> 1];
    if (m === 'btst') assert.deepEqual([after, cpu.sr & Z], [before, 0], `${line}: bit ${bit} set, Z clear`);
    else assert.equal(after, m === 'bset' ? 1 << bit : 0xffff & ~(1 << bit), `${line}: bit ${bit} of 0x${hex4(at)}`);
    assert.equal(exec(line, data).cpu.mem[at >> 1], after, `${line} assembled as XC16's`);
  }
  assert.equal(xc16(0xab6088, { 'Data 88': 0x0040, SR: 0 }).cpu.sr & Z, Z, 'btst.b 0x88, #3: bit 6 is not it');
});

test('#5480 BTSC and BTSS skip the next instruction: 1 cycle, 2 when skipped, 3 over a two-word CALL / GOTO', () => {
  for (const [lines, regs, cycles, pc] of [
    [['btsc w1, #0', 'nop', 'nop'], { W1: 1 }, 1, 0x202],
    [['btsc w1, #0', 'nop', 'nop'], { W1: 0 }, 2, 0x204],
    [['btss w1, #0', 'goto 0x400', 'nop'], { W1: 1 }, 3, 0x206],
    [['btss 0x1000, #15', 'nop'], { 'Data 1000': 0x8000 }, 2, 0x204],
    [['btsc 0x1000, #15', 'nop'], { 'Data 1000': 0x8000 }, 1, 0x202],
  ]) {
    const { cpu } = cpuWith(lines);
    for (const [k, v] of Object.entries(regs)) set(cpu, k, v);
    assert.deepEqual([cpu.step(), cpu.pc], [cycles, pc], lines.join(' ; '));
  }
});

test('#5480 FBCL, FF1L, FF1R: the bit numbers of the manual\'s conventions; none found, C', () => {
  for (const [v, l, r] of [[0x0001, 16, 1], [0x8000, 1, 16], [0x00a0, 9, 6], [0x0000, 0, 0]]) {
    const L = exec('ff1l w1, w2', { W1: v, SR: 0 }).cpu, R = exec('ff1r w1, w2', { W1: v, SR: 0 }).cpu;
    assert.deepEqual([L.W(2), R.W(2), L.sr & C, R.sr & C], [l, r, v ? 0 : C, v ? 0 : C], hex4(v));
  }
  // FBCL: the first bit unlike the sign after it, as 0 (bit 14) down to -14; none, -15 and C
  for (const [v, want] of [[0x4000, 0], [0x2000, -1], [0xc000, -1], [0x0001, -14], [0x0000, -15], [0xffff, -15]]) {
    const c = exec('fbcl w1, w2', { W1: v, SR: 0 }).cpu;
    assert.deepEqual([c.W(2), c.sr & C], [want & 0xffff, want === -15 ? C : 0], hex4(v));
  }
});

test('#5480 the shifts and rotates by one, both modes: their results and N, Z, C', () => {
  for (const B of [0, 1]) {
    const m = B ? 0xff : 0xffff, msb = B ? 0x80 : 0x8000, sfx = B ? '.b' : '';
    for (const v of [0, 1, 0x40, msb, msb | 1, m, 0x5a5a & m]) for (const cin of [0, 1]) {
      const want = {
        sl: [(v << 1) & m, v & msb], lsr: [v >> 1, v & 1], asr: [(v >> 1) | (v & msb), v & 1],
        rlc: [((v << 1) & m) | cin, v & msb], rrc: [(v >> 1) | (cin ? msb : 0), v & 1],
        rlnc: [((v << 1) & m) | (v & msb ? 1 : 0), null], rrnc: [(v >> 1) | (v & 1 ? msb : 0), null],
      };
      for (const [op, [r, c]] of Object.entries(want)) {
        const { cpu } = exec(`${op}${sfx} w1, w2`, { W1: v, W2: 0xa500, SR: cin });
        const flags = (r & msb ? N : 0) | (r === 0 ? Z : 0) | (c == null ? cin : c ? C : 0);
        assert.deepEqual([cpu.W(2) & m, cpu.sr & 0xf], [r, flags], `${op}${sfx} ${hex4(v)} C=${cin}`);
        if (B) assert.equal(cpu.W(2) >> 8, 0xa5);
      }
    }
  }
  assert.equal(exec('sl 0x1000', { 'Data 1000': 0x4001 }).cpu.mem[0x800], 0x8002);
  assert.equal(exec('rrc 0x1000, wreg', { 'Data 1000': 0x0001, SR: 0 }).cpu.W(0), 0);
});

test('#5480 SL, LSR, ASR of Wb by Wns<4:0> or #lit4: N and Z; by more than 15, 0 (ASR: the sign)', () => {
  for (const [n, v] of [[0, 0x8421], [1, 0x8421], [4, 0x8421], [15, 0x8421], [16, 0x8421], [31, 0x7000]]) {
    const sl = exec('sl w1, w2, w3', { W1: v, W2: n }).cpu.W(3), lsr = exec('lsr w1, w2, w3', { W1: v, W2: n }).cpu.W(3);
    const asr = exec('asr w1, w2, w3', { W1: v, W2: n }).cpu.W(3);
    const s = (v << 16) >> 16;
    assert.deepEqual([sl, lsr, asr], [n > 15 ? 0 : (v << n) & 0xffff, n > 15 ? 0 : v >> n, (s >> Math.min(n, 15)) & 0xffff], `by ${n}`);
  }
  assert.equal(exec('lsr w1, #8, w3', { W1: 0xab00 }).cpu.W(3), 0x00ab);
  const c = exec('asr w1, #4, w3', { W1: 0x80ff, SR: C }).cpu;
  assert.deepEqual([c.W(3), c.sr & 0xf], [0xf80f, N | C], 'N from the result, C kept');
});

test('#5480 MUL.UU, US, SU, SS (Wnd:Wnd+1), the literal forms, MUL f: against the integers\' products', () => {
  const s16 = (v) => (v << 16) >> 16;
  for (const a of [0, 1, 0x7fff, 0x8000, 0xffff, 0x1234]) for (const b of [0, 1, 0x7fff, 0x8000, 0xffff, 0xa5a5]) {
    for (const [op, p] of [['uu', a * b], ['us', a * s16(b)], ['su', s16(a) * b], ['ss', s16(a) * s16(b)]]) {
      const { cpu } = exec(`mul.${op} w1, w2, w4`, { W1: a, W2: b, SR: 0x10f });
      const got = cpu.W(4) + cpu.W(5) * 0x10000, want = ((p % 2 ** 32) + 2 ** 32) % 2 ** 32;
      assert.equal(got, want, `mul.${op} ${hex4(a)}, ${hex4(b)}`);
      assert.equal(cpu.sr, 0x10f, 'no flag changed');
    }
  }
  const l = exec('mul.su w1, #31, w6', { W1: 0xffff }).cpu;
  assert.deepEqual([l.W(6), l.W(7)], [0xffe1, 0xffff], '-1 * 31');
  const f = exec('mul 0x1000', { W0: 0xffff, 'Data 1000': 0xffff }).cpu;
  assert.deepEqual([f.W(2), f.W(3)], [0x0001, 0xfffe]);
  assert.equal(exec('mul.b 0x1000', { W0: 0x12ff, 'Data 1000': 0x34ff, W3: 0x7777 }).cpu.W(2), 0xfe01, 'MUL.B f: 8 by 8 bits to W2');
});

test('#5480 DIV.S, DIV.U, DIV.SD, DIV.UD as REPEAT #17\'s target: quotient W0, remainder W1, N, OV, Z, its 19 cycles', () => {
  const cases = [
    ['div.s w3, w4', { W3: 0x3000, W4: 0x0027 }, 12288, 39, true, false],
    ['div.s w3, w4', { W3: 0xfff9, W4: 0x0002 }, -7, 2, true, false],
    ['div.s w3, w4', { W3: 0x8000, W4: 0xffff }, -32768, -1, true, false],
    ['div.u w3, w4', { W3: 0xffff, W4: 0x0010 }, 0xffff, 16, false, false],
    ['div.sd w6, w8', { W6: 0x2500, W7: 0xff42, W8: 0x2200 }, -12442368, 0x2200, true, true],
    ['div.ud w6, w8', { W6: 0x5678, W7: 0x0012, W8: 0x1234 }, 0x125678, 0x1234, false, true],
    ['div.ud w6, w8', { W6: 0x0000, W7: 0x0002, W8: 0x0001 }, 0x20000, 1, false, true],
  ];
  for (const [line, regs, dividend, divisor, signed, double] of cases) {
    const { cpu, end } = cpuWith(['repeat #17', line]);
    for (const [k, v] of Object.entries(regs)) set(cpu, k, v);
    const cycles = runThrough(cpu, 0x200, end);
    const d = signed ? (divisor << 16) >> 16 : divisor, q = Math.trunc(dividend / d), r = dividend - q * d;
    const over = signed ? q > 32767 || q < -32768 : q > 0xffff;
    assert.equal(cycles, 19, `${line}: 1 + 18`);
    assert.deepEqual([cpu.W(0), cpu.W(1)], [q & 0xffff, r & 0xffff], `${line} ${dividend} / ${d}`);
    assert.equal(cpu.sr & (N | OV | Z), (r < 0 ? N : 0) | (over ? OV : 0) | (r === 0 ? Z : 0), `${line}: flags`);
    assert.equal(cpu.sr & 0x10, 0, 'RA cleared after the last iteration');
    assert.deepEqual(cpu.log, []);
    void double;
  }
});

test('#5480 DIV: a divide by zero, the math error trap at its first iteration; executed other than 18 times, said', () => {
  let { cpu, end } = cpuWith(['repeat #17', 'div.u w3, w4']);
  set(cpu, 'W3', 5); set(cpu, 'W4', 0);
  cpu.step(); cpu.step();
  assert.equal(cpu.trapReq, 1 << 4);
  assert.match(cpu.log[0].text, /a divide by zero: math error trap/);
  ({ cpu, end } = cpuWith(['div.u w3, w4']));
  set(cpu, 'W3', 100); set(cpu, 'W4', 7);
  runThrough(cpu, 0x200, end);
  assert.deepEqual([cpu.W(0), cpu.W(1)], [14, 2]);
  assert.deepEqual(cpu.log.map((l) => l.text), ['DIV executed 1 times, not 18 (as REPEAT #17\'s target): its result is the 18 iterations\'']);
});
