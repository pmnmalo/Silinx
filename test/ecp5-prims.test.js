// The ECP5 primitives' simulation models (#2299: packages/silinx-hdl/src/ecp5-prims.js, ecp5-bram.js, ecp5-dsp.js, the native
// evaluation of its netlist cells in native-lattice.js): each one's behaviour against values computed here (Yosys's
// techlibs/ecp5/cells_sim.v's semantics and Lattice's guides written again), instantiated from Verilog and from VHDL
// (test/lattice-prims-lib.mjs); when a design gets the ECP5 library (primitiveSources); every model elaborated alone with no
// message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { ECP5_SOURCE, ECP5_CELLS, ECP5_VHDL } from '../packages/silinx-hdl/src/ecp5-prims.js';
import { checkCases, rng, bit, busPins, busVal } from './lattice-prims-lib.mjs';

const pins = (ins, outs, w = 1) => Object.fromEntries([...ins.map((p) => [p, { dir: 'in', w }]), ...outs.map((p) => [p, { dir: 'out', w }])]);
const ck = (cases, label) => checkCases('ecp5', cases, label);

test('the ECP5 library: its cells, each elaborated alone with no message', () => {
  const diamond = ['AX', 'AY', 'BX', 'DX', 'IX', 'JX'].flatMap((k) => [`FD1P3${k}`, `FD1S3${k}`]);
  const ioregs = ['IFS1P3', 'OFS1P3'].flatMap((n) => ['BX', 'DX', 'IX', 'JX'].map((k) => `${n}${k}`));
  assert.deepEqual([...ECP5_CELLS].sort(), ['BB', 'BBPD', 'BBPU', 'CCU2C', 'DCCA', 'DCSC', 'DP16KD', 'DPR16X4C', 'EHXPLLL', 'GSR', 'IB', 'IBPD', 'IBPU',
    'IDDRX1F', 'ILVDS', 'INV', 'L6MUX21', 'LUT2', 'LUT4', 'MULT18X18D', 'OB', 'OBCO', 'OBZ', 'OBZPD', 'OBZPU', 'ODDRX1F', 'OLVDS', 'OSCG', 'PFUMX', 'PUR',
    'SGSR', 'TRELLIS_DPR16X4', 'TRELLIS_FF', 'TRELLIS_IO', 'TRELLIS_RAM16X2', 'USRMCLK', 'VHI', 'VLO', ...diamond, ...ioregs].sort());
  const lib = compile([ECP5_SOURCE]);
  assert.deepEqual(lib.errors, []);
  for (const n of ECP5_CELLS) assert.deepEqual(elaborate(lib, n).diags.map((d) => d.message), [], n);
  assert.match(ECP5_VHDL, /^package COMPONENTS is$/m);
});

