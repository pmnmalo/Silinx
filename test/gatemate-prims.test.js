// The GateMate primitives' simulation models (#2431: packages/silinx-hdl/src/gatemate-prims.js, gatemate-bram.js): each one's
// behaviour against values computed here (Yosys's techlibs/gatemate/cells_sim.v's semantics written again), instantiated from
// Verilog and from VHDL (test/lattice-prims-lib.mjs); when a design gets the GateMate library (primitiveSources); every model
// elaborated alone with no message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { GATEMATE_SOURCE, GATEMATE_CELLS, GATEMATE_VHDL } from '../packages/silinx-hdl/src/gatemate-prims.js';
import { checkCases, rng, bit } from './lattice-prims-lib.mjs';

const pins = (ins, outs, w = 1) => Object.fromEntries([...ins.map((p) => [p, { dir: 'in', w }]), ...outs.map((p) => [p, { dir: 'out', w }])]);
const ck = (cases, label) => checkCases('gatemate', cases, label);
// a LUT2's bit: INIT's bit {i1 i0}
const lut2 = (init, i0, i1) => bit(init, i0 + 2 * i1);

test('the GateMate library: its cells, each elaborated alone with no message', () => {
  assert.deepEqual([...GATEMATE_CELLS].sort(), ['CC_ADDF', 'CC_BRAM_20K', 'CC_BRAM_40K', 'CC_BUFG', 'CC_CFG_CTRL', 'CC_DFF', 'CC_DLT', 'CC_IBUF', 'CC_IDDR',
    'CC_IOBUF', 'CC_L2T4', 'CC_L2T5', 'CC_LUT1', 'CC_LUT2', 'CC_LUT3', 'CC_LUT4', 'CC_LVDS_IBUF', 'CC_LVDS_IOBUF', 'CC_LVDS_OBUF', 'CC_LVDS_TOBUF', 'CC_MULT',
    'CC_MX2', 'CC_MX4', 'CC_MX8', 'CC_OBUF', 'CC_ODDR', 'CC_PLL', 'CC_TOBUF', 'CC_USR_RSTN']);
  const lib = compile([GATEMATE_SOURCE]);
  assert.deepEqual(lib.errors, []);
  for (const n of GATEMATE_CELLS) assert.deepEqual(elaborate(lib, n).diags.map((d) => d.message), [], n);
  assert.match(GATEMATE_VHDL, /^package COMPONENTS is$/m);
});

test('primitiveSources: the GateMate library for a design that instantiates its cells (Verilog, VHDL library gatemate or cc_lib)', () => {
  const v = (text) => primitiveSources([{ path: 'a.v', text }]).map((s) => s.path);
  const G = ['<silinx>/gatemate.vhd'];
  assert.deepEqual(v("module a; CC_DFF #(.INIT(1'hx)) \\u.r  (.Q(q), .D(d), .CLK(c), .EN(1'h1), .SR(1'h0)); endmodule"), G);
  assert.deepEqual(v("module a; CC_L2T4 #(.INIT_L00(4'h8)) l (.O(y), .I0(a), .I1(b), .I2(c), .I3(d)); endmodule"), G);
  assert.deepEqual(v('module a; LUT4 l (.O(y), .I0(a)); endmodule'), ['<silinx>/unisim.vhd']);
  // the project's own module of that name: nothing
  assert.deepEqual(primitiveSources([{ path: 'a.v', text: 'module a; CC_MX2 m (.Y(z)); endmodule' }, { path: 'd.v', text: 'module CC_MX2(output Y); endmodule' }]), []);
  const h = (text) => primitiveSources([{ path: 'a.vhd', text }]).map((s) => s.path);
  assert.deepEqual(h('library gatemate;\nuse gatemate.components.all;\nentity a is end;'), G);
  assert.deepEqual(h('library CC_LIB;\nentity a is end;'), G);
  assert.deepEqual(primitiveSources([{ path: 'a.vhd', text: 'library gatemate;' }, GATEMATE_SOURCE]), []);
});

