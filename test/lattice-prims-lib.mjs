// The Lattice primitives' tests' harness (#2299: packages/silinx-hdl/src/ice40-prims.js, ecp5-prims.js): the Gowin's (gowin-prims-lib.mjs:
// cases of a primitive's instance and its pins' values step by step, the outputs expected computed in the test) with a
// family's own library: its test benches in Verilog and in VHDL (its library clause, as a user writes it), each simulated
// with Silinx's models of that family alone, its log exactly "done": no check failed, no warning.
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { verilogBench, vhdlBench } from './gowin-prims-lib.mjs';

const STEP = 10;
const steps = (cases) => Math.max(...cases.map((c) => c.steps.length));

/** The families: their library's file and VHDL library clause. */
export const FAMILIES = {
  ice40: { path: '<silinx>/ice40.vhd', clause: 'library sb_ice40_components_syn; use sb_ice40_components_syn.components.all;' },
  ecp5: { path: '<silinx>/ecp5.vhd', clause: 'library ecp5u; use ecp5u.components.all;' },
};

/** The cases' test benches (tb_<family>) in Verilog and VHDL. */
export function benches(family, cases) {
  const tb = `tb_${family}`;
  return {
    verilog: verilogBench(cases).replace(/tb_gowin/g, tb),
    vhdl: vhdlBench(cases).replace(/tb_gowin/g, tb).replace('library gw1n; use gw1n.components.all;', FAMILIES[family].clause),
  };
}

/** The cases simulated in both languages (langs): each log exactly "done", the family's library alone. */
export function checkCases(family, cases, label = '', langs = ['verilog', 'vhdl']) {
  const b = benches(family, cases);
  for (const lang of langs) {
    const srcs = [{ path: `tb_${family}.${lang === 'verilog' ? 'v' : 'vhd'}`, lang, text: b[lang] }];
    const prims = primitiveSources(srcs);
    assert.deepEqual(prims.map((s) => s.path), [FAMILIES[family].path], `${label} ${lang}`);
    const r = simulate([...prims, ...srcs], `tb_${family}`, { until: (steps(cases) * STEP + 5) * 1e6 });
    assert.deepEqual([...r.lib.errors, ...r.design.diags].map((d) => `${d.file}:${d.line} ${d.message}`), [], `${label} ${lang}`);
    assert.deepEqual(r.sim.log.map((e) => `${e.kind === 'warning' ? 'WARNING: ' : ''}${e.text}`), ['done'], `${label} ${lang}`);
  }
}

export { rng, bit } from './gowin-prims-lib.mjs';

/** A bus of scalar pins (DIA0, DIA1 …: the ECP5's block RAM and multiplier) as the harness's pins, inputs or outputs. */
export const busPins = (pre, n, dir) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${pre}${i}`, { dir, w: 1 }]));
/** A value v (a number, a BigInt or 'x') on a bus of scalar pins: { DIA0: bit, … }; as the expected outputs, their bits as strings. */
export const busVal = (pre, n, v, out = false) => Object.fromEntries(Array.from({ length: n }, (_, i) => {
  const b = v === 'x' ? 'x' : Number((BigInt(v) >> BigInt(i)) & 1n);
  return [`${pre}${i}`, out ? String(b) : b];
}));
