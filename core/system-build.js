// Silinx - a System project's System simulated (#4701, docs/SYSTEMS.md): the System document (core/system-doc.js)
// made the co-simulation scheduler's system (core/system-sim.js): each node its engine's adapter (an FPGA node Silinx's
// compiled engine, core/system-sim-compiled.js, at its board's clock; a microcontroller avr8js, core/system-sim-avr.js;
// a serial terminal core/system-sim-terminal.js), each link its wires: a UART link two (a's TX to b's RX, b's TX to a's
// RX), a GPIO link one a pin, from its `out` end, an SPI link four, an I²C link three (SCL, and SDA each way, #5214); a
// circuit node its own (core/system-sim-circuit.js), a wire each way to an Arduino's pin it wires, one to or from an
// FPGA's port, as the port goes (core/system-circuit.js, #5215). The FPGA node's pins are its module's ports (a UART's tx and rx); a
// microcontroller's its board's (Serial: D1, D0); a terminal's tx and rx. A UART's RX that no link drives idles at 1.
// Every wire has a fixed latency, a sixteenth of the UART's bit (a wire's 1 µs): the run is exact and deterministic.
//
//   const plan = systemPlan(sys, { ports });          // what to compile: each FPGA node's module, clock and pins
//   const { sim, terminals, wires } = buildSystem(sys, plan, { fpga: { id: { model, pins } }, firmware: { id: { name, data } } });
//   sim.run(10e9); linkTraffic(sim, { frames: wireFrames(wires) });
//
// Isomorphic ES module, no DOM.
import { mcuBoard, linkEnd } from './system-doc.js';
import { resolveBoard } from './devices.js';
import { SystemSim } from './system-sim.js';
import { lookahead } from './system-links.js';
import { CompiledNode } from './system-sim-compiled.js';
import { AvrNode } from './system-sim-avr.js';
import { TerminalNode } from './system-sim-terminal.js';
import { CircuitNode } from './system-sim-circuit.js';
import { circuitNodePins } from './system-circuit.js';

const CLOCK_NAME = /^(clk|clock|mclk|sys_?clk|clk_?in)$/i;
const periodPs = text => { const m = /^([\d.]+)\s*ns$/i.exec(String(text || '')); return m ? Math.round(Number(m[1]) * 1000) : null; };

/**
 * An FPGA node's main clock: { port, period (ps), hz } (`ports`: its module's, [{ name, dir }]): the input on a pin of
 * a clock of its board (its period), else an input named clk (clock, mclk…) at the board's first clock's period;
 * 50 MHz when the board says none. null: the module has no such input.
 */
export function fpgaClock(node, ports = []) {
  const r = node.board ? resolveBoard(node.board, { variant: node.variant }) : null;
  const clocks = (r?.resources || []).filter(x => x.group === 'Clock' && x.dir === 'in');
  const inputs = ports.filter(p => p.dir === 'in' && (p.width ?? 1) === 1);
  let port = null, res = null;
  for (const p of inputs) {
    const pin = String(node.pins?.[p.name] || '').toUpperCase();
    const c = pin && clocks.find(x => x.pins.some(q => String(q).toUpperCase() === pin));
    if (c) { port = p.name; res = c; break; }
  }
  if (!port) { port = inputs.find(p => CLOCK_NAME.test(p.name))?.name ?? null; res = clocks.find(c => periodPs(c.extra?.period)); }
  if (!port) return null;
  const period = periodPs(res?.extra?.period) ?? 20000;
  return { port, period, hz: Math.round(1e12 / period) };
}

// a link's end: its node, its interface and the node's pins for it ({ tx, rx } a UART's; pins a GPIO's)
function endOf(sys, end) {
  const e = linkEnd(end), n = e && sys.nodes.find(x => x.id === e.node), f = n?.interfaces.find(x => x.name === e.iface);
  if (!f) return null;
  // (an FPGA's bus bit led<0>, as the UCF writes it: the scheduler's led[0], #5213)
  if (f.kind === 'gpio') return { n, f, pins: n.kind === 'fpga' ? f.pins.map(p => String(p).replace(/<(\d+)>$/, '[$1]')) : f.pins };
  if (f.kind === 'spi') { const s = n.kind === 'mcu' ? mcuBoard(n.board)?.spis?.[f.name] : f; return s ? { n, f, spi: { sck: s.sck, mosi: s.mosi, miso: s.miso, ss: s.ss } } : null; }
  if (f.kind === 'i2c') { const s = n.kind === 'mcu' ? mcuBoard(n.board)?.i2cs?.[f.name] : f; return s ? { n, f, i2c: { scl: s.scl, sda: s.sda } } : null; }
  if (n.kind === 'fpga') return { n, f, tx: f.tx, rx: f.rx };
  if (n.kind === 'mcu') { const u = mcuBoard(n.board)?.uarts[f.name]; return u ? { n, f, tx: u.tx, rx: u.rx } : null; }
  return { n, f, tx: 'tx', rx: 'rx' };
}

