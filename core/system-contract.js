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
import { portsProblems } from './system-ports.js';

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

/**
 * An engine behind the contract. make(): a new engine (an adapter of core/system-sim.js's, or one that has run(t1,
 * inputEvents) itself: the PIC24's Pic24Node); ports: its typed ports; lookahead, fidelity: the contract's. Its state:
 * the input events it was given and its time; restored on a new engine, the events replayed (their outputs and
 * messages dropped).
 */
export class ContractNode {
  constructor({ make, ports, lookahead = null, fidelity = [] }) {
    if (typeof make !== 'function') throw new Error('a node\'s engine: make(), a function that makes it');
    this.make = make;
    this.ports = ports;
    this.lookahead = lookahead;
    this.fidelity = fidelity;
    const why = contractProblems(this);
    if (why.length) throw new Error(why[0]);
    this.inputs = new Set(ports.filter(p => p.dir !== 'out').map(p => p.name));
    this.engine = make();
    this.now = 0;
    this.t1 = 0;   // (the last run's t1: its engine may have ended past it)
    this.events = [];
  }

  /** The engine advanced to t1, its inputs at their times: { outputs, t }. */
  run(t1, inputEvents = []) {
    if (typeof t1 !== 'number' || Number.isNaN(t1) || t1 < this.now) throw new Error(`run(t1): a time from now (${this.now} ps) on, not ${t1}`);
    const events = inputsOf(inputEvents, this.now, t1, this.inputs);
    const r = typeof this.engine.run === 'function' ? this.engine.run(t1, events) : runEngine(this.engine, t1, events);
    for (const e of events) this.events.push({ pin: e.pin, t: e.t, value: e.value });
    this.now = r.t;
    this.t1 = t1;
    return { outputs: r.outputs, t: r.t };
  }

  /** A port's value now (null when the engine cannot say). */
  value(pin) { return typeof this.engine.value === 'function' ? this.engine.value(pin) : null; }

  messages() { return this.engine.messages(); }

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
