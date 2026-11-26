// The MCP server's Check Constraints (#2296), the interface's process (web/js/implement.js checkUcfFile): a project's
// constraints file read in its device's format with the same checks and messages, a UCF's by ucf.js checkUcf, a PCF's,
// an LPF's, a CST's and an XDC's by core/constraints-check.js (the line the back end would stop at; the names that are no
// port of the top; a pin of no pin of the package, given twice, on no resource of the board, at another voltage than its
// bank's), each line as ConstraintSystem's in the console.
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, diagLine, diagJson } from './mcp-util.js';
import { boardOfProject, ucfPort } from '../core/board-constraints.js';
import { constraintsFileDiagnostics } from '../core/constraints-diagnostics.js';
import { isSystemProject } from '../core/project-kind.js';
import { isSystemFile, readSystem } from '../core/system-doc.js';
import { nodeBoard } from '../core/system-node.js';
import { nodeConstraintsPath } from '../core/system-constraints.js';

// the top's ports as the interface's check reads them (core/board-constraints.js ucfPort), its language; none when it
// does not elaborate
async function topPorts(name, pj) {
  if (!pj.top) return { ports: [], lang: 'vhdl' };
  try {
    const { elaborateView } = await import('./mcp-util.js');
    const { design, srcs, lib } = await elaborateView(name, { top: pj.top });
    const ports = (design?.top?.ports || []).map(ucfPort);
    const file = [...(lib?.modules?.values() || [])].find(m => m.name === pj.top)?.file;
    return { ports, lang: srcs?.find(s => s.path === file)?.lang || 'vhdl' };
  } catch { return { ports: [], lang: 'vhdl' }; }
}

// the project as a System's FPGA node checks its constraints file `path` (its module the top, its board and device), or
// null (not a System project, not a node's file)
async function nodeTarget(name, pj, path) {
  if (!path || !isSystemProject(pj)) return null;
  const f = (await P.fileTree(name)).find(isSystemFile);
  const sys = f ? readSystem(await P.readFile(name, f).catch(() => '')).system : null;
  const n = sys?.nodes.find(x => x.kind === 'fpga' && nodeConstraintsPath(x) === path);
  const board = n && nodeBoard(n);
  return board ? { ...pj, top: n.module, board: n.board, device: board.device } : null;
}

export const CONSTRAINTS_TOOLS = [
  {
    name: 'check_constraints', title: 'Check Constraints',
    description: 'Check a constraints file as Check Constraints does, in the device\'s format (UCF, PCF, LPF, CST, CCF, XDC or QSF): its errors and warnings by line: the syntax, names that are no port of the top, ports with no pin, and the pins (not in the package, given to two ports, on no resource of the board, an I/O standard at another voltage than its bank\'s).',
    inputSchema: { type: 'object', properties: { project: PROJECT, file: STR('The constraints file (default: the project\'s).') }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, file }) {
      const project = await readProject(name);
      const path = file || project.constraints;
      // (a System's FPGA node's constraints file, #5581: its module, its board and device)
      const pj = await nodeTarget(name, project, path) ?? project;
      if (!path) throw toolError(`the project '${name}' has no constraints file: give file`);
      if (!/\.(ucf|pcf|lpf|cst|ccf|xdc|qsf)$/i.test(path)) throw toolError(`${path} is not a constraints file (.ucf, .pcf, .lpf, .cst, .ccf, .xdc, .qsf)`);
      let text;
      try { text = await P.readFile(name, path); } catch { throw toolError(`${path} cannot be read.`); }
      const { ports, lang } = await topPorts(name, pj);
      const { findPart, findFamily } = await import('./devices.js');
      const iostandards = findFamily(findPart(pj.device?.part)?.family || pj.device?.family)?.ioStandards || null;
      // (core/constraints-diagnostics.js: the interface's check, #4732)
      const diags = constraintsFileDiagnostics(path, text, { top: pj.top || null, ports, lang, device: pj.device, board: boardOfProject(pj), iostandards });
      const errors = diags.filter(d => d.severity === 'error'), warnings = diags.filter(d => d.severity !== 'error');
      const lines = [`Started : "Check Constraints" of ${path}.`, ...diags.map(diagLine),
        errors.length ? `Process "Check Constraints" failed (${errors.length} error(s), ${warnings.length} warning(s))`
          : `Process "Check Constraints" completed successfully${warnings.length ? ` with ${warnings.length} warning(s)` : ''}`];
      return { text: lines.join('\n'), data: { project: name, file: path, ok: !errors.length, errors: errors.map(diagJson), warnings: warnings.map(diagJson) },
        untrusted: diags.length ? 'the constraints file\'s problems, which quote it' : undefined };
    },
  },
];
