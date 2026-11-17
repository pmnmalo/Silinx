// The iCE40 primitives' simulation models (#2299: packages/silinx-hdl/src/ice40-prims.js, ice40-ram.js, ice40-dsp.js, the
// native evaluation of its netlist cells in native-lattice.js): each one's behaviour against values computed here (Yosys's
// techlibs/ice40/cells_sim.v's semantics written again), instantiated from Verilog and from VHDL (test/lattice-prims-lib.mjs);
// when a design gets the iCE40 library (primitiveSources); every model elaborated alone with no message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { ICE40_SOURCE, ICE40_CELLS, ICE40_VHDL } from '../packages/silinx-hdl/src/ice40-prims.js';
import { checkCases, rng, bit } from './lattice-prims-lib.mjs';

const pins = (ins, outs, w = 1) => Object.fromEntries([...ins.map((p) => [p, { dir: 'in', w }]), ...outs.map((p) => [p, { dir: 'out', w }])]);
const FF_KINDS = ['', 'E', 'SR', 'R', 'SS', 'S', 'ESR', 'ER', 'ESS', 'ES'];

test('the iCE40 library: its cells, each elaborated alone with no message', () => {
  assert.deepEqual([...ICE40_CELLS].sort(), ['ICESTORM_LC', 'ICESTORM_RAM', 'SB_CARRY', ...FF_KINDS.flatMap((k) => [`SB_DFF${k}`, `SB_DFFN${k}`]), 'SB_FILTER_50NS', 'SB_GB', 'SB_GB_IO',
    'SB_HFOSC', 'SB_IO', 'SB_IO_OD', 'SB_LED_DRV_CUR', 'SB_LFOSC', 'SB_LUT4', 'SB_MAC16', 'SB_PLL40_2F_CORE', 'SB_PLL40_2F_PAD', 'SB_PLL40_2_PAD',
    'SB_PLL40_CORE', 'SB_PLL40_PAD', 'SB_RAM40_4K', 'SB_RAM40_4KNR', 'SB_RAM40_4KNRNW', 'SB_RAM40_4KNW', 'SB_RGBA_DRV', 'SB_RGB_DRV', 'SB_SPRAM256KA',
    'SB_WARMBOOT'].sort());
  const lib = compile([ICE40_SOURCE]);
  assert.deepEqual(lib.errors, []);
  for (const n of ICE40_CELLS) assert.deepEqual(elaborate(lib, n).diags.map((d) => d.message), [], n);
  assert.match(ICE40_VHDL, /^package COMPONENTS is$/m);
});

test('primitiveSources: the iCE40 library for a design that instantiates its cells (Verilog, VHDL library sb_ice40_components_syn)', () => {
  const v = (text) => primitiveSources([{ path: 'a.v', text }]).map((s) => s.path);
  const I = ['<silinx>/ice40.vhd'];
  assert.deepEqual(v('module a; SB_DFFE r (.Q(q), .D(d), .C(c), .E(e)); endmodule'), I);
  assert.deepEqual(v("module a; SB_LUT4 #(.LUT_INIT(16'h8000)) l (.O(y), .I0(a), .I1(b), .I2(c), .I3(d)); endmodule"), I);
  assert.deepEqual(v('module a(input c, output o); SB_PLL40_PAD #(.DIVF(7\'d63)) pll (.PACKAGEPIN(c), .PLLOUTGLOBAL(o)); endmodule'), I);
  // (Yosys's netlist: escaped names)
  assert.deepEqual(v('module a; SB_DFF \\dec.q2_DFF_Q  (.C(c), .D(d), .Q(q)); endmodule'), I);
  // the project's own module of that name, a comment, a UNISIM or Gowin design: not the iCE40's
  assert.deepEqual(primitiveSources([{ path: 'a.v', text: 'module a; SB_DFF r (.Q(q)); endmodule' }, { path: 'd.v', text: 'module SB_DFF(output Q); endmodule' }]), []);
  assert.deepEqual(v('module a; // SB_DFF r (.Q(q));\nendmodule'), []);
  assert.deepEqual(v('module a; FDCE r (.Q(q), .C(c), .CE(e), .CLR(r), .D(d)); SB_GB g (.USER_SIGNAL_TO_GLOBAL_BUFFER(c)); endmodule'), ['<silinx>/unisim.vhd']);
  assert.deepEqual(v('module a; DFFE r (.Q(q), .D(d), .CLK(c), .CE(e)); endmodule'), ['<silinx>/gowin.vhd']);
  // VHDL: Lattice's library; UNISIM's library wins over it
  const h = (...texts) => primitiveSources(texts.map((text, i) => ({ path: `a${i}.vhd`, text }))).map((s) => s.path);
  assert.deepEqual(h('library sb_ice40_components_syn;\nuse sb_ice40_components_syn.components.all;\nentity a is end;'), I);
  assert.deepEqual(h('library SB_ICE40_COMPONENTS_SYN;\nentity a is end;'), I);
  assert.deepEqual(h('library sb_ice40_components_syn;\nlibrary unisim;\nentity a is end;'), ['<silinx>/unisim.vhd']);
  assert.deepEqual(primitiveSources([{ path: 'a.vhd', text: 'library sb_ice40_components_syn;' }, ICE40_SOURCE]), []);
});

