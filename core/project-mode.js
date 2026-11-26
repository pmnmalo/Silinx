// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A project's mode (roadmap #5753, its phase 1 #5754): Circuit, Board or System, what New Project asks first and what a
// project is said to be. A layer over the profiles (core/project-profile.js, #5440), nothing new on disk: Circuit is the
// Digital Logic profile (elementary components and drawings, no board), Board the FPGA profile (one board, its flow, its
// emulator and its programming), System the Embedded / SoC and System profiles (several devices linked, the System
// document). A project of before is read in its mode as it is (its profile, itself read from its old kind). Systems are off
// in a release (#5202). Isomorphic module (browser + Node).
import { systemsOn, SYSTEMS_OFF } from './build-channel.js';
import { profileById, profileOf } from './project-profile.js';

/** The modes, each with: its label (the interface's), the profiles it covers, a new project's profile, the kind New Project
 *  creates (core/project-kind.js: 'design', 'fpga', 'system'), what it is for (New Project's card) and `short`, the MCP
 *  server's words for it (its arguments' size limits, #4752, #5097). */
export const MODES = [
  { id: 'circuit', label: 'Circuit', profiles: ['logic'], profile: 'logic', kind: 'design',
    about: 'Elementary components with no board: gates, flip-flops, circuits on a breadboard, schematics, truth tables and state machines, drawn and simulated.',
    short: 'drawings and circuits, no board' },
  { id: 'board', label: 'Board', profiles: ['fpga'], profile: 'fpga', kind: 'fpga',
    about: 'One board, with its flow, its emulator and its programming: HDL sources and drawings synthesized, implemented and programmed on the FPGA, or emulated.',
    short: 'one board, the default' },
  { id: 'system', label: 'System', profiles: ['embedded', 'system'], profile: 'system', kind: 'system',
    about: 'Several devices linked (UART, SPI, Pmods): FPGA boards and microcontrollers in one System document, simulated as one.',
    short: 'devices linked in a System' },
];
/** A mode by its id, or null. */
export const modeById = id => MODES.find(m => m.id === id) || null;
/** The mode of the profile `id` (Board for an unknown one, as profileOf reads a project with none). */
export const profileMode = id => MODES.find(m => m.profiles.includes(id))?.id ?? 'board';
/** A project's mode (its silinx.json): its profile's. */
export const modeOf = pj => profileMode(profileOf(pj));
/** Whether the mode `id` is offered in this build (System: not in a release, #5202). */
export const modeOn = id => !!modeById(id) && (id !== 'system' || systemsOn());

/** The profile a new project of the mode `mode` gets, `profile` given or not (the MCP's new_project: a finer one of the
 *  mode's), or { error }: no such mode, not in this build, or a profile not of the mode. */
export function newProjectProfile(mode, profile) {
  const m = modeById(mode);
  if (!m) return { error: `no mode '${mode}' (the modes: ${MODES.map(x => x.id).join(', ')})` };
  if (!modeOn(mode)) return { error: SYSTEMS_OFF };
  if (profile === undefined) return { profile: m.profile };
  if (!m.profiles.includes(profile)) {
    const p = profileById(profile);
    return { error: `profile ${profile}${p ? ` (${p.label})` : ''} is not of the mode ${mode} (${m.label}: ${m.profiles.join(', ')})` };
  }
  return { profile };
}
