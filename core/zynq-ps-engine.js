// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A Zynq PS's program in a Worker (#4689, part 5b of #4688): its bare-metal C run by the C interpreter on the PS's model
// (core/zynq-ps-sim.js), in lockstep with the System's scheduler through the shared buffer of core/esp32-link.js, as an
// ESP32's MicroPython is (core/esp32-engine.js). The interpreter cannot stop between two steps and go on later, so it
// runs in a Worker of its own and waits there (Atomics) each time its time reaches the scheduler's target: what the
// program did up to then (its UART's bytes, its GPIO's changes) handed over, the next target awaited. Its first command
// holds the program and the PS ({ program: { source, file }, ps }); once the program returned or stopped, each command is
// answered at once. The Workers: web/js/zynq-ps-worker.js (a page's), server/zynq-ps-worker.js (Node's).
//
//   runZynqPsEngine({ sab, ready })   (the Worker's side; the node's: core/system-sim-zynq.js)
//
// Isomorphic ES module, no DOM.
import { mailbox } from './esp32-link.js';
import { simulateC, Stop } from './c-interp.js';
import { psModel } from './zynq-ps-sim.js';

// (the target checked every STEPS steps of the interpreter: a 150 ns grain at 666.7 MHz)
const STEPS = 100;

/** The engine on the shared buffer `sab`; `ready()` once it waits for its first command. */
export function runZynqPsEngine({ sab, ready = () => {} }) {
  const box = mailbox(sab);
  let m = null, vt = 0, target = 0, sent = { bytes: 0, gpio: 0 }, end = null;
  const answer = () => {
    const out = { bytes: m ? m.uart.bytes.slice(sent.bytes) : [], gpio: m ? m.gpio.slice(sent.gpio) : [], baud: m ? m.baud() : null, end };
    if (m) sent = { bytes: m.uart.bytes.length, gpio: m.gpio.length };
    end = null;
    return { vt, out };
  };
  const pause = () => { const cmd = box.handOver(answer()); target = box.target(); return cmd; };
  ready();
  const first = pause();
  try {
    m = psModel(first.ps);
    const clock = { every: STEPS, fn: (steps) => { vt = Math.round(steps * m.cyclePs); while (vt >= target) pause(); } };
    const r = simulateC(String(first.program?.source ?? ''), { file: first.program?.file ?? 'main.c', program: true, mmio: m, clock, maxSteps: Infinity });
    vt = Math.max(vt, Math.round(r.steps * m.cyclePs));
    const error = m.error?.message ?? (r.error ? `${r.error.line ? `line ${r.error.line}: ` : ''}${r.error.message}` : r.ok ? null : r.diagnostics.filter((d) => d.severity === 'error').map((d) => `line ${d.line}: ${d.message}`).join('; '));
    end = error ? { error } : { exit: r.stopped ? null : r.exitCode };
  } catch (e) {
    if (!(e instanceof Stop)) end = { error: e.message };
  }
  for (;;) { vt = Math.max(vt, target); pause(); }
}