test('CC_LUT1 … CC_LUT4: O the bit {I3 I2 I1 I0} of INIT, an unknown input X only when it changes O', () => {
  const r = rng(2431), cases = [];
  for (const n of [1, 2, 3, 4]) {
    for (let j = 0; j < 2; j++) {
      const init = r(2 ** (2 ** n)), ins = Array.from({ length: n }, (_, i) => `I${i}`);
      const steps = Array.from({ length: 2 ** n }, (_, k) => ({ in: Object.fromEntries(ins.map((p, i) => [p, bit(k, i)])), out: { O: String(bit(init, k)) } }));
      for (const k of [0, 2 ** n - 1]) {
        const a = bit(init, k & ~1), b = bit(init, k | 1);
        steps.push({ in: { ...Object.fromEntries(ins.map((p, i) => [p, bit(k, i)])), I0: 'x' }, out: { O: a === b ? String(a) : 'x' } });
      }
      cases.push({ name: `CC_LUT${n}_${init.toString(16)}`, cell: `CC_LUT${n}`, params: [['INIT', { bits: 2 ** n, v: init }]], pins: pins(ins, ['O']), steps });
    }
  }
  ck(cases, 'LUTs');
});

test('CC_L2T4 and CC_L2T5: the LUT2 trees, every input combination, against their LUT2s', () => {
  const r = rng(4431), cases = [];
  for (let j = 0; j < 3; j++) {
    const [l00, l01, l10] = [r(16), r(16), r(16)];
    cases.push({ name: `L2T4_${j}`, cell: 'CC_L2T4', params: [['INIT_L00', { bits: 4, v: l00 }], ['INIT_L01', { bits: 4, v: l01 }], ['INIT_L10', { bits: 4, v: l10 }]],
      pins: pins(['I0', 'I1', 'I2', 'I3'], ['O']),
      steps: Array.from({ length: 16 }, (_, k) => ({ in: { I0: bit(k, 0), I1: bit(k, 1), I2: bit(k, 2), I3: bit(k, 3) },
        out: { O: String(lut2(l10, lut2(l00, bit(k, 0), bit(k, 1)), lut2(l01, bit(k, 2), bit(k, 3)))) } })) });
    const [l02, l03, l11, l20] = [r(16), r(16), r(16), r(16)];
    cases.push({ name: `L2T5_${j}`, cell: 'CC_L2T5', params: [['INIT_L02', { bits: 4, v: l02 }], ['INIT_L03', { bits: 4, v: l03 }], ['INIT_L11', { bits: 4, v: l11 }], ['INIT_L20', { bits: 4, v: l20 }]],
      pins: pins(['I0', 'I1', 'I2', 'I3', 'I4'], ['O']),
      steps: Array.from({ length: 32 }, (_, k) => {
        const l11v = lut2(l11, lut2(l02, bit(k, 0), bit(k, 1)), lut2(l03, bit(k, 2), bit(k, 3)));
        return { in: { I0: bit(k, 0), I1: bit(k, 1), I2: bit(k, 2), I3: bit(k, 3), I4: bit(k, 4) }, out: { O: String(lut2(l20, bit(k, 4), l11v)) } };
      }) });
  }
  ck(cases, 'L2T');
});

test('CC_MX2, CC_MX4, CC_MX8: Y the data input the selects name, an unknown select known when the inputs agree; CC_ADDF: {CO, S} = A + B + CI', () => {
  const r = rng(7), cases = [];
  for (const n of [2, 4, 8]) {
    const sel = Math.log2(n), ds = Array.from({ length: n }, (_, i) => `D${i}`), ss = Array.from({ length: sel }, (_, i) => `S${i}`);
    const steps = [];
    for (let k = 0; k < 24; k++) {
      const d = r(2 ** n), s = r(n);
      steps.push({ in: { ...Object.fromEntries(ds.map((p, i) => [p, bit(d, i)])), ...Object.fromEntries(ss.map((p, i) => [p, bit(s, i)])) }, out: { Y: String(bit(d, s)) } });
    }
    // (S0 unknown, the other selects 0: D0 or D1, known when they agree)
    steps.push({ in: { ...Object.fromEntries(ds.map((p) => [p, 1])), ...Object.fromEntries(ss.map((p) => [p, 0])), S0: 'x' }, out: { Y: '1' } });
    steps.push({ in: { D0: 0 }, out: { Y: 'x' } });
    cases.push({ name: `CC_MX${n}`, cell: `CC_MX${n}`, pins: pins([...ds, ...ss], ['Y']), steps });
  }
  cases.push({ name: 'CC_ADDF', cell: 'CC_ADDF', pins: pins(['A', 'B', 'CI'], ['CO', 'S']),
    steps: Array.from({ length: 8 }, (_, k) => ({ in: { A: bit(k, 0), B: bit(k, 1), CI: bit(k, 2) }, out: { S: String(bit(k, 0) ^ bit(k, 1) ^ bit(k, 2)), CO: String(Number(bit(k, 0) + bit(k, 1) + bit(k, 2) >= 2)) } })) });
  ck(cases, 'MX/ADDF');
});

