// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The MCP's new_project for a processor board (#5756, roadmap #5753: core/processor-board.js), as New Project's Board card
// with one: a Board project of that board alone, kept as a System of its one microcontroller node (its System document and
// its starter firmware written), its firmware built, emulated (simulate) and programmed as a System's node is. Systems'
// machinery: off in a release (#5202).
import * as P from './projects.js';
import { toolError, readProject } from './mcp-util.js';
import { processorProject, processorProjectText, processorBoardOf } from '../core/processor-board.js';
import { addShield, shieldText } from '../core/processor-shield.js';
import { systemsOn, SYSTEMS_OFF } from '../core/build-channel.js';

/** A new Board project `name` for the processor board `board` (`runtime`: a Pico's Python firmware): its result. */
export async function newProcessorProject(name, board, { runtime, variant, language, profile } = {}) {
  if (!systemsOn()) throw toolError(SYSTEMS_OFF);
  const extra = [['variant', variant], ['language', language], ['profile', profile]].filter(([, v]) => v !== undefined).map(([k]) => k);
  if (extra.length) throw toolError(`${extra.join(', ')}: a processor board's project has none (its firmware is its program)`);
  // (checked before anything is made: the board, the runtime)
  const check = processorProject({ name, files: [] }, board, { runtime });
  if (check.error) throw toolError(check.error);
  try { await P.createProject({ name, kind: 'embedded', madeBy: 'mcp' }); } catch (e) { throw toolError(e.message); }
  const r = processorProject(await P.readProject(name), board, { runtime });
  for (const w of r.writes) await P.writeFile(name, w.path, w.text);
  await P.updateProject(name, () => r.project);
  return { text: processorProjectText(name, board, r.firmware), data: { project: name, mode: 'board', board, node: r.node, firmware: r.firmware, system: r.writes[0].path, trusted: false } };
}

/** edit_system's add_shield (#5898), as the board's row's Add Shield: the shield of the Board project `name` written (its
 *  circuit, its System `file`); its lines. */
export async function addShieldTo(name, file) {
  const pj = await readProject(name);
  const r = addShield(pj, { path: file, text: await P.readFile(name, file) });
  if (r.error) throw toolError(`add_shield: ${r.error} (nothing written)`);
  for (const w of r.writes) await P.writeFile(name, w.path, w.text);
  return shieldText(name, processorBoardOf(pj), r.circuit);
}
