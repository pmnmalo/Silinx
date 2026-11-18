// The 7-series primitives' simulation models (#4362: packages/silinx-hdl/src/unisim-xc7.js, the 7-series' Post-Synthesis
// model's): instances of DSP48E1, RAMB18E1 and RAMB36E1 against values computed here, the DSP48E1's arithmetic of UG479 in
// BigInt, the block RAMs' contents a reference memory of data and parity bits (UG473); every model elaborated alone with no
// message. The examples' netlists that use them: test/xc7-netlist.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { UNISIM_SOURCE, primitiveSources } from '../core/unisim.js';
import { UNISIM_XC7_VHDL, E1 } from '../core/unisim-xc7.js';
import { rng } from './compiled-diff.js';

const XC7 = ['DSP48E1', 'RAMB18E1', 'RAMB36E1'];

test('the 7-series primitives: in UNISIM\'s library, each elaborated alone with no message; a Verilog instance of one gets UNISIM\'s', () => {
  const lib = compile([UNISIM_SOURCE]);
  assert.deepEqual(lib.errors, []);
  for (const n of XC7) assert.deepEqual(elaborate(lib, n).diags.map((d) => d.message), [], n);
  assert.deepEqual(primitiveSources([{ path: 'a.v', text: 'module a; DSP48E1 d (.CLK(c)); endmodule' }]).map((s) => s.path), ['<silinx>/unisim.vhd']);
});

// (VHDL names are case-insensitive: a variable named as a port hides it)
test('the 7-series models: no variable or signal has the name of one of the entity\'s ports', () => {
  for (const e of UNISIM_XC7_VHDL.split(/\nentity /).slice(1)) {
    const name = e.split(' ')[0];
    const ports = new Set([...e.slice(e.indexOf('port ('), e.indexOf(`end ${name};`)).matchAll(/(\w+)(?=[\w\s,]*:\s*(?:in|out)\b)/g)].map((m) => m[1].toLowerCase()));
    const names = [...e.matchAll(/\b(?:variable|signal)\s+([\w\s,]+?)\s*:/g)].flatMap((m) => m[1].split(/\s*,\s*/));
    assert.deepEqual(names.filter((n) => ports.has(n.toLowerCase())), [], name);
    assert.ok(ports.size > 10, name);
  }
});

// an instance of a primitive in a Verilog module, elaborated with the UNISIM models: { set, get, clock }, no message
function harness(text, top = 't') {
  const srcs = [{ path: 't.v', lang: 'verilog', text }];
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  const d = elaborate(lib, top);
  assert.deepEqual([...lib.errors, ...d.diags].map((x) => x.message), []);
  const s = new Simulator(d);
  const port = (n) => d.top.ports.find((p) => p.name === n).sig;
  let t = 1000;
  s.run(t);
  return {
    set: (vals) => { for (const [k, v] of Object.entries(vals)) s.force(port(k), V.mk(port(k).t.w, BigInt(v))); t += 1000; s.run(t); },
    get: (n) => { const v = port(n).val; return v.x ? null : v.v; },
    clock: () => { s.force(port('clk'), V.mk(1, 1n)); t += 1000; s.run(t); s.force(port('clk'), V.mk(1, 0n)); t += 1000; s.run(t); },
    log: () => s.log.map((e) => e.text),
  };
}

