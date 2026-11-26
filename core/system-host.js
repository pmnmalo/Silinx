// Silinx - a System's run at the other end of a message port (#4701): in a Web Worker, where the compiled
// engine may make its code (the page's Content-Security-Policy runs no eval), as the Board Emulator's engine runs
// (core/emulate-remote.js). The page reads what the run needs (core/system-run.js systemInputs: the plan, the FPGA nodes'
// netlists, the firmware) and drives the run by messages; the host builds it (systemFromInputs) and answers each with
// the run as it is then (systemReport).
//
// The messages, page -> host: init { system, inputs, emulate, stimulus } (its stimulus file's, #5581: core/system-stimulus.js), run { id, until } (ps), send { node, bytes } (a
// terminal's line), set { node, pin, value } (a board's switch or button, a circuit's, #5322: the System Emulator's), waves { id }; host ->
// page: ready { nodes, wires, terminals, boards } or failed { error }, state { id, report, finished, boards }, waves
// { id, design } (core/system-waves.js), error { id, message }. emulate: the boards emulated too (core/system-emu.js,
// #5212): `ready`'s boards, each state's what they show since the last.
//
// Isomorphic ES module, no DOM.
import { systemFromInputs, systemReport, loadEngines, disposeSystem } from './system-run.js';
import { systemWaves } from './system-waves.js';
import { emulationBoards, withBoards, watchBoards, boardStates, setBoardInput } from './system-emu.js';
import { setsControls, stimulusSteps, runSteps } from './system-stimulus.js';

/** The host: a System's run driven by the messages of `port` (a worker's self, a MessagePort). */
export function hostSystemRun(port) {
  let run = null, name = 'system', boards = null, shown = 0, prev = {}, steps = [];
  const post = m => port.postMessage(m);
  const handle = {
    init({ system, inputs, emulate = false, stimulus = null }) {
      disposeSystem(run);   // (the last run's resources: an ESP32's Worker, #5495)
      // (a stimulus that sets a board's controls: the boards emulated, #5581)
      boards = emulate || setsControls(stimulus) ? emulationBoards(system, inputs) : null;
      const r = systemFromInputs(system, boards ? withBoards(inputs, boards) : inputs);
      if (r.error) { run = null; post({ type: 'failed', error: r.error }); return; }
      try { steps = stimulus ? stimulusSteps(stimulus, { boards: boards || [], terminals: [...r.terminals.keys()] }) : []; }
      catch (e) { run = null; post({ type: 'failed', error: `its stimulus file: ${e.message}` }); return; }
      run = r; name = system.name; shown = 0; prev = {};
      if (boards) watchBoards(r.sim, boards);
      post({ type: 'ready', nodes: [...r.sim.nodes.keys()], wires: r.wires, terminals: [...r.terminals.keys()],
        boards: boards && boards.map(b => (b.kind === 'circuit' ? { id: b.id, kind: b.kind, inputs: b.inputs, outputs: [] }
          : { id: b.id, kind: b.kind, board: b.kind === 'fpga' ? b.board.board.id : b.board.id, variant: b.board.variant?.id ?? null, inputs: b.inputs ?? [], outputs: b.outputs })) });
    },
    run({ id, until }) {
      if (!run) throw new Error('no System: init first');
      const f = runSteps(run, steps, until);   // (its stimulus's steps due on the way, #5581)
      const shows = boards ? (prev = boardStates(run.sim, boards, shown, run.sim.now, prev)) : undefined;
      shown = run.sim.now;
      post({ type: 'state', id, report: systemReport(run), finished: f.finished, boards: shows });
    },
    set({ node, pin, value }) {
      const b = boards?.find(x => x.id === node);
      if (!b || (b.kind === 'mcu' && b.arch !== 'pic24')) throw new Error(`no board of an FPGA node, a circuit or an Explorer 16/32 '${node}'`);
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
  const dispatch = m => { try { handle[m.type]?.(m); } catch (err) { post({ type: 'error', id: m.id, message: err.message }); } };
  // (a System's microcontrollers' engines loaded before its init, the messages after it waiting for them: a Pico's
  // rp2040js and firmware, #5494)
  let gate = null;
  const onMessage = e => {
    const m = e.data;
    if (m.type === 'init') gate = (gate || Promise.resolve()).then(() => loadEngines(m.system)).then(() => null, err => err.message);
    if (!gate) { dispatch(m); return; }
    gate = gate.then(failed => {
      if (m.type === 'init' && failed) { run = null; post({ type: 'failed', error: failed }); return failed; }
      dispatch(m);
      return null;
    });
  };
  if (port.addEventListener) { port.addEventListener('message', onMessage); port.start?.(); } else port.onmessage = onMessage;
}
