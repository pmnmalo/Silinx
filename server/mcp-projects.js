// The MCP server's tools of the projects and their files (server/mcp.js, #134): the examples, the projects,
// a new project, its top module and test bench, its settings and files, reading and writing a file.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { readWithin } from './paths.js';
import { orderExamples } from '../core/examples.js';
import { nameUnnamed } from '../core/schname.js';
import { SYSTEM_KIND, DESIGN_KIND, isSystemProject, isDesignOnly, newSystemKind, offeredExamples } from '../core/project-kind.js';
import { PROFILES, profileOf } from '../core/project-profile.js';
import { systemsOn, SYSTEMS_OFF } from '../core/build-channel.js';
import { placeText } from '../core/project-place.js';
import { withPlaces } from './project-places.js';
import { TOP_TYPES, topTypeRefusal } from '../core/top-types.js';
import { topSourceFiles } from '../core/top-source.js';
import { designProjectInfo } from './mcp-design-only.js';
import { flowFiles } from '../core/flow-files.js';
import { topRefusal } from '../core/project-entries.js';
import { makeSystemTop, makeModuleTop } from './mcp-system-top.js';
import { SYSTEM_TOP } from '../core/system-top.js';
import { isSystemFile } from '../core/system-doc.js';
import { projectNodes } from '../core/project-nodes.js';
import { projectSystem } from '../core/project-system.js';
import { toolError, clip, projectPath, readProject, viewSourcesOf, STR, PROJECT, deviceName, boardDevice, redactor } from './mcp-util.js';
import { backupOfDir } from './backup-store.js';
import { lastBackup, BACKUP_HOW } from '../core/backup.js';

// a project the MCP server makes is untrusted (#2981): its tools' results say so
/** project_info's result with where the project is stored and its last back-up (#4971). */
function withBackup(name, r) {
  const folder = P.projectDir(name), last = lastBackup(backupOfDir(folder));
  return { ...r, text: `${r.text}\n  stored in the folder ${folder} on the disk; last back-up: ${last ? `${last.at}, ${BACKUP_HOW[last.how]}` : 'none recorded'}`,
    data: { ...r.data, stored: { kind: 'folder', folder }, lastBackup: last } };
}
const UNTRUSTED = ' It is untrusted, as every project an assistant makes: Xilinx ISE and programming a board or a PROM wait until the user trusts it in the interface (Trust Project); the Silinx toolchain runs.';

// a schematic's text with its unnamed instances named (#3300): { text, names }, or null when none is (or not JSON)
function nameInstances(text) {
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (!m || !Array.isArray(m.symbols)) return null;
  const names = nameUnnamed(m);
  return names.length ? { text: JSON.stringify(m, null, 1), names } : null;
}

// New Project's flow (#4121, web/js/wizards.js's): the Preferred Language (a design and simulation project's VHDL) and
// the Top-Level Source Type saved, then the top document made (core/top-source.js) and the top module 'top'; its file or null
async function startTop(name, designOnly, type, language = 'vhdl') {
  await P.updateProject(name, pj => ({ ...pj, preferredLanguage: designOnly ? 'vhdl' : language, ...(type !== undefined ? { topSourceType: type } : {}) }));
  const top = type !== undefined ? await topSourceFiles(type, language) : null;
  if (!top) return null;
  for (const f of top.files) await P.writeFile(name, f.path, f.text);
  await P.updateProject(name, pj => ({ ...pj, top: 'top' }));
  return top.file;
}

// the roots of a view's hierarchy as the Design pane lists them (#3819): the Implementation view's top first, then in
// natural order (x_2 before x_10); none when the sources do not compile
async function hierarchyOf(name, pj, sim) {
  const { compile } = await import('../core/compile.js');
  const { hierarchyRoots } = await import('../core/hier-order.js');
  try { return hierarchyRoots(compile(await viewSourcesOf(name, pj, sim)), { sim, top: pj.top || '' }); } catch { return []; }
}

// each profile in a few words, new_project's (its arguments' size limits, #4752, #5097)
const PROFILE_SHORT = { logic: 'drawings simulated, no board, no HDL shown', fpga: 'the default', embedded: 'FPGA and MCU nodes in a System', system: 'and terminals' };

