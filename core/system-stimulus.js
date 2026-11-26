// Silinx - a System's stimulus file (#5581's part 3, docs/SYSTEMS.md): what Simulate System does to the System at its
// times, so that a run is repeatable: its controls (the MCP simulate's: a board's switch or button, a circuit's part, an
// Explorer 16/32's button or R6, core/system-controls.js) and the text typed into its terminals. A file of the project,
// `<name>.stim.json`, named by the project's Simulation Properties (silinx.json's system.simulate.stimulus):
//
//   { format: 'silinx-stimulus', version: 1,
//     controls: [{ node, control, on | value, at_ns }],
//     type: [{ terminal, text, at_ns }] }
//
// Its steps are set in the run as it goes (runSteps): the run to each step's time, the step, then on. Isomorphic module.
import { controlSteps } from './system-controls.js';
import { setBoardInput } from './system-emu.js';

export const STIMULUS_FORMAT = 'silinx-stimulus';
const STIMULUS_VERSION = 1;

/** Whether the path is a stimulus file's. */
export const isStimulusFile = p => /\.stim\.json$/i.test(String(p));

/** A new stimulus file's text: no control, nothing typed. */
export const newStimulus = () => `${JSON.stringify({ format: STIMULUS_FORMAT, version: STIMULUS_VERSION, controls: [], type: [] }, null, 2)}\n`;

/** A stimulus file's text read: { stimulus: { controls, type } } or { error }. */
export function readStimulus(text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { return { error: `not JSON: ${e.message}` }; }
  if (m?.format !== STIMULUS_FORMAT) return { error: `not a stimulus file (its format is not '${STIMULUS_FORMAT}')` };
  if (m.version !== STIMULUS_VERSION) return { error: `a stimulus file of version ${m.version}: this Silinx reads version ${STIMULUS_VERSION}` };
  for (const k of ['controls', 'type']) if (m[k] != null && !Array.isArray(m[k])) return { error: `${k}: a list` };
  return { stimulus: { controls: m.controls || [], type: m.type || [] } };
}

/** Whether the stimulus sets a board's control (the boards emulated then: core/system-emu.js). */
export const setsControls = s => !!s?.controls?.length;

/**
 * The stimulus's steps by time: [{ t (ps), set: { b, pin, on } } | { t, type: { node, bytes } }]. `boards` the run's
 * emulated boards (emulationBoards'; none: no control may be set), `terminals` its terminals' ids, `end` the run's time
 * (ps; Infinity: none). Throws an Error naming the step that cannot be.
 */
export function stimulusSteps(s, { boards = [], terminals = [], end = Infinity } = {}) {
  const sets = controlSteps(boards, s?.controls, end).map(c => ({ t: c.t, set: { b: c.b, pin: c.pin, on: c.on } }));
  const types = (s?.type || []).map((x, i) => {
    if (!terminals.includes(x?.terminal)) throw new Error(`type[${i}]: no terminal '${x?.terminal}' in the System (${terminals.join(', ') || 'none'})`);
    if (typeof x.text !== 'string') throw new Error(`type[${i}]: its text, a string`);
    const t = Number(x.at_ns ?? 0) * 1e3;
    if (!(t >= 0) || t > end) throw new Error(`type[${i}]: at_ns from 0 to the run's time`);
    return { t, type: { node: x.terminal, bytes: [...new TextEncoder().encode(x.text)] } };
  });
  return [...sets, ...types].sort((a, b) => a.t - b.t);
}

/** The run (systemFromInputs's: { sim, terminals }) to `until` (ps), the steps due on the way set at their times (each
 *  taken from `steps`, in order). Returns the run's last result; a promise of it when a node runs asynchronously (an
 *  ESP32's JSPI back end, #5658: the scheduler's runAsync). */
export function runSteps(run, steps, until) {
  if (run.sim.async) return runStepsAsync(run, steps, until);
  while (steps.length && steps[0].t <= until) {
    const s = steps.shift();
    if (s.t > run.sim.now) run.sim.run(s.t);
    if (s.set) setBoardInput(run.sim, s.set.b, s.set.pin, s.set.on);
    else run.terminals.get(s.type.node).send(s.type.bytes);
  }
  return run.sim.run(until);
}

async function runStepsAsync(run, steps, until) {
  while (steps.length && steps[0].t <= until) {
    const s = steps.shift();
    if (s.t > run.sim.now) await run.sim.runAsync(s.t);
    if (s.set) setBoardInput(run.sim, s.set.b, s.set.pin, s.set.on);
    else run.terminals.get(s.type.node).send(s.type.bytes);
  }
  return run.sim.runAsync(until);
}