test('CC_DFF: D on the clock\'s edge (CLK_INV: falling) when EN (EN_INV: low), SR (SR_INV: low) at once to SR_VAL, INIT at start (1\'hx: 0)', () => {
  const r = rng(99), cases = [];
  for (let k = 0; k < 16; k++) {
    const [ci, ei, si, sv] = [bit(k, 0), bit(k, 1), bit(k, 2), bit(k, 3)], init = k % 3 === 2 ? 'x' : String(k % 2);
    // the reference: Q after each step (CLK, EN, SR and D set first, then the time steps)
    // (the inputs 0 from the start: SR_INV's SR active until the first step, Q its SR_VAL; the first step's CLK its idle level)
    let q = si ? String(sv) : init === 'x' ? '0' : init, clk = ci;
    const steps = [{ in: { CLK: ci, EN: ei, SR: si, D: 0 }, out: { Q: q } }];
    for (let j = 0; j < 20; j++) {
      const s = { CLK: r(2), EN: r(2), SR: r(5) === 0 ? 1 : 0, D: r(2) };
      const edge = ci ? (clk === 1 && s.CLK === 0) : (clk === 0 && s.CLK === 1);
      const en = s.EN ^ ei, sr = s.SR ^ si;
      if (sr) q = String(sv);
      else if (edge && en) q = String(s.D);
      clk = s.CLK;
      steps.push({ in: s, out: { Q: q } });
    }
    cases.push({ name: `DFF_${k}`, cell: 'CC_DFF', params: [['CLK_INV', { bit: ci }], ['EN_INV', { bit: ei }], ['SR_INV', { bit: si }], ['SR_VAL', { bit: sv }], ['INIT', { bit: init }]],
      pins: pins(['D', 'CLK', 'EN', 'SR'], ['Q']), steps });
  }
  ck(cases, 'DFF');
});

test('CC_DLT: Q follows D while G (G_INV: low), SR (SR_INV: low) first, INIT at start', () => {
  const r = rng(5), cases = [];
  for (let k = 0; k < 8; k++) {
    const [gi, si, sv] = [bit(k, 0), bit(k, 1), bit(k, 2)];
    // (the inputs 0 from the start: SR_INV's SR active, or G_INV's latch open on D 0)
    let q = si ? String(sv) : '0';
    const first = q;
    const steps = [];
    for (let j = 0; j < 16; j++) {
      const s = { G: r(2), SR: r(4) === 0 ? 1 : 0, D: r(2) };
      if (s.SR ^ si) q = String(sv);
      else if (s.G ^ gi) q = String(s.D);
      steps.push({ in: s, out: { Q: q } });
    }
    // (its first step's inputs set from the start, INIT '0' until then)
    cases.push({ name: `DLT_${k}`, cell: 'CC_DLT', params: [['G_INV', { bit: gi }], ['SR_INV', { bit: si }], ['SR_VAL', { bit: sv }], ['INIT', { bit: 0 }]],
      pins: pins(['D', 'G', 'SR'], ['Q']), steps: [{ in: { G: gi, SR: si, D: 0 }, out: { Q: first } }, ...steps] });
  }
  ck(cases, 'DLT');
});

