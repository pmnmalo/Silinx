// The PIC24 emulator's arithmetic and logic (#5480, packages/silinx-pic24/src/exec-alu.js, operands.js): ADD, ADDC,
// SUB, SUBB, SUBR, SUBBR, CP, CPB, CP0, INC, DEC, NEG, AND, IOR, XOR, COM, CLR, SETM in byte and word modes, their
// results and flags against an independent reference (the flags from the operands' integer values, as the data
// sheet's SR describes them: C a carry out of the MSb or no borrow, DC the low digit's (a byte's bit 3, a word's bit 7),
// OV a signed result out of range, N its sign, Z its zero; the carry-in instructions' Z only cleared), their cycles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exec, hex4 } from './pic24-lib.mjs';

const C = 1, Z = 2, OV = 4, N = 8, DC = 0x100;
const VALUES = [0, 1, 2, 0x0f, 0x10, 0x7f, 0x80, 0x81, 0xfe, 0xff, 0x100, 0x0fff, 0x7ffe, 0x7fff, 0x8000, 0x8001, 0xff7f, 0xfffe, 0xffff, 0x1234, 0xa5c3];

// the reference: a + b + cin as integers (b already complemented for a subtraction), with its flags
function reference(a, b, cin, B, sz) {
  const bits = B ? 8 : 16, m = (1 << bits) - 1, sx = (v) => (v & (1 << (bits - 1)) ? v - (1 << bits) : v);
  const sum = a + b + cin, res = sum & m, signed = sx(a) + sx(b) + cin;
  const half = B ? 0xf : 0xff;
  let f = 0;
  if (sum > m) f |= C;
  if ((a & half) + (b & half) + cin > half) f |= DC;
  if (signed > sx(m >> 1) || signed < -(1 << (bits - 1))) f |= OV;
  if (res >> (bits - 1)) f |= N;
  if (res === 0 && (sz === undefined || sz)) f |= Z;
  return { res, f };
}

test('#5480 ADD, ADDC, SUB, SUBB, SUBR, SUBBR (Wb, Ws, Wd) in both modes: results and the five flags against the reference', () => {
  const bad = [];
  for (const B of [0, 1]) {
    const m = B ? 0xff : 0xffff, sfx = B ? '.b' : '';
    for (const a of VALUES) for (const b of VALUES) for (const cin of [0, 1]) for (const zin of [0, 1]) {
      const sr = (cin ? C : 0) | (zin ? Z : 0), A = a & m, Bv = b & m;
      const cases = [
        ['add', reference(A, Bv, 0, B)],
        ['addc', reference(A, Bv, cin, B, zin)],
        ['sub', reference(A, ~Bv & m, 1, B)],
        ['subb', reference(A, ~Bv & m, cin, B, zin)],
        ['subr', reference(Bv, ~A & m, 1, B)],
        ['subbr', reference(Bv, ~A & m, cin, B, zin)],
      ];
      for (const [op, want] of cases) {
        const { cpu } = exec(`${op}${sfx} w1, w2, w3`, { W1: a, W2: b, W3: 0xbeef, SR: sr });
        const got = B ? cpu.W(3) & 0xff : cpu.W(3), high = cpu.W(3) >> 8;
        if (got !== want.res || (cpu.sr & 0x10f) !== want.f || (B && high !== 0xbe))
          bad.push(`${op}${sfx} ${hex4(a)}, ${hex4(b)} (SR ${sr}): ${hex4(cpu.W(3))} SR ${hex4(cpu.sr)}, not ${hex4(want.res)} SR ${hex4(want.f)}`);
      }
    }
  }
  assert.deepEqual(bad.slice(0, 10), []);
});

test('#5480 CP, CPB, CP0 set the flags of a subtraction and change no register; CPB\'s Z only cleared', () => {
  for (const [a, b] of [[5, 5], [5, 6], [0x8000, 1], [0x7fff, 0xffff], [0, 0]]) {
    const want = reference(a, ~b & 0xffff, 1, 0);
    const { cpu } = exec('cp w1, w2', { W1: a, W2: b });
    assert.deepEqual([cpu.W(1), cpu.W(2), cpu.sr & 0x10f], [a, b, want.f], `cp ${a}, ${b}`);
    assert.equal(exec('cp0 w1', { W1: a }).cpu.sr & 0x10f, reference(a, 0xffff, 1, 0).f);
    // CPB: a - b - !C, Z kept only when already set
    assert.equal(exec('cpb w1, w2', { W1: a, W2: b, SR: C }).cpu.sr & 0x10f, reference(a, ~b & 0xffff, 1, 0, 0).f);
    assert.equal(exec('cpb w1, w2', { W1: a, W2: b, SR: C | Z }).cpu.sr & 0x10f, reference(a, ~b & 0xffff, 1, 0, 1).f);
  }
  // the literal and file register forms, byte mode
  assert.equal(exec('cp.b w4, #0x12', { W4: 0x7712 }).cpu.sr & (Z | C), Z | C);
  assert.equal(exec('cp 0x1200', { W0: 0x2377, 'Data 1200': 0x2377 }).cpu.sr & (Z | C), Z | C);
  assert.equal(exec('cp0.b 0x1201', { 'Data 1200': 0x00ff }).cpu.sr & Z, Z);
});

