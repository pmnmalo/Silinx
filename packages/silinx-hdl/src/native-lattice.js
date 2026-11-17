// Silinx - native (JavaScript) evaluation of the Lattice primitives (#2299), as native-gowin.js's of the Gowin's: a
// synth_ice40 or synth_ecp5 netlist's LUTs, wide multiplexers, carry cells, flip-flops and global buffers each a single
// native process with the behaviour of its VHDL model (ice40-prims.js, ecp5-prims.js). The others (the I/O cells, RAMs,
// PLLs, the DSPs) keep their VHDL models.

// SB_DFF[N][E][SR|R|SS|S]: N on the falling edge; SR / SS a synchronous reset / set (with E, when there is one), R / S an
// asynchronous one
const ICE40_FF = /^SB_DFF(N)?(E)?(SR|R|SS|S)?$/;

/** A LUT's output (INIT iv, a BigInt) for its inputs' bits (0, 1, 2 unknown; the first the lowest of INIT's index):
 *  cells_sim.v's tree of 2:1 multiplexers, an unknown input known when every value it may take gives the same bit. */
function lut4(iv, x) {
  let r = -1;
  for (let k = 0; k < 2 ** x.length; k++) {
    if (x.some((v, i) => v !== 2 && v !== ((k >> i) & 1))) continue;
    const o = Number((iv >> BigInt(k)) & 1n);
    if (r === -1) r = o; else if (r !== o) return 2;
  }
  return r;
}

/**
 * The native process of iCE40 primitive N (upper case), or null; h: native.js's helpers of the instance (P: its pins by
 * name, param(k), ins / outs(...pins), set(sim, sigs, bit), comb(inputs, outputs, f), b(pin), bit(value), rising /
 * falling(sim, sig), VAL[bit]).
 */
export function ice40Primitive(N, h) {
  const { P, param, ins, outs, set, comb, b, bit, rising, falling, VAL } = h;
  let m;
  if (N === 'SB_LUT4') {
    const pins = ['I0', 'I1', 'I2', 'I3'].map((k) => P.get(k));
    const o = outs('O');
    if (pins.some((p) => !p) || !o.length) return null;
    const iv = param('LUT_INIT')?.v ?? 0n;
    return comb(pins, o, () => lut4(iv, pins.map((p) => bit(p.val))));
  }
  if (N === 'SB_CARRY') {
    if (!P.get('I0') || !P.get('I1') || !P.get('CI')) return null;
    return comb(ins('I0', 'I1', 'CI'), outs('CO'), () => {
      const a = b('I0'), c = b('I1'), ci = b('CI');
      // (CO = I0·I1 + (I0 + I1)·CI, an unknown input known when the others decide)
      if (a === 1 && c === 1) return 1;
      if (a === 0 && c === 0) return 0;
      if (ci === 1 && (a === 1 || c === 1)) return 1;
      if (ci === 0 && (a === 0 || c === 0)) return 0;
      return 2;
    });
  }
  if (N === 'SB_GB') return comb(ins('USER_SIGNAL_TO_GLOBAL_BUFFER'), outs('GLOBAL_BUFFER_OUTPUT'), () => b('USER_SIGNAL_TO_GLOBAL_BUFFER'));
  if ((m = ICE40_FF.exec(N))) {
    const clk = P.get('C'), d = P.get('D'), q = P.get('Q');
    if (!clk || !d || !q) return null;
    const edge = m[1] ? falling : rising;
    const ce = m[2] ? P.get('E') : null, kind = m[3] || '';
    const sr = kind ? P.get(kind.at(-1)) : null;   // (SR / R: the pin R; SS / S: the pin S)
    if ((m[2] && !ce) || (kind && !sr)) return null;
    const val = kind.at(-1) === 'S' ? 1 : 0, asyn = kind.length === 1;
    return {
      inputs: [clk, ...(asyn ? [sr] : [])],     // d, e and a synchronous reset / set are sampled at the edge
      outputs: [q],
      init: [[q, VAL[0]]],
      fn(sim) {
        if (asyn && bit(sr.val) === 1) return set(sim, [q], val);
        if (!edge(sim, clk)) return;
        if (ce && bit(ce.val) !== 1) return;
        if (sr && !asyn && bit(sr.val) === 1) return set(sim, [q], val);
        set(sim, [q], bit(d.val));
      },
    };
  }
  return null;
}

// a 2:1 multiplexer's output (s its select, a / c its inputs for 0 / 1): an unknown select known when both inputs agree
const sel = (s, a, c) => (s === 1 ? c : s === 0 ? a : a !== 2 && a === c ? a : 2);
const xor = (x, y) => (x === 2 || y === 2 ? 2 : x ^ y);