test('primitiveSources: the ECP5 library for a design that instantiates its cells (Verilog, VHDL library ecp5u), its LUT4 and INV by their pins', () => {
  const v = (text) => primitiveSources([{ path: 'a.v', text }]).map((s) => s.path);
  const E = ['<silinx>/ecp5.vhd'];
  assert.deepEqual(v('module a; TRELLIS_FF #(.REGSET("SET")) r (.Q(q), .DI(d), .CLK(c)); endmodule'), E);
  assert.deepEqual(v('module a; CCU2C #(.INIT0(16\'h96aa)) c (.A0(a), .S0(s)); endmodule'), E);
  // (Yosys's netlist: escaped names); a name of UNISIM's or Gowin's too: the ECP5's by its pins, else theirs
  assert.deepEqual(v("module a; LUT4 #(.INIT(16'h8000)) \\u.l  (.A(a), .B(b), .C(c), .D(d), .Z(y)); endmodule"), E);
  assert.deepEqual(v('module a; INV i (.A(a), .Z(y)); endmodule'), E);
  assert.deepEqual(v("module a; LUT4 #(.INIT(16'h8000)) l (.O(y), .I0(a), .I1(b), .I2(c), .I3(d)); endmodule"), ['<silinx>/unisim.vhd']);
  assert.deepEqual(v("module a; LUT4 #(.INIT(16'h8000)) l (.F(y), .I0(a), .I1(b), .I2(c), .I3(d)); endmodule"), ['<silinx>/gowin.vhd']);
  assert.deepEqual(v('module a; INV i (.I(a), .O(y)); endmodule'), ['<silinx>/unisim.vhd']);
  // the project's own module of that name: nothing
  assert.deepEqual(primitiveSources([{ path: 'a.v', text: 'module a; PFUMX m (.Z(z)); endmodule' }, { path: 'd.v', text: 'module PFUMX(output Z); endmodule' }]), []);
  // VHDL: Lattice's library (ecp5u, ecp5um…); UNISIM's library wins over it
  const h = (...texts) => primitiveSources(texts.map((text, i) => ({ path: `a${i}.vhd`, text }))).map((s) => s.path);
  assert.deepEqual(h('library ecp5u;\nuse ecp5u.components.all;\nentity a is end;'), E);
  assert.deepEqual(h('library ECP5UM;\nentity a is end;'), E);
  assert.deepEqual(h('library ecp5u;\nlibrary unisim;\nentity a is end;'), ['<silinx>/unisim.vhd']);
  assert.deepEqual(primitiveSources([{ path: 'a.vhd', text: 'library ecp5u;' }, ECP5_SOURCE]), []);
});

test('LUT4, LUT2: Z the bit {D C B A} of INIT, an unknown input X only when it changes Z; PFUMX, L6MUX21, INV, VLO, VHI', () => {
  const cases = [];
  for (const [n, init] of [[4, 0x28ac], [4, 0x6996], [2, 0b0110], [2, 0b1000]]) {
    const ins = ['A', 'B', 'C', 'D'].slice(0, n);
    const steps = Array.from({ length: 2 ** n }, (_, k) => ({ in: Object.fromEntries(ins.map((p, i) => [p, bit(k, i)])), out: { Z: String(bit(init, k)) } }));
    for (const k of [0, 2 ** n - 1]) {
      const a = bit(init, k & ~1), b = bit(init, k | 1);
      steps.push({ in: { ...Object.fromEntries(ins.map((p, i) => [p, bit(k, i)])), A: 'x' }, out: { Z: a === b ? String(a) : 'x' } });
    }
    cases.push({ name: `LUT${n}_${init.toString(16)}`, cell: `LUT${n}`, params: [['INIT', { bits: 2 ** n, v: init }]], pins: pins(ins, ['Z']), steps });
  }
  const mux = (cell, a, c, s, map) => {
    const steps = Array.from({ length: 8 }, (_, k) => ({ in: { [a]: bit(k, 0), [c]: bit(k, 1), [s]: bit(k, 2) }, out: { Z: String(map(bit(k, 0), bit(k, 1), bit(k, 2))) } }));
    steps.push({ in: { [a]: 1, [c]: 1, [s]: 'x' }, out: { Z: '1' } }, { in: { [c]: 0 }, out: { Z: 'x' } });
    return { name: cell, cell, pins: pins([a, c, s], ['Z']), steps };
  };
  cases.push(mux('PFUMX', 'BLUT', 'ALUT', 'C0', (bl, al, s) => (s ? al : bl)), mux('L6MUX21', 'D0', 'D1', 'SD', (d0, d1, s) => (s ? d1 : d0)));
  cases.push({ name: 'INV', cell: 'INV', pins: pins(['A'], ['Z']), steps: [{ in: { A: 0 }, out: { Z: '1' } }, { in: { A: 1 }, out: { Z: '0' } }] });
  cases.push({ name: 'VLO', cell: 'VLO', pins: pins([], ['Z']), steps: [{ out: { Z: '0' } }] }, { name: 'VHI', cell: 'VHI', pins: pins([], ['Z']), steps: [{ out: { Z: '1' } }] });
  ck(cases, 'LUTs and muxes');
});

