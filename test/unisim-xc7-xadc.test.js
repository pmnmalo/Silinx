// The XADC's simulation model (#5385, packages/silinx-hdl/src/unisim-xc7.js), against UG480: elaborated alone with no
// message; a conversion every 26 ADCCLK cycles (DCLK / CLKDIV), EOC one DCLK at its end with CHANNEL; the codes computed
// here from UG480's transfer functions (the temperature (T + 273.15) × 4096 / 503.975, a supply V × 4096 / 3, a unipolar
// input V × 4096) read on the DRP, MSB-justified, DRDY a DCLK later; its default mode's sequence (temperature, VCCINT,
// VCCAUX, EOS), a continuous sequence of INIT_48 / INIT_49's channels, a single channel set by DRP writes; an analog input
// forced (as the Board Emulator does) converted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { UNISIM_SOURCE, primitiveSources } from '../core/unisim.js';

const tempCode = (c) => Math.floor((c * 1000 + 273150) * 4096 / 503975);
const supplyCode = (mv) => Math.floor(mv * 4096 / 3000);
const inputCode = (mv) => Math.min(4095, Math.floor(mv * 4096 / 1000));

/** An XADC in a Verilog module with its INIT_40, 41, 42, 48 and 49: { cycle(): one DCLK, its outputs after it; read(a),
 *  write(a, v) over the DRP; force(name, mv, k) an analog value }. */
function xadc({ i40 = 0, i41 = 0, i42 = 0x0200, i48 = 0, i49 = 0 } = {}) {
  const h = (v) => `16'h${v.toString(16).padStart(4, '0')}`;
  const text = `module t(input clk, den, dwe, input [6:0] addr, input [15:0] di, output [15:0] do_, output drdy, eoc, eos, busy, output [4:0] ch);
  XADC #(.INIT_40(${h(i40)}), .INIT_41(${h(i41)}), .INIT_42(${h(i42)}), .INIT_48(${h(i48)}), .INIT_49(${h(i49)})) x (.DCLK(clk), .DEN(den), .DWE(dwe), .DADDR(addr), .DI(di),
    .DO(do_), .DRDY(drdy), .EOC(eoc), .EOS(eos), .BUSY(busy), .CHANNEL(ch));
endmodule`;
  const srcs = [{ path: 't.v', lang: 'verilog', text }];
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  const d = elaborate(lib, 't');
  assert.deepEqual([...lib.errors, ...d.diags].map((x) => x.message), []);
  const s = new Simulator(d);
  const port = (n) => d.top.ports.find((p) => p.name === n).sig;
  const sig = (n) => d.signals.find((x) => x.name === n);
  let t = 0;
  const set = (n, v) => s.force(port(n), V.mk(port(n).t.w, BigInt(v)));
  for (const [n, v] of [['clk', 0], ['den', 0], ['dwe', 0], ['addr', 0], ['di', 0]]) set(n, v);
  s.run(t += 10);
  const get = (n) => Number(port(n).val.v);
  const cycle = () => { set('clk', 1); s.run(t += 5); set('clk', 0); s.run(t += 5); return { eoc: get('eoc'), eos: get('eos'), ch: get('ch'), busy: get('busy') }; };
  const drp = (a, w = null) => { set('den', 1); set('addr', a); set('dwe', w == null ? 0 : 1); if (w != null) set('di', w); cycle(); set('den', 0); set('dwe', 0); const r = cycle(); return { do: get('do_'), drdy: get('drdy'), ...r }; };
  return {
    cycle, drp,
    // the next EOC: the cycles it took and its channel, EOS
    next: (max = 10000) => { for (let k = 1; k <= max; k++) { const r = cycle(); if (r.eoc) return { k, ch: r.ch, eos: r.eos }; } return null; },
    force: (name, mv, k = null) => { const x = sig(name); s.force(x, k == null ? V.mk(32, BigInt(mv)) : x.val.map((e, i) => (i === k ? V.mk(32, BigInt(mv)) : e))); s.run(t += 1); },
  };
}

test('the XADC: its default mode\'s sequence (temperature, VCCINT, VCCAUX), each conversion 26 ADCCLK cycles; their codes on the DRP', () => {
  const x = xadc({ i42: 0x0400 });   // (CLKDIV 4: 104 DCLK cycles a conversion)
  const seq = [x.next(), x.next(), x.next(), x.next()];
  assert.deepEqual(seq.map((r) => [r.ch, r.eos]), [[0, 0], [1, 0], [2, 1], [0, 0]]);
  assert.deepEqual(seq.slice(1).map((r) => r.k), [104, 104, 104]);
  const rd = x.drp(0x00);
  assert.equal(rd.drdy, 0, 'DRDY one DCLK, gone a DCLK later');
  assert.equal(rd.do, tempCode(25) << 4, '25 °C');
  assert.equal(x.drp(0x01).do, supplyCode(1000) << 4, 'VCCINT 1.0 V');
  assert.equal(x.drp(0x02).do, supplyCode(1800) << 4, 'VCCAUX 1.8 V');
  assert.equal(x.drp(0x42).do, 0x0400, 'a configuration register read back');
  assert.equal(x.drp(0x30).do, 0, 'another reads 0');
});

test('the XADC: a continuous sequence of INIT_48 and INIT_49\'s channels (the temperature, VP/VN, VAUX6), EOS at each pass\'s end; a forced input converted', () => {
  const x = xadc({ i41: 0x2000, i48: 0x0900, i49: 0x0040, i42: 0x0200 });
  x.force('vaux_mv', 500, 6);
  x.force('vp_mv', 250);
  x.force('temp_mc', 60000);
  const seq = Array.from({ length: 4 }, () => x.next());
  assert.deepEqual(seq.map((r) => [r.ch, r.eos]), [[0, 0], [3, 0], [22, 1], [0, 0]]);
  assert.equal(seq[1].k, 52, 'CLKDIV 2: 52 DCLK cycles');
  assert.equal(x.drp(0x16).do, inputCode(500) << 4, 'VAUX6 at 0.5 V: half scale');
  assert.equal(x.drp(0x03).do, inputCode(250) << 4, 'VP at 0.25 V');
  assert.equal(x.drp(0x00).do, tempCode(60) << 4, '60 °C');
});

test('the XADC: a single channel set over the DRP (41h, then 40h: VAUX2), its conversions, its value moved; a single pass stops', () => {
  const x = xadc();
  x.drp(0x40, 0x0012);
  x.drp(0x41, 0x3000);
  x.force('vaux_mv', 1200, 2);   // (over full scale: 4095)
  const a = [x.next(), x.next()];
  assert.deepEqual(a.map((r) => r.ch), [18, 18]);
  assert.equal(x.drp(0x12).do, 4095 << 4);
  x.force('vaux_mv', 100, 2);
  x.next();
  assert.equal(x.drp(0x12).do, inputCode(100) << 4);
  // a single pass (0001) over VCCINT and VCCAUX: two conversions, EOS, then none, not busy
  const y = xadc({ i41: 0x1000, i48: 0x0600 });
  assert.deepEqual([y.next(), y.next()].map((r) => [r.ch, r.eos]), [[1, 0], [2, 1]]);
  assert.equal(y.next(300), null, 'no more');
  assert.equal(y.cycle().busy, 0);
});

test('the XADC model elaborated alone with no message', () => {
  const lib = compile([UNISIM_SOURCE]);
  assert.deepEqual(lib.errors, []);
  assert.deepEqual(elaborate(lib, 'XADC').diags.map((d) => d.message), []);
});
