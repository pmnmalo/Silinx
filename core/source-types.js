// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The sources each kind of device takes (#5873, after the project modes #5753): what New Source offers and Import Source
// copies for an FPGA, a design and simulation project's (Circuit) logic, and each microcontroller (an AVR's Arduino, a
// RP2040's Pico, an ESP32, a PIC24's Explorer 16/32), the Design pane's [New] and [Import] of its row, the MCP server's
// new_source and import_source. A type is named as new_source names it. No constraints file: user constraints are made by
// I/O Pin Planning (#5642), and Import Source takes an existing one. Isomorphic module (browser + Node).
import { mcuBoard } from './system-doc.js';
import { sourcePlace } from './system-layout.js';

// the drawings a microcontroller's program is generated from (#5486: core/reactive-from.js REACTIVE_KINDS)
const CPU_DRAWINGS = ['fsm', 'asm', 'petri', 'boolean'];
/** The source types of each kind of device, in New Source's order. */
export const DEVICE_SOURCES = {
  fpga: ['boolean', 'circuit', 'module', 'schematic', 'fsm', 'asm', 'petri', 'regmap', 'clock_manager', 'block_memory', 'xadc', 'test_bench', 'mem', 'lab', 'c', 'cpp', 'package'],
  design: ['boolean', 'circuit', 'schematic', 'fsm', 'asm', 'petri', 'lab'],
  avr: ['sketch', 'c_source', 'cpp_source', 'assembly', ...CPU_DRAWINGS],
  rp2040: ['python', ...CPU_DRAWINGS],
  esp32: ['python', ...CPU_DRAWINGS],
  pic24: [],   // (its .hex is MPLAB X's: no compiler here)
};
// the files Import Source copies for each kind of device (by their names' ends: a drawing's .json)
const HDL = ['.v', '.vhd', '.vhdl'], DRAWING = ['.json'];
/** The files Import Source takes for each kind of device. */
export const DEVICE_IMPORTS = {
  fpga: [...HDL, '.ucf', '.pcf', '.lpf', '.cst', '.ccf', '.xdc', '.qsf', '.mem', '.hex', ...DRAWING],
  design: DRAWING,
  avr: ['.ino', '.c', '.cpp', '.h', '.hpp', '.asm', '.hex', ...DRAWING],
  rp2040: ['.py', ...DRAWING],
  esp32: ['.py', ...DRAWING],
  pic24: ['.hex'],
};
// a kind of device in a sentence
const DEVICE_TEXT = { fpga: 'an FPGA', design: 'a design and simulation project', avr: 'an AVR (Arduino)', rp2040: 'an RP2040 (Pico)', esp32: 'an ESP32', pic24: 'a PIC24' };

/** The kind of device of a node (core/project-nodes.js's, a System's or a project's implicit one): fpga, design, or its
 *  microcontroller's architecture (avr, rp2040, esp32, pic24); null for a node with no sources of its own (a terminal, a
 *  circuit, a broker). */
export function deviceKind(node) {
  if (node?.kind === 'fpga' || node?.kind === 'design') return node.kind;
  if (node?.kind !== 'mcu') return null;
  const arch = mcuBoard(node.board)?.arch;
  return Object.hasOwn(DEVICE_SOURCES, arch) ? arch : null;
}

/** The source types of the kind of device `kind` ([] for none). */
export const sourceTypesOf = kind => (Object.hasOwn(DEVICE_SOURCES, kind ?? '') ? DEVICE_SOURCES[kind] : []);
/** The files Import Source takes for the kind of device `kind`: their names' ends ([] for none). */
export const importsOf = kind => (Object.hasOwn(DEVICE_IMPORTS, kind ?? '') ? DEVICE_IMPORTS[kind] : []);
/** Import Source's `accept` for the kind of device `kind`. */
export const importAcceptOf = kind => importsOf(kind).join(',');

const what = kind => DEVICE_TEXT[kind] ?? 'this device';

/** Why New Source makes no source of type `type` (its name `label`) for the kind of device `kind`, or null. */
export function sourceTypeRefusal(kind, type, label = type) {
  if (sourceTypesOf(kind).includes(type)) return null;
  return `${label}: not a source of ${what(kind)}`;
}

/** Why Import Source copies no file named `name` for the kind of device `kind`, or null. */
export function importRefusal(kind, name) {
  const n = String(name ?? '').toLowerCase(), ends = importsOf(kind);
  if (ends.some(e => n.endsWith(e))) return null;
  return ends.length ? `${name}: not a file of ${what(kind)} (${ends.join(', ')})` : `${name}: ${what(kind)} takes no source`;
}

/** No new source for the kind of device `kind` (a PIC24's): what New Source says. */
export const noSourcesText = kind => `${what(kind)[0].toUpperCase()}${what(kind).slice(1)} takes no new source: Import Source copies its files.`;

/** The device a new or imported source of a System `sys` goes to (#5873): the node `id` when it has sources of its own,
 *  else its first FPGA or design node, else its first node that has (a processor board's Board project's one): its place
 *  (core/system-layout.js sourcePlace: { node, location, lang }) and its kind of device; null when no node has sources. */
export function devicePlace(sys, { id = null, dir = 'src', preferred = null } = {}) {
  const nodes = sys?.nodes ?? [];
  const n = nodes.find(x => x.id === id && deviceKind(x)) ?? nodes.find(x => x.kind === 'fpga' || x.kind === 'design') ?? nodes.find(x => deviceKind(x));
  const place = n ? sourcePlace(sys, { id: n.id, dir, preferred }) : null;
  return place && { ...place, kind: deviceKind(n) };
}
