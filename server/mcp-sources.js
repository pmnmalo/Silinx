// The MCP server's tools of a project's sources (server/mcp.js, #2674), as the Design pane's menus do them:
// Unset as Top Module (web/js/design.js unsetTop), Remove from Project and Add to Project (the file kept in the
// project folder: design.js removeNow, app.js addNow), Rename of a file or a folder (the drawings' links to it
// updated: web/js/rename.js renameSource) and of a module (its references with it: server/rename-module.js), Delete File / Delete Folder and the deletion of a project (moved to
// the workspace's .trash). A top module the project no longer has becomes the one root left of its view, else
// none (web/js/app.js fixMissingTops).
import * as P from './projects.js';
import { toolError, projectPath, readProject, viewSourcesOf, STR, PROJECT } from './mcp-util.js';
import { hdlSideFile, isDesignOnly } from '../core/project-kind.js';
import { addToProject, addsToProject, declares, missingTops, removeFromProject } from '../core/project-entries.js';

const VIEW_RE = /\.(sch|asm|tt|bool|fsm|pn|circ|regs)\.json$/i;

// the tops of a project no longer declared by its sources: the view's one root, else none; the messages of the
// interface's console (core/project-entries.js missingTops, the interface's, #4733: a C source's or a drawing's module
// not made for now is still the top, #2995)
async function fixMissingTops(name) {
  const { compile } = await import('../core/compile.js');
  const { topCandidates } = await import('../core/elaborate.js');
  const pj = await P.readProject(name);
  const views = {};
  for (const sim of [false, true]) {
    const failed = [];
    const srcs = await viewSourcesOf(name, pj, sim, failed);
    let roots = [];
    try { roots = topCandidates(compile(srcs)); } catch { /* none */ }
    views[sim] = { srcs, failed, roots };
  }
  const same = (a, b) => String(a || '').toLowerCase() === String(b).toLowerCase();
  const has = (mod, sim) => views[sim].srcs.some(s => declares(s.text, mod)) || views[sim].failed.some(v => same(v.module, mod));
  const { set, messages } = missingTops(pj, { has, roots: sim => views[sim].roots }, { another: 'set_top', set: 'set_top' });
  if (Object.keys(set).length) await P.updateProject(name, p => ({ ...p, ...set }));
  return messages.map(m => `${m.level === 'warn' ? 'WARNING' : 'INFO'}: ${m.text}`);
}

// a path of the project as the project lists it, inside it, not hidden; not silinx.json nor build/ (verb: what the
// tool does with it)
async function sourcePath(name, rel, verb, opts) {
  if (typeof rel !== 'string' || !rel) throw toolError('path: a file\'s path in the project (project_info)');
  const full = await projectPath(name, rel, verb, opts);
  const key = P.relKey(P.projectDir(name), full);
  if (!key) throw toolError('path: a file\'s path in the project, not the project\'s folder');
  if (await P.isProjectFileAt(P.projectDir(name), full)) throw toolError(`${P.PROJECT_FILE} is the project's description`);
  return key;
}

const tops = async name => { const pj = await P.readProject(name); return { top: pj.top || null, simTop: pj.simTop || null }; };

