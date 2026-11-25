// Silinx - the System Emulator's Explorer 16/32 (#5484, core/system-emu.js): a PIC24 node's board, its parts as on the
// bench (silinx-pic24's EXPLORER_1632): its LEDs D3 to D10 (RA0 to RA7, lit by a 1), its buttons S3 to S6 (a press pulls
// RD6, RD13, RA7, RD7 to 0, through the node's pins: the node contract's inputs), its potentiometer R6 (AN5) and its
// temperature sensor (AN4) set on the board's model, and its 16x2 LCD's rows as they are at the window's end.
//
//   const b = explorerBoard(node, board, driven);          // { id, kind: 'mcu', arch: 'pic24', board, inputs, outputs }
//   explorerState(sim, b, lit)  setExplorerInput(sim, b, 'S3', 1)
//
// Isomorphic ES module, no DOM.
import { EXPLORER_1632 } from '../packages/silinx-pic24/src/index.js';
import { explorerOf } from './system-sim-pic24.js';

/** The potentiometer's and the temperature sensor's ranges: R6 a share of its travel, the TC1047A in °C. */
export const EXPLORER_ANALOG = { R6: { kind: 'pot', min: 0, max: 1, rest: 0.5 }, TC1047A: { kind: 'temp', min: -40, max: 125, rest: 25 } };

/** The Explorer 16/32 of a PIC24 node to emulate: its buttons whose pins no link drives, its analog parts; its outputs
 *  its LEDs' pins (watched). */
export function explorerBoard(n, b, driven) {
  const inputs = Object.entries(EXPLORER_1632.buttons).filter(([, pin]) => !driven.has(`${n.id}.${pin}`)).map(([name, pin]) => ({ pin: name, kind: 'button', nodePin: pin }))
    .concat(Object.entries(EXPLORER_ANALOG).map(([name, a]) => ({ pin: name, kind: a.kind, min: a.min, max: a.max })));
  return { id: n.id, kind: 'mcu', arch: 'pic24', board: b, leds: { ...EXPLORER_1632.leds }, inputs, outputs: [...new Set(Object.values(EXPLORER_1632.leds))],
    held: {}, analog: Object.fromEntries(Object.entries(EXPLORER_ANALOG).map(([k, a]) => [k, a.rest])) };
}

/** What the board shows: { leds: { D3: the share of the window it was lit… }, held: { S3: pressed… }, analog: { R6, TC1047A },
 *  lcd: [its two rows] }; lit(pin): a LED pin's share of the window at 1. */
export function explorerState(sim, b, lit) {
  const x = explorerOf(sim.nodes.get(b.id));
  return { leds: Object.fromEntries(Object.entries(b.leds).map(([d, pin]) => [d, lit(pin)])), held: { ...b.held }, analog: { ...b.analog },
    lcd: x ? x.lcd.lines() : ['', ''] };
}

/** A button pressed (value 1) or let go (0), its pin pulled to 0 while pressed; R6 (0 to 1) or the TC1047A (°C) set. */
export function setExplorerInput(sim, b, pin, value) {
  const i = b.inputs.find((x) => x.pin === pin);
  if (!i) throw new Error(`'${pin}' is not a button, the potentiometer nor the temperature sensor of ${b.id}'s Explorer 16/32 (${b.inputs.map((x) => x.pin).join(', ')})`);
  if (i.kind === 'button') {
    b.held[pin] = !!value;
    sim.nodes.get(b.id).setPin(i.nodePin, value ? 0 : 1);
    return;
  }
  const v = Math.max(i.min, Math.min(i.max, Number(value)));
  if (!Number.isFinite(v)) throw new Error(`${pin}'s value: a number from ${i.min} to ${i.max}`);
  b.analog[pin] = v;
  const x = explorerOf(sim.nodes.get(b.id));
  if (i.kind === 'pot') x?.setPotentiometer(v); else x?.setTemperature(v);
}