test('CC_MULT: P = A × B, signed, its low P_WIDTH bits (sign-extended when P is wider); an unknown input: P unknown', () => {
  const r = rng(11), cases = [];
  const sx = (v, w) => (v >= 2 ** (w - 1) ? v - 2 ** w : v);
  // (the whole product's width; narrower, as Yosys's mapping of stopwatch's (15 × 13 bits into 19: the bit 18 kept, not the sign);
  // wider, sign-extended)
  for (const pw of [11, 7, 14]) {
    const steps = [];
    for (let k = 0; k < 24; k++) {
      const a = r(64), b = r(32);
      steps.push({ in: { A: a, B: b }, out: { P: BigInt.asUintN(pw, BigInt(sx(a, 6) * sx(b, 5))).toString(2).padStart(pw, '0') } });
    }
    steps.push({ in: { A: 'x' }, out: { P: 'x' } });
    cases.push({ name: `CC_MULT_${pw}`, cell: 'CC_MULT', params: [['A_WIDTH', { int: 6 }], ['B_WIDTH', { int: 5 }], ['P_WIDTH', { int: pw }]],
      pins: { A: { dir: 'in', w: 6 }, B: { dir: 'in', w: 5 }, P: { dir: 'out', w: pw } }, steps });
  }
  ck(cases, 'MULT');
});

test('the I/O: CC_IBUF, CC_OBUF, CC_BUFG pass the bit; CC_TOBUF and CC_IOBUF (T = 1 releases the pad), the LVDS ones (the complement); CC_USR_RSTN high', () => {
  const pass = (cell, i, o, params = []) => ({ name: cell, cell, params, pins: pins([i], [o]), steps: [{ in: { [i]: 0 }, out: { [o]: '0' } }, { in: { [i]: 1 }, out: { [o]: '1' } }, { in: { [i]: 'z' }, out: { [o]: 'x' } }] });
  ck([
    pass('CC_IBUF', 'I', 'Y', [['PIN_NAME', { str: 'IO_SB_A8' }], ['PULLUP', { bit: 1 }]]), pass('CC_OBUF', 'A', 'O', [['DRIVE', { str: '3' }]]), pass('CC_BUFG', 'I', 'O'),
    { name: 'CC_TOBUF', cell: 'CC_TOBUF', pins: pins(['A', 'T'], ['O']), steps: [{ in: { A: 1, T: 0 }, out: { O: '1' } }, { in: { A: 0 }, out: { O: '0' } }, { in: { T: 1 }, out: { O: 'z' } }] },
    { name: 'CC_IOBUF', cell: 'CC_IOBUF', pins: { A: { dir: 'in', w: 1 }, T: { dir: 'in', w: 1 }, Y: { dir: 'out', w: 1 }, IO: { dir: 'inout', w: 1 } },
      steps: [{ in: { A: 1, T: 0 }, out: { IO: '1', Y: '1' } }, { in: { T: 1 }, out: { IO: 'z', Y: 'x' } }, { in: { IO: 0 }, out: { Y: '0' } }] },
    { name: 'CC_LVDS_OBUF', cell: 'CC_LVDS_OBUF', pins: pins(['A'], ['O_P', 'O_N']), steps: [{ in: { A: 1 }, out: { O_P: '1', O_N: '0' } }, { in: { A: 0 }, out: { O_P: '0', O_N: '1' } }] },
    { name: 'CC_LVDS_IBUF', cell: 'CC_LVDS_IBUF', pins: pins(['I_P', 'I_N'], ['Y']), steps: [{ in: { I_P: 1, I_N: 0 }, out: { Y: '1' } }, { in: { I_P: 0, I_N: 1 }, out: { Y: '0' } }] },
    { name: 'CC_USR_RSTN', cell: 'CC_USR_RSTN', pins: pins([], ['USR_RSTN']), steps: [{ out: { USR_RSTN: '1' } }] },
  ], 'I/O');
});

