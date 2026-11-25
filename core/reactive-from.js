// Silinx - the drawings turned into the synchronous reactive model (#5486, core/reactive.js), each by the semantics of
// its generated HDL, so that a drawing's code on a CPU does, tick by tick, what its HDL does cycle by cycle:
//   - a state diagram (core/fsm.js): its states the model's (in their codes' order, the initial one first); each
//     state's Moore outputs set first in its arm, then its transitions as an if / else-if chain in their priority
//     order (the otherwise last: its `else`), each branch its Mealy outputs and its next state;
//   - an ASM chart (core/reactive-asm.js);
//   - a Petri net (core/petri.js): its controller's state machine (core/petri-fsm.js: one state per reachable
//     marking), then as a state diagram;
//   - a truth table (core/logic.js): combinational, each output in `every` as the expression of its HDL module (its
//     form: the minimal SOP, POS, XOR…; a don't care the value that form gives it).
// The schematic is not: it is hardware (refused, REACTIVE_KINDS).
// Isomorphic ES module: no DOM and no Node APIs.
import { normalizeFsm, fsmErrors, fsmEncoding, transitionsFrom, stateById, parseCond } from './fsm.js';
import { outputConst, atWidth } from './fsm-value.js';
import { validatePetri } from './petri.js';
import { petriToFsm, MAX_FSM_STATES } from './petri-fsm.js';
import { normalizeTable, validateTable, outputForm } from './logic.js';
import { lowerCond } from './reactive-expr.js';
import { asmToReactive } from './reactive-asm.js';
import { REACTIVE_VERSION } from './reactive.js';
export { asmToReactive } from './reactive-asm.js';

/** The drawings the model takes, by their files' kind (`<name>.<kind>.json`: core/view-hdl.js's VIEW_RE; tt: a
 *  Boolean algebra's before #2065). */
export const REACTIVE_KINDS = ['fsm', 'asm', 'pn', 'bool', 'tt'];
const DRAWING_RE = /\.(sch|asm|fsm|tt|bool|pn|circ|regs)\.json$/i;
/** Why a schematic has no CPU code. */
export const SCHEMATIC_ON_CPU = 'A schematic is hardware: it cannot run on a CPU. Draw the module as a state diagram, an ASM chart, a Petri net or a truth table, or write its code.';

const errorsOf = (diags) => diags.filter((d) => d.severity === 'error').map((d) => ({ severity: 'error', message: d.message }));

/** A state diagram as a reactive model: { model } or { errors }. */
export function fsmToReactive(doc, { from = 'fsm', source } = {}) {
  const errors = errorsOf(fsmErrors(doc));
  if (errors.length) return { errors };
  const m = normalizeFsm(doc);
  const inW = (n) => m.inputs.find((i) => i.name === n)?.width ?? null;
  const outW = new Map(m.outputs.map((o) => [o.name, o.width]));
  const value = (text, o) => { const c = outputConst(text); return c ? atWidth(c, outW.get(o) ?? 1).v : 0n; };
  const sets = (outs) => Object.entries(outs || {}).filter(([o]) => outW.has(o)).map(([o, v]) => ({ k: 'set', target: o, expr: { k: 'const', v: value(v, o), w: outW.get(o) } }));
  const states = fsmEncoding(m);
  const branch = (t) => [...sets(t.outputs), { k: 'go', state: stateById(m, t.to).name }];
  const chain = (ts) => {
    const k = ts.findIndex((t) => !parseCond(t.cond).ast);
    const guarded = k < 0 ? ts : ts.slice(0, k);
    let tail = k < 0 ? [] : branch(ts[k]);
    for (let i = guarded.length - 1; i >= 0; i--) {
      tail = [{ k: 'if', cond: lowerCond(parseCond(guarded[i].cond).ast, inW), then: branch(guarded[i]), else: tail }];
    }
    return tail;
  };
  const arms = states.map((s) => {
    const st = stateById(m, s.id);
    return { state: s.name, body: [...sets(st.outputs), ...chain(transitionsFrom(m, s.id).filter((t) => stateById(m, t.to)))] };
  });
  const model = {
    kind: 'reactive', version: REACTIVE_VERSION, name: m.name, from, ...(source ? { source } : {}),
    inputs: m.inputs.map((i) => ({ name: i.name, width: i.width })),
    outputs: m.outputs.map((o) => ({ name: o.name, width: o.width, default: value(o.default, o.name) })),
    vars: [], consts: [],
    states: states.map((s) => ({ name: s.name, ...(stateById(m, s.id).comment ? { comment: stateById(m, s.id).comment } : {}) })),
    initial: states[0]?.name ?? null,
    every: [],
    arms,
  };
  return { model };
}

