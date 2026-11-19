// Silinx - the co-design system's adapter of the event-driven simulator (#4696; the scheduler: core/system-sim.js;
// the simulator: packages/silinx-hdl/src/simulator.js): an FPGA node (or a test bench's module) simulated with its
// X values, delays and waveforms. Its clocks are its own (each rising at its periods: k × period, as the compiled
// engine's edges, core/system-sim-compiled.js); its registers with no initial value start at 0, as on the FPGA (the
// Board Emulator's powerUpZero, web/js/emulator.js); its output pins' changes are read from their waveforms (the
// simulator's sig.wave), each at its time. A pin's unknown value (X, Z) is null.
//
//   const node = new EventNode({ design, clocks: [{ port: 'clk', period: 20000 }], pins: ['tx'] });
//
// Isomorphic ES module (browser + Node), no DOM.
import { Simulator } from './simulator.js';
import * as V from './values.js';
import { parsePin } from './system-sim.js';

const allX = (v) => v && !Array.isArray(v) && v.w > 0 && v.x === V.mask(v.w);
// (as web/js/emulator.js powerUpZero; the waveform's value at 0 too, so that a pin starts at its value)
function powerUpZero(design) {
  const zeroOf = (v) => V.withSign(V.fromInt(0, v.w, false), v.s);
  for (const s of design.signals) {
    if (Array.isArray(s.val)) { if (s.val.some(allX)) s.val = s.val.map((e) => (allX(e) ? zeroOf(e) : e)); } else if (allX(s.val)) s.val = zeroOf(s.val);
    if (s.wave) s.wave.v[0] = s.val;
  }
}

// a simulator value as a pin's: a number, null when one of its bits is unknown
function pinValue(val, bit) {
  if (!val || Array.isArray(val) || val.x === undefined) return null;
  if (bit != null) return (val.x >> BigInt(bit)) & 1n ? null : Number((val.v >> BigInt(bit)) & 1n);
  return val.x ? null : Number(val.v);
}

export class EventNode {
  /**
   * design: the elaborated design (its top's ports); clocks: [{ port, period (ps) }]; pins: the outputs the links read;
   * sim: the simulator's options (waveTail…); powerUp: 'zero' (the registers with no initial value at 0) or 'x'.
   */
  constructor({ design, clocks = [], pins = [], sim = {}, powerUp = 'zero' }) {
    this.design = design;
    this.ports = new Map(design.top.ports.map((p) => [p.name, p]));
    const clockPorts = this.clocks = new Set(clocks.map((c) => c.port));
    for (const c of clocks) {
      if (this.ports.get(c.port)?.dir !== 'in') throw new Error(`'${c.port}' is not an input to clock`);
      if (!(c.period > 0)) throw new Error(`the clock '${c.port}': a period (ps) above 0`);
    }
    this.outputs = pins.map((p) => {
      const port = this.ports.get(parsePin(p).port);
      if (!port || port.dir === 'in') throw new Error(`'${p}' is not an output of the node`);
      return p;
    });
    this.inputs = design.top.ports.filter((p) => p.dir !== 'out' && !clockPorts.has(p.name))
      .flatMap((p) => (p.sig.t.w === 1 ? [p.name] : [p.name, ...Array.from({ length: p.sig.t.w }, (_, i) => `${p.name}[${i}]`)]));
    this.pending = [];
    this.sim = new Simulator(design, { ...sim, onLog: (e) => { if (e.kind !== 'print') this.pending.push({ kind: e.kind, text: e.text, time: e.time }); } });
    if (powerUp === 'zero') powerUpZero(design);
    for (const c of clocks) this.sim.addClock(this.ports.get(c.port).sig, { period: c.period, offset: c.period / 2 });
    // (time 0 settled, so that the pins' values are those of the start; a change at 0 after it, an input set then, is
    // read from the waveform's entry at 0)
    this.sim.run(0);
    this.out = this.outputs.map((p) => ({ pin: p, ...parsePin(p), sig: this.ports.get(parsePin(p).port).sig, next: 0 }));
    for (const o of this.out) o.last = pinValue(o.sig.val, o.bit);
    this.events = [];
    this.now = 0;
  }

  get finished() { return this.sim.finished; }

  value(name) {
    const { port, bit } = parsePin(name);
    const p = this.ports.get(port);
    if (!p) throw new Error(`no pin '${name}'`);
    return pinValue(p.sig.val, bit);
  }

  /** An input pin from now on (null: unknown, X). */
  setPin(name, value) {
    const { port, bit } = parsePin(name);
    const p = this.ports.get(port), w = p?.sig.t.w;
    if (!p || p.dir === 'out' || this.clocks.has(port) || (bit != null && bit >= w)) throw new Error(`'${name}' is not an input of the node`);
    let val;
    if (bit == null) val = value == null ? V.allX(w) : V.fromInt(value, w, false);
    else {
      const cur = p.sig.val, m = 1n << BigInt(bit);
      val = V.mk(w, (cur.v & ~m) | (value ? m : 0n), (cur.x & ~m) | (value == null ? m : 0n));
    }
    this.sim.force(p.sig, val);
  }

  at(t, fn) {
    t = Math.max(t, this.now);
    this.sim.at(t, () => fn(this));
    let i = this.events.length;
    while (i && this.events[i - 1] > t) i--;
    this.events.splice(i, 0, t);
  }

  nextEventTime() {
    while (this.events.length && this.events[0] <= this.now) this.events.shift();
    return this.events.length ? this.events[0] : Infinity;
  }

  advanceTo(t) {
    if (t < this.now) throw new Error(`the node is at ${this.now} ps, not back at ${t}`);
    this.sim.run(t);
    this.now = t;
    return this.changes(t);
  }

  // the output pins' changes in their waveforms, those before t (a change at t may still be merged with another at t)
  changes(t) {
    const out = [];
    for (const o of this.out) {
      const w = o.sig.wave;
      if (!w) continue;
      const base = w.dropped || 0;
      let i = Math.max(o.next - base, 0);
      for (; i < w.t.length && w.t[i] < t; i++) {
        const v = pinValue(w.v[i], o.bit);
        if (v !== o.last) { o.last = v; out.push({ pin: o.pin, t: w.t[i], value: v }); }
      }
      o.next = base + i;
    }
    return out.length > 1 ? out.sort((a, b) => a.t - b.t) : out;
  }

  messages() { return this.pending.splice(0); }
}