test('CC_IDDR and CC_ODDR: Q0 the rising edge\'s sample, Q1 the falling one\'s; Q D0\'s while DDR is high, D1\'s while low', () => {
  ck([
    { name: 'IDDR', cell: 'CC_IDDR', pins: pins(['D', 'CLK'], ['Q0', 'Q1']), steps: [
      { in: { D: 1, CLK: 1 }, out: { Q0: '1' } }, { in: { D: 0, CLK: 0 }, out: { Q0: '1', Q1: '0' } }, { in: { D: 0, CLK: 1 }, out: { Q0: '0', Q1: '0' } }, { in: { D: 1, CLK: 0 }, out: { Q0: '0', Q1: '1' } }] },
    { name: 'IDDR_INV', cell: 'CC_IDDR', params: [['CLK_INV', { bit: 1 }]], pins: pins(['D', 'CLK'], ['Q0', 'Q1']), steps: [
      { in: { D: 1, CLK: 1 } }, { in: { D: 0, CLK: 0 }, out: { Q0: '0' } }, { in: { D: 1, CLK: 1 }, out: { Q0: '0', Q1: '1' } }] },
    { name: 'ODDR', cell: 'CC_ODDR', pins: pins(['D0', 'D1', 'CLK', 'DDR'], ['Q']), steps: [
      { in: { D0: 1, D1: 0, CLK: 1, DDR: 1 }, out: { Q: '1' } }, { in: { CLK: 0 }, out: { Q: '1' } }, { in: { DDR: 0 }, out: { Q: '0' } }, { in: { D0: 0, CLK: 1, DDR: 1 }, out: { Q: '0' } }] },
  ], 'DDR');
});

// ---------------------------------------------------------------- the block RAMs
// a 20K's or 40K's memory (bits), its INIT rows, the TDP's addresses as cells_sim.v maps them
const B = (v) => BigInt(v);
const addr20 = (a, w) => {
  const hi = (a >> 7) & 0x1ff;
  if (w <= 1) { const t = (hi << 5) | ((a >> 1) & 31); return t + Math.floor(t / 4); }
  if (w <= 2) { const t = (hi << 4) | ((a >> 2) & 15); return t * 2 + Math.floor(t / 2); }
  if (w <= 5) return ((hi << 3) | ((a >> 3) & 7)) * 5;
  if (w <= 10) return ((hi << 2) | ((a >> 4) & 3)) * 10;
  return ((hi << 1) | ((a >> 5) & 1)) * 20;
};
const addr40 = (a, w) => {
  if (w <= 1) { const t = a >> 1; return t + Math.floor(t / 4); }
  if (w <= 2) { const t = a >> 2; return t * 2 + Math.floor(t / 2); }
  if (w <= 5) return (a >> 3) * 5;
  if (w <= 10) return (a >> 4) * 10;
  if (w <= 20) return (a >> 5) * 20;
  return (a >> 6) * 40;
};
const hex320 = (r) => Array.from({ length: 10 }, () => r(2 ** 32).toString(16).padStart(8, '0')).join('');
const ramPins = (W) => ({ A_CLK: { dir: 'in', w: 1 }, B_CLK: { dir: 'in', w: 1 }, A_EN: { dir: 'in', w: 1 }, B_EN: { dir: 'in', w: 1 }, A_WE: { dir: 'in', w: 1 }, B_WE: { dir: 'in', w: 1 },
  A_ADDR: { dir: 'in', w: 16 }, B_ADDR: { dir: 'in', w: 16 }, A_DI: { dir: 'in', w: W }, B_DI: { dir: 'in', w: W }, A_BM: { dir: 'in', w: W }, B_BM: { dir: 'in', w: W },
  A_DO: { dir: 'out', w: W }, B_DO: { dir: 'out', w: W } });
const field = (mem, at, w) => Array.from({ length: w }, (_, i) => mem[at + w - 1 - i]).join('');

