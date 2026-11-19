// Silinx - the co-design system's adapter of Silinx's compiled engine (#4696; the scheduler: core/system-sim.js): an
// FPGA node, its design compiled (core/compiled-sim.js) with its own main clock, its output pins' changes recorded
// with their cycles (compileNetlist's watch.pins), the cycle k's rising edge at k periods (as the Board Emulator's
// time, core/emulate-compiled.js). An input set at t is seen by the first edge after t.
//
//   const { model, pins } = compiledNodeModel(json, { top: 'uart', clock: 'clk', pins: ['tx'] });
//   const node = new CompiledNode({ model, pins, period: 20000 });
//
// Isomorphic ES module (browser + Node), no DOM.
import { compileNetlist, CompiledSim, portBit } from './compiled-sim.js';
import { parsePin } from './system-sim.js';

/**
 * The model of an FPGA node: the word-level netlist (netlistOf's json and top) compiled with its output pins watched.
 * pins: the outputs the links read (their names: 'tx', 'led[3]'); clock: the main clock's port.
 */
export function compiledNodeModel(json, { top, clock = null, pins = [] }) {
  const bits = pins.map((p) => {
    const { port, bit } = parsePin(p);
    if (json.modules[top]?.ports?.[port]?.direction === 'input') throw new Error(`'${p}' is an input, not an output`);
    return portBit(json, top, port, bit ?? 0);
  });
  return { model: compileNetlist(json, { top, clock: clock || false, watch: { pins: bits } }), pins: [...pins] };
}

export class CompiledNode {
  /** model, pins: compiledNodeModel's; period: the main clock's (ps). */
  constructor({ model, pins, period }) {
    if (!(period > 0)) throw new Error('a node\'s clock period (ps) above 0');
    this.model = model;
    this.period = period;
    this.cs = new CompiledSim(model);
    this.clock = model.clock?.port ?? null;
    this.ports = new Map(model.inputs.filter((p) => p.name !== this.clock).map((p) => [p.name, p]));
    this.outputs = [...pins];
    this.inputs = [...this.ports.values()].flatMap((p) => (p.w === 1 ? [p.name] : [p.name, ...Array.from({ length: p.w }, (_, i) => `${p.name}[${i}]`)]));
    this.inVals = new Map([...this.ports.keys()].map((n) => [n, 0n]));
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

  /** A pin's value now (an input: as set; an output: the design's). */
  value(name) {
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
  // their edges' times, a change after an input was set (a combinational path) not before it
  collect() {
    const raw = this.cs.pins?.take() || [], out = this.out;
    for (let k = 0; k + 2 < raw.length; k += 3) {
      const i = raw[k + 1], v = raw[k + 2];
      if (v === this.last[i]) continue;
      this.last[i] = v;
      out.push({ pin: this.outputs[i], t: Math.max(raw[k] * this.period, this.setAt), value: v });
    }
  }

  messages() { return this.log.slice(this.logN, (this.logN = this.log.length)); }
}
