// Silinx - the synchronous reactive model (#5486, roadmap #5479): the neutral model a drawing (a state diagram, an ASM
// chart, a Petri net, a truth table: core/reactive-from.js) is turned into to run on a CPU, in the style of Lustre,
// Esterel and SCADE. Each language has one generator from it (C for the Arduino: core/reactive-c.js), and each target
// a thin HAL. On an FPGA a tick is a clock cycle; on a CPU it is one turn of loop() (or a timer's interrupt).
//
// The model:
//   {
//     kind: 'reactive', version: 1, name, from: 'fsm' | 'asm' | 'petri' | 'table', source?: 'traffic.fsm.json',
//     inputs:  [{ name, width }],                                  (sampled once at the start of each tick)
//     outputs: [{ name, width, default: BigInt, registered? }],
//     vars:    [{ name, width, init: BigInt, timer?, comment? }],   (the memory: an ASM chart's registers, a
//                                                                   synchroniser's flip-flops, a timer)
//     consts:  [{ name, value: BigInt }],                           (an ASM chart's generics: 32 bits)
//     states:  [{ name, comment? }], initial: 'IDLE',               (none for a combinational model)
//     every:   [Stmt],                                              (run at every tick, before the state's)
//     arms:    [{ state: 'IDLE', body: [Stmt] }],                   (the present state's body)
//   }
//   Stmt: { k: 'set', target, expr } | { k: 'go', state } | { k: 'if', cond: Expr, then: [Stmt], else: [Stmt] }
//       | { k: 'switch', expr: Expr, cases: [{ values: [BigInt], body: [Stmt] }], others: [Stmt] }
//   Expr: core/reactive-expr.js's typed expression (each node at its width; Verilog's width rules applied already).
//
// Its semantics, one tick:
//   1. the inputs are sampled once: every read of an input in the tick sees that sample;
//   2. every read sees the values at the start of the tick: the inputs' sample, the variables', the registered
//      outputs' and the state's present values (a combinational output is never read);
//   3. a combinational output starts at its default; the next value of a variable, of a registered output and of the
//      state starts at its present value (a timer's at its present value + 1, held at its maximum: a timer counts
//      ticks);
//   4. `every`, then the present state's arm, run in order; an `if` takes `then` when its condition is not 0, a
//      `switch` the first case that lists its value (else `others`); a `set` gives a combinational output its value in
//      this tick, a variable or a registered output its next value (kept to its width), a `go` the next state: the last
//      one of a tick wins;
//   5. the tick's outputs are the combinational outputs' values and the registered outputs' present values; then the
//      next values become the present ones.
//   Moore outputs are those an arm sets before any `if` or `switch` (they depend on the state alone); Mealy outputs those
//   set inside one, on a transition's branch (they depend on the inputs too). A guard's priority is its order: an arm's
//   transitions are an if / else-if chain, the first true guard is taken, none true: the state stays (a state diagram's,
//   core/fsm.js). The reset state: the initial state, each variable at its `init`, each registered output at its
//   default; the drawing's reset input is the CPU's own reset (setup()), not an input of the model.
//
// Isomorphic ES module: no DOM and no Node APIs.
import { evalExpr, exprReads, exprMaxWidth, maskOf } from './reactive-expr.js';

export const REACTIVE_VERSION = 1;
const MAX_WIDTH = 32;   // a value's widest: a CPU's word (uint32_t)

const arr = (v) => (Array.isArray(v) ? v : []);

/** Every statement of a body, nested ones included, in order. */
function* statements(body) {
  for (const s of arr(body)) {
    yield s;
    if (s.k === 'if') { yield* statements(s.then); yield* statements(s.else); }
    if (s.k === 'switch') { for (const c of s.cases) yield* statements(c.body); yield* statements(s.others); }
  }
}

/** The expressions of a body's statements. */
function* expressions(body) {
  for (const s of statements(body)) {
    if (s.k === 'set') yield s.expr;
    if (s.k === 'if') yield s.cond;
    if (s.k === 'switch') yield s.expr;
  }
}

/** The model's problems: [{ severity, message }] (an error: it cannot run). */
export function validateReactive(model) {
  const d = [];
  const err = (message) => d.push({ severity: 'error', message });
  const m = model || {};
  const syms = new Map();
  const declare = (list, kind) => {
    for (const x of arr(list)) {
      if (syms.has(x.name)) err(`'${x.name}' is declared twice`);
      syms.set(x.name, { kind, width: kind === 'const' ? 32 : x.width, registered: !!x.registered });
      if (kind !== 'const' && !(x.width >= 1 && x.width <= MAX_WIDTH)) err(`'${x.name}' is ${x.width} bits wide: at most ${MAX_WIDTH} on a CPU`);
    }
  };
  declare(m.inputs, 'input'); declare(m.outputs, 'output'); declare(m.vars, 'var'); declare(m.consts, 'const');
  const states = new Set(arr(m.states).map((s) => s.name));
  if (states.size && !states.has(m.initial)) err(`The initial state '${m.initial}' is not a state`);
  const bodies = [arr(m.every), ...arr(m.arms).map((a) => a.body)];
  for (const a of arr(m.arms)) if (!states.has(a.state)) err(`The arm of '${a.state}' is not of a state`);
  for (const b of bodies) {
    for (const s of statements(b)) {
      if (s.k === 'go' && !states.has(s.state)) err(`'${s.state}' is not a state`);
      if (s.k !== 'set') continue;
      const t = syms.get(s.target);
      if (!t || t.kind === 'input' || t.kind === 'const') err(`'${s.target}' is not an output or a variable: it cannot be set`);
    }
    for (const e of expressions(b)) {
      for (const n of exprReads(e)) {
        const sy = syms.get(n);
        if (!sy) err(`'${n}' is read but not declared`);
        else if (sy.kind === 'output' && !sy.registered) err(`'${n}' is a combinational output: it cannot be read`);
      }
      if (exprMaxWidth(e) > MAX_WIDTH) err(`An expression is ${exprMaxWidth(e)} bits wide: at most ${MAX_WIDTH} on a CPU`);
    }
  }
  return d;
}

