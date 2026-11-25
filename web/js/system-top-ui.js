// A System as the project's top in the interface (#5402, core/system-top.js): Set as Top Module on a System document
// (its file's menu in an FPGA project) and Design Properties' Top-Level Source Type "System" make the project a
// System project, its System its top (the project saved and opened again); Set as Top Module on a module of a System
// project sets the top module of the FPGA node whose folder holds it, the System staying the project's top (#5583).
// A line in the console.
import { S, app, findDoc, setDirty } from './app.js';
import { api } from './api.js';
import { appLog, commandError } from './console.js';
import { filesState } from './state-files.js';
import { designState } from './state-design.js';
import { isSystemFile, readSystem, writeSystem } from '/core/system-doc.js';
import { systemTopRefusal, toSystemTop, nodeTop } from '/core/system-top.js';

const what = 'Set as Top Module';

/** The project made a System project, the System `file` its top (none: the project's System, else a new one). */
export async function makeSystemTop(file = null, title = what) {
  const pj = S.project;
  const why = systemTopRefusal(pj);
  if (why) return commandError(title, why);
  const sys = file || (filesState.fileTree || []).find(isSystemFile) || null;
  const r = toSystemTop(pj, sys);
  try {
    if (r.write) await api.writeFile(pj.name, r.write.path, r.write.text);
    const saved = { ...r.pj };
    delete saved.fileTree;
    await api.saveProject(pj.name, saved);
    await app.openProject(pj.name);
  } catch (e) { return commandError(title, e.message); }
  appLog(`${pj.name}: a System project now, its System ${r.file} its top (its board kept).`, 'info');
}

/** Set as Top Module of the module `mod` (its file `file`) in a System project (#5583): the top module of the FPGA node
 *  whose folder holds it, written in the System document (the System editor's model too, when it is open); the System
 *  stays the project's top. */
export async function makeNodeTop(mod, file) {
  const pj = S.project;
  const sysFile = (filesState.fileTree || []).find(isSystemFile);
  if (!sysFile) return commandError(what, `the System project '${pj.name}' has no System document (.sys.json)`);
  const doc = findDoc(`sys:${sysFile}`);
  if (doc?.dirty) return commandError(what, `${sysFile} has unsaved changes: save it first`);
  const r0 = readSystem(designState.viewTexts?.[sysFile] ?? await api.readFile(pj.name, sysFile).catch(() => ''));
  if (r0.error) return commandError(what, `${sysFile}: ${r0.error}`);
  const r = nodeTop(r0.system, mod, file);
  if (r.error) return commandError(what, r.error);
  if (r.system) {
    const text = writeSystem(r.system);
    try { await api.writeFile(pj.name, sysFile, text); } catch (e) { return commandError(what, e.message); }
    designState.viewTexts = { ...designState.viewTexts, [sysFile]: text };
    if (doc?.systemEditor) { doc.systemEditor.setModel(r.system); doc.systemEditor.savedAs(); setDirty(doc, false); }
    app.renderHierarchy();
    app.renderProcesses();
  }
  appLog(`${what}: ${r.text}.`, 'info');
}
