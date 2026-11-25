// The MCP server's tools of a System project's System document (#4697, #2674, docs/SYSTEMS.md): check_system, the
// System's Check (core/system-check.js), with the project's modules (their ports, the FPGA nodes' modules elaborated) and
// its files (the firmware), each message as the console says it, after the System described (core/system-edit.js); edit_system, its
// nodes, interfaces and links edited as the System editor does (core/system-edit.js, #4700), then checked.
import * as P from './projects.js';
import { toolError, STR, PROJECT, projectText, readProject, elaborateView } from './mcp-util.js';
import { readSystem, writeSystem, isSystemFile } from '../core/system-doc.js';
import { systemsOn, SYSTEMS_OFF } from '../core/build-channel.js';
import { editSystem, describeSystem, EDIT_ACTIONS } from '../core/system-edit.js';
import { analyzeSystem, systemCheckLines, wiringLines } from '../core/system-check.js';
import { ucfPort } from '../core/board-constraints.js';
import { normalizeCircuit } from '../core/circuit.js';
import { layoutPlan } from '../core/system-layout.js';
import { planLines } from '../core/system-plan.js';
import { boardLines, matchBoards } from '../core/system-usb.js';
import { applyNodeFolders } from './system-folders.js';
import { constraintsTexts } from './system-constraints.js';
import { withNodePins, pinsToConstraints } from '../core/system-constraints.js';

// the circuit nodes' circuits ({ path: circuit }; one that cannot be read left out: its node's check says so, #5215)
async function projectCircuits(name, sys, files) {
  const out = {};
  for (const p of new Set(sys.nodes.filter(n => n.kind === 'circuit' && n.circuit && files.includes(n.circuit)).map(n => n.circuit))) {
    try { out[p] = normalizeCircuit(JSON.parse(await P.readFile(name, p))); } catch { /* (not a circuit: not checked) */ }
  }
  return out;
}

// the project's modules ({ name: ports, null when it does not elaborate }): every module of its sources, the FPGA nodes'
// elaborated
async function projectModules(name, sys) {
  const out = {};
  const tops = [...new Set(sys.nodes.filter(n => n.kind === 'fpga' && n.module).map(n => String(n.module)))];
  for (const top of tops) {
    let v;
    try { v = await elaborateView(name, { top }); } catch { continue; }
    for (const m of v.lib?.modules?.values() || []) if (!(m.name in out)) out[m.name] = null;
    if (v.design?.top) out[top] = v.design.top.ports.map(ucfPort).map(p => ({ name: p.name, dir: p.dir, width: p.width }));
  }
  return out;
}

// a System's Check (its text, `file` its path in the project `name`): { lines, errors, warnings: { message, item }, wires,
// ports (each node's typed ports, #5485) }
async function checkSystemFile(name, file, text) {
  const r = readSystem(text);
  if (r.error) throw toolError(`${file}: ${r.error}`);
  await readProject(name);
  const files = await P.fileTree(name);
  // (each FPGA node's pins its constraints file's, #5581)
  const constraints = await constraintsTexts(name, r.system, files);
  const { diags, wires, ports } = analyzeSystem(r.system, { modules: await projectModules(name, r.system), files, circuits: await projectCircuits(name, r.system, files), constraints });
  const json = d => ({ message: d.message, item: d.ref?.id ?? null });
  return { lines: systemCheckLines(file, diags), errors: diags.filter(d => d.severity === 'error').map(json), warnings: diags.filter(d => d.severity === 'warning').map(json), wires, ports };
}

// the System `sys`'s pins (a document's of before, an edit's) moved into its FPGA nodes' constraints files, each said
// (`said`); the System without them
async function pinsToFiles(name, sys, said) {
  const files = await P.fileTree(name);
  if (!sys.nodes.some(n => n.kind === 'fpga' && n.pins && Object.keys(n.pins).length)) return sys;
  const modules = await projectModules(name, sys);
  const r = pinsToConstraints(sys, { texts: await constraintsTexts(name, sys, files), portsOf: m => modules[m] || null });
  for (const w of r.writes) await P.writeFile(name, w.path, w.text);
  said.push(...r.lines);
  return r.system;
}

// a System document of the project read: { text, system }, or the tool's error (not a System, unreadable)
async function readSystemFile(name, file) {
  if (!systemsOn()) throw toolError(SYSTEMS_OFF);   // (Systems not in a release yet, #5202)
  if (!isSystemFile(file)) throw toolError(`'${file}' is not a System document (.sys.json)`);
  const text = await projectText(name, file, `no System '${file}' in the project '${name}'`);
  const r = readSystem(text);
  if (r.error) throw toolError(`${file}: ${r.error}`);
  return { text, system: r.system };
}

