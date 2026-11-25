// Silinx - a System node's contract (#5485, roadmap #5479, docs/SYSTEMS.md "The node contract"), in the spirit of
// SystemC/TLM's loosely-timed models and FMI's co-simulation: every engine (the FPGA's compiled and event-driven
// engines, the AVR, the PIC24, the circuit, the terminal, a stimulus) meets it.
//
//   ports                  its typed ports (core/system-ports.js: a direction, a kind, a level)
//   run(t1, inputEvents)   the node advanced to t1 (ps), each input event { pin, t, value } applied at its time t (from
//                          its time now to t1, in time order): { outputs: its outputs' changes since the last run, in time
//                          order, each { pin, t, value }, t: the time it reached (t1, or past it: an instruction that ends
//                          after t1) }
//   save(), restore(s)     its state saved and restored: the same inputs after a restore give the same run (determinism,
//                          grading, a run rewound, #3191)
//   messages()             its log since the last call: [{ kind ('error', 'warning', 'info'…), text, time }]
//   lookahead              optional: the time (ps) it can run ahead without an input, the scheduler's window's bound
//                          (null: none of its own, its links' only, core/system-links.js)
//   fidelity               optional: what its engine models and what it does not, [{ kind, text }] (#5499)
//   value(pin)             optional: a port's value now (its outputs' at the start)
//
// The engines' adapters are the scheduler's (core/system-sim.js: advanceTo, setPin, value…); ContractNode puts one
// behind the contract, its state saved as its inputs and restored by replaying them on a new engine (an engine is
// deterministic: the same inputs at the same times give the same state). StimulusNode is a node's test bench: its
// outputs' events given. Isomorphic module (browser + Node).
import { port, portsProblems, drives, reads } from './system-ports.js';

/** A fidelity note's kinds: what the engine models, what it approximates (a timing, a peripheral's behaviour), what it
 *  leaves out. */
export const FIDELITY_KINDS = ['models', 'approximates', 'omits'];

/** Why `notes` are no fidelity notes ([{ kind, text }]), or null. */
export function fidelityProblem(notes) {
  if (!Array.isArray(notes)) return 'the fidelity notes are a list';
  for (const n of notes) {
    if (!FIDELITY_KINDS.includes(n?.kind)) return `a fidelity note's kind '${n?.kind ?? ''}' is not ${FIDELITY_KINDS.join(', ')}`;
    if (!n.text || typeof n.text !== 'string') return 'a fidelity note with no text';
  }
  return null;
}

/** Why `node` does not meet the contract: [text] (a method missing, its ports, its lookahead, its fidelity notes),
 *  empty when it does. */
export function contractProblems(node) {
  if (!node || typeof node !== 'object') return ['a node is an object'];
  const out = [];
  for (const m of ['run', 'save', 'restore', 'messages']) if (typeof node[m] !== 'function') out.push(`no ${m}()`);
  out.push(...portsProblems(node.ports));
  if (node.lookahead != null && !(node.lookahead >= 1)) out.push(`its lookahead '${node.lookahead}' is not a time (ps, 1 or more)`);
  if (node.fidelity != null) { const f = fidelityProblem(node.fidelity); if (f) out.push(f); }
  return out;
}

// the input events checked and in time order (those of one time in their order)
function inputsOf(events, now, t1, inputs) {
  if (!Array.isArray(events)) throw new Error('the input events are a list');
  for (const e of events) {
    if (!(typeof e?.t === 'number' && e.t >= now && e.t <= t1)) throw new Error(`an input event at ${e?.t} ps: from now (${now} ps) to t1 (${t1} ps)`);
    if (inputs && !inputs.has(e.pin)) throw new Error(`'${e.pin}' is not an input of the node`);
  }
  return events.map((e, i) => [e, i]).sort((a, b) => a[0].t - b[0].t || a[1] - b[1]).map(([e]) => e);
}

/** An engine's adapter (core/system-sim.js's: advanceTo, setPin) run to t1 with its input events at their times:
 *  { outputs, t }. */
export function runEngine(engine, t1, inputEvents = []) {
  if (typeof t1 !== 'number' || Number.isNaN(t1) || t1 < engine.now) throw new Error(`run(t1): a time from now (${engine.now} ps) on, not ${t1}`);
  const outputs = [];
  for (const e of inputsOf(inputEvents, engine.now, t1, null)) {
    if (e.t > engine.now) outputs.push(...engine.advanceTo(e.t));
    engine.setPin(e.pin, e.value);
  }
  outputs.push(...engine.advanceTo(t1));
  return { outputs, t: engine.now };
}

