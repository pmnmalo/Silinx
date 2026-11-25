// Silinx - a System's adapter of an AVR (#4698; the scheduler: core/system-sim.js): an Arduino Uno or Nano's
// ATmega328P at 16 MHz run by avr8js (MIT, Wokwi's), its firmware a given .hex or .elf (core/avr-firmware.js). Its pins
// are the board's (D0..D13, A0..A5: ports D, B and C), each an input and an output of the node; its timers 0, 1 and 2
// (the Arduino core's millis, delay, PWM) run. Its USART is pins: a byte the program writes becomes D1's waveform (its
// start, data, parity and stop bits at its baud, from UBRR), and D0's waveform is sampled at the USART's own settings
// back into a byte (a wrong baud gives garbage, as on a real board). A pin's value: 0 or 1 when it drives, 1 when an
// input with its pull-up, null when an input floating.
//
//   const node = new AvrNode({ board: 'arduino-uno', firmware: { name: 'fw/echo.hex', data: text } });
//
// avr8js: node_modules in Node, the page's import map, a Web Worker's own (#4701). Isomorphic ES module, no DOM.
// avr8js's names, bound on first use (bind): node_modules in Node, the page's import map, the browser edition's bundle
// (loadAvr8js); a Web Worker, which has no import map, gives it as SILINX_AVR8JS (web/js/system-worker.js, #4701)
let CPU, avrInstruction, AVRIOPort, AVRUSART, AVRTimer, AVRSPI, AVRTWI, portBConfig, portCConfig, portDConfig, usart0Config, timer0Config, timer1Config, timer2Config, spiConfig, twiConfig, PinState;
let lib = null;
function bind(l) {
  lib = l;
  ({ CPU, avrInstruction, AVRIOPort, AVRUSART, AVRTimer, AVRSPI, AVRTWI, portBConfig, portCConfig, portDConfig, usart0Config, timer0Config, timer1Config, timer2Config, spiConfig, twiConfig, PinState } = l);
}
/** avr8js loaded (once), before an AvrNode is made: the worker's, else imported by its name. */
export async function loadAvr8js() {
  if (!lib) bind(globalThis.SILINX_AVR8JS ?? await import('avr8js'));
  return lib;
}
import { readFirmware } from './avr-firmware.js';
import { AvrSpi } from './system-sim-avr-spi.js';
import { AvrTwi } from './system-sim-avr-twi.js';
import { mcuBoard } from './system-doc.js';
import { ContractNode } from './system-contract.js';

/** The ATmega328P's clock on the Uno and the Nano (Hz), and a cycle's time (ps). */
export const AVR_HZ = 16e6;
export const CYCLE_PS = 1e12 / AVR_HZ;
const SRAM = 2048;

// a board's pin: its port and bit (D0..D7: port D; D8..D13: port B 0..5; A0..A5: port C 0..5)
export function avrPin(name) {
  const m = /^([DA])(\d+)$/.exec(String(name).toUpperCase());
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === 'D' && n < 8) return { port: 'D', bit: n };
  if (m[1] === 'D' && n < 14) return { port: 'B', bit: n - 8 };
  if (m[1] === 'A' && n < 6) return { port: 'C', bit: n };
  return null;
}

const level = (s) => (s === PinState.Low ? 0 : s === PinState.High || s === PinState.InputPullUp ? 1 : null);

export class AvrNode {
  /** board: a microcontroller's board (core/system-doc.js MCU_BOARDS); firmware: { name, data } (a .hex's text, an
   *  .elf's bytes) or { program } (the flash's words). A firmware in error: the node finished at once, its message
   *  logged. */
  constructor({ board = 'arduino-uno', firmware }) {
    if (!lib && globalThis.SILINX_AVR8JS) bind(globalThis.SILINX_AVR8JS);
    if (!lib) throw new Error('avr8js is not loaded: await loadAvr8js() first');
    const b = mcuBoard(board);
    if (!b) throw new Error(`no microcontroller board '${board}'`);
    this.board = b;
    this.log = [];
    this.logN = 0;
    this.finished = null;
    this.now = 0;
    this.queue = [];
    this.out = [];
    let program = firmware?.program && Uint16Array.from({ length: 16384 }, (_, i) => firmware.program[i] ?? 0);   // (the flash's words, erased past the program)
    if (!program) {
      const r = readFirmware(String(firmware?.name ?? ''), firmware?.data ?? '');
      if (r.error) { this.finished = 'error'; this.log.push({ kind: 'error', time: 0, text: r.error }); program = new Uint16Array(16384); }
      else program = r.program;
    }
    this.cpu = new CPU(program, SRAM);
    this.ports = { B: new AVRIOPort(this.cpu, portBConfig), C: new AVRIOPort(this.cpu, portCConfig), D: new AVRIOPort(this.cpu, portDConfig) };
    this.timers = [timer0Config, timer1Config, timer2Config].map((c) => new AVRTimer(this.cpu, c));
    this.usart = new AVRUSART(this.cpu, usart0Config, AVR_HZ);
    // (its SPI master: SCK D13, MOSI D11, MISO D12, #5214)
    this.spi = new AvrSpi(this, { AVRSPI, spiConfig }, AVR_HZ, CYCLE_PS);
    // (its I²C master: SCL A5, SDA A4, each pulled low or released)
    this.twi = new AvrTwi(this, { AVRTWI, twiConfig }, AVR_HZ, CYCLE_PS, b.i2cs?.Wire);
    this.pins = b.pins.filter((p) => avrPin(p));
    this.inputs = [...this.pins];
    this.outputs = [...this.pins];
    this.inVals = new Map(this.pins.map((p) => [p, null]));
    // the USART: its TX a waveform on D1 (idle high while it is enabled), its RX D0 sampled
    this.tx = { level: 1, end: 0, bits: [] };   // the waveform to come: [{ t, value }]
    this.rx = { busy: false };
    this.last = new Map(this.pins.map((p) => [p, this.driven(p)]));
    this.spi.gotMiso(0, null);
    for (const [k, port] of Object.entries(this.ports)) port.addListener(() => this.portChanged(k));
    this.usart.onByteTransmit = (byte) => this.transmit(byte);
    this.usart.onConfigurationChange = () => this.pinChanged('D1');
  }

