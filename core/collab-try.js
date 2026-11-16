// The Try it a shared project's owner has open, as its followers follow it (#4244; core/collab-activity.js): the channel
// `try`, by document (a state diagram's `fsm:<path>`, an ASM chart's, a Petri net's, a schematic's, a Boolean algebra's
// or a circuit's generated schematic's, a module's RTL schematic's, a circuit's): a document there has its Try it open, one not there has it closed.
// Each one's value is its editor's (web/js/collab-try.js): a state diagram's, an ASM chart's and a Petri net's Try it as
// its state (`snap`: the present state, the inputs, the cycle, the trace, the marking…); a schematic's and a circuit's
// as the steps taken since it started (`ops`, from its inputs' values then, `base`), which the follower's own
// simulation replays (it is deterministic); and, for everyone, what it shows in words (`sum`: the state, the inputs, the
// outputs, the steps: the MCP's follow_project). Each value as the owner makes it (BigInts as { $n: digits }, capped)
// and as a follower takes it (untrusted input: what is not one left out).

/** The limits: the documents, a value's depth, an object's keys, an array's items, a string's length, the steps kept. */
export const TRY_LIMITS = Object.freeze({ docs: 8, depth: 6, keys: 512, items: 512, string: 1024, ops: 500 });
const TRY_KINDS = Object.freeze(['fsm', 'asm', 'pn', 'sch', 'circ']);
const DOC_RE = /^(fsm|asm|pn|sch|ttsch|circsch|circ|rtl):[^\0]{1,512}$/;
const BIG_RE = /^-?\d{1,400}$/;
const KEY_RE = /^[^\0]{1,256}$/;

/** A value as it is sent: JSON, its BigInts as { $n: '<digits>' }. */
export function tryWire(v, depth = 0) {
  if (typeof v === 'bigint') return { $n: v.toString() };
  if (Array.isArray(v)) return depth > TRY_LIMITS.depth ? [] : v.map(x => tryWire(x, depth + 1));
  if (v && typeof v === 'object') {
    if (depth > TRY_LIMITS.depth) return {};
    const out = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined && typeof x !== 'function') out[k] = tryWire(x, depth + 1);
    return out;
  }
  return v;
}

/** A value as a follower takes it (untrusted): plain JSON within the limits, { $n } back to a BigInt; what is not one
 *  (a function, a symbol, a number not finite, too deep, too long) left out (undefined). */
export function fromWire(v, limits = TRY_LIMITS, depth = 0) {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') return v.length <= limits.string ? v : undefined;
  if (depth > limits.depth) return undefined;
  if (Array.isArray(v)) return v.slice(0, limits.items).map(x => fromWire(x, limits, depth + 1)).filter(x => x !== undefined);
  if (typeof v !== 'object') return undefined;
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0] === '$n') return typeof v.$n === 'string' && BIG_RE.test(v.$n) ? BigInt(v.$n) : undefined;
  const out = {};
  for (const k of keys.slice(0, limits.keys)) {
    if (!KEY_RE.test(k) || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    const x = fromWire(v[k], limits, depth + 1);
    if (x !== undefined) out[k] = x;
  }
  return out;
}

// what a Try it shows, in words: its state, its inputs and outputs (name: text), its steps
function summary(s) {
  const o = s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  const texts = x => Object.fromEntries(Object.entries(x && typeof x === 'object' && !Array.isArray(x) ? x : {}).filter(([, t]) => typeof t === 'string').slice(0, 64));
  return { state: typeof o.state === 'string' ? o.state : null, inputs: texts(o.inputs), outputs: texts(o.outputs), steps: Number.isSafeInteger(o.steps) && o.steps >= 0 ? o.steps : 0 };
}

/** The `try` value: { docs: { id: { kind, … } } }, the first TRY_LIMITS.docs documents with their Try it open
 *  (entries: [id, its editor's tryState(), null: closed]). */
export function tryActivity(entries, limits = TRY_LIMITS) {
  const docs = {};
  for (const [id, st] of entries) {
    if (!st || !DOC_RE.test(id) || !TRY_KINDS.includes(st.kind) || Object.keys(docs).length >= limits.docs) continue;
    docs[id] = tryWire(st);
  }
  return { docs };
}

/** A `try` value as a follower takes it (untrusted): { docs: { id: { kind, sum, snap | (run, base, n, ops) } } }; null:
 *  not one. */