test('CCU2C: S0, S1 and COUT of random INITs and inputs against cells_sim.v\'s, INJECT1_0 / 1 "YES" and "NO"; an adder\'s INIT', () => {
  const r = rng(5), cases = [];
  // cells_sim.v's: S = LUT4 xor the carry in, the carry out the carry in where the LUT4 is 1, else its LUT2 (INIT's bits 3-0)
  const half = (init, a, b, c, d, cin, inj) => {
    const f = bit(init, a | (b << 1) | (c << 2) | (d << 3)), g = inj ? 0 : bit(init, a | (b << 1));
    return [f ^ (inj ? 0 : cin), f ? cin : g];
  };
  for (const [i0, i1, j0, j1] of [[0x96aa, 0x96aa, 'NO', 'NO'], [r(65536), r(65536), 'YES', 'NO'], [r(65536), r(65536), 'NO', 'YES'], [r(65536), r(65536), 'YES', 'YES']]) {
    const ins = ['CIN', 'A0', 'B0', 'C0', 'D0', 'A1', 'B1', 'C1', 'D1'];
    const steps = Array.from({ length: 40 }, () => {
      const x = Object.fromEntries(ins.map((p) => [p, r(2)]));
      const [s0, c0] = half(i0, x.A0, x.B0, x.C0, x.D0, x.CIN, j0 === 'YES'), [s1, co] = half(i1, x.A1, x.B1, x.C1, x.D1, c0, j1 === 'YES');
      return { in: x, out: { S0: String(s0), S1: String(s1), COUT: String(co) } };
    });
    cases.push({ name: `CCU2C_${j0}${j1}`, cell: 'CCU2C', params: [['INIT0', { bits: 16, v: i0 }], ['INIT1', { bits: 16, v: i1 }], ['INJECT1_0', { str: j0 }], ['INJECT1_1', { str: j1 }]],
      pins: pins(ins, ['S0', 'S1', 'COUT']), steps });
  }
  ck(cases, 'CCU2C');
});

// random steps made so that a step that moves the clock changes nothing else (a test bench's inputs set before the edge)
function apart(steps, clk) {
  const cur = {};
  for (const s of steps) {
    if (cur[clk] !== undefined && s.in[clk] !== cur[clk]) for (const k of Object.keys(s.in)) if (k !== clk) s.in[k] = cur[k];
    Object.assign(cur, s.in);
  }
}

// TRELLIS_FF's reference (cells_sim.v's): its generics g, Q after each step
function ffRef(g, steps) {
  const set = g.REGSET === 'SET' ? 1 : 0, asyn = g.SRMODE === 'ASYNC';
  let q = set, clk = g.CLKMUX === 'INV' ? 1 : 0;
  const cur = { CLK: 0, DI: 0, CE: 0, LSR: 0 };
  for (const s of steps) {
    Object.assign(cur, s.in);
    const c = g.CLKMUX === 'INV' ? 1 - cur.CLK : cur.CLK, edge = clk === 0 && c === 1;
    clk = c;
    const lsr = g.LSRMUX === 'INV' ? 1 - cur.LSR : cur.LSR;
    const ce = g.CEMUX === '1' ? 1 : g.CEMUX === '0' ? 0 : g.CEMUX === 'INV' ? 1 - cur.CE : cur.CE;
    if (asyn && lsr) q = set;
    else if (edge) { if (lsr) q = set; else if (ce) q = cur.DI; }
    s.out = { Q: String(q) };
  }
  return steps;
}

