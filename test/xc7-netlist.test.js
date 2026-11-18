// The examples' post-synthesis netlists on the 7-series (#4362, the Basys 3's XC7A35T, #3146): each example synthesized by the
// 7-series' synthesis (Yosys's synth_xilinx -arch xc7, open-flow-xc7.js XC7.synth) with the generics its test bench gives it, its
// Verilog netlist (LUT1-6, FDRE, CARRY4, MUXF7 / 8, RAM32M, RAMB18E1, DSP48E1 …) simulated with Silinx's UNISIM models
// (packages/silinx-hdl/src/unisim.js, unisim-s6.js, unisim-xc7.js) in place of its RTL, through core/flow-models-nextpnr.js's
// withParameters as the Post-Synthesis model's step makes it: the test bench passes on it as on the RTL, no warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { flowFrontEnd } from '../core/synth-front.js';
import { dutGenerics } from '../core/sim-model.js';
import { Simulator } from '../core/simulator.js';
import { withParameters } from '../core/netlist-verilog.js';
import { XC7 } from '../packages/silinx-fpga/src/open-flow-xc7.js';
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
  return s.log.map((e) => `${e.kind === 'warning' ? 'WARNING: ' : e.kind === 'error' ? 'ERROR: ' : ''}${e.text}`);
}

const cellsSeen = new Set();
for (const name of EXAMPLES) {
  test(`example ${name}: its test bench passes on its 7-series post-synthesis netlist as on its RTL, no warning`, { timeout: 900000 }, async () => {
    const ex = example(name), top = ex.project.top;
    const design = ex.design.map(({ path, lang, text }) => ({ path, lang, text }));
    const sim = ex.sim.map(({ path, lang, text }) => ({ path, lang, text }));
    const all = [...design, ...sim];
    const g = dutGenerics(elaborate(compile([...primitiveSources(all), ...all]), ex.project.simTop), top);
    const fe = flowFrontEnd(design, top, { generics: g.generics });
    assert.deepEqual(fe.errors, [], name);
    const r = await XC7.synth(fe.input(), { run: yosysNode });
    for (const c of Object.keys(r.cells)) cellsSeen.add(c);
    const netlist = { path: `${top}_synthesis.v`, lang: 'verilog', text: withParameters(r.files[`${r.top}_yosys.v`], g.generics) };
    assert.deepEqual(primitiveSources([netlist]).map((s) => s.path), ['<silinx>/unisim.vhd'], name);
    const log = run([netlist, ...sim], ex.project.simTop);
    assert.ok(log.includes('Simulation finished OK'), `${name} netlist: ${log.slice(-3).join(' | ')}`);
    assert.deepEqual(log.filter((l) => /ERROR|WARNING/.test(l)), [], name);
  });
}

test('the examples\' 7-series netlists: the cells they are made of, each simulated above', () => {
  assert.deepEqual([...cellsSeen].sort(), ['BUFG', 'CARRY4', 'DSP48E1', 'FDCE', 'FDRE', 'FDSE', 'IBUF', 'INV', 'LUT1', 'LUT2', 'LUT3', 'LUT4', 'LUT5', 'LUT6',
    'MUXF7', 'MUXF8', 'OBUF', 'RAM32M', 'RAMB18E1']);
});