// ------------------------------------------------------------------ DSP48E1
const sx = (v, w) => BigInt.asIntN(w, BigInt(v));
const ux = (v, w) => BigInt.asUintN(w, BigInt(v));
const M48 = (1n << 48n) - 1n;
// the DSP48E1's arithmetic (UG479) with no register (P, the P register, 0): the pre-adder (INMODE), the multiplier, the X, Y and Z
// multiplexers (OPMODE), the carry in (CARRYINSEL), the ALU (ALUMODE); { p, m, carry (ALUMODE 0's 49th bit) }
function dspRef({ a, b, c, d, pcin, carryin, op, alu, inm, cis }) {
  const av = inm & 2 ? 0n : sx(a & 0x1ffffff, 25), dv = inm & 4 ? sx(d, 25) : 0n;
  const ad = sx(inm & 8 ? dv - av : dv + av, 25);
  const m = ux(ad * sx(b, 18), 43);
  const x = [0n, ux(sx(m, 43), 48), 0n, (BigInt(a) << 18n) | BigInt(b)][op & 3];
  const y = [0n, 0n, M48, BigInt(c)][(op >> 2) & 3];
  const z = [0n, BigInt(pcin), 0n, BigInt(c), 0n, ux(sx(pcin, 48) >> 17n, 48), 0n][(op >> 4) & 7];
  const cin = { 0: BigInt(carryin), 1: 1n - ((BigInt(pcin) >> 47n) & 1n), 3: (BigInt(pcin) >> 47n) & 1n, 5: 1n, 6: (ad < 0n) === (sx(b, 18) < 0n) ? 1n : 0n, 7: 0n }[cis];
  const xy = (x + y) & M48;
  if (alu & 4) {
    // (the logic unit: OPMODE(3) 0 or 1 exchanges xor and xnor, and and or)
    const nx = ~x & M48, nz = ~z & M48, o = (op >> 3) & 1;
    const f = { 4: o ? ~(x ^ z) : x ^ z, 7: o ? ~(x ^ z) : x ^ z, 5: o ? x ^ z : ~(x ^ z), 6: o ? x ^ z : ~(x ^ z), 12: o ? x | z : x & z, 13: o ? x | nz : x & nz,
      14: o ? ~(x | z) : ~(x & z), 15: o ? nx & z : nx | z }[alu];
    return { p: f & M48, m };
  }
  const sum = [z + xy + cin, (~z & M48) + xy + cin, ~(z + xy + cin), z - (xy + cin)][alu & 3];
  return { p: ux(sum, 48), m, carry: alu === 0 ? (z + xy + cin) >> 48n : undefined };
}
const NOREG = '.AREG(0), .BREG(0), .ACASCREG(0), .BCASCREG(0), .CREG(0), .DREG(0), .ADREG(0), .MREG(0), .PREG(0), .INMODEREG(0), .OPMODEREG(0), .ALUMODEREG(0), .CARRYINREG(0), .CARRYINSELREG(0)';

test('DSP48E1 without registers: the pre-adder (every INMODE), the multiplier, the X, Y and Z inputs, the carry in, the ALU\'s sums and logic, against the arithmetic of UG479', () => {
  const h = harness(`module t(input [29:0] a, input [17:0] b, input [47:0] c, pcin, input [24:0] d, input carryin, input [6:0] op, input [3:0] alu, input [4:0] inm,
  input [2:0] cis, output [47:0] p, output [3:0] co, output [29:0] ac, output [17:0] bc, output ms);
  DSP48E1 #(${NOREG}, .USE_DPORT("TRUE")) u (.A(a), .B(b), .C(c), .D(d), .PCIN(pcin), .CARRYIN(carryin), .OPMODE(op), .ALUMODE(alu), .INMODE(inm),
    .CARRYINSEL(cis), .CLK(1'b0), .P(p), .CARRYOUT(co), .ACOUT(ac), .BCOUT(bc), .MULTSIGNOUT(ms));
endmodule`);
  const r = rng(4362);
  const big = (w) => ux(BigInt(Math.floor(r() * 2 ** 30)) * BigInt(Math.floor(r() * 2 ** 30)) + BigInt(Math.floor(r() * 2 ** 20)), w);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  for (let k = 0; k < 400; k++) {
    // (the OPMODEs UG479 allows: X and Y both M or neither; Z not 100, the MACC's; ALUMODE's logic with Y 0 or all ones, X not M)
    const logic = k % 4 === 3;
    const xy = logic ? pick([[0, 0], [2, 0], [3, 0], [0, 2], [2, 2], [3, 2]]) : pick([[0, 0], [1, 1], [2, 0], [3, 0], [0, 2], [3, 3], [2, 3], [0, 3]]);
    const op = xy[0] | (xy[1] << 2) | (pick([0, 1, 3, 5]) << 4);
    const v = { a: big(30), b: big(18), c: big(48), d: big(25), pcin: big(48), carryin: Math.floor(r() * 2), op, inm: Math.floor(r() * 32),
      alu: logic ? pick([4, 5, 6, 7, 12, 13, 14, 15]) : pick([0, 1, 2, 3]), cis: pick([0, 1, 3, 5, 6, 7]) };
    h.set(v);
    const e = dspRef({ ...v, a: Number(v.a & 0x3fffffffn) });
    const what = `OPMODE ${op.toString(2).padStart(7, '0')} ALUMODE ${v.alu.toString(2).padStart(4, '0')} INMODE ${v.inm.toString(2).padStart(5, '0')} CARRYINSEL ${v.cis}`;
    assert.equal(h.get('p'), e.p, what);
    if (e.carry !== undefined) assert.equal(h.get('co') >> 3n, e.carry, `${what}: CARRYOUT(3)`);
    assert.deepEqual([h.get('ac'), h.get('bc'), h.get('ms')], [v.a, v.b, (e.m >> 42n) & 1n], what);
  }
});