test('#5480 INC, INC2, DEC, DEC2, NEG on Ws and on f, both modes: their results and flags; f or WREG as the destination', () => {
  for (const B of [0, 1]) {
    const m = B ? 0xff : 0xffff, sfx = B ? '.b' : '';
    for (const x of VALUES) {
      const X = x & m;
      for (const [op, want] of [['inc', reference(X, 1, 0, B)], ['inc2', reference(X, 2, 0, B)], ['dec', reference(X, ~1 & m, 1, B)],
        ['dec2', reference(X, ~2 & m, 1, B)], ['neg', reference(0, ~X & m, 1, B)]]) {
        const { cpu } = exec(`${op}${sfx} w1, w2`, { W1: x, W2: 0xaaaa });
        assert.equal(B ? cpu.W(2) & 0xff : cpu.W(2), want.res, `${op}${sfx} ${hex4(x)}`);
        assert.equal(cpu.sr & 0x10f, want.f, `${op}${sfx} ${hex4(x)}: SR`);
        const f = exec(`${op}${sfx} 0x1000`, { 'Data 1000': x }).cpu;
        assert.equal(f.mem[0x800] & m, want.res);
        const w = exec(`${op}${sfx} 0x1000, wreg`, { 'Data 1000': x, W0: 0x5555 }).cpu;
        assert.deepEqual([w.mem[0x800], w.W(0) & m, B ? w.W(0) >> 8 : 0x55], [x, want.res, 0x55]);
      }
    }
  }
});

test('#5480 AND, IOR, XOR, COM: N and Z only (C, OV, DC kept); CLR and SETM change no flag', () => {
  const keep = C | OV | DC;
  for (const [a, b] of [[0xf0f0, 0x0ff0], [0x8000, 0x8000], [0x1234, 0], [0xffff, 0xffff]]) {
    for (const [op, r] of [['and', a & b], ['ior', a | b], ['xor', a ^ b]]) {
      const { cpu } = exec(`${op} w1, w2, w3`, { W1: a, W2: b, SR: keep });
      assert.deepEqual([cpu.W(3), cpu.sr], [r, keep | (r & 0x8000 ? N : 0) | (r === 0 ? Z : 0)], `${op} ${hex4(a)}, ${hex4(b)}`);
    }
    const c = exec('com w1, w3', { W1: a, SR: keep }).cpu;
    assert.deepEqual([c.W(3), c.sr], [~a & 0xffff, keep | (~a & 0x8000 ? N : 0) | ((~a & 0xffff) === 0 ? Z : 0)]);
  }
  // the literal forms: lit10 to Wn, lit5 with Wb; byte mode keeps Wn's high byte
  assert.equal(exec('and #0x3f0, w5', { W5: 0xffff }).cpu.W(5), 0x03f0);
  assert.equal(exec('ior.b #0x81, w5', { W5: 0x1200 }).cpu.W(5), 0x1281);
  assert.equal(exec('xor w1, #0x1f, w2', { W1: 0x00ff }).cpu.W(2), 0x00e0);
  const clr = exec('clr w4', { W4: 0x1234, SR: 0x10f }).cpu;
  assert.deepEqual([clr.W(4), clr.sr], [0, 0x10f]);
  const setm = exec('setm.b 0x1001', { 'Data 1000': 0x0012, SR: 0 }).cpu;
  assert.deepEqual([setm.mem[0x800], setm.sr], [0xff12, 0]);
  assert.equal(exec('clr.b 0x1000, wreg', { W0: 0x1234 }).cpu.W(0), 0x1200);
});

test('#5480 the ALU\'s file register forms: f + WREG to f or WREG, SUB f = f - WREG, SUBR f = WREG - f, MOV WREG, f', () => {
  let { cpu } = exec('add 0x1000', { W0: 0x0003, 'Data 1000': 0x0004 });
  assert.equal(cpu.mem[0x800], 7);
  ({ cpu } = exec('sub 0x1000, wreg', { W0: 0x0003, 'Data 1000': 0x0010 }));
  assert.deepEqual([cpu.W(0), cpu.mem[0x800]], [0x000d, 0x0010]);
  ({ cpu } = exec('subr 0x1000, wreg', { W0: 0x0003, 'Data 1000': 0x0010 }));
  assert.equal(cpu.W(0), 0xfff3);
  ({ cpu } = exec('subbr.b 0x1001', { W0: 0x0003, 'Data 1000': 0x0100, SR: 0 }));
  assert.equal(cpu.mem[0x800], 0x0100 | ((3 - 1 - 1) << 8) & 0xff00);
  ({ cpu } = exec('mov wreg, 0x1002', { W0: 0xabcd, SR: 0 }));
  assert.deepEqual([cpu.mem[0x801], cpu.sr], [0xabcd, 0]);
});

test('#5480 the ALU\'s cycles: one each, the register indirect forms too', () => {
  for (const line of ['add w1, w2, w3', 'add.b #5, w0', 'sub w1, #3, [w2++]', 'add 0x1000', 'inc [w1], [w2]', 'cp w1, w2', 'neg.b 0x1001, wreg', 'setm w3'])
    assert.equal(exec(line, { W1: 0x1000, W2: 0x1002 }).cycles, 1, line);
});
