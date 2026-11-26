// Silinx - a System's ESP32 node (#5495, roadmap #4695's phase 4; the scheduler: core/system-sim.js): an ESP32 DevKitC
// in MicroPython, behavioural and said so: MicroPython's WebAssembly port (MIT) runs the node's .py with Silinx's
// `machine` and `time` (core/esp32-python.js), no Xtensa instruction emulated, each line of Python 1 µs. The back end
// here is the Worker + Atomics one (its engine: core/esp32-engine.js, in a Worker of its own; their shared memory:
// core/esp32-link.js): advanceTo(t) asks the engine to run to t and blocks until it has, so the node is in lockstep with
// the scheduler, deterministic; the JSPI one (#5658: esp32JspiEngine, Silinx's own MicroPython build) runs on the
// scheduler's thread, advanceTo(t) a promise (`async`: the scheduler's runAsync), where the browser or Node has JSPI
// (esp32Backend: WebAssembly.Suspending and promising), with no SharedArrayBuffer. Both give the same run. Its pins are the DevKitC's GPIOs at 3.3 V: a pin the program drives (Pin.OUT) its
// value, an input its link's level; a UART's TX its frames at the program's baud, its RX sampled back into bytes. What it
// prints is its REPL's console, a terminal of its own (`<id>.repl`), and a line typed there runs once the program ended.
// Its PWM outputs and its SPI and I²C masters are their pins' waveforms (core/esp32-buses.js), an ADC reads its pin's
// level (0 or full scale).
// Its engine is made before the run (prepareEsp32: a browser starts a Worker only while its creator is not blocked).
//
//   await prepareEsp32(['esp']);   // JSPI; else in Node, or in a cross-origin isolated page (#5648)
//   const node = new Esp32Node({ id: 'esp', program: { name: 'esp/main.py', data } });
//
// Isomorphic ES module, no DOM.
import { mcuBoard } from './system-doc.js';
import { UartLinkDecoder } from './system-decode.js';
import { esp32Buffer, hostLink } from './esp32-link.js';
import { esp32JspiEngine } from './esp32-engine.js';
import { isolationProblem } from './cross-origin.js';
import { Esp32Buses } from './esp32-buses.js';

// the UARTs' default pins in MicroPython's ESP32 port (UART(n) with no tx nor rx)
const UART_PINS = { 0: { tx: 1, rx: 3 }, 1: { tx: 10, rx: 9 }, 2: { tx: 17, rx: 16 } };
const workers = new Map();   // (a node's engine made before its run: { sab, terminate } or { jspi })
const isNode = typeof process !== 'undefined' && !!process.versions?.node && typeof window === 'undefined' && !globalThis.WorkerGlobalScope;

// a Worker running the engine on `sab`, once its MicroPython is loaded: a page's or a worker's (web/js/esp32-worker.js),
// else the one setEsp32Spawner gave (Node's worker_threads: server/esp32-worker.js)
let spawn = async (sab) => {
  const w = new Worker('/js/esp32-worker.js', { type: 'module' });
  await new Promise((ok, fail) => { w.onmessage = ok; w.onerror = e => fail(new Error(e.message || 'its Worker did not start')); w.postMessage({ sab }); });
  return { terminate: () => w.terminate() };
};
/** Where an ESP32 node's engine runs in Node: `fn(sab)` -> { terminate } once its MicroPython is loaded. */
export function setEsp32Spawner(fn) { spawn = fn; }

// Silinx's MicroPython build for JSPI (scripts/micropython-wasm/): where this side loads it from (its module's exports
// and the .wasm's URL); none: the Worker + Atomics back end only
// (a computed address: the bundlers leave it to the page)
const JSPI_DIR = '/vendor/micropython-jspi';
let jspiLoad = typeof window !== 'undefined' || globalThis.WorkerGlobalScope
  ? async () => ({ ...(await import(`${JSPI_DIR}/micropython.mjs`)), url: `${JSPI_DIR}/micropython.wasm` })
  : null;
/** Where an ESP32 node's JSPI build is loaded from in Node: `fn()` -> { loadMicroPython, runPythonSuspending, url }. */
export function setEsp32JspiLoader(fn) { jspiLoad = fn; }

/** The back end an ESP32 node runs on here (#5658): 'jspi' where WebAssembly has JSPI (Suspending, promising) and its
 *  build can be loaded, else 'worker'; `forced` ('worker', 'jspi') chooses (a test, a diagnosis). */
