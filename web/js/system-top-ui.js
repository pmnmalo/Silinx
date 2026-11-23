// A System as the project's top in the interface (#5402, core/system-top.js): Set as Top Module on a System document
// (its file's menu in an FPGA project) and Design Properties' Top-Level Source Type "System" make the project a
// co-design project, its System its top; Set as Top Module on a module of a co-design project makes it an FPGA project
// again, that module its top, on its FPGA node's board. The project saved and opened again, a line in the console.
import { S, app } from './app.js';
import { api } from './api.js';
import { appLog, commandError } from './console.js';
import { filesState } from './state-files.js';
import { designState } from './state-design.js';
import { isSystemFile, readSystem } from '/core/system-doc.js';
import { systemTopRefusal, toSystemTop, toModuleTop } from '/core/system-top.js';

const what = 'Set as Top Module';

/** The project made a co-design project, the System `file` its top (none: the project's System, else a new one). */
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
  appLog(`${pj.name}: a co-design project now, its System ${r.file} its top (its board kept: Set as Top Module on a module makes it an FPGA project again).`, 'info');
}

/** The co-design project made an FPGA project again, the module `mod` its top, on its FPGA node's board. */
export async function makeModuleTop(mod) {
  const pj = S.project;
  const sysFile = (filesState.fileTree || []).find(isSystemFile);
  const system = sysFile ? readSystem(designState.viewTexts?.[sysFile] ?? await api.readFile(pj.name, sysFile).catch(() => '')).system : null;
  const next = toModuleTop(pj, mod, system);
  try {
    delete next.fileTree;
    await api.saveProject(pj.name, next);
    await app.openProject(pj.name);
  } catch (e) { return commandError(what, e.message); }
  appLog(`${pj.name}: an FPGA project now, its top module '${mod}' on ${next.board || 'no board'} (${next.device.part}${next.device.speed}-${next.device.package}).`, 'info');
}
