// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A System's Zynq PS (#4689, part 5b of #4688; the scheduler: core/system-sim.js): the processing system of a Zynq
// board's FPGA node, a node of the run of its own, `<id>_ps`, its program's bare-metal C run by the C interpreter on the
// PS's model (core/zynq-ps-sim.js), behavioural and said so. The interpreter runs in a Worker (core/zynq-ps-engine.js),
// in lockstep with the scheduler through core/esp32-link.js's shared buffer, as an ESP32's MicroPython does: advanceTo(t)
// asks the engine to run to t and blocks until it has, so the run is deterministic. Its pins: its UART's TX (`tx`, the
// bytes the program wrote, in frames of 8N1 at the baud its BRGR and BDIV make) and RX (`rx`, nothing received), and its
// board's PS LEDs on the MIO (the Zybo Z7's LD4), each change at its time. With its node's PS–PL register map (`pl`,
// part 5c, core/system-ps-pl.js), it is the map's AXI4-Lite slave too, transaction by transaction: a write of the
// program's to M_AXI_GP0's window its register's pins at the write's time (a strobe's <name>_wr high for one clock of
// FCLK0), wired to the module's inputs; a read its register's value: an ro register's the module's outputs as this node
// sees them (their wires' changes up to the window's start), an rw one's as written, a wo one's 0, as the slave reads
// them (core/regmap-axi.js); a word with no register read as 0, written to nothing, said once.
// Its engine is made before the run (prepareZynqPs; a SharedArrayBuffer: in Node, or a page cross-origin isolated).
//
//   await prepareZynqPs(['zybo_ps']);
//   const node = new ZynqPsNode({ id: 'zybo_ps', ps: nodePs(n), program: { name: 'zybo/ps/main.c', data } });
//
// Isomorphic ES module, no DOM.
import { esp32Buffer, hostLink } from './esp32-link.js';
import { isolationProblem } from './cross-origin.js';
import { sigPins } from './system-ps-pl.js';

const workers = new Map();   // (a node's engine made before its run: { sab, terminate })
const isNode = typeof process !== 'undefined' && !!process.versions?.node && typeof window === 'undefined' && !globalThis.WorkerGlobalScope;

// a Worker running the engine on `sab`: a page's or a worker's (web/js/zynq-ps-worker.js), else the one setZynqPsSpawner
// gave (Node's worker_threads: server/zynq-ps-spawn.js)
let spawn = async (sab) => {
  const w = new Worker('/js/zynq-ps-worker.js', { type: 'module' });
  await new Promise((ok, fail) => { w.onmessage = ok; w.onerror = (e) => fail(new Error(e.message || 'its Worker did not start')); w.postMessage({ sab }); });
  return { terminate: () => w.terminate() };
};
/** Where a Zynq PS's engine runs in Node: `fn(sab)` -> { terminate } once it waits for its program. */
export function setZynqPsSpawner(fn) { spawn = fn; }

/** Why a Zynq PS cannot run here (its Worker + Atomics needs SharedArrayBuffer: the page cross-origin isolated; in Node,
 *  always), or null. */
export function zynqPsProblem(g = globalThis, node = isNode) {
  if (typeof g.SharedArrayBuffer === 'function' && (node || g.crossOriginIsolated)) return null;
  return `a Zynq's PS runs in a page cross-origin isolated: ${isolationProblem(g) ?? 'no SharedArrayBuffer here'}`;
}

/** The engines of the PS nodes `ids` made (before the System's run is built). */
export async function prepareZynqPs(ids) {
  const why = zynqPsProblem();
  if (why) throw new Error(why);
  await Promise.all(ids.map(async (id) => {
    workers.get(id)?.terminate?.();   // (one made for a run that was not built)
    workers.delete(id);
    const sab = esp32Buffer();
    workers.set(id, { sab, ...(await spawn(sab)) });
  }));
}

/** What the behavioural PS models and what it does not (the node contract's fidelity notes, #5499). */
const PS_FIDELITY = [
  { kind: 'models', text: 'a Zynq\'s processing system, behavioural: Silinx\'s C interpreter runs the program\'s bare-metal C, its memory-mapped registers the PS\'s model\'s (its UART, GPIO bank 0, M_AXI_GP0\'s window), the PS as Silinx\'s ps7_init sets it up' },
  { kind: 'approximates', text: 'the program\'s timing: each step of the interpreter one clock of the Cortex-A9, not its instructions\' cycles; the UART\'s frames at the baud its registers make' },
  { kind: 'omits', text: 'the ARM instructions, the caches and the DDR, interrupts, the UART\'s receiver, the PS\'s other peripherals (an access to one stops the run, said)' },
];