  get time() { return this.cpu.cycles * CYCLE_PS; }

  // a pin's value from the program's ports (D1 the USART's TX while it is enabled)
  driven(name) {
    if (name === 'D1' && this.usart.txEnable) return this.txLevel(this.time);
    if (this.spi?.drives(name)) return this.spi.level(name);
    if (this.twi?.drives(name)) return this.twi.level(name);
    const { port, bit } = avrPin(name);
    return level(this.ports[port].pinState(bit));
  }

  /** A pin's value now: as the AVR drives it (or its pull-up), else as it was set (an input). */
  value(name) {
    const p = avrPin(name);
    if (!p) throw new Error(`no pin '${name}'`);
    const d = this.driven(String(name).toUpperCase());
    return d ?? this.inVals?.get(String(name).toUpperCase()) ?? null;
  }

  /** Whether a pin is an input with its pull-up now (a weak 1: a circuit's button to GND pulls it low, #5215). */
  pulled(name) {
    const p = avrPin(name);
    return !!p && this.driven(String(name).toUpperCase()) === 1 && this.ports[p.port].pinState(p.bit) === PinState.InputPullUp;
  }

  // a port's DDR or PORT written: a floating input read as its pull-up; its pins' changes (D1 while the USART sends: its
  // frames')
  portChanged(k) {
    for (const p of this.pins) {
      if (avrPin(p).port !== k) continue;
      if (this.inVals.get(p) == null) this.floating(p);
      if (!(p === 'D1' && this.usart.txEnable)) this.pinChanged(p);
    }
  }

  // a floating input pin: the program reads its pull-up (1), else 0
  floating(p) {
    const { port, bit } = avrPin(p);
    this.ports[port].setPin(bit, this.ports[port].pinState(bit) === PinState.InputPullUp);
  }

  pinChanged(p) {
    const v = this.driven(p);
    if (v === this.last.get(p)) return;
    this.last.set(p, v);
    this.out.push({ pin: p, t: Math.max(this.time, this.now), value: v });
  }

  // D1's level at t from the waveform sent (its bits up to t), idle high
  txLevel(t) {
    let v = this.tx.level;
    for (const b of this.tx.bits) if (b.t <= t) v = b.value;
    return v;
  }

  // a byte written to UDR0: its frame on D1 from now (after the one being sent), at the USART's settings
  transmit(byte) {
    const u = this.usart, bit = (u.UBRR + 1) * u.multiplier * CYCLE_PS;
    const data = Array.from({ length: u.bitsPerChar }, (_, i) => (byte >> i) & 1);
    const parity = u.parityEnabled ? [data.reduce((a, x) => a ^ x, u.parityOdd ? 1 : 0)] : [];
    const frame = [0, ...data, ...parity, ...Array(u.stopBits).fill(1)];
    let t = Math.max(this.time, this.tx.end);
    for (const v of frame) { this.tx.bits.push({ t, value: v }); t += bit; }
    this.tx.end = t;
  }