test('DSP48E1 registered: a multiply-accumulate (X and Y M, Z P) through AREG / BREG 1 and 2, MREG and PREG, its synchronous reset; the cascade outputs, the clock\'s inversion', () => {
  for (const [areg, inv] of [[1, 0], [2, 0], [2, 1]]) {
    const h = harness(`module t(input clk, input rst, input [29:0] a, input [17:0] b, output [47:0] p, output [29:0] ac);
  DSP48E1 #(.AREG(${areg}), .BREG(${areg}), .ACASCREG(${areg === 2 ? 1 : areg}), .BCASCREG(${areg}), .CREG(0), .DREG(0), .ADREG(0), .MREG(1), .PREG(1), .INMODEREG(0),
    .OPMODEREG(0), .ALUMODEREG(0), .CARRYINREG(0), .CARRYINSELREG(0), .IS_CLK_INVERTED(1'b${inv}))
    u (.A(a), .B(b), .OPMODE(7'b0100101), .ALUMODE(4'd0), .INMODE(5'd0), .CARRYINSEL(3'd0), .P(p), .ACOUT(ac), .CLK(clk ^ ${inv}), .RSTA(rst), .RSTB(rst), .RSTM(rst), .RSTP(rst));
endmodule`);
    h.set({ clk: 0, rst: 1, a: 0, b: 0 });
    h.clock(); h.clock();
    h.set({ rst: 0 });
    const r = rng(areg + 2 * inv), as = [], bs = [];
    let acc = 0n;
    for (let k = 0; k < 30; k++) {
      const a = Math.floor(r() * 2 ** 25), b = Math.floor(r() * 2 ** 18);
      as.push(a); bs.push(b);
      h.set({ a, b });
      h.clock();
      // (the product of the inputs of areg + 1 clocks before: A2 (and A1), then M, then P); ACOUT the first of A's registers
      const j = k - areg - 1;
      if (j >= 0) acc = ux(acc + sx(sx(as[j], 25) * sx(bs[j], 18), 48), 48);
      assert.equal(h.get('p'), acc, `AREG ${areg} clock ${k}`);
      assert.equal(h.get('ac'), BigInt(as[k]), `AREG ${areg} ACOUT`);
    }
    h.set({ rst: 1 });
    assert.equal(h.get('p'), acc, 'a synchronous reset');
    h.clock();
    assert.equal(h.get('p'), 0n);
    assert.deepEqual(h.log(), []);
  }
});

test('DSP48E1: USE_SIMD other than ONE48 is a warning (its ALU is ONE48\'s); the pattern detector of P, PATTERN and MASK', () => {
  const h = harness(`module t(input [29:0] a, input [17:0] b, output [47:0] p, output pd, output pbd);
  DSP48E1 #(${NOREG}, .USE_SIMD("TWO24"), .USE_PATTERN_DETECT("PATDET"), .PATTERN(48'h000000000015), .MASK(48'hFFFFFFFFFF00))
    u (.A(a), .B(b), .OPMODE(7'b0000011), .ALUMODE(4'd0), .INMODE(5'd0), .CARRYINSEL(3'd0), .CLK(1'b0), .P(p), .PATTERNDETECT(pd), .PATTERNBDETECT(pbd));
endmodule`);
  // (X = A:B, P its 48 bits; the pattern detector compares its low byte: 0x15, and its complement 0xEA)
  for (const [ab, pd, pbd] of [[0x15n, 1n, 0n], [0x1234515n, 1n, 0n], [0xean, 0n, 1n], [0x16n, 0n, 0n]]) {
    h.set({ a: ab >> 18n, b: ab & 0x3ffffn });
    assert.deepEqual([h.get('p'), h.get('pd'), h.get('pbd')], [ab, pd, pbd], ab.toString(16));
  }
  assert.deepEqual(h.log(), ['DSP48E1: USE_SIMD TWO24 is not modelled: its ALU is ONE48\'s']);
});