export const SOURCE_TOOLS = [
  {
    name: 'unset_top', title: 'Unset as Top Module',
    description: 'Unset a project\'s top module (or, with simulation, its test bench), as Unset as Top Module does: the project has none then, until set_top.',
    inputSchema: { type: 'object', properties: { project: PROJECT, simulation: { type: 'boolean', description: 'Unset the test bench (the simulation top) instead.' } }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, simulation = false }) {
      const pj = await readProject(name);
      const key = simulation ? 'simTop' : 'top';
      const old = pj[key];
      if (!old) return { text: `The project '${name}' has no ${simulation ? 'test bench' : 'top module'}: nothing to unset.`, data: { project: name, unset: null, ...await tops(name) } };
      await P.updateProject(name, p => ({ ...p, [key]: '' }));
      return { text: `Top-level ${simulation ? 'simulation ' : ''}module '${old}' unset: the project has no ${simulation ? 'test bench' : 'top module'} (set_top makes one).`, data: { project: name, unset: old, ...await tops(name) } };
    },
  },
  {
    name: 'remove_from_project', title: 'Remove from Project',
    description: 'Remove a source from the project, as Remove from Project does: the file stays in the project folder (add_to_project brings it back); a drawing\'s generated HDL file leaves with it. A top module no longer in the project becomes the one root of its view, else none.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The file\'s path in the project (project_info).'), with_hdl: { type: 'boolean', description: 'A drawing: its HDL file removed too (default true).' } }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, path: rel, with_hdl: withHdl = true }) {
      await readProject(name);
      const file = await sourcePath(name, rel, 'removed');
      const tree = await P.fileTree(name);
      if (!tree.includes(file)) throw toolError(`no file '${file}' in the project '${name}'`);
      const pj0 = await P.readProject(name);
      if (!pj0.files.some(f => f.path === file) && (pj0.excluded || []).includes(file)) throw toolError(`'${file}' is not in the project (add_to_project brings it back)`);
      // a drawing's own HDL file (its generatedFile, in the project)
      let hdl = null;
      if (withHdl && VIEW_RE.test(file)) {
        try { const g = JSON.parse(await P.readFile(name, file)).generatedFile; if (g && tree.includes(g) && pj0.files.some(f => f.path === g)) hdl = g; } catch { /* not a drawing's JSON */ }
      }
      await P.updateProject(name, pj => removeFromProject(pj, [file, hdl]));
      const lines = await fixMissingTops(name);
      // (a design project's: the drawing alone named, its HDL never shown, as the interface's, #3891)
      if (isDesignOnly(pj0)) return { text: [...lines, `Removed ${file} from the project (the file is kept in the project folder).`].join('\n'), data: { project: name, removed: [file], ...await tops(name), messages: lines } };
      const text = [...lines, hdl ? `Removed ${file} and its HDL file ${hdl} from the project (the files are kept in the project folder).` : `Removed ${file} from the project (the file is kept in the project folder).`];
      return { text: text.join('\n'), data: { project: name, removed: [file, hdl].filter(Boolean), ...await tops(name), messages: lines } };
    },
  },
  {
    name: 'add_to_project', title: 'Add to Project',
    description: 'Add a file of the project folder into the project, as Add to Project does: an HDL file as a source (a test bench in sim/ or named tb_… as a simulation source), a constraints file (UCF, PCF, LPF, CST, CCF, XDC) as the constraints when there are none.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The file\'s path in the project folder.') }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, path: rel }) {
      await readProject(name);
      const file = await sourcePath(name, rel, 'added');
      if (/^build(\/|$)/i.test(file)) throw toolError(`'${file}' is written by Silinx itself`);
      if (!(await P.fileTree(name)).includes(file)) throw toolError(`no file '${file}' in the project folder of '${name}'`);
      if (!addsToProject(await P.readProject(name), file)) return { text: `${file} is in the project already.`, data: { project: name, added: false } };
      await P.updateProject(name, pj => addToProject(pj, file));
      const entry = (await P.readProject(name)).files.find(f => f.path === file);
      return { text: `${file} added to the project${entry ? ` (${entry.lang}, ${entry.role})` : ''}.`, data: { project: name, added: true, path: file, role: entry?.role || null } };
    },
  },
  {
    name: 'rename_file', title: 'Rename a file or a folder',
    description: 'Rename or move a file or a folder of a project, as Rename does: the project\'s list of files, its constraints file and the drawings\' links to their HDL follow. A module is renamed by rename_module.',
    inputSchema: { type: 'object', properties: { project: PROJECT, from: STR('The file\'s or folder\'s path in the project.'), to: STR('Its new path in the project.') }, required: ['project', 'from', 'to'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ project: name, from, to }) {
      await readProject(name);
      const a = await sourcePath(name, from, 'renamed'), b = await sourcePath(name, to, null, { last: false });
      if (/^build(\/|$)/i.test(a) || /^build(\/|$)/i.test(b)) throw toolError('build/ is written by Silinx itself');
      // (the new name by the import gate's rules: P.renameFile, as the interface's Rename, #2973)
      if (a === b) return { text: `${a}: the same path, nothing renamed.`, data: { project: name, from: a, to: b, links: [] } };
      try { await P.renameFile(name, a, b); } catch (e) { throw toolError(e.message); }
      // the drawings linked to a renamed HDL file (or to one in a renamed folder) follow it
      const tree = await P.fileTree(name);
      const remap = p => (p === a ? b : p?.startsWith(`${a}/`) ? b + p.slice(a.length) : null);
      const links = [];
      for (const f of tree.filter(f => VIEW_RE.test(f))) {
        let d;
        try { d = JSON.parse(await P.readFile(name, f)); } catch { continue; }
        const np = remap(d.generatedFile);
        if (!np) continue;
        d.generatedFile = np;
        await P.writeFile(name, f, JSON.stringify(d, null, /\.(asm|tt|bool|fsm|regs)\.json$/i.test(f) ? 2 : 1));
        links.push(f);
      }
      return { text: `Rename: ${a} → ${b}${links.length ? ` (the link of ${links.join(', ')} updated)` : ''}.`, data: { project: name, from: a, to: b, links } };
    },
  },
  {
    name: 'rename_module', title: 'Rename a module',
    description: 'Rename a module, as Rename does: its declaration and instances in every source, its schematic symbols (layout kept) and symbol file, the drawing it is generated from, the project\'s top and test bench. Its file follows when named after the module (file: another path, or keep); the changed drawings make their HDL again.',
    inputSchema: { type: 'object', properties: { project: PROJECT, module: STR('The module\'s name now.'), to: STR('Its new name (a letter, then letters, digits and _).'), file: STR('Its file\'s new path, or keep (default: the file with the new name when it is named after the module).') }, required: ['project', 'module', 'to'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ project: name, module: oldName, to: newName, file }) {
      await readProject(name);
      if (typeof newName !== 'string' || !newName) throw toolError('to: the module\'s new name');
      const R = await import('./rename-module.js');
      const mod = (await R.projectModules(P, name)).find(m => m.name.toLowerCase() === String(oldName).toLowerCase() && m.kind !== 'package');
      const design = isDesignOnly(await P.readProject(name));   // (a design project's: its HDL never named, #3891)
      if (!mod) throw toolError(design ? `no module '${oldName}' in the project` : `no module '${oldName}' in the project's HDL files (a drawing with no HDL file: write_file its name)`);
      let to = null;
      if (file === undefined) to = R.followingFile(mod.file, mod.name, newName);
      else if (file !== 'keep') to = await sourcePath(name, file, 'renamed');
      let r;
      try { r = await R.renameModule(P, name, mod.name, newName, { to, hidden: design ? hdlSideFile : null }); } catch (e) { throw toolError(e.message); }
      return { text: [r.message, ...r.hdl].join('\n'), data: { project: name, module: r.module, file: r.file, changed: r.changed, moved: r.moved.map(([a, b]) => ({ from: a, to: b })), ...await tops(name) } };
    },
  },
  {
    name: 'delete_file', title: 'Delete a file or a folder',
    description: 'Delete a file or folder of a project, as Delete File / Delete Folder does: moved to the workspace\'s .trash (its place named in the result), from where it can be moved back by hand. A top module no longer in the project becomes the one root of its view, else none.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The file\'s or folder\'s path in the project.') }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run({ project: name, path: rel }) {
      await readProject(name);
      const file = await sourcePath(name, rel, 'deleted');
      const tree = await P.fileTree(name);
      const folder = !tree.includes(file);
      if (folder && !tree.some(f => f.startsWith(`${file}/`))) throw toolError(`no file or folder '${file}' in the project '${name}'`);
      const count = folder ? tree.filter(f => f.startsWith(`${file}/`)).length : 1;
      let r;
      try { r = await P.deleteFile(name, file, { trash: true, mustExist: true }); } catch (e) { throw toolError(e.message); }
      const lines = await fixMissingTops(name);
      return { text: [...lines, `${file} deleted (${folder ? `a folder: ${count} file(s); ` : ''}moved to the workspace's .trash folder: ${r.trashed}).`].join('\n'), data: { project: name, deleted: file, folder, files: count, trashed: r.trashed, ...await tops(name), messages: lines } };
    },
  },
  {
    name: 'delete_project', title: 'Delete a project',
    description: 'Delete a project of the workspace: its folder is moved to the workspace\'s .trash folder (from where it can be taken back by hand).',
    inputSchema: { type: 'object', properties: { project: PROJECT }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run({ project: name }) {
      await readProject(name);
      try { await P.deleteProject(name); } catch (e) { throw toolError(e.message); }
      return { text: `Project '${name}' deleted (moved to the workspace's .trash folder).`, data: { project: name, deleted: true } };
    },
  },
  {
    name: 'rename_project', title: 'Rename a project',
    description: 'Rename a project, as Rename Project… does: to, a letter, then up to 63 letters, digits, - and _, no other project\'s in any case. Its folder moves whole (.git too; a failure leaves it as it was), silinx.json\'s name and <name>.xise follow. Refused while a process of it runs or it is shared live.',
    inputSchema: { type: 'object', properties: { project: PROJECT, to: STR('The project\'s new name.') }, required: ['project', 'to'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ project: name, to }) {
      await readProject(name);
      const { renameProjectChecked } = await import('./project-rename.js');
      const { sharedHere } = await import('./mcp-collab.js');
      let r;
      try { r = await renameProjectChecked(name, to, { shared: sharedHere }); } catch (e) { throw toolError(e.message); }
      return { text: r.message, data: { project: to, renamed: name } };
    },
  },
];
