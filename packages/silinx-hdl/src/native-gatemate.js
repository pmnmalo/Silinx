// Silinx - native (JavaScript) evaluation of the GateMate primitives (#2431), as native-gowin.js's of the Gowin's: a
// synth_gatemate netlist's LUTs and LUT trees, multiplexers, adders, flip-flops and buffers each a single native process with
// the behaviour of its VHDL model (gatemate-prims.js: an unknown input known when every value it may take gives the same
// output; a flip-flop with no initial value starting at 0). The others (latches, the multiplier, the RAMs, the three-state
// buffers, the PLL) keep their VHDL models.

// a function of bits (0 / 1) at inputs that may be unknown (2): its value, unknown when the unknown inputs' values disagree
function tryAll(f, xs) {
  const u = [];
  xs.forEach((x, i) => { if (x === 2) u.push(i); });
  if (!u.length) return f(xs);
  let r = -1;
  for (let k = 0; k < 1 << u.length; k++) {
    const ys = xs.slice();
    u.forEach((i, j) => { ys[i] = (k >> j) & 1; });
    const v = f(ys);
    if (r === -1) r = v; else if (r !== v) return 2;
  }
  return r;
}
// a LUT of n inputs: INIT's bit {… I1 I0}
const lutOf = (init) => (xs) => { let k = 0; xs.forEach((x, i) => { k |= x << i; }); return Number((init >> BigInt(k)) & 1n); };
const lut2 = (init, a, b) => Number((init >> BigInt(a + 2 * b)) & 1n);

/**
 * The native process of GateMate primitive N (upper case), or null; h: native.js's helpers of the instance (P: its pins by
 * name, param(k), ins / outs(...pins), set(sim, sigs, bit), comb(inputs, outputs, f), b(pin), bit(value), rising / falling(sim,
 * sig), VAL[bit]).
 */
export function gatematePrimitive(N, h) {
  const { P, param, ins, outs, set, comb, b, bit, rising, falling, VAL } = h;
  const iv = (k) => param(k)?.v ?? 0n;
  // an unconnected input: its VHDL model's default ('0')
  const pin = (k) => (P.get(k) ? b(k) : 0);
  let m;
  if ((m = /^CC_LUT([1-4])$/.exec(N))) {
    const n = Number(m[1]), names = Array.from({ length: n }, (_, i) => `I${i}`), f = lutOf(iv('INIT'));
    return comb(ins(...names), outs('O'), () => tryAll(f, names.map(pin)));
  }
  if (N === 'CC_L2T4') {
    const [l00, l01, l10] = ['INIT_L00', 'INIT_L01', 'INIT_L10'].map(iv);
    // (each LUT2 one after the other, as the model's signals: an unknown middle value tried both ways)
    return comb(ins('I0', 'I1', 'I2', 'I3'), outs('O'), () => {
      const a = tryAll(([x, y]) => lut2(l00, x, y), [pin('I0'), pin('I1')]), c = tryAll(([x, y]) => lut2(l01, x, y), [pin('I2'), pin('I3')]);
      return tryAll(([x, y]) => lut2(l10, x, y), [a, c]);
    });
  }
  if (N === 'CC_L2T5') {
    const [l02, l03, l11, l20] = ['INIT_L02', 'INIT_L03', 'INIT_L11', 'INIT_L20'].map(iv);
    return comb(ins('I0', 'I1', 'I2', 'I3', 'I4'), outs('O'), () => {
      const a = tryAll(([x, y]) => lut2(l02, x, y), [pin('I0'), pin('I1')]), c = tryAll(([x, y]) => lut2(l03, x, y), [pin('I2'), pin('I3')]);
      const e = tryAll(([x, y]) => lut2(l11, x, y), [a, c]);
      return tryAll(([x, y]) => lut2(l20, x, y), [pin('I4'), e]);
    });
  }
  // (the multiplexers as the models' tree of 2:1 multiplexers, each X-pessimistic)
  const mux2 = (a, c, s) => (s === 1 ? c : s === 0 ? a : a !== 2 && a === c ? a : 2);
  if (N === 'CC_MX2') return comb(ins('D0', 'D1', 'S0'), outs('Y'), () => mux2(pin('D0'), pin('D1'), pin('S0')));
  if (N === 'CC_MX4') return comb(ins('D0', 'D1', 'D2', 'D3', 'S0', 'S1'), outs('Y'), () => mux2(mux2(pin('D0'), pin('D1'), pin('S0')), mux2(pin('D2'), pin('D3'), pin('S0')), pin('S1')));
  if (N === 'CC_MX8') {
    return comb(ins('D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'S0', 'S1', 'S2'), outs('Y'), () => {
      const s0 = pin('S0'), s1 = pin('S1');
      const lo = mux2(mux2(pin('D0'), pin('D1'), s0), mux2(pin('D2'), pin('D3'), s0), s1), hi = mux2(mux2(pin('D4'), pin('D5'), s0), mux2(pin('D6'), pin('D7'), s0), s1);
      return mux2(lo, hi, pin('S2'));
    });
  }
  if (N === 'CC_ADDF') {
    const s = outs('S'), co = outs('CO');
    return { inputs: ins('A', 'B', 'CI'), outputs: [...s, ...co], init: [],
      fn(sim) {
        const x = [pin('A'), pin('B'), pin('CI')];
        set(sim, s, x.includes(2) ? 2 : x[0] ^ x[1] ^ x[2]);
        set(sim, co, tryAll(([a, c, i]) => (a + c + i >= 2 ? 1 : 0), x));
      } };
  }
  if (N === 'CC_DFF') {
    const clk = P.get('CLK'), d = P.get('D'), q = P.get('Q'), en = P.get('EN'), sr = P.get('SR');
    if (!clk || !d || !q) return null;
    const one = (k) => bit(param(k) ?? VAL[0]) === 1;
    const edge = one('CLK_INV') ? falling : rising, enInv = one('EN_INV'), srInv = one('SR_INV'), srVal = one('SR_VAL') ? 1 : 0;
    const init = one('INIT') ? 1 : 0;   // (1'hx, none: 0, as the model)
    const inv = (x, i) => (x === 2 ? 2 : i ? 1 - x : x);
    return {
      inputs: [clk, ...(sr ? [sr] : [])],   // (d and en sampled at the edge)
      outputs: [q],
      init: [[q, VAL[init]]],
      fn(sim) {
        if (inv(sr ? bit(sr.val) : 0, srInv) === 1) return set(sim, [q], srVal);
        if (!edge(sim, clk)) return;
        const e = inv(en ? bit(en.val) : 1, enInv);
        if (e === 1) set(sim, [q], bit(d.val));
        else if (e === 2) set(sim, [q], 2);
      },
    };
  }
  switch (N) {
    case 'CC_IBUF': return comb(ins('I'), outs('Y'), () => b('I'));
    case 'CC_OBUF': return comb(ins('A'), outs('O'), () => b('A'));
    case 'CC_BUFG': return comb(ins('I'), outs('O'), () => b('I'));
    default: return null;
  }
}
