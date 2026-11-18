// Silinx - the simulation models of the iCE40's, ECP5's, Gowin's (#2299, #4362; hidden until now, #3707), GateMate's (#2431) and 7-series' flows: the
// Post-Synthesis model, the family's synthesis's netlist (Yosys's write_verilog: its cells, SB_LUT4, TRELLIS_FF, DFFE, FDRE …),
// and the Post-Place & Route model, nextpnr's routed design (its --write JSON, through Yosys's write_verilog: its packed cells,
// ICESTORM_LC, TRELLIS_COMB …), each simulated with Silinx's models of the family's cells (packages/silinx-hdl/src/
// ice40-prims.js, ecp5-prims.js, gowin-prims.js, gatemate-prims.js; the 7-series' UNISIM ones, unisim.js, unisim-s6.js,
// unisim-xc7.js). The 7-series' routed design is made of its sites' cells (SLICE_LUTX, SLICE_FFX …), made UNISIM's cells again
// (#4362, core/xc7-routed.js); the GateMate's Post-Synthesis model only (#2431: nextpnr-himbaechel-gatemate's routed design is
// made of its CPEs, which Silinx does not model). No timing (no SDF). As core/flow-models.js's of the Spartan flows:
//   - the design they are made of: synthesized with the generics the test bench (spec.simTop) gives its instance of the
//     top, declared as the netlist's parameters (its generic map gives them again); without any, this run's synthesis (or the
//     last run's, in build/open) and this run's routed design (or the last run's, build/open/routed.json);
//   - the board's model beside one made with the test bench's generics (#622): the design's own, for the Board Emulator;
//   - build/netgen/synthesis/<top>_synthesis.v and build/netgen/par/<top>_timesim.v (Verilog only: Yosys writes no VHDL).
import { StepError } from '../packages/silinx-fpga/src/index.js';
import { compile, elaborate } from './compile.js';
import { flowFrontEnd } from './synth-front.js';
import { dutGenerics } from './sim-model.js';
import { primitiveSources } from './unisim.js';
import { globalBuffers, gowinAluModes, padNets, routedVerilog, withParameters } from './netlist-verilog.js';
import { gowinRoutedCells } from './gowin-routed.js';
import { xc7RoutedCells } from './xc7-routed.js';

/** The families whose flows make these models (nextpnr's routed design, a library of Silinx's models of their cells). */
export const NEXTPNR_MODEL_FAMILIES = new Set(['ice40', 'ecp5', 'gowin', 'artix7', 'gatemate']);
const CELLS = { ice40: 'iCE40', ecp5: 'ECP5', gowin: 'Gowin', artix7: '7-series', gatemate: 'GateMate' };
// the models a family's flow makes: the Post-Synthesis and Post-Place & Route ones, the GateMate's Post-Synthesis one (#2431)
const nextpnrModels = (family) => (family === 'gatemate' ? ['postsynth'] : ['postsynth', 'postpar']);
const NAMES = { postsynth: 'Post-Synthesis', postpar: 'Post-Place & Route' };

/** The Post-Place & Route model of nextpnr's routed design (its JSON) on a family: its Verilog (run: io.yosys), its module `name`
 *  with `generics` its parameters, the global buffers left out, each pad on a net of its own; the Gowin's cells as nextpnr
 *  names them made the models' again, its ALU chains' ends their LUTs, and the 7-series' sites' cells UNISIM's (#4362). */
export async function routedModel(routed, { family, run, name, generics = {} }) {
  const gowin = family === 'gowin';
  const cells = gowin ? gowinRoutedCells(routed) : family === 'artix7' ? xc7RoutedCells(routed) : routed;
  const v = withParameters(await routedVerilog(cells, run, name), generics);
  return padNets(globalBuffers(gowin ? gowinAluModes(v) : v));
}

