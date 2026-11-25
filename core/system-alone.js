// Silinx - the nodes of a System that run (#5581, docs/SYSTEMS.md, Emulation): the System Emulator runs every node, or the ones
// the project's Emulation Properties tick, or one node alone (its Emulate Node). The System is cut to them, and each link
// to a node that does not run has its open end replaced: a UART's by a serial terminal (the user reads what the node sends
// and types what it receives, at the link's baud and frame), a GPIO input's held at 0 (the cut System's `held`, its ends:
// core/system-build.js sets their pins at 0), a GPIO output's, an SPI's and an I²C's left open; a circuit node
// whose boards do not all run is not run. Each replacement is said, one warning a link. Isomorphic module.
import { partDef } from './circuit-parts.js';
import { boardNodeId } from './system-circuit.js';

/** The kinds of node that are ticked to run; a terminal runs with the nodes it is linked to. */
export const RUN_KINDS = ['fpga', 'mcu', 'circuit', 'design'];

/** The nodes that can be ticked to run, in the document's order: their ids. */
export const runnableNodes = sys => (sys?.nodes || []).filter(n => RUN_KINDS.includes(n.kind)).map(n => n.id);

/** Why the nodes `ids` cannot run in `sys` (a name it has not, or none of them), or null. */
export function runRefusal(sys, ids) {
  if (ids == null) return null;
  const can = runnableNodes(sys);
  const bad = ids.filter(id => !can.includes(id));
  if (bad.length) return `${bad.join(', ')}: no such node to run in ${sys.name} (its nodes: ${can.join(', ') || 'none'})`;
  return ids.length ? null : `no node of ${sys.name} is chosen to run`;
}

// a link's end: { node, iface }
const endOf = s => { const k = String(s).indexOf('.'); return { node: s.slice(0, k), iface: s.slice(k + 1) }; };
// a free id for a terminal in place of `link`'s far end
function freeId(taken, base) {
  let id = base;
  for (let k = 2; taken.has(id); k++) id = `${base}_${k}`;
  taken.add(id);
  return id;
}

// the nodes a circuit's boards are (core/system-circuit.js: a board's label, else its id); none when it is not known
const boardsOf = m => (m?.parts || []).filter(p => partDef(p.type)?.kind === 'board').map(boardNodeId);

/**
 * The System `sys` with only the nodes `ids` running (null: all, the System as it is): { system, warnings: [text] }; the
 * system's `held` ('<node>.<interface>') its GPIO inputs held at 0, its link cut.
 * `circuits`: { path: its circuit (normalized) } to know a circuit node's boards (a circuit not given is kept). Refused
 * (runRefusal): { error }.
 */
export function runningSystem(sys, ids = null, { circuits = {} } = {}) {
  if (ids == null) return { system: sys, warnings: [] };
  const error = runRefusal(sys, ids);
  if (error) return { error };
  const warnings = [];
  const run = new Set(ids);
  // (a circuit whose boards do not all run: not run, said)
  for (const n of sys.nodes.filter(x => x.kind === 'circuit' && run.has(x.id))) {
    const boards = boardsOf(circuits[n.circuit]);
    const off = boards.filter(b => !run.has(b));
    if (off.length) { run.delete(n.id); warnings.push(`circuit ${n.id} is not run: its board${off.length > 1 ? 's' : ''} ${off.join(', ')} ${off.length > 1 ? 'are' : 'is'} not run`); }
  }
  // (a terminal runs when a node it is linked to runs)
  for (const l of sys.links) {
    const a = endOf(l.a), b = endOf(l.b);
    const kind = id => sys.nodes.find(n => n.id === id)?.kind;
    if (kind(a.node) === 'terminal' && run.has(b.node)) run.add(a.node);
    if (kind(b.node) === 'terminal' && run.has(a.node)) run.add(b.node);
  }
  const taken = new Set(sys.nodes.map(n => n.id)), nodes = sys.nodes.filter(n => run.has(n.id)), links = [], held = [];
  for (const l of sys.links) {
    const a = endOf(l.a), b = endOf(l.b);
    if (run.has(a.node) && run.has(b.node)) { links.push(l); continue; }
    if (!run.has(a.node) && !run.has(b.node)) continue;
    const [mine, far] = run.has(a.node) ? [a, b] : [b, a];
    const node = sys.nodes.find(n => n.id === mine.node), f = node?.interfaces?.find(x => x.name === mine.iface);
    const head = `link ${l.id}: ${far.node} is not run, its end ${mine.node}.${mine.iface}`;
    if (l.kind === 'uart' && f) {
      const id = freeId(taken, l.id), baud = f.baud ?? 9600, frame = f.frame ?? '8N1';
      nodes.push({ id, kind: 'terminal', interfaces: [{ name: 'uart', kind: 'uart', baud, frame }], x: 0, y: 0 });
      links.push({ ...l, a: `${mine.node}.${mine.iface}`, b: `${id}.uart` });
      warnings.push(`${head} is the terminal ${id} here (${baud} baud, ${frame})`);
    } else if (l.kind === 'gpio' && f?.dir === 'in') {
      held.push(`${mine.node}.${mine.iface}`);
      warnings.push(`${head} is held at 0: its input${f.pins.length > 1 ? 's' : ''} ${f.pins.join(', ')}`);
    }
    else warnings.push(`${head} is left open`);
  }
  return { system: { ...sys, nodes, links, ...(held.length ? { held } : {}) }, warnings };
}