const SYS_FILE = STR('The System document (.sys.json).');
const EDIT = { type: 'object', properties: {
  action: { type: 'string', enum: EDIT_ACTIONS },
  node: { type: 'string' }, interface: { type: 'string' }, link: { type: 'string' },
  fields: { type: 'object', description: 'kind id board module variant pins firmware circuit lang usb x y; name, its kind\'s fields; a b (node.interface)' },
}, required: ['action'], additionalProperties: false };

export const SYSTEM_TOOLS = [
  {
    name: 'edit_system', title: 'Edit a System',
    description: 'Edit a System project\'s System in order (one refused: none): add_, change_, remove_ a node (fpga, mcu, terminal, circuit), interface (uart, gpio, spi, i2c), link; checked. Files in <id>/.',
    inputSchema: { type: 'object', properties: { project: PROJECT, file: SYS_FILE, edits: { type: 'array', maxItems: 100, items: EDIT },
      delete_folders: { type: 'boolean' } }, required: ['project', 'file', 'edits'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    async run({ project: name, file, edits, delete_folders: deleteFolders = false }) {
      let { system } = await readSystemFile(name, file);
      const before = system, renames = [];
      if (!Array.isArray(edits) || !edits.length) throw toolError('edits: a list of { action, … }');
      const said = [];
      for (const [k, e] of edits.entries()) {
        const r = editSystem(system, e || {});
        if (r.error) throw toolError(`edit ${k} (${e?.action ?? '?'}): ${r.error} (nothing written)`);
        if (e.action === 'change_node' && r.id !== e.node) renames.push({ from: e.node, to: r.id });
        system = r.system;
        said.push(`${e.action} ${r.id}`);
      }
      // (the nodes' folders first, #5488: one that cannot be renamed writes nothing)
      said.push(...await applyNodeFolders(name, layoutPlan(before, system, renames), { deleteFolders: !!deleteFolders }));
      // (its pins, edited or of before, in its FPGA nodes' constraints files, #5581)
      system = await pinsToFiles(name, system, said);
      const text = writeSystem(system);
      await P.writeFile(name, file, text);
      const { lines, errors, warnings } = await checkSystemFile(name, file, text);
      return { text: [...said, ...lines].join('\n'), data: { project: name, file, edits: said, ok: !errors.length, errors, warnings }, isError: false,
        untrusted: 'the System\'s names and its problems, which quote them' };
    },
  },
  {
    name: 'check_system', title: 'Check a System',
    description: 'Describe and check a System project\'s System as Check System does; its build plan (plan: each node\'s state, Build Plan\'s lines); boards: its nodes\' connected boards by USB id, as Connected Boards.',
    inputSchema: { type: 'object', properties: { project: PROJECT, file: SYS_FILE, boards: { type: 'boolean' } }, required: ['project', 'file'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, file, boards = false }) {
      const { text, system: doc } = await readSystemFile(name, file);
      const { lines, errors, warnings, wires, ports } = await checkSystemFile(name, file, text);
      // (described with its FPGA nodes' pins, their constraints files', #5581)
      const system = withNodePins(doc, await constraintsTexts(name, doc, await P.fileTree(name))).system;
      // (its build plan, the System row's Build Plan's lines too, #5489: server/system-plan.js; in its data, its text Check System's)
      const { planOf } = await import('./system-plan.js');
      const plan = await planOf(name, system, await P.fileTree(name));
      // (its nodes' boards by their USB id, as Connected Boards, #5489: server/usb-devices.js; the local server's devices)
      let usb;
      if (boards) {
        const devices = await (await import('./usb-devices.js')).listUsbDevices();
        const m = matchBoards(system, devices);
        usb = { devices, nodes: m.nodes, lines: boardLines(m, devices) };
      }
      // (its wires: the editor's Wiring view, a line each, after the System described, #5216)
      return { text: [...describeSystem(system), ...wiringLines(wires), ...lines].join('\n'),
        data: { project: name, file, system, ok: !errors.length, errors, warnings, wires, ports, plan: { ...plan, lines: planLines(plan) }, ...(usb ? { boards: usb } : {}) }, isError: false,
        untrusted: 'the System\'s names and its problems, which quote them' };
    },
  },
];
