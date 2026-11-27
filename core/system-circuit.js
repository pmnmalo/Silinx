// Silinx - a circuit as a System's node (#5215, the Systems' phase 2, docs/SYSTEMS.md): what lies between the boards (a
// level shifter, LEDs, buttons), a circuit of the project whose boards (core/circuit-boards.js: an Arduino, an FPGA board)
// are the System's nodes their labels name (a board labelled `uno` is the node uno; no label: its id). Each pin of a
// board the circuit wires to something is a pin of that node: an Arduino's its board's pin (D2; SDA and SCL its A4 and A5),
// both ways (an AVR's pin is an input or an output as its program says); an FPGA board's the port of its node's module on
// that package pin (its UCF's), the way the port goes (an output drives the circuit, an input reads it). One resolution
// for the System's check (core/system-check-circuit.js) and its plan (core/system-build.js). Isomorphic module.
import { partDef } from './circuit-parts.js';
import { circuitNets } from './circuit-net.js';
import { mcuBoard } from './system-doc.js';

const lc = (s) => String(s).toLowerCase();
const portBase = (name) => { const m = /^(.+?)<(\d+)>$/.exec(name); return m ? { base: m[1], bit: Number(m[2]) } : { base: name, bit: null }; };

/** The node a board part of a circuit names: its label, else its id. */
export const boardNodeId = (p) => p.label || p.id;

/**
 * A circuit node's boards and pins: { boards: [{ part, title, node }] (the nodes it reaches), pins: [{ name (its pin of
 * the node: 'A1:D2'), part, n, pin ('D2', 'JB1'), node, nodePin (the node's pin: 'D2', 'led[0]'), to ('both': an
 * Arduino's; 'circuit': an FPGA's output drives it; 'node': it drives an FPGA's input), volts, loc, port }], problems:
 * [{ severity, message }] }. `n` the circuit node, `m` its circuit (normalized), `ports`: { module: [{ name, dir, width }]
 * or null } (null: the modules' ports not known, an FPGA's pins not resolved).
 */
export function circuitNodePins(sys, n, m, { ports = null } = {}) {
  const problems = [], boards = [], pins = [];
  const err = (message) => problems.push({ severity: 'error', message }), warn = (message) => problems.push({ severity: 'warning', message });
  const nets = circuitNets(m), seen = new Set();
  for (const p of m.parts) {
    const d = partDef(p.type);
    if (d?.kind !== 'board') continue;
    const id = boardNodeId(p), T = sys.nodes.find((x) => x.id === id);
    if (!T) { err(`${n.id}: its circuit's ${p.id} (${d.title}) names no node: its label, ${id}, is to be a node's id`); continue; }
    // (a microcontroller's board: an Arduino's, an ESP32's, a Pico's, #5898)
    const mcu = !!mcuBoard(d.board);
    if (mcu ? T.kind !== 'mcu' || T.board !== d.board : T.kind !== 'fpga' || T.board !== d.board) {
      err(`${n.id}: its circuit's ${p.id} is ${d.title === 'Arduino Uno' || d.title === 'Arduino Nano' ? 'an' : 'a'} ${d.title}, the node ${T.id} ${T.kind === 'mcu' || T.kind === 'fpga' ? `is on ${T.board ?? 'no board'}` : `is a ${T.kind} node`}`);
      continue;
    }
    boards.push({ part: p.id, title: d.title, node: T.id });
    const ps = ports && T.kind === 'fpga' ? Object.entries(ports).find(([k]) => lc(k) === lc(T.module ?? ''))?.[1] ?? null : null;
    for (const q of d.pins.filter((x) => x.dir === 'board')) {
      const net = nets.nets[nets.pinNet.get(`${p.id}.${q.n}`)];
      if (!net || (!net.wires.length && !net.pins.some((x) => x.part !== p.id))) continue;   // (wired to nothing: not the System's)
      const pin = { name: `${p.id}:${q.name}`, part: p.id, n: q.n, pin: q.name, node: T.id, volts: q.volts ?? null, net: nets.pinNet.get(`${p.id}.${q.n}`) };
      if (mcu) Object.assign(pin, { nodePin: String(q.as ?? q.name).toUpperCase(), to: 'both' });
      else {
        // (the port of the node's module on that package pin, as its UCF says: led<0>, the scheduler's led[0])
        const key = Object.keys(T.pins || {}).find((k) => String(T.pins[k]).toUpperCase() === String(q.loc).toUpperCase());
        if (key == null) { warn(`${n.id}: ${p.id} ${q.name} (pin ${q.loc}) is wired in the circuit, but no port of ${T.id}'s module is on that pin`); continue; }
        const { base, bit } = portBase(key), def = ps?.find((x) => lc(x.name) === lc(base));
        if (ps && !def) { warn(`${n.id}: ${p.id} ${q.name} is ${T.id}'s ${key} (pin ${q.loc}), no port of ${T.module}`); continue; }
        if (def?.dir === 'inout') { warn(`${n.id}: ${p.id} ${q.name} is ${T.id}'s ${key}, an inout port: not joined to the circuit yet (an input or an output)`); continue; }
        const one = (def?.width ?? 1) === 1;
        Object.assign(pin, { nodePin: bit == null || (def && one) ? base : `${base}[${bit}]`, port: key, loc: q.loc, to: def?.dir === 'out' ? 'circuit' : 'node' });
      }
      // (a node's pin once: an Uno's SDA is its A4)
      const k = `${T.id}.${pin.nodePin}`;
      if (seen.has(k)) continue;
      seen.add(k);
      pins.push(pin);
    }
  }
  // (a 5 V Arduino's pin and a 3.3 V FPGA's input on one net)
  for (const f of pins.filter((x) => x.to === 'node' && x.volts != null && x.volts < 5)) {
    const hot = pins.find((x) => x.net === f.net && x.to === 'both' && x.volts === 5);
    if (hot) warn(`${n.id}: ${hot.part} ${hot.pin} (${hot.node}'s, 5 V) and ${f.part} ${f.pin} (${f.node}'s ${f.port}, pin ${f.loc}, a ${f.volts} V input) are on one net: a level shifter or a divider on the real boards`);
  }
  return { boards, pins: pins.map(({ net, ...x }) => x), problems };
}