export function esp32Backend(g = globalThis, forced = null) {
  if (forced === 'worker' || forced === 'jspi') return forced;
  return typeof g.WebAssembly?.Suspending === 'function' && typeof g.WebAssembly?.promising === 'function' && jspiLoad ? 'jspi' : 'worker';
}

/** Why an ESP32 node cannot run here (its Worker + Atomics back end needs SharedArrayBuffer: the page cross-origin
 *  isolated; `node`: in Node, always), or null. */
export function esp32Problem(g = globalThis, node = isNode) {
  if (typeof g.SharedArrayBuffer === 'function' && (node || g.crossOriginIsolated)) return null;
  return `an ESP32 node runs in a page cross-origin isolated: ${isolationProblem(g) ?? 'no SharedArrayBuffer here'}`;
}

/** The engines of the ESP32 nodes `ids` made, each its MicroPython loaded (before the System's run is built), on the
 *  back end esp32Backend chooses (`backend`: forced). */
export async function prepareEsp32(ids, { backend = null } = {}) {
  const which = esp32Backend(globalThis, backend);
  const why = which === 'worker' ? esp32Problem() : null;
  if (why) throw new Error(why);
  await Promise.all(ids.map(async id => {
    workers.get(id)?.terminate?.();   // (one made for a run that was not built)
    workers.delete(id);
    if (which === 'jspi') { workers.set(id, { jspi: await esp32JspiEngine({ load: jspiLoad }) }); return; }
    const sab = esp32Buffer();
    workers.set(id, { sab, ...(await spawn(sab)) });
  }));
}

/** What the console says of an ESP32 node's back end (#5658): the same run on both. */
export const esp32EngineText = (id, backend) => `ESP32 ${id}: MicroPython ${backend === 'jspi' ? 'on this thread (JSPI)' : 'in a Worker (Atomics)'}`;

/** The back ends of a run's ESP32 nodes: { id: 'jspi' | 'worker' }. */
export const esp32Engines = sim => Object.fromEntries([...sim.nodes].filter(([, a]) => a instanceof Esp32Node).map(([id, a]) => [id, a.backend]));

const gpOf = name => { const m = /^GPIO(\d+)$/.exec(String(name).toUpperCase()); return m ? Number(m[1]) : null; };

/** What the behavioural ESP32 models and what it does not (the node contract's fidelity notes, #5499). */
const ESP32_FIDELITY = [
  { kind: 'models', text: 'an ESP32 DevKitC in MicroPython, behavioural: MicroPython\'s WebAssembly port runs the program with Silinx\'s machine (Pin, UART, Timer, PWM, ADC, SPI, I2C) and time; each line of Python 1 µs, a sleep its time' },
  { kind: 'approximates', text: 'the timing of the program (a line\'s time, not the Xtensa\'s), a UART\'s, a PWM\'s, SPI\'s and I²C\'s pins as their waveforms at the program\'s rates, a Timer\'s callback between two lines (its own lines untimed), an ADC\'s reading its pin\'s logic level (0 or full scale)' },
  { kind: 'omits', text: 'interrupts (Pin.irq), analog voltages, SPI and I²C peripheral modes, Wi-Fi but through the System\'s network links, the real firmware (Espressif\'s QEMU, later)' },
];

export class Esp32Node {
  /** id: the node's (its Worker, made by prepareEsp32); board: the ESP32 DevKitC; program: { name, data } (a .py). */
  constructor({ id, board = 'esp32-devkitc', program }) {
    const b = mcuBoard(board);
    if (b?.arch !== 'esp32') throw new Error(`no ESP32 board '${board}'`);
    const w = workers.get(id);
    if (!w) throw new Error(`${id}: its MicroPython not started (prepareEsp32 first)`);
    workers.delete(id);
    this.worker = w;
    this.backend = w.jspi ? 'jspi' : 'worker';
    this.async = !!w.jspi;   // (its advanceTo a promise: the scheduler's runAsync)
    this.link = w.jspi ?? hostLink(w.sab);
    this.board = b;
    this.fidelity = ESP32_FIDELITY;   // (the node contract's notes, #5499)
    this.pins = b.pins;
    this.inputs = [...this.pins];
    this.outputs = [...this.pins];
    this.now = 0;
    this.out = [];
    this.queue = [];
    this.log = [];
    this.logN = 0;
    this.finished = null;
    this.inVals = new Map(this.pins.map(p => [p, null]));
    this.drive = new Map();      // (a pin the program drives: its value)
    this.last = new Map(this.pins.map(p => [p, null]));
    this.uarts = new Map();      // (id -> { tx, rx, baud, frame, decoder, bits: [{ t, value }], end })
    this.buses = new Esp32Buses(this);   // (its PWM, SPI and I²C pins)
    this.pending = [];           // (the inputs since the last window)
    this.received = [];          // (its REPL's console)
    this.program = String(program?.data ?? '');
    this.name = String(program?.name ?? 'main.py').split('/').pop();
    this.started = false;
    this.engineAt = 0;           // (its engine's time at its last answer)
    this.ended = false;          // (its program ended: its REPL's)
    if (!/\.py$/i.test(String(program?.name ?? ''))) { this.finished = 'error'; this.log.push({ kind: 'error', time: 0, text: `its program ${program?.name ?? '(none)'} is not a .py` }); }
  }

