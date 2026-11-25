// The System Emulator opened (#5212): a System project's System emulated in a document of its own, `sysemu:<file>`
// (the Board Emulator's is its one 'emulator'), from the System editor's Emulate (its System as it is there) or the
// System row's Emulate System (as saved). One emulator runs every node, or the nodes chosen (#5581: the Emulation
// Properties' ticked ones, a node's Emulate Node), the System cut to them (core/system-alone.js runningSystem), each
// link's open end said in the console; a second run of another choice restarts it with that one. Systems not in a release
// yet (#5202): said in the console, nothing opened.
import { api } from './api.js';
import { S, activateDoc, findDoc, openDoc } from './app.js';
import { log, logError } from './console.js';
import { designState } from './state-design.js';
import { readSystem } from '/core/system-doc.js';
import { normalizeCircuit } from '/core/circuit.js';
import { runningSystem, runName } from '/core/system-alone.js';
import { systemsOn, SYSTEMS_OFF } from '/core/build-channel.js';

/** The circuit nodes' circuits, as the project has them (their boards: which run). */
export function circuitsOf(sys) {
  const out = {};
  for (const n of sys.nodes.filter(x => x.kind === 'circuit' && x.circuit)) {
    try { out[n.circuit] = normalizeCircuit(JSON.parse(designState.viewTexts?.[n.circuit] ?? '')); } catch { /* (not read: kept) */ }
  }
  return out;
}

const docTitle = (sys, nodes) => (nodes?.length === 1 ? `Emulate (${sys.name}: ${nodes[0]})` : `Emulate (${sys.name})`);

/** The System of `path` emulated (`model()`: the System as its editor has it; else as saved); `nodes`: the ids of the
 *  nodes that run (null: every node). */
export async function openSystemEmulator(path, model = null, { nodes = null } = {}) {
  if (!systemsOn()) { logError(`cannot emulate ${path}: ${SYSTEMS_OFF}`); return; }
  const id = `sysemu:${path}`;
  const pj = S.project.name;
  let sys = model?.();
  if (!sys) {
    let r;
    try { r = readSystem(await api.readFile(pj, path)); } catch (e) { logError(`cannot emulate ${path}: ${e.message}`); return; }
    if (r.error) { logError(`cannot emulate ${path}: ${r.error}`); return; }
    sys = r.system;
  }
  const cut = runningSystem(sys, nodes, { circuits: circuitsOf(sys) });
  if (cut.error) { logError(`${runName('Emulate', nodes)}: ${cut.error}`); return; }
  for (const w of cut.warnings) log(`WARNING: ${runName('Emulate', nodes)}: ${w}`, 'warn');
  const open = findDoc(id);
  if (open) {
    open.run = { model, sys, nodes };
    open.title = docTitle(sys, nodes);
    const label = open.tab?.querySelector('.tlabel');
    if (label) label.textContent = open.title;
    open.emulator?.restart();
    return activateDoc(open);
  }
  const [{ mountSystemEmulator }, { prepareHere }] = await Promise.all([import('./system-emu-view.js'), import('./system-open.js')]);
  if (S.project?.name !== pj) return;   // another project opened meanwhile (#1231)
  openDoc({
    id, title: docTitle(sys, nodes), icon: 'system',
    create(el, d) {
      d.run = { model, sys, nodes };
      // (the System as it is now, cut to the nodes that run)
      const system = () => { const { model: m, sys: s, nodes: ns } = d.run; const all = m?.() || s; return runningSystem(all, ns, { circuits: circuitsOf(all) }).system || all; };
      const v = mountSystemEmulator(el, { system, prepare: s => prepareHere(s, { emulate: true }), onMessage: (text, level) => log(text, level) });
      d.emulator = v;
      return { destroy: () => v.destroy() };
    },
  });
}