test('the harness: a wrong value expected fails, in Verilog and in VHDL', () => {
  const c = (out) => [{ name: 'NOT', cell: 'SB_LUT4', params: [['LUT_INIT', { bits: 16, v: 0x5555 }]], pins: pins(['I0', 'I1', 'I2', 'I3'], ['O']), steps: [{ in: { I0: 1 }, out: { O: out } }] }];
  checkCases('ice40', c('0'));
  assert.throws(() => checkCases('ice40', c('1')), /verilog[\s\S]*ERROR NOT step 0: O = 0, expected 1/);
  assert.throws(() => checkCases('ice40', c('1'), '', ['vhdl']), /vhdl[\s\S]*ERROR NOT step 0: O is not 1/);
});

test('SB_LUT4: O the bit {I3 I2 I1 I0} of LUT_INIT, every input combination, an unknown input X only when it changes O; SB_CARRY: CO = I0·I1 + (I0 + I1)·CI', () => {
  const cases = [];
  for (const init of [0x28ac, 0x8001, 0x6996]) {
    const ins = ['I0', 'I1', 'I2', 'I3'];
    const steps = Array.from({ length: 16 }, (_, k) => ({ in: Object.fromEntries(ins.map((p, i) => [p, bit(k, i)])), out: { O: String(bit(init, k)) } }));
    // an unknown input: O known when both its values give the same bit (cells_sim.v's tree of multiplexers)
    for (const k of [0, 5, 10, 15]) {
      const a = bit(init, k & 0b1110), b = bit(init, k | 1);
      steps.push({ in: { I0: 'x', I1: bit(k, 1), I2: bit(k, 2), I3: bit(k, 3) }, out: { O: a === b ? String(a) : 'x' } });
    }
    cases.push({ name: `LUT4_${init.toString(16)}`, cell: 'SB_LUT4', params: [['LUT_INIT', { bits: 16, v: init }]], pins: pins(ins, ['O']), steps });
  }
  const steps = Array.from({ length: 8 }, (_, k) => {
    const [a, b, c] = [bit(k, 0), bit(k, 1), bit(k, 2)];
    return { in: { I0: a, I1: b, CI: c }, out: { CO: String((a & b) | ((a | b) & c)) } };
  });
  // (an unknown carry in: known when I0 = I1)
  steps.push({ in: { I0: 1, I1: 1, CI: 'x' }, out: { CO: '1' } }, { in: { I0: 0, I1: 0 }, out: { CO: '0' } }, { in: { I1: 1 }, out: { CO: 'x' } });
  cases.push({ name: 'CARRY', cell: 'SB_CARRY', pins: pins(['I0', 'I1', 'CI'], ['CO']), steps });
  checkCases('ice40', cases, 'LUT4 and CARRY');
});

