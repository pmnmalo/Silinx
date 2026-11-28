// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A Board project for a processor board alone (roadmap #5753, its phase 3 #5756): an Arduino (Uno, Nano), the Explorer
// 16/32 (PIC24), a Raspberry Pi Pico (W) or an ESP32, its firmware built, emulated and programmed as a System's node is
// (core/system-*.js), with nothing else in the project. Kept as a System of that one microcontroller node (its System
// document, `<project>.sys.json`, the machinery's: Compile Firmware, Emulate Node, Program Node, the MCP's simulate) with
// its board named in silinx.json's `board`, which no other System project has (theirs is null): that makes it a Board
// project (core/project-mode.js modeOf), its Design pane's top row the board (web/js/design-system.js), no System row.
// It starts with a firmware that blinks the board's LED (the PIC24 none: no compiler for it here; its .hex is MPLAB X's).
// Isomorphic module (browser + Node).
import { MCU_BOARDS, mcuBoard, newSystem, readSystem, writeSystem } from './system-doc.js';
import { addNode } from './system-edit.js';
import { withProfile } from './project-profile.js';
import { isSystemProject } from './project-kind.js';

/** The processor boards a Board project can have: the microcontrollers' (core/system-doc.js MCU_BOARDS). */
export const PROCESSOR_BOARDS = MCU_BOARDS;
/** The types of board a Board project chooses first (New Project's Board Type): the FPGA boards, then each processor's
 *  (its `arch`, core/system-doc.js MCU_BOARDS'), its label the family a student knows it by. */
export const BOARD_TYPES = [{ id: 'fpga', label: 'FPGA' }, { id: 'avr', label: 'Arduino' }, { id: 'pic24', label: 'PIC24' }, { id: 'rp2040', label: 'Raspberry Pi Pico' }, { id: 'esp32', label: 'ESP32' }];
/** The type of the board `id` (BOARD_TYPES' id): a processor board's, else FPGA. */
export const boardType = id => mcuBoard(id)?.arch ?? 'fpga';
/** The processor boards of the type `type`. */
export const boardsOfType = type => MCU_BOARDS.filter(b => b.arch === type);
/** Whether `id` is a processor board's. */
export const isProcessorBoard = id => !!mcuBoard(id);
/** The processor board of a Board project for one (its silinx.json), or null. */
export const processorBoardOf = pj => (isSystemProject(pj) && mcuBoard(pj?.board) ? pj.board : null);

// its node's id: the board's short name
const NODE_ID = { 'arduino-uno': 'uno', 'arduino-nano': 'nano', 'explorer-1632': 'pic', pico: 'pico', 'pico-w': 'picow', 'esp32-devkitc': 'esp32' };
/** The node's id of the processor board `id`. */
export const processorNodeId = id => NODE_ID[id] ?? 'mcu';

// the starters: an AVR's LED L (D13, PB5) toggled every quarter second, assembled (its .hex the .asm's, as avra makes it)
const AVR_ASM = `; blink.asm: the starter firmware of an Arduino's project (an ATmega328P at 16 MHz): its LED L (D13, PB5) on and
; off about every quarter second. Its .hex is made from it (avra blink.asm), or write a sketch and Compile Firmware.
    ldi r16, 0x20          ; DDRB: D13 an output
    out 0x04, r16
    ldi r18, 0
loop:
    eor r18, r16           ; D13 toggled
    out 0x05, r18          ; PORTB
    ldi r20, 21            ; about 4 million cycles: 21 x 256 x 256 x 3
outer:
    ldi r21, 0
middle:
    ldi r22, 0
inner:
    dec r22
    brne inner
    dec r21
    brne middle
    dec r20
    brne outer
    rjmp loop
`;
/** The AVR starter's program, as an Intel HEX (test/processor-board.test.js assembles AVR_ASM and runs it). */
export const AVR_BLINK_HEX = ':1000000000E204B920E0202725B945E150E060E096\n:0E0010006A95F1F75A95D9F74A95C1F7F4CFE2\n:00000001FF\n';
const MICROPYTHON = (board, pin) => `# main.py: the starter program of a ${board}'s project (MicroPython): its LED on and off every half second.
from machine import Pin
import time

led = Pin(${pin}, Pin.OUT)
while True:
    led.toggle()
    time.sleep(0.5)
`;
const CIRCUITPYTHON = `# code.py: the starter program of a Raspberry Pi Pico's project (CircuitPython): its LED on and off every half second.
import board
import digitalio
import time

led = digitalio.DigitalInOut(board.LED)
led.direction = digitalio.Direction.OUTPUT
while True:
    led.value = not led.value
    time.sleep(0.5)
`;

