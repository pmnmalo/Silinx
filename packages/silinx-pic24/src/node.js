// silinx-pic24 - the PIC24 as a node of a System (#5480): its time in ps from its instruction clock, the scheduler's
// run(t1, inputEvents) (docs/SYSTEMS.md, "The node contract"), the pins' hooks the peripherals fill (#5481), its
// state saved and restored. Silinx's adapter (#5484) wraps it as core/system-sim-avr.js wraps avr8js.
//
//   const node = new Pic24Node({ hex });               // XC16's .hex; or { program } (the program words)
//   const { outputs } = node.run(1e9, [{ t: 5e8, pin: 'RD6', value: 0 }]);
//
// A peripheral (#5481) attaches to node.cpu (its SFRs' hooks, its clock events), takes its input pins
// (node.onInput(pin, fn)) and drives its output pins (node.drive(pin, value)): their changes come back from run().

import { createGb610 } from './gb610.js';
import { parseHex } from './hex.js';

export class Pic24Node {
  /** hex: XC16's Intel HEX (text), or program: the program words (index = address / 2); fcy: the instruction clock
   *  (Hz), else the configuration words' (Fosc / 2); primaryHz: the primary oscillator's crystal. */
  constructor({ hex, program, fcy, primaryHz } = {}) {
    this.log = [];
    this.logN = 0;
    let config = new Map(), prog = program ?? [];
    if (hex != null) {
      const h = parseHex(hex);
      prog = h.program;
      config = h.config;
      for (const w of h.warnings) this.log.push({ kind: 'warning', cycle: 0, text: w });
    }
    this.device = createGb610({ program: prog, config, primaryHz, fcy, log: this.log });
    this.mcu = this.device.mcu;
    this.cpu = this.mcu.cpu;
    this.config = this.mcu.config;
    if (hex != null) for (const w of this.config.warnings) this.log.push({ kind: 'warning', cycle: 0, text: w });
    this.inputs = new Map();     // pin -> its level (0, 1, null floating)
    this.handlers = new Map();   // pin -> [fn(value)]
    this.out = [];
    this.levels = new Map();
  }

  /** The node's time (ps): its cycles at Fcy (Fcy as the oscillator sets it, as it changes). */
  get time() { return this.mcu.time; }
  get fcy() { return this.mcu.fcy; }

  /** A peripheral's input pin: fn(value) on each change. */
  onInput(pin, fn) {
    if (!this.handlers.has(pin)) this.handlers.set(pin, []);
    this.handlers.get(pin).push(fn);
  }

  /** An input pin's value from now on. */
  setInput(pin, value) {
    const v = value == null ? null : Number(value) ? 1 : 0;
    this.inputs.set(pin, v);
    for (const fn of this.handlers.get(pin) ?? []) fn(v);
  }

  /** An output pin driven by a peripheral (now): its change is one of run()'s outputs. */
  drive(pin, value) {
    const v = value == null ? null : Number(value) ? 1 : 0;
    if (this.levels.get(pin) === v) return;
    this.levels.set(pin, v);
    this.out.push({ pin, t: this.time, value: v });
  }

  /** The program run to t1 (ps; its last instruction may end past it), each input event applied at its time: the
   *  outputs' changes since the last call, in time order, and the time reached. */
  run(t1, inputEvents = []) {
    const events = [...inputEvents].sort((a, b) => a.t - b.t);
    for (const e of events) {
      this.runTo(e.t);
      this.setInput(e.pin, e.value);
    }
    this.runTo(t1);
    return { outputs: this.out.splice(0).sort((a, b) => a.t - b.t), t: this.time };
  }

  runTo(t) { this.mcu.runTo(t); }

  /** The log since the last call: [{ kind, cycle, pc, text }]. */
  messages() { return this.log.slice(this.logN, (this.logN = this.log.length)); }

  save() { return { cpu: this.cpu.save(), inputs: [...this.inputs], levels: [...this.levels] }; }
  restore(s) {
    this.cpu.restore(s.cpu);
    this.inputs = new Map(s.inputs);
    this.levels = new Map(s.levels);
    this.out = [];
  }
}