/** { runPostSynth, runPostPar } of runOpenFlow on these families (ctx: core/flow-models.js mountSimModels'). */
export function mountNextpnrModels(ctx) {
  const { io, spec, log, report, synth, top, synthesizeModel, placeRouteNetlist } = ctx;
  const cells = `${CELLS[spec.family] || spec.family} cells`;

  // the test bench's generics for the top, once per run (core/flow-models.js's)
  let gen = null, modelSynth = null;
  function generics() {
    if (gen) return gen;
    gen = { generics: {}, testbench: null };
    const srcs = io.sources(), sims = io.simSources ? io.simSources() : [];
    if (spec.simTop && sims.length) {
      const all = [...srcs, ...sims];
      const tb = elaborate(compile([...primitiveSources(all), ...all]), spec.simTop);
      const g = tb.top ? dutGenerics(tb, top) : null;
      if (g) {
        gen = { generics: g.generics, testbench: spec.simTop };
        if (g.skipped.length) log(`WARNING:Silinx - the test bench '${spec.simTop}' gives ${g.skipped.join(', ')} values that are not integers: the model is synthesized with their defaults`);
      } else log(`INFO:Silinx - the test bench '${spec.simTop}' has no instance of '${top}': the model is synthesized with its own generics`);
    }
    return gen;
  }
  async function synthesizeWith(g) {
    const fe = flowFrontEnd(io.sources(), top, { generics: g });
    if (fe.errors.length) throw new StepError('the design has errors', fe.errors, 'Fix them (Check Syntax shows them in the Errors tab).');
    try { return await synthesizeModel(fe.input()); } catch (e) {
      for (const l of e.lines || []) if (/ERROR/.test(l)) log(l);
      throw new StepError(`synthesis failed: ${e.message}`);
    }
  }
  // the synthesis of an earlier run (build/open): its netlist's JSON and Verilog, its top the elaborated top's name; or null
  function earlierSynth() {
    const json = io.read(`open/${top}.json`);
    if (json == null) return null;
    const mods = JSON.parse(json).modules || {};
    const name = Object.keys(mods).find((k) => mods[k].attributes?.top) || top;
    const v = io.read(`open/${name}_yosys.v`);
    return v == null ? null : { top: name, files: { [`${name}.json`]: json, [`${name}_yosys.v`]: v } };
  }
  const ownSynth = async () => synth() || earlierSynth() || (log(`Synthesizing '${top}' with its own generics, for the Board Emulator`), synthesizeWith({}));
  // the design the models are made of: { synth, own (synthesized with the test bench's generics), generics, testbench }
  async function design() {
    const { generics: g, testbench } = generics();
    const given = Object.keys(g).length > 0;
    if (!given) {
      const s = synth() || earlierSynth();
      if (s) return { synth: s, own: false, generics: g, testbench };
    }
    if (!modelSynth) {
      if (given) log(`Synthesizing '${top}' with the generics the test bench '${testbench}' gives: ${Object.entries(g).map(([k, v]) => `${k} = ${v}`).join(', ')}`);
      modelSynth = await synthesizeWith(g);
    }
    return { synth: modelSynth, own: given, generics: g, testbench };
  }
  // a model's Verilog (and the board's, when it is another), in the report and the log
  function writeModel(step, dir, suffix, title, d, verilog, board, count) {
    const v = io.write(`netgen/${dir}/${top}_${suffix}.v`, verilog);
    const b = board != null ? io.write(`netgen/${dir}/${top}_${suffix}_board.v`, board) : null;
    report.simModels = { ...(report.simModels || {}), [step]: { path: v, verilog: v, ...(d.own ? { testbench: d.testbench, generics: d.generics } : {}), ...(b ? { board: { path: b, verilog: b } } : {}) } };
    log(`${title} Simulation Model: ${v} (Verilog, the ${cells}), ${count}`);
    if (b) log(`${title} model for the Board Emulator, with the design's own generics: ${b}`);
  }
  // the cells of a netlist's top (Yosys's JSON, or nextpnr's)
  const cellCount = (json) => {
    const mods = Object.values(JSON.parse(json).modules || {});
    return Object.keys((mods.find((m) => m.attributes?.top) || mods[0])?.cells || {}).length;
  };

  // Generate Post-Synthesis Simulation Model: the synthesis's netlist
  async function runPostSynth() {
    const d = await design();
    const own = d.own ? await ownSynth() : null;
    const verilog = withParameters(d.synth.files[`${d.synth.top}_yosys.v`], d.generics);
    writeModel('postsynth', 'synthesis', 'synthesis', 'Post-Synthesis', d, verilog, own && own.files[`${own.top}_yosys.v`],
      `${cellCount(d.synth.files[`${d.synth.top}.json`])} cells`);
  }

  // the routed design of a netlist: this run's (or the last run's) for the implementation's, else placed and routed as Place &
  // Route does it
  async function routedOf(s, ownRun, what) {
    if (ownRun) {
      const r = io.read('open/routed.json');
      if (r != null) return r;
    }
    log(`Placing and routing ${what} (nextpnr), for its model.`);
    try { return await placeRouteNetlist(s.files[`${s.top}.json`], s.top); } catch (e) {
      throw new StepError(`${what} could not be placed and routed: ${e.message}`, e.list || [], e.hint);
    }
  }
  const modelOf = (routed, name, g = {}) => routedModel(routed, { family: spec.family, run: io.yosys, name, generics: g });

  // Generate Post-Place & Route Simulation Model: nextpnr's routed design
  async function runPostPar() {
    const d = await design();
    const routed = await routedOf(d.synth, !d.own, d.own ? 'the design synthesized with the test bench\'s generics' : 'the design');
    const verilog = await modelOf(routed, d.synth.top, d.generics);
    let board = null;
    if (d.own) {
      const s = await ownSynth();
      board = await modelOf(await routedOf(s, true, 'the design with its own generics'), s.top);
    }
    writeModel('postpar', 'par', 'timesim', 'Post-Place & Route', d, verilog, board, `${cellCount(routed)} cells`);
  }

  const made = nextpnrModels(spec.family);
  const none = (what) => async () => { throw new StepError(`the ${CELLS[spec.family] || spec.family} flow makes no ${what} simulation model: its ${made.map((m) => NAMES[m]).join(' and ')} one${made.length > 1 ? 's' : ''}`); };
  return { runPostSynth, runPostPar: made.includes('postpar') ? runPostPar : none('post-place & route'), runPostTranslate: none('post-translate'), runPostMap: none('post-map') };
}
