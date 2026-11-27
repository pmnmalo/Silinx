// A System project's System document (.sys.json, #4700, docs/SYSTEMS.md) opened in the System editor
// (web/js/system-editor.js): its check (core/system-check.js) with the project's modules (the FPGA nodes' modules
// elaborated: their ports' directions and widths) and files (the firmware), its problems in the console's Errors and
// Warnings as it is edited and its Check's lines in the Console, as the MCP server's check_system says them; saved, its
// text writeSystem's, the Check run again. The Design pane's row of the System (design-system.js) opens it.
import { api } from './api.js';
import { h, popupMenu } from './ui.js';
import { S, app, activateDoc, findDoc, openDoc, setDirty, viewRoots } from './app.js';
import { log, logError } from './console.js';
import { editorProblems } from './editor-problems.js';
import { renderHierarchy } from './design.js';
import { designState } from './state-design.js';
import { following, followNotice } from './collab-state.js';
import { phoneOnly } from './phone-readonly.js';
import { filesState } from './state-files.js';
import { compile, elaborate } from '/core/compile.js';
import { primitiveSources } from '/core/unisim.js';
import { ucfPort } from '/core/board-constraints.js';
import { normalizeCircuit } from '/core/circuit.js';
import { readSystem, writeSystem } from '/core/system-doc.js';
import { relInNode } from '/core/system-layout.js';
import { isPsPath, psWrites } from '/core/zynq-ps.js';
import { systemsOn, SYSTEMS_OFF } from '/core/build-channel.js';
import { checkSystem, analyzeSystem } from '/core/system-check.js';
import { systemInputs } from '/core/system-run.js';
import { emulateNodesOf, simulateSettingsOf, runningSystem, runName } from '/core/system-alone.js';
import { readStimulus } from '/core/system-stimulus.js';
import { circuitsOf } from './system-emu-open.js';
import { regmapFor, hierModules } from '/core/regmap.js';
import { mountSystemSim } from './system-sim-view.js';
import { openSystemWaves } from './system-waves-view.js';
import { saveNodeFolders } from './system-folders-ui.js';
import { nodePinsHere, constraintsHere } from './system-constraints-ui.js';
import { profileById, systemRuleProfile } from '/core/project-profile.js';

// the project's modules ({ name: ports, null when not elaborated }): every module, the FPGA nodes' elaborated
function projectModules(sys) {
  const out = {}, lib = designState.lib;
  if (!lib) return null;
  for (const m of lib.modules.values()) out[m.name] = null;
  for (const top of new Set(sys.nodes.filter(n => n.kind === 'fpga' && n.module).map(n => String(n.module)))) {
    try { const d = elaborate(lib, top); if (d?.top) out[top] = d.top.ports.map(ucfPort).map(p => ({ name: p.name, dir: p.dir, width: p.width })); } catch { /* its errors: Check Syntax's */ }
  }
  return out;
}
// the System made ready to run (core/system-run.js systemInputs): its FPGA nodes' modules compiled by Yosys (the Board
// Emulator's: the page's workers, the browser edition's own), its firmware read (a .hex's text, an .elf's bytes, #5198:
// as the MCP's simulate of a System); then run in its Web Worker (system-remote.js), where the compiled engine may make its code
export async function prepareHere(sys, { emulate = false, stimulus = null, models = null } = {}) {
  sys = nodePinsHere(sys).system;   // (each FPGA node's pins its constraints file's, #5581)
  const lib = designState.lib;
  if (!lib) return { error: 'the project does not compile: Check Syntax says why' };
  const designs = {}, ports = {};
  for (const m of new Set(sys.nodes.filter(n => n.kind === 'fpga' && n.module).map(n => String(n.module)))) {
    try { designs[m] = elaborate(lib, m); ports[m] = designs[m].top.ports.map(ucfPort).map(p => ({ name: p.name, dir: p.dir, width: p.width })); } catch { /* said below */ }
  }
  const { netlistOf } = await import('/core/compiled-sim.js');
  const { emulatorYosys } = await import('./emulator.js');
  const run = await emulatorYosys(api.standalone);
  const inputs = await systemInputs(sys, {
    ports,
    // (an FPGA node's model, #5612: its netlist compiled with the device's primitives, in place of its module's RTL)
    netlist: (m, id) => { if (models?.[id]) return netlistOf(modelDesign(models[id], m), { run }); if (!designs[m]) throw new Error(`no module '${m}' that elaborates (Check Syntax says why)`); return netlistOf(designs[m], { run }); },
    firmware: async p => (/\.elf$/i.test(p) ? api.readFileBytes(S.project.name, p) : api.readFile(S.project.name, p)),   // (an .elf's bytes, #5198)
    circuit: p => designState.viewTexts?.[p] ?? api.readFile(S.project.name, p),   // (a circuit node's, #5215)
    nodeFiles: id => (filesState.fileTree || []).filter(f => relInNode(f, id) != null),   // (a CircuitPython node's drive's, #5697)
    regmap: m => regmapFor(designState.viewTexts, designs[m] ? hierModules(designs[m].top) : [m]),   // (a module made from a register map, or one instancing it: its accesses, #5288)
  });
  if (inputs.error) return inputs;
  // (the System Emulator's: its boards too, and the inputs it draws them from, #5212)
  const r = await (await import('./system-remote.js')).startSystemRun(sys, inputs, { emulate, stimulus });   // (its stimulus file's, #5581)
  return r.error ? r : Object.assign(r, { inputs, system: sys });   // (the System run: its nodes' pins read, #5581)
}

