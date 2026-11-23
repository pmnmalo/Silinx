// The MCP server's System as a project's top (#5402, core/system-top.js), as the interface's (web/js/system-top-ui.js):
// set_top with a System document, set_design_properties' and new_project's top_source_type system make the project a
// co-design project, its System its top; set_top with a module of a co-design project makes it an FPGA project again,
// that module its top, on its FPGA node's board. Off in a release, as co-design is.
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, projectPath, readProject, deviceName } from './mcp-util.js';
import { isSystemFile, readSystem } from '../core/system-doc.js';
import { systemTopRefusal, toSystemTop, toModuleTop } from '../core/system-top.js';

// the project's System document: the one at its root or in src/, else none
async function projectSystem(name) {
  for (const dir of ['', 'src']) {
    const files = await fsp.readdir(dir ? path.join(P.projectDir(name), dir) : P.projectDir(name), { withFileTypes: true }).catch(() => []);
    const f = files.find(e => e.isFile() && isSystemFile(e.name));
    if (f) return dir ? `${dir}/${f.name}` : f.name;
  }
  return null;
}

/** The project `name` made a co-design project, the System `file` its top (none: its System, else a new one). */
export async function makeSystemTop(name, file = null) {
  const pj = await readProject(name);
  const why = systemTopRefusal(pj);
  if (why) throw toolError(why);
  if (file) {
    if (!isSystemFile(file)) throw toolError(`${file}: a System document is a .sys.json`);
    await fsp.access(await projectPath(name, file)).catch(() => { throw toolError(`${file}: no such file in the project '${name}'`); });
  }
  const r = toSystemTop(pj, file || await projectSystem(name));
  if (r.write) await fsp.writeFile(await projectPath(name, r.write.path, 'write'), r.write.text);
  await P.updateProject(name, () => r.pj);
  return { text: `${name}: a co-design project now, its System ${r.file} its top (its board kept: set_top with a module makes it an FPGA project again).`,
    data: { project: name, kind: r.pj.kind, top: r.file, system: r.file, made: !!r.write } };
}

/** The co-design project `name` made an FPGA project again, the module `mod` its top, on its FPGA node's board. */
export async function makeModuleTop(name, mod) {
  const pj = await readProject(name);
  const sys = await projectSystem(name);
  const system = sys ? readSystem(await fsp.readFile(await projectPath(name, sys), 'utf8').catch(() => '')).system : null;
  const next = toModuleTop(pj, mod, system);
  await P.updateProject(name, () => next);
  return { text: `${name}: an FPGA project now, its top module '${mod}' on ${next.board || 'no board'} (${deviceName(next.device)}).`,
    data: { project: name, kind: 'fpga', top: mod, board: next.board || null, device: next.device } };
}
