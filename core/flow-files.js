// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The files the implementation and the Board Emulator read beside the HDL (#4591): the project's constraints (the top
// module's pins: a UCF, PCF, LPF, CST, CCF or XDC, the device's format) and the memory images the design reads
// ($readmemh, a block memory's initial contents: .mem, .hex, .coe). ISE's Implementation view lists them under the top
// module they belong to; the Design pane's Implementation view, the Silinx interface's Implement and Emulate Files tab
// (#4609, #4622) and the MCP server's project_info list them so. A design and simulation project (#3780) has none.
// Isomorphic module (browser + Node).

import { isDesignOnly } from './project-kind.js';

/** A constraints file's name (any family's format). */
export const CONSTRAINTS_FILE = /\.(ucf|pcf|lpf|cst|ccf|xdc)$/i;
/** A memory image's name (the files the synthesis and the emulator read as data). */
export const MEMORY_FILE = /\.(mem|hex|coe)$/i;

/**
 * The flow's files of project `pj` (its silinx.json), of those in `fileTree` (the project's paths): its constraints first
 * (only the project's own, when it exists), then the memory images by path; none in build/. [{ path, kind }], kind
 * 'constraints' or 'memory'.
 */
export function flowFiles(pj, fileTree = []) {
  if (!pj || isDesignOnly(pj)) return [];
  const tree = new Set(fileTree);
  const out = [];
  if (pj.constraints && tree.has(pj.constraints)) out.push({ path: pj.constraints, kind: 'constraints' });
  const mem = [...tree].filter(f => MEMORY_FILE.test(f) && !/^build\//i.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  for (const path of mem) out.push({ path, kind: 'memory' });
  return out;
}