// a flip-flop's reference: Q after each step, from its kind (SR / SS synchronous, gated by E when it has one; R / S
// asynchronous), its enable, its edge; Q starts at 0
function ffRef(name, steps) {
  const m = /^SB_DFF(N)?(E)?(SR|R|SS|S)?$/.exec(name);
  const kind = m[3] || '', pin = kind.at(-1), val = pin === 'S' ? 1 : 0;
  let q = 0, clk = 0;
  const cur = { D: 0, C: 0, E: 0, R: 0, S: 0 };
  for (const s of steps) {
    Object.assign(cur, s.in);
    const edge = m[1] ? clk === 1 && cur.C === 0 : clk === 0 && cur.C === 1;
    clk = cur.C;
    if (kind.length === 1 && cur[pin]) q = val;
    else if (edge && (!m[2] || cur.E)) q = kind.length === 2 && cur[pin] ? val : cur.D;
    s.out = { Q: String(q) };
  }
  return steps;
}

test('the flip-flops (SB_DFF, E, SR, R, SS, S, ESR, ER, ESS, ES and their falling-edge twins): Q step by step against the reference, 0 at start', () => {
  const r = rng(2299), cases = [];
  for (const k of FF_KINDS) {
    for (const n of ['', 'N']) {
      const name = `SB_DFF${n}${k}`, e = k.startsWith('E'), pin = k ? k.at(-1) : null;
      const ins = ['D', 'C', ...(e ? ['E'] : []), ...(k && k !== 'E' ? [pin] : [])];
      const steps = Array.from({ length: 48 }, () => ({ in: { D: r(2), C: r(2), ...(e ? { E: r(4) ? 1 : 0 } : {}), ...(ins.length > 2 + e ? { [pin]: r(5) ? 0 : 1 } : {}) } }));
      steps[0].in.C = n ? 1 : 0;   // (no edge at the start)
      if (ins.length > 2 + e) steps[0].in[pin] = 0;
      cases.push({ name, cell: name, pins: pins(ins, ['Q']), steps: ffRef(name, steps) });
    }
  }
  assert.equal(new Set(cases.map((c) => c.cell)).size, 20);
  checkCases('ice40', cases, 'flip-flops');
});