test('TRELLIS_FF: CEMUX, CLKMUX, LSRMUX, SRMODE, REGSET, Q step by step against the reference, its set / reset value at start; the Diamond flip-flops', () => {
  const r = rng(85), cases = [];
  for (const CEMUX of ['1', 'CE', 'INV']) {
    for (const SRMODE of ['LSR_OVER_CE', 'ASYNC']) {
      for (const REGSET of ['RESET', 'SET']) {
        for (const [CLKMUX, LSRMUX] of [['CLK', 'LSR'], ['INV', 'INV']]) {
          const g = { CEMUX, SRMODE, REGSET, CLKMUX, LSRMUX };
          const steps = Array.from({ length: 40 }, () => ({ in: { CLK: r(2), DI: r(2), CE: r(4) ? 1 : 0, LSR: r(5) ? (LSRMUX === 'INV' ? 1 : 0) : (LSRMUX === 'INV' ? 0 : 1) } }));
          apart(steps, 'CLK');
          steps[0].in.CLK = CLKMUX === 'INV' ? 1 : 0;
          steps[0].in.LSR = LSRMUX === 'INV' ? 1 : 0;
          cases.push({ name: `FF_${Object.values(g).join('_')}`, cell: 'TRELLIS_FF', params: Object.entries(g).map(([k, x]) => [k, { str: x }]),
            pins: pins(['CLK', 'DI', 'CE', 'LSR'], ['Q']), steps: ffRef(g, steps) });
        }
      }
    }
  }
  // the Diamond ones: FD1P3DX (enable, an asynchronous clear), FD1S3IX (a synchronous clear), FD1P3JX (enable, a synchronous
  // preset), FD1S3AY (none, starts at 1), as the TRELLIS_FF their cells_ff.vh's makes them
  for (const [cell, pin, g] of [['FD1P3DX', 'CD', { CEMUX: 'CE', SRMODE: 'ASYNC', REGSET: 'RESET' }], ['FD1S3IX', 'CD', { CEMUX: '1', SRMODE: 'LSR_OVER_CE', REGSET: 'RESET' }],
    ['FD1P3JX', 'PD', { CEMUX: 'CE', SRMODE: 'LSR_OVER_CE', REGSET: 'SET' }], ['FD1S3AY', null, { CEMUX: '1', SRMODE: 'ASYNC', REGSET: 'SET' }]]) {
    const steps = Array.from({ length: 40 }, () => ({ in: { CLK: r(2), DI: r(2), CE: r(4) ? 1 : 0, LSR: pin && !r(5) ? 1 : 0 } }));
    apart(steps, 'CLK');
    steps[0].in.CLK = 0;
    steps[0].in.LSR = 0;
    const ref = ffRef({ ...g, CLKMUX: 'CLK', LSRMUX: 'LSR' }, steps);
    const ren = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'LSR' || pin).filter(([k]) => k !== 'CE' || g.CEMUX === 'CE')
      .map(([k, x]) => [{ CLK: 'CK', DI: 'D', CE: 'SP', LSR: pin }[k] || k, x]));
    const ins = ['CK', 'D', ...(g.CEMUX === 'CE' ? ['SP'] : []), ...(pin ? [pin] : [])];
    cases.push({ name: cell, cell, pins: pins(ins, ['Q']), steps: ref.map((s) => ({ in: ren(s.in), out: s.out })) });
  }
  ck(cases, 'flip-flops');
});

