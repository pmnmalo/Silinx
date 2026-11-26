// Silinx - a System's RP2040 node (#5494, roadmap #4695's phase 4; the scheduler: core/system-sim.js, the contract:
// core/system-contract.js): a Raspberry Pi Pico's RP2040 run by rp2040js (MIT, Wokwi's) on MicroPython's own firmware
// (its .uf2, MIT, with the RP2040's bootrom: core/rp2040-firmware.js, downloaded once), the node's program a
// .py of the project. Its time is rp2040js's simulation clock (125 MHz), so the node runs as the scheduler says, not as
// the wall clock does. MicroPython's REPL is its USB serial port: once the firmware has started its USB, the program is
// typed into its raw REPL and run; what it prints is the node's console (`repl`: its bytes, and the bytes typed to it),
// a traceback its error. On CircuitPython's firmware instead (#5697, `runtime: 'circuitpython'`) the program is code.py
// on its CIRCUITPY drive in the flash (core/circuitpython-drive.js), with the node's other files, run as CircuitPython
// runs it after its boot; its console its serial output from "code.py output:" on, then its REPL. Its pins are the
// Pico's GP0..GP22, GP25 (the LED) and GP26..GP28, each an input and an output at 3.3 V: a pin's value 0 or 1 when the RP2040 drives it (its SIO, PWM or PIO), 1 or 0 with its pull-up or pull-down,
// null floating. A UART's pins (its function) are its frames: a byte the program writes becomes its TX pin's waveform at
// the UART's baud and format, and its RX pin's waveform is sampled back into bytes (a wrong baud gives garbage). An ADC
// input (GP26..GP28) reads its pin's level: 0 V or 3.3 V (#5697).
//
//   await loadRp2040();   // rp2040js and the firmware, once (loadRp2040(['circuitpython']): CircuitPython's)
//   const node = rp2040Contract({ program: { name: 'pico/main.py', data: text } });
//   const cp = rp2040Contract({ runtime: 'circuitpython', program: { name: 'pico/code.py', data }, files: [{ name: 'lib/x.py', data }] });
//
// rp2040js: node_modules in Node, the page's import map, a Web Worker's own (SILINX_RP2040JS). Isomorphic ES module.
import { ContractNode } from './system-contract.js';
import { mcuBoard } from './system-doc.js';
import { UartLinkDecoder } from './system-decode.js';
import { runtimeFiles } from './rp2040-firmware.js';
import { driveImage, DRIVE_OFFSET, ConsoleFilter, OUTPUT_START, DONE, tracebackOf } from './circuitpython-drive.js';

/** The RP2040's clock under MicroPython (Hz), and a cycle's time (ns). */
const RP2040_HZ = 125e6;
const CYCLE_NS = 1e9 / RP2040_HZ;
const FLASH = 0x10000000;
let lib = null, bootrom = null;
const uf2s = new Map();   // (runtime -> its .uf2's bytes)
// a firmware file's bytes (core/rp2040-firmware.js): the local server's in Node (setRp2040Source), else the page's or the
// worker's from the server (/vendor/rp2040/<file>)
let source = async (file) => {
  const r = await fetch(`/vendor/rp2040/${file}`);
  if (!r.ok) throw new Error(`the RP2040's firmware ${file} could not be read (${r.status}${r.status === 404 ? ': the RP2040 node runs with the local server for now' : ''})`);
  return new Uint8Array(await r.arrayBuffer());
};
/** Where the firmware's files are read from in Node: `fn(file)` -> their bytes (server/rp2040-firmware.js). */
export function setRp2040Source(fn) { source = fn; bootrom = null; uf2s.clear(); }

/** rp2040js and the firmware (the bootrom, the .uf2 of each of `runtimes`: MicroPython's, CircuitPython's) loaded, once,
 *  before an Rp2040Node is made. */
