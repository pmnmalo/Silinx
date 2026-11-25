// Silinx - a System's link kinds as types (#5485, roadmap #5479, docs/SYSTEMS.md "The link kinds"): what crosses each
// kind of link, the protocols of each, the port kinds it joins (core/system-ports.js) and its lookahead, the latency that
// bounds the scheduler's windows (core/system-sim.js: no window is longer than a link's latency, so that the run is the
// same at every quantum). Isomorphic module (browser + Node).
//
//   linkTypeOf('uart')                       // 'transaction'
//   lookahead({ protocol: 'uart', baud: 9600 })   // a sixteenth of its bit (ps)
//   endsProblem('gpio', from, to)            // why two typed ports cannot be the ends of a link of that protocol
import { FINE, UART_DIV } from './system-sim.js';
import { drives, reads } from './system-ports.js';

/**
 * The link kinds: what crosses them, their protocols, the port kinds they join (a transaction bus's or an analog
 * signal's a pin too: its adapter turns the bytes into their pins' waveforms, the voltage into a level sampled at the
 * analog/digital boundary).
 */
export const LINK_TYPES = Object.freeze({
  pin: { crosses: 'events: a level at a time', protocols: ['wire', 'gpio'], ports: ['pin'] },
  transaction: { crosses: 'bytes and transactions', protocols: ['uart', 'spi', 'i2c', 'onewire', 'can'], ports: ['transaction', 'pin'] },
  memory: { crosses: 'a CPU\'s reads and writes of registers', protocols: ['axi-lite', 'axi-stream'], ports: ['memory'] },
  analog: { crosses: 'a voltage, sampled at the analog/digital boundary', protocols: ['analog'], ports: ['analog', 'pin'] },
  network: { crosses: 'messages', protocols: ['wifi', 'mqtt', 'ble'], ports: ['message'] },
});
/** The link kinds' names. */
export const LINK_TYPE_NAMES = Object.keys(LINK_TYPES);

/** A transaction bus's pins, as its adapter makes them (a UART's TX and RX; SPI's four; I²C's two; 1-Wire's one; a CAN
 *  controller's TX and RX to its transceiver). */
export const BUS_PINS = Object.freeze({ uart: ['tx', 'rx'], spi: ['sck', 'mosi', 'miso', 'ss'], i2c: ['scl', 'sda'], onewire: ['dq'], can: ['tx', 'rx'] });

/** A memory-mapped bus's default clock (Hz) and a network's default latency (ps): 100 MHz, 1 ms. */
export const BUS_HZ = 100e6;
export const NETWORK_LATENCY = 1e9;
/** An analog signal's default sampling rate (Hz): 1 MHz, its period the wire's fine quantum. */
export const ANALOG_HZ = 1e6;

/** The link kind of a protocol ('uart' → 'transaction'), or null. */
export function linkTypeOf(protocol) {
  for (const [k, t] of Object.entries(LINK_TYPES)) if (t.protocols.includes(protocol)) return k;
  return null;
}

/**
 * A link's lookahead (ps, 1 or more): its latency, the window's bound. latency: a fixed one, given; else by its
 * protocol: a UART's or a CAN bus's a sixteenth of its bit (baud), an SPI's or an I²C's a sixteenth of its clock's period
 * (hz: the peripheral's answer in time for the master's next edge), a memory-mapped bus's one period of its clock (hz),
 * an analog signal's its sampling period (hz), a network's 1 ms, a pin's (a wire, GPIO, 1-Wire) FINE (1 µs).
 */
export function lookahead({ protocol = 'wire', baud = 9600, hz = null, latency = null } = {}) {
  if (latency != null) {
    if (!(latency >= 1)) throw new Error('a link\'s latency: 1 ps or more');
    return Math.round(latency);
  }
  const type = linkTypeOf(protocol);
  if (!type) throw new Error(`no link of protocol '${protocol}'`);
  const rate = (v, what) => { if (!(v > 0)) throw new Error(`a ${protocol} link needs its ${what}`); return v; };
  if (protocol === 'uart' || protocol === 'can') return Math.round(1e12 / rate(baud, 'baud rate') / UART_DIV);
  if (protocol === 'spi' || protocol === 'i2c') return Math.round(1e12 / rate(hz, 'clock (hz)') / 16);
  if (type === 'memory') return Math.round(1e12 / rate(hz ?? BUS_HZ, 'clock (hz)'));
  if (type === 'analog') return Math.round(1e12 / rate(hz ?? ANALOG_HZ, 'sampling rate (hz)'));
  if (type === 'network') return NETWORK_LATENCY;
  return FINE;
}

/**
 * Why the typed ports `from` and `to` cannot be the ends of a link of `protocol`, from its driver `from` to `to`, or null:
 * a protocol of no link kind; a port of a kind the link does not join; a bus's port of another protocol; a driver that
 * cannot drive, an end that cannot be driven (an output driving an output: a wire driven twice).
 */
export function endsProblem(protocol, from, to) {
  const type = linkTypeOf(protocol);
  if (!type) return `no link of protocol '${protocol}' (the link kinds: ${LINK_TYPE_NAMES.join(', ')})`;
  const t = LINK_TYPES[type];
  for (const p of [from, to]) {
    if (!t.ports.includes(p.kind)) return `${p.name} is a port of kind ${p.kind}: a ${protocol} link joins ${t.ports.join(' or ')} ports`;
    if (p.kind !== 'pin' && p.protocol != null && p.protocol !== protocol) return `${p.name} is a ${p.protocol} port, the link ${protocol}`;
  }
  if (!drives(from)) return `${from.name} is an input: it drives no link`;
  if (!reads(to)) return `${to.name} is an output: the link cannot drive it`;
  return null;
}