test('TRELLIS_DPR16X4, DPR16X4C, TRELLIS_RAM16X2: read at once, written on WCK\'s edge with WRE, INITVAL, against the reference', () => {
  const r = rng(16), cases = [];
  const init = 0x0123456789abcdefn;
  const run = (w, mem, steps) => {
    let wck = 0;
    const cur = { WCK: 0, WRE: 0, WAD: 0, RAD: 0, DI: 0 };
    for (const s of steps) {
      Object.assign(cur, s.in);
      if (wck === 0 && cur.WCK === 1 && cur.WRE) mem[cur.WAD] = cur.DI;
      wck = cur.WCK;
      s.out = { DO: mem[cur.RAD] };
    }
    return steps;
  };
  // (the write's inputs set with WCK low, before its rising edge)
  const steps = () => Array.from({ length: 40 }, (_, k) => ({ in: k % 2 ? { WCK: 1, RAD: r(16) } : { WCK: 0, WRE: r(2), WAD: r(16), RAD: r(16), DI: r(16) } }));
  const mem4 = () => Array.from({ length: 16 }, (_, i) => Number((init >> BigInt(4 * i)) & 15n));
  const p4 = { DO: { dir: 'out', w: 4 }, DI: { dir: 'in', w: 4 }, WAD: { dir: 'in', w: 4 }, RAD: { dir: 'in', w: 4 }, ...pins(['WRE', 'WCK'], []) };
  cases.push({ name: 'DPR16X4', cell: 'TRELLIS_DPR16X4', params: [['INITVAL', { bits: 64, v: init }]], pins: p4, steps: run(4, mem4(), steps()) });
  cases.push({ name: 'DPR16X4C', cell: 'DPR16X4C', params: [['INITVAL', { str: `0x${init.toString(16).padStart(16, '0')}` }]], pins: p4, steps: run(4, mem4(), steps()) });
  // RAM16X2: its scalar pins; word i's bits INITVAL_1(i), INITVAL_0(i)
  const i0 = 0x1234, i1 = 0xfedc;
  const mem2 = Array.from({ length: 16 }, (_, i) => bit(i0, i) | (bit(i1, i) << 1));
  const s2 = run(2, mem2, Array.from({ length: 40 }, (_, k) => ({ in: k % 2 ? { WCK: 1, RAD: r(16) } : { WCK: 0, WRE: r(2), WAD: r(16), RAD: r(16), DI: r(4) } })));
  const scal = (s) => ({ in: { ...('WCK' in s.in ? { WCK: s.in.WCK } : {}), ...('WRE' in s.in ? { WRE: s.in.WRE } : {}), ...('WAD' in s.in ? busVal('WAD', 4, s.in.WAD) : {}),
    ...busVal('RAD', 4, s.in.RAD), ...('DI' in s.in ? busVal('DI', 2, s.in.DI) : {}) }, out: busVal('DO', 2, s.out.DO, true) });
  cases.push({ name: 'RAM16X2', cell: 'TRELLIS_RAM16X2', params: [['INITVAL_0', { bits: 16, v: i0 }], ['INITVAL_1', { bits: 16, v: i1 }]],
    pins: { ...busPins('DO', 2, 'out'), ...busPins('DI', 2, 'in'), ...busPins('WAD', 4, 'in'), ...busPins('RAD', 4, 'in'), ...pins(['WRE', 'WCK'], []) }, steps: s2.map(scal) });
  ck(cases, 'distributed RAMs');
});