test('SB_IO: an input, an output, a three-state and a registered output by PIN_TYPE; SB_GB_IO, SB_IO_OD (open drain); SB_GB', () => {
  const io = (dout = 'out') => ({ PACKAGE_PIN: { dir: dout, w: 1 } });
  const cases = [
    // PIN_INPUT (000001): D_IN_0 the pad
    { name: 'IN', cell: 'SB_IO', params: [['PIN_TYPE', { bits: 6, v: 0b000001 }]], pins: { ...io('inout'), ...pins([], ['D_IN_0']) },
      steps: [{ in: { PACKAGE_PIN: 1 }, out: { D_IN_0: '1' } }, { in: { PACKAGE_PIN: 0 }, out: { D_IN_0: '0' } }] },
    // PIN_OUTPUT (011001): the pad D_OUT_0
    { name: 'OUT', cell: 'SB_IO', params: [['PIN_TYPE', { bits: 6, v: 0b011001 }]], pins: { ...io(), ...pins(['D_OUT_0'], []) },
      steps: [{ in: { D_OUT_0: 1 }, out: { PACKAGE_PIN: '1' } }, { in: { D_OUT_0: 0 }, out: { PACKAGE_PIN: '0' } }] },
    // PIN_OUTPUT_TRISTATE (101001): D_OUT_0 while OUTPUT_ENABLE, else released; D_IN_0 the pad
    { name: 'TRI', cell: 'SB_IO', params: [['PIN_TYPE', { bits: 6, v: 0b101001 }]], pins: { ...io(), ...pins(['D_OUT_0', 'OUTPUT_ENABLE'], ['D_IN_0']) },
      steps: [{ in: { D_OUT_0: 1, OUTPUT_ENABLE: 1 }, out: { PACKAGE_PIN: '1', D_IN_0: '1' } }, { in: { OUTPUT_ENABLE: 0 }, out: { PACKAGE_PIN: 'z', D_IN_0: 'x' } }] },
    // PIN_OUTPUT_REGISTERED (010101): D_OUT_0 at OUTPUT_CLK's rising edge, with CLOCK_ENABLE
    { name: 'REG', cell: 'SB_IO', params: [['PIN_TYPE', { bits: 6, v: 0b010101 }]], pins: { ...io(), ...pins(['D_OUT_0', 'OUTPUT_CLK', 'CLOCK_ENABLE'], []) },
      steps: [{ in: { D_OUT_0: 1, CLOCK_ENABLE: 1 }, out: { PACKAGE_PIN: '0' } }, { in: { OUTPUT_CLK: 1 }, out: { PACKAGE_PIN: '1' } }, { in: { OUTPUT_CLK: 0, D_OUT_0: 0 }, out: { PACKAGE_PIN: '1' } },
        { in: { OUTPUT_CLK: 1, CLOCK_ENABLE: 0 }, out: { PACKAGE_PIN: '1' } }, { in: { OUTPUT_CLK: 0, CLOCK_ENABLE: 1 }, out: { PACKAGE_PIN: '1' } }, { in: { OUTPUT_CLK: 1 }, out: { PACKAGE_PIN: '0' } }] },
    // PIN_INPUT registered (000000) on INPUT_CLK
    { name: 'INREG', cell: 'SB_IO', params: [['PIN_TYPE', { bits: 6, v: 0 }]], pins: { ...io('inout'), ...pins(['INPUT_CLK'], ['D_IN_0']) },
      steps: [{ in: { PACKAGE_PIN: 1 }, out: { D_IN_0: '0' } }, { in: { INPUT_CLK: 1 }, out: { D_IN_0: '1' } }, { in: { INPUT_CLK: 0, PACKAGE_PIN: 0 }, out: { D_IN_0: '1' } }, { in: { INPUT_CLK: 1 }, out: { D_IN_0: '0' } }] },
    { name: 'GBIO', cell: 'SB_GB_IO', params: [['PIN_TYPE', { bits: 6, v: 0b000001 }]], pins: { ...io('inout'), ...pins([], ['GLOBAL_BUFFER_OUTPUT', 'D_IN_0']) },
      steps: [{ in: { PACKAGE_PIN: 1 }, out: { GLOBAL_BUFFER_OUTPUT: '1', D_IN_0: '1' } }, { in: { PACKAGE_PIN: 0 }, out: { GLOBAL_BUFFER_OUTPUT: '0', D_IN_0: '0' } }] },
    { name: 'OD', cell: 'SB_IO_OD', params: [['PIN_TYPE', { bits: 6, v: 0b011001 }]], pins: { PACKAGEPIN: { dir: 'out', w: 1 }, ...pins(['DOUT0'], []) },
      steps: [{ in: { DOUT0: 0 }, out: { PACKAGEPIN: '0' } }, { in: { DOUT0: 1 }, out: { PACKAGEPIN: 'z' } }] },
    { name: 'GB', cell: 'SB_GB', pins: pins(['USER_SIGNAL_TO_GLOBAL_BUFFER'], ['GLOBAL_BUFFER_OUTPUT']),
      steps: [0, 1, 0].map((v) => ({ in: { USER_SIGNAL_TO_GLOBAL_BUFFER: v }, out: { GLOBAL_BUFFER_OUTPUT: String(v) } })) },
    { name: 'RGB', cell: 'SB_RGBA_DRV', pins: pins(['CURREN', 'RGBLEDEN', 'RGB0PWM', 'RGB1PWM', 'RGB2PWM'], ['RGB0', 'RGB1', 'RGB2']),
      steps: [{ in: { CURREN: 1, RGBLEDEN: 1, RGB0PWM: 1, RGB2PWM: 1 }, out: { RGB0: '0', RGB1: 'z', RGB2: '0' } }, { in: { RGBLEDEN: 0 }, out: { RGB0: 'z', RGB1: 'z', RGB2: 'z' } }] },
  ];
  checkCases('ice40', cases, 'I/O');
});

