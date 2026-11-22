// The MCP server's tools of a co-design project's System document (#4697, #2674, docs/CODESIGN.md): check_system, the
// System's Check (core/system-check.js), with the project's modules (their ports, the FPGA nodes' modules elaborated) and
// its files (the firmware), each message as the console says it, after the System described (core/system-edit.js); edit_system, its
// nodes, interfaces and links edited as the System editor does (core/system-edit.js, #4700), then checked.
import * as P from './projects.js';
import { toolError, STR, PROJECT, projectText, readProject, elaborateView } from './mcp-util.js';
import { readSystem, writeSystem, isSystemFile } from '../core/system-doc.js';
import { codesignOn, CODESIGN_OFF } from '../core/build-channel.js';
import { editSystem, describeSystem, EDIT_ACTIONS } from '../core/system-edit.js';
import { checkSystem, systemCheckLines } from '../core/system-check.js';
import { ucfPort } from '../core/board-constraints.js';

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

// a System's Check (its text, `file` its path in the project `name`): { lines, errors, warnings: { message, item } }
async function checkSystemFile(name, file, text) {
  const r = readSystem(text);
  if (r.error) throw toolError(`${file}: ${r.error}`);
  await readProject(name);
  const files = await P.fileTree(name);
  const diags = checkSystem(r.system, { modules: await projectModules(name, r.system), files });
  const json = d => ({ message: d.message, item: d.ref?.id ?? null });
  return { lines: systemCheckLines(file, diags), errors: diags.filter(d => d.severity === 'error').map(json), warnings: diags.filter(d => d.severity === 'warning').map(json) };
}

// a System document of the project read: { text, system }, or the tool's error (not a System, unreadable)
async function readSystemFile(name, file) {
  if (!codesignOn()) throw toolError(CODESIGN_OFF);   // (co-design not in a release yet, #5202)
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
  fields: { type: 'object', description: 'kind id board module variant pins firmware x y; name tx rx baud frame pins dir; a b (node.interface)' },
}, required: ['action'], additionalProperties: false };

export const SYSTEM_TOOLS = [
  {
    name: 'edit_system', title: 'Edit a System',
    description: 'Edit a co-design project\'s System (.sys.json) as its editor does, in order (one refused: none): add_, change_, remove_ a node (fpga, mcu, terminal), interface (uart, gpio), link; checked.',
    inputSchema: { type: 'object', properties: { project: PROJECT, file: SYS_FILE, edits: { type: 'array', maxItems: 100, items: EDIT } }, required: ['project', 'file', 'edits'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async run({ project: name, file, edits }) {
      let { system } = await readSystemFile(name, file);
      if (!Array.isArray(edits) || !edits.length) throw toolError('edits: a list of { action, … }');
      const said = [];
      for (const [k, e] of edits.entries()) {
        const r = editSystem(system, e || {});
        if (r.error) throw toolError(`edit ${k} (${e?.action ?? '?'}): ${r.error} (nothing written)`);
        system = r.system;
        said.push(`${e.action} ${r.id}`);
      }
      const text = writeSystem(system);
      await P.writeFile(name, file, text);
      const { lines, errors, warnings } = await checkSystemFile(name, file, text);
      return { text: [...said, ...lines].join('\n'), data: { project: name, file, edits: said, ok: !errors.length, errors, warnings }, isError: false,
        untrusted: 'the System\'s names and its problems, which quote them' };
    },
  },
  {
    name: 'check_system', title: 'Check a System',
    description: 'Describe and check a co-design project\'s System (.sys.json) as Check System does: nodes, links, errors, warnings.',
    inputSchema: { type: 'object', properties: { project: PROJECT, file: SYS_FILE }, required: ['project', 'file'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, file }) {
      const { text, system } = await readSystemFile(name, file);
      const { lines, errors, warnings } = await checkSystemFile(name, file, text);
      return { text: [...describeSystem(system), ...lines].join('\n'), data: { project: name, file, system, ok: !errors.length, errors, warnings }, isError: false,
        untrusted: 'the System\'s names and its problems, which quote them' };
    },
  },
];