test('the I/O cells: TRELLIS_IO by DIR, OBZ, BB, OLVDS; IDDRX1F and ODDRX1F; DCCA, DCSC', () => {
  const cases = [
    { name: 'IO_OUT', cell: 'TRELLIS_IO', params: [['DIR', { str: 'OUTPUT' }]], pins: { B: { dir: 'out', w: 1 }, ...pins(['I', 'T'], []) },
      steps: [{ in: { I: 1 }, out: { B: '1' } }, { in: { I: 0 }, out: { B: '0' } }, { in: { T: 1 }, out: { B: 'z' } }] },
    { name: 'IO_IN', cell: 'TRELLIS_IO', params: [['DIR', { str: 'INPUT' }]], pins: { B: { dir: 'inout', w: 1 }, ...pins([], ['O']) },
      steps: [{ in: { B: 1 }, out: { O: '1' } }, { in: { B: 0 }, out: { O: '0' } }] },
    { name: 'OBZ', cell: 'OBZ', pins: pins(['I', 'T'], ['O']), steps: [{ in: { I: 1 }, out: { O: '1' } }, { in: { T: 1 }, out: { O: 'z' } }] },
    { name: 'BB', cell: 'BB', pins: { B: { dir: 'out', w: 1 }, ...pins(['I', 'T'], ['O']) }, steps: [{ in: { I: 1 }, out: { B: '1', O: '1' } }, { in: { I: 0 }, out: { B: '0', O: '0' } }] },
    { name: 'OLVDS', cell: 'OLVDS', pins: pins(['A'], ['Z', 'ZN']), steps: [{ in: { A: 1 }, out: { Z: '1', ZN: '0' } }, { in: { A: 0 }, out: { Z: '0', ZN: '1' } }] },
    // IDDRX1F: Q0 the rising edge's sample, Q1 the falling edge's before it, both at the rising edge
    { name: 'IDDR', cell: 'IDDRX1F', pins: pins(['D', 'SCLK', 'RST'], ['Q0', 'Q1']),
      steps: [{ in: { D: 1 } }, { in: { SCLK: 1 }, out: { Q0: '1', Q1: '0' } }, { in: { D: 0 } }, { in: { SCLK: 0 } }, { in: { D: 1 } }, { in: { SCLK: 1 }, out: { Q0: '1', Q1: '0' } },
        { in: { D: 1 } }, { in: { SCLK: 0 } }, { in: { D: 0 } }, { in: { SCLK: 1 }, out: { Q0: '0', Q1: '1' } }, { in: { RST: 1 }, out: { Q0: '0', Q1: '0' } }] },
    // ODDRX1F: D0 while SCLK is high, D1 while low, both taken at the rising edge
    { name: 'ODDR', cell: 'ODDRX1F', pins: pins(['D0', 'D1', 'SCLK', 'RST'], ['Q']),
      steps: [{ in: { D0: 1, D1: 0 }, out: { Q: '0' } }, { in: { SCLK: 1 }, out: { Q: '1' } }, { in: { SCLK: 0, D0: 0, D1: 1 }, out: { Q: '0' } }, { in: { SCLK: 1 }, out: { Q: '0' } },
        { in: { SCLK: 0 }, out: { Q: '1' } }] },
    { name: 'DCCA', cell: 'DCCA', pins: pins(['CLKI', 'CE'], ['CLKO']), steps: [{ in: { CLKI: 1, CE: 1 }, out: { CLKO: '1' } }, { in: { CE: 0 }, out: { CLKO: '0' } }] },
    { name: 'DCSC', cell: 'DCSC', pins: pins(['CLK0', 'CLK1', 'SEL0', 'SEL1'], ['DCSOUT']),
      steps: [{ in: { CLK0: 1, CLK1: 0, SEL0: 1 }, out: { DCSOUT: '1' } }, { in: { SEL1: 1 }, out: { DCSOUT: '0' } }, { in: { SEL0: 0, SEL1: 0 }, out: { DCSOUT: '0' } }] },
  ];
  ck(cases, 'I/O and clocks');
});

// DP16KD's reference: rows of 18 bits; a port of w bits addresses its word with AD(13 downto log2), the words of 1, 2, 4 bits
// within a row's two bytes' 8 low bits (TN1264), 18 and 36 bits their bytes' enables AD(3 downto 0)
const LO = { 1: 0, 2: 1, 4: 2, 9: 3, 18: 4, 36: 5 };
const posOf = (k, i, w) => (w >= 9 ? k * w + i : Math.floor(k / (8 / w)) * 9 + (k % (8 / w)) * w + i);
function bramRef(g, steps, mem) {
  let clkA = 0, clkB = 0, lA = 0n, lB = 0n;
  const read = (k, w) => { let v = 0n; for (let i = 0; i < w; i++) v |= BigInt(mem[posOf(k, i, w)]) << BigInt(i); return v; };
  const cur = { CLKA: 0, CLKB: 0, WEA: 0, WEB: 0, ADA: 0, ADB: 0, DIA: 0n, DIB: 0n };
  for (const s of steps) {
    Object.assign(cur, s.in);
    const eA = clkA === 0 && cur.CLKA === 1, eB = clkB === 0 && cur.CLKB === 1;
    clkA = cur.CLKA; clkB = cur.CLKB;
    const writes = [];
    for (const [x, e, w, mode] of [['A', eA, g.wA, g.mA], ['B', eB, g.wB, g.mB]]) {
      if (!e) continue;
      const ad = cur[`AD${x}`], k = ad >> LO[w], di = BigInt(cur[`DI${x}`]) & ((1n << BigInt(w)) - 1n);
      const we = cur[`WE${x}`] === 1;
      const q = read(k, w);
      const l = !we || mode === 'READBEFOREWRITE' ? q : mode === 'WRITETHROUGH' ? di : null;
      if (x === 'A' && l !== null) lA = l;
      if (x === 'B' && l !== null) lB = l;
      if (we) writes.push([k, w, di, ad]);
    }
    for (const [k, w, di, ad] of writes) for (let i = 0; i < w; i++) if (w < 18 || (ad >> Math.floor(i / 9)) & 1) mem[posOf(k, i, w)] = Number((di >> BigInt(i)) & 1n);
    s.out = g.wB === 36 ? { DOA: lB & 0x3ffffn, DOB: lB >> 18n } : { DOA: lA, DOB: lB };
  }
  return steps;
}

