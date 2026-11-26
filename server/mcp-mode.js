// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The MCP's set_design_properties mode (#5755, roadmap #5753; a field of that tool, not a tool of its own: tools/list's
// budget, #4752, #5520): a project's mode changed as Project ▸ Change Mode… does it, by the same plan
// (core/mode-change.js) and the same messages. Up: Circuit → Board (its board, or its device), Board or Circuit → System
// (its node the first, its files moved into the node's folder, its System document written). Down: refused unless
// `confirm` is given, the refusal saying what would be lost; with it, done and each loss said as a WARNING line. Nothing
// is deleted. A version of the project is kept before it (#5740: server/mcp-versions.js).
import * as P from './projects.js';
import { toolError, readProject, boardDevice } from './mcp-util.js';
import { modeOf } from '../core/project-mode.js';
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

/** set_design_properties' `mode` (`args`: its arguments; with it, board, variant, keep and confirm alone): its result. */
export async function setMode(args) {
  const other = Object.keys(args).filter(k => !['project', 'mode', 'board', 'variant', 'keep', 'confirm'].includes(k));
  if (other.length) throw toolError(`mode: give it with board, variant, keep or confirm alone, not ${other.join(', ')}`);
  const { project: name, mode, board, variant, keep, confirm } = args;
  const { plan, text } = await changeMode(name, mode, { board, variant, keep, confirm });
  return { text, data: { project: name, mode, moved: plan.moves, system: plan.write?.path ?? null, kept: plan.kept, lost: plan.lost } };
}
