// Silinx - a System's adapter of Silinx's compiled engine (#4696; the scheduler: core/system-sim.js): an
// FPGA node, its design compiled (core/compiled-sim.js) with its own main clock, its output pins' changes recorded
// with their cycles (compileNetlist's watch.pins), the cycle k's rising edge at k periods (as the Board Emulator's
// time, core/emulate-compiled.js). An input set at t is seen by the first edge after t.
//
//   const { model, pins, index } = compiledNodeModel(json, { top: 'uart', clock: 'clk', pins: ['tx'] });
//   const node = new CompiledNode({ model, pins, index, period: 20000 });
//
// Isomorphic ES module (browser + Node), no DOM.
import { compileNetlist, CompiledSim, portBit } from './compiled-sim.js';
import { splitPads } from './compiled-inout.js';
import { parsePin } from './system-sim.js';
import { ContractNode } from './system-contract.js';

/**
 * The model of an FPGA node: the word-level netlist (netlistOf's json and top) compiled with its output pins watched.
 * pins: the outputs the links read (their names: 'tx', 'led[3]'); clock: the main clock's port. A pin of a pad (an inout
 * port, an output driven with 'Z', #4709) is what the design drives on it: its level where it drives it, null where it
 * does not (its enable 0: an I²C peripheral's SDA released, #5214), from its value and its enable (watched both: `index`,
 * each pin's watched bits).
 */
export function compiledNodeModel(json, { top, clock = null, pins = [] }) {
  const mod = json.modules[top];
  const { mod: split } = mod ? splitPads(mod) : { mod };
  const net = split === mod ? json : { ...json, modules: { ...json.modules, [top]: split } };
  const bits = [], index = [];
  for (const p of pins) {
    const { port, bit } = parsePin(p);
    const dir = mod?.ports?.[port]?.direction;
    if (dir === 'input') throw new Error(`'${p}' is an input, not an output`);
    const en = split?.ports?.[`${port}:en`];
    index.push(en ? [bits.length, bits.length + 1] : [bits.length]);
    bits.push(portBit(net, top, dir === 'inout' ? `${port}:out` : port, bit ?? 0));
    if (en) bits.push(portBit(net, top, `${port}:en`, bit ?? 0));
  }
  return { model: compileNetlist(net, { top, clock: clock || false, watch: { pins: bits } }), pins: [...pins], index };
}

export class CompiledNode {
  /** model, pins, index: compiledNodeModel's; period: the main clock's (ps). */
  constructor({ model, pins, index = null, period }) {
    if (!(period > 0)) throw new Error('a node\'s clock period (ps) above 0');
    this.model = model;
    this.period = period;
    this.cs = new CompiledSim(model);
    this.clock = model.clock?.port ?? null;
    this.ports = new Map(model.inputs.filter((p) => p.name !== this.clock).map((p) => [p.name, p]));
    this.outputs = [...pins];
    this.index = index ?? pins.map((_, i) => [i]);
    this.pad = new Map(this.outputs.map((p, i) => [p, i]).filter(([, i]) => this.index[i].length > 1));
    this.inputs = [...this.ports.values()].flatMap((p) => (p.w === 1 ? [p.name] : [p.name, ...Array.from({ length: p.w }, (_, i) => `${p.name}[${i}]`)]));
    this.inVals = new Map([...this.ports.keys()].map((n) => [n, 0n]));
    // (each watched bit's level, a pad's value and enable)
    this.bitLv = [];
    this.outputs.forEach((p, i) => { const { port, bit } = parsePin(p); this.index[i].forEach((k, j) => { this.bitLv[k] = this.bitOf(j ? `${port}:en` : this.pad.has(p) && model.nets.has(`${port}:out`) ? `${port}:out` : port, bit); }); });
    this.last = this.outputs.map((p) => this.value(p));
    this.now = 0;
    this.setAt = 0;
    this.out = [];
    this.queue = [];
    this.log = [];
    this.logN = 0;
    this.finished = null;
    this.warnings = model.warnings || [];
  }

  // a port's bit now (the whole port: bit null)
  bitOf(port, bit) {
    const bits = this.model.nets.get(port);
    if (!bits) throw new Error(`no pin '${port}'`);
    return Number(bit == null ? this.cs.bits(bits) : this.cs.bits([bits[bit]]));
  }