// a TDP RAM: port A writes and reads (its mode), port B reads, both of width w, random addresses of its first rows, INIT_00 and
// INIT_01 random; DO_REG: B's output a register more
function tdpCase(k40, w, mode, seed, doReg = false) {
  const r = rng(seed), W = k40 ? 40 : 20, N = k40 ? 40960 : 20480, map = k40 ? addr40 : addr20;
  const inits = [hex320(r), hex320(r)];
  const mem = Array(N).fill('0');
  inits.forEach((h, row) => { const v = B(`0x${h}`); for (let i = 0; i < 320; i++) mem[320 * row + i] = String(Number((v >> B(i)) & 1n)); });
  const addrs = Array.from({ length: 6 }, () => { for (;;) { const a = r(2 ** 16) & (k40 ? 0x07ff : 0x07ff); if (map(a, w) + w <= 640) return a; } });
  const steps = [{ in: { A_EN: 1, B_EN: 1, A_BM: 2 ** W - 1, B_BM: 0 } }];
  let oa = '0'.repeat(W), ob = '0'.repeat(W), rb = '0'.repeat(W);
  const out = (v) => v.padStart(W, '0');
  for (let j = 0; j < 14; j++) {
    const a = addrs[r(6)], b = addrs[r(6)], we = r(2), di = r(2 ** Math.min(w, 30));
    const aa = map(a, w), ab = map(b, w);
    // the reads, of the memory before this edge's write
    const readB = field(mem, ab, w);
    const readA = mode === 'WRITE_THROUGH' && we ? BigInt.asUintN(w, B(di)).toString(2).padStart(w, '0') : field(mem, aa, w);
    if (doReg) rb = ob;
    if (mode === 'WRITE_THROUGH' || !we) oa = out(readA);
    ob = out(readB);
    if (we) for (let i = 0; i < w; i++) mem[aa + i] = String(bit(di, i));
    steps.push({ in: { A_CLK: 0, B_CLK: 0, A_ADDR: a, B_ADDR: b, A_WE: we, A_DI: di } });
    steps.push({ in: { A_CLK: 1, B_CLK: 1 }, out: { A_DO: oa, B_DO: doReg ? rb : ob } });
  }
  const params = [['RAM_MODE', { str: 'TDP' }], ['A_WR_MODE', { str: mode }], ['B_WR_MODE', { str: mode }], ['A_WR_WIDTH', { int: w }], ['A_RD_WIDTH', { int: w }],
    ['B_RD_WIDTH', { int: w }], ['B_WR_WIDTH', { int: 0 }], ['B_DO_REG', { bit: doReg ? 1 : 0 }],
    ...inits.map((h, i) => [`INIT_0${i}`, { bits: 320, v: B(`0x${h}`) }])];
  return { name: `${k40 ? '40K' : '20K'}_TDP_${w}_${mode}${doReg ? '_REG' : ''}`, cell: k40 ? 'CC_BRAM_40K' : 'CC_BRAM_20K', params, pins: ramPins(W), steps };
}

test('CC_BRAM_20K TDP: each width, NO_CHANGE and WRITE_THROUGH, the INIT rows read, written with the mask, port B a register more', () => {
  ck([tdpCase(false, 1, 'NO_CHANGE', 1), tdpCase(false, 2, 'WRITE_THROUGH', 2), tdpCase(false, 5, 'NO_CHANGE', 3), tdpCase(false, 10, 'WRITE_THROUGH', 4),
    tdpCase(false, 20, 'NO_CHANGE', 5), tdpCase(false, 20, 'WRITE_THROUGH', 6, true)], 'BRAM_20K TDP');
});

test('CC_BRAM_40K TDP: its widths up to 40', () => {
  ck([tdpCase(true, 1, 'WRITE_THROUGH', 7), tdpCase(true, 10, 'NO_CHANGE', 8), tdpCase(true, 40, 'WRITE_THROUGH', 9)], 'BRAM_40K TDP');
});