/** A System's simulation view (the editor's Try it; Simulate System and Simulate Node's document, #5581:
 *  web/js/system-sim-open.js): the System cut to the nodes that run (`o.nodes()`, else the Simulation Properties'), its
 *  links' open ends said; its run's time; its stimulus file applied. */
export function mountSimulation(host, o) {
  const settings = () => simulateSettingsOf(S.project, o.system());
  const ids = () => o.nodes?.() ?? settings().nodes;
  const cut = all => runningSystem(all, ids(), { circuits: circuitsOf(all) });
  const name = () => runName('Simulate', ids());
  return mountSystemSim(host, { ...o, system: () => cut(o.system()).system ?? o.system(), ms: () => settings().ms, name,
    async prepare(s) {
      const c = cut(o.system());
      if (c.error) return c;
      for (const w of c.warnings) log(`WARNING: ${name()}: ${w}`, 'warn');
      const st = await stimulusHere(settings().stimulus);
      return st.error ? st : prepareHere(s, { stimulus: st.stimulus });
    },
    onMessage: (text, level) => log(text, level), openWaves: openSystemWaves });
}

// the stimulus file `path` read (#5581): { stimulus } (null: none), or { error }
async function stimulusHere(path) {
  if (!path) return { stimulus: null };
  let text;
  try { text = await api.readFile(S.project.name, path); } catch (e) { return { error: `${path}: ${e.message}` }; }
  const r = readStimulus(text);
  return r.error ? { error: `${path}: ${r.error}` } : r;
}

// a model's netlist ({ path, lang, text }, #5612) elaborated, its top the node's module
function modelDesign(net, mod) {
  const d = elaborate(compile([...primitiveSources([net]), net]), mod);
  if (!d.top) throw new Error(`its model ${net.path} does not elaborate: ${(d.diags || []).find(x => x.severity === 'error')?.message || 'it has errors'}`);
  return d;
}

/** A System's problems, as Check System says them (the MCP server's check_system's). */
const checkProjectSystem = sys => checkSystem(sys, { modules: projectModules(sys), files: filesState.fileTree || [], circuits: projectCircuits(sys), constraints: constraintsHere(sys) });
// the circuit nodes' circuits, as the project has them (#5215: their boards and pins checked; one not read left out)
function projectCircuits(sys) {
  const out = {};
  for (const n of sys.nodes.filter(x => x.kind === 'circuit' && x.circuit)) {
    try { out[n.circuit] = normalizeCircuit(JSON.parse(designState.viewTexts?.[n.circuit] ?? '')); } catch { /* (not read: not checked) */ }
  }
  return out;
}
/** Its wires, pin by pin (the Wiring view's, #5216: the MCP's check_system wiring). */
const projectWires = sys => analyzeSystem(sys, { modules: projectModules(sys), files: filesState.fileTree || [], circuits: projectCircuits(sys), constraints: constraintsHere(sys) }).wires;
// the editor's lists: the project's design modules (the roots of its hierarchy first: a new FPGA node's), a module's
// ports, the project's firmware files
const modules = () => [...new Set([...viewRoots(false), ...(designState.modules || []).filter(m => m.role !== 'sim').map(m => m.name)])];
const portsOf = name => (designState.modules || []).find(m => m.name === name)?.portList || [];
// (a node's: its folder's, #5488)
const inNode = (f, id) => id == null || relInNode(f, id) != null;
const firmwares = id => (filesState.fileTree || []).filter(f => /\.(hex|elf|py)$/i.test(f) && inNode(f, id));   // (a Pico's program a .py, #5494)
const circuits = id => (filesState.fileTree || []).filter(f => /\.circ\.json$/i.test(f) && inNode(f, id));   // (a circuit node's, #5215)
const psPrograms = id => (filesState.fileTree || []).filter(f => /\.c$/i.test(f) && isPsPath(relInNode(f, id)));   // (a Zynq node's PS's, #4686)

