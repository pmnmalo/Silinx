// The MCP server's simulate_drawing (server/mcp.js, #2674, #2880): a state machine's drawing stepped clock edge by clock
// edge from its reset, as its editor's Try it panel steps it, through the same functions: an ASM chart's
// (core/asm-sim.js: its state, the path taken through its decisions, its Moore and Mealy outputs, its registers, the
// next state) and a state diagram's (core/fsm.js stepFsm: its state, the transition taken, its outputs, the next state);
// a schematic's, Try it's live simulation (server/mcp-simulate-schematic.js, #3827); a circuit's, its Try it
// (server/mcp-simulate-circuit.js, #3897). A drawing that cannot be simulated
// says why, as the panel does in the console.
import { clip, toolError, STR, PROJECT, projectText } from './mcp-util.js';

const MAX_CYCLES = 1000;

/** The cycles' inputs checked against the drawing's: { name: BigInt } per cycle (an input not given: 0, as the panel's). */
function inputsOf(cycles, ins) {
  if (!Array.isArray(cycles) || !cycles.length) throw toolError('cycles: one object of inputs per clock cycle, e.g. [{ "go": 1 }, { "go": 0 }]');
  if (cycles.length > MAX_CYCLES) throw toolError(`cycles: at most ${MAX_CYCLES} cycles`);
  return cycles.map((c, k) => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw toolError(`cycle ${k}: an object of inputs ({ name: value })`);
    for (const n of Object.keys(c)) if (!ins.some((i) => i.name === n)) throw toolError(`cycle ${k}: '${n}' is not an input (the inputs: ${ins.map((i) => i.name).join(', ') || 'none'})`);
    return Object.fromEntries(ins.map((i) => {
      const v = c[i.name] ?? 0;
      let b;
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0) b = BigInt(v);
      else if (typeof v === 'string' && /^[01]+$/.test(v)) b = BigInt(`0b${v}`);
      else throw toolError(`cycle ${k}: ${i.name} = ${JSON.stringify(v)}: a non-negative integer or binary digits ("0101")`);
      if (b >= 1n << BigInt(i.width)) throw toolError(`cycle ${k}: ${i.name} = ${v} does not fit in ${i.width} bit(s)`);
      return [i.name, b];
    }));
  });
}

const bitsText = (v, w) => (w === 1 ? String(v) : v.toString(2).padStart(w, '0'));
// (a state diagram's output with a don't care, #4891: its bits, X, by `xBits`, core/fsm-value.js's)
const pairs = (list, vals, xs = {}, xBits = null) => list.map((x) => `${x.name}=${xs[x.name] ? xBits(vals[x.name], xs[x.name], x.width) : bitsText(vals[x.name], x.width)}`).join(' ') || 'none';

async function simulateAsmFile(m, cycles, base) {
  const { prepareAsmSim, asmSimReset, asmSimStep, asmSimValue } = await import('../core/asm-sim.js');
  const r = prepareAsmSim(m);
  if (r.errors) throw toolError(['The chart cannot be simulated: correct its errors first', ...r.errors.map((d) => `ERROR: ${d.message}`)].join('\n'));
  const { sim } = r;
  const ins = [...sim.m.inputs, { name: sim.m.reset.name, width: 1 }];
  const vectors = inputsOf(cycles, ins);
  const off = sim.m.reset.active === 'high' ? 0n : 1n;
  const node = (id) => sim.a.idx.nodes.get(id);
  const edge = new Map(sim.m.edges.map((e) => [e.id, e]));
  // the path, as the chart shows it: each decision with the exit taken, each case with its exit, each conditional output reached
  const pathText = (p) => p.edges.map((id) => {
    const e = edge.get(id), n = node(e.from);
    if (n.type === 'decision') return `${n.cond} → ${e.port === 'true' ? 1 : 0}`;
    if (n.type === 'case') return `${n.expr} → ${e.port}`;
    if (n.type === 'output') return `[${n.actions.join(', ')}]`;
    return null;
  }).filter(Boolean).join(', ');
  let st = asmSimReset(sim);
  const lines = [`${base} from its reset, ${vectors.length} clock cycle(s):`];
  const rows = vectors.map((v, k) => {
    const given = cycles[k][sim.m.reset.name] == null ? { ...v, [sim.m.reset.name]: off } : v;
    const x = asmSimStep(sim, st, given);
    const c = x.cycle;
    const path = pathText(c.path);
    lines.push(`cycle ${k}: state ${node(c.state).name}${c.reset ? ' (reset)' : ''}; inputs ${pairs(ins, given)}; outputs ${pairs(sim.m.outputs, c.outputs)}`
      + `${sim.regs.length ? `; registers ${pairs(sim.regs, c.st.regs)}` : ''}${path ? `; path ${path}` : ''}; next state ${node(x.st.state).name}`);
    st = x.st;
    const json = (o) => Object.fromEntries(Object.entries(o).map(([n, val]) => [n, asmSimValue(val)]));
    return { cycle: k, state: node(c.state).name, inputs: json(given), outputs: json(c.outputs), registers: json(c.st.regs), next: node(x.st.state).name,
      path: { nodes: c.path.nodes, edges: c.path.edges, outputs: c.path.outputs }, blocks: c.blocks.map((b) => ({ id: b.id, nodes: b.nodes, edges: b.edges, outputs: b.outputs })) };
  });
  return { lines, rows };
}

