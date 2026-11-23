// A co-design project's System document (.sys.json, #4700, docs/CODESIGN.md) opened in the System editor
// (web/js/system-editor.js): its check (core/system-check.js) with the project's modules (the FPGA nodes' modules
// elaborated: their ports' directions and widths) and files (the firmware), its problems in the console's Errors and
// Warnings as it is edited and its Check's lines in the Console, as the MCP server's check_system says them; saved, its
// text writeSystem's, the Check run again. The Design pane's row of the System (design-system.js) opens it.
import { api } from './api.js';
import { h, popupMenu } from './ui.js';
import { S, activateDoc, findDoc, openDoc, setDirty, viewRoots } from './app.js';
import { log, logError } from './console.js';
import { editorProblems } from './editor-problems.js';
import { renderHierarchy } from './design.js';
import { designState } from './state-design.js';
import { following, followNotice } from './collab-state.js';
import { phoneOnly } from './phone-readonly.js';
import { filesState } from './state-files.js';
import { elaborate } from '/core/compile.js';
import { ucfPort } from '/core/board-constraints.js';
import { readSystem, writeSystem } from '/core/system-doc.js';
import { codesignOn, CODESIGN_OFF } from '/core/build-channel.js';
import { checkSystem, analyzeSystem } from '/core/system-check.js';
import { systemInputs } from '/core/system-run.js';
import { regmapFor } from '/core/regmap.js';
import { mountSystemSim } from './system-sim-view.js';
import { openSystemWaves } from './system-waves-view.js';

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
export async function prepareHere(sys, { emulate = false } = {}) {
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
    netlist: m => { if (!designs[m]) throw new Error(`no module '${m}' that elaborates (Check Syntax says why)`); return netlistOf(designs[m], { run }); },
    firmware: async p => (/\.elf$/i.test(p) ? api.readFileBytes(S.project.name, p) : api.readFile(S.project.name, p)),   // (an .elf's bytes, #5198)
    regmap: m => regmapFor(designState.viewTexts, m),   // (a module made from a register map: its accesses, #5288)
  });
  if (inputs.error) return inputs;
  // (the System Emulator's: its boards too, and the inputs it draws them from, #5212)
  const r = await (await import('./system-remote.js')).startSystemRun(sys, inputs, { emulate });
  return r.error ? r : Object.assign(r, { inputs });
}

/** A System's problems, as Check System says them (the MCP server's check_system's). */
const checkProjectSystem = sys => checkSystem(sys, { modules: projectModules(sys), files: filesState.fileTree || [] });
/** Its wires, pin by pin (the Wiring view's, #5216: the MCP's check_system wiring). */
const projectWires = sys => analyzeSystem(sys, { modules: projectModules(sys), files: filesState.fileTree || [] }).wires;
// the editor's lists: the project's design modules (the roots of its hierarchy first: a new FPGA node's), a module's
// ports, the project's firmware files
const modules = () => [...new Set([...viewRoots(false), ...(designState.modules || []).filter(m => m.role !== 'sim').map(m => m.name)])];
const portsOf = name => (designState.modules || []).find(m => m.name === name)?.portList || [];
const firmwares = () => (filesState.fileTree || []).filter(f => /\.(hex|elf)$/i.test(f));

export async function openSystem(path) {
  // (co-design not in a release yet, #5202: said in the console, no editor)
  if (!codesignOn()) { logError(`cannot open ${path}: ${CODESIGN_OFF}`); return; }
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
        check: checkProjectSystem, modules, portsOf, firmwares,
        // (a project followed, #3181: read only, the follower's notice at the end of its toolbar; no live editing yet)
        ...(following() ? { readOnly: true, banner: followNotice() } : phoneOnly()),   // (a phone's, #5121)
        // (Simulate: the System's simulation view, #4701)
        mountSim: (host, o) => mountSystemSim(host, { ...o, prepare: prepareHere, onMessage: (text, level) => log(text, level), openWaves: openSystemWaves }),
        // (Emulate: the System Emulator, its own document, #5212)
        wires: projectWires,   // (Wiring, #5216)
        onEmulate: async () => (await import('./system-emu-open.js')).openSystemEmulator(path, () => ed.getModel()),
      });
      d.systemEditor = ed;
      d.checkSystem = () => problems.log(ed.check());
      // (the project compiled again: its modules and files as they are now)
      d.onProject = () => ed.refresh();
      return {
        save: async () => {
          const text = writeSystem(ed.getModel());
          await api.writeFile(S.project.name, path, text); setDirty(d, false);
          // (its Design row: its name, its FPGA nodes' modules)
          designState.viewTexts = { ...designState.viewTexts, [path]: text };
          renderHierarchy();
          problems.log(ed.check());   // (checked when saved, docs/CODESIGN.md)
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
    { label: 'Emulate System', action: async () => (await import('./system-emu-open.js')).openSystemEmulator(file) },
  ], e.clientX, e.clientY);
}