const assertValid = (m) => {
  const errs = validateReactive(m).filter((x) => x.severity === 'error');
  if (errs.length) throw Object.assign(new Error(errs.map((x) => x.message).join('; ')), { diagnostics: errs });
};

/** The reset state: { state, vars: { name: BigInt } } (the registered outputs' present values among the vars). */
export function reactiveReset(model) {
  const vars = {};
  for (const v of arr(model.vars)) vars[v.name] = v.init & maskOf(v.width);
  for (const o of arr(model.outputs)) if (o.registered) vars[o.name] = o.default & maskOf(o.width);
  return { state: model.initial ?? null, vars };
}

const sample = (v, w) => {
  if (typeof v === 'bigint') return v & maskOf(w);
  if (typeof v === 'string' && /^[01]+$/.test(v) && v.length > 1) return BigInt(`0b${v}`) & maskOf(w);
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? BigInt(Math.floor(n)) & maskOf(w) : 0n;
};

/**
 * One tick from the present state `st` with the inputs ({ name: number | BigInt | binary digits }): { outputs: { name:
 * BigInt }, next (the next state's name), st (the state after the tick) }.
 */
export function reactiveTick(model, st, inputs = {}) {
  const ins = Object.fromEntries(arr(model.inputs).map((i) => [i.name, sample(inputs[i.name], i.width)]));
  const consts = new Map(arr(model.consts).map((c) => [c.name, c.value]));
  const read = (n) => (n in ins ? ins[n] : consts.has(n) ? consts.get(n) : st.vars[n] ?? 0n);
  const width = new Map([...arr(model.outputs), ...arr(model.vars)].map((x) => [x.name, x.width]));
  const comb = new Set(arr(model.outputs).filter((o) => !o.registered).map((o) => o.name));
  const outs = Object.fromEntries(arr(model.outputs).filter((o) => !o.registered).map((o) => [o.name, o.default & maskOf(o.width)]));
  const next = { ...st.vars };
  for (const v of arr(model.vars)) if (v.timer && next[v.name] < maskOf(v.width)) next[v.name] += 1n;
  let state = st.state;
  const run = (body) => {
    for (const s of arr(body)) {
      if (s.k === 'set') {
        const v = evalExpr(s.expr, read) & maskOf(width.get(s.target) ?? 1);
        if (comb.has(s.target)) outs[s.target] = v; else next[s.target] = v;
      } else if (s.k === 'go') state = s.state;
      else if (s.k === 'if') run(evalExpr(s.cond, read) !== 0n ? s.then : s.else);
      else if (s.k === 'switch') {
        const v = evalExpr(s.expr, read);
        const c = s.cases.find((x) => x.values.some((y) => y === v));
        run(c ? c.body : s.others);
      }
    }
  };
  run(model.every);
  run(arr(model.arms).find((a) => a.state === st.state)?.body);
  const outputs = Object.fromEntries(arr(model.outputs).map((o) => [o.name, o.registered ? st.vars[o.name] : outs[o.name]]));
  return { outputs, next: state, st: { state, vars: next } };
}

/** The model's run from reset over a sequence of inputs (one entry per tick): [{ state, outputs, next }]. */
export function simulateReactive(model, vectors) {
  assertValid(model);
  let st = reactiveReset(model);
  return vectors.map((v) => {
    const r = reactiveTick(model, st, v);
    const row = { state: st.state, outputs: r.outputs, next: r.next };
    st = r.st;
    return row;
  });
}

/** The model's kind of outputs: 'combinational' (no state, no variable), 'mealy' (a combinational output's value
 *  depends on an input: its expression reads one, or an `if` or `switch` around its `set` does), else 'moore'. */
export function reactiveType(model) {
  if (!arr(model.states).length && !arr(model.vars).length) return 'combinational';
  const outs = new Set(arr(model.outputs).filter((o) => !o.registered).map((o) => o.name));
  const ins = new Set(arr(model.inputs).map((i) => i.name));
  const readsIn = (e) => [...exprReads(e)].some((n) => ins.has(n));
  const mealy = (body, dep) => arr(body).some((s) => {
    if (s.k === 'set') return outs.has(s.target) && (dep || readsIn(s.expr));
    if (s.k === 'if') return mealy(s.then, dep || readsIn(s.cond)) || mealy(s.else, dep || readsIn(s.cond));
    if (s.k === 'switch') return [...s.cases.map((c) => c.body), s.others].some((b) => mealy(b, dep || readsIn(s.expr)));
    return false;
  });
  return mealy(model.every, false) || arr(model.arms).some((a) => mealy(a.body, false)) ? 'mealy' : 'moore';
}