export class ZynqPsNode {
  /** id: the node's (`<fpga id>_ps`, its Worker made by prepareZynqPs); ps: the board's PS (nodePs); program: { name, data } (a .c);
   *  pl: its PS–PL registers, { regs: the map's registers, fclkHz } (core/system-ps-pl.js), or null. */
  constructor({ id, ps, program, pl = null }) {
    const w = workers.get(id);
    if (!w) throw new Error(`${id}: its PS's engine not started (prepareZynqPs first)`);
    workers.delete(id);
    this.id = id;
    this.worker = w;
    this.link = hostLink(w.sab, { engine: 'its PS\'s C interpreter' });
    this.ps = ps;
    this.fidelity = PS_FIDELITY;
    this.leds = (ps.gpio ?? []).filter((g) => g.dir === 'out');
    // (the slave's registers: the written ones' pins out, a strobe's <name>_wr; the ro ones' in)
    this.pl = pl;
    const regs = pl?.regs ?? [];
    this.regOut = regs.filter((r) => r.access !== 'ro').flatMap((r) => [...sigPins(r.name, r.width), ...(r.strobe ? [`${r.name}_wr`] : [])]);
    this.regIn = regs.filter((r) => r.access === 'ro').flatMap((r) => sigPins(r.name, r.width));
    this.regVal = new Map(regs.filter((r) => r.access !== 'ro').map((r) => [r.name, BigInt(r.reset ?? 0)]));
    this.fclkPs = pl?.fclkHz ? Math.round(1e12 / pl.fclkHz) : null;
    this.inVals = new Map(this.regIn.map((p) => [p, 0]));
    this.saidOff = new Set();
    this.inputs = ['rx', ...this.regIn];
    this.outputs = ['tx', ...this.leds.map((g) => g.name), ...this.regOut];
    this.now = 0;
    this.out = [];
    this.queue = [];
    this.log = [];
    this.logN = 0;
    this.finished = null;
    this.last = new Map([['tx', 1], ...this.leds.map((g) => [g.name, 0]), ...this.regOut.map((p) => [p, 0])]);
    this.bits = [];              // (the TX frames' bits not yet reached: { t, value })
    this.changes = [];           // (the LEDs' changes not yet reached: { pin, t, value })
    this.rx = 1;
    this.program = { source: String(program?.data ?? ''), file: String(program?.name ?? 'main.c') };
    this.started = false;
    this.engineAt = 0;
    this.ended = false;
    if (!/\.c$/i.test(this.program.file)) { this.finished = 'error'; this.log.push({ kind: 'error', time: 0, text: `its program ${program?.name ?? '(none)'} is not a .c` }); }
  }

  value(name) {
    if (this.inVals.has(name)) return this.inVals.get(name);
    if (!this.last.has(name) && name !== 'rx') throw new Error(`no pin '${name}'`);
    return name === 'rx' ? this.rx : this.last.get(name);
  }

  /** Its UART's RX: held (nothing received: the model has no receiver); an ro register's bit: the module's. */
  setPin(name, value) {
    if (this.inVals.has(name)) { this.inVals.set(name, value ? 1 : 0); return; }
    if (name !== 'rx') throw new Error(`'${name}' is not an input of the PS`);
    this.rx = value;
  }

  // the register at the word `off` of M_AXI_GP0's window (its low 12 bits, the slave's 4 KB), or null, said once
  regAt(off, t, what) {
    const r = this.pl.regs.find((x) => x.addr === (off & 0xfff));
    if (!r && !this.saidOff.has(off)) { this.saidOff.add(off); this.log.push({ kind: 'warning', time: t, text: `its program ${what} 0x${(0x40000000 + off).toString(16).toUpperCase()}, where the PS–PL register map has no register: ${what === 'reads' ? 'read as 0' : 'written to nothing'}` }); }
    return r ?? null;
  }