export function followedTry(v, limits = TRY_LIMITS) {
  if (!v || typeof v !== 'object' || !v.docs || typeof v.docs !== 'object' || Array.isArray(v.docs)) return null;
  const docs = {};
  for (const [id, d] of Object.entries(v.docs).slice(0, limits.docs)) {
    if (!DOC_RE.test(id) || !d || typeof d !== 'object' || !TRY_KINDS.includes(d.kind)) continue;
    const x = fromWire(d, limits);
    const out = { kind: d.kind, sum: summary(x.sum) };
    if (d.kind === 'sch' || d.kind === 'circ') {
      out.run = typeof x.run === 'string' && x.run.length <= 64 ? x.run : '';
      out.base = x.base && typeof x.base === 'object' && !Array.isArray(x.base) ? x.base : {};
      out.ops = Array.isArray(x.ops) ? x.ops.slice(-limits.ops).filter(Array.isArray) : [];
      out.n = Number.isSafeInteger(x.n) && x.n >= out.ops.length ? x.n : out.ops.length;
    } else out.snap = x.snap && typeof x.snap === 'object' && !Array.isArray(x.snap) ? x.snap : {};
    docs[id] = out;
  }
  return { docs };
}

/** A schematic's or a circuit's Try it's steps, as the owner records them: { run (this Try it's id), base, n (the
 *  steps taken), ops (the last TRY_LIMITS.ops) }; push(op) a step (a clock's cycles one after another: one step, its
 *  count added, #4173: a clock run sends no frame per edge). */
export function tryOps(base, run = Math.random().toString(36).slice(2, 10)) {
  const log = { run, base, n: 0, ops: [] };
  log.push = (op) => {
    const last = log.ops.at(-1);
    if (op[0] === 'cycles' && last?.[0] === 'cycles' && JSON.stringify(last[1]) === JSON.stringify(op[1])) { log.ops[log.ops.length - 1] = ['cycles', last[1], last[2] + op[2]]; return; }
    if (op[0] === 'advance' && last?.[0] === 'advance') { log.ops[log.ops.length - 1] = ['advance', last[1] + op[1]]; return; }
    log.ops.push(op);
    log.n++;
    if (log.ops.length > TRY_LIMITS.ops) log.ops.shift();
  };
  log.wire = () => ({ run: log.run, base: log.base, n: log.n, ops: log.ops.slice() });
  return log;
}

/** What a follower replays of the owner's steps (`applied`: { run, n, last } as replayPlan last returned it, or null):
 *  { restart (from the base first), ops (the steps to replay), run, n, last }. The last step it replayed, grown since (a
 *  clock's cycles, time advanced): only what was added; changed otherwise, or steps lost (no longer kept), another
 *  Try it: replayed again from the base. */
const key = v => JSON.stringify(tryWire(v));   // (a step's BigInts too)
export function replayPlan(applied, o) {
  const first = o.n - o.ops.length, all = { restart: true, ops: o.ops, run: o.run, n: o.n, last: o.ops.at(-1) ?? null };
  if (!applied || applied.run !== o.run || applied.n > o.n || applied.n < first) return all;
  const i = applied.n - first, ops = o.ops.slice(i);
  const cur = i > 0 ? o.ops[i - 1] : null, prev = applied.last;
  if (cur && key(cur) !== key(prev)) {
    if (cur[0] === 'cycles' && prev?.[0] === 'cycles' && key(cur[1]) === key(prev[1]) && cur[2] > prev[2]) ops.unshift(['cycles', cur[1], cur[2] - prev[2]]);
    else if (cur[0] === 'advance' && prev?.[0] === 'advance' && cur[1] > prev[1]) ops.unshift(['advance', cur[1] - prev[1]]);
    else return all;
  }
  return { restart: false, ops, run: o.run, n: o.n, last: o.ops.at(-1) ?? null };
}

const KIND_NAMES = { fsm: 'state diagram', asm: 'ASM chart', pn: 'Petri net', sch: 'schematic', circ: 'circuit' };
/** The owner's Try it in words (the MCP's follow_project). */
export function tryLines(v) {
  const t = followedTry(v);
  if (!t) return [];
  const list = o => Object.entries(o).map(([k, x]) => `${k} = ${x}`).join(', ');
  return Object.entries(t.docs).map(([id, d]) => {
    const s = d.sum;
    return `Their Try it of the ${KIND_NAMES[d.kind]} ${id.replace(/^[a-z]+:/, '')}: ${[
      s.state !== null ? `state ${s.state}` : null, `${s.steps} step(s)`,
      Object.keys(s.inputs).length ? `inputs ${list(s.inputs)}` : null, Object.keys(s.outputs).length ? `outputs ${list(s.outputs)}` : null,
    ].filter(Boolean).join('; ')}.`;
  });
}

