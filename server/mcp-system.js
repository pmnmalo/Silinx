// The MCP server's tools of a co-design project's System document (#4697, #2674, docs/CODESIGN.md): check_system, the
// System's Check (core/system-check.js), with the project's modules (their ports, the FPGA nodes' modules elaborated) and
// its files (the firmware), each message as the console says it.
import * as P from './projects.js';
import { toolError, STR, PROJECT, projectText, readProject, elaborateView } from './mcp-util.js';
import { readSystem, isSystemFile } from '../core/system-doc.js';
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

export const SYSTEM_TOOLS = [
  {
    name: 'check_system', title: 'Check a System',
    description: 'Check a co-design project\'s System document (.sys.json: its FPGA, microcontroller and serial terminal nodes and their UART and GPIO links) as Check System does: its errors and warnings and their node or link. The nodes (an FPGA node\'s module, board and pins; a microcontroller\'s board, firmware and pins), the interfaces (baud, frame, pins, directions; a TX that is an input: TX and RX crossed), the links (the same baud and frame at both ends, a wire driven twice or by nothing, a pin used by two links, a 5 V output on a 3.3 V FPGA input).',
    inputSchema: { type: 'object', properties: { project: PROJECT, file: STR('The System document (e.g. uart_avr.sys.json).') }, required: ['project', 'file'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, file }) {
      if (!isSystemFile(file)) throw toolError(`'${file}' is not a System document (.sys.json)`);
      const text = await projectText(name, file, `no System '${file}' in the project '${name}'`);
      const { lines, errors, warnings } = await checkSystemFile(name, file, text);
      return { text: lines.join('\n'), data: { project: name, file, ok: !errors.length, errors, warnings }, isError: false,
        untrusted: errors.length || warnings.length ? 'the System\'s problems, which quote its names' : undefined };
    },
  },
];
