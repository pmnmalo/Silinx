// A composition's values from its symbol's pins (#4808, #4806's derived signals): a palette symbol pushed into during
// a Try it shows its composition simulated with the inputs the symbol has there. A level below the top takes its
// inputs from the level above it simulated with its own (ADD8's from the symbol, its ADD4 U1's from ADD8's), each level
// a Try it of its drawing (core/schlive.js) on the composition's HDL (core/symlib.js). Exact: every composition is
// proved equivalent to its symbol (test/symlib.test.js); combinational, so its inputs decide all of it. Isomorphic.
import { buildLiveSim } from './schlive.js';
import * as V from './values.js';
import { compositionModules, moduleHdls } from './symlib.js';

const LANG = 'vhdl';

/** A 4-state value's known bits as a BigInt; null when any bit is unknown or released (X, Z). */
export const knownValue = v => (v && typeof v.v === 'bigint' && !v.x ? v.v : null);

/** A level's inputs as Try it keeps them (LiveSim's restoreInputs): { portId: { width, value } } of the known ones. */
export function savedInputs(level, values) {
  const out = {};
  for (const p of level.doc.ports) if (p.dir === 'in' && typeof values[p.name] === 'bigint') out[p.id] = { width: p.width, value: values[p.name] };
  return out;
}

/**
 * A level's outputs forced to `values` ({ pin: BigInt }, the known ones) in its simulation `live`, then settled: a
 * sequential symbol's state, a counter's count, which the level's own simulation, started at 0, does not have (#4811).
 * The outputs forced before are released first.
 */
export function forceOutputs(live, level, values) {
  for (const sig of live.forcedOutputs || []) live.sim.release(sig);
  live.forcedOutputs = [];
  for (const p of level.doc.ports) {
    if (p.dir !== 'out' || typeof values[p.name] !== 'bigint') continue;
    const net = live.nl.portNet.get(p.id);
    for (const sig of new Set([net && live.netSig.get(net.id), live.portSig.get(p.id)].filter(Boolean))) { live.sim.force(sig, V.mk(p.width, values[p.name])); live.forcedOutputs.push(sig); }
  }
  live.settle();
}

/**
 * The derived values of a composition: levelValues(path, top, outs) gives the inputs of the last level of `path` ([{
 * module, instance }], the top's instance null: ADD8, then its U1, an ADD4, then its U0, an FA1) when the top's are
 * `top` ({ pin: BigInt | null }) and its outputs `outs` (a counter's count, forced: #4811): { values: { pin: BigInt |
 * null }, error }. The levels above it are simulated alone, each built once.
 */
export function derivedValues(comp) {
  const modules = compositionModules(comp), sources = moduleHdls(comp, LANG).map(m => ({ path: m.path, text: m.code, lang: LANG }));
  const lives = new Map();
  const liveOf = level => {
    if (!lives.has(level.name)) lives.set(level.name, buildLiveSim(level.doc, { modules, sources, lang: LANG }));
    return lives.get(level.name);
  };
  const levelOf = name => comp.modules.find(m => m.name === name);
  return {
    modules, sources,
    levelValues(path, top, outs = {}) {
      let values = { ...top };
      for (let k = 0; k + 1 < path.length; k++) {
        const level = levelOf(path[k].module), r = liveOf(level);
        if (!r.ok) return { values: {}, error: r.errors.join('; ') };
        r.live.reset({ inputs: true });
        r.live.restoreInputs(savedInputs(level, values));
        if (k === 0) forceOutputs(r.live, level, outs);
        const s = level.doc.symbols.find(x => x.name === path[k + 1].instance);
        if (!s) return { values: {}, error: `no instance ${path[k + 1].instance} in ${level.name}` };
        const child = levelOf(path[k + 1].module);
        values = Object.fromEntries(child.ports.filter(q => q.dir === 'in').map(q => [q.name, knownValue(r.live.pinValue(s.id, q.name))]));
      }
      return { values, error: null };
    },
  };
}