/**
 * What to simulate: { fpga: [{ id, module, clock, pins }] (each FPGA node: its module, its clock ({ port, period, hz }),
 * the output pins its links read), circuits: [{ id, model, pins }] (each circuit node: its circuit, its pins of the
 * nodes, #5215), wires: [{ name, link, kind, from, to, baud, frame }], idle: [{ node, pin, value }], errors: [text] }
 * (`ports`: { module: [{ name, dir, width }] }; `circuits`: { id: its circuit, read }). An error: the System cannot be
 * simulated (a node with no module, no clock, no firmware, no circuit; a circuit's board that names no node).
 */
export function systemPlan(sys, { ports = {}, circuits = {} } = {}) {
  const errors = [], wires = [], idle = [], outs = new Map();
  const fpga = [], circ = [];
  for (const n of sys.nodes) {
    if (n.kind === 'fpga') {
      if (!n.module) { errors.push(`${n.id}: no module`); continue; }
      const clock = fpgaClock(n, ports[n.module] || []);
      if (!clock) { errors.push(`${n.id}: the module ${n.module} has no clock input (clk)`); continue; }
      fpga.push({ id: n.id, module: n.module, clock, pins: [] });
      outs.set(n.id, new Set());
    } else if (n.kind === 'mcu' && !n.firmware) errors.push(`${n.id}: no firmware: a .hex or an .elf of the project`);
    else if (n.kind === 'circuit' && !n.circuit) errors.push(`${n.id}: no circuit: a .circ.json of the project`);
    else if (n.kind === 'circuit' && !circuits[n.id]) errors.push(`${n.id}: its circuit ${n.circuit} not read`);
  }
  const driven = new Set();
  for (const l of sys.links) {
    const a = endOf(sys, l.a), b = endOf(sys, l.b);
    if (!a || !b) { errors.push(`${l.id}: an end unknown`); continue; }
    const wire = (from, to, i, kind, uart) => {
      wires.push({ name: i == null ? `${l.id}_${from.n.id}` : `${l.id}_${i}`, link: l.id, kind, from: `${from.n.id}.${from.pin}`, to: `${to.n.id}.${to.pin}`, ...uart });
      outs.get(from.n.id)?.add(from.pin);
      driven.add(`${to.n.id}.${to.pin}`);
    };
    if (l.kind === 'uart') {
      const uart = { baud: a.f.baud, frame: a.f.frame };
      for (const [s, d] of [[a, b], [b, a]]) if (s.tx && d.rx) wire({ n: s.n, pin: s.tx }, { n: d.n, pin: d.rx }, null, 'uart', uart);
    } else if (l.kind === 'spi') {
      // (the master's SCK, MOSI and SS to the peripheral, its MISO back: four wires, `<link>_sck`…, #5214)
      const [m, p] = a.n.kind === 'mcu' ? [a, b] : [b, a];
      for (const k of ['sck', 'mosi', 'ss', 'miso']) {
        const [s, d] = k === 'miso' ? [p, m] : [m, p];
        if (s.spi[k] && d.spi[k]) wire({ n: s.n, pin: s.spi[k] }, { n: d.n, pin: d.spi[k] }, k, 'spi', { hz: m.f.hz, mode: m.f.mode, line: k });
      }
    } else if (l.kind === 'i2c') {
      // (the master's SCL to the peripheral; SDA a wire each way, each end's pulling it low or releasing it: `<link>_scl`,
      // `<link>_sda` the master's, `<link>_sda_back` the peripheral's, #5214)
      const [m, p] = a.n.kind === 'mcu' ? [a, b] : [b, a];
      const i2c = line => ({ hz: m.f.hz, line });
      if (m.i2c.scl && p.i2c.scl) wire({ n: m.n, pin: m.i2c.scl }, { n: p.n, pin: p.i2c.scl }, 'scl', 'i2c', i2c('scl'));
      if (m.i2c.sda && p.i2c.sda) {
        wire({ n: m.n, pin: m.i2c.sda }, { n: p.n, pin: p.i2c.sda }, 'sda', 'i2c', i2c('sda'));
        wire({ n: p.n, pin: p.i2c.sda }, { n: m.n, pin: m.i2c.sda }, 'sda_back', 'i2c', i2c('sda_back'));
      }
    } else {
      const [s, d] = a.f.dir === 'out' ? [a, b] : [b, a];
      s.pins.forEach((p, i) => { if (d.pins[i]) wire({ n: s.n, pin: p }, { n: d.n, pin: d.pins[i] }, s.pins.length > 1 ? i : null, 'wire', {}); });
    }
  }
  // (a circuit node's pins: a wire from each node's pin the circuit reads, one to each it drives, #5215)
  for (const n of sys.nodes.filter(x => x.kind === 'circuit' && circuits[x.id])) {
    const r = circuitNodePins(sys, n, circuits[n.id], { ports });
    errors.push(...r.problems.filter(x => x.severity === 'error').map(x => x.message));
    for (const q of r.pins) {
      const name = `${n.id}_${q.part}_${q.pin}`;
      if (q.to !== 'node') { wires.push({ name, link: n.id, kind: 'wire', from: `${q.node}.${q.nodePin}`, to: `${n.id}.${q.name}` }); outs.get(q.node)?.add(q.nodePin); }
      if (q.to !== 'circuit') { wires.push({ name: q.to === 'both' ? `${name}_back` : name, link: n.id, kind: 'wire', from: `${n.id}.${q.name}`, to: `${q.node}.${q.nodePin}` }); driven.add(`${q.node}.${q.nodePin}`); }
    }
    circ.push({ id: n.id, model: circuits[n.id], pins: r.pins.map(q => ({ name: q.name, part: q.part, n: q.n, ...(q.to === 'both' ? { node: q.node, nodePin: q.nodePin } : {}) })) });
  }
  // (a UART's RX no link drives: idle at 1)
  for (const n of sys.nodes) for (const f of n.interfaces) {
    const e = f.kind === 'uart' ? endOf(sys, `${n.id}.${f.name}`) : null;
    if (e?.rx && !driven.has(`${n.id}.${e.rx}`)) idle.push({ node: n.id, pin: e.rx, value: 1 });
  }
  for (const f of fpga) f.pins = [...outs.get(f.id)];
  return { fpga, circuits: circ, wires, idle, errors };
}

