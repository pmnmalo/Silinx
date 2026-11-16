// A KiCad part modelled by a module of the project, run live (#4284, #4283, docs/CIRCUITS.md): Try it's circuit
// simulation (core/circuit-sim.js) runs each such part's module in an event-driven HDL simulator of its own
// (core/simulator.js, as the schematic's Try it runs its modules, core/schlive.js): the levels of the part's input pins
// forced on its input ports, the module run a step, its output ports' levels driven on the part's output pins, after the
// part's delay. Each part has its own copy (its registers its own). A module that cannot run (its elaboration's errors,
// a failure as it starts) is said by Check Circuit: modelRunners' reason. Isomorphic module.
import { elaborate } from './compile.js';
import { Simulator } from './simulator.js';
import * as V from './values.js';

/** A step of a module's simulation after its inputs change (ps): long enough for its own `after` delays to mature. */
const MODEL_STEP_PS = 50_000;
/** A modelled part's delay in the circuit (ns), from its inputs to its outputs. */
export const MODEL_TPD = 10;
const VAL = { 0: V.mk(1, 0n, 0n), 1: V.mk(1, 1n, 0n), X: V.mk(1, 0n, 1n), Z: V.mk(1, 1n, 1n) };
// a 1-bit value's level: 0, 1, X, Z (a std_logic's U, W, - as X; L, H as 0, 1)
function levelOf(v) {
  if (!v || Array.isArray(v) || typeof v.v !== 'bigint') return 'X';
  if (v.x & 1n) return v.v & 1n ? 'Z' : 'X';
  return v.v & 1n ? '1' : '0';
}

/**
 * The module `name` of the compiled library `lib` as a live model: { run(inputs) → outputs } ({ port: level }, the
 * ports in lower case), or { reason } when it cannot run (its elaboration's first error, a failure or a stop as it
 * starts). Each call makes a copy of its own.
 */
export function liveModel(lib, name) {
  let design;
  try { design = elaborate(lib, name); } catch (e) { return { reason: e.message }; }
  const bad = (design.diags || []).find((d) => (d.severity || 'error') === 'error');
  if (bad) return { reason: bad.message };
  if (!design.top) return { reason: `${name} cannot be elaborated` };
  const sim = new Simulator(design, { maxWaveEvents: 0 });
  const ports = new Map(design.top.ports.map((p) => [String(p.name).toLowerCase(), p]));
  const failed = () => {
    if (!sim.finished) return null;
    const err = sim.log.filter((l) => l.kind === 'error' || l.kind === 'failure').map((l) => l.text);
    return err.length ? err.join('; ') : `its simulation stopped (${sim.finished})`;
  };
  try { sim.run(MODEL_STEP_PS); } catch (e) { return { reason: e.message }; }
  if (failed()) return { reason: failed() };
  return {
    run(inputs) {
      for (const [port, level] of Object.entries(inputs)) { const p = ports.get(port); if (p?.dir === 'in') sim.force(p.sig, VAL[level] ?? VAL.X); }
      if (!sim.finished) sim.run(sim.now + MODEL_STEP_PS);
      const out = {};
      for (const [port, p] of ports) if (p.dir === 'out') out[port] = sim.finished ? 'X' : levelOf(p.sig.val);
      return out;
    },
    stopped: failed,
  };
}

/**
 * The runners of a project's modules for a circuit (`lib`: its compiled HDL sources): runner(name) → { make() (a part's
 * own copy) } or { reason } (it cannot run live), each module tried once.
 */
export function modelRunners(lib) {
  const tried = new Map();
  return (name) => {
    const k = String(name).toLowerCase();
    if (!tried.has(k)) { const r = liveModel(lib, name); tried.set(k, r.reason ? { reason: r.reason } : { make: () => liveModel(lib, name) }); }
    return tried.get(k);
  };
}
