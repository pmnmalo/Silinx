// The examples' post-synthesis netlists on the ECP5 (#2299, the ULX3S's LFE5U-85F, #2302): each example synthesized by the
// ECP5's synthesis (Yosys's synth_ecp5, open-flow-ecp5.js ECP5.synth) with the generics its test bench gives it, its Verilog
// netlist (LUT4, PFUMX, L6MUX21, CCU2C, TRELLIS_FF, TRELLIS_DPR16X4, DP16KD, MULT18X18D) simulated with the ECP5 primitives'
// models (packages/silinx-hdl/src/ecp5-prims.js) in place of its RTL: the test bench passes on it as on the RTL, no warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { flowFrontEnd } from '../core/synth-front.js';
import { dutGenerics } from '../core/sim-model.js';
import { Simulator } from '../core/simulator.js';
import { ECP5 } from '../packages/silinx-fpga/src/open-flow-ecp5.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { EXAMPLES, example } from './examples-lib.mjs';

// a test bench's run: its log (warnings and errors marked), until it says it finished or failed
function run(sources, top, until = 1e11) {
  const lib = compile([...primitiveSources(sources), ...sources]);
  const d = elaborate(lib, top);
  assert.deepEqual([...lib.errors, ...d.diags].map((x) => `${x.file}:${x.line} ${x.message}`), [], top);
  const s = new Simulator(d);
  for (const sig of d.signals) sig.wave = null;
  for (let t = until / 100; t <= until; t += until / 100) { const st = s.run(t); if (st.finished || s.log.some((e) => /Simulation finished OK|ERROR/.test(e.text))) break; }
  // (a test bench's assertion of severity error, its text without the word: ERROR)
  return s.log.map((e) => `${e.kind === 'warning' ? 'WARNING: ' : e.kind === 'error' ? 'ERROR: ' : ''}${e.text}`);
}

const cellsSeen = new Set();
for (const name of EXAMPLES) {
  test(`example ${name}: its test bench passes on its ECP5 post-synthesis netlist as on its RTL, no warning`, { timeout: 900000 }, async () => {
    const ex = example(name), top = ex.project.top;
    const design = ex.design.map(({ path, lang, text }) => ({ path, lang, text }));
    const sim = ex.sim.map(({ path, lang, text }) => ({ path, lang, text }));
    const rtl = run([...design, ...sim], ex.project.simTop);
    assert.ok(rtl.includes('Simulation finished OK'), `${name} RTL: ${rtl.slice(-3).join(' | ')}`);
    // (synthesized with the test bench's generics, declared in the netlist: the test bench's generic map fits it)
    const all = [...design, ...sim];
    const g = dutGenerics(elaborate(compile([...primitiveSources(all), ...all]), ex.project.simTop), top);
    const fe = flowFrontEnd(design, top, { generics: g.generics });
    assert.deepEqual(fe.errors, [], name);
    const r = await ECP5.synth(fe.input(), { run: yosysNode });
    for (const c of Object.keys(r.cells)) cellsSeen.add(c);
    const gens = Object.entries(g.generics);
    const net = r.files[`${r.top}_yosys.v`].replace(/^(module [^;]*;\n)/m, `$1${gens.map(([k, v]) => `  parameter ${k} = ${v};\n`).join('')}`);
    const netlist = { path: `${top}_ecp5.v`, lang: 'verilog', text: net };
    assert.deepEqual(primitiveSources([netlist]).map((s) => s.path), ['<silinx>/ecp5.vhd'], name);
    const log = run([netlist, ...sim], ex.project.simTop);
    assert.ok(log.includes('Simulation finished OK'), `${name} netlist: ${log.slice(-3).join(' | ')}`);
    assert.deepEqual(log.filter((l) => /ERROR|WARNING/.test(l)), [], name);
  });
}

test('the examples\' netlists: the ECP5 cells they are made of, each simulated above', () => {
  assert.deepEqual([...cellsSeen].sort(), ['CCU2C', 'DP16KD', 'L6MUX21', 'LUT4', 'MULT18X18D', 'PFUMX', 'TRELLIS_DPR16X4', 'TRELLIS_FF']);
});