  /** A pin's value now: as the program drives it, else as it was set. */
  value(name) {
    const P = String(name).toUpperCase();
    if (!this.inVals.has(P)) throw new Error(`no pin '${name}'`);
    return this.levelOf(P, this.now) ?? this.inVals.get(P);
  }

  // what the program drives on a pin at t (a UART's TX: its frames), or null
  levelOf(P, t) {
    if (this.buses.drives(P)) return this.buses.levelOf(P, t);
    for (const u of this.uarts.values()) if (u.tx === P) { let v = u.level; for (const b of u.bits) if (b.t <= t) v = b.value; return v; }
    return this.drive.has(P) ? this.drive.get(P) : null;
  }

  /** An input pin's value from now on; a UART's RX sampled into bytes. */
  setPin(name, value) {
    const P = String(name).toUpperCase();
    if (!this.inVals.has(P)) throw new Error(`'${name}' is not a pin of the ${this.board.name}`);
    const v = value == null ? null : Number(value) ? 1 : 0;
    this.inVals.set(P, v);
    this.buses.got(P, this.now, v);
    const u = [...this.uarts.values()].find(x => x.rx === P);
    if (u) u.decoder.feed([this.now, v ?? 1]);
    else this.pending.push({ pin: P, t: this.now, value: v });
  }

  /** A line typed to its REPL (run once the program ended). */
  send(bytes) {
    for (const line of new TextDecoder().decode(Uint8Array.from(bytes)).split(/\r?\n/).filter(Boolean)) this.pending.push({ repl: line, t: this.now });
  }

  at(t, fn) {
    let i = this.queue.length;
    while (i && this.queue[i - 1].t > t) i--;
    this.queue.splice(i, 0, { t: Math.max(t, this.now), fn });
  }

  // (a bus step's end too: its result read at its time)
  nextEventTime() { return Math.min(this.queue.length ? this.queue[0].t : Infinity, this.buses.next()); }

  // a UART the program set up: its pins (its defaults when none), its frame, its receiver
  uartInit(e) {
    const d = UART_PINS[e.id] ?? {}, tx = `GPIO${e.tx >= 0 ? e.tx : d.tx}`, rx = `GPIO${e.rx >= 0 ? e.rx : d.rx}`;
    const frame = `${e.bits}${e.parity < 0 ? 'N' : e.parity ? 'O' : 'E'}${e.stop}`;
    const u = { id: e.id, tx, rx, baud: e.baud, frame, level: 1, bits: [], end: 0, decoder: new UartLinkDecoder({ baud: e.baud, frame }) };
    u.decoder.feed([e.t, this.inVals.get(rx) ?? 1]);
    this.uarts.set(e.id, u);
    this.drive.delete(tx);
    if (this.last.get(tx) !== 1) { this.last.set(tx, 1); this.out.push({ pin: tx, t: Math.max(e.t, this.now), value: 1 }); }
  }

  // bytes the program wrote: their frames on the UART's TX from their time (after the one being sent)
  transmit(e) {
    const u = this.uarts.get(e.id);
    if (!u) { this.log.push({ kind: 'warning', time: e.t, text: `UART(${e.id}).write before its init` }); return; }
    const bit = 1e12 / u.baud, n = Number(u.frame[0]);
    let t = Math.max(e.t, u.end);
    for (const byte of e.bytes) {
      const data = Array.from({ length: n }, (_, i) => (byte >> i) & 1);
      const parity = u.frame[1] === 'N' ? [] : [data.reduce((a, x) => a ^ x, u.frame[1] === 'O' ? 1 : 0)];
      for (const v of [0, ...data, ...parity, ...Array(Number(u.frame[2])).fill(1)]) { u.bits.push({ t, value: v }); t += bit; }
    }
    u.end = t;
  }