/** A Petri net as a reactive model (its controller's state machine): { model } or { errors }. */
export function petriToReactive(doc, { source } = {}) {
  const errors = errorsOf(validatePetri(doc));
  if (errors.length) return { errors };
  const r = petriToFsm(doc);
  if (r.error) return { errors: [{ severity: 'error', message: `The net's state machine cannot be made: ${r.error}` }] };
  if (r.truncated) return { errors: [{ severity: 'error', message: `The net reaches more than ${MAX_FSM_STATES} markings: too many states for a CPU's code` }] };
  // (its machine checked under another name: the net's module name may be one of its outputs', an HDL clash only; a
  // marking's state named by its places, `left right`, written with _ between them)
  const used = new Set();
  const named = (s) => {
    const base = s.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(?=\d)/, 'M_') || 'M';
    let n = base;
    for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base}_${i}`;
    used.add(n.toLowerCase());
    return { ...s, name: n };
  };
  const fsm = { ...r.fsm, name: `${r.fsm.name}_net`, states: r.fsm.states.map(named) };
  const out = fsmToReactive(fsm, { from: 'petri', source });
  if (out.model) out.model.name = r.fsm.name;
  return out;
}

/** A Boolean expression of core/logic.js (1-bit operands) as a typed expression. */
function logicExpr(ast) {
  const all = (args, k) => args.map(logicExpr).reduce((a, b) => (k === '^' ? { k: 'arith', op: '^', a, b, w: 1 } : { k, a, b }));
  switch (ast.t) {
    case 'var': return { k: 'ref', name: ast.name, w: 1 };
    case 'const': return { k: 'const', v: BigInt(ast.v), w: 1 };
    case 'not': return { k: 'not', a: logicExpr(ast.a) };
    case 'and': return all(ast.args, 'and');
    case 'or': return all(ast.args, 'or');
    case 'xor': return all(ast.args, '^');
    case 'nand': return { k: 'not', a: all(ast.args, 'and') };
    case 'nor': return { k: 'not', a: all(ast.args, 'or') };
    case 'xnor': return { k: 'not', a: all(ast.args, '^') };
  }
  throw new Error(`unknown expression '${ast.t}'`);
}

/** A truth table as a reactive model (combinational): { model } or { errors }. */
export function tableToReactive(docIn, { source } = {}) {
  const doc = normalizeTable(docIn);
  const errors = errorsOf(validateTable(doc));
  if (errors.length) return { errors };
  const model = {
    kind: 'reactive', version: REACTIVE_VERSION, name: doc.name, from: 'table', ...(source ? { source } : {}),
    inputs: doc.inputs.map((name) => ({ name, width: 1 })),
    outputs: doc.outputs.map((name) => ({ name, width: 1, default: 0n })),
    vars: [], consts: [], states: [], initial: null,
    every: doc.outputs.map((o) => ({ k: 'set', target: o, expr: logicExpr(outputForm(doc, o).ast) })),
    arms: [],
  };
  return { model };
}

/** A drawing's file kind (`fsm`, `asm`, `pn`, `bool`, `sch`, …), or null when the path is not a drawing's. */
export const drawingKind = (path) => DRAWING_RE.exec(String(path))?.[1].toLowerCase() ?? null;

/** A drawing (its file's kind and its document) as a reactive model: { model } or { errors }. */
export function drawingToReactive(kind, doc, opts = {}) {
  if (kind === 'fsm') return fsmToReactive(doc, opts);
  if (kind === 'asm') return asmToReactive(doc, opts);
  if (kind === 'pn') return petriToReactive(doc, opts);
  if (kind === 'bool' || kind === 'tt') return tableToReactive(doc, opts);
  if (kind === 'sch') return { errors: [{ severity: 'error', message: SCHEMATIC_ON_CPU }] };
  const what = kind === 'circ' ? 'A circuit is hardware' : kind === 'regs' ? 'A register map is hardware' : `A .${kind} file is not a drawing`;
  return { errors: [{ severity: 'error', message: `${what}: it has no CPU code` }] };
}

/** A drawing's file (its path and its text) as a reactive model: { model } or { errors }. */
export function reactiveFromFile(path, text) {
  const kind = drawingKind(path);
  if (!kind) return { errors: [{ severity: 'error', message: `${path} is not a drawing` }] };
  let doc;
  try { doc = JSON.parse(text); } catch (e) { return { errors: [{ severity: 'error', message: `${path} is not valid JSON: ${e.message}` }] }; }
  return drawingToReactive(kind, doc, { source: String(path).split('/').pop() });
}