/** (Hz) the SCK a circuit node's SPI part is taken to run at when its node gives none (#5384): 50 MHz / 16, its wires'
 *  latency a sixteenth of its period, 20 ns (an SPI link's, core/system-links.js lookahead) */
const CIRCUIT_SPI_HZ = 3125000;
const isSpiPart = (d) => !!d && (d.spi || d.pins.some((q) => /^(SCK|SCLK)$/.test(q.name)));

/**
 * The latency of a circuit node's wires (#5384): { latency (ps; null: a wire's own, 1 µs), hz (the SCK it is taken from),
 * parts (its SPI parts' ids), set (whether its node's spiHz gave it), said (the console's line) }. A part with an SPI's clock (the Pmod AD1, the DA2,
 * a part with an SCK or SCLK pin) makes its wires answer within a sixteenth of the SCK's period, as an SPI link's do, so
 * that a converter's bit is read on the clock edge that asks for it: the node's spiHz (the bus's SCK, set in its
 * Properties), else CIRCUIT_SPI_HZ. A circuit with no such part keeps a wire's 1 µs (unless its spiHz is set).
 */
export function circuitLatency(n, m) {
  const parts = (m?.parts ?? []).filter((p) => isSpiPart(partDef(p.type))).map((p) => p.id);
  const set = Number(n.spiHz) > 0;
  if (!parts.length && !set) return { latency: null, hz: null, parts, set };
  const hz = set ? Number(n.spiHz) : CIRCUIT_SPI_HZ;
  const latency = Math.max(1, Math.round(1e12 / hz / 16));
  const said = `${n.id}: its wires answer in ${nsText(latency)}, a sixteenth of ${set ? 'its SPI clock' : `an SPI clock of ${hzText(hz)}`}${set ? ` (${hzText(hz)})` : `, for its SPI part${parts.length > 1 ? 's' : ''} ${parts.join(', ')}`}${set ? '' : ': a faster one, its SPI clock in its Properties'}`;
  return { latency, hz, parts, set, said };
}
const nsText = (ps) => (ps >= 1e6 ? `${+(ps / 1e6).toPrecision(3)} µs` : ps >= 1e3 ? `${+(ps / 1e3).toPrecision(3)} ns` : `${ps} ps`);
const hzText = (hz) => (hz >= 1e6 ? `${+(hz / 1e6).toPrecision(4)} MHz` : hz >= 1e3 ? `${+(hz / 1e3).toPrecision(4)} kHz` : `${hz} Hz`);
