// Silinx - an ASM chart turned into the synchronous reactive model (#5486, core/reactive.js), by the semantics of its
// simulation and of its generated HDL (core/asm-sim.js): its registers and registered outputs the model's variables
// and registered outputs (their reset values their `init`), its generics constants, a synchronised input two variables
// (its synchroniser's flip-flops, `<name>_meta` then `<name>_sync`, which the chart reads); its every-cycle blocks the
// model's `every`, then each state's arm: the state's Moore actions, then its decision boxes as `if`s, its case boxes as
// `switch`es, its conditional outputs' actions where they are reached, and the state each path ends at a `go` (none
// when it stays).
// Isomorphic ES module: no DOM and no Node APIs.
import { prepareAsmSim } from './asm-sim.js';
import { lowerAction, lowerCond, lower } from './reactive-expr.js';
import { REACTIVE_VERSION } from './reactive.js';

const MAX_STATEMENTS = 20000;   // a chart's join points copied on each path: the code stays a CPU's

/** A reference to a synchronised input read as its synchroniser's last flip-flop. */
function renamed(e, map) {
  if ((e.k === 'ref' || e.k === 'slice') && map.has(e.name)) return { ...e, name: map.get(e.name) };
  const out = { ...e };
  if (e.a) out.a = renamed(e.a, map);
  if (e.b) out.b = renamed(e.b, map);
  return out;
}

/** The chart as a reactive model: { model } or { errors: [{ severity, message }] }. */
export function asmToReactive(chart, { source } = {}) {
  const p = prepareAsmSim(chart);
  if (p.errors) return { errors: p.errors };
  const { a, m, enc } = p.sim;
  // a symbol's width as an expression reads it: a combinational output is not read (it reads 0, as simulated)
  const width = (name) => {
    const s = a.syms.get(name);
    return !s || (s.kind === 'output' && !s.registered) ? null : s.width;
  };
  const sync = new Map(m.inputs.filter((i) => i.sync).map((i) => [i.name, `${i.name}_sync`]));
  const symWidth = (name) => a.syms.get(name)?.width ?? 1;
  const nameOf = (id) => a.idx.nodes.get(id)?.name;
  let count = 0;
  const grow = (n) => { count += n; if (count > MAX_STATEMENTS) throw Object.assign(new Error('too big'), { tooBig: true }); };
  const acts = (id) => (a.parsedActions.get(id) || []).map((x) => ({ k: 'set', target: x.target, expr: renamed(lowerAction(x.ast, symWidth(x.target), width), sync) }));
  const cond = (id) => renamed(lowerCond(a.parsedConds.get(id), width), sync);

  // the statements from the exit `port` of box `from`: up to the state it ends at (`here`: the arm's own, no go)
  const follow = (from, port, here) => {
    const e = (a.idx.exits.get(from) || {})[port];
    const to = e && a.idx.nodes.get(e.to);
    if (!to || to.type === 'always') return [];
    if (to.type === 'state') return to.id === here ? [] : [{ k: 'go', state: to.name }];
    return box(to, here);
  };
  const box = (n, here) => {
    grow(1);
    if (n.type === 'decision') {
      const then = follow(n.id, 'true', here), els = follow(n.id, 'false', here);
      return then.length || els.length ? [{ k: 'if', cond: cond(n.id), then, else: els }] : [];
    }
    if (n.type === 'case') {
      const pc = a.parsedCases.get(n.id);
      const seen = new Set(), cases = [];
      let others = [];
      for (const b of pc.branches) {
        if (b.others) { if (!others.length) others = follow(n.id, b.label, here); continue; }
        const values = b.values.filter((v) => !seen.has(v));
        for (const v of values) seen.add(v);
        if (values.length) cases.push({ values, body: follow(n.id, b.label, here) });
      }
      return [{ k: 'switch', expr: renamed(lower(pc.ast, pc.width, width), sync), cases, others }];
    }
    return [...acts(n.id), ...follow(n.id, 'next', here)];
  };

  try {
    const every = [];
    for (const [name, last] of sync) {
      const w = symWidth(name);
      every.push({ k: 'set', target: `${name}_meta`, expr: { k: 'ref', name, w } }, { k: 'set', target: last, expr: { k: 'ref', name: `${name}_meta`, w } });
    }
    for (const n of a.alwaysNodes) every.push(...acts(n.id), ...follow(n.id, 'next', null));
    const arms = enc.map((s) => ({ state: s.name, body: [...acts(s.id), ...follow(s.id, 'next', s.id)] }));
    const vars = [
      ...a.registers.map((r) => ({ name: r.name, width: symWidth(r.name), init: a.defaults.get(r.name) })),
      ...m.inputs.filter((i) => i.sync).flatMap((i) => [`${i.name}_meta`, `${i.name}_sync`].map((n) => ({ name: n, width: i.width, init: 0n, comment: `${i.name}'s synchroniser` }))),
    ];
    const model = {
      kind: 'reactive', version: REACTIVE_VERSION, name: m.name, from: 'asm', ...(source ? { source } : {}),
      inputs: m.inputs.map((i) => ({ name: i.name, width: i.width })),
      outputs: m.outputs.map((o) => ({ name: o.name, width: o.width, default: a.defaults.get(o.name), ...(o.registered ? { registered: true } : {}) })),
      vars,
      consts: [...p.sim.generics].map(([name, value]) => ({ name, value })),
      states: enc.map((s) => ({ name: s.name, ...(nameOf(s.id) && a.idx.nodes.get(s.id).comment ? { comment: a.idx.nodes.get(s.id).comment } : {}) })),
      initial: enc[0].name,
      every,
      arms,
    };
    return { model };
  } catch (e) {
    if (e.tooBig) return { errors: [{ severity: 'error', message: `The chart's paths make more than ${MAX_STATEMENTS} statements: too big for a CPU's code` }] };
    throw e;
  }
}