export async function loadRp2040(runtimes = ['micropython']) {
  // (a Web Worker has no import map: rp2040js where the server serves it)
  if (!lib) lib = globalThis.SILINX_RP2040JS ?? await import('rp2040js').catch(() => import('/vendor/npm/rp2040js/dist/esm/index.js'));
  const want = [...new Set(runtimes.map(r => r || 'micropython'))].filter(r => !uf2s.has(r));
  const [boot, ...uf2] = await Promise.all([bootrom ? null : source(runtimeFiles().bootrom.file), ...want.map(r => source(runtimeFiles(r).uf2.file))]);
  if (boot) bootrom = new Uint32Array(boot.buffer.slice(boot.byteOffset, boot.byteOffset + boot.byteLength));
  want.forEach((r, i) => uf2s.set(r, uf2[i]));
  return lib;
}

/** A UF2 file's blocks written into a flash (Uint8Array from 0x10000000): the bytes written. */
export function loadUf2(uf2, flash) {
  let n = 0;
  for (let o = 0; o + 512 <= uf2.length; o += 512) {
    const v = new DataView(uf2.buffer, uf2.byteOffset + o, 512);
    if (v.getUint32(0, true) !== 0x0a324655 || v.getUint32(4, true) !== 0x9e5d5157) throw new Error(`not a UF2 file: no block at ${o}`);
    const addr = v.getUint32(12, true), size = v.getUint32(16, true);
    if (addr < FLASH || addr - FLASH + size > flash.length) continue;
    flash.set(uf2.subarray(o + 32, o + 32 + size), addr - FLASH);
    n += size;
  }
  return n;
}

// a GPIO's number from its pin's name (GP0..GP29), or null
const gpOf = name => { const m = /^GP(\d+)$/.exec(String(name).toUpperCase()); return m ? Number(m[1]) : null; };
const UART_FUNC = 2;
const BANNER_END = 'Type "help()" for more information.\r\n';

class Rp2040Node {
  /** board: the Pico; program: { name, data } (a .py's text); runtime: its firmware, 'micropython' or 'circuitpython'
   *  (#5697); files: CircuitPython's drive's other files ([{ name (in the node's folder), data }]). A program in error:
   *  the node finished at once, its message logged. */
  constructor({ board = 'pico', program, runtime = 'micropython', files = [] } = {}) {
    runtime = runtime || 'micropython';
    const fw = runtimeFiles(runtime).uf2;
    if (!lib || !bootrom || !uf2s.has(runtime)) throw new Error(`rp2040js is not loaded: await loadRp2040(['${runtime}']) first`);
    this.runtime = runtime;
    const b = mcuBoard(board);
    if (b?.arch !== 'rp2040') throw new Error(`no RP2040 board '${board}'`);
    this.board = b;
    this.log = [];
    this.logN = 0;
    this.finished = null;
    this.now = 0;
    this.out = [];
    this.queue = [];
    this.program = String(program?.data ?? '');
    if (!/\.py$/i.test(String(program?.name ?? ''))) { this.finished = 'error'; this.log.push({ kind: 'error', time: 0, text: `its program ${program?.name ?? '(none)'} is not a .py` }); }
    const { RP2040, USBCDC, ConsoleLogger, LogLevel, GPIOPinState } = lib;
    this.S = GPIOPinState;
    const mcu = this.mcu = new RP2040();
    mcu.logger = new ConsoleLogger(LogLevel.Error);
    mcu.loadBootrom(bootrom);
    loadUf2(uf2s.get(runtime), mcu.flash);
    // (its CIRCUITPY drive, #5697: the program as code.py)
    if (runtime === 'circuitpython' && !this.finished) mcu.flash.set(driveImage({ program, files, bootOut: fw.bootOut }), DRIVE_OFFSET);
    mcu.core.PC = FLASH;
    // (its BOOTSEL button released: the flash's chip select pulled high, as CircuitPython reads it at its start, #5697)
    Object.defineProperty(mcu.qspi[1], 'inputValue', { get: () => true });
    // (its ADC's inputs GP26..GP28 their pins' levels, 0 V or 3.3 V (setPin); its temperature sensor's 27 °C, #5697)
    mcu.adc.channelValues[4] = 876;
    this.pins = b.pins;
    this.inputs = [...this.pins];
    this.outputs = [...this.pins];
    this.inVals = new Map(this.pins.map(p => [p, null]));
    this.last = new Map();
    // its USB serial port: MicroPython's REPL (`repl`: what it said and what was typed, as a terminal's)
    this.received = [];
    this.typing = [];   // (the bytes to type, waiting for the USB FIFO)
    this.stage = 'boot';   // boot → run (the program typed into its raw REPL) → banner → repl (its friendly REPL)
    this.said = '';
    const cdc = this.cdc = new USBCDC(mcu.usbCtrl);
    if (runtime === 'circuitpython') {
      // (its port's DTR set as a host does, to its interface: TinyUSB takes no class request to the device, which
      // MicroPython does not wait for and CircuitPython does)
      const { createSetupPacket, DataDirection, SetupType, SetupRecipient } = lib;
      cdc.cdcSetControlLineState = function (value = 3, interfaceNumber = 0) {
        this.usb.sendSetupPacket(createSetupPacket({ dataDirection: DataDirection.HostToDevice, type: SetupType.Class, recipient: SetupRecipient.Interface, bRequest: 0x22, wValue: value, wIndex: interfaceNumber, wLength: 0 }));
        this.initialized = true;
      };
      this.filter = new ConsoleFilter();
      this.output = '';
      cdc.onSerialData = data => this.heardCp(data);
    } else {
      cdc.onDeviceConnected = () => { if (this.stage === 'boot' && !this.finished) this.type('\r\x03\x03\x01'); };
      cdc.onSerialData = data => this.heard(data);
    }
    // the UARTs: their TX's frames on their pins, their RX pins sampled
    this.uarts = mcu.uart.map((u, k) => {
      const s = { u, k, tx: { level: 1, end: 0, bits: [] }, decoder: null, baud: 0, frame: '' };
      u.onByte = byte => this.transmit(s, byte);
      this.edgeTxInterrupt(u);
      return s;
    });
    for (const p of this.pins) { this.last.set(p, this.driven(p)); mcu.gpio[gpOf(p)].addListener(() => this.pinChanged(p)); }
  }

