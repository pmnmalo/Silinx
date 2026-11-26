// The circuit editor's Try it (#5357, moved from web/js/circuit-editor.js's mountCircuitEditor as it was): the circuit's
// live simulation (core/circuit-sim.js) started, run after each of its inputs set, stopped; its clock sources ticking in
// real time while the circuit is seen; its messages (a short, an oscillation, a servo's pulses) in the console; shared
// live as its steps (web/js/collab-try.js, #4244).
import { adoptOps, recordCircuit, replayCircuit, replayPlan, tryOps } from '/core/collab-try.js';
import { checkCircuit } from '/core/circuit-check.js';
import { createCircuitSim, runMessages } from '/core/circuit-sim.js';
import { intervalWhileSeen } from './when-hidden.js';
import { encoderTurn, ENCODER_STEP_NS } from '/core/circuit-encoder.js';
import { isAnalogCircuit } from '/core/circuit-analog.js';
import { createScopeRecorder, scopeSettings } from '/core/circuit-scope.js';
import { TIMEBASES, VSCALES, TRIGGER_MODES } from '/core/scope.js';

/**
 * Its Try it: ctx { M() (the circuit), opts (the editor's: hdl), root, status(msg, err), render(), destroyed() }; returns
 * { sim() (the simulation, or null), startSim, stopSim, stopTicks, setInput, runSim, tryState, setTryState, toggleSim, turn(id,
 * dir) (an encoder's detent, #5451), detents() (its turns), scopes() (each oscilloscope's screen, settings and cursors,
 * #5383), scopeInput(id, input, at) (a knob of its, a click on its screen at `at`, 0 to 1) }.
 */