// the block RAM's reference (cells_sim.v's): mode m's word of 16 >> m bits at its address, the data on WDATA's / RDATA's bits
// 2j, 4j + 1, 8j + 3 (mode 1, 2, 3)
const DBIT = [0, 0, 1, 3];
function ramRef(wm, rm, steps, mem = new Array(256).fill(0)) {
  let q = 0, wc = 0, rc = 0;
  const cur = { WCLK: 0, RCLK: 0, WE: 0, RE: 0, WADDR: 0, RADDR: 0, WDATA: 0, MASK: 0 };
  for (const s of steps) {
    Object.assign(cur, s.in);
    const wEdge = wc === 0 && cur.WCLK === 1, rEdge = rc === 0 && cur.RCLK === 1;
    wc = cur.WCLK; rc = cur.RCLK;
    if (rEdge && cur.RE) {
      const w = mem[cur.RADDR & 255], sub = cur.RADDR >> 8;
      q = 0;
      for (let i = 0; i < 16; i++) {
        if (rm === 0) q |= w & (1 << i);
        else if (i % (1 << rm) === DBIT[rm]) q |= ((w >> (i - DBIT[rm] + sub)) & 1) << i;
      }
    }
    if (wEdge && cur.WE) {
      const a = cur.WADDR & 255, sub = cur.WADDR >> 8;
      for (let i = 0; i < 16; i++) {
        const write = wm === 0 ? !((cur.MASK >> i) & 1) : i % (1 << wm) === sub;
        const d = wm === 0 ? (cur.WDATA >> i) & 1 : (cur.WDATA >> (i - sub + DBIT[wm])) & 1;
        if (write) mem[a] = (mem[a] & ~(1 << i)) | (d << i);
      }
    }
    s.out = { RDATA: q };
  }
  return steps;
}

test('SB_RAM40_4K: 256 × 16 (MASK), 512 × 8, 1024 × 4, 2048 × 2 by WRITE_MODE / READ_MODE, INIT_0 … F, against the reference; the NR / NW twins', () => {
  const r = rng(40), cases = [];
  const init = Array.from({ length: 16 }, (_, j) => BigInt.asUintN(256, BigInt(j + 1) * 0x0123456789ABCDEF0123456789ABCDEFn * 0x10001n));
  const mem0 = () => Array.from({ length: 256 }, (_, w) => Number((init[w >> 4] >> BigInt(16 * (w & 15))) & 0xffffn));
  for (const [wm, rm] of [[0, 0], [1, 1], [2, 2], [3, 3], [0, 2], [3, 0]]) {
    // (few addresses, each written and read many times)
    const adr = (m) => (r(4) << 8 * 0) | ((r(8) & ((1 << m) - 1)) << 8);
    const steps = [];
    for (let k = 0; k < 30; k++) {
      steps.push({ in: { WCLK: 0, RCLK: 0, WE: r(2), RE: r(4) ? 1 : 0, WADDR: adr(wm), RADDR: adr(rm), WDATA: r(65536), MASK: r(3) ? 0 : r(65536) } });
      steps.push({ in: { WCLK: 1, RCLK: 1 } });
    }
    const p = { RDATA: { dir: 'out', w: 16 }, WDATA: { dir: 'in', w: 16 }, MASK: { dir: 'in', w: 16 }, WADDR: { dir: 'in', w: 11 }, RADDR: { dir: 'in', w: 11 }, ...pins(['WCLK', 'RCLK', 'WE', 'RE'], []) };
    const params = [['WRITE_MODE', { int: wm }], ['READ_MODE', { int: rm }], ...init.map((v, j) => [`INIT_${j.toString(16).toUpperCase()}`, { bits: 256, v }])];
    cases.push({ name: `RAM_${wm}${rm}`, cell: 'SB_RAM40_4K', params, pins: p, steps: ramRef(wm, rm, steps, mem0()) });
  }
  // the falling-edge twins: written on WCLKN's falling edge, read on RCLKN's
  const steps = [{ in: { WCLKN: 1, RCLKN: 1, WE: 1, RE: 1, WADDR: 5, RADDR: 5, WDATA: 0xbeef } }, { in: { WCLKN: 0 }, out: { RDATA: 0 } },
    { in: { RCLKN: 0 }, out: { RDATA: 0xbeef } }];
  const p = { RDATA: { dir: 'out', w: 16 }, WDATA: { dir: 'in', w: 16 }, WADDR: { dir: 'in', w: 11 }, RADDR: { dir: 'in', w: 11 }, ...pins(['WCLKN', 'RCLKN', 'WE', 'RE'], []) };
  cases.push({ name: 'RAM_NRNW', cell: 'SB_RAM40_4KNRNW', pins: p, steps });
  checkCases('ice40', cases, 'RAM40');
});