  // a write of the program's: its register's bits from t, a strobe's pulse
  plWrite(off, value, t) {
    const r = this.regAt(off, t, 'writes');
    if (!r || r.access === 'ro') return;
    const v = BigInt.asUintN(r.width, BigInt(value));
    this.regVal.set(r.name, v);
    sigPins(r.name, r.width).forEach((p, i) => this.changes.push({ pin: p, t, value: Number((v >> BigInt(i)) & 1n) }));
    if (r.strobe) this.changes.push({ pin: `${r.name}_wr`, t, value: 1 }, { pin: `${r.name}_wr`, t: t + this.fclkPs, value: 0 });
  }

  // a read of the program's: its register's value as the slave gives it
  plRead(off, t) {
    const r = this.regAt(off, t, 'reads');
    if (!r || r.access === 'wo') return 0;
    if (r.access === 'rw') return Number(this.regVal.get(r.name));
    return sigPins(r.name, r.width).reduce((v, p, i) => v + (this.inVals.get(p) ? 2 ** i : 0), 0);
  }

  at(t, fn) {
    let i = this.queue.length;
    while (i && this.queue[i - 1].t > t) i--;
    this.queue.splice(i, 0, { t: Math.max(t, this.now), fn });
  }

  nextEventTime() { return this.queue.length ? this.queue[0].t : Infinity; }

  // what the engine said the program did up to its time: its bytes' frames (start bit, 8 data bits LSB first, stop
  // bit), its LEDs' changes, its end
  took(out, baud) {
    const bit = 1e12 / baud;
    for (const b of out.bytes) for (const [i, v] of [0, ...Array.from({ length: 8 }, (_, k) => (b.byte >> k) & 1), 1].entries()) this.bits.push({ t: Math.round(b.t + i * bit), value: v });
    for (const w of out.writes ?? []) this.plWrite(w.off, w.value, w.t);
    const mio = new Map(this.leds.map((g) => [g.mio, g.name]));
    for (const g of out.gpio) if (mio.has(g.mio)) this.changes.push({ pin: mio.get(g.mio), t: g.t, value: g.value });
    if (out.end) {
      this.ended = true;
      if (out.end.error) { this.finished = 'error'; this.log.push({ kind: 'error', time: this.engineAt, text: `its program: ${out.end.error}` }); }
      else this.log.push({ kind: 'info', time: this.engineAt, text: out.end.exit == null ? 'its program stopped' : `its program returned ${out.end.exit}` });
    }
  }

  failed(t, e) { this.finished = 'error'; this.log.push({ kind: 'error', time: t, text: e.message }); return this.out.splice(0); }

  advanceTo(t) {
    if (t < this.now) throw new Error(`the node is at ${this.now} ps, not back at ${t}`);
    while (this.queue.length && this.queue[0].t <= t) { const e = this.queue.shift(); this.now = e.t; e.fn(this); }
    // (its engine already past t, or its program ended: nothing to ask it)
    if (!this.finished && !this.ended && !(this.started && this.engineAt >= t)) {
      // (its registers' reset values on their pins from 0)
      if (!this.started) for (const [name, v] of this.regVal) { const r = this.pl.regs.find((x) => x.name === name); sigPins(name, r.width).forEach((p, i) => { if ((v >> BigInt(i)) & 1n) this.changes.push({ pin: p, t: 0, value: 1 }); }); }
      let cmd = this.started ? {} : { program: this.program, ps: this.ps, pl: !!this.pl };
      this.started = true;
      // (a read of the PL's registers: answered, the run to t going on)
      for (;;) {
        let r;
        try { r = this.link.command(t, cmd); } catch (e) { return this.failed(t, e); }
        this.engineAt = r.vt;
        if (r.out.baud) this.baud = r.out.baud;
        this.took(r.out, this.baud);
        if (!r.out.read) break;
        cmd = { value: this.plRead(r.out.read.off, r.out.read.t) };
      }
      this.changes.sort((a, b) => a.t - b.t);
    }
    this.now = t;
    // (the TX's bits and the LEDs' changes up to t)
    const due = [];
    while (this.bits.length && this.bits[0].t <= t) due.push({ pin: 'tx', ...this.bits.shift() });
    while (this.changes.length && this.changes[0].t <= t) due.push(this.changes.shift());
    for (const c of due.sort((a, b) => a.t - b.t)) if (c.value !== this.last.get(c.pin)) { this.last.set(c.pin, c.value); this.out.push(c); }
    return this.out.splice(0);
  }

  messages() { return this.log.slice(this.logN, (this.logN = this.log.length)); }

  /** Its Worker ended (the run over). */
  dispose() { this.worker.terminate?.(); }
}