  // rp2040js raises a UART's TX interrupt again as soon as it is cleared (its TX FIFO not modelled): MicroPython's
  // interrupt-driven write then never returns. As the PL011 does with its FIFO empty, it is raised when a byte leaves.
  edgeTxInterrupt(u) {
    const TX = 1 << 5;
    u.checkInterrupts = function () { this.rp2040.setInterrupt(this.irq, !!(this.interruptStatus & this.interruptMask)); };
    const write = u.writeUint32.bind(u);
    u.writeUint32 = (offset, value) => {
      write(offset, value);
      if (offset === 0) { u.interruptStatus |= TX; u.checkInterrupts(); }   // (UARTDR)
      if (offset === 0x38 && value & TX) { u.interruptStatus |= TX; u.checkInterrupts(); }   // (UARTIMSC: TX unmasked, the FIFO empty)
      // (UARTCR: the UART on or off, its TX pin idle high from then, #5697)
      if (offset === 0x30) for (const p of this.pins) this.pinChanged(p);
    };
  }

  get time() { return this.mcu.clock.nanos * 1000; }

  // the UART whose function a pin has, and its role (the RP2040's function table: GPn's n % 4 is 0 TX, 1 RX, 2 CTS,
  // 3 RTS), or null
  uartOf(gp) {
    if (gp == null || this.mcu.gpio[gp].functionSelect !== UART_FUNC) return null;
    return { s: this.uarts[uartIndex(gp)], role: ['tx', 'rx', null, null][gp % 4] };
  }

  // a pin's value from the RP2040 (a UART's TX: its frames'), or null when it does not drive it
  driven(name) {
    const gp = gpOf(name), u = this.uartOf(gp);
    if (u?.role === 'tx') return u.s.u.enabled ? this.txLevel(u.s, this.time) : 1;
    const S = this.S, st = this.mcu.gpio[gp].value;
    return st === S.Low ? 0 : st === S.High || st === S.InputPullUp ? 1 : st === S.InputPullDown ? 0 : null;
  }

