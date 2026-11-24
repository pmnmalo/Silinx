// Silinx - a System's adapter of a circuit (#5215; the scheduler: core/system-sim.js): a circuit node, what
// lies between the boards, run by the circuit's own simulation (core/circuit-sim.js: event driven, in ns, each IC with its
// delay). Its pins are its boards' pins the circuit wires to something ('A1:D2', core/system-circuit.js), each an input
// and an output of the node: set (setPin), it drives the board's pin in the circuit (strong, or weak while `weak(pin)`
// says so: an AVR's input with its pull-up); its value is the pin's net's level (1, 0, null: open or unknown). Its
// switches and buttons are as saved, or set (setInput: the System Emulator's clicks, the MCP's controls, #5322); its
// clocks tick at their frequency from 0; its LEDs' states and the times each lit are kept (lamps()); a short is said,
// once a net.
//
//   const node = new CircuitNode({ model, pins: [{ name: 'A1:D2', part: 'A1', n: 5 }] });
//
// Isomorphic ES module, no DOM.
import { createCircuitSim } from './circuit-sim.js';
import { circuitNets, netText } from './circuit-net.js';

const num = (level) => (level === '1' ? 1 : level === '0' ? 0 : null);
const lvl = (v) => (v == null ? 'Z' : Number(v) ? '1' : '0');

export class CircuitNode {
  /** model: the circuit (normalized); pins: [{ name, part, n }], its pins of the System's nodes. */
  constructor({ model, pins }) {
    const nets = circuitNets(model);
    this.refs = new Map(pins.map((p) => [p.name, `${p.part}.${p.n}`]));
    this.inputs = [...this.refs.keys()];
    this.outputs = [...this.refs.keys()];
    const byNet = new Map();
    for (const [name, ref] of this.refs) { const k = nets.pinNet.get(ref); byNet.set(k, [...(byNet.get(k) || []), name]); }
    this.out = [];
    this.sim = createCircuitSim(model, { nets, external: [...this.refs.values()],
      onLevel: (net, level, time) => { for (const pin of byNet.get(net) || []) this.out.push({ pin, t: Math.round((time - (this.base ?? 0)) * 1000), value: num(level) }); } });
    this.sim.run();
    this.out = [];   // (settled at 0: its levels at the start, value()'s)
    this.base = this.sim.time;
    this.now = 0;
    this.set = new Map();   // a pin's value as set, and its strength
    this.weak = new Map();
    this.log = [];
    this.logN = 0;
    this.shorted = new Set();
    this.finished = null;
    this.lit = new Map(Object.entries(this.sim.outputs()).map(([k, v]) => [k, { on: v === '1', times: v === '1' ? 1 : 0 }]));
    // (its clocks: each its half period, ps, and its next edge, #5322)
    this.clocks = model.parts.filter((p) => p.type === 'clock').map((p) => ({ id: p.id, half: Math.round(5e11 / (p.hz || 1)), next: Math.round(5e11 / (p.hz || 1)) }));
  }

  /** One of its parts' inputs set now (a switch on, a button pressed; `index`: a DIP switch's lever), #5322. */
  setInput(part, value, index = 0) { this.sim.set(part, !!value, index); }

  /** A temperature sensor's temperature set now (°C, #5342). */
  setTemp(part, t) { this.sim.setTemp(part, t); }

  /** Its temperature sensors' states (#5342). */
  sensors() { return this.sim.sensors(); }

  /** Its servos' states (#5347). */
  servos() { return this.sim.servos(); }
  /** Its buzzers' states (#5454). */
  buzzers() { return this.sim.buzzers(); }
  /** Its ultrasonic sensors' states (#5456). */
  sonars() { return this.sim.sonars(); }
  /** A part's sensed value set now (#5456: an ultrasonic sensor's distance, cm). */
  setSensed(part, prop, v) { this.sim.setSensed(part, prop, v); }

  /** A pin set weak while weak() says so (an AVR's input with its pull-up). */
  weakWhile(name, weak) { this.weak.set(name, weak); }

  setPin(name, value) {
    const ref = this.refs.get(name);
    if (!ref) throw new Error(`'${name}' is not a pin of the circuit`);
    this.set.set(name, value);
    this.sim.drive(ref, lvl(value), this.weak.get(name)?.() ? 'w' : 's');
  }

  value(name) {
    const ref = this.refs.get(name);
    if (!ref) throw new Error(`no pin '${name}'`);
    return num(this.sim.pin(ref));
  }

  // (a device's own wake-up, #5456: an ultrasonic sensor's echo starting or ending, at its time, ps)
  nextEventTime() { const w = this.sim.nextWake(); return w == null ? Infinity : Math.round((w - this.base) * 1000); }

  advanceTo(t) {
    if (t < this.now) throw new Error(`the node is at ${this.now} ps, not back at ${t}`);
    // (a pin's strength as its driver's now: an AVR's pin from an output to an input with its pull-up, the same 1)
    for (const [name, weak] of this.weak) if (this.set.has(name)) this.sim.drive(this.refs.get(name), lvl(this.set.get(name)), weak() ? 'w' : 's');
    const step = (to) => { const ns = this.base + to / 1000 - this.sim.time; if (ns > 0) this.sim.advance(ns); };
    // (its clocks' edges up to t, each at its time)
    for (;;) {
      const e = Math.min(...this.clocks.map((c) => c.next));
      if (!(e <= t)) break;
      step(e);
      for (const c of this.clocks.filter((x) => x.next === e)) { this.sim.set(c.id, !this.sim.inputs()[c.id]); c.next += c.half; }
    }
    step(t);
    this.now = t;
    // (a servo's pulses that are no servo's, #5347; a buzzer's tone no one hears, #5454: once each)
    for (const w of this.sim.servoWarnings().slice(this.saidServo ?? 0)) this.log.push({ kind: 'warning', text: w, time: t });
    this.saidServo = this.sim.servoWarnings().length;
    for (const i of this.sim.shorts()) {
      if (this.shorted.has(i)) continue;
      this.shorted.add(i);
      this.log.push({ kind: 'warning', text: `a short circuit at ${+(t / 1e6).toFixed(3)} µs: ${netText(this.sim.nets.nets[i])} driven to 0 and 1 at once`, time: t });
    }
    for (const [k, v] of Object.entries(this.sim.outputs())) {
      const l = this.lit.get(k), on = v === '1';
      if (on && !l.on) l.times++;
      l.on = on;
    }
    return this.out.splice(0).sort((a, b) => a.t - b.t);
  }

  /** Its character LCDs' displays (#5330): { id: { on, lines, cursor, blink } }. */
  lcds() { return this.sim.lcds(); }

  /** Its graphic OLEDs' displays (#5336): { id: { on, lit, pages, rows } }. */
  oleds() { return this.sim.oleds(); }

  /** Its lamps (an LED, a display's segments): { port: { on, times } } (lit now, the times it lit, seen at the windows' ends). */
  lamps() { return Object.fromEntries([...this.lit].map(([k, v]) => [k, { ...v }])); }

  messages() { return this.log.slice(this.logN, (this.logN = this.log.length)); }
}
