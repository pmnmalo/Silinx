// Silinx - a System's adapter of a serial terminal (#4701; the scheduler: core/system-sim.js): a System's
// terminal node, a UART at its baud and frame. What reaches its RX pin is decoded into bytes (core/system-decode.js, at
// the terminal's own settings: a wrong baud gives garbage, as on a real terminal), each with its time; the bytes typed
// (`send`) become its TX pin's waveform (start, data, parity and stop bits at its baud), one after the other.
//
//   const term = new TerminalNode({ baud: 9600, frame: '8N1' });
//   term.send([0x48, 0x69]); …; term.received   // [{ t, byte, error }]
//
// Isomorphic ES module, no DOM.
import { parseFrame, UartLinkDecoder } from './system-decode.js';
import { ContractNode } from './system-contract.js';

export class TerminalNode {
  /** baud, frame: its UART's ('8N1'). */
  constructor({ baud = 9600, frame = '8N1' } = {}) {
    if (!(baud > 0)) throw new Error('a terminal\'s baud above 0');
    this.baud = baud;
    this.frame = parseFrame(frame);
    this.decoder = new UartLinkDecoder({ baud, frame });
    this.bit = 1e12 / baud;
    this.inputs = ['rx'];
    this.outputs = ['tx'];
    this.now = 0;
    this.rx = null;
    this.tx = { level: 1, end: 0, bits: [] };
    this.out = [];
    this.queue = [];
    this.received = [];
    this.log = [];
    this.logN = 0;
    this.finished = null;
  }

  value(name) {
    if (name === 'tx') return this.tx.level;
    if (name === 'rx') return this.rx;
    throw new Error(`no pin '${name}'`);
  }

  setPin(name, value) {
    if (name !== 'rx') throw new Error(`'${name}' is not an input of the terminal`);
    this.rx = value == null ? null : Number(value) ? 1 : 0;
    this.decoder.feed([this.now, this.rx]);
  }

  /** Bytes typed: their frames on TX from now on (after those not sent yet), at the terminal's settings. */
  send(bytes) {
    const { bits, parity, stop } = this.frame;
    let t = Math.max(this.now, this.tx.end);
    for (const byte of bytes) {
      const data = Array.from({ length: bits }, (_, i) => (byte >> i) & 1);
      const p = parity === 'N' ? [] : [data.reduce((a, x) => a ^ x, parity === 'O' ? 1 : 0)];
      for (const v of [0, ...data, ...p, ...Array(stop).fill(1)]) { this.tx.bits.push({ t, value: v }); t += this.bit; }
    }
    this.tx.end = t;
  }

  at(t, fn) {
    let i = this.queue.length;
    while (i && this.queue[i - 1].t > t) i--;
    this.queue.splice(i, 0, { t: Math.max(t, this.now), fn });
  }

  nextEventTime() { return Math.min(this.queue.length ? this.queue[0].t : Infinity, this.tx.bits.length ? this.tx.bits[0].t : Infinity); }

  advanceTo(t) {
    if (t < this.now) throw new Error(`the node is at ${this.now} ps, not back at ${t}`);
    while (this.queue.length && this.queue[0].t <= t) { const e = this.queue.shift(); this.now = e.t; e.fn(this); }
    while (this.tx.bits.length && this.tx.bits[0].t <= t) {
      const b = this.tx.bits.shift();
      if (b.value !== this.tx.level) this.out.push({ pin: 'tx', t: b.t, value: b.value });
      this.tx.level = b.value;
    }
    this.now = t;
    this.decoder.flush(t);
    for (const b of this.decoder.take()) {
      this.received.push(b);
      if (b.error) this.log.push({ kind: 'warning', time: b.t, text: `RX: a ${b.error} error at ${this.baud} baud` });
    }
    return this.out.splice(0);
  }

  messages() { return this.log.slice(this.logN, (this.logN = this.log.length)); }
}

/** What the terminal models (the node contract's fidelity notes, #5499). */
export const TERMINAL_FIDELITY = [
  { kind: 'models', text: 'a serial terminal: a UART at its baud and frame, the bytes it receives decoded at its own settings' },
];

/** A serial terminal behind the node contract (core/system-contract.js): `opts` TerminalNode's ({ baud, frame }); the
 *  bytes to type `send` (sent from 0). */
export const terminalContract = (opts = {}, { send = [] } = {}) =>
  new ContractNode({ make: () => { const t = new TerminalNode(opts); if (send.length) t.send(send); return t; }, fidelity: TERMINAL_FIDELITY });