  /** A pin's value now: as the RP2040 drives it (or its pull), else as it was set (an input). */
  value(name) {
    if (gpOf(name) == null || !this.inVals.has(String(name).toUpperCase())) throw new Error(`no pin '${name}'`);
    const P = String(name).toUpperCase(), d = this.driven(P);
    const pulled = d != null && this.mcu.gpio[gpOf(P)].value >= this.S.Input;
    return (pulled ? this.inVals.get(P) ?? d : d) ?? this.inVals.get(P) ?? null;
  }

  pinChanged(p) {
    // (a floating input reads its pull-up, #5697: rp2040js's input stays low otherwise)
    const g = this.mcu.gpio[gpOf(p)];
    if (this.inVals.get(p) == null && g.rawInputValue !== g.pullupEnabled) g.setInputValue(g.pullupEnabled);
    const v = this.driven(p);
    if (v === this.last.get(p)) return;
    this.last.set(p, v);
    this.out.push({ pin: p, t: Math.max(this.time, this.now), value: v });
  }

  txLevel(s, t) {
    let v = s.tx.level;
    for (const b of s.tx.bits) if (b.t <= t) v = b.value;
    return v;
  }

  // the UART's format (its LCR_H: word length, parity, stop bits) as a frame's text ('8N1')
  frameOf(u) {
    const l = u.lineCtrlRegister;
    return `${5 + ((l >> 5) & 3)}${l & 2 ? (l & 4 ? 'E' : 'O') : 'N'}${l & 8 ? 2 : 1}`;
  }

  // a byte the program wrote: its frame on the UART's TX pin from now (after the one being sent)
  transmit(s, byte) {
    const u = s.u, bit = 1e12 / (u.baudRate || 115200), f = this.frameOf(u), n = Number(f[0]);
    const data = Array.from({ length: n }, (_, i) => (byte >> i) & 1);
    const parity = f[1] === 'N' ? [] : [data.reduce((a, x) => a ^ x, f[1] === 'O' ? 1 : 0)];
    let t = Math.max(this.time, s.tx.end);
    // (its TX pin not idle yet, its function just given to the UART: idle high for a bit first)
    const pin = this.pins.find(p => { const x = this.uartOf(gpOf(p)); return x?.s === s && x.role === 'tx'; });
    if (pin && this.last.get(pin) !== 1 && !s.tx.bits.length) { this.last.set(pin, 1); this.out.push({ pin, t, value: 1 }); t += bit; }
    for (const v of [0, ...data, ...parity, ...Array(Number(f[2])).fill(1)]) { s.tx.bits.push({ t, value: v }); t += bit; }
    s.tx.end = t;
  }

  /** An input pin's value from now on (null: floating: its pull, or 0). */
  setPin(name, value) {
    const P = String(name).toUpperCase(), gp = gpOf(P);
    if (gp == null || !this.inVals.has(P)) throw new Error(`'${name}' is not a pin of the ${this.board.name}`);
    const v = value == null ? null : Number(value) ? 1 : 0;
    this.inVals.set(P, v);
    const pin = this.mcu.gpio[gp];
    pin.setInputValue(v == null ? pin.pullupEnabled : !!v);
    if (gp >= 26) this.mcu.adc.channelValues[gp - 26] = v ? 4095 : 0;
    const u = this.uartOf(gp);
    if (u?.role === 'rx') this.rxDecoder(u.s).feed([this.now, v ?? 1]);
  }

  // a UART's receiver at its settings now (made again when the program changes them)
  rxDecoder(s) {
    const baud = s.u.baudRate, frame = this.frameOf(s.u);
    if (!s.decoder || s.baud !== baud || s.frame !== frame) {
      s.decoder = new UartLinkDecoder({ baud: baud || 115200, frame });
      s.baud = baud; s.frame = frame;
      s.decoder.feed([this.now, 1]);
    }
    return s.decoder;
  }