test('DP16KD: the widths 1 … 18 on both ports, the 36-bit pseudo dual port, the write modes, INITVAL, against the reference; OUTREG; RSTA', () => {
  const r = rng(1264), cases = [];
  const init = Array.from({ length: 64 }, (_, j) => Array.from({ length: 16 }, (_, i) => BigInt((j * 16 + i) * 37 % 262144)));
  const initval = (j) => init[j].reduce((v, x, i) => v | (x << BigInt(20 * i)), 0n);
  const mem0 = () => { const m = []; init.flat().forEach((x) => { for (let i = 0; i < 18; i++) m.push(Number((x >> BigInt(i)) & 1n)); }); return m; };
  const P = { ...busPins('DIA', 18, 'in'), ...busPins('DIB', 18, 'in'), ...busPins('ADA', 14, 'in'), ...busPins('ADB', 14, 'in'), ...busPins('DOA', 18, 'out'), ...busPins('DOB', 18, 'out'),
    ...pins(['CLKA', 'CLKB', 'WEA', 'WEB', 'CEA', 'CEB', 'OCEA', 'OCEB'], []) };
  const scal = (s) => ({ in: { ...Object.fromEntries(['CLKA', 'CLKB', 'WEA', 'WEB', 'CEA', 'CEB', 'OCEA', 'OCEB'].filter((k) => k in s.in).map((k) => [k, s.in[k]])),
    ...('ADA' in s.in ? busVal('ADA', 14, s.in.ADA) : {}), ...('ADB' in s.in ? busVal('ADB', 14, s.in.ADB) : {}),
    ...('DIA' in s.in ? busVal('DIA', 18, s.in.DIA) : {}), ...('DIB' in s.in ? busVal('DIB', 18, s.in.DIB) : {}) },
  out: { ...busVal('DOA', 18, s.out.DOA, true), ...busVal('DOB', 18, s.out.DOB, true) } });
  // (few words, each written and read often: the address's low bits random, AD(13 downto 7) 0)
  for (const [wA, wB, mA, mB] of [[18, 18, 'NORMAL', 'NORMAL'], [9, 18, 'WRITETHROUGH', 'NORMAL'], [4, 2, 'READBEFOREWRITE', 'NORMAL'], [1, 9, 'NORMAL', 'WRITETHROUGH'], [36, 36, 'NORMAL', 'NORMAL']]) {
    const steps = [{ in: { CEA: 1, CEB: 1, OCEA: 1, OCEB: 1 } }];
    for (let k = 0; k < 30; k++) {
      const ad = (w) => (r(8) << LO[w]) | (w >= 18 ? r(16) & ((1 << LO[w]) - 1) : 0);
      const wide = wA === 36;
      steps.push({ in: { CLKA: 0, CLKB: 0, WEA: r(2), WEB: wide ? 0 : r(2), ADA: ad(wA), ADB: ad(wB), DIA: BigInt(r(262144)), DIB: BigInt(r(262144)) } });
      steps.push({ in: { CLKA: 1, CLKB: 1 } });
    }
    const g = { wA, wB, mA, mB };
    // (36 bits: port A writes DIA (the low 18 bits) and DIB (the high ones))
    const ref = bramRef(g, steps.map((s) => (wA === 36 && 'DIA' in s.in ? { in: { ...s.in, DIA: s.in.DIA | (s.in.DIB << 18n) } } : s)), mem0());
    cases.push({ name: `BRAM_${wA}_${wB}`, cell: 'DP16KD', pins: P, steps: ref.map((s, i) => scal({ in: steps[i].in, out: s.out })),
      params: [['DATA_WIDTH_A', { int: wA }], ['DATA_WIDTH_B', { int: wB }], ['WRITEMODE_A', { str: mA }], ['WRITEMODE_B', { str: mB }],
        ...init.map((_, j) => [`INITVAL_${j.toString(16).toUpperCase().padStart(2, '0')}`, { bits: 320, v: initval(j) }])] });
  }
  // OUTREG: the latch's word a clock later; RSTA (synchronous) clears both
  const steps = [{ in: { CEA: 1, OCEA: 1, ADA: 16, CLKA: 0 } }, { in: { CLKA: 1 }, out: { DOA: 0n } }, { in: { CLKA: 0 } }, { in: { CLKA: 1 }, out: { DOA: init[0][1] } }];
  cases.push({ name: 'BRAM_OUTREG', cell: 'DP16KD', pins: { ...P, RSTA: { dir: 'in', w: 1 } }, params: [['REGMODE_A', { str: 'OUTREG' }], ['INITVAL_00', { bits: 320, v: initval(0) }]],
    steps: [...steps, { in: { CLKA: 0, RSTA: 1 } }, { in: { CLKA: 1 }, out: { DOA: 0n } }].map((s) => ({ in: { ...s.in, ...('ADA' in s.in ? busVal('ADA', 14, s.in.ADA) : {}) }, out: s.out ? busVal('DOA', 18, s.out.DOA, true) : {} }))
      .map((s) => ({ in: Object.fromEntries(Object.entries(s.in).filter(([k]) => k !== 'ADA')), out: s.out })) });
  ck(cases, 'DP16KD');
});

