// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A processor board's shield (#5898): what an Arduino, a Raspberry Pi Pico or an ESP32 alone has not, its buttons,
// switches, displays and LEDs, a circuit around the board in its Board project (#5756: core/processor-board.js). Kept as
// the way a System wires a board into a circuit (core/system-circuit.js, #5215): a circuit node of the project's System,
// `shield`, its circuit `shield/shield.circ.json`, whose board part is the project's board, labelled with its node's id.
// The project stays a Board project (core/project-mode.js modeOf: its board named in silinx.json); its Emulate Node and
// Simulate Node run the board with its shield. The Explorer 16/32 has its own buttons and display, and no part of its
// own in a circuit: no shield. Isomorphic module.
import { mcuBoard, readSystem, writeSystem } from './system-doc.js';
import { addNode } from './system-edit.js';
import { processorBoardOf } from './processor-board.js';
import { newCircuit, newId, normalizeCircuit } from './circuit.js';
import { partDef } from './circuit-parts.js';

/** A shield's node's id and its circuit's path. */
export const SHIELD_ID = 'shield';
export const SHIELD_PATH = 'shield/shield.circ.json';

/** The processor board's node of a Board project's System `sys` (its one microcontroller node), or null. */
const boardNodeOf = sys => sys?.nodes?.find(n => n.kind === 'mcu') ?? null;
/** The shield of a Board project's System `sys`: its circuit node, or null. */
export const shieldOf = sys => sys?.nodes?.find(n => n.kind === 'circuit') ?? null;
/** Whether a processor board can have a shield: its part for a circuit (an Arduino, a Pico, an ESP32; not the Explorer). */
export const shieldable = board => !!mcuBoard(board) && partDef(board)?.kind === 'board';

/** Why the Board project `pj` (its silinx.json) cannot have a shield added, its System `sys` read, or null. */
export function shieldRefusal(pj, sys) {
  const board = processorBoardOf(pj);
  if (!board) return `${pj?.name}: a shield is a processor board's Board project's (an Arduino, a Raspberry Pi Pico or an ESP32 alone)`;
  if (!shieldable(board)) return `${pj.name}: the ${mcuBoard(board).name} has its own buttons and display, and no shield`;
  if (!boardNodeOf(sys)) return `${pj.name}: its System has no node of its board`;
  if (shieldOf(sys)) return `${pj.name} has a shield already: ${shieldOf(sys).circuit}`;
  return null;
}

/**
 * A shield added to the Board project `pj` (its silinx.json), its System document `{ path, text }`: { writes ([{ path,
 * text }]: its circuit, a half breadboard with its supply and the board's part below it, labelled with its node's id,
 * then the System with its circuit node), node (the board's node's id), circuit (the circuit's path) } or { error }.
 */
export function addShield(pj, { path, text }) {
  const r = readSystem(text);
  if (r.error) return { error: `${path}: ${r.error}` };
  const why = shieldRefusal(pj, r.system);
  if (why) return { error: why };
  const mcu = boardNodeOf(r.system), def = partDef(mcu.board);
  const c = newCircuit('shield', pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
  // (the board's part below the breadboard and its bottom rails: its body's top 2 rows under them)
  const m = normalizeCircuit({ ...c, parts: [...c.parts, { id: newId(c, mcu.board), type: mcu.board, x: 0, y: Math.ceil(17 - def.size.y0), label: mcu.id }] });
  const a = addNode(r.system, { kind: 'circuit', id: SHIELD_ID, circuit: SHIELD_PATH, x: 320, y: 0 });
  if (a.error) return { error: a.error };
  return { writes: [{ path: SHIELD_PATH, text: `${JSON.stringify(m, null, 2)}\n` }, { path, text: writeSystem(a.system) }], node: mcu.id, circuit: SHIELD_PATH };
}

/** What a shield added is, said (the console's line, the MCP's add_shield's text). */
export const shieldText = (name, board, circuit) => `${name}: a shield for its ${mcuBoard(board).name}, ${circuit}: wire its buttons, switches, displays and LEDs to the board's pins; Emulate Node runs the board with it.`;

/** The nodes a node's Emulate Node and Simulate Node run (#5898): a processor board's with its shield, as the board and
 *  what is around it; any other node alone. */
export function withShield(sys, id) {
  const s = shieldOf(sys), mcu = boardNodeOf(sys);
  return s && mcu?.id === id && sys.nodes.filter(n => n.kind === 'mcu').length === 1 ? [id, s.id] : [id];
}
