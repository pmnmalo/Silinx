// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The MCP's set_mode (#5755, roadmap #5753): a project's mode changed as Project ▸ Change Mode… does it, by the same plan
// (core/mode-change.js) and the same messages. Up: Circuit → Board (its board, or its device), Board or Circuit → System
// (its node the first, its files moved into the node's folder, its System document written). Down: refused unless
// `confirm` is given, the refusal saying what would be lost; with it, done and each loss said as a WARNING line. Nothing
// is deleted. A version of the project is kept before it (#5740: server/mcp-versions.js).
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, boardDevice } from './mcp-util.js';
import { MODES, modeOf } from '../core/project-mode.js';
import { modeChange, modeChangeText, confirmText, relinked } from '../core/mode-change.js';
import { isSystemFile } from '../core/system-doc.js';
import { VIEW_RE } from '../core/view-hdl.js';
import { generatedFiles } from './mcp-design-only.js';

/** The project `name` given the mode `to`: the plan (core/mode-change.js) made from its files and done. `opts`: board,
 *  variant (Circuit → Board), keep (System → Board or Circuit), confirm (going down). Returns { plan, text }. */
async function changeMode(name, to, { board, variant, keep, confirm = false } = {}) {
  const pj = await readProject(name);
  const files = (await P.fileTree(name)).filter(f => !/^build\//.test(f));
  const system = files.find(isSystemFile);
  const texts = system ? { [system]: await P.readFile(name, system).catch(() => '') } : {};
  let device = null, ext = '.ucf';
  if (board || variant) {
    if (modeOf(pj) !== 'circuit' || to !== 'board') throw toolError('board, variant: given going from Circuit to Board only');
    ({ board, device } = await boardDevice(board, variant));
  }
  if (modeOf(pj) === 'circuit' && to === 'board') ext = (await import('../packages/silinx-fpga/src/parts.js')).constraintsExtOf(device || pj.device);
  const plan = modeChange(pj, to, { files, texts, generated: await generatedFiles(name), board: board ?? null, device, ext, keep: keep ?? null });
  if (plan.error) throw toolError(plan.error);
  if (plan.down && !confirm) throw toolError(confirmText(name, to, plan));
  // (the files into the node's folder, each root entry at once; its drawings' HDL paths followed; its System written)
  for (const m of plan.moves) await P.renameFile(name, m.from, m.to);
  if (plan.relink) {
    for (const f of (await P.fileTree(name)).filter(x => VIEW_RE.test(x))) {
      const text = relinked(f, await P.readFile(name, f).catch(() => ''), plan.moves);
      if (text != null) await P.writeFile(name, f, text);
    }
  }
  if (plan.write) await P.writeFile(name, plan.write.path, plan.write.text);
  await P.updateProject(name, () => plan.project);
  // (Circuit → Board with a board: its constraints file from the board's pins, as Design Properties writes it)
  if (modeOf(pj) === 'circuit' && plan.project.board) await P.boardConstraints(P.projectDir(name), plan.project);
  return { plan, text: modeChangeText(name, to, plan) };
}

export const MODE_TOOLS = [
  {
    name: 'set_mode', title: 'Change a project\'s mode',
    description: 'A project\'s mode changed, as Project ▸ Change Mode…: up loses nothing (circuit to board: its board or device; board or circuit to system: its node the System\'s first, its files moved into the node\'s folder, its System document written); down (system to board or circuit, board to circuit) is refused unless confirm is true, the refusal saying what would be lost (nodes, links, the board, the constraints, HDL sources no drawing makes); nothing is deleted from the disk.',
    inputSchema: { type: 'object', properties: { project: PROJECT, mode: { type: 'string', enum: MODES.map(m => m.id), description: 'The mode: circuit, board or system.' },
      board: STR('Circuit to Board: the board (list_devices).'), variant: STR('Circuit to Board: the board\'s variant.'),
      keep: STR('System down: the node kept (default: its first FPGA node).'), confirm: { type: 'boolean', description: 'Going down: true to do it, what is lost said (default false: refused, what would be lost said).' } },
    required: ['project', 'mode'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run({ project: name, mode, board, variant, keep, confirm }) {
      const { plan, text } = await changeMode(name, mode, { board, variant, keep, confirm });
      return { text, data: { project: name, mode, moved: plan.moves, system: plan.write?.path ?? null, kept: plan.kept, lost: plan.lost } };
    },
  },
];
