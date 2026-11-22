// Silinx - a co-design System's run at the other end of a message port (#4701): in a Web Worker, where the compiled
// engine may make its code (the page's Content-Security-Policy runs no eval), as the Board Emulator's engine runs
// (core/emulate-remote.js). The page reads what the run needs (core/system-run.js systemInputs: the plan, the FPGA nodes'
// netlists, the firmware) and drives the run by messages; the host builds it (systemFromInputs) and answers each with
// the run as it is then (systemReport).
//
// The messages, page -> host: init { system, inputs }, run { id, until } (ps), send { node, bytes } (a terminal's line),
// waves { id }; host -> page: ready { nodes, wires } or failed { error }, state { id, report, finished }, waves { id,
// design } (core/system-waves.js), error { id, message }.
//
// Isomorphic ES module, no DOM.
import { systemFromInputs, systemReport } from './system-run.js';
import { systemWaves } from './system-waves.js';

/** The host: a System's run driven by the messages of `port` (a worker's self, a MessagePort). */
export function hostSystemRun(port) {
  let run = null, name = 'system';
  const post = m => port.postMessage(m);
  const handle = {
    init({ system, inputs }) {
      const r = systemFromInputs(system, inputs);
      if (r.error) { run = null; post({ type: 'failed', error: r.error }); return; }
      run = r; name = system.name;
      post({ type: 'ready', nodes: [...r.sim.nodes.keys()], wires: r.wires, terminals: [...r.terminals.keys()] });
    },
    run({ id, until }) {
      if (!run) throw new Error('no System: init first');
      const f = run.sim.run(until);
      post({ type: 'state', id, report: systemReport(run), finished: f.finished });
    },
    send({ node, bytes }) {
      const t = run?.terminals.get(node);
      if (!t) throw new Error(`no terminal '${node}'`);
      t.send(bytes);
    },
    waves({ id }) {
      if (!run) throw new Error('no System: init first');
      post({ type: 'waves', id, design: systemWaves(run.sim, { name }).design, now: run.sim.now });
    },
  };
  const onMessage = e => {
    const m = e.data;
    try { handle[m.type]?.(m); } catch (err) { post({ type: 'error', id: m.id, message: err.message }); }
  };
  if (port.addEventListener) { port.addEventListener('message', onMessage); port.start?.(); } else port.onmessage = onMessage;
}