/** A processor board's starter files ([{ path, text }]) and its firmware (its node's, or null), in its node's folder `id`. */
export function starterFiles(board, id, runtime = null) {
  const b = mcuBoard(board);
  if (b.arch === 'avr') return { firmware: `${id}/blink.hex`, files: [{ path: `${id}/blink.asm`, text: AVR_ASM }, { path: `${id}/blink.hex`, text: AVR_BLINK_HEX }] };
  if (b.arch === 'rp2040' && (runtime ?? b.runtimes?.[0]) === 'circuitpython') return { firmware: `${id}/code.py`, files: [{ path: `${id}/code.py`, text: CIRCUITPYTHON }] };
  if (b.arch === 'rp2040') return { firmware: `${id}/main.py`, files: [{ path: `${id}/main.py`, text: MICROPYTHON(b.name, board === 'pico-w' ? '"LED"' : 25) }] };
  // (an ESP32's Pin has no toggle(), MicroPython's RP2040's only: its level kept by the program, #5875)
  if (b.arch === 'esp32') return { firmware: `${id}/main.py`, files: [{ path: `${id}/main.py`, text: MICROPYTHON(b.name, 2).replace('its LED on', 'an LED on GPIO2 on').replace('led = Pin(2, Pin.OUT)\n', 'led = Pin(2, Pin.OUT)\non = False\n').replace('    led.toggle()\n', '    on = not on\n    led.value(on)\n') }] };
  return { firmware: null, files: [] };
}

/**
 * A new project `pj` (its silinx.json, as a new empty project's) made a Board project for the processor board `board`:
 * { project (its silinx.json), node (its node's id), writes ([{ path, text }]: its System document, then its starter
 * files), firmware (its path, or null) } or { error }. `runtime`: a Pico's Python firmware (micropython, its default, or
 * circuitpython).
 */
export function processorProject(pj, board, { runtime = null } = {}) {
  const b = mcuBoard(board);
  if (!b) return { error: `no processor board '${board}' (the processor boards: ${MCU_BOARDS.map(x => x.id).join(', ')})` };
  const id = processorNodeId(board);
  const r = addNode(newSystem(pj.name), { kind: 'mcu', id, board, runtime });
  if (r.error) return { error: r.error };
  const start = starterFiles(board, id, runtime);
  const system = { ...r.system, nodes: r.system.nodes.map(n => ({ ...n, firmware: start.firmware })) };
  const project = { ...withProfile(pj, 'embedded'), board, constraints: null, top: '' };
  return { project, node: id, firmware: start.firmware, writes: [{ path: `${pj.name}.sys.json`, text: writeSystem(system) }, ...start.files] };
}

/** What a new processor board's project is, said (New Project's console line, the MCP's new_project's text). */
export const processorProjectText = (name, board, firmware) => `Board project '${name}' made for the ${mcuBoard(board).name}: ${firmware ? `its firmware ${firmware}, which blinks its LED` : `no firmware yet: put its .hex (MPLAB X's) in its folder ${processorNodeId(board)}/ and make it the node's firmware (its row ▸ Open, or the MCP's edit_system)`}.`;

/**
 * A processor board's example (#5874: core/examples.js PROCESSOR_EXAMPLES), its project `pj` (its silinx.json) and its
 * System document (`path`, `text`), made on the board `board` of its type (an Arduino's on the Uno or the Nano, a Pico's
 * on the Pico or the Pico W; New Project's board, the MCP's new_project_from_example's): { project, writes ([{ path,
 * text }]: its System document, its node's board changed; none on its own board) } or { error }. Its node keeps its id
 * and its folder.
 */
export function exampleOnBoard(pj, { path, text }, board) {
  const from = mcuBoard(pj?.board), to = mcuBoard(board);
  if (!from) return { error: `${pj?.name}: not a processor board's project` };
  const type = BOARD_TYPES.find(t => t.id === from.arch).label;
  if (!to || to.arch !== from.arch) return { error: `'${board}' is not a board of its type, ${type} (${boardsOfType(from.arch).map(b => b.id).join(', ')})` };
  if (board === pj.board) return { project: pj, writes: [] };
  const r = readSystem(text);
  if (r.error) return { error: `${path}: ${r.error}` };
  const system = { ...r.system, nodes: r.system.nodes.map(n => (n.kind === 'mcu' && n.board === pj.board ? { ...n, board } : n)) };
  return { project: { ...pj, board }, writes: [{ path, text: writeSystem(system) }] };
}

/** What a new project from a processor board's example is, said (New Project's console line, the MCP's
 *  new_project_from_example's text, #5874). */
export const processorExampleText = (name, example, board, firmware) => `Board project '${name}' made from the example ${example} for the ${mcuBoard(board).name}: its firmware ${firmware}.`;