test('SB_SPRAM256KA: a write of the nibbles MASKWREN enables, a read; STANDBY, SLEEP and POWEROFF', () => {
  const p = { DATAOUT: { dir: 'out', w: 16 }, DATAIN: { dir: 'in', w: 16 }, ADDRESS: { dir: 'in', w: 14 }, MASKWREN: { dir: 'in', w: 4 }, ...pins(['WREN', 'CHIPSELECT', 'CLOCK', 'STANDBY', 'SLEEP', 'POWEROFF'], []) };
  const steps = [
    { in: { POWEROFF: 1, CHIPSELECT: 1, WREN: 1, ADDRESS: 16000, DATAIN: 0x1234, MASKWREN: 0xf } }, { in: { CLOCK: 1 }, out: { DATAOUT: 'x' } },
    { in: { CLOCK: 0, DATAIN: 0xabcd, MASKWREN: 0b0101 } }, { in: { CLOCK: 1 } },
    { in: { CLOCK: 0, WREN: 0 } }, { in: { CLOCK: 1 }, out: { DATAOUT: 0x1b3d } },
    { in: { CLOCK: 0, ADDRESS: 3 } }, { in: { CLOCK: 1 }, out: { DATAOUT: 'x' } },
    { in: { CLOCK: 0, SLEEP: 1 }, out: { DATAOUT: 0 } }, { in: { SLEEP: 0, ADDRESS: 16000 } }, { in: { CLOCK: 1 }, out: { DATAOUT: 0x1b3d } },
    { in: { CLOCK: 0, STANDBY: 1 } }, { in: { CLOCK: 1 }, out: { DATAOUT: 'x' } },
    { in: { CLOCK: 0, STANDBY: 0, POWEROFF: 0 }, out: { DATAOUT: 0 } }, { in: { POWEROFF: 1 } }, { in: { CLOCK: 1 }, out: { DATAOUT: 'x' } },
  ];
  checkCases('ice40', [{ name: 'SPRAM', cell: 'SB_SPRAM256KA', pins: p, steps }], 'SPRAM');
});

