// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The MCP's new_project for a processor board (#5756, roadmap #5753: core/processor-board.js), as New Project's Board card
// with one: a Board project of that board alone, kept as a System of its one microcontroller node (its System document and
// its starter firmware written), its firmware built, emulated (simulate) and programmed as a System's node is. Systems'
// machinery: off in a release (#5202).
import fs from 'node:fs';
import path from 'node:path';
import * as P from './projects.js';
import { toolError } from './mcp-util.js';
import { processorProject, processorProjectText, exampleOnBoard, processorExampleText } from '../core/processor-board.js';
import { isSystemFile, readSystem } from '../core/system-doc.js';
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

/** A new Board project `name` from the processor board's example `example` (#5874: core/examples.js PROCESSOR_EXAMPLES),
 *  as New Project's Start from with that board's type, on `board` (one of its type's; default the example's): its
 *  result. */
export async function newProcessorExampleProject(name, example, { board, variant } = {}) {
  if (!systemsOn()) throw toolError(SYSTEMS_OFF);
  if (variant !== undefined) throw toolError('variant: a processor board has none');
  const dir = path.join(P.EXAMPLES_DIR, example);
  const ex = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  const sys = fs.readdirSync(dir).find(isSystemFile);
  // (checked before anything is made: the board, one of the example's type)
  const on = exampleOnBoard(ex, { path: sys, text: fs.readFileSync(path.join(dir, sys), 'utf8') }, board ?? ex.board);
  if (on.error) throw toolError(`board: ${on.error}`);
  try { await P.createProject({ name, template: example, madeBy: 'mcp' }); } catch (e) { throw toolError(e.message); }
  for (const w of on.writes) await P.writeFile(name, w.path, w.text);
  if (on.writes.length) await P.updateProject(name, pj => ({ ...pj, board: on.project.board }));
  const node = readSystem(await P.readFile(name, sys)).system.nodes.find(n => n.kind === 'mcu');
  return { text: processorExampleText(name, example, on.project.board, node.firmware), data: { project: name, mode: 'board', board: on.project.board, node: node.id, firmware: node.firmware, system: sys, trusted: false } };
}