  // the bytes the REPL said: its console; the raw REPL's answers followed (OK, the program's output, its traceback)
  heard(data) {
    const t = this.time, text = String.fromCharCode(...data);
    this.said += text;
    // (its friendly REPL's banner not shown: its prompt is)
    if (this.stage === 'banner') {
      const k = this.said.indexOf(BANNER_END);
      if (k < 0) return;
      this.stage = 'repl';
      data = [...this.said.slice(k + BANNER_END.length)].map(c => c.charCodeAt(0));
      this.said = '';
    }
    for (const byte of data) { if (this.skip > 0 && this.stage === 'run') this.skip--; else this.received.push({ t, byte }); }
    if (this.stage === 'boot' && this.said.includes('raw REPL; CTRL-B to exit\r\n>')) {
      this.stage = 'run';
      this.said = '';
      this.received.length = 0;   // (the console from the program on: the banner and the raw REPL's prompt not shown)
      this.skip = 2;              // (nor the raw REPL's OK)
      this.type(`${this.program}\x04`);
      return;
    }
    if (this.stage === 'run') {
      // (OK, its output, \x04, its error, \x04, '>')
      const m = /^OK([\s\S]*?)\x04([\s\S]*?)\x04>/.exec(this.said);
      if (!m) return;
      this.stage = 'banner';
      this.said = '';
      const err = m[2].trim();
      if (err) this.log.push({ kind: 'error', time: t, text: `its program: ${err.split(/\r?\n/).filter(Boolean).join(' | ')}` });
      this.received.splice(0, this.received.length, ...[...m[1]].map(c => ({ t, byte: c.charCodeAt(0) })), ...[...(err ? `${err}\r\n` : '')].map(c => ({ t, byte: c.charCodeAt(0) })));
      this.type('\x02');   // (its friendly REPL, >>>, for what is typed)
    }
  }

  // CircuitPython's serial output (#5697): from "code.py output:" on, its escapes taken out; its run's traceback its error
  heardCp(data) {
    const t = this.time, text = this.filter.push(String.fromCharCode(...data));
    if (this.stage === 'boot') {
      this.said += text;
      const k = this.said.indexOf(OUTPUT_START);
      if (k < 0) return;
      this.stage = 'run';
      this.output = this.said.slice(k);
      this.said = '';
      for (const c of this.output) this.received.push({ t, byte: c.charCodeAt(0) });
    } else {
      for (const c of text) this.received.push({ t, byte: c.charCodeAt(0) });
      if (this.stage === 'run') this.output += text;
    }
    // (its run done: its traceback logged)
    const k = this.stage === 'run' ? this.output.indexOf(DONE) : -1;
    if (k < 0) return;
    this.stage = 'repl';
    const tb = tracebackOf(this.output.slice(0, k));
    if (tb) this.log.push({ kind: 'error', time: t, text: `its program: ${tb.map(l => l.trim()).join(' | ')}` });
    this.output = '';
  }

  // bytes to the REPL over USB, as its 512 bytes' FIFO takes them (rp2040js drops what overflows it)
  type(text) { for (const c of text) this.typing.push(c.charCodeAt(0) & 0xff); this.pump(); }
  pump() {
    const fifo = this.cdc.txFIFO;
    while (this.typing.length && !fifo.full) this.cdc.sendSerialByte(this.typing.shift());
  }

  /** Bytes typed to the REPL (the console's line). */
  send(bytes) { for (const b of bytes) this.typing.push(b === 10 ? 13 : b); this.pump(); }

  at(t, fn) {
    let i = this.queue.length;
    while (i && this.queue[i - 1].t > t) i--;
    this.queue.splice(i, 0, { t: Math.max(t, this.now), fn });
  }

  nextEventTime() { return this.queue.length ? this.queue[0].t : Infinity; }

  // the RP2040 up to t (its clock's ns: an instruction that starts before t ends after it)
  run(t) {
    const end = t / 1000, { mcu } = this, clock = mcu.clock;
    if (this.finished) return;
    while (clock.nanos < end) {
      if (this.typing.length) this.pump();
      if (mcu.core.waiting) clock.tick(Math.max(CYCLE_NS, Math.min(clock.nanosToNextAlarm, end - clock.nanos)));
      else clock.tick(mcu.core.executeInstruction() * CYCLE_NS);
    }
  }

