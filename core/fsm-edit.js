// A state diagram edited through its transition table (#4974): a row's next state, condition and outputs, a row (a
// transition) added or removed, a state added or renamed. The table of the editor's Tables panel (web/js/fsm-table.js)
// and the MCP's edit_fsm (server/mcp-fsm.js) change the model through these, as the diagram changes it: a
// transition's target as Properties' To (its arrow's shape back to the default), a condition kept as typed (condAsText,
// as Properties and set_fsm_condition), the outputs checked as Properties' (setOutputValues), a new transition as one
// drawn (an empty condition: always), a new state named S<n> and placed beside the others. Each function changes `m`
// (a normalized model) in place and returns { message } (what was done, as the console says it) or { error } (nothing
// changed). The problems of the result (a name not valid, two transitions true at once…) are Check's, as the diagram's.
import { ELSE_COND, isElseWord, fsmKind, nameOf, parseOutputs, placeNew, stateById } from './fsm.js';
import { condAsText } from './cond-notation.js';
import { setOutputValues } from './fsm-outputs.js';

/** A new id with the prefix `p` ('s', 't'), used by no state and no transition of `m`. */
export function newFsmId(m, p) {
  const used = new Set([...m.states.map((s) => s.id), ...m.transitions.map((t) => t.id)]);
  let i = 1;
  while (used.has(`${p}${i}`)) i++;
  return `${p}${i}`;
}

/** The state of `m` named `name` (as typed: its case too), or null. */
export const stateNamed = (m, name) => m.states.find((s) => s.name === String(name ?? '').trim()) || null;

// (Check's words: two states of one name refused here, as Check would report them)
const twice = (n) => `The name '${n}' is used twice (letter case does not count)`;
const transOf = (m, id) => m.transitions.find((t) => t.id === id) || null;
const arrow = (m, t) => `Transition ${nameOf(m, t.from)} → ${nameOf(m, t.to)}`;

/** Transition `id` goes to state `to` (an id): its arrow's shape back to the default, as Properties' To. */
export function setNextState(m, id, to) {
  const t = transOf(m, id);
  if (!t) return { error: `no transition '${id}'` };
  if (!stateById(m, to)) return { error: `no state '${to}'` };
  if (t.to === to) return { message: `${arrow(m, t)}: already its next state` };
  const was = arrow(m, t);
  t.to = to;
  delete t.bend; delete t.angle;
  return { message: `${was}: its next state is now ${nameOf(m, to)}` };
}

/** Transition `id`'s condition, kept as typed (empty: always; else, others, otherwise…: the state's otherwise). */
export function setCondition(m, id, text) {
  const t = transOf(m, id);
  if (!t) return { error: `no transition '${id}'` };
  const cond = condAsText(String(text ?? '').trim());
  t.cond = cond;
  return { message: `${arrow(m, t)}: condition ${cond || '(empty: always)'}` };
}

/** Where a row's outputs are kept: the state's (a Moore machine, or the row of a state that stays) or the
 *  transition's (a Mealy machine). { type: 'state' | 'trans', id }. */
export function rowOutputsOwner(m, row) {
  if (row.transition && fsmKind(m) === 'mealy') return { type: 'trans', id: row.transition };
  const s = row.stateId ?? transOf(m, row.transition)?.from;
  return { type: 'state', id: s };
}

/** A row's outputs from a text as the table shows them ("z=1, y=X"; empty: none), on the owner rowOutputsOwner
 *  gives: the outputs not written cleared (a state: their default; a transition: the state's value). */
export function setRowOutputs(m, row, text) {
  const p = parseOutputs(text, m.outputs);
  if (p.error) return { error: p.error };
  const own = rowOutputsOwner(m, row);
  const obj = own.type === 'trans' ? transOf(m, own.id) : stateById(m, own.id);
  if (!obj) return { error: own.type === 'trans' ? `no transition '${own.id}'` : `no state '${own.id}'` };
  const values = Object.fromEntries(m.outputs.map((o) => [o.name, p.outputs[o.name] ?? '']));
  const r = setOutputValues(obj.outputs, values, m.outputs);
  const where = own.type === 'trans' ? arrow(m, obj) : `State ${obj.name}`;
  if (r.error) return { error: `${where}: ${r.error}` };
  obj.outputs = r.outputs;
  return { message: `${where}: outputs ${String(text ?? '').trim() || '(none: the defaults)'}` };
}

/** A new transition from state `from` to `to` (ids), `cond` its condition (empty: always), tried after the others of
 *  `from` but before its otherwise (or right after transition `after`, an id). { message, id }. */
export function addTransition(m, from, to = from, cond = '', after = null) {
  if (!stateById(m, from)) return { error: `no state '${from}'` };
  if (!stateById(m, to)) return { error: `no state '${to}'` };
  const t = { id: newFsmId(m, 't'), from, to, cond: condAsText(String(cond ?? '').trim()), outputs: {} };
  const mine = m.transitions.filter((x) => x.from === from);
  const before = after ? mine[mine.findIndex((x) => x.id === after) + 1] : mine.find((x) => isElseWord(x.cond));
  const i = before ? m.transitions.indexOf(before) : -1;
  if (i < 0) m.transitions.push(t); else m.transitions.splice(i, 0, t);
  return { message: `${arrow(m, t)} added: condition ${t.cond || '(empty: always)'}`, id: t.id };
}

/** Transition `id` removed. */
export function removeTransition(m, id) {
  const t = transOf(m, id);
  if (!t) return { error: `no transition '${id}'` };
  m.transitions = m.transitions.filter((x) => x !== t);
  return { message: `${arrow(m, t)} removed` };
}

/** The otherwise of state `from` (an id) made a transition of its own to `to`: a row "otherwise (stays)" given
 *  another next state. */
export function setStayNext(m, from, to) {
  if (to === from) return { message: `State ${nameOf(m, from)}: already stays` };
  const r = addTransition(m, from, to, ELSE_COND);
  return r.error ? r : { ...r, message: `State ${nameOf(m, from)}: in every other case, to ${nameOf(m, to)}` };
}

/** A name for a new state: S<n>, the first not used (whatever its case). */
export function freeStateName(m) {
  const used = new Set(m.states.map((s) => s.name.toLowerCase()));
  let i = 0;
  while (used.has(`s${i}`)) i++;
  return `S${i}`;
}

/** A new state named `name` (empty: S<n>), placed after the others; the initial state when there was none. */
export function addState(m, name = '') {
  const n = String(name ?? '').trim() || freeStateName(m);
  if (m.states.some((s) => s.name.toLowerCase() === n.toLowerCase())) return { error: twice(n) };
  const prev = { states: m.states.map((s) => ({ ...s })) };
  const s = { id: newFsmId(m, 's'), name: n, outputs: {} };
  m.states.push(s);
  if (m.states.length === 1) { s.x = 120; s.y = 160; } else placeNew(m, prev);
  if (!m.initial) m.initial = s.id;
  return { message: `State ${n} added`, id: s.id };
}

/** State `id` renamed `name` (not empty, not another state's; a name not valid is Check's error, as the diagram's). */
export function renameState(m, id, name) {
  const s = stateById(m, id);
  if (!s) return { error: `no state '${id}'` };
  const n = String(name ?? '').trim();
  if (!n) return { error: `State ${s.name}: a name is needed` };
  if (n === s.name) return { message: `State ${n}: already its name` };
  if (m.states.some((x) => x !== s && x.name.toLowerCase() === n.toLowerCase())) return { error: `State ${s.name}: ${twice(n)}` };
  const was = s.name;
  s.name = n;
  return { message: `State ${was} renamed ${n}` };
}