  // an output pin's level from its watched bits (a pad's: null where its enable is 0)
  level(i) {
    const [v, e] = this.index[i];
    return e == null || this.bitLv[e] ? this.bitLv[v] : null;
  }

  /** A pin's value now (an input: as set; an output: the design's; a pad's: what the design drives, null where it does
   *  not). */
  value(name) {
    if (this.pad.has(name)) return this.level(this.pad.get(name));
    const { port, bit } = parsePin(name);
    let v;
    if (this.inVals.has(port)) v = this.inVals.get(port);
    else {
      const bits = this.model.nets.get(port);
      if (!bits) throw new Error(`no pin '${name}'`);
      v = this.cs.bits(bits);
    }
    return Number(bit == null ? v : (v >> BigInt(bit)) & 1n);
  }

  /** An input pin from now on (unknown, null, as 0: the compiled engine has two states). */
  setPin(name, value) {
    const { port, bit } = parsePin(name);
    const p = this.ports.get(port);
    if (!p || (bit != null && bit >= p.w)) throw new Error(`'${name}' is not an input of the node`);
    const v = BigInt(value ?? 0);
    const now = bit == null ? BigInt.asUintN(p.w, v) : (this.inVals.get(port) & ~(1n << BigInt(bit))) | ((v & 1n) << BigInt(bit));
    this.collect();   // (the changes recorded before it, at their times)
    this.inVals.set(port, now);
    this.cs.set(port, now);
    this.setAt = this.now;
  }

  at(t, fn) {
    let i = this.queue.length;
    while (i && this.queue[i - 1].t > t) i--;
    this.queue.splice(i, 0, { t: Math.max(t, this.now), fn });
  }

  nextEventTime() { return this.queue.length ? this.queue[0].t : Infinity; }

  // the cycles whose rising edges are up to t
  step(t) {
    const n = Math.floor(t / this.period) - this.cs.cycles;
    if (n <= 0 || this.finished) return;
    try { this.cs.cycle(n); } catch (e) {
      this.finished = 'error';
      this.log.push({ kind: 'error', time: this.cs.cycles * this.period, text: e.message });
    }
  }

  advanceTo(t) {
    if (t < this.now) throw new Error(`the node is at ${this.now} ps, not back at ${t}`);
    while (this.queue.length && this.queue[0].t <= t) {
      const e = this.queue.shift();
      this.step(e.t);
      this.now = e.t;
      e.fn(this);
    }
    this.step(t);
    this.now = t;
    this.collect();
    return this.out.splice(0);
  }

  // the pins' changes the cycles recorded, [cycle, index, level…] (the level after the cycle's rising edge), into out: at
  // their edges' times, a change after an input was set (a combinational path) not before it; a pad's value and enable
  // changed in one cycle one change
  collect() {
    const raw = this.cs.pins?.take() || [], out = this.out, touched = new Set(), of = this.pinOfBit ??= this.index.flatMap((ks, i) => ks.map(() => i));
    let cy = null;
    const flush = () => {
      for (const i of touched) {
        const v = this.level(i);
        if (v === this.last[i]) continue;
        this.last[i] = v;
        out.push({ pin: this.outputs[i], t: Math.max(cy * this.period, this.setAt), value: v });
      }
      touched.clear();
    };
    for (let k = 0; k + 2 < raw.length; k += 3) {
      if (raw[k] !== cy) { flush(); cy = raw[k]; }
      this.bitLv[raw[k + 1]] = raw[k + 2];
      touched.add(of[raw[k + 1]]);
    }
    flush();
  }

  messages() { return this.log.slice(this.logN, (this.logN = this.log.length)); }
}

/** What the compiled engine models and what it does not (the node contract's fidelity notes, #5499). */
export const COMPILED_FIDELITY = [
  { kind: 'models', text: 'the design\'s registers and logic, cycle by cycle, at its main clock' },
  { kind: 'approximates', text: 'an input is seen at the first rising edge after it is set; an unknown or high-impedance input is 0 (two states)' },
  { kind: 'omits', text: 'the gates\' and wires\' delays; clocks other than the main one' },
];

/** An FPGA node of the compiled engine behind the node contract (core/system-contract.js): `opts` CompiledNode's, its
 *  pins at `volts` (its bank's level; null: not known). */
export const compiledContract = (opts, { volts = null } = {}) => new ContractNode({ make: () => new CompiledNode(opts), volts, fidelity: COMPILED_FIDELITY });