/** An engine adapter's pins as typed ports (its inputs and outputs; a pin both an inout one), each at `volts` (null:
 *  not known), in the adapter's order (its outputs', then the inputs' that are no output). */
export function adapterPorts(engine, { volts = null } = {}) {
  const ins = new Set(engine.inputs), outs = new Set(engine.outputs);
  return [...new Set([...engine.outputs, ...engine.inputs])].map(name => port({ name, dir: ins.has(name) && outs.has(name) ? 'inout' : outs.has(name) ? 'out' : 'in', volts }));
}

/**
 * An engine behind the contract. make(): a new engine (an adapter of core/system-sim.js's, or one that has run(t1,
 * inputEvents) itself and no advanceTo: the PIC24's Pic24Node; its run may end past t1, its next inputs then at its time); ports: its typed ports; lookahead, fidelity: the contract's. Its state:
 * the input events it was given and its time; restored on a new engine, the events replayed (their outputs and
 * messages dropped).
 */
export class ContractNode {
  constructor({ make, ports = null, volts = null, lookahead = null, fidelity = [] }) {
    if (typeof make !== 'function') throw new Error('a node\'s engine: make(), a function that makes it');
    const engine = make();
    ports ??= adapterPorts(engine, { volts });   // (none given: its adapter's pins at volts)
    this.make = make;
    this.ports = ports;
    this.lookahead = lookahead;
    this.fidelity = fidelity;
    const why = contractProblems(this);
    if (why.length) throw new Error(why[0]);
    this.inputs = new Set(ports.filter(p => p.dir !== 'out').map(p => p.name));
    this.engine = engine;
    this.now = 0;
    this.t1 = 0;   // (the last run's t1: its engine may have ended past it)
    this.events = [];
  }

  /** The engine advanced to t1, its inputs at their times: { outputs, t }. */
  run(t1, inputEvents = []) {
    if (typeof t1 !== 'number' || Number.isNaN(t1) || t1 < this.t1) throw new Error(`run(t1): a time from the last run's (${this.t1} ps) on, not ${t1}`);
    // (an engine past the last t1, an instruction under way: the events before its time at its time, as it would
    // apply them, and kept so, the replay the same)
    const events = inputsOf(inputEvents, this.t1, t1, this.inputs).map(e => ({ pin: e.pin, t: Math.max(e.t, this.now), value: e.value }));
    const to = Math.max(t1, this.now);
    // (an adapter of the scheduler's, else an engine with the contract's run of its own: an AvrNode's run(t) is its own)
    const r = typeof this.engine.advanceTo === 'function' ? runEngine(this.engine, to, events) : this.engine.run(to, events);
    this.events.push(...events);
    this.now = r.t;
    this.t1 = t1;
    return { outputs: r.outputs, t: r.t };
  }

  /** A port's value now (null when the engine cannot say). */
  value(pin) { return typeof this.engine.value === 'function' ? this.engine.value(pin) : null; }

  messages() { return this.engine.messages(); }

  /** Why the engine stopped (an error…), falsy while it runs. */
  get finished() { return this.engine.finished ?? null; }

  /** Its state: { t (the last run's t1), events } (plain data: structured-clonable, JSON). */
  save() { return { t: this.t1, events: this.events.map(e => ({ ...e })) }; }

  /** Back to a saved state: a new engine, the saved inputs replayed to its time (its outputs and messages dropped). */
  restore(s) {
    if (!(typeof s?.t === 'number' && Array.isArray(s.events))) throw new Error('not a node\'s saved state ({ t, events })');
    this.engine = this.make();
    this.now = 0;
    this.t1 = 0;
    this.events = [];
    this.run(s.t, s.events);
    this.engine.messages();
  }
}

/**
 * A node's test bench (#5485: a node replaced by a stimulus): its outputs' changes given, [{ pin, t, value }], each at
 * its time; the inputs it gets recorded (`received`, [{ pin, t, value }]). ports: its typed ports.
 */
