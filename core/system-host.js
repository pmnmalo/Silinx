// Silinx - a co-design System's run at the other end of a message port (#4701): in a Web Worker, where the compiled
// engine may make its code (the page's Content-Security-Policy runs no eval), as the Board Emulator's engine runs
// (core/emulate-remote.js). The page reads what the run needs (core/system-run.js systemInputs: the plan, the FPGA nodes'
// netlists, the firmware) and drives the run by messages; the host builds it (systemFromInputs) and answers each with
// the run as it is then (systemReport).
//
// The messages, page -> host: init { system, inputs, emulate }, run { id, until } (ps), send { node, bytes } (a
// terminal's line), set { node, pin, value } (a board's switch or button, the System Emulator's), waves { id }; host ->
// page: ready { nodes, wires, terminals, boards } or failed { error }, state { id, report, finished, boards }, waves
// { id, design } (core/system-waves.js), error { id, message }. emulate: the boards emulated too (core/system-emu.js,
// #5212): `ready`'s boards, each state's what they show since the last.
//
// Isomorphic ES module, no DOM.
import { systemFromInputs, systemReport } from './system-run.js';
import { systemWaves } from './system-waves.js';
import { emulationBoards, withBoards, watchBoards, boardStates, setBoardInput } from './system-emu.js';

/** The host: a System's run driven by the messages of `port` (a worker's self, a MessagePort). */
export function hostSystemRun(port) {
  let run = null, name = 'system', boards = null, shown = 0, prev = {};
  const post = m => port.postMessage(m);
  const handle = {
    init({ system, inputs, emulate = false }) {
      boards = emulate ? emulationBoards(system, inputs) : null;
      const r = systemFromInputs(system, boards ? withBoards(inputs, boards) : inputs);
      if (r.error) { run = null; post({ type: 'failed', error: r.error }); return; }
      run = r; name = system.name; shown = 0; prev = {};
      if (boards) watchBoards(r.sim, boards);
      post({ type: 'ready', nodes: [...r.sim.nodes.keys()], wires: r.wires, terminals: [...r.terminals.keys()],
        boards: boards && boards.map(b => ({ id: b.id, kind: b.kind, board: b.kind === 'fpga' ? b.board.board.id : b.board.id, variant: b.board.variant?.id ?? null, inputs: b.inputs ?? [], outputs: b.outputs })) });
    },
    run({ id, until }) {
      if (!run) throw new Error('no System: init first');
      const f = run.sim.run(until);
      const shows = boards ? (prev = boardStates(run.sim, boards, shown, run.sim.now, prev)) : undefined;
      shown = run.sim.now;
      post({ type: 'state', id, report: systemReport(run), finished: f.finished, boards: shows });
    },
    set({ node, pin, value }) {
      const b = boards?.find(x => x.id === node);
      if (!b || b.kind !== 'fpga') throw new Error(`no board of an FPGA node '${node}'`);
      setBoardInput(run.sim, b, pin, value);
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
