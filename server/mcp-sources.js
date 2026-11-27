// The MCP server's tools of a project's sources (server/mcp.js, #2674), as the Design pane's menus do them:
// Unset as Top Module (web/js/design.js unsetTop), Remove from Project (the files kept in the project folder, or deleted:
// design-remove.js, #5720) and Add to Project (app.js addNow), Rename of a file or a folder (the drawings' links to it
// updated: web/js/rename.js renameSource) and of a module (its references with it: server/rename-module.js), Delete File / Delete Folder and the deletion of a project (moved to
// the workspace's .trash). A top module the project no longer has becomes the one root left of its view, else
// none (web/js/app.js fixMissingTops).
import * as P from './projects.js';
import { toolError, projectPath, readProject, viewSourcesOf, STR, PROJECT } from './mcp-util.js';
import { hdlSideFile, isDesignOnly, isSystemProject } from '../core/project-kind.js';
import { NODE_UNSET_REFUSAL } from '../core/system-top.js';
import { addToProject, addsToProject, declares, missingTops, removeFromProject, removedMessage } from '../core/project-entries.js';

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
      // (a System project: its top its System, each FPGA node's top module always there, #5583)
      if (!simulation && isSystemProject(pj)) throw toolError(NODE_UNSET_REFUSAL);
      const key = simulation ? 'simTop' : 'top';
      const old = pj[key];
      if (!old) return { text: `The project '${name}' has no ${simulation ? 'test bench' : 'top module'}: nothing to unset.`, data: { project: name, unset: null, ...await tops(name) } };
      await P.updateProject(name, p => ({ ...p, [key]: '' }));
      return { text: `Top-level ${simulation ? 'simulation ' : ''}module '${old}' unset: the project has no ${simulation ? 'test bench' : 'top module'} (set_top makes one).`, data: { project: name, unset: old, ...await tops(name) } };
    },
  },
  {
    name: 'remove_from_project', title: 'Remove from Project',
    description: 'Remove sources from the project, as Remove from Project does (one, or several selected in the Design pane): the files stay in the project folder (add_to_project brings them back), or, with delete, they are deleted too, as delete_file does (moved to the workspace\'s .trash); a drawing\'s generated HDL file goes with it. A top module no longer in the project becomes the one root of its view, else none.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The file\'s path in the project (project_info).'), paths: { type: 'array', items: { type: 'string' }, description: 'Several files\' paths in the project (instead of path).' }, with_hdl: { type: 'boolean', description: 'A drawing: its HDL file removed too (default true).' }, delete: { type: 'boolean', description: 'The files deleted too, into the workspace\'s .trash (default false: kept in the project folder).' } }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run({ project: name, path: rel, paths: rels, with_hdl: withHdl = true, delete: del = false }) {
      await readProject(name);
      if (rel !== undefined && rels !== undefined) throw toolError('path or paths, not both');
      const asked = rels !== undefined ? rels : [rel];
      if (!Array.isArray(asked) || !asked.length) throw toolError('paths: the files\' paths in the project (project_info)');
      const tree = await P.fileTree(name);
      const pj0 = await P.readProject(name);
      // every file checked before any is removed (#5720)
      const files = [];
      for (const r of asked) {
        const file = await sourcePath(name, r, 'removed');
        if (!tree.includes(file)) throw toolError(`no file '${file}' in the project '${name}'`);
        if (!pj0.files.some(f => f.path === file) && (pj0.excluded || []).includes(file)) throw toolError(`'${file}' is not in the project (add_to_project brings it back)`);
        if (!files.includes(file)) files.push(file);
      }
      // a drawing's own HDL file (its generatedFile, in the project); one asked too goes with its drawing
      const entries = files.map(file => ({ file, hdl: null }));
      if (withHdl) {
        for (const e of entries.filter(x => VIEW_RE.test(x.file))) {
          try { const g = JSON.parse(await P.readFile(name, e.file)).generatedFile; if (g && tree.includes(g) && pj0.files.some(f => f.path === g)) e.hdl = g; } catch { /* not a drawing's JSON */ }
        }
      }
      const owned = new Set(entries.map(e => e.hdl).filter(Boolean));
      const list = entries.filter(e => !owned.has(e.file));
      const all = list.flatMap(e => [e.file, e.hdl]).filter(Boolean);
      await P.updateProject(name, pj => removeFromProject(pj, all));
      const trashed = [];
      if (del) {
        for (const f of all) {
          try { trashed.push((await P.deleteFile(name, f, { trash: true, mustExist: true })).trashed); } catch (e) { throw toolError(e.message); }
        }
      }
      const lines = await fixMissingTops(name);
      // (a design project's: the drawing alone named, its HDL never shown, as the interface's, #3891)
      const hidden = isDesignOnly(pj0);
      const text = [...lines, ...list.map(e => removedMessage({ file: e.file, hdl: hidden ? null : e.hdl, deleted: del }))];
      return { text: text.join('\n'), data: { project: name, removed: hidden ? list.map(e => e.file) : all, deleted: del ? (hidden ? list.map(e => e.file) : all) : [], ...(del ? { trashed } : {}), ...await tops(name), messages: lines } };
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
    description: 'Delete projects (Open Project\'s Delete): each folder into the workspace\'s .trash. All checked first: refused while one\'s process runs or it is shared live.',
    inputSchema: { type: 'object', properties: { project: PROJECT, projects: { type: 'array', items: { type: 'string' }, description: 'Several (instead of project).' } }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run({ project: one, projects: many }) {
      if (one !== undefined && many !== undefined) throw toolError('project or projects, not both');
      const { deleteList } = await import('../core/project-delete.js');
      const { checkDelete, deleteProjectChecked } = await import('./project-delete.js');
      const { sharedHere } = await import('./mcp-collab.js');
      let names;
      try { names = deleteList(many !== undefined ? many : one !== undefined ? [one] : []); } catch { throw toolError('project or projects: the projects to delete (list_projects)'); }
      // every project checked before any is deleted (#5785)
      for (const name of names) { await readProject(name); try { checkDelete(name, { shared: sharedHere }); } catch (e) { throw toolError(e.message); } }
      const lines = [];
      for (const name of names) {
        try { lines.push((await deleteProjectChecked(name, { shared: sharedHere })).message); } catch (e) { throw toolError([...lines, `${name}: ${e.message}`].join('\n')); }
      }
      return { text: lines.join('\n'), data: { projects: names, deleted: true, ...(names.length === 1 ? { project: names[0] } : {}) } };
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
