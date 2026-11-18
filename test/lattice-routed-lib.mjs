// The examples' post-place & route models on the iCE40, the ECP5 (#2299) and the Gowin (#4362): each example synthesized by the
// family's synthesis with the generics its test bench gives it, placed and routed by the family's back end (its placeRouteNetlist,
// as the Post-Place & Route model's step does it: nextpnr's --write JSON), made a model by core/flow-models-nextpnr.js routedModel
// (Yosys's write_verilog, the test bench's generics its parameters, the global buffers left out, each pad on a net of its own; the
// Gowin's cells as the models name them) and simulated with the family's models (packages/silinx-hdl/src/ice40-prims.js,
// ecp5-prims.js, gowin-prims.js: its packed cells ICESTORM_LC, TRELLIS_COMB …) in place of its RTL: the test bench passes on it as
// on the RTL, no warning. The ports have no pins (no constraints: the model is the same), but the Gowin's, whose nextpnr places no
// port without one: the board's (its CST).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { flowFrontEnd } from '../core/synth-front.js';
import { dutGenerics } from '../core/sim-model.js';
import { Simulator } from '../core/simulator.js';
import { routedModel } from '../core/flow-models-nextpnr.js';
import { StepError } from '../packages/silinx-fpga/src/index.js';
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

/** The tests of a family: backend (ICE40, ECP5), spec (its device), nextpnr (io.nextpnr's entry), library (its file), cells (the
 *  packed cells the examples' routed designs are made of), constraints (of an example: its back end's model of them, or null). */
export function routedTests({ name, backend, spec, nextpnr, library, cells, constraints = () => null }) {
  const seen = new Set();
  for (const ex of EXAMPLES) {
    test(`example ${ex}: its test bench passes on its ${name} post-place & route model as on its RTL, no warning`, { timeout: 900000 }, async () => {
      const e = example(ex), top = e.project.top;
      const design = e.design.map(({ path, lang, text }) => ({ path, lang, text })), sim = e.sim.map(({ path, lang, text }) => ({ path, lang, text }));
      const all = [...design, ...sim];
      const g = dutGenerics(elaborate(compile([...primitiveSources(all), ...all]), e.project.simTop), top);
      const fe = flowFrontEnd(design, top, { generics: g.generics });
      assert.deepEqual(fe.errors, [], ex);
      const r = await backend.synth(fe.input(), { run: yosysNode });
      const text = r.files[`${r.top}.json`];
      const ctx = { io: { nextpnr: nextpnr(), read: () => null, write: (n) => n }, spec, log: () => {}, report: { files: {} }, top: r.top, ms: () => '', now: () => 0,
        constraints: () => constraints(ex), netlistText: () => text, readNetlist: () => {}, util: (n, used, total) => ({ name: n, used, total, percent: 0 }), StepError };
      const routed = await backend.mount(ctx).placeRouteNetlist(text, r.top);
      for (const c of Object.values(Object.values(JSON.parse(routed).modules)[0].cells)) seen.add(c.type);
      const net = { path: `${top}_routed.v`, lang: 'verilog', text: await routedModel(routed, { family: spec.family || backend.id, run: yosysNode, name: r.top, generics: g.generics }) };
      assert.deepEqual(primitiveSources([net]).map((s) => s.path), [library], ex);
      const log = run([net, ...sim], e.project.simTop);
      assert.ok(log.includes('Simulation finished OK'), `${ex} model: ${log.slice(-3).join(' | ')}`);
      assert.deepEqual(log.filter((l) => /ERROR|WARNING/.test(l)), [], ex);
    });
  }
  test(`the examples' ${name} routed designs: the packed cells they are made of, each simulated above`, () => {
    assert.deepEqual([...seen].sort(), cells);
  });
}
