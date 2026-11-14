// A circuit's Try it replayed in the simulator (#3900, docs/CIRCUITS.md), as the logic analyzer's capture is
// (core/ila-capture.js): the inputs' changes the student made (a switch, a button, a DIP lever, a clock's ticks: each at
// the simulated time it happened, core/circuit-sim.js) written as a test bench of the circuit's generated HDL
// (core/circuit-hdl.js), its inputs starting as saved; the interface opens it in the waveform viewer (SSim, its logic
// probes' nets first, web/js/circuit-waves.js), the MCP server's simulate_drawing returns its probes' waves. One
// simulation, the HDL's: the waves are those of the circuit's module, every net and IC pin there. Isomorphic module.
import { normalizeCircuit, circuitPorts } from './circuit.js';
import { savedInputs } from './circuit-io.js';
import { generateCircuit } from './circuit-hdl.js';
import { compile, elaborate } from './compile.js';
import { Simulator } from './simulator.js';
import * as V from './values.js';

const SETTLE_TAIL_NS = 1000;   // (after the last change: the circuit settles, the waves end)

/**
 * The replay: { files: [{ path, text }] (the circuit's HDL, its test bench), top (the bench, <circuit>_tryit), untilNs,
 * probes: [{ part, label, path }] (a probe's net in the bench: dut/<signal>; null: its net is no signal) }.
 * events: [{ t (ns), port, v (0 / 1) }], the inputs' changes in time order.
 */
export function circuitReplay(model, events = [], { lang } = {}) {
  const m = normalizeCircuit(model);
  const g = generateCircuit(m, lang);
  const { inputs, outputs } = circuitPorts(m);
  const start = Object.fromEntries(inputs.map((x) => [x.name, savedInputs(m.parts.find((p) => p.id === x.part))[x.index] ? 1 : 0]));
  const top = `${m.name}_tryit`;
  const L = ['`timescale 1ns / 1ps', `// Try it of ${m.name}, replayed: its inputs as they were changed`, `module ${top};`];
  if (inputs.length) L.push(`  reg ${inputs.map((x) => x.name).join(', ')};`);
  if (outputs.length) L.push(`  wire ${outputs.map((x) => x.name).join(', ')};`);
  // (the inputs' first levels assigned at time 0, from x: an event, as on the bench, that an asynchronous clear sees)
  L.push(`  ${m.name} dut (${[...inputs, ...outputs].map((x) => `.${x.name}(${x.name})`).join(', ')});`, '  initial begin');
  if (inputs.length) L.push(`    ${inputs.map((x) => `${x.name} = 1'b${start[x.name]};`).join(' ')}`);
  let t = 0;
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    const at = Math.max(t, Math.round(e.t));
    L.push(`    #${at - t} ${e.port} = 1'b${e.v ? 1 : 0};`);
    t = at;
  }
  L.push(`    #${SETTLE_TAIL_NS} $finish;`, '  end', 'endmodule', '');
  return {
    files: [{ path: g.filename, text: g.code }, { path: `${top}.v`, text: L.join('\n') }], top, untilNs: t + SETTLE_TAIL_NS,
    probes: g.probes.map((p) => ({ part: p.part, label: p.label, path: p.signal ? `dut/${p.signal}` : null })),
  };
}

/** The replay simulated: { design, sim, replay, errors } (the simulator run to its end, every signal's waves kept). */
function runReplay(model, events, opts) {
  const replay = circuitReplay(model, events, opts);
  const lib = compile(replay.files);
  if (lib.errors.length) return { replay, errors: lib.errors.map((e) => e.message) };
  const design = elaborate(lib, replay.top);
  const sim = new Simulator(design);
  sim.run(replay.untilNs * 1000);
  return { design, sim, replay, errors: [] };
}

/** Each probe's waves of the replay: { label: [[ns, '0' | '1' | 'Z' | 'X'], …] } (its changes). */
export function probeWaves(model, events, opts) {
  const r = runReplay(model, events, opts);
  if (r.errors.length) throw new Error(`the circuit's replay does not compile: ${r.errors[0]}`);
  const out = {};
  for (const p of r.replay.probes) {
    const sig = p.path && r.design.signals.find((s) => pathOf(s) === `${r.replay.top}/${p.path}`);
    out[p.label] = sig?.wave ? sig.wave.t.map((t, k) => [t / 1000, V.toBin(sig.wave.v[k]).toUpperCase()]) : [];
  }
  return out;
}
const pathOf = (s) => String(s.path || s.name).replace(/\./g, '/');
