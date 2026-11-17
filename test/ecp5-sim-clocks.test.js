// The ECP5's clock primitives' simulation models (#2299: packages/silinx-hdl/src/ecp5-prims.js EHXPLLL, OSCG): their outputs'
// periods and phases measured on the simulation's waveforms, from Verilog and from VHDL, against the settings, frequencies and
// phases Project Trellis's ecppll computes (@yowasp/nextpnr-ecp5's: the PLL for given frequencies and phases) and against
// values worked out by hand (Lattice's TN1263: OSCG's 310 MHz / DIV).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { runEcppll } from '@yowasp/nextpnr-ecp5';

const CLAUSE = 'library ecp5u; use ecp5u.components.all;';
const vlogParam = (v) => (typeof v === 'string' ? `"${v}"` : String(v));
const vhdlParam = vlogParam;
// a test bench of one instance whose outputs are the signals o_<pin>, in Verilog or VHDL; the clock `clk` (its pin) of
// `half` ps, its other inputs tied (`tie`: [pin, 0 / 1])
function bench(lang, cell, params, outs, { clk = null, half = 20000, tie = [] } = {}) {
  const conns = [...(clk ? [[clk, 'clk']] : []), ...tie.map(([p, v]) => [p, lang === 'verilog' ? `1'b${v}` : `'${v}'`]), ...outs.map((o) => [o, `o_${o}`])];
  if (lang === 'verilog') {
    const ps = params.map(([k, v]) => `.${k}(${vlogParam(v)})`).join(', ');
    return `\`timescale 1ps / 1ps
module tb;
  reg clk = 0;
${outs.map((o) => `  wire o_${o};`).join('\n')}
${clk ? `  always #${half} clk = ~clk;\n` : ''}  ${cell} ${ps ? `#(${ps}) ` : ''}u (${conns.map(([p, s]) => `.${p}(${s})`).join(', ')});
endmodule
`;
  }
  const gm = params.map(([k, v]) => `${k} => ${vhdlParam(v)}`).join(', ');
  return `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
${CLAUSE}
entity tb is
end tb;
architecture t of tb is
  signal clk : std_logic := '0';
${outs.map((o) => `  signal o_${o} : std_logic;`).join('\n')}
begin
${clk ? `  clk <= not clk after ${half} ps;\n` : ''}  u : ${cell} ${gm ? `generic map (${gm}) ` : ''}port map (${conns.map(([p, s]) => `${p} => ${s}`).join(', ')});
end t;
`;
}
// the rising and falling edges' times (ps) of each output, from `from` ps on; the simulation's log
function run(lang, text, outs, until, from = 0) {
  const srcs = [{ path: lang === 'verilog' ? 'tb.v' : 'tb.vhd', lang, text }];
  const prims = primitiveSources(srcs);
  assert.deepEqual(prims.map((s) => s.path), ['<silinx>/ecp5.vhd']);
  const r = simulate([...prims, ...srcs], 'tb', { until });
  assert.deepEqual([...r.lib.errors, ...r.design.diags].map((d) => d.message), [], lang);
  const edges = {};
  for (const o of outs) {
    const s = r.design.signals.find((x) => x.name.toLowerCase() === `o_${o}`.toLowerCase());
    const rise = [], fall = [];
    s.wave.t.forEach((t, i) => { if (t < from) return; const b = String(s.wave.v[i].v ?? s.wave.v[i]); (/1/.test(b) && !(s.wave.v[i].x) ? rise : fall).push(t); });
    edges[o] = { rise, fall };
  }
  return { edges, log: r.sim.log.map((e) => `${e.kind === 'warning' ? 'WARNING: ' : ''}${e.text}`) };
}
const period = ({ rise }) => (rise.at(-1) - rise[0]) / (rise.length - 1);
const duty = ({ rise, fall }) => { const r = rise.at(-2), f = fall.find((t) => t > r); return (f - r) / period({ rise }); };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a}, expected ${b} ± ${tol}`);

// ecppll's PLL for a 25 MHz CLKI (the ULX3S's): its generics, as the Verilog it writes gives them
async function ecppll(args) {
  const files = await runEcppll(['-i', '25', ...args, '-f', 'pll.v'], {}, { stdout: () => {}, stderr: () => {}, fetchProgress: () => {} });
  const v = typeof files['pll.v'] === 'string' ? files['pll.v'] : new TextDecoder().decode(files['pll.v']);
  return [...v.matchAll(/\.([A-Z0-9_]+)\(("[^"]*"|\d+)\)/g)].filter(([, k]) => !/^(RST|STDBY|CLK|PHASE|PLLWAKESYNC|ENCLK|LOCK)/.test(k) || /_(DIV|CPHASE|FPHASE|ENABLE)$/.test(k))
    .map(([, k, x]) => [k, x.startsWith('"') ? x.slice(1, -1) : Number(x)]);
}

test('EHXPLLL: CLKOP and CLKOS at the frequencies and phases ecppll set it for, LOCK after 3 of CLKI\'s edges; RST holds them low', async () => {
  const tin = 2 * 20000;   // 25 MHz
  for (const [op, os, ph] of [[125, 25, 90], [50, 100, 180], [40, 40, 45]]) {
    const params = await ecppll(['-o', String(op), '--clkout1', String(os), '--phase1', String(ph)]);
    for (const lang of ['verilog', 'vhdl']) {
      const outs = ['CLKOP', 'CLKOS'];
      const { edges, log } = run(lang, bench(lang, 'EHXPLLL', params, outs, { clk: 'CLKI' }), outs, 60 * tin, 20 * tin);
      assert.deepEqual(log, [], lang);
      near(1e6 / period(edges.CLKOP), op, op * 1e-4, `${lang} CLKOP ${op} MHz`);
      near(1e6 / period(edges.CLKOS), os, os * 1e-4, `${lang} CLKOS ${os} MHz`);
      near(duty(edges.CLKOP), 0.5, 0.01, `${lang} CLKOP's duty cycle`);
      // CLKOP's rising edges on CLKI's (at tin / 2, 3 tin / 2 …: every CLKI_DIV-th one, the frequencies' ratio), CLKOS's its period ×
      // ph / 360 after them (to ecppll's eighth of a VCO cycle); a phase within a period: the distance around it
      const p = period(edges.CLKOS);
      const off = (t, t0, per, want) => { const d = (((t - t0 - want) % per) + per) % per; return Math.min(d, per - d); };
      const t0 = edges.CLKOP.rise.find((t) => off(t, tin / 2, tin, 0) <= 2);
      assert.ok(t0 !== undefined, `${lang} CLKOP on CLKI's edges`);
      near(off(edges.CLKOS.rise.find((t) => t >= t0), t0, p, p * ph / 360), 0, p / 64 + 2, `${lang} CLKOS's ${ph}°`);
    }
  }
  const params = await ecppll(['-o', '100']);
  const { edges } = run('verilog', bench('verilog', 'EHXPLLL', params, ['LOCK', 'CLKOP'], { clk: 'CLKI' }), ['LOCK', 'CLKOP'], 6 * tin);
  assert.deepEqual(edges.LOCK.rise, [2.5 * tin]);
  assert.equal(edges.CLKOP.rise[0], 3.5 * tin);
  const held = run('verilog', bench('verilog', 'EHXPLLL', params, ['LOCK', 'CLKOP'], { clk: 'CLKI', tie: [['RST', 1]] }), ['LOCK', 'CLKOP'], 10 * tin);
  assert.deepEqual([held.edges.CLKOP.rise, held.edges.LOCK.rise], [[], []]);
});

test('OSCG: 310 MHz / DIV', () => {
  for (const lang of ['verilog', 'vhdl']) {
    for (const div of [128, 10, 2]) {
      const mhz = 310 / div;
      const { edges, log } = run(lang, bench(lang, 'OSCG', [['DIV', div]], ['OSC']), ['OSC'], 10e6 / mhz);
      assert.deepEqual(log, [], lang);
      near(1e6 / period(edges.OSC), mhz, mhz * 1e-3, `${lang} OSCG ${div}`);
    }
  }
});
