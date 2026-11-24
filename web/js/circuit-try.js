// The circuit editor's Try it (#5357, moved from web/js/circuit-editor.js's mountCircuitEditor as it was): the circuit's
// live simulation (core/circuit-sim.js) started, run after each of its inputs set, stopped; its clock sources ticking in
// real time while the circuit is seen; its messages (a short, an oscillation, a servo's pulses) in the console; shared
// live as its steps (web/js/collab-try.js, #4244).
import { adoptOps, recordCircuit, replayCircuit, replayPlan, tryOps } from '/core/collab-try.js';
import { checkCircuit } from '/core/circuit-check.js';
import { createCircuitSim, runMessages } from '/core/circuit-sim.js';
import { intervalWhileSeen } from './when-hidden.js';
import { encoderTurn, ENCODER_STEP_NS } from '/core/circuit-encoder.js';

/**
 * Its Try it: ctx { M() (the circuit), opts (the editor's: hdl), root, status(msg, err), render(), destroyed() }; returns
 * { sim() (the simulation, or null), startSim, stopSim, stopTicks, setInput, runSim, tryState, setTryState, toggleSim, turn(id,
 * dir) (an encoder's detent, #5451), detents() (its turns) }.
 */
export function mountCircuitTry({ M, opts, root, status, render, destroyed }) {
  let sim = null, steps = null, saidServo = 0, detents = {};
  let ticks = [];                       // the clocks' timers while trying it (each ticking at its frequency, in real time)
  function startSim() {
    const errs = checkCircuit(M(), undefined, opts.hdl?.() ?? {}).filter((d) => d.severity === 'error');
    if (errs.length) { status(`The circuit cannot be simulated: ${errs.map((d) => d.message).join('; ')}`, true); stopSim(); return; }
    stopTicks();
    sim = createCircuitSim(M(), { runner: opts.hdl?.()?.runner });
    saidServo = 0;
    recordCircuit(sim, steps = tryOps(null));   // (its steps, as live sharing sends them, #4244)
    runSim();
    // (a clock source flips its level every half period, in real time; the simulated time moves on by as much; held
    // while the circuit is not seen, its time standing still, and on again with no burst of ticks, #5276)
    ticks = M().parts.filter((p) => p.type === 'clock').map((p) => intervalWhileSeen(root, 500 / (p.hz || 1), () => {
      if (!sim || destroyed()) return;
      sim.advance(5e8 / (p.hz || 1));
      setInput(p.id, !sim.inputs()[p.id]);
    }));
  }
  function stopTicks() { for (const t of ticks) t.stop(); ticks = []; }
  // a rotary encoder turned a detent (`dir` 1 clockwise, -1 anticlockwise, #5451): its quadrature a quarter at a time, the
  // simulated time moving on between them, its knob's detents counted
  function turn(id, dir) {
    for (const [a, b] of encoderTurn(dir)) { sim.set(id, a, 0); sim.set(id, b, 1); sim.advance(ENCODER_STEP_NS); }
    detents[id] = (detents[id] ?? 0) + dir;
    runSim();
  }
  // one of a part's inputs set while trying it, then run
  function setInput(id, v, index = 0) { sim.set(id, v, index); runSim(); }
  function runSim() {
    const r = sim.run();
    for (const line of runMessages(sim, r)) status(line.replace(/^(ERROR|WARNING): /, ''), true);
    // (a servo's pulses that are no servo's, #5347: once each)
    const ws = sim.servoWarnings();
    for (const w of ws.slice(saidServo)) status(w, true);
    saidServo = ws.length;
    render();
  }
  function stopSim() { stopTicks(); sim = null; steps = null; detents = {}; render(); }
  // (shared live, #4244, web/js/collab-try.js: the owner's Try it as its steps, replayed by its follower, its own clocks
  // stopped: the owner's ticks are among them)
  function tryState() {
    if (!sim || !steps) return null;
    const lv = (v) => (Array.isArray(v) ? v.map((x) => (x ? '1' : '0')).join('') : v ? '1' : '0');
    return { kind: 'circ', sum: { state: null, steps: steps.n, inputs: Object.fromEntries(Object.entries(sim.inputs()).slice(0, 64).map(([k, v]) => [k, lv(v)])), outputs: sim.outputs() }, ...steps.wire() };
  }
  function setTryState(o, applied) {
    if (!o) { if (sim) stopSim(); return null; }
    if (!sim) startSim();
    if (!sim) return null;
    stopTicks();
    const plan = replayPlan(applied, o);
    if (plan.restart) recordCircuit(sim = createCircuitSim(M(), { runner: opts.hdl?.()?.runner }), steps = tryOps(null));
    replayCircuit(sim, plan.ops);
    adoptOps(steps, o);
    runSim();
    return plan;
  }
  function toggleSim() { if (sim) stopSim(); else startSim(); }


  return { sim: () => sim, startSim, stopSim, stopTicks, setInput, runSim, tryState, setTryState, toggleSim, turn, detents: () => (sim ? detents : null) };
}
