// The MCP server's simulate_drawing of a digital circuit (server/mcp-simulate-drawing.js, #3897, docs/CIRCUITS.md), as
// its editor's Try it runs it (core/circuit-sim.js): from time 0, its switches as saved and its buttons released;
// per step, its inputs set by their ports' names (a switch, a button, a DIP switch's lever <label>_<k>, a clock's level:
// one not given keeps its place, as on the bench), then the circuit run until it is quiet (at most 1 µs); the lamps (an
// LED, a display's segments, an LED bar's lights: their ports), the logic probes' levels, the time, the shorts and an
// oscillation, as the console says.
import { toolError } from './mcp-util.js';

/** The steps of a circuit `m` (its JSON) simulated: { lines, rows, warnings }. */
export async function simulateCircuitFile(m0, steps, base) {
  const { normalizeCircuit, circuitPorts } = await import('../core/circuit.js');
  const { circuitErrors } = await import('../core/circuit-check.js');
  const { createCircuitSim, runMessages } = await import('../core/circuit-sim.js');
  const m = normalizeCircuit(m0);
  const errs = circuitErrors(m);
  if (errs.length) throw toolError([...errs.map((d) => `ERROR: ${d.message}`), 'Correct the errors of the circuit to simulate it.'].join('\n'));
  if (!Array.isArray(steps) || !steps.length) throw toolError('cycles: one object per step, its switches and buttons by their labels, e.g. [{ "a": 1 }, { "a": 0, "b": 1 }]');
  const { inputs } = circuitPorts(m);
  const at = (i) => { const v = sim.inputs()[i.part]; return (Array.isArray(v) ? v[i.index] : v) ? 1 : 0; };
  const byName = new Map(inputs.map((x) => [x.name.toLowerCase(), x]));
  const sim = createCircuitSim(m);
  const leds = () => sim.outputs();
  const lines = [`${base} from time 0, ${steps.length} step(s):`], rows = [], warnings = [];
  const first = sim.run();
  const note = (r) => { const w = runMessages(sim, r); warnings.push(...w); return w; };
  // (the logic probes' levels, by label or id: 0, 1, Z open, X; said when the circuit has any, #3900)
  const probeName = new Map(m.parts.filter((p) => p.type === 'probe').map((p) => [p.id, p.label || p.id]));
  const probes = () => Object.fromEntries(Object.entries(sim.probes()).map(([id, v]) => [probeName.get(id), v]));
  const probeText = () => (probeName.size ? `; probes ${Object.entries(probes()).map(([k, v]) => `${k}=${v}`).join(' ')}` : '');
  lines.push(`start: t = ${first.time} ns; LEDs ${Object.entries(leds()).map(([k, v]) => `${k}=${v}`).join(' ') || 'none'}${probeText()}`, ...note(first));
  for (const [k, step] of steps.entries()) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) throw toolError(`step ${k}: an object of inputs ({ name: 0 | 1 })`);
    for (const [n, v] of Object.entries(step)) {
      const x = byName.get(n.toLowerCase());
      if (!x) throw toolError(`step ${k}: '${n}' is not an input of the circuit (its inputs: ${inputs.map((i) => i.name).join(', ') || 'none'})`);
      if (![0, 1, '0', '1'].includes(v)) throw toolError(`step ${k}: ${n} = ${JSON.stringify(v)}: 0 or 1`);
      sim.set(x.part, String(v) === '1', x.index);
    }
    const r = sim.run();
    const outs = leds();
    lines.push(`step ${k}: inputs ${inputs.map((i) => `${i.name}=${at(i)}`).join(' ') || 'none'}; t = ${r.time} ns${r.quiet ? '' : ' (still changing)'}; LEDs ${Object.entries(outs).map(([a, b]) => `${a}=${b}`).join(' ') || 'none'}${probeText()}`, ...note(r));
    rows.push({ step: k, time: r.time, quiet: r.quiet, inputs: Object.fromEntries(inputs.map((i) => [i.name, at(i)])), leds: Object.fromEntries(Object.entries(outs).map(([a, b]) => [a, Number(b)])), ...(probeName.size ? { probes: probes() } : {}) });
  }
  return { lines, rows, warnings };
}