/** The frames of the plan's UART wires ({ name: '8N1' }), for linkTraffic. */
export const wireFrames = wires => Object.fromEntries(wires.filter(w => w.kind === 'uart').map(w => [w.name, w.frame]));

/**
 * The scheduler's system of a plan: { sim, terminals: Map(id → TerminalNode), wires }. fpga: { id: { model, pins } }
 * (compiledNodeModel's, its pins the plan's); firmware: { id: { name, data } } (a microcontroller's .hex text or .elf bytes).
 */
export function buildSystem(sys, plan, { fpga = {}, firmware = {} } = {}) {
  if (plan.errors.length) throw new Error(plan.errors[0]);
  const sim = new SystemSim();
  const terminals = new Map();
  for (const n of sys.nodes) {
    if (n.kind === 'fpga') {
      const p = plan.fpga.find(x => x.id === n.id), m = fpga[n.id];
      if (!m) throw new Error(`${n.id}: its module ${n.module} not compiled`);
      sim.addNode(n.id, new CompiledNode({ ...m, period: p.clock.period }));
    } else if (n.kind === 'mcu') sim.addNode(n.id, new AvrNode({ board: n.board, firmware: firmware[n.id] }));
    else if (n.kind === 'circuit') {
      const c = plan.circuits.find(x => x.id === n.id);
      sim.addNode(n.id, new CircuitNode({ model: c.model, pins: c.pins }));
    } else {
      const u = n.interfaces.find(f => f.kind === 'uart');
      terminals.set(n.id, sim.addNode(n.id, new TerminalNode({ baud: u?.baud ?? 9600, frame: u?.frame ?? '8N1' })));
    }
  }
  // (a circuit's pin an Arduino's: weak while the AVR's is an input with its pull-up, #5215)
  for (const c of plan.circuits ?? []) for (const q of c.pins.filter(x => x.node)) {
    const avr = sim.nodes.get(q.node);
    sim.nodes.get(c.id).weakWhile(q.name, () => !!avr?.pulled?.(q.nodePin));
  }
  for (const w of plan.wires) {
    // (an SPI or I²C wire: a sixteenth of its clock's period, the peripheral's answer in time for the master's next edge;
    // SS and I²C's lines pulled up, #5214)
    const latency = lookahead({ protocol: w.kind, baud: w.baud, hz: w.hz });
    sim.link({ name: w.name, from: w.from, to: w.to, kind: w.kind === 'uart' ? 'uart' : 'wire', baud: w.baud, latency, pull: w.line === 'ss' || w.kind === 'i2c' ? 1 : null });
  }
  for (const { node, pin, value } of plan.idle) sim.nodes.get(node).setPin(pin, value);
  return { sim, terminals, wires: plan.wires };
}
