// A circuit's live simulation (#3897, docs/CIRCUITS.md): event driven, in nanoseconds, each gate with its part's delay
// (inertial: a pulse shorter than the delay does not get through, as VHDL's `after` and Verilog's `#` on a continuous
// assignment, so that the HDL generated from the circuit, core/circuit-hdl.js, simulates the same). Each net's level is
// resolved from its drivers: a strong 0 or 1 (the supply, a logic switch, an IC's output), a weak one (none yet: the
// pull-ups and pull-downs), or nothing (Z); two strong drivers of opposite levels are a short, the net X; an open
// collector output drives a 0 or nothing. A closed contact (a pressed button, a switch's, a DIP switch's lever) joins its
// two nets. An IC reads its inputs as the real one (a floating 74LS input reads high, a 4000's X) and drives nothing
// while unpowered (its VCC pin's net not 1, its GND pin's not 0). The student's inputs (switches, buttons, a clock's
// level) are set from outside (set()): the editor's clock ticks in real time. Isomorphic module.
import { partDef, gateValue, readInput, supplyPins } from './circuit-parts.js';
import { circuitNets, netText } from './circuit-net.js';
import { savedInputs, partLamps } from './circuit-io.js';
import { coreModel, MODEL_TPD } from './circuit-live-model.js';
import { setupDevice, evaluateDevice, deviceViews } from './circuit-sim-devices.js';

const SETTLE_NS = 1000;   // a circuit still changing after this long is said to oscillate

/**
 * A circuit's simulation, at time 0 with its switches as saved and its buttons released (run() settles it).
 * nets: its nets (circuitNets), onLevel(net, level, time): each change of a net's level; runner(module): a KiCad part
 * modelled by a module of the project, run live (core/circuit-live-model.js modelRunners, #4284; none: not run);
 * external: pins ('A1.5') driven from outside (a board's, by its System's node, #5215: drive()), nothing at first.
 */