// ------------------------------------------------------------------ RAMB18E1, RAMB36E1
// a reference block RAM: its data and parity bits; a port of w bits reads and writes the word at ADDR(hi downto log2) with its
// byte enables (18 bits or more), as UG473 lays it out
const DIMS = { 1: [1, 0, 0], 2: [2, 0, 1], 4: [4, 0, 2], 9: [8, 1, 3], 18: [16, 2, 4], 36: [32, 4, 5], 72: [64, 8, 6] };
function refRam(k) {
  const mem = new Uint8Array(k.mem), par = new Uint8Array(k.par);
  const word = (w, addr) => { const [d, p, s] = DIMS[w]; return [d, p, (addr & ((1 << (k.hi + 1)) - 1)) >> s]; };
  return {
    read(w, addr) { const [d, p, a] = word(w, addr); let v = 0n, q = 0n; for (let i = 0; i < d; i++) v |= BigInt(mem[a * d + i]) << BigInt(i); for (let j = 0; j < p; j++) q |= BigInt(par[a * p + j]) << BigInt(j); return [v, q]; },
    write(w, addr, v, q, we) {
      const [d, p, a] = word(w, addr), en = (i) => (d >= 16 ? (we >> Math.floor(i / 8)) & 1 : we & 1);
      for (let i = 0; i < d; i++) if (en(i)) mem[a * d + i] = Number((BigInt(v) >> BigInt(i)) & 1n);
      for (let j = 0; j < p; j++) if (d >= 16 ? (we >> j) & 1 : we & 1) par[a * p + j] = Number((BigInt(q) >> BigInt(j)) & 1n);
    },
  };
}

test('RAMB18E1 and RAMB36E1 in TDP: port A writes and reads (its widths apart), port B reads another width; WRITE_FIRST, READ_FIRST and NO_CHANGE, byte write enables, against a reference memory', () => {
  for (const name of ['RAMB18E1', 'RAMB36E1']) {
    const k = E1[name], dw = k.dw, pw = k.pw, wa = k.wa;
    for (const [mode, wA, rA, rB] of [['WRITE_FIRST', 18, 18, 9], ['READ_FIRST', 9, 9, 18], ['NO_CHANGE', 18, 18, 4], ['READ_FIRST', 18, 9, 1], ...(name === 'RAMB36E1' ? [['WRITE_FIRST', 36, 36, 9]] : [])]) {
      const h = harness(`module t(input clk, input [${k.aw - 1}:0] aa, ab, input [${dw - 1}:0] di, input [${pw - 1}:0] dip, input [${wa - 1}:0] we, input en,
  output [${dw - 1}:0] doa, dob, output [${pw - 1}:0] dopa, dopb);
  ${name} #(.RAM_MODE("TDP"), .READ_WIDTH_A(${rA}), .WRITE_WIDTH_A(${wA}), .READ_WIDTH_B(${rB}), .WRITE_WIDTH_B(0), .WRITE_MODE_A("${mode}"), .DOA_REG(0), .DOB_REG(0))
    u (.CLKARDCLK(clk), .CLKBWRCLK(clk), .ENARDEN(en), .ENBWREN(1'b1), .ADDRARDADDR(aa), .ADDRBWRADDR(ab), .DIADI(di), .DIPADIP(dip), .WEA(we),
       .DOADO(doa), .DOPADOP(dopa), .DOBDO(dob), .DOPBDOP(dopb));
endmodule`);
      const ref = refRam(k), r = rng(wA + rB);
      // (a small range of addresses, written and read again)
      const addr = () => Math.floor(r() * 64) << 5;
      let latchA = [0n, 0n];
      for (let s = 0; s < 120; s++) {
        const v = { aa: addr(), ab: addr(), di: Math.floor(r() * 2 ** 30), dip: Math.floor(r() * 16), we: Math.floor(r() * 2 ** wa) * (r() < 0.5 ? 1 : 0), en: r() < 0.9 ? 1 : 0 };
        h.set({ ...v, clk: 0 });
        // (on the edge: port B's read before the writes; port A's in WRITE_MODE's order)
        const b = ref.read(rB, v.ab), writes = v.en && v.we;
        if (v.en && (mode === 'READ_FIRST' || !writes)) latchA = ref.read(rA, v.aa);
        if (writes) ref.write(wA, v.aa, v.di, v.dip, v.we);
        if (v.en && writes && mode === 'WRITE_FIRST') latchA = ref.read(rA, v.aa);
        h.clock();
        const what = `${name} ${mode} A ${wA}/${rA} B ${rB} step ${s}`;
        assert.deepEqual([h.get('doa'), h.get('dopa')], latchA, `${what}: port A`);
        assert.deepEqual([h.get('dob'), h.get('dopb')], b, `${what}: port B`);
      }
    }
  }
});

