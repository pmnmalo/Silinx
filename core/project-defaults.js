// What a new project starts with (#4828), the same for the local server (server/projects.js createProject) and the
// browser edition (web/js/project-store.js emptyProjectJson): its Process Properties, its device, its silinx.json, and
// that file's text (#4766). Isomorphic module (browser + Node).

import { constraintsExtOf } from '../packages/silinx-fpga/src/parts.js';
import { asDesignProject } from './project-kind.js';

/** A new project's Process Properties: Optimization Fast (Speed, Normal: GOAL_IMPL.fast of the toolchain's package,
 *  #4828), the FPGA start-up clock the JTAG clock. A project read with none keeps reading as Fast (synthGoal, #2470). */
export const NEW_IMPL = Object.freeze({ optMode: 'Speed', optLevel: 1, startupClk: 'JtagClk' });

/** A new project's device when none is chosen: the Basys2's Spartan-3E. */
export const DEFAULT_DEVICE = Object.freeze({ family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' });

/** A new empty project's silinx.json (#4766, one for the server and the browser): its device and board (none: the
 *  default device, no board), its constraints file the device's format; kind 'design': a design and simulation project
 *  (#3780: no board, no constraints). */
export function newProjectJson(name, { device, board, kind = null } = {}) {
  const json = {
    name, version: 1, device: { ...(device || DEFAULT_DEVICE) }, board: board ?? null, top: '', simTop: '', files: [],
    constraints: `constraints/top${constraintsExtOf(device)}`, stimuli: {}, impl: { ...NEW_IMPL },
  };
  return kind ? asDesignProject({ ...json, device: { ...DEFAULT_DEVICE } }) : json;
}

/** silinx.json's text (#4766, as both stores write it): 2-space JSON and a final newline, its name the project's, no
 *  fileTree (the interface's, never stored). */
export function projectJsonText(name, pj) {
  const clean = { ...pj, name };
  delete clean.fileTree;
  return JSON.stringify(clean, null, 2) + '\n';
}
