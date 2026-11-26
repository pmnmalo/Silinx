// Silinx - an ESP32 node's MicroPython in its own Worker (#5495, the Worker + Atomics back end; the node's side:
// core/system-sim-esp32.js): MicroPython's WebAssembly port (MIT, its settrace build) runs the node's program with
// Silinx's `machine` and `time` (core/esp32-python.js), each line a time (LINE_PS), a sleep a time too. The scheduler's
// thread and this one share a SharedArrayBuffer (core/esp32-link.js): the node asks it to run to a time t, this one runs
// the program until its virtual time reaches t, hands over what its pins and UARTs did, and blocks (Atomics.wait) until
// the next t. Deterministic: its time is the program's lines and sleeps, never the wall clock.
//
//   await runEsp32Engine({ sab, load });   // load(): MicroPython's loadMicroPython and its .wasm's URL
//
// Isomorphic ES module (a Node worker_threads Worker, a browser's module Worker), no DOM.
import { LINE_PS, esp32Prelude } from './esp32-python.js';
import { mailbox } from './esp32-link.js';

// a traceback as the program's: the prelude's frames left out, the program named by its file
const programTrace = (text, name = 'main.py') => text.split('\n').filter(l => !/File "<stdin>"/.test(l)).join('\n').replaceAll('File "<string>"', `File "${name}"`);

/** The engine of one node: MicroPython loaded (`load`: { loadMicroPython, url }), `ready()` said, then the program the
 *  first command gives run, window after window, until the Worker is terminated. */
export async function runEsp32Engine({ sab, load, ready = () => {} }) {
  const box = mailbox(sab);
  let vt = 0, out = [], pins = new Map(), pending = [], rx = new Map(), repl = [], ended = false;
  const { loadMicroPython, url } = await load();
  // (what it prints, its bytes of one time together)
  const say = b => { const last = out.at(-1); if (last?.kind === 'console' && last.t === vt) last.bytes.push(...b); else out.push({ kind: 'console', t: vt, bytes: [...b] }); };
  const mp = await loadMicroPython({ url, linebuffer: false, stdout: say, stderr: say });
  // (inputs at their times: applied once the program's time passes them)
  const take = () => {
    while (pending.length && pending[0].t <= vt) { const e = pending.shift(); if (e.pin != null) pins.set(e.pin, e.value); else if (e.uart != null) (rx.get(e.uart) ?? rx.set(e.uart, []).get(e.uart)).push(e.byte); else if (e.repl != null) repl.push(e.repl); }
  };
  // (the target reached: what the program did handed over, the next target and inputs awaited)
  const pause = () => {
    const cmd = box.handOver({ vt, out });
    out = [];
    pending.push(...cmd.inputs);
    pending.sort((a, b) => a.t - b.t);
    return cmd;
  };
  const advance = dt => { vt += dt; while (vt >= box.target()) pause(); take(); };
  const level = n => { take(); const v = pins.get(`GPIO${n}`); return v == null ? (pulls.get(n) ?? 0) : v; };
  const pulls = new Map(), uarts = new Map();
  mp.registerJsModule('_silinx', {
    line: () => advance(LINE_PS),
    sleep_us: us => advance(Math.max(0, Number(us)) * 1e6),
    ticks_us: () => Math.floor(vt / 1e6),
    pin_mode: (n, mode, pull) => { pulls.set(n, pull === 2 ? 1 : 0); out.push({ kind: 'mode', t: vt, pin: `GPIO${n}`, out: mode === 3 || mode === 7 }); },
    pin_set: (n, v) => out.push({ kind: 'pin', t: vt, pin: `GPIO${n}`, value: v }),
    pin_get: n => level(n),
    uart_init: (id, baud, bits, parity, stop, tx, rx_) => { uarts.set(id, true); out.push({ kind: 'uart', t: vt, id, baud, bits, parity, stop, tx, rx: rx_ }); },
    uart_write: (id, bytes) => out.push({ kind: 'tx', t: vt, id, bytes: [...bytes] }),
    uart_any: id => { take(); return rx.get(id)?.length ?? 0; },
    uart_read: (id, n) => { take(); const q = rx.get(id) ?? []; return q.splice(0, n < 0 ? q.length : n); },
    uart_readline: id => { take(); const q = rx.get(id) ?? [], k = q.indexOf(10); return q.splice(0, k < 0 ? q.length : k + 1); },
  });
  ready();
  const first = pause();   // (the first command: the program)
  try { mp.runPython(esp32Prelude(first.program ?? '')); } catch (e) { out.push({ kind: 'error', t: vt, text: programTrace(String(e?.message ?? e), first.name) }); }
  ended = true;
  out.push({ kind: 'end', t: vt });
  // (the program ended: its time follows the scheduler's; a line typed to its REPL run as it comes)
  for (;;) {
    take();
    while (repl.length) {
      const line = repl.shift();
      out.push({ kind: 'console', t: vt, bytes: [...new TextEncoder().encode(`>>> ${line}\n`)] });
      try { const r = mp.runPython(line); if (r !== undefined && r !== null) out.push({ kind: 'console', t: vt, bytes: [...new TextEncoder().encode(`${r}\n`)] }); } catch (e) { out.push({ kind: 'console', t: vt, bytes: [...new TextEncoder().encode(`${String(e?.message ?? e).trim()}\n`)] }); }
    }
    vt = Math.max(vt, box.target());
    pause();
    void ended;
  }
}