/** The native process of ECP5 primitive N (upper case), or null; h as ice40Primitive's. */
export function ecp5Primitive(N, h) {
  const { P, param, ins, outs, set, comb, b, bit, rising, falling, VAL } = h;
  const str = (k, d) => param(k)?.str ?? d;
  if (N === 'LUT4' || N === 'LUT2') {
    const pins = (N === 'LUT4' ? ['A', 'B', 'C', 'D'] : ['A', 'B']).map((k) => P.get(k));
    const z = outs('Z');
    if (pins.some((p) => !p) || !z.length) return null;
    const iv = param('INIT')?.v ?? 0n;
    return comb(pins, z, () => lut4(iv, pins.map((p) => bit(p.val))));
  }
  if (N === 'PFUMX') return comb(ins('ALUT', 'BLUT', 'C0'), outs('Z'), () => sel(b('C0'), b('BLUT'), b('ALUT')));
  if (N === 'L6MUX21') return comb(ins('D0', 'D1', 'SD'), outs('Z'), () => sel(b('SD'), b('D0'), b('D1')));
  if (N === 'INV') return comb(ins('A'), outs('Z'), () => { const x = b('A'); return x === 2 ? 2 : 1 - x; });
  if (N === 'VLO' || N === 'VHI') {
    const v = N === 'VHI' ? 1 : 0;
    return { inputs: [], outputs: outs('Z'), init: outs('Z').map((s) => [s, VAL[v]]), fn: (sim) => set(sim, outs('Z'), v) };
  }
  if (N === 'CCU2C') {
    const p0 = ['A0', 'B0', 'C0', 'D0'].map((k) => P.get(k)), p1 = ['A1', 'B1', 'C1', 'D1'].map((k) => P.get(k)), cin = P.get('CIN');
    if ([...p0, ...p1, cin].some((p) => !p)) return null;
    const i0 = param('INIT0')?.v ?? 0n, i1 = param('INIT1')?.v ?? 0n;
    const inj0 = str('INJECT1_0', 'YES') === 'YES', inj1 = str('INJECT1_1', 'YES') === 'YES';
    const s0 = outs('S0'), s1 = outs('S1'), co = outs('COUT');
    // (cells_sim.v's: S = LUT4 xor the carry in; the carry out the carry in where the LUT4 is 1, else its LUT2)
    const half = (iv, pins, c, inj) => {
      const x = pins.map((p) => bit(p.val)), f = lut4(iv, x), g = inj ? 0 : lut4(iv & 15n, x.slice(0, 2));
      return [xor(f, inj ? 0 : c), sel(f, g, c)];
    };
    return {
      inputs: [...p0, ...p1, cin], outputs: [...s0, ...s1, ...co], init: [],
      fn(sim) {
        const [a, c0] = half(i0, p0, bit(cin.val), inj0), [d, c1] = half(i1, p1, c0, inj1);
        set(sim, s0, a); set(sim, s1, d); set(sim, co, c1);
      },
    };
  }
  if (N === 'TRELLIS_FF') {
    const clk = P.get('CLK'), d = P.get('DI'), q = P.get('Q'), lsr = P.get('LSR'), ce = P.get('CE'), m = P.get('M');
    if (!clk || !d || !q) return null;
    const cemux = str('CEMUX', '1'), lsrmux = str('LSRMUX', 'LSR'), prld = str('LSRMODE', 'LSR') === 'PRLD';
    if ((cemux !== '1' && cemux !== '0' && !ce) || (prld && !m)) return null;
    const edge = str('CLKMUX', 'CLK') === 'INV' ? falling : rising;
    const asyn = str('SRMODE', 'LSR_OVER_CE') === 'ASYNC';
    const regset = str('REGSET', 'RESET') === 'SET' ? 1 : 0;
    const lsrOn = () => { if (!lsr) return 0; const x = bit(lsr.val); return lsrmux === 'INV' ? (x === 2 ? 2 : 1 - x) : x; };
    const ceOn = () => (cemux === '1' ? 1 : cemux === '0' ? 0 : cemux === 'INV' ? (bit(ce.val) === 0 ? 1 : 0) : bit(ce.val));
    const srval = () => (prld ? bit(m.val) : regset);
    return {
      inputs: [clk, ...(asyn && lsr ? [lsr] : [])],     // di, ce and a synchronous LSR are sampled at the edge
      outputs: [q],
      init: [[q, VAL[prld ? 0 : regset]]],
      fn(sim) {
        if (asyn && lsrOn() === 1) return set(sim, [q], srval());
        if (!edge(sim, clk)) return;
        if (lsrOn() === 1) return set(sim, [q], srval());
        if (ceOn() !== 1) return;
        set(sim, [q], bit(d.val));
      },
    };
  }
  if (N === 'DCCA') return comb(ins('CLKI', 'CE'), outs('CLKO'), () => (P.get('CE') && b('CE') !== 1 ? 0 : b('CLKI')));
  return null;
}