// a project's System (core/project-system.js, #5416's phase 3: implicit for an FPGA or a design project) and its nodes
// (core/project-nodes.js, #5414): its System document's text read; each node as project_info says it
async function systemOf(name, pj) {
  const files = (await P.fileTree(name)).filter(f => !/^build\//.test(f));
  const system = isSystemProject(pj) ? files.find(isSystemFile) : null;
  const texts = system ? { [system]: await P.readFile(name, system).catch(() => '') } : {};
  return { system: projectSystem(pj, { files, texts }).model, nodes: projectNodes(pj, { files, texts }).nodes };
}
const nodeText = n => `${n.id} (${[n.kind, n.board].filter(Boolean).join(', ')}${n.module ? `: module ${n.module}` : ''}${n.files.length ? `: ${n.files.join(', ')}` : ''})`;

export const PROJECT_TOOLS = [
  {
    name: 'list_examples', title: 'List the example projects',
    description: 'The example projects a new project can start from (new_project_from_example), in the interface\'s order, with their top module, device and board.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run() {
      const about = (dir, n) => {
        const pj = JSON.parse(fs.readFileSync(path.join(dir, n, 'silinx.json'), 'utf8'));
        // (a System example: its System its top, no board nor device, #4702)
        if (isSystemProject(pj)) return { name: n, kind: SYSTEM_KIND, top: null, simTop: null, board: null, device: null, files: (pj.files || []).length };
        return { name: n, top: pj.top, simTop: pj.simTop || null, board: pj.board || null, device: pj.device ? `${pj.device.part}${pj.device.package}${pj.device.speed}` : null, files: (pj.files || []).length };
      };
      // (the examples only, as New Project's Start from: not the test designs, #5108)
      const examples = offeredExamples(orderExamples(P.templateNames(P.EXAMPLES_DIR))).map(n => about(P.EXAMPLES_DIR, n));   // (#5202)
      const text = examples.map(e => e.kind ? `${e.name}: a System example (FPGA and microcontroller nodes in a System), ${e.files} file(s)` : `${e.name}: top ${e.top}${e.simTop ? `, test bench ${e.simTop}` : ''}, ${e.board || 'no board'} (${e.device}), ${e.files} file(s)`);
      return { text: text.join('\n'), data: { examples } };
    },
  },
  {
    name: 'list_projects', title: 'List the projects',
    description: 'The projects of the Silinx workspace, with their top module, device and board, and where each is kept (the workspace folder, its GitHub repository).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run() {
      // (a design project's: no board, no device, its kind instead, #3891)
      // (where each is kept, as Open Project's Stored In: the workspace folder, its GitHub repository, #4314)
      // (a damaged one, its silinx.json unreadable: listed with why, #4755)
      const projects = (await withPlaces(await P.listProjects())).map(p => ({ ...(p.damaged ? { name: p.name, damaged: p.damaged } : isDesignOnly(p) ? { name: p.name, top: p.top || null, kind: DESIGN_KIND, board: null, device: null }
        : { name: p.name, top: p.top || null, board: p.board || null, device: p.device ? `${p.device.part}${p.device.package}${p.device.speed}` : null }), stored: p.stored, github: p.github }));
      return { text: projects.length ? projects.map(p => p.damaged ? `${p.name}: damaged, ${p.damaged}; ${placeText(p)}` : `${p.name}: top ${p.top || '(none)'}, ${p.kind ? 'a design and simulation project (no FPGA)' : `${p.board || 'no board'} (${p.device})`}; ${placeText(p)}`).join('\n') : 'No project in the workspace (new_project_from_example makes one).', data: { workspace: P.workspaceDir(), projects } };
    },
  },
  {
    name: 'new_project_from_example', title: 'New project from an example',
    description: 'Make a new project in the workspace from an example (list_examples), optionally for another board (list_devices: basys2, nexys2, basys3…): its pins are then the board\'s.',
    inputSchema: { type: 'object', properties: { name: STR('The new project\'s name: a letter, then up to 63 letters, digits, - and _.'), example: STR('The example (list_examples).'), board: STR('The board (list_devices; default: the example\'s).'), variant: STR('The board\'s variant (default: the board\'s), e.g. 100 or 250 for the Basys2.') }, required: ['name', 'example'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ name, example, board, variant }) {
      // (an example, as New Project's Start from: not a test design, #5108)
      const dir = P.EXAMPLES_DIR;
      if (!/^[a-z0-9_-]+$/i.test(String(example || '')) || !fs.existsSync(path.join(dir, example, 'silinx.json'))) throw toolError(`unknown example '${example}' (list_examples)`);
      let device;
      if (board || variant) {
        const ex = JSON.parse(fs.readFileSync(path.join(dir, example, 'silinx.json'), 'utf8'));
        ({ board, device } = await boardDevice(board || ex.board, variant));
      }
      try { await P.createProject({ name, template: example, device, board, madeBy: 'mcp' }); } catch (e) { throw toolError(e.message); }
      const pj = await P.readProject(name);
      return { text: `Project '${name}' made from the example ${example}: top ${pj.top}, ${pj.board || 'no board'} (${pj.device.part}${pj.device.package}${pj.device.speed}).${UNTRUSTED}`, data: { project: name, top: pj.top, simTop: pj.simTop || null, board: pj.board, device: pj.device, trusted: false } };
    },
  },
  {
    name: 'new_project', title: 'New empty project',
    description: 'Make a new empty project in the workspace for a board (list_devices; default: the Basys2-250\'s device, no board); then write_file its sources (a test bench in sim/) and set_top. profile logic (Digital Logic): no board, device or constraints; drawings (new_source) simulated with test_bench_wizard and simulate; no implementation, emulation or programming (set_design_properties with a board makes it an FPGA project). top_source_type: its top document, module \'top\' (a drawing\'s HDL generated; top.c / .cpp: HLS\'s function; hdl: none; system: a System project).',
    inputSchema: { type: 'object', properties: { name: STR('The new project\'s name: a letter, then up to 63 letters, digits, - and _.'), board: STR('The board (list_devices).'), variant: STR('The board\'s variant (default: the board\'s), e.g. 100 or 250 for the Basys2.'), profile: { type: 'string', enum: PROFILES.map(p => p.id), description: `Its profile, New Project's first page: ${PROFILES.map(p => `${p.id} (${p.label}: ${PROFILE_SHORT[p.id]})`).join(', ')}.` },
      top_source_type: { type: 'string', enum: TOP_TYPES.map(t => t.id), description: 'Its Top-Level Source Type, as New Project\'s (tt: Boolean algebra; a design project\'s: a drawing; system: a System project); saved, its top document made.' },
      language: { type: 'string', enum: ['vhdl', 'verilog'], description: 'Its Preferred Language, as New Project\'s (default vhdl): the top document\'s HDL module\'s.' } }, required: ['name'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ name, board, variant, profile, top_source_type: type, language }) {
      // (its profile, #5440; kind and design_only, its deprecated names: server/mcp-aliases.js); as a new project's kind
      const given = profile === 'logic' ? DESIGN_KIND : profile;
      // (a System project, #4702: no board, its System document, no top document)
      // (top_source_type system: a System project too, its System its top, #5402)
      if (newSystemKind(given) || (type === SYSTEM_TOP && given !== DESIGN_KIND)) {
        if (!systemsOn()) throw toolError(SYSTEMS_OFF);   // (#5202)
        if (board || variant || (type !== undefined && type !== SYSTEM_TOP)) throw toolError('a System project (profile system or embedded) has no board nor top document: its System (edit_system) names each FPGA node\'s board');
        try { await P.createProject({ name, kind: newSystemKind(given) ? given : SYSTEM_KIND, madeBy: 'mcp' }); } catch (e) { throw toolError(e.message); }
        const sys = `${name}.sys.json`;
        return { text: `Empty System project '${name}' made: its System ${sys} (no node yet). Write its modules with write_file, its firmware (.hex, .elf), then edit_system.${UNTRUSTED}`, data: { project: name, kind: SYSTEM_KIND, profile: newSystemKind(given) ? given : 'system', board: null, system: sys, trusted: false } };
      }
      const designOnly = (given ?? 'fpga') === DESIGN_KIND;
      if (designOnly && (board || variant)) throw toolError('a Digital Logic project (profile logic) has no board: give profile logic or a board, not both');
      const refusal = type !== undefined && topTypeRefusal({ kind: designOnly ? DESIGN_KIND : null }, type);
      if (refusal) throw toolError(refusal);
      let device;
      if (board || variant) ({ board, device } = await boardDevice(board, variant));
      try { await P.createProject({ name, device, board, kind: designOnly ? DESIGN_KIND : null, madeBy: 'mcp' }); } catch (e) { throw toolError(e.message); }
      const flow = type !== undefined || language !== undefined;
      const top = flow ? await startTop(name, designOnly, type, language) : null;
      const pj = await P.readProject(name);
      const made = top ? ` It starts with ${top} (the top module 'top').` : '';
      const more = flow ? { topSourceType: pj.topSourceType ?? null, preferredLanguage: pj.preferredLanguage, top: pj.top || null, topFile: top } : {};
      if (designOnly) return { text: `${top ? '' : 'Empty '}Digital Logic project '${name}' made (a design and simulation project).${made} Add its drawings with new_source${top ? '' : ', then set_top'}.`, data: { project: name, kind: DESIGN_KIND, board: null, device: null, ...more, trusted: false } };
      return { text: `${top ? 'P' : 'Empty p'}roject '${name}' made: ${pj.board || 'no board'} (${deviceName(pj.device)}).${made} Write its sources with write_file${top ? '' : ', then set_top'}.${UNTRUSTED}`, data: { project: name, board: pj.board || null, device: pj.device, ...more, trusted: false } };
    },
  },
  {
    name: 'set_top', title: 'Set the top module and the test bench',
    description: 'Choose a project\'s top module (what run_process builds) and / or its test bench (what simulate runs), as Set as Top Module does: any module of its view, even one with errors; a System (.sys.json): a System project then, its module an FPGA one. update_constraints: the constraints file written again from the board\'s pins, as Update Constraints does.',
    inputSchema: { type: 'object', properties: { project: PROJECT, top: STR('The top module (an entity or module of the project\'s design sources).'), sim_top: STR('The test bench (a simulation source\'s entity or module).'), update_constraints: { type: 'boolean', description: 'Write the constraints file again from the board\'s pins (default false).' } }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async run({ project: name, top, sim_top: simTop, update_constraints: constraints = false }) {
      const before = await readProject(name);
      if (!top && !simTop) throw toolError('give top, sim_top or both');
      // (a System: the project made a System project, it its top, #5402)
      if (top && isSystemFile(top)) { if (simTop) throw toolError('a System as the top: give no sim_top with it'); return makeSystemTop(name, top); }
      // each a module of its view, even one with errors (core/project-entries.js topRefusal, the interface's rule, #4733:
      // check_syntax says its errors); a C source's or a drawing's module not made for now too (#2995)
      for (const [mod, sim] of [[top, false], [simTop, true]]) {
        if (!mod) continue;
        const { compile } = await import('../core/compile.js');
        const failed = [];
        const srcs = await viewSourcesOf(name, before, sim, failed);
        let names = [];
        try { names = [...compile(srcs).modules.values()].filter(m => m.kind !== 'package').map(m => m.name); } catch { /* none */ }
        const same = a => String(a || '').toLowerCase() === String(mod).toLowerCase();
        const refusal = topRefusal(mod, sim, () => names.some(same) || failed.some(v => same(v.module)));
        if (refusal) throw toolError(refusal);
      }
      // (a module of a System project: an FPGA project again, on its FPGA node's board, #5402)
      if (top && isSystemProject(before)) { const r = await makeModuleTop(name, top); if (simTop) await P.updateProject(name, pj => ({ ...pj, simTop })); return r; }
      if (constraints && !before.board) throw toolError(`the project '${name}' has no board: its constraints cannot come from a board's pins`);
      await P.updateProject(name, pj => ({ ...pj, ...(top ? { top } : {}), ...(simTop ? { simTop } : {}) }));
      const pj = await P.readProject(name);
      if (constraints) await P.boardConstraints(P.projectDir(name), pj);
      return { text: `${name}: top ${pj.top || '(none)'}, test bench ${pj.simTop || '(none)'}${constraints ? `; ${pj.constraints} written from the ${pj.board}'s pins` : ''}.`, data: { project: name, top: pj.top || null, simTop: pj.simTop || null, constraintsUpdated: constraints } };
    },
  },
  {
    name: 'project_info', title: 'A project\'s settings and files',
    description: 'Where a project is stored (stored: its folder) and its last back-up (lastBackup: { at, how: export or github }, null when none was recorded); its nodes and System (system: implicit with one node), top module, test bench, device, board, constraints file, its files (path, language, role: design, sim or impl), the roots of its hierarchy in the Implementation and Simulation views as the Design pane lists them, and the files the implementation and the Board Emulator read beside the HDL (flowFiles: its constraints, then the memory images); when shared live by share_project: sharing, its mode and its followers (each p2p or relay).',
    inputSchema: { type: 'object', properties: { project: PROJECT }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name }) {
      const pj = await readProject(name);
      // (a design and simulation project, #3780: its HDL not shown, nor its internal device)
      // (shared live by share_project, #4643: its mode, its followers and their paths)
      // (where it is kept and its last back-up, #4971: the application's own, as its Start page's)
      const shared = async r => (await import('./mcp-collab.js')).withSharing(name, withBackup(name, r));
      // (its nodes, #5414, #5416: one, implicit, for an FPGA or a design project; a System's, each with its files; and its
      // System, the model of a System document, implicit for those: #5416's phase 3)
      const { system, nodes } = await systemOf(name, pj);
      if (isDesignOnly(pj)) { const r = designProjectInfo(name, pj, await P.fileTree(name)); Object.assign(r.data, { nodes, system }); return shared(r); }
      const files = (pj.files || []).map(f => ({ path: f.path, lang: f.lang, role: f.role || 'design' }));
      const all = (await P.fileTree(name)).filter(f => !/^build\//.test(f));
      const hierarchy = { implementation: await hierarchyOf(name, pj, false), simulation: await hierarchyOf(name, pj, true) };
      // (the files the implementation and the emulator read, as the Implementation view lists them under the top, #4591)
      const flow = flowFiles(pj, all);
      const data = { nodes, system, project: name, top: pj.top || null, simTop: pj.simTop || null, device: pj.device || null, board: pj.board || null, constraints: pj.constraints || null, synthTool: pj.synthTool || null, files, otherFiles: all.filter(f => !files.some(x => x.path === f) && f !== 'silinx.json'), hierarchy, flowFiles: flow };
      return shared({ text: [`${name}: top ${data.top || '(none)'}, test bench ${data.simTop || '(none)'}, ${data.board || 'no board'} (${data.device ? `${data.device.part}${data.device.package}${data.device.speed}` : 'no device'}), constraints ${data.constraints || '(none)'}`,
        ...files.map(f => `  ${f.path} (${f.lang}, ${f.role})`), ...(data.otherFiles.length ? [`  other files: ${data.otherFiles.join(', ')}`] : []),
        ...Object.entries(hierarchy).filter(([, r]) => r.length).map(([v, r]) => `  ${v} hierarchy: ${r.join(', ')}`),
        ...(flow.length ? [`  implementation and emulation files: ${flow.map(f => `${f.path} (${f.kind})`).join(', ')}`] : []),
        ...(isSystemProject(pj) ? [`  nodes: ${nodes.map(nodeText).join('; ') || '(none)'}`] : [])].join('\n'), data,
      // (its silinx.json's fields and its files' names: the project's own text, #3528)
      untrusted: 'the project\'s settings and files\' names' });
    },
  },
  {
    name: 'read_file', title: 'Read a file of a project',
    description: 'The text of a file of a project (a source, the constraints, a drawing\'s JSON, a report of build/…).',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The file\'s path in the project, e.g. src/top.vhd.') }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, path: rel }) {
      await readProject(name);
      const full = await projectPath(name, rel);
      let text;
      // (the file opened checked too, #4744)
      try { text = await readWithin(P.projectDir(name), full, 'utf8'); } catch (e) { throw toolError(e.status === 400 ? `'${rel}' is outside the project '${name}'` : `no file '${rel}' in the project '${name}'`); }
      // (a report or a log of build/ redacted as get_report's: the ISE machine's address never in a result, #3418)
      if (/^build\//i.test(P.relKey(P.projectDir(name), full))) text = (await redactor())(text);
      return { text: clip(text), data: { project: name, path: rel, length: text.length }, untrusted: `the file ${rel}` };
    },
  },
  {
    name: 'write_file', title: 'Write a file of a project',
    description: 'Write (create or replace) a file of a project. A new HDL file is added to the project (in sim/ or named tb_…: a simulation source). A drawing (.sch, .asm, .fsm, .tt, .bool or .pn .json) makes its HDL file again, as its editor does on save; one with errors leaves it as it was; one whose HDL file is taken gets none (said). A truth table\'s "kmapOrder": "rows" lays its Karnaugh maps\' variables out MSB → LSB by rows, then columns (left out: by columns, then rows). A state diagram\'s transition: "bend" (px, a signed bow) and a self-loop\'s "angle" (degrees); neither changes its HDL. A schematic instance with an empty "name" gets the next free inst_n. An open editor keeps its text until reopened.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The file\'s path in the project, e.g. src/counter.vhd.'), text: STR('The whole text of the file.') }, required: ['project', 'path', 'text'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async run({ project: name, path: rel, text }) {
      await readProject(name);
      if (typeof text !== 'string') throw toolError('text: the whole text of the file');
      // the path as the project lists it: ./silinx.json is silinx.json (#1233)
      const full = await projectPath(name, rel, 'written');
      const key = P.relKey(P.projectDir(name), full);
      const low = P.foldName(key);   // (ſilinx.json is silinx.json on a case-insensitive file system, #2956)
      if (await P.isProjectFileAt(P.projectDir(name), full) || low === 'build' || low.startsWith('build/')) throw toolError(`'${rel}' is written by Silinx itself`);
      // what an assistant writes comes from outside: through the import gate (#2830), as a file added to a project
      const { GateError, gateFile } = await import('../core/import-gate.js');
      let gated;
      try { gated = gateFile(key, text); } catch (e) { throw e instanceof GateError ? toolError(`${e.path}: not written: ${e.reason}`) : e; }
      rel = key;
      // a schematic's instance with an empty name: its automatic name, inst_n, as the editor gives it (#3300)
      const named = /\.sch\.json$/i.test(rel) ? nameInstances(text) : null;
      if (named) text = named.text;
      const existed = (await P.fileTree(name)).includes(rel);
      try { await P.writeFile(name, rel, text); } catch (e) { throw toolError(e.message); }
      const added = !existed && (await P.readProject(name)).files.some(f => f.path === rel);
      // a drawing: its HDL file made again from it (#2674), as its editor does when it is saved
      const { adoptDrawing, syncDrawing } = await import('./drawing-sync.js');
      // (one with no HDL file yet gets it, #3184)
      const sync = await syncDrawing(P, name, rel) || await adoptDrawing(P, name, rel);
      return { text: [...(gated.warning ? [`WARNING: ${gated.warning}`] : []), `${existed ? 'Wrote' : 'Created'} ${rel} (${text.length} characters)${added ? ', added to the project' : ''}.`,
        ...(named?.names || []).map(n => `The instance ${n.id}, its name empty, named ${n.name} (an automatic name, not drawn).`), ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, created: !existed, addedToProject: added, ...(named ? { named: named.names } : {}), ...(sync ? { hdl: { file: sync.target, written: !!sync.written, removed: sync.removed, stale: sync.stale, ...(sync.clash ? { clash: { kind: sync.clash.kind, file: sync.clash.file } } : {}) } } : {}) } };
    },
  },
];
