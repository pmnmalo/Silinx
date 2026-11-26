// Silinx - an ESP32 node's MicroPython (#5495; the node's side: core/system-sim-esp32.js): MicroPython's WebAssembly port
// (MIT) runs the node's program with Silinx's `machine` and `time` (core/esp32-python.js), each line a time (LINE_PS), a
// sleep a time too. The node asks it to run to a time t; it runs the program until its virtual time reaches t, hands over
// what its pins and UARTs did, and waits for the next t. Deterministic: its time is the program's lines and sleeps, never
// the wall clock. Two back ends behind the same program state (Esp32Program), the same results (#5658):
//   - Worker + Atomics (runEsp32Engine): in a Worker of its own, sharing a SharedArrayBuffer with the scheduler's thread
//     (core/esp32-link.js), blocked (Atomics.wait) between the windows; MicroPython's npm build (its settrace one);
//   - JSPI (esp32JspiEngine): on the scheduler's own thread, Silinx's MicroPython build (scripts/micropython-wasm/: its
//     silinx_jspi.wait() suspends the program until the next command), each command a promise.
//
//   await runEsp32Engine({ sab, load });               // in its Worker; load(): MicroPython's loadMicroPython and .wasm
//   const e = await esp32JspiEngine({ load });  await e.command(t, { inputs, program, name }) -> { vt, out }
//
// Isomorphic ES module, no DOM.
import { LINE_PS, esp32Prelude } from './esp32-python.js';
import { mailbox } from './esp32-link.js';

// a traceback as the program's: the prelude's frames left out, the program named by its file
const programTrace = (text, name = 'main.py') => text.split('\n').filter(l => !/File "<stdin>"/.test(l)).join('\n').replaceAll('File "<string>"', `File "${name}"`);
const bytesOf = text => [...new TextEncoder().encode(text)];

/** What a program did and has to do, between the scheduler's commands: its time, what it said, its inputs. */
class Esp32Program {
  constructor() {
    this.vt = 0;
    this.target = 0;
    this.out = [];
    this.pins = new Map();
    this.pulls = new Map();
    this.pending = [];
    this.rx = new Map();
    this.repl = [];
    this.name = 'main.py';
  }

  // (what it prints, its bytes of one time together)
  say(b) { const last = this.out.at(-1); if (last?.kind === 'console' && last.t === this.vt) last.bytes.push(...b); else this.out.push({ kind: 'console', t: this.vt, bytes: [...b] }); }

  // (inputs at their times: applied once the program's time passes them)
  take() {
    while (this.pending.length && this.pending[0].t <= this.vt) {
      const e = this.pending.shift();
      if (e.pin != null) this.pins.set(e.pin, e.value);
      else if (e.uart != null) (this.rx.get(e.uart) ?? this.rx.set(e.uart, []).get(e.uart)).push(e.byte);
      else if (e.repl != null) this.repl.push(e.repl);
    }
  }

  /** A command of the scheduler's: its inputs, the time to reach. */
  accept(t, cmd) {
    this.target = t;
    this.pending.push(...(cmd.inputs ?? []));
    this.pending.sort((a, b) => a.t - b.t);
    if (cmd.name) this.name = cmd.name;
  }

  /** What the program did since the last answer, at its time. */
  answer() { const a = { vt: this.vt, out: this.out }; this.out = []; return a; }

  // (time passed: whether the program has to wait for the scheduler)
  advance(dt) { this.vt += dt; this.take(); return this.vt >= this.target; }
  level(n) { this.take(); const v = this.pins.get(`GPIO${n}`); return v == null ? (this.pulls.get(n) ?? 0) : v; }

  /** The module _silinx (`pause`: the Worker's wait, blocking). */
  bridge(pause) {
    const p = this;
    return {
      line: () => p.advance(LINE_PS),
      sleep_us: us => p.advance(Math.max(0, Number(us)) * 1e6),
      pause,
      ticks_us: () => Math.floor(p.vt / 1e6),
      pin_mode: (n, mode, pull) => { p.pulls.set(n, pull === 2 ? 1 : 0); p.out.push({ kind: 'mode', t: p.vt, pin: `GPIO${n}`, out: mode === 3 || mode === 7 }); },
      pin_set: (n, v) => p.out.push({ kind: 'pin', t: p.vt, pin: `GPIO${n}`, value: v }),
      pin_get: n => p.level(n),
      uart_init: (id, baud, bits, parity, stop, tx, rx) => p.out.push({ kind: 'uart', t: p.vt, id, baud, bits, parity, stop, tx, rx }),
      uart_write: (id, bytes) => p.out.push({ kind: 'tx', t: p.vt, id, bytes: [...bytes] }),
      uart_any: id => { p.take(); return p.rx.get(id)?.length ?? 0; },
      uart_read: (id, n) => { p.take(); const q = p.rx.get(id) ?? []; return q.splice(0, n < 0 ? q.length : n); },
      uart_readline: id => { p.take(); const q = p.rx.get(id) ?? [], k = q.indexOf(10); return q.splice(0, k < 0 ? q.length : k + 1); },
    };
  }