  // what the engine said the program did up to its time
  took(out) {
    for (const e of out) {
      if (e.kind === 'pin') {
        this.buses.release(e.pin);
        this.drive.set(e.pin, e.value);
        if (e.value !== this.last.get(e.pin)) { this.last.set(e.pin, e.value); this.out.push({ pin: e.pin, t: e.t, value: e.value }); }
      } else if (e.kind === 'mode') {
        if (!e.out && this.drive.has(e.pin)) { this.drive.delete(e.pin); if (this.last.get(e.pin) !== null) { this.last.set(e.pin, null); this.out.push({ pin: e.pin, t: e.t, value: null }); } }
      } else if (e.kind === 'uart') this.uartInit(e);
      else if (e.kind === 'end') this.ended = true;
      else if (['pwm', 'spi-init', 'spi', 'i2c-init', 'i2c'].includes(e.kind)) this.buses.took(e);
      else if (e.kind === 'tx') this.transmit(e);
      else if (e.kind === 'console') for (const byte of e.bytes) this.received.push({ t: e.t, byte });
      else if (e.kind === 'error') { const text = e.text.trim().split(/\r?\n/).filter(Boolean).join(' | '); this.log.push({ kind: 'error', time: e.t, text: `its program: ${text}` }); for (const byte of new TextEncoder().encode(`${e.text.trim()}\n`)) this.received.push({ t: e.t, byte }); }
    }
  }

  // the command to its engine for a run to t: its events up to t, its inputs (its UARTs' bytes received up to t, to the
  // program at their stop bit); null when it has stopped
  commandTo(t) {
    if (t < this.now) throw new Error(`the node is at ${this.now} ps, not back at ${t}`);
    while (this.queue.length && this.queue[0].t <= t) { const e = this.queue.shift(); this.now = e.t; e.fn(this); }
    if (this.finished) return null;
    this.pending.push(...this.buses.due(t));
    const inputs = this.pending.splice(0);
    for (const u of this.uarts.values()) { u.decoder.flush(t); for (const r of u.decoder.take()) { if (r.error) this.log.push({ kind: 'warning', time: r.t, text: `UART(${u.id}) RX: a ${r.error} error at ${u.baud} baud` }); else inputs.push({ uart: u.id, t: r.t + (1 + Number(u.frame[0]) + (u.frame[1] === 'N' ? 0 : 1)) * 1e12 / u.baud, byte: r.byte }); } }
    const cmd = { inputs, from: this.now, ...(this.started ? {} : { program: this.program, name: this.name }) };
    this.started = true;
    return cmd;
  }

  // its engine stopped answering: the node stopped, said
  failed(t, e) { this.finished = 'error'; this.log.push({ kind: 'error', time: t, text: e.message }); return this.out.splice(0); }

  advanceTo(t) {
    const cmd = this.commandTo(t);
    // (its engine already past t, waiting for a later time (a sleep, a bus step), or its program ended and nothing
    // came: nothing to ask it, its inputs kept for the next command, which applies them at their times; the same run,
    // without a round trip a window)
    if (cmd && !cmd.program && (this.engineAt >= t || (this.ended && !cmd.inputs.length))) { this.pending.unshift(...cmd.inputs); return this.async ? Promise.resolve(this.reached(t, null)) : this.reached(t, null); }
    if (this.async) return cmd ? this.link.command(t, cmd).then(r => this.reached(t, r), e => this.failed(t, e)) : Promise.resolve(this.reached(t, null));
    if (cmd) { let r; try { r = this.link.command(t, cmd); } catch (e) { return this.failed(t, e); } return this.reached(t, r); }
    return this.reached(t, null);
  }

  // what its engine did up to t taken: its pins' changes up to t
  reached(t, r) {
    if (r) { this.engineAt = r.vt; this.took(r.out); }
    this.now = t;
    // (the UARTs' TX frames' bits up to t)
    for (const u of this.uarts.values()) while (u.bits.length && u.bits[0].t <= t) {
      const b = u.bits.shift();
      u.level = b.value;
      if (b.value !== this.last.get(u.tx)) { this.last.set(u.tx, b.value); this.out.push({ pin: u.tx, t: b.t, value: b.value }); }
    }
    this.buses.emit(t, (pin, at, value) => { if (value !== this.last.get(pin)) { this.last.set(pin, value); this.out.push({ pin, t: at, value }); } });
    return this.out.splice(0).sort((a, b) => a.t - b.t);
  }

  messages() { return this.log.slice(this.logN, (this.logN = this.log.length)); }

  /** Its Worker ended (the run over). */
  dispose() { this.worker.terminate?.(); }
}