// SB_MAC16's product as Yosys's synth_ice40 maps a 16 × 16 multiplication (dsp_map.v: combinational, O = H) and as a
// multiply-accumulate (the top and bottom accumulators of the 8 × 8 products)
test('SB_MAC16: the 16 × 16 product (unsigned and signed), the 8 × 8 ones, a 32-bit accumulator, against the products computed here', () => {
  const r = rng(16), cases = [];
  const p = { O: { dir: 'out', w: 32 }, A: { dir: 'in', w: 16 }, B: { dir: 'in', w: 16 }, ...pins(['CLK', 'ORSTTOP', 'ORSTBOT'], []) };
  const s16 = (x) => (x & 0x8000 ? x - 0x10000 : x), s8 = (x) => (x & 0x80 ? x - 0x100 : x);
  for (const signed of [0, 1]) {
    const steps = Array.from({ length: 20 }, () => {
      const a = r(65536), b = r(65536);
      return { in: { A: a, B: b }, out: { O: BigInt.asUintN(32, signed ? BigInt(s16(a) * s16(b)) : BigInt(a) * BigInt(b)) } };
    });
    cases.push({ name: `MUL16_${signed}`, cell: 'SB_MAC16', pins: p, steps,
      params: [['TOPOUTPUT_SELECT', { bits: 2, v: 3 }], ['BOTOUTPUT_SELECT', { bits: 2, v: 3 }], ['A_SIGNED', { bit: signed }], ['B_SIGNED', { bit: signed }]] });
  }
  // 8 × 8 (MODE_8x8): O(31 downto 16) = A's high × B's high (F), O(15 downto 0) = the low ones (G), signed
  const steps8 = Array.from({ length: 20 }, () => {
    const a = r(65536), b = r(65536);
    const f = BigInt.asUintN(16, BigInt(s8(a >> 8) * s8(b >> 8))), g = BigInt.asUintN(16, BigInt(s8(a & 255) * s8(b & 255)));
    return { in: { A: a, B: b }, out: { O: (f << 16n) | g } };
  });
  cases.push({ name: 'MUL8', cell: 'SB_MAC16', pins: p, steps: steps8,
    params: [['TOPOUTPUT_SELECT', { bits: 2, v: 2 }], ['BOTOUTPUT_SELECT', { bits: 2, v: 2 }], ['MODE_8x8', { bit: 1 }], ['A_SIGNED', { bit: 1 }], ['B_SIGNED', { bit: 1 }]] });
  // a 32-bit accumulator of the 16 × 16 products: the bottom adds H's low half to S, the top H's high half to Q with its carry
  let acc = 0n;
  const stepsAcc = [{ in: { ORSTTOP: 1, ORSTBOT: 1 }, out: { O: 0 } }, { in: { ORSTTOP: 0, ORSTBOT: 0 } }];
  for (let k = 0; k < 12; k++) {
    const a = r(65536), b = r(65536);
    // (the operands set before the clock's edge)
    stepsAcc.push({ in: { A: a, B: b, CLK: 0 } });
    acc = BigInt.asUintN(32, acc + BigInt(a) * BigInt(b));
    stepsAcc.push({ in: { CLK: 1 }, out: { O: acc } });
  }
  cases.push({ name: 'MAC32', cell: 'SB_MAC16', pins: p, steps: stepsAcc,
    params: [['TOPOUTPUT_SELECT', { bits: 2, v: 1 }], ['BOTOUTPUT_SELECT', { bits: 2, v: 1 }], ['TOPADDSUB_LOWERINPUT', { bits: 2, v: 2 }],
      ['BOTADDSUB_LOWERINPUT', { bits: 2, v: 2 }], ['TOPADDSUB_CARRYSELECT', { bits: 2, v: 2 }]] });
  checkCases('ice40', cases, 'MAC16');
});

// nextpnr-ice40's packed cells (ice40-packed.js, the Post-Place & Route model's): ICESTORM_LC's LUT, carry and flip-flop against
// cells_sim.v's semantics written again here; ICESTORM_RAM as SB_RAM40_4K, its pins single, NEG_CLK_R / W
function lcRef(p, steps) {
  let q = 0, clk = p.NEG_CLK;
  const cur = { I0: 0, I1: 0, I2: 0, I3: 0, CIN: 0, CLK: p.NEG_CLK, SR: 0, CEN: 1 };
  for (const s of steps) {
    Object.assign(cur, s.in);
    const lut = bit(p.LUT_INIT, cur.I0 | (cur.I1 << 1) | (cur.I2 << 2) | (cur.I3 << 3));
    const c = p.CIN_CONST ? p.CIN_SET : cur.CIN;
    const pc = cur.CLK ^ p.NEG_CLK, edge = clk === 0 && pc === 1;
    clk = pc;
    if (p.ASYNC_SR && cur.SR) q = p.SET_NORESET;
    else if (edge && cur.CEN) q = cur.SR ? p.SET_NORESET : lut;
    s.out = { LO: String(lut), O: String(p.DFF_ENABLE ? q : lut), ...(p.CARRY_ENABLE ? { COUT: String((cur.I1 & cur.I2) | ((cur.I1 | cur.I2) & c)) } : {}) };
  }
  return steps;
}