export async function openSystem(path) {
  // (Systems not in a release yet, #5202: said in the console, no editor)
  if (!systemsOn()) { logError(`cannot open ${path}: ${SYSTEMS_OFF}`); return; }
  const id = `sys:${path}`;
  if (findDoc(id)) return activateDoc(findDoc(id));
  const pj = S.project.name;
  let r;
  try { r = readSystem(await api.readFile(pj, path)); }
  catch (e) { logError(`cannot open ${path}: ${e.message}`); return; }
  if (r.error) { logError(`cannot open ${path}: ${r.error}`); return; }
  const { mountSystemEditor } = await import('./system-editor.js');
  if (S.project?.name !== pj) return;   // another project opened meanwhile: not its System (#1231)
  const name = path.split('/').pop();
  openDoc({
    id, path, title: name, icon: 'system',
    create(el, d) {
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      const problems = editorProblems({ file: path, tool: 'System', what: 'Check System', goto: x => { activateDoc(d); if (x.ref?.id) ed.select(x.ref); } });
      const ed = mountSystemEditor(host, {
        model: r.system,
        onChange: () => setDirty(d, true),
        onProblems: diags => problems.set(diags),
        onCheck: diags => problems.log(diags),
        onMessage: (text, err) => log(err ? `WARNING: ${name}: ${text}` : `${name}: ${text}`, err ? 'warn' : 'info'),
        check: checkProjectSystem, modules, portsOf, firmwares, circuits, psPrograms,
        nodeKinds: profileById(systemRuleProfile(S.project))?.nodes ?? null,   // (the node tools its profile allows, #5910)
        // (a project followed, #3181: read only, the follower's notice at the end of its toolbar; no live editing yet)
        ...(following() ? { readOnly: true, banner: followNotice() } : phoneOnly()),   // (a phone's, #5121)
        // (Simulate: the System's simulation view, #4701)
        // (#5581: the Simulation Properties' nodes, or Simulate Node's, its run's time and its stimulus file)
        mountSim: (host, o) => mountSimulation(host, o),
        // (Emulate: the System Emulator, its own document, #5212)
        wires: projectWires,   // (Wiring, #5216)
        // (the nodes its Emulation Properties tick, #5581)
        onEmulate: async () => (await import('./system-emu-open.js')).openSystemEmulator(path, () => ed.getModel(), { nodes: emulateNodesOf(S.project, ed.getModel()) }),
      });
      d.systemEditor = ed;
      let saved = r.system;   // (as last saved: its nodes' folders follow it, #5488)
      d.checkSystem = () => problems.log(ed.check());
      // (the project compiled again: its modules and files as they are now)
      d.onProject = () => ed.refresh();
      return {
        save: async () => {
          const model = ed.getModel();
          // (the nodes' folders first, #5488: one that cannot be renamed, the System not written)
          await saveNodeFolders(saved, model, ed.renames());
          const text = writeSystem(model);
          await api.writeFile(S.project.name, path, text); setDirty(d, false);
          saved = model; ed.savedAs();
          // (a Zynq node's PS program named and not in the project: its starter, as edit_system writes it, #4686)
          const starters = psWrites(model, filesState.fileTree || []);
          for (const w of starters) { await api.writeFile(S.project.name, w.path, w.text); log(`${path}: ${w.path}: the PS's starter program written`, 'info'); }
          if (starters.length) await app.reloadProject();
          // (its Design row: its name, its FPGA nodes' modules)
          designState.viewTexts = { ...designState.viewTexts, [path]: text };
          renderHierarchy();
          problems.log(ed.check());   // (checked when saved, docs/SYSTEMS.md)
        },
        destroy: () => { problems.clear(); ed.destroy?.(); },
      };
    },
  });
}

/** The System's row's menu in the Design pane: Open, Check System (its lines in the Console). */
export function systemContextMenu(e, file) {
  popupMenu([
    { label: 'Open', action: () => openSystem(file) },
    { label: 'Check System', action: async () => { await openSystem(file); findDoc(`sys:${file}`)?.checkSystem?.(); } },
    { label: 'Emulate System', action: async () => (await import('./system-emulate-ui.js')).emulateSystem() },
  ], e.clientX, e.clientY);
}
