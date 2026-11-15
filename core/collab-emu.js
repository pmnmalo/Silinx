// The Board Emulators a shared project's owner has open, as its followers follow them (#4002, part 4;
// core/collab-activity.js): the channel `emu`, by emulator document (`emulator:<module>[@model]`): its board's switches
// and buttons, on or not, in the board's order; powered or not; running or paused; its clock's rate. A follower's page
// runs its own emulator of the same design with the owner's inputs on it (its own time: the design's outputs follow
// the inputs). Each value as the owner makes it and as a follower takes it (untrusted input: what is not one left out).

/** The limits: the documents, the inputs of a board, the clock's rate (Hz). */
export const EMU_LIMITS = Object.freeze({ docs: 4, inputs: 256, rate: 1e9 });
const DOC_RE = /^emulator:[A-Za-z_][\w$]{0,127}(?:@\w{1,32})?$/;
const speedOk = v => v === 'real' || v === 'max' || (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= EMU_LIMITS.rate);

/** An emulator as its follower gets it: { inputs, powered, running, speed }. */
export const emuDocActivity = ({ inputs = [], powered = false, running = false, speed = 'real' } = {}) =>
  ({ inputs: inputs.slice(0, EMU_LIMITS.inputs).map(Boolean), powered: !!powered, running: !!running, speed: speedOk(speed) ? speed : 'real' });

/** The `emu` value: { docs: { id: emuDocActivity } }, the first EMU_LIMITS.docs emulator documents. */
export function emuActivity(docs, limits = EMU_LIMITS) {
  const out = {};
  for (const [id, v] of docs) if (DOC_RE.test(id) && Object.keys(out).length < limits.docs) out[id] = emuDocActivity(v);
  return { docs: out };
}

/** An `emu` value as a follower takes it (untrusted); null: not one. */
export function followedEmu(v, limits = EMU_LIMITS) {
  if (!v || typeof v !== 'object' || !v.docs || typeof v.docs !== 'object' || Array.isArray(v.docs)) return null;
  const docs = {};
  for (const [id, d] of Object.entries(v.docs).slice(0, limits.docs)) {
    if (!DOC_RE.test(id) || !d || typeof d !== 'object' || !Array.isArray(d.inputs)) continue;
    docs[id] = { inputs: d.inputs.slice(0, limits.inputs).map(x => x === true), powered: d.powered === true, running: d.running === true, speed: speedOk(d.speed) ? d.speed : 'real' };
  }
  return { docs };
}

/** The emulators in words (the MCP's follow_project). */
export function emuLines(v) {
  const e = followedEmu(v);
  if (!e) return [];
  const rate = s => (s === 'real' ? 'real time' : s === 'max' ? 'its maximum speed' : `${s} Hz`);
  return Object.entries(e.docs).map(([id, d]) => `Their Board Emulator ${id.slice(9)}: ${!d.powered ? 'powered off' : d.running ? `running at ${rate(d.speed)}` : 'paused'}, ${d.inputs.filter(Boolean).length} of ${d.inputs.length} switches and buttons on.`);
}
