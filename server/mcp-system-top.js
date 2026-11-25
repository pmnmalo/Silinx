// The MCP server's System as a project's top (#5402, core/system-top.js), as the interface's (web/js/system-top-ui.js):
// set_top with a System document, set_design_properties' and new_project's top_source_type system make the project a
// System project, its System its top; set_top with a module of a System project sets the top module of the FPGA node
// whose folder holds it, the System staying the project's top (#5583). Off in a release, as Systems are.
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, projectPath, readProject, deviceName } from './mcp-util.js';
import { isSystemFile, readSystem, writeSystem } from '../core/system-doc.js';
import { profileOf } from '../core/project-profile.js';
import { systemTopRefusal, toSystemTop, nodeTop } from '../core/system-top.js';

// the project's System document: the one at its root or in src/, else none
async function projectSystem(name) {
  for (const dir of ['', 'src']) {
    const files = await fsp.readdir(dir ? path.join(P.projectDir(name), dir) : P.projectDir(name), { withFileTypes: true }).catch(() => []);
    const f = files.find(e => e.isFile() && isSystemFile(e.name));
    if (f) return dir ? `${dir}/${f.name}` : f.name;
  }
  return null;
}

/** The project `name` made a System project, the System `file` its top (none: its System, else a new one). */
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
  return { text: `${name}: a System project now, its System ${r.file} its top (its board kept).`,
    data: { project: name, kind: 'system', profile: profileOf(r.pj), top: r.file, system: r.file, made: !!r.write } };
}

/** A System project's set_top of the module `mod` (its file `file`, #5583): the top module of the FPGA node whose folder
 *  holds it, written in its System document; the System stays the project's top. */
export async function makeNodeTop(name, mod, file) {
  const sys = await projectSystem(name);
  if (!sys) throw toolError(`the System project '${name}' has no System document (.sys.json)`);
  const r0 = readSystem(await fsp.readFile(await projectPath(name, sys), 'utf8'));
  if (r0.error) throw toolError(`${sys}: ${r0.error}`);
  const r = nodeTop(r0.system, mod, file);
  if (r.error) throw toolError(r.error);
  if (r.system) await fsp.writeFile(await projectPath(name, sys, 'write'), writeSystem(r.system));
  return { text: `${name}: ${r.text}.`, data: { project: name, top: sys, node: r.node, nodeTop: mod, changed: !!r.system } };
}