/** The nodes the project `pj`'s Emulation Properties tick to run (silinx.json's `system.emulate.nodes`, #5581), those
 *  of `sys` it still has: their ids, or null (every node, none ticked off). */
export function emulateNodesOf(pj, sys) {
  const given = pj?.system?.emulate?.nodes;
  if (!Array.isArray(given)) return null;
  const can = runnableNodes(sys);
  const ids = can.filter(id => given.includes(id));
  return ids.length === can.length ? null : ids;
}

/** The project `pj` with the nodes `ids` ticked to run (null or every node of `sys`: the setting left out), or { error }. */
export function withEmulateNodes(pj, sys, ids) {
  const all = ids == null || runnableNodes(sys).every(id => ids.includes(id));
  const error = all ? null : runRefusal(sys, ids);
  if (error) return { error };
  const { emulate, ...rest } = pj.system || {};
  const system = all ? rest : { ...rest, emulate: { ...emulate, nodes: runnableNodes(sys).filter(id => ids.includes(id)) } };
  const out = { ...pj, system };
  if (!Object.keys(system).length) delete out.system;
  return out;
}

/** What a run of the nodes `ids` (null: every node) is called, as the console says it: `<verb> System`, or `<verb> Node
 *  <id>` for one node alone (`verb`: Emulate, Simulate). */
export const runName = (verb, ids) => (ids?.length === 1 ? `${verb} Node ${ids[0]}` : `${verb} System`);

/** A System's run time by default (ms): Simulate System's, the MCP simulate's. */
export const SIMULATE_MS = 100;

/** The project `pj`'s Simulation Properties (silinx.json's `system.simulate`, #5581's part 3) for `sys`: { nodes (the ids
 *  Simulate System runs, null: every node), ms (its run's time), stimulus (its stimulus file, or null) }. */
export function simulateSettingsOf(pj, sys) {
  const s = pj?.system?.simulate || {};
  const can = runnableNodes(sys);
  const ids = Array.isArray(s.nodes) ? can.filter(id => s.nodes.includes(id)) : null;
  return { nodes: ids && ids.length !== can.length ? ids : null, ms: Number.isFinite(s.ms) && s.ms > 0 ? s.ms : SIMULATE_MS, stimulus: s.stimulus || null };
}

/** Why the Simulation Properties `{ nodes, ms, stimulus }` cannot be (`files` the project's paths), or null. */
function simulateRefusal(sys, { nodes, ms, stimulus }, files) {
  if (nodes != null && !runnableNodes(sys).every(id => nodes.includes(id))) { const why = runRefusal(sys, nodes); if (why) return why; }
  if (ms != null && !(Number(ms) > 0 && Number(ms) <= 10000)) return 'its run\'s time: from 0 to 10000 ms (10 s)';
  if (stimulus && !/\.stim\.json$/i.test(stimulus)) return `${stimulus}: a stimulus file is a .stim.json`;
  if (stimulus && files && !files.includes(stimulus)) return `${stimulus}: no such file in the project`;
  return null;
}

/** The project `pj` with the Simulation Properties `set` ({ nodes, ms, stimulus }: those given; nodes null or all, ms
 *  SIMULATE_MS, stimulus '' or null: left out) for `sys` (`files` the project's paths), or { error }. */
export function withSimulateSettings(pj, sys, set, files = null) {
  const error = simulateRefusal(sys, set, files);
  if (error) return { error };
  const { simulate = {}, ...rest } = pj.system || {};
  const next = { ...simulate };
  if ('nodes' in set) { if (set.nodes == null || runnableNodes(sys).every(id => set.nodes.includes(id))) delete next.nodes; else next.nodes = runnableNodes(sys).filter(id => set.nodes.includes(id)); }
  if ('ms' in set) { if (set.ms == null || Number(set.ms) === SIMULATE_MS) delete next.ms; else next.ms = Number(set.ms); }
  if ('stimulus' in set) { if (!set.stimulus) delete next.stimulus; else next.stimulus = set.stimulus; }
  const system = Object.keys(next).length ? { ...rest, simulate: next } : rest;
  const out = { ...pj, system };
  if (!Object.keys(system).length) delete out.system;
  return out;
}