async function simulateFsmFile(m0, cycles, base) {
  const { fsmErrors, normalizeFsm, stepFsm } = await import('../core/fsm.js');
  const { bitsText: xBits } = await import('../core/fsm-value.js');
  const width = (n) => m.outputs.find((o) => o.name === n)?.width ?? 1;
  const m = normalizeFsm(m0);
  const errs = fsmErrors(m);
  if (errs.length) throw toolError([...errs.map((d) => `ERROR: ${d.message}`), 'Correct the errors of the diagram to simulate it.'].join('\n'));
  const vectors = inputsOf(cycles, m.inputs);
  const name = (id) => m.states.find((s) => s.id === id)?.name ?? '?';
  let st = m.initial;
  const lines = [`${base} from its reset, ${vectors.length} clock cycle(s):`];
  const rows = vectors.map((v, k) => {
    const r = stepFsm(m, st, v);
    lines.push(`cycle ${k}: state ${name(st)}; inputs ${pairs(m.inputs, v)}; outputs ${pairs(m.outputs, r.outputs, r.xs, xBits)}; ${r.transition ? `transition ${r.transition}` : 'no transition is true'}; next state ${name(r.next)}`);
    const row = { cycle: k, state: name(st), inputs: Object.fromEntries(Object.entries(v).map(([n, x]) => [n, Number(x)])),
      // (an output with a don't care, #4891: its bits, X, as text)
      outputs: Object.fromEntries(Object.entries(r.outputs).map(([n, x]) => [n, r.xs[n] ? xBits(x, r.xs[n], width(n)) : Number(x)])), transition: r.transition, next: name(r.next) };
    st = r.next;
    return row;
  });
  return { lines, rows };
}

export const SIMULATE_DRAWING_TOOLS = [
  {
    name: 'simulate_drawing', title: 'Simulate a drawing (a state machine, a schematic, a circuit)',
    description: 'Step a drawing as its editor\'s Try it panel does. An ASM chart (.asm.json) or state diagram (.fsm.json): clock edge by edge from its reset, one object of inputs per cycle (an input not given is 0; an ASM chart\'s reset inactive); per cycle the state, inputs, outputs (a don\'t care as bits, "1X0"), an ASM chart\'s registers and path, and the next state. A schematic (.sch.json), with the project\'s modules: its input markers set (clocks not given cycled once), then its outputs and every instance\'s pins. A circuit (.circ.json), from time 0: per step its switches and buttons set by label, run until quiet (≤ 1 µs): time, LEDs, probes, shorts, oscillation. A drawing with errors: its errors.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, file: STR('The drawing, a path in the project (src/ctl.asm.json).'),
      cycles: { type: 'array', maxItems: MAX_CYCLES, items: { type: 'object', additionalProperties: { type: ['integer', 'string'] } }, description: 'Each clock cycle\'s inputs (a circuit: each step) from reset: { name: value }, an integer ≥ 0 or binary digits; a circuit\'s 0 or 1 (one not given kept); a sensor by id (°C, cm), after_us: µs waited.' },
    }, required: ['project', 'file', 'cycles'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, file, cycles }) {
      const asm = /\.asm\.json$/i.test(file), fsm = /\.fsm\.json$/i.test(file), sch = /\.sch\.json$/i.test(file), circ = /\.circ\.json$/i.test(file);
      if (!asm && !fsm && !sch && !circ) throw toolError(`'${file}' is not an ASM chart, a state diagram, a schematic or a circuit (.asm.json, .fsm.json, .sch.json, .circ.json)`);
      if (sch) {
        const { simulateSchematicFile } = await import('./mcp-simulate-schematic.js');
        const { lines, rows, warnings } = await simulateSchematicFile(name, file, cycles, file.split('/').pop(), inputsOf);
        return { text: clip([...warnings.map((w) => `WARNING: ${w}`), ...lines].join('\n')), data: { project: name, file, kind: 'schematic', warnings, cycles: rows }, isError: false };
      }
      let m;
      const text = await projectText(name, file, `no drawing '${file}' in the project '${name}'`);
      try { m = JSON.parse(text); } catch { throw toolError(`no drawing '${file}' in the project '${name}'`); }
      const base = file.split('/').pop();
      if (circ) {
        await (await import('../core/circuit-kicad.js')).useProjectParts(await import('./projects.js'), name);   // (#4280)
        const { simulateCircuitFile } = await import('./mcp-simulate-circuit.js');
        // (its KiCad parts modelled by a module of the project run live, #4284)
        const { lines, rows, warnings } = await simulateCircuitFile(m, cycles, base, await (await import('./drawing-sync.js')).projectHdl(await import('./projects.js'), name));
        return { text: clip(lines.join('\n')), data: { project: name, file, kind: 'circuit', warnings, steps: rows }, isError: false };
      }
      const { lines, rows } = asm ? await simulateAsmFile(m, cycles, base) : await simulateFsmFile(m, cycles, base);
      return { text: clip(lines.join('\n')), data: { project: name, file, kind: asm ? 'asm' : 'fsm', cycles: rows }, isError: false };
    },
  },
];