  /** An input pin's value from now on (null: floating; as 0, or 1 with its pull-up, for the program). */
  setPin(name, value) {
    const P = String(name).toUpperCase(), p = avrPin(P);
    if (!p || !this.inVals.has(P)) throw new Error(`'${name}' is not a pin of the ${this.board.name}`);
    const v = value == null ? null : Number(value) ? 1 : 0;
    const was = this.inVals.get(P);
    this.inVals.set(P, v);
    const port = this.ports[p.port];
    if (v == null) this.floating(P);
    else port.setPin(p.bit, !!v);
    if (P === 'D0' && was === 1 && v === 0 && !this.rx.busy && this.usart.rxEnable) this.receive();
    if (P === 'D12') this.spi.gotMiso(this.now, v);
    if (P === this.twi.sda) this.twi.gotSda(this.now, v);
  }

  // a start bit on D0 now: the frame sampled at the middle of each bit, the byte to the USART at its stop bit's middle
  receive() {
    const u = this.usart, bitCycles = (u.UBRR + 1) * u.multiplier, n = u.bitsPerChar + (u.parityEnabled ? 1 : 0);
    const start = this.now / CYCLE_PS;
    const rxBit = () => (this.inVals.get('D0') ?? 1);
    this.rx.busy = true;
    let byte = 0;
    const at = (k, fn) => this.cpu.addClockEvent(fn, Math.max(1, Math.round(start + (k + 0.5) * bitCycles - this.cpu.cycles)));
    at(0, () => { if (rxBit()) this.rx.busy = false; });   // (a glitch, not a start bit)
    for (let i = 0; i < n; i++) at(i + 1, () => { if (this.rx.busy && i < u.bitsPerChar) byte |= rxBit() << i; });
    at(n + 1, () => {
      if (!this.rx.busy) return;
      this.rx.busy = false;
      if (!rxBit()) this.log.push({ kind: 'warning', time: this.time, text: `D0 (RX): a framing error (no stop bit) at ${u.baudRate} baud` });
      else if (this.usart.rxEnable) {
        if (this.cpu.data[usart0Config.UCSRA] & 0x80) this.log.push({ kind: 'warning', time: this.time, text: 'D0 (RX): a byte lost (the one before it not read)' });
        this.usart.writeByte(byte, true);
      }
    });
  }

  at(t, fn) {
    let i = this.queue.length;
    while (i && this.queue[i - 1].t > t) i--;
    this.queue.splice(i, 0, { t: Math.max(t, this.now), fn });
  }

  nextEventTime() { return this.queue.length ? this.queue[0].t : Infinity; }

  // the program up to the cycle of t (its last instruction started before it)
  run(t) {
    const end = t / CYCLE_PS, cpu = this.cpu;
    if (this.finished) { cpu.cycles = Math.max(cpu.cycles, Math.floor(end)); return; }
    while (cpu.cycles < end) { avrInstruction(cpu); cpu.tick(); }
  }

  advanceTo(t) {
    if (t < this.now) throw new Error(`the node is at ${this.now} ps, not back at ${t}`);
    while (this.queue.length && this.queue[0].t <= t) {
      const e = this.queue.shift();
      this.run(e.t);
      this.now = e.t;
      e.fn(this);
    }
    this.run(t);
    this.now = t;
    // D1's frames' bits up to t, with the ports' changes, in time order
    while (this.tx.bits.length && this.tx.bits[0].t <= t) {
      const b = this.tx.bits.shift();
      this.tx.level = b.value;
      if (this.usart.txEnable && b.value !== this.last.get('D1')) { this.last.set('D1', b.value); this.out.push({ pin: 'D1', t: b.t, value: b.value }); }
    }
    // SCK's and MOSI's (the SPI's) up to t
    for (const e of this.spi.take(t)) if (this.spi.on && e.value !== this.last.get(e.pin)) { this.last.set(e.pin, e.value); this.out.push(e); }
    // SCL's and SDA's (the TWI's)
    for (const e of this.twi.take(t)) if (this.twi.on && e.value !== this.last.get(e.pin)) { this.last.set(e.pin, e.value); this.out.push(e); }
    return this.out.splice(0).sort((a, b) => a.t - b.t);
  }

  messages() { return this.log.slice(this.logN, (this.logN = this.log.length)); }
}

/** What the AVR's engine (avr8js) models and what it does not (the node contract's fidelity notes, #5499). */
export const AVR_FIDELITY = [
  { kind: 'models', text: 'the ATmega328P at 16 MHz, instruction by instruction: its GPIO ports, timers 0, 1 and 2, USART, SPI and TWI' },
  { kind: 'approximates', text: 'the USART\'s, SPI\'s and TWI\'s pins as their waveforms at the program\'s settings' },
  { kind: 'omits', text: 'SPI and TWI as a peripheral (master only)' },
];

/** An AVR node behind the node contract (core/system-contract.js): `opts` AvrNode's ({ board, firmware }), its pins at
 *  its board's I/O level (5 V). */
export const avrContract = (opts) => new ContractNode({ make: () => new AvrNode(opts), volts: mcuBoard(opts.board ?? 'arduino-uno')?.vio ?? null, fidelity: AVR_FIDELITY });