  advanceTo(t) {
    if (t < this.now) throw new Error(`the node is at ${this.now} ps, not back at ${t}`);
    while (this.queue.length && this.queue[0].t <= t) { const e = this.queue.shift(); this.run(e.t); this.now = e.t; e.fn(this); }
    this.run(t);
    this.now = t;
    for (const s of this.uarts) {
      // (its TX pin's frames up to t)
      const gp = this.pins.map(gpOf).find(g => { const u = this.uartOf(g); return u?.s === s && u.role === 'tx'; });
      while (s.tx.bits.length && s.tx.bits[0].t <= t) {
        const b = s.tx.bits.shift();
        s.tx.level = b.value;
        const p = gp == null ? null : `GP${gp}`;
        if (p && b.value !== this.last.get(p)) { this.last.set(p, b.value); this.out.push({ pin: p, t: b.t, value: b.value }); }
      }
      // (its RX's bytes, to the program)
      if (s.decoder) {
        s.decoder.flush(t);
        for (const r of s.decoder.take()) {
          if (r.error) this.log.push({ kind: 'warning', time: r.t, text: `UART${s.k} RX: a ${r.error} error at ${s.baud} baud` });
          else if (s.u.enabled) s.u.feedByte(r.byte);
        }
      }
    }
    return this.out.splice(0).sort((a, b) => a.t - b.t);
  }

  messages() { return this.log.slice(this.logN, (this.logN = this.log.length)); }
}

// the UART a GPIO's UART function is (the RP2040's function table: GP0-3 UART0, 4-7 UART1, 8-11 UART1, 12-15 UART0,
// 16-19 UART0, 20-23 UART1, 24-27 UART1, 28-29 UART0)
function uartIndex(gp) { return [0, 1, 1, 0, 0, 1, 1, 0][Math.floor(gp / 4)]; }

/** What rp2040js and MicroPython model and what they do not (the node contract's fidelity notes, #5499). */
export const RP2040_FIDELITY = [
  { kind: 'models', text: 'the RP2040\'s core 0 at 125 MHz, instruction by instruction, running MicroPython\'s own firmware (v1.24.1) and its bootrom: GPIO, PWM, PIO, timers, UARTs, the USB serial port of its REPL' },
  { kind: 'approximates', text: 'a UART\'s pins as its frames\' bits at the program\'s baud; its TX FIFO as one that never fills; an ADC input as its pin\'s level, 0 V or 3.3 V' },
  { kind: 'omits', text: 'the second core (_thread), SPI\'s and I²C\'s links (rp2040js: master only), the flash\'s file system kept between runs' },
];

/** The same on CircuitPython's firmware (#5697). */
export const CIRCUITPYTHON_FIDELITY = [
  { kind: 'models', text: 'the RP2040\'s core 0 at 125 MHz, instruction by instruction, running CircuitPython\'s own firmware (10.3.2) and its bootrom: GPIO (digitalio), PWM (pwmio), timers (time), UARTs (busio.UART), the USB serial port of its console and REPL, its CIRCUITPY drive with code.py' },
  { kind: 'approximates', text: 'a UART\'s pins as its frames\' bits at the program\'s baud; its TX FIFO as one that never fills; an ADC input (analogio.AnalogIn) as its pin\'s level, 0 V or 3.3 V; its start as a board\'s already connected (no wait for the reset button, the console from code.py\'s first line)' },
  { kind: 'omits', text: 'busio.SPI\'s and busio.I2C\'s links (rp2040js: master only), the drive\'s writes (its flash is read only), USB\'s drive, keyboard and MIDI' },
];

/** An RP2040 node behind the node contract (core/system-contract.js): `opts` Rp2040Node's ({ board, program, runtime,
 *  files }), its pins at 3.3 V; its state its inputs, replayed on a new engine. */
export const rp2040Contract = (opts) => new ContractNode({ make: () => new Rp2040Node(opts), volts: mcuBoard(opts.board ?? 'pico')?.vio ?? null, fidelity: opts.runtime === 'circuitpython' ? CIRCUITPYTHON_FIDELITY : RP2040_FIDELITY });

/** The REPL's console of an RP2040 node of the scheduler (its NodeEngine, around rp2040Contract's ContractNode), as a
 *  terminal: { received, send(bytes) }, or null. */
export function replOf(adapter) {
  const eng = () => adapter?.node?.engine;
  if (!(eng() instanceof Rp2040Node)) return null;
  return { get received() { return eng().received; }, send: bytes => eng().send(bytes) };
}