test('ICESTORM_LC: its LUT (LO), carry (COUT, CIN_CONST / CIN_SET) and flip-flop (DFF_ENABLE, NEG_CLK, CEN, SR synchronous or ASYNC_SR, SET_NORESET) against the reference; ICESTORM_RAM', () => {
  const r = rng(941), cases = [];
  for (const [k, p] of [[0, { LUT_INIT: 0x6996, DFF_ENABLE: 0, CARRY_ENABLE: 1, CIN_CONST: 0, CIN_SET: 0, NEG_CLK: 0, ASYNC_SR: 0, SET_NORESET: 0 }],
    [1, { LUT_INIT: 0x8ce1, DFF_ENABLE: 1, CARRY_ENABLE: 1, CIN_CONST: 1, CIN_SET: 1, NEG_CLK: 0, ASYNC_SR: 0, SET_NORESET: 1 }],
    [2, { LUT_INIT: 0x5a3c, DFF_ENABLE: 1, CARRY_ENABLE: 0, CIN_CONST: 0, CIN_SET: 0, NEG_CLK: 1, ASYNC_SR: 1, SET_NORESET: 0 }]]) {
    const steps = Array.from({ length: 40 }, (_, i) => ({ in: i % 2 ? { CLK: (i >> 1) % 2 } : { I0: r(2), I1: r(2), I2: r(2), I3: r(2), CIN: r(2), SR: r(6) ? 0 : 1, CEN: r(4) ? 1 : 0 } }));
    const params = Object.entries(p).map(([n, v]) => [n, n === 'LUT_INIT' ? { bits: 16, v } : { bit: v }]);
    cases.push({ name: `LC${k}`, cell: 'ICESTORM_LC', params, pins: pins(['I0', 'I1', 'I2', 'I3', 'CIN', 'CLK', 'SR', 'CEN'], ['LO', 'O', ...(p.CARRY_ENABLE ? ['COUT'] : [])]), steps: lcRef(p, steps) });
  }
  // ICESTORM_RAM: a word written on WCLK's falling edge (NEG_CLK_W), read on RCLK's rising one, 256 × 16
  const single = (pre, n, dir) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${pre}_${i}`, { dir, w: 1 }]));
  const val = (pre, n, v, out) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${pre}_${i}`, out ? String(bit(v, i)) : bit(v, i)]));
  const ram = { ...single('RDATA', 16, 'out'), ...single('RADDR', 11, 'in'), ...single('WADDR', 11, 'in'), ...single('WDATA', 16, 'in'), ...pins(['RCLK', 'WCLK', 'RE', 'WE'], []) };
  cases.push({ name: 'RAM', cell: 'ICESTORM_RAM', params: [['NEG_CLK_W', { bit: 1 }], ['INIT_0', { bits: 256, v: 0xabcd0000n }]], pins: ram, steps: [
    { in: { ...val('RADDR', 11, 1), RE: 1, WCLK: 1 } }, { in: { RCLK: 1 }, out: val('RDATA', 16, 0xabcd, true) },
    { in: { RCLK: 0, ...val('WADDR', 11, 1), ...val('WDATA', 16, 0x1234), WE: 1 } }, { in: { WCLK: 0 } }, { in: { RCLK: 1 }, out: val('RDATA', 16, 0x1234, true) }] });
  checkCases('ice40', cases, 'packed');
});