export function mountCircuitTry({ M, opts, root, status, render, destroyed }) {
  let sim = null, steps = null, saidServo = 0, detents = {};
  let ticks = [];                       // the clocks' timers while trying it (each ticking at its frequency, in real time)
  let wakeTimer = null, seen = 0;       // (a device's own wake-up, its timer; the real time last caught up with, #5456)
  let rec = null, views = {};           // (the oscilloscopes' recording, and each one's settings and cursors while trying it, #5383)
  // a simulation of the circuit, its oscilloscopes recording it
  function makeSim() {
    rec = createScopeRecorder(M());
    views = Object.fromEntries(rec.scopes.map((s) => [s.id, { settings: scopeSettings(s.part), cursors: [] }]));
    let made = null;
    made = createCircuitSim(M(), { runner: opts.hdl?.()?.runner, onUpdate: (t) => made && rec.sample(made, t) });
    rec.sample(made, made.time);
    return made;
  }
  function startSim() {
    const errs = checkCircuit(M(), undefined, opts.hdl?.() ?? {}).filter((d) => d.severity === 'error');
    if (errs.length) { status(`The circuit cannot be simulated: ${errs.map((d) => d.message).join('; ')}`, true); stopSim(); return; }
    stopTicks();
    sim = makeSim();
    saidServo = 0; seen = performance.now();
    recordCircuit(sim, steps = tryOps(null));   // (its steps, as live sharing sends them, #4244)
    runSim();
    // (a clock source flips its level every half period, in real time; the simulated time moves on by as much; held
    // while the circuit is not seen, its time standing still, and on again with no burst of ticks, #5276)
    ticks = M().parts.filter((p) => p.type === 'clock').map((p) => intervalWhileSeen(root, 500 / (p.hz || 1), () => {
      if (!sim || destroyed()) return;
      if (timed()) catchUp(); else sim.advance(5e8 / (p.hz || 1));   // (its real time, with a sensor that keeps time)
      setInput(p.id, !sim.inputs()[p.id]);
    }));
    // (an oscilloscope's screen, #5383: in real time, twenty times a second)
    // (an analog circuit's own steps redraw it already)
    if (rec.scopes.length && !sim.analog) ticks.push(intervalWhileSeen(root, 50, () => { if (!sim || destroyed()) return; catchUp(); render(); }));
  }
  function stopTicks() { for (const t of ticks) t.stop(); ticks = []; clearTimeout(wakeTimer); wakeTimer = null; }
  // (a device that keeps time, #5456: an ultrasonic sensor, a motion sensor (#5463), a DHT (#5470), a stepper motor
  // (#5476); the simulated time follows the real one, at most a second at a time, so that a trigger pressed by hand lasts
  // what it lasted; its wake-ups reached in real time)
  // (an analog circuit, its capacitors charging, #5382; an oscilloscope's, #5383)
  const timed = () => M().parts.some((p) => ['hc-sr04', 'hc-sr501', 'dht11', 'dht22', 'stepper-28byj48', 'oscilloscope'].includes(p.type)) || isAnalogCircuit(M());
  function catchUp() {
    // (an analog circuit, an oscilloscope: a tenth of a second at a time, slower than real time rather than falling behind)
    const t = performance.now(), ns = Math.min(sim?.analog || rec?.scopes.length ? 1e8 : 1e9, Math.round((t - seen) * 1e6));
    seen = t;
    if (ns > 0 && timed()) sim.advance(ns);
  }
  function pumpWakes() {
    clearTimeout(wakeTimer); wakeTimer = null;
    const at = sim?.nextWake();
    if (at == null) return;
    // (an analog circuit's steps, #5382: in real time, a frame at a time)
    if (sim.analog) { wakeTimer = setTimeout(() => { wakeTimer = null; if (!sim || destroyed()) return; catchUp(); runSim(); }, Math.min(40, Math.max(1, (at - sim.time) / 1e6))); return; }
    wakeTimer = setTimeout(() => { wakeTimer = null; if (!sim || destroyed()) return; seen = performance.now(); sim.advance(Math.max(0, at - sim.time)); runSim(); }, Math.max(1, (at - sim.time) / 1e6));
  }
  // a rotary encoder turned a detent (`dir` 1 clockwise, -1 anticlockwise, #5451): its quadrature a quarter at a time, the
  // simulated time moving on between them, its knob's detents counted
  function turn(id, dir) {
    for (const [a, b] of encoderTurn(dir)) { sim.set(id, a, 0); sim.set(id, b, 1); sim.advance(ENCODER_STEP_NS); }
    detents[id] = (detents[id] ?? 0) + dir;
    runSim();
  }
  // one of a part's inputs set while trying it, then run
  function setInput(id, v, index = 0) { catchUp(); sim.set(id, v, index); runSim(); }
  function runSim() {
    const r = sim.run();
    for (const line of runMessages(sim, r)) status(line.replace(/^(ERROR|WARNING): /, ''), true);
    // (a servo's pulses that are no servo's, #5347: once each)
    const ws = sim.servoWarnings();
    for (const w of ws.slice(saidServo)) status(w, true);
    saidServo = ws.length;
    pumpWakes();
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
    if (plan.restart) recordCircuit(sim = makeSim(), steps = tryOps(null));
    replayCircuit(sim, plan.ops);
    adoptOps(steps, o);
    runSim();
    return plan;
  }
  function toggleSim() { if (sim) stopSim(); else startSim(); }
  // an oscilloscope while trying it (#5383): each one's screen now
  function scopes() {
    if (!sim || !rec) return null;
    return Object.fromEntries(rec.scopes.map((s) => [s.id, { ...views[s.id], screen: rec.screen(s.id, views[s.id].settings, sim.time * 1e-9) }]));
  }
  // a knob of its (its time base, its scale, its trigger's source, edge, level and mode), or a click on its screen (a cursor)
  function scopeInput(id, input, at = 0) {
    const v = views[id];
    if (!v) return;
    const st = v.settings, step = (list, x, d) => list[Math.min(list.length - 1, Math.max(0, list.indexOf(x) + d))];
    if (input === 'scope-t-up' || input === 'scope-t-down') { st.tdiv = step(TIMEBASES, st.tdiv, input === 'scope-t-up' ? 1 : -1); v.cursors = []; }
    else if (input === 'scope-v-up' || input === 'scope-v-down') st.vdiv = step(VSCALES, st.vdiv, input === 'scope-v-up' ? 1 : -1);
    else if (input === 'scope-l-up' || input === 'scope-l-down') st.level = Math.round((st.level + (input === 'scope-l-up' ? 0.1 : -0.1)) * 100) / 100;
    else if (input === 'scope-source') st.source = st.source === 1 ? 2 : 1;
    else if (input === 'scope-edge') st.edge = st.edge === 'rise' ? 'fall' : 'rise';
    else if (input === 'scope-mode') st.mode = TRIGGER_MODES[(TRIGGER_MODES.indexOf(st.mode) + 1) % TRIGGER_MODES.length];
    else if (input === 'scope-screen') v.cursors = [...(v.cursors.length >= 2 ? [] : v.cursors), Math.min(1, Math.max(0, at)) * st.tdiv * 10];
    if (input !== 'scope-screen') rec.rearm(id);
    render();
  }


  return { sim: () => sim, startSim, stopSim, stopTicks, setInput, runSim, tryState, setTryState, toggleSim, turn, detents: () => (sim ? detents : null), scopes, scopeInput };
}
