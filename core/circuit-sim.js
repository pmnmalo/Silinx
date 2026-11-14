// A circuit's live simulation (#3897, docs/CIRCUITS.md): event driven, in nanoseconds, each gate with its part's delay
// (inertial: a pulse shorter than the delay does not get through, as VHDL's `after` and Verilog's `#` on a continuous
// assignment, so that the HDL generated from the circuit, core/circuit-hdl.js, simulates the same). Each net's level is
// resolved from its drivers: a strong 0 or 1 (the supply, a logic switch, an IC's output), a weak one (none yet: the
// pull-ups of phase 2), or nothing (Z); two strong drivers of opposite levels are a short, the net X. A pressed button
// joins its two nets. An IC reads its inputs as the real one (a floating 74LS input reads high) and drives nothing
// while unpowered (its VCC pin's net not 1, its GND pin's not 0). Isomorphic module.
import { partDef, gateValue, readInput } from './circuit-parts.js';
import { circuitNets, netText } from './circuit-net.js';
import { portName } from './circuit.js';

const SETTLE_NS = 1000;   // a circuit still changing after this long is said to oscillate

/**
 * A circuit's simulation, at time 0 with its switches as saved and its buttons released (run() settles it).
 * nets: its nets (circuitNets), onLevel(net, level, time): each change of a net's level.
 */
export function createCircuitSim(m, { nets = circuitNets(m), onLevel = null } = {}) {
  const N = nets.nets.length;
  const drivers = [];                       // { net, value, strength, pending, gen, tpd }
  const byNet = Array.from({ length: N }, () => []);
  const readers = Array.from({ length: N }, () => new Set());   // the ICs that read a net (an input or a power pin)
  const parts = new Map(m.parts.map((p) => [p.id, p]));
  const netOfPin = (part, n) => nets.pinNet.get(`${part}.${n}`);
  const addDriver = (net, value, strength = 's', tpd = 0) => { const d = { net, value, strength, pending: null, gen: 0, tpd }; drivers.push(d); byNet[net].push(d); return d; };
  const sources = new Map();                // a logic switch's id → its driver
  const pressed = new Set();                // the buttons pressed
  const ics = [];
  for (const p of m.parts) {
    const d = partDef(p.type);
    if (!d) continue;
    if (d.kind === 'supply') { addDriver(netOfPin(p.id, 1), '1'); addDriver(netOfPin(p.id, 2), '0'); }
    else if (d.type === 'logic-switch') sources.set(p.id, addDriver(netOfPin(p.id, 1), p.on ? '1' : '0'));
    else if (d.kind === 'ic') {
      const ic = { part: p, def: d, vcc: netOfPin(p.id, 14), gnd: netOfPin(p.id, 7), gates: d.gates.map((g) => ({ g, ins: g.ins.map((n) => netOfPin(p.id, n)), out: addDriver(netOfPin(p.id, g.out), 'X', 's', d.tpd) })) };
      ics.push(ic);
      for (const net of [ic.vcc, ic.gnd, ...ic.gates.flatMap((x) => x.ins)]) readers[net].add(ic);
    }
  }

  // the nodes: the nets joined by the pressed buttons
  let nodeOf = [], nodeNets = [];
  function regroup() {
    const parent = Array.from({ length: N }, (_, i) => i);
    const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    for (const b of nets.buttons) if (pressed.has(b.part)) parent[find(b.a)] = find(b.b);
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
    const on = powered(ic);
    for (const x of ic.gates) {
      const v = on ? gateValue(x.g.fn, x.ins.map((net) => readInput(ic.def.family, levels[net]))) : 'Z';
      drive(x.out, v);
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
      while (queue.length && queue[0].t === time) {
        const ev = queue.shift();
        if (ev.gen !== ev.d.gen) continue;
        ev.d.value = ev.v;
        ev.d.pending = null;
      }
      update();
    }
    const quiet = !queue.length;
    if (!quiet) time = end;
    const late = end - maxNs / 10;
    return { quiet, time, start, oscillating: quiet ? [] : levels.map((_, i) => i).filter((i) => lastChange[i] >= late) };
  }

  /** A logic switch set (true: on, 1) or a button pressed (true) or released, at the present time. */
  function set(id, value) {
    const p = parts.get(id), d = partDef(p?.type);
    if (d?.type === 'logic-switch') { const s = sources.get(id); s.value = value ? '1' : '0'; }
    else if (d?.type === 'button') { if (value) pressed.add(id); else pressed.delete(id); regroup(); }
    else throw new Error(`${id} is not a switch or a button of the circuit`);
    update();
  }

  const ledState = (p) => {
    const a = levels[netOfPin(p.id, 1)], k = levels[netOfPin(p.id, 2)];
    return a === '1' && k === '0' ? 'on' : a === 'X' || k === 'X' ? 'x' : 'off';
  };
  return {
    nets, run, set,
    get time() { return time; },
    level: (net) => levels[net],
    /** a pin's level ('U1.3', or a part id and a pin number) */
    pin: (ref, n) => levels[n == null ? nets.pinNet.get(ref) : netOfPin(ref, n)],
    shorts: () => levels.map((_, i) => i).filter((i) => shorted[i]),
    powered: (id) => { const ic = ics.find((x) => x.part.id === id); return ic ? powered(ic) : null; },
    leds: () => Object.fromEntries(m.parts.filter((p) => p.type === 'led').map((p) => [p.id, ledState(p)])),
    /** the outputs as the HDL's ports: an LED's name → '1' while lit */
    outputs: () => Object.fromEntries(m.parts.filter((p) => p.type === 'led').map((p) => [portName(p), ledState(p) === 'on' ? '1' : '0'])),
    inputs: () => Object.fromEntries(m.parts.filter((p) => p.type === 'logic-switch' || p.type === 'button').map((p) => [p.id, p.type === 'button' ? pressed.has(p.id) : sources.get(p.id).value === '1'])),
    changed: (net) => changes[net],
  };
}

/**
 * A run's messages, as the console says them (the editor's Simulate, the MCP server's simulate_drawing): the shorts
 * (the nets two outputs drive opposite ways) and an oscillation (the nets still changing after SETTLE_NS).
 */
export function runMessages(sim, r) {
  const out = [];
  for (const i of sim.shorts()) out.push(`ERROR: Short circuit at ${r.time} ns: ${netText(sim.nets.nets[i])} driven to 0 and 1 at once`);
  if (!r.quiet) out.push(`WARNING: The circuit oscillates: still changing ${SETTLE_NS} ns after ${r.start} ns (${r.oscillating.slice(0, 4).map((i) => netText(sim.nets.nets[i])).join('; ')})`);
  return out;
}
