// A System simulated in the Simulate task (#5581's part 3): Simulate System and Simulate Node open the System's simulation
// view (web/js/system-sim-view.js, the System editor's Try it panel's) in a document of its own, `syssim:<file>` (as the
// System Emulator's `sysemu:<file>`), its System as saved (or as its open editor has it), cut to the nodes that run (the
// Simulation Properties', or the node's: system-open.js mountSimulation); a second run of another choice restarts it.
// Systems not in a release yet (#5202): said in the console, nothing opened.
import { api } from './api.js';
import { S, activateDoc, findDoc, openDoc } from './app.js';
import { logError } from './console.js';
import { h } from './ui.js';
import { statusLine } from './status-line.js';
import { readSystem } from '/core/system-doc.js';
import { runName } from '/core/system-alone.js';
import { systemsOn, SYSTEMS_OFF } from '/core/build-channel.js';

const docTitle = (sys, nodes) => (nodes?.length === 1 ? `Simulate (${sys.name}: ${nodes[0]})` : `Simulate (${sys.name})`);

/** The System of `path` simulated, its nodes `nodes` (undefined: the Simulation Properties'); its view, or null. */
export async function openSystemSimulation(path, { nodes } = {}) {
  if (!systemsOn()) { logError(`cannot simulate ${path}: ${SYSTEMS_OFF}`); return null; }
  const id = `syssim:${path}`, pj = S.project.name;
  const ed = findDoc(`sys:${path}`)?.systemEditor;
  let sys = ed?.getModel();
  if (!sys) {
    let r;
    try { r = readSystem(await api.readFile(pj, path)); } catch (e) { logError(`${runName('Simulate', nodes)}: ${path}: ${e.message}`); return null; }
    if (r.error) { logError(`${runName('Simulate', nodes)}: ${path}: ${r.error}`); return null; }
    sys = r.system;
  }
  const { mountSimulation } = await import('./system-open.js');
  if (S.project?.name !== pj) return null;   // another project opened meanwhile (#1231)
  const mount = d => {
    d.sim?.destroy();
    d.sim = mountSimulation(d.host, { system: () => sys, nodes: () => nodes, status: d.status });
    d.title = docTitle(sys, nodes);
    const label = d.tab?.querySelector('.tlabel');
    if (label) label.textContent = d.title;
  };
  const open = findDoc(id);
  if (open) { mount(open); activateDoc(open); return open.sim; }
  let doc = null;
  openDoc({ id, title: docTitle(sys, nodes), icon: 'system',
    create(el, d) {
      // (the System editor's Try it panel's look: its styles, its lighter green, docs/UI-GUIDELINES.md)
      d.host = h('div', { class: 'sys-sim-host try-it-body' });
      d.status = statusLine();   // (its run's time, its last line: docs/UI-GUIDELINES.md)
      el.append(h('div', { class: 'asm-editor system-editor sys-sim-doc' }, d.host, d.status.el));
      doc = d;
      mount(d);
      return { destroy: () => d.sim?.destroy() };
    } });
  return doc?.sim ?? findDoc(id)?.sim ?? null;
}
