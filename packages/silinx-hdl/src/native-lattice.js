// Silinx - native (JavaScript) evaluation of the Lattice primitives (#2299), as native-gowin.js's of the Gowin's: a
// synth_ice40 netlist's LUTs, carry cells, flip-flops and global buffers each a single native process with the behaviour of
// its VHDL model (ice40-prims.js). The others (the I/O cells, RAMs, PLLs, the DSP) keep their VHDL models.

// SB_DFF[N][E][SR|R|SS|S]: N on the falling edge; SR / SS a synchronous reset / set (with E, when there is one), R / S an
// asynchronous one
const ICE40_FF = /^SB_DFF(N)?(E)?(SR|R|SS|S)?$/;

/** A 4-input LUT's output (INIT iv, a BigInt) for its inputs' bits (0, 1, 2 unknown): cells_sim.v's tree of 2:1
 *  multiplexers, an unknown input known when every value it may take gives the same bit. */
function lut4(iv, x) {
  let r = -1;
  for (let k = 0; k < 16; k++) {
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