test('MULT18X18D: P = A × B (unsigned, signed, mixed), SIGNEDP, against the products computed here; its input and output registers on CLK0 / CLK1', () => {
  const r = rng(1267), cases = [];
  const P = { ...busPins('A', 18, 'in'), ...busPins('B', 18, 'in'), ...busPins('P', 36, 'out'), ...pins(['SIGNEDA', 'SIGNEDB', 'CLK0', 'CLK1', 'CE0'], ['SIGNEDP']) };
  const s18 = (x, s) => (s && x & 0x20000 ? x - 0x40000 : x);
  const prod = (a, b, sa, sb) => BigInt.asUintN(36, BigInt(s18(a, sa)) * BigInt(s18(b, sb)));
  for (const [sa, sb] of [[0, 0], [1, 1], [1, 0]]) {
    const steps = Array.from({ length: 20 }, () => {
      const a = r(262144), b = r(262144);
      return { in: { ...busVal('A', 18, a), ...busVal('B', 18, b), SIGNEDA: sa, SIGNEDB: sb }, out: { ...busVal('P', 36, prod(a, b, sa, sb), true), SIGNEDP: String(sa | sb) } };
    });
    cases.push({ name: `MUL_${sa}${sb}`, cell: 'MULT18X18D', pins: P, steps });
  }
  // the input registers on CLK0, the output's on CLK1: the product of the operands at CLK0's edge, at CLK1's edge
  const steps = [{ in: { CE0: 1 } }];
  let pending = 0n;
  for (let k = 0; k < 10; k++) {
    const a = r(262144), b = r(262144);
    steps.push({ in: { ...busVal('A', 18, a), ...busVal('B', 18, b), CLK0: 0, CLK1: 0 } }, { in: { CLK0: 1 } }, { in: { CLK1: 1 }, out: busVal('P', 36, prod(a, b, 0, 0), true) });
    pending = prod(a, b, 0, 0);
  }
  assert.ok(pending > 0n);
  cases.push({ name: 'MUL_REG', cell: 'MULT18X18D', pins: P, steps,
    params: [['REG_INPUTA_CLK', { str: 'CLK0' }], ['REG_INPUTB_CLK', { str: 'CLK0' }], ['REG_OUTPUT_CLK', { str: 'CLK1' }]] });
  ck(cases, 'MULT18X18D');
});