test('RAMB18E1 and RAMB36E1 in SDP: port B writes the full width (DIBDI & DIADI, WEBWE), port A reads it (DOBDO & DOADO) through its register; INIT_A / INIT_B, SRVAL, RSTREG', () => {
  for (const name of ['RAMB18E1', 'RAMB36E1']) {
    const k = E1[name], dw = k.dw, pw = k.pw, w = k.sdp, iw = k.iw;
    const init = (lo, hi) => `${iw}'h${((BigInt(hi) << BigInt(dw)) | BigInt(lo)).toString(16)}`;
    const h = harness(`module t(input clk, input [${k.aw - 1}:0] ra, wa, input [${2 * dw - 1}:0] di, input [${2 * pw - 1}:0] dip, input [${k.wb - 1}:0] we, input rst,
  output [${dw - 1}:0] doa, dob, output [${pw - 1}:0] dopa, dopb);
  ${name} #(.RAM_MODE("SDP"), .READ_WIDTH_A(${w}), .WRITE_WIDTH_B(${w}), .DOA_REG(1), .INIT_A(${init(0x1234, 1)}), .INIT_B(${init(0x5678, 2)}),
    .SRVAL_A(${init(0xabc, 0)}), .SRVAL_B(${init(0xdef, 3)}), .WRITE_MODE_A("READ_FIRST"), .WRITE_MODE_B("READ_FIRST"))
    u (.CLKARDCLK(clk), .CLKBWRCLK(clk), .ENARDEN(1'b1), .ENBWREN(1'b1), .REGCEAREGCE(1'b1), .RSTREGARSTREG(rst), .ADDRARDADDR(ra), .ADDRBWRADDR(wa),
       .DIADI(di[${dw - 1}:0]), .DIBDI(di[${2 * dw - 1}:${dw}]), .DIPADIP(dip[${pw - 1}:0]), .DIPBDIP(dip[${2 * pw - 1}:${pw}]), .WEBWE(we),
       .DOADO(doa), .DOBDO(dob), .DOPADOP(dopa), .DOPBDOP(dopb));
endmodule`);
    // (INIT: the low half INIT_A's, the high half INIT_B's, their parity bits apart)
    assert.deepEqual(['doa', 'dob', 'dopa', 'dopb'].map(h.get), [0x1234n, 0x5678n, 1n, 2n], `${name} INIT`);
    const ref = refRam(k), r = rng(w);
    const big = (bits) => ux(BigInt(Math.floor(r() * 2 ** 30)) * BigInt(Math.floor(r() * 2 ** 30)) * BigInt(Math.floor(r() * 2 ** 10)), bits);
    let reg = null, latch = null;
    for (let s = 0; s < 80; s++) {
      const v = { ra: Math.floor(r() * 32) << DIMS[w][2], wa: Math.floor(r() * 32) << DIMS[w][2], di: big(2 * dw), dip: Math.floor(r() * 2 ** (2 * pw)), we: Math.floor(r() * 2 ** k.wb), rst: 0 };
      h.set({ ...v, clk: 0 });
      reg = latch;
      latch = ref.read(w, v.ra);
      ref.write(w, v.wa, v.di, v.dip, v.we);
      h.clock();
      if (!reg) continue;
      const mask = (1n << BigInt(dw)) - 1n, pm = (1n << BigInt(pw)) - 1n;
      assert.deepEqual(['doa', 'dob', 'dopa', 'dopb'].map(h.get), [reg[0] & mask, reg[0] >> BigInt(dw), reg[1] & pm, reg[1] >> BigInt(pw)], `${name} step ${s}`);
    }
    h.set({ rst: 1, we: 0 });
    h.clock();
    assert.deepEqual(['doa', 'dob', 'dopa', 'dopb'].map(h.get), [0xabcn, 0xdefn, 0n, 3n], `${name} SRVAL`);
    assert.deepEqual(h.log(), []);
  }
});

test('RAMB18E1: the unknown bits of INIT_xx, INIT_A and SRVAL_A (Yosys\'s for those it does not care of) read 0, as the device\'s', () => {
  const h = harness(`module t(input clk, output [15:0] doa, output [1:0] dopa);
  RAMB18E1 #(.RAM_MODE("TDP"), .READ_WIDTH_A(18), .INIT_A(72'bx), .INIT_00(256'h${'x'.repeat(60)}0005), .INITP_00(256'bx))
    u (.CLKARDCLK(clk), .ENARDEN(1'b1), .ADDRARDADDR(14'd0), .DOADO(doa), .DOPADOP(dopa));
endmodule`);
  assert.deepEqual([h.get('doa'), h.get('dopa')], [0n, 0n]);
  h.set({ clk: 0 });
  h.clock();
  assert.deepEqual([h.get('doa'), h.get('dopa')], [5n, 0n]);
});