test('CC_BRAM_20K and CC_BRAM_40K SDP: the whole row (40, 80 bits) read by port B into A_DO and B_DO, written by port A from A_DI and B_DI under their masks', () => {
  const cases = [];
  for (const k40 of [false, true]) {
    const r = rng(k40 ? 41 : 21), W = k40 ? 40 : 20, full = 2 * W, rows = Array.from({ length: 4 }, () => hex320(r));
    const mem = Array(k40 ? 40960 : 20480).fill('0');
    rows.forEach((h, row) => { const v = B(`0x${h}`); for (let i = 0; i < 320; i++) mem[320 * row + i] = String(Number((v >> B(i)) & 1n)); });
    const steps = [{ in: { A_EN: 1, B_EN: 1, A_WE: 0 } }];
    let oa = '0'.repeat(W), ob = '0'.repeat(W);
    for (let j = 0; j < 12; j++) {
      const ra = r(1280 / full), rb = r(1280 / full), we = r(2), dl = r(2 ** 20), dh = r(2 ** 20), ml = r(2 ** 20), mh = r(2 ** 20);
      const read = field(mem, rb * full, full);
      oa = read.slice(W); ob = read.slice(0, W);
      if (we) {
        for (let i = 0; i < full; i++) {
          const half = i < W ? 0 : 1, k = i % W, m = (half ? mh : ml), d = (half ? dh : dl);
          if (k < 20 && bit(m, k)) mem[ra * full + i] = String(bit(d, k));
        }
      }
      steps.push({ in: { A_CLK: 0, B_CLK: 0, A_ADDR: ra << 7, B_ADDR: rb << 7, A_WE: we, A_DI: dl, B_DI: dh, A_BM: ml, B_BM: mh } });
      steps.push({ in: { A_CLK: 1, B_CLK: 1 }, out: { A_DO: oa, B_DO: ob } });
    }
    cases.push({ name: `${k40 ? '40K' : '20K'}_SDP`, cell: k40 ? 'CC_BRAM_40K' : 'CC_BRAM_20K',
      params: [['RAM_MODE', { str: 'SDP' }], ['A_WR_WIDTH', { int: full }], ['B_RD_WIDTH', { int: full }], ...rows.map((h, i) => [`INIT_0${i}`, { bits: 320, v: B(`0x${h}`) }])],
      pins: ramPins(W), steps });
  }
  ck(cases, 'BRAM SDP');
});

test('CC_PLL: CLK0 at OUT_CLK MHz after three of CLK_REF\'s edges, CLK90 a quarter period later, USR_PLL_LOCKED then; an OUT_CLK that is no frequency warned', () => {
  const tb = `\`timescale 1ns / 1ps
module tb;
  reg ref = 0;
  always #50 ref = ~ref;   // (10 MHz)
  wire c0, c90, c180, c270, lk;
  CC_PLL #(.REF_CLK("10.0"), .OUT_CLK("25.0"), .PERF_MD("SPEED")) p (.CLK_REF(ref), .CLK0(c0), .CLK90(c90), .CLK180(c180), .CLK270(c270), .USR_PLL_LOCKED(lk));
  time r0 = 0, r1 = 0, r90 = 0;
  integer n = 0;
  always @(posedge c0) begin n = n + 1; if (n == 2) r0 = $time; if (n == 3) r1 = $time; end
  always @(posedge c90) if (r0 != 0 && r90 == 0) r90 = $time;
  initial begin
    #240; $display("locked %b", lk);
    #100; $display("locked %b", lk);
    #1000; $display("period %0d phase %0d", r1 - r0, r90 - r0);
  end
endmodule
`;
  const srcs = [{ path: 'tb.v', lang: 'verilog', text: tb }];
  const run = simulate([...primitiveSources(srcs), ...srcs], 'tb', { until: 2000 * 1e3 });
  assert.deepEqual([...run.lib.errors, ...run.design.diags].map((d) => d.message), []);
  // (CLK_REF rises at 50, 150, 250 ns: locked at 250; 25 MHz, 40 ns; CLK90 10 ns after)
  assert.deepEqual(run.sim.log.map((e) => `${e.kind === 'warning' ? 'WARNING: ' : ''}${e.text}`), ['locked 0', 'locked 1', 'period 40 phase 10']);
  const bad = [{ path: 'b.v', lang: 'verilog', text: 'module b; wire c; CC_PLL #(.OUT_CLK("fast")) p (.CLK_REF(1\'b0), .CLK0(c)); endmodule' }];
  const w = simulate([...primitiveSources(bad), ...bad], 'b', { until: 1e3 });
  assert.deepEqual(w.sim.log.map((e) => `${e.kind === 'warning' ? 'WARNING: ' : ''}${e.text}`), ["WARNING: CC_PLL: OUT_CLK 'fast' is no frequency in MHz: no output"]);
});