export function createCircuitSim(m, { nets = circuitNets(m), onLevel = null, runner = null, external = [] } = {}) {
  const N = nets.nets.length;
  const drivers = [];                       // { net, value, strength, pending, gen, tpd }
  const byNet = Array.from({ length: N }, () => []);
  const readers = Array.from({ length: N }, () => new Set());   // the ICs that read a net (an input or a power pin)
  const parts = new Map(m.parts.map((p) => [p.id, p]));
  const netOfPin = (part, n) => nets.pinNet.get(`${part}.${n}`);
  const addDriver = (net, value, strength = 's', tpd = 0) => { const d = { net, value, strength, pending: null, gen: 0, tpd }; drivers.push(d); byNet[net].push(d); return d; };
  const state = new Map();                  // each part's inputs: [level] (a switch's, a button pressed, a clock's)
  const sources = new Map();                // a part's input → its strong driver ('S1:0')
  const ics = [];
  for (const p of m.parts) {
    const d = partDef(p.type);
    if (!d) continue;
    if (d.inputs) state.set(p.id, savedInputs(p));
    // (the supply's terminals, a board's 5V and GND, #5215)
    for (const x of supplyPins(d)) addDriver(netOfPin(p.id, x.n), x.value);
    for (const s of d.sources || []) sources.set(`${p.id}:${s.input}`, addDriver(netOfPin(p.id, s.pin), state.get(p.id)[s.input] ? '1' : '0'));
    for (const u of d.pulls || []) addDriver(netOfPin(p.id, u.pin), u.value, 'w');
    // (a KiCad part modelled by a module of the project, #4284: its own copy of the module, run live; its outputs after
    // its delay; none to run: its pins drive nothing)
    const live = d.kind === 'model' && runner?.(d.module)?.make?.();
    if (live && !live.reason) {
      const ic = { part: p, def: d, live, ins: d.pins.filter((q) => q.dir === 'in').map((q) => ({ port: q.port, net: netOfPin(p.id, q.n) })),
        outs: d.pins.filter((q) => q.dir === 'out').map((q) => ({ port: q.port, d: addDriver(netOfPin(p.id, q.n), 'X', 's', MODEL_TPD) })) };
      ics.push(ic);
      for (const x of ic.ins) readers[x.net].add(ic);
    }
    // (a character LCD, a graphic OLED, a servo, a temperature sensor: core/circuit-sim-devices.js)
    const dev = setupDevice(p, d, { at: (name) => netOfPin(p.id, d.pins.find((q) => q.name === name).n), addDriver, level: (net) => levels[net] });
    if (dev) { ics.push(dev.ic); for (const net of dev.reads) readers[net].add(dev.ic); }
    if (d.kind === 'ic') {
      const pinOf = (dir) => d.pins.find((q) => q.dir === dir).n;
      const ic = { part: p, def: d, vcc: netOfPin(p.id, pinOf('vcc')), gnd: netOfPin(p.id, pinOf('gnd')),
        gates: (d.gates || []).map((g) => ({ g, ins: g.ins.map((n) => netOfPin(p.id, n)), en: (g.en || []).map(([n, a]) => [netOfPin(p.id, n), a]), out: addDriver(netOfPin(p.id, g.out), 'X', 's', d.tpd) })) };
      // (an MSI IC: its model, its inputs and outputs by port, core/circuit-msi.js)
      if (d.model || d.seq || d.core) {
        // (an IC written once in VHDL, #4397: its own copy of its core, run live)
        if (d.core) ic.core = coreModel(d);
        ic.ins = d.pins.filter((q) => q.dir === 'in').map((q) => ({ port: q.port, net: netOfPin(p.id, q.n) }));
        ic.outs = d.pins.filter((q) => q.dir === 'out' || q.dir === 'oc').map((q) => ({ port: q.port, oc: q.dir === 'oc', d: addDriver(netOfPin(p.id, q.n), 'X', 's', d.tpd) }));
      }
      ics.push(ic);
      for (const net of [ic.vcc, ic.gnd, ...ic.gates.flatMap((x) => [...x.ins, ...x.en.map(([n]) => n)]), ...(ic.ins || []).map((x) => x.net)]) readers[net].add(ic);
    }
  }
  // (the pins driven from outside, #5215: a driver each, nothing (Z) until drive())
  const outside = new Map(external.map((ref) => [ref, addDriver(nets.pinNet.get(ref), 'Z')]));
  const closed = (c) => state.get(c.part)[c.input] === c.when;

  // the nodes: the nets joined by the closed contacts
  let nodeOf = [], nodeNets = [];
  function regroup() {
    const parent = Array.from({ length: N }, (_, i) => i);
    const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    for (const c of nets.contacts) if (closed(c)) parent[find(c.a)] = find(c.b);
    const ids = new Map();
    nodeOf = parent.map((_, i) => { const r = find(i); if (!ids.has(r)) ids.set(r, ids.size); return ids.get(r); });
    nodeNets = Array.from({ length: ids.size }, () => []);
    nodeOf.forEach((k, i) => nodeNets[k].push(i));
  }
  // a node's level and whether it is a short: its strongest drivers' level
  function resolveNode(k) {
    const strong = new Set(), weak = new Set();
    for (const net of nodeNets[k]) for (const d of byNet[net]) if (d.value !== 'Z') (d.strength === 's' ? strong : weak).add(d.value);
    const pick = (s) => (s.size === 1 ? [...s][0] : 'X');
    if (strong.size) return { level: pick(strong), short: strong.has('0') && strong.has('1') };
    if (weak.size) return { level: pick(weak), short: false };
    return { level: 'Z', short: false };
  }
  let levels = new Array(N).fill('Z'), shorted = new Array(N).fill(false);
  const queue = [];                         // [{ t, d, v, gen }], by time (a stable order for equal times)
  let time = 0, changes = new Array(N).fill(0), lastChange = new Array(N).fill(-1);

  const powered = (ic) => levels[ic.vcc] === '1' && levels[ic.gnd] === '0';
  function evaluate(ic) {
    if (evaluateDevice(ic, { powered, level: (net) => levels[net], now: () => time, drive, wake: (at) => wake(ic, at), input: (k) => !!state.get(ic.part.id)?.[k] })) return;
    if (ic.live) {   // (a module: its inputs' levels in, its outputs' out)
      const o = ic.live.run(Object.fromEntries(ic.ins.map((x) => [x.port, levels[x.net]])));
      for (const x of ic.outs) drive(x.d, o[x.port] ?? 'X');
      return;
    }
    const on = powered(ic);
    for (const x of ic.gates) {
      // (a three-state buffer, #4397: its output while all its enables are at their active level, off (Z) once one is not)
      const en = x.en.map(([net, a]) => { const r = readInput(ic.def.family, levels[net]); return r === 'X' ? 'X' : r === a ? '1' : '0'; });
      const v = !on || en.includes('0') ? 'Z' : en.includes('X') ? 'X' : gateValue(x.g.fn, x.ins.map((net) => readInput(ic.def.family, levels[net])), x.g.terms);
      drive(x.out, ic.def.oc && v === '1' ? 'Z' : v);   // (an open collector: a 0 or nothing)
    }
    // (a sequential IC, core/circuit-seq.js: each of its processes run when an input of its sensitivity changed (all at
    // first), as its HDL's, powered or not; its outputs from its state while powered)
    if (ic.def.seq) {
      const q = ic.def.seq;
      ic.state ||= q.init();
      const i = Object.fromEntries(ic.ins.map((x) => [x.port, readInput(ic.def.family, levels[x.net])]));
      Object.assign(i, q.derive?.(i));
      const p = ic.prev || {};
      for (const pr of q.procs) if (!ic.prev || pr.sens.some((k) => p[k] !== i[k])) pr.run(i, p, ic.state);
      ic.prev = i;
      const o = q.out(i, ic.state);
      for (const x of ic.outs) drive(x.d, !on ? 'Z' : x.oc && o[x.port] === '1' ? 'Z' : o[x.port]);
    } else if (ic.core) {
      // (its core's outputs from its inputs as the chip reads them, while powered; a core that cannot run: X)
      const i = Object.fromEntries(ic.ins.map((x) => [x.port, readInput(ic.def.family, levels[x.net])]));
      const o = ic.core.run ? ic.core.run(i) : {};
      // (three-state outputs, a 74373's: off once an enable is not at its level, X while one is unknown)
      // (an output's own section's, the 74253's; an enable one of its outputs, the 74348's GS̅: the core's level)
      const ts = ic.def.threeState;
      const offOf = (port) => {
        if (!ts?.outs.includes(port)) return null;
        const en = (ts.sections?.find((s) => s.outs.includes(port)) ?? ts).enable.map(([p, a]) => { const v = i[p] ?? o[p]; return v === 'X' || v == null ? 'X' : v === a ? '1' : '0'; });
        return en.includes('0') ? 'Z' : en.includes('X') ? 'X' : null;
      };
      // (an open collector, the 74596's: a 0, or nothing)
      for (const x of ic.outs) { const v = !on ? 'Z' : (offOf(x.port) ?? o[x.port] ?? 'X'); drive(x.d, x.oc && v === '1' ? 'Z' : v); }
    } else if (ic.def.model) {
      const i = Object.fromEntries(ic.ins.map((x) => [x.port, readInput(ic.def.family, levels[x.net])]));
      const o = !on ? null : Object.values(i).includes('X') ? 'X' : ic.def.model(Object.fromEntries(Object.entries(i).map(([k, v]) => [k, Number(v)])));
      for (const x of ic.outs) {
        const v = !on ? 'Z' : o === 'X' ? 'X' : String(o[x.port]);
        drive(x.d, x.oc && v === '1' ? 'Z' : v);
      }
    }
  }
  // an output's new value, after its delay (inertial: a pending change to another value is cancelled)
  function drive(d, v) {
    if (d.pending && d.pending.v === v) return;
    d.gen++;
    d.pending = null;
    if (v === d.value) return;
    const ev = { t: time + d.tpd, d, v, gen: d.gen };
    d.pending = ev;
    let i = queue.length;
    while (i > 0 && queue[i - 1].t > ev.t) i--;
    queue.splice(i, 0, ev);
  }
  // a device evaluated again at `at` (ns), its own time (#5456: an echo's start and its end), as an event of the queue
  function wake(ic, at) {
    const ev = { t: Math.max(at, time), wake: ic };
    let i = queue.length;
    while (i > 0 && queue[i - 1].t > ev.t) i--;
    queue.splice(i, 0, ev);
  }
  // the levels after a change of drivers: every node again, and the ICs that read a net that changed evaluated
  function update() {
    const touched = new Set();
    for (let k = 0; k < nodeNets.length; k++) {
      const r = resolveNode(k);
      for (const net of nodeNets[k]) {
        shorted[net] = r.short;
        if (levels[net] !== r.level) { levels[net] = r.level; changes[net]++; lastChange[net] = time; onLevel?.(net, r.level, time); for (const ic of readers[net]) touched.add(ic); }
      }
    }
    for (const ic of touched) evaluate(ic);
  }

  regroup();
  update();
  for (const ic of ics) evaluate(ic);

  /**
   * Runs until the circuit is quiet, at most `maxNs` from now: { quiet, time, oscillating: [net index] } (the nets
   * still changing in the last tenth of the window, when it is not quiet).
   */
  function run({ maxNs = SETTLE_NS } = {}) {
    const start = time, end = time + maxNs;
    changes = new Array(N).fill(0);
    while (queue.length && queue[0].t <= end) {
      time = queue[0].t;
      const woke = new Set();
      while (queue.length && queue[0].t === time) {
        const ev = queue.shift();
        if (ev.wake) { woke.add(ev.wake); continue; }
        if (ev.gen !== ev.d.gen) continue;
        ev.d.value = ev.v;
        ev.d.pending = null;
      }
      update();
      for (const ic of woke) evaluate(ic);
    }
    // (quiet: nothing left but a device's own wake-ups, #5456, which a later run or advance reaches)
    const quiet = queue.every((e) => e.wake);
    if (!quiet) time = end;
    const late = end - maxNs / 10;
    return { quiet, time, start, oscillating: quiet ? [] : levels.map((_, i) => i).filter((i) => lastChange[i] >= late) };
  }

  /** One of a part's inputs set (true: a switch on, a button pressed, a clock high; `index`: a DIP switch's lever), now. */
  function set(id, value, index = 0) {
    const st = state.get(id), d = partDef(parts.get(id)?.type);
    if (!st || index < 0 || index >= st.length) throw new Error(`${id}${index ? ` (${index + 1})` : ''} is not a switch, a button or a clock of the circuit`);
    st[index] = !!value;
    const src = sources.get(`${id}:${index}`);
    if (src) src.value = value ? '1' : '0';
    if (d.contacts) regroup();
    update();
    // (a device whose input it is, #5463: a motion sensor's someone moving)
    for (const ic of ics.filter((x) => x.pir && x.part.id === id)) evaluate(ic);
  }

  /** A pin driven from outside (one of `external`), now: its level ('0', '1', 'Z': nothing) and strength ('s' strong,
   *  'w' weak: an AVR's pull-up), #5215. */
  function driveOutside(ref, level, strength = 's') {
    const d = outside.get(ref);
    if (!d) throw new Error(`${ref} is not a pin driven from outside the circuit`);
    if (d.value === level && d.strength === strength) return;
    d.value = level;
    d.strength = strength;
    update();
  }

  // a lamp: on (its anode 1, its cathode 0), x (either unknown) or off
  const lampState = (x) => {
    const a = levels[netOfPin(x.part, x.a)], k = levels[netOfPin(x.part, x.k)];
    return a === '1' && k === '0' ? 'on' : a === 'X' || k === 'X' ? 'x' : 'off';
  };
  const lit = m.parts.filter((p) => partDef(p.type)?.lamps);
  return {
    nets, run, set, drive: driveOutside,
    /** the simulated time moved on by `ns` (a clock's half period between its ticks), the circuit run meanwhile */
    advance(ns) { const r = run({ maxNs: ns }); if (r.quiet) time = r.start + ns; return { ...r, time }; },
    /** the time (ns) a device waits for, its next own wake-up (#5456), or null */
    nextWake: () => queue.find((e) => e.wake)?.t ?? null,
    /** each logic probe's tip level: 0, 1, Z (open), X */
    probes: () => Object.fromEntries(m.parts.filter((p) => p.type === 'probe').map((p) => [p.id, levels[netOfPin(p.id, 1)]])),
    get time() { return time; },
    level: (net) => levels[net],
    /** a pin's level ('U1.3', or a part id and a pin number) */
    pin: (ref, n) => levels[n == null ? nets.pinNet.get(ref) : netOfPin(ref, n)],
    shorts: () => levels.map((_, i) => i).filter((i) => shorted[i]),
    ...deviceViews(ics, { now: () => time, evaluate, update }),
    powered: (id) => { const ic = ics.find((x) => x.part.id === id); return ic ? powered(ic) : null; },
    /** each part's lamps: an LED's state, a display's or a bar's list of them */
    leds: () => Object.fromEntries(lit.map((p) => { const s = partLamps(p).map(lampState); return [p.id, s.length === 1 ? s[0] : s]; })),
    /** the outputs as the HDL's ports: a lamp's port → '1' while lit */
    outputs: () => Object.fromEntries(lit.flatMap((p) => partLamps(p).map((x) => [x.port, lampState(x) === 'on' ? '1' : '0']))),
    /** each part's inputs: a level (one), or a list (a DIP switch's) */
    inputs: () => Object.fromEntries([...state].map(([id, st]) => [id, st.length === 1 ? st[0] : [...st]])),
    changed: (net) => changes[net],
  };
}

/**
 * A run's messages, as the console says them (the editor's Try it, the MCP server's simulate_drawing): the shorts
 * (the nets two outputs drive opposite ways) and an oscillation (the nets still changing after SETTLE_NS).
 */
export function runMessages(sim, r) {
  const out = [];
  for (const i of sim.shorts()) out.push(`ERROR: Short circuit at ${r.time} ns: ${netText(sim.nets.nets[i])} driven to 0 and 1 at once`);
  if (!r.quiet) out.push(`WARNING: The circuit oscillates: still changing ${SETTLE_NS} ns after ${r.start} ns (${r.oscillating.slice(0, 4).map((i) => netText(sim.nets.nets[i])).join('; ')})`);
  return out;
}