export class StimulusNode {
  constructor({ ports, events = [], fidelity = [] }) {
    this.ports = ports;
    this.fidelity = fidelity;
    const why = contractProblems(this);
    if (why.length) throw new Error(why[0]);
    const outs = new Set(ports.filter(p => p.dir !== 'in').map(p => p.name));
    for (const e of events) {
      if (!outs.has(e.pin)) throw new Error(`'${e.pin}' is not an output of the stimulus`);
      if (!(typeof e.t === 'number' && e.t >= 0)) throw new Error(`a stimulus's event at ${e.t} ps: a time of 0 or more`);
    }
    this.script = events.map((e, i) => [e, i]).sort((a, b) => a[0].t - b[0].t || a[1] - b[1]).map(([e]) => ({ ...e }));
    this.inputs = new Set(ports.filter(p => p.dir !== 'out').map(p => p.name));
    this.now = 0;
    this.next = 0;
    this.received = [];
    this.levels = new Map();
  }

  value(pin) { return this.levels.get(pin) ?? null; }

  run(t1, inputEvents = []) {
    if (typeof t1 !== 'number' || Number.isNaN(t1) || t1 < this.now) throw new Error(`run(t1): a time from now (${this.now} ps) on, not ${t1}`);
    for (const e of inputsOf(inputEvents, this.now, t1, this.inputs)) { this.received.push({ pin: e.pin, t: e.t, value: e.value }); this.levels.set(e.pin, e.value); }
    const outputs = [];
    while (this.next < this.script.length && this.script[this.next].t <= t1) {
      const e = this.script[this.next++];
      this.levels.set(e.pin, e.value);
      outputs.push({ ...e });
    }
    this.now = t1;
    return { outputs, t: t1 };
  }

  messages() { return []; }

  save() { return { t: this.now, next: this.next, received: this.received.map(e => ({ ...e })), levels: [...this.levels] }; }

  restore(s) {
    this.now = s.t; this.next = s.next;
    this.received = s.received.map(e => ({ ...e }));
    this.levels = new Map(s.levels);
  }
}

/**
 * A node of the contract as the scheduler's adapter (core/system-sim.js: advanceTo, setPin, value…), for a node that has
 * only the contract (a stimulus; the PIC24's): its inputs set at the time they are set, given to its next run; its
 * outputs' levels kept; at(t, fn) at its time, the node run up to it first. A node that ends a run past t (an
 * instruction under way) is run from there.
 */
export class NodeEngine {
  constructor(node) {
    const why = contractProblems(node);
    if (why.length) throw new Error(why[0]);
    this.node = node;
    this.inputs = node.ports.filter(reads).map(p => p.name);
    this.outputs = node.ports.filter(drives).map(p => p.name);
    this.lookahead = node.lookahead ?? null;
    this.levels = new Map(this.outputs.map(p => [p, node.value?.(p) ?? null]));
    this.set = new Map();
    this.pending = [];
    this.queue = [];
    this.now = 0;
  }

  get finished() { return this.node.finished ?? null; }

  /** A pin's value now: an output's as the node drives it, an input's as set (null: not known). */
  value(pin) {
    if (this.levels.has(pin) && !this.set.has(pin)) return this.levels.get(pin);
    return this.set.get(pin) ?? this.levels.get(pin) ?? null;
  }

  setPin(pin, value) {
    if (!this.inputs.includes(pin)) throw new Error(`'${pin}' is not an input of the node`);
    this.set.set(pin, value);
    this.pending.push({ pin, t: this.now, value });
  }

  at(t, fn) {
    let i = this.queue.length;
    while (i && this.queue[i - 1].t > t) i--;
    this.queue.splice(i, 0, { t: Math.max(t, this.now), fn });
  }

  nextEventTime() { return this.queue.length ? this.queue[0].t : Infinity; }

  // the node run to t with the inputs set since its last run (at its time when it ended past them)
  runTo(t, out) {
    const from = this.node.now ?? this.now, to = Math.max(t, from);
    const r = this.node.run(to, this.pending.splice(0).map(e => ({ ...e, t: Math.max(e.t, from) })));
    for (const o of r.outputs) { this.levels.set(o.pin, o.value); out.push(o); }
  }

  advanceTo(t) {
    if (t < this.now) throw new Error(`the node is at ${this.now} ps, not back at ${t}`);
    const out = [];
    while (this.queue.length && this.queue[0].t <= t) {
      const e = this.queue.shift();
      this.runTo(e.t, out);
      this.now = e.t;
      e.fn(this);
    }
    this.runTo(t, out);
    this.now = t;
    return out;
  }

  messages() { return this.node.messages(); }
}
