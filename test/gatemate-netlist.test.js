// The examples' post-synthesis netlists on the GateMate (#2431, #2299, the evaluation board's CCGM1A1): each example synthesized by
// the GateMate's synthesis (Yosys's synth_gatemate, open-flow-gatemate.js GATEMATE.synth) with the generics its test bench gives it, its
// Verilog netlist (CC_LUT1/2, CC_L2T4/5, CC_MX2/4, CC_ADDF, CC_DFF, CC_BRAM_20K, CC_MULT…) simulated with the GateMate primitives'
// models (packages/silinx-hdl/src/gatemate-prims.js, gatemate-bram.js) in place of its RTL: the test bench passes on it as on the RTL, no warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { flowFrontEnd } from '../core/synth-front.js';
import { dutGenerics } from '../core/sim-model.js';
import { Simulator } from '../core/simulator.js';
import { GATEMATE } from '../packages/silinx-fpga/src/open-flow-gatemate.js';
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
  test(`example ${name}: its test bench passes on its GateMate post-synthesis netlist as on its RTL, no warning`, { timeout: 900000 }, async () => {
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
    const r = await GATEMATE.synth(fe.input(), { run: yosysNode });
    for (const c of Object.keys(r.cells)) cellsSeen.add(c);
    const gens = Object.entries(g.generics);
    const net = r.files[`${r.top}_yosys.v`].replace(/^(module [^;]*;\n)/m, `$1${gens.map(([k, v]) => `  parameter ${k} = ${v};\n`).join('')}`);
    const netlist = { path: `${top}_gatemate.v`, lang: 'verilog', text: net };
    assert.deepEqual(primitiveSources([netlist]).map((s) => s.path), ['<silinx>/gatemate.vhd'], name);
    const log = run([netlist, ...sim], ex.project.simTop);
    assert.ok(log.includes('Simulation finished OK'), `${name} netlist: ${log.slice(-3).join(' | ')}`);
    assert.deepEqual(log.filter((l) => /ERROR|WARNING/.test(l)), [], name);
  });
}

test('the examples\' netlists: the GateMate cells they are made of, each simulated above', () => {
  assert.deepEqual([...cellsSeen].sort(), ['CC_ADDF', 'CC_BRAM_20K', 'CC_BUFG', 'CC_DFF', 'CC_IBUF', 'CC_L2T4', 'CC_L2T5', 'CC_LUT1', 'CC_LUT2', 'CC_MULT', 'CC_MX2', 'CC_MX4', 'CC_OBUF']);
});
