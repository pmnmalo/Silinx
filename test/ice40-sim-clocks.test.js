// The iCE40's clock primitives' simulation models (#2299: packages/silinx-hdl/src/ice40-prims.js SB_PLL40_*, SB_HFOSC,
// SB_LFOSC): their outputs' periods and phases measured on the simulation's waveforms, from Verilog and from VHDL, against
// the dividers and frequencies IceStorm's icepll computes (@yowasp/nextpnr-ice40's: the PLL's settings for a frequency) and
// against values worked out by hand (Lattice's TN1251 and the oscillators' 48 MHz and 10 kHz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { runIcepll } from '@yowasp/nextpnr-ice40';

const CLAUSE = 'library sb_ice40_components_syn; use sb_ice40_components_syn.components.all;';
const vlogParam = (v) => (typeof v === 'string' ? `"${v}"` : `${v.w}'b${v.v.toString(2).padStart(v.w, '0')}`);
const vhdlParam = (v) => (typeof v === 'string' ? `"${v}"` : `"${v.v.toString(2).padStart(v.w, '0')}"`);
// a test bench of one instance whose outputs are the signals o_<pin>, in Verilog or VHDL; the clock `clk` (its pin) of
// `half` ps, its other inputs tied (`tie`: [pin, 0 / 1])
function bench(lang, cell, params, outs, { clk = null, half = 41667, tie = [] } = {}) {
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
  assert.deepEqual(prims.map((s) => s.path), ['<silinx>/ice40.vhd']);
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

// icepll's settings for a frequency out of 12 MHz: { DIVR, DIVF, DIVQ, FILTER_RANGE, achieved (MHz) }
async function icepll(mhz) {
  let out = '';
  const take = (b) => { if (b) out += new TextDecoder().decode(b); };
  await runIcepll(['-i', '12', '-o', String(mhz)], {}, { stdout: take, stderr: take, fetchProgress: () => {} });
  const num = (re) => Number(re.exec(out)[1]);
  return { DIVR: num(/DIVR:\s*(\d+)/), DIVF: num(/DIVF:\s*(\d+)/), DIVQ: num(/DIVQ:\s*(\d+)/), FILTER_RANGE: num(/FILTER_RANGE:\s*(\d+)/), achieved: num(/F_PLLOUT:\s*([\d.]+) MHz \(achieved\)/) };
}

test('SB_PLL40_CORE / PAD: the reference × (DIVF + 1) / ((DIVR + 1) × 2^DIVQ), as icepll computes it; LOCK after 3 edges; re-aligned to the reference', async () => {
  const tin = 2 * 41667;   // 12 MHz (the iCEBreaker's), to the picosecond
  for (const mhz of [30, 48, 100]) {
    const s = await icepll(mhz);
    const params = [['FEEDBACK_PATH', 'SIMPLE'], ['DIVR', { w: 4, v: s.DIVR }], ['DIVF', { w: 7, v: s.DIVF }], ['DIVQ', { w: 3, v: s.DIVQ }], ['FILTER_RANGE', { w: 3, v: s.FILTER_RANGE }]];
    const ratio = (s.DIVF + 1) / ((s.DIVR + 1) * 2 ** s.DIVQ);
    near(12 * ratio, s.achieved, 0.001, `icepll's ${mhz} MHz`);
    for (const lang of ['verilog', 'vhdl']) {
      for (const [cell, ref] of [['SB_PLL40_CORE', 'REFERENCECLK'], ['SB_PLL40_PAD', 'PACKAGEPIN']]) {
        const { edges, log } = run(lang, bench(lang, cell, params, ['PLLOUTGLOBAL', 'PLLOUTCORE'], { clk: ref, tie: [['RESETB', 1]] }), ['PLLOUTGLOBAL', 'PLLOUTCORE'], 40 * tin, 8 * tin);
        assert.deepEqual(log, [], `${lang} ${cell}`);
        near(1e6 / period(edges.PLLOUTGLOBAL), s.achieved, s.achieved * 1e-4, `${lang} ${cell} ${mhz} MHz`);
        near(1e6 / period(edges.PLLOUTCORE), s.achieved, s.achieved * 1e-4, `${lang} ${cell} ${mhz} MHz (core)`);
        near(duty(edges.PLLOUTGLOBAL), 0.5, 0.01, `${lang} ${cell}'s duty cycle`);
      }
    }
  }
  // LOCK high from the reference's third rising edge on, the output's first edge with it (the reference rises at tin / 2, 3 tin / 2…)
  const params = [['DIVR', { w: 4, v: 0 }], ['DIVF', { w: 7, v: 3 }], ['DIVQ', { w: 3, v: 0 }]];
  const { edges } = run('verilog', bench('verilog', 'SB_PLL40_CORE', params, ['LOCK', 'PLLOUTCORE'], { clk: 'REFERENCECLK', tie: [['RESETB', 1]] }), ['LOCK', 'PLLOUTCORE'], 6 * tin);
  assert.deepEqual(edges.LOCK.rise, [2.5 * tin]);
  assert.equal(edges.PLLOUTCORE.rise[0], 3.5 * tin);
  near(period(edges.PLLOUTCORE), tin / 4, 1, '×4');
});

test('SB_PLL40_2F_CORE / 2_PAD: GENCLK, GENCLK_HALF, SHIFTREG_0deg / 90deg (÷4, a quarter later); the other feedback paths not ÷ 2^DIVQ; BYPASS; RESETB', () => {
  const tin = 2 * 41667;
  const base = [['DIVR', { w: 4, v: 0 }], ['DIVF', { w: 7, v: 7 }], ['DIVQ', { w: 3, v: 1 }]];   // ×8 / 2: 48 MHz
  for (const lang of ['verilog', 'vhdl']) {
    const outs = ['PLLOUTCOREA', 'PLLOUTCOREB'];
    const half = run(lang, bench(lang, 'SB_PLL40_2F_CORE', [...base, ['PLLOUT_SELECT_PORTA', 'GENCLK'], ['PLLOUT_SELECT_PORTB', 'GENCLK_HALF']], outs,
      { clk: 'REFERENCECLK', tie: [['RESETB', 1]] }), outs, 20 * tin, 6 * tin);
    assert.deepEqual(half.log, [], lang);
    near(period(half.edges.PLLOUTCOREA), tin / 4, 1, `${lang} A 48 MHz`);
    near(period(half.edges.PLLOUTCOREB), tin / 2, 1, `${lang} B 24 MHz`);
    const sh = run(lang, bench(lang, 'SB_PLL40_2F_CORE', [...base, ['FEEDBACK_PATH', 'PHASE_AND_DELAY'], ['PLLOUT_SELECT_PORTA', 'SHIFTREG_0deg'], ['PLLOUT_SELECT_PORTB', 'SHIFTREG_90deg']], outs,
      { clk: 'REFERENCECLK', tie: [['RESETB', 1]] }), outs, 20 * tin, 6 * tin);
    // PHASE_AND_DELAY: ×8 (not ÷ 2^DIVQ), then ÷4: 24 MHz; B a quarter of its period after A
    near(period(sh.edges.PLLOUTCOREA), tin / 2, 1, `${lang} SHIFTREG_0deg`);
    near(period(sh.edges.PLLOUTCOREB), tin / 2, 1, `${lang} SHIFTREG_90deg`);
    const a0 = sh.edges.PLLOUTCOREA.rise[0];
    near(sh.edges.PLLOUTCOREB.rise.find((t) => t >= a0) - a0, tin / 8, 1, `${lang} 90°`);
    // SB_PLL40_2_PAD: port A the pad's clock, B the PLL's
    const pad = run(lang, bench(lang, 'SB_PLL40_2_PAD', base, outs, { clk: 'PACKAGEPIN', tie: [['RESETB', 1]] }), outs, 20 * tin, 6 * tin);
    near(period(pad.edges.PLLOUTCOREA), tin, 1, `${lang} 2_PAD's A`);
    near(period(pad.edges.PLLOUTCOREB), tin / 4, 1, `${lang} 2_PAD's B`);
    // BYPASS: the reference; RESETB low: no edge, LOCK low
    const by = run(lang, bench(lang, 'SB_PLL40_CORE', base, ['PLLOUTCORE'], { clk: 'REFERENCECLK', tie: [['RESETB', 1], ['BYPASS', 1]] }), ['PLLOUTCORE'], 10 * tin);
    assert.ok(by.edges.PLLOUTCORE.rise.length === 10 && by.edges.PLLOUTCORE.rise.every((t) => (t - tin / 2) % tin === 0), `${lang} BYPASS`);
    const held = run(lang, bench(lang, 'SB_PLL40_CORE', base, ['PLLOUTCORE', 'LOCK'], { clk: 'REFERENCECLK', tie: [['RESETB', 0]] }), ['PLLOUTCORE', 'LOCK'], 10 * tin);
    assert.deepEqual([held.edges.PLLOUTCORE.rise, held.edges.LOCK.rise], [[], []], lang);
  }
});

test('SB_HFOSC: 48 MHz / 2^CLKHF_DIV while CLKHFEN and CLKHFPU; SB_LFOSC: 10 kHz while CLKLFEN and CLKLFPU', () => {
  for (const lang of ['verilog', 'vhdl']) {
    for (const [div, mhz] of [['0b00', 48], ['0b01', 24], ['0b10', 12], ['0b11', 6]]) {
      const { edges, log } = run(lang, bench(lang, 'SB_HFOSC', [['CLKHF_DIV', div]], ['CLKHF'], { tie: [['CLKHFEN', 1], ['CLKHFPU', 1]] }), ['CLKHF'], 10e6 / mhz);
      assert.deepEqual(log, [], lang);
      near(1e6 / period(edges.CLKHF), mhz, mhz * 1e-3, `${lang} SB_HFOSC ${div}`);
      near(duty(edges.CLKHF), 0.5, 0.01, `${lang} SB_HFOSC's duty cycle`);
    }
    const lf = run(lang, bench(lang, 'SB_LFOSC', [], ['CLKLF'], { tie: [['CLKLFEN', 1], ['CLKLFPU', 1]] }), ['CLKLF'], 5e8);
    near(1e6 / period(lf.edges.CLKLF), 0.01, 1e-6, `${lang} SB_LFOSC`);
    const off = run(lang, bench(lang, 'SB_HFOSC', [], ['CLKHF'], { tie: [['CLKHFEN', 0], ['CLKHFPU', 1]] }), ['CLKHF'], 1e6);
    assert.deepEqual(off.edges.CLKHF.rise, [], lang);
  }
});