/** A Try it's trace (a state diagram's, an ASM chart's) as a follower shows it: its last `n` rows, each { cycle, state,
 *  next, inputs, outputs } (name: a number or a text, a BigInt as its digits), what is not one left out. */
export function traceRows(rows, n = 32) {
  const vals = o => Object.fromEntries(Object.entries(o && typeof o === 'object' && !Array.isArray(o) ? o : {}).slice(0, 64)
    .filter(([, x]) => typeof x === 'string' || typeof x === 'bigint' || (typeof x === 'number' && Number.isFinite(x))).map(([k, x]) => [k, typeof x === 'bigint' ? String(x) : x]));
  const str = x => (typeof x === 'string' ? x.slice(0, 256) : '?');
  return (Array.isArray(rows) ? rows.slice(-n) : []).filter(r => r && typeof r === 'object' && !Array.isArray(r))
    .map(r => ({ cycle: Number.isSafeInteger(r.cycle) ? r.cycle : 0, state: str(r.state), next: str(r.next), inputs: vals(r.inputs), outputs: vals(r.outputs) }));
}
/** A Try it's inputs' values (name: a non-negative integer) as a follower sets them, for the inputs `names` only. */
export function inputValues(v, names) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  return Object.fromEntries(names.filter(k => Object.hasOwn(o, k) && Number.isSafeInteger(o[k]) && o[k] >= 0).map(k => [k, o[k]]));
}

/** A schematic's live simulation (core/schlive.js LiveSim) recorded: its steps (an input set, a bus driven or released,
 *  a clock's cycles, a power cycle) pushed to `log` (tryOps) as they are taken, by whatever takes them. */
export function recordLive(live, log) {
  const own = name => live[name].bind(live);
  const set = own('set'), drive = own('drive'), cycles = own('cycles'), reset = own('reset');
  live.set = (id, v) => { const r = set(id, v); if (r) log.push(['set', id, live.input(id).value]); return r; };
  live.drive = (id, v) => { const r = drive(id, v); if (r) log.push(['drive', id, live.bidir(id).value]); return r; };
  live.cycles = (ids, n = 1) => { const r = cycles(ids, n); if (r) log.push(['cycles', [...ids], n]); return r; };
  live.reset = (o = {}) => { reset(o); log.push(['reset', !!o.inputs]); };
  return live;
}
/** A follower's replay of the owner's steps on its own live simulation (untrusted: a step that is not one skipped). */
export function replayLive(live, ops) {
  const big = v => (typeof v === 'bigint' ? v : null), id = v => (typeof v === 'string' && v.length <= 256 ? v : null);
  for (const op of ops) {
    if (!Array.isArray(op)) continue;
    const [k, a, b] = op;
    if (k === 'set' && id(a) && big(b) !== null) live.set(a, b);
    else if (k === 'drive' && id(a) && (b === null || big(b) !== null)) live.drive(a, b);
    else if (k === 'cycles' && Array.isArray(a) && a.every(id) && Number.isSafeInteger(b) && b > 0) live.cycles(a, Math.min(b, 1e6));
    else if (k === 'reset') live.reset({ inputs: a === true });
  }
}

/** A circuit's simulation (core/circuit-sim.js) recorded: its steps (a switch, a button or a clock set, then run; the
 *  time moved on by a clock's half period) pushed to `log` (tryOps) as they are taken. */
export function recordCircuit(sim, log) {
  const set = sim.set, advance = sim.advance;
  sim.set = (id, v, index = 0) => { const r = set(id, v, index); log.push(['set', id, !!v, index]); return r; };
  sim.advance = (ns) => { const r = advance(ns); log.push(['advance', ns]); return r; };
  return sim;
}
/** A follower's replay of the owner's steps on its own circuit's simulation (untrusted: a step that is not one, or
 *  that the circuit refuses, skipped). */
export function replayCircuit(sim, ops) {
  for (const op of ops) {
    if (!Array.isArray(op)) continue;
    const [k, a, b, c = 0] = op;
    try {
      if (k === 'set' && typeof a === 'string' && typeof b === 'boolean' && Number.isSafeInteger(c) && c >= 0) { sim.set(a, b, c); sim.run(); }
      else if (k === 'advance' && typeof a === 'number' && a > 0 && a <= 1e12) sim.advance(a);
    } catch { /* not a part of this circuit */ }
  }
}
/** A follower's steps after its replay: the owner's (its own steps from then on added to them). */
export function adoptOps(log, o) {
  Object.assign(log, { run: o.run, base: o.base, n: o.n });
  log.ops.splice(0, log.ops.length, ...o.ops);
  return log;
}