  /** The program ended (an error: its traceback). */
  ended(e) {
    if (e !== undefined) this.out.push({ kind: 'error', t: this.vt, text: programTrace(String(e?.message ?? e), this.name) });
    this.out.push({ kind: 'end', t: this.vt });
  }

  /** The program ended: a line typed to its REPL run as it comes (`run`: MicroPython's runPython), its time the
   *  scheduler's. */
  idle(run) {
    this.take();
    while (this.repl.length) {
      const line = this.repl.shift();
      this.out.push({ kind: 'console', t: this.vt, bytes: bytesOf(`>>> ${line}\n`) });
      try { const r = run(line); if (r !== undefined && r !== null) this.out.push({ kind: 'console', t: this.vt, bytes: bytesOf(`${r}\n`) }); } catch (e) { this.out.push({ kind: 'console', t: this.vt, bytes: bytesOf(`${String(e?.message ?? e).trim()}\n`) }); }
    }
    this.vt = Math.max(this.vt, this.target);
  }
}

// MicroPython loaded for a program, what it prints the program's
const loadFor = async (p, { loadMicroPython, url }) => loadMicroPython({ url, linebuffer: false, stdout: b => p.say(b), stderr: b => p.say(b) });

/** The Worker + Atomics back end: the engine of one node in its Worker, MicroPython loaded (`load`: { loadMicroPython,
 *  url }), `ready()` said, then the program the first command gives run, window after window, until the Worker is
 *  terminated. */
export async function runEsp32Engine({ sab, load, ready = () => {} }) {
  const box = mailbox(sab), p = new Esp32Program();
  const mp = await loadFor(p, await load());
  // (the target reached: what the program did handed over, the next target and inputs awaited)
  const pause = () => { const cmd = box.handOver(p.answer()); p.accept(box.target(), cmd); return cmd; };
  mp.registerJsModule('_silinx', p.bridge(() => { while (p.vt >= p.target) pause(); p.take(); }));
  ready();
  const first = pause();   // (the first command: the program)
  try { mp.runPython(esp32Prelude(first.program ?? '', 'worker')); p.ended(); } catch (e) { p.ended(e); }
  for (;;) { p.idle(line => mp.runPython(line)); pause(); }
}

/** The JSPI back end: one node's engine on this thread, MicroPython loaded (`load`: Silinx's build's { loadMicroPython,
 *  runPythonSuspending, url }). command(t, { inputs, program, name }) -> a promise of { vt, out } once the program
 *  reached t (the first command's program started). */
export async function esp32JspiEngine({ load }) {
  const p = new Esp32Program(), lib = await load();
  const mp = await loadFor(p, lib);
  // (MicroPython's JavaScript reads the global Module: this instance's before each call into it)
  const use = () => { globalThis.Module = mp._module; };
  use();
  mp.registerJsModule('_silinx', p.bridge(() => { throw new Error('the JSPI back end waits through silinx_jspi'); }));
  let toHost = null, toEngine = null, state = 'new';
  const reply = () => { const r = toHost; toHost = null; r(p.answer()); };
  // (the program's wait: the target reached, its answer handed over, the next command awaited)
  const wait = async () => {
    while (p.vt >= p.target) { await new Promise(r => { toEngine = r; reply(); }); }
    p.take();
    return 0;
  };
  const idle = () => { use(); p.idle(line => mp.runPython(line)); reply(); };
  return {
    command(t, cmd) {
      return new Promise((res) => {
        p.accept(t, cmd);
        toHost = res;
        if (state === 'new') {
          state = 'running';
          use();
          lib.runPythonSuspending(mp, esp32Prelude(cmd.program ?? '', 'jspi'), wait).then(() => p.ended(), e => p.ended(e)).then(() => { state = 'ended'; idle(); });
        } else if (state === 'running') { const r = toEngine; toEngine = null; r(); } else idle();
      });
    },
  };
}
