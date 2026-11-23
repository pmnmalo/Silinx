// A circuit part's details (#4126, docs/CIRCUITS.md), as the circuit editor's Properties show them (Part info) and the
// MCP server's circuit_parts gives them for one part: what it does, an IC's chip, family, package, supply pins, logic,
// typical delay, its outputs (open collector) and how an input left open reads; each pin's role. From the parts'
// descriptions (core/circuit-parts.js) and their simulation's rules (readInput). Isomorphic module.
import { PARTS, partDef, readInput } from './circuit-parts.js';

// what a part that is not an IC does
const ABOUT = {
  'breadboard-half': 'Plug the parts into its holes: the five holes a–e of a column are joined, and f–j; each rail along its edges is joined along the board, for +5 V and GND.',
  'breadboard-full': 'Plug the parts into its holes: the five holes a–e of a column are joined, and f–j; each rail along its edges is joined along half the board, cut in the middle.',
  supply: 'Gives +5 V (a logic 1) on its + terminal and GND (a logic 0) on its − terminal: wire them to the breadboard\'s rails.',
  'logic-switch': 'Drives its output to 1 or 0, as it is set: click it while trying the circuit. An input of the HDL.',
  button: 'Joins its two pins while it is pressed (momentary, normally open): with a pull-up or a pull-down, it gives a 0 or a 1. An input of the HDL.',
  spdt: 'Joins its middle pin C to A or to B, as it is set. An input of the HDL.',
  'dip-4': 'A row of switches, each joining its pin to the one opposite while it is on. Inputs of the HDL.',
  'dip-8': 'A row of switches, each joining its pin to the one opposite while it is on. Inputs of the HDL.',
  'keypad-4x4': 'A membrane keypad, 16 keys in 4 rows and 4 columns: a key joins its row (R1…R4) to its column (C1…C4) while pressed. A program scans it: its rows driven low one at a time, its columns pulled up and read. Each key an input of the HDL.',
  clock: 'Drives its output to 1 and 0 in turn, at its frequency. An input of the HDL.',
  'pull-up': 'A weak 1 (a resistor to +5 V): its net reads 1 unless something drives it to 0.',
  'pull-down': 'A weak 0 (a resistor to GND): its net reads 0 unless something drives it to 1.',
  led: 'Lights while its anode A is at 1 and its cathode K at 0. An output of the HDL.',
  'seg7-cc': 'Seven segments a–g and a point DP, each an LED; common cathode: a segment lights while its pin is at 1 and COM at 0. Outputs of the HDL.',
  'seg7-ca': 'Seven segments a–g and a point DP, each an LED; common anode: a segment lights while its pin is at 0 and COM at 1. Outputs of the HDL.',
  'led-bar-10': 'Ten LEDs side by side, each lighting while its anode is at 1 and its cathode at 0. Outputs of the HDL.',
  probe: 'Shows the level of the net its tip touches: H (1), L (0), – (open) or X (unknown). Not a port of the HDL.',
  // (a servo, #5347)
  'servo-sg90': "Its arm at the angle its signal's pulses ask for: 0.5 ms 0°, 2.5 ms 180°, every 20 ms (an Arduino's or an FPGA's PWM), moving at 60° in 0.1 s. Not a port of the HDL.",
  // (a temperature sensor, #5342)
  lm75: "Its temperature, set while trying it (its − and +, its Properties), read on I²C at 0x48 + A2..A0: 9 bits, 0.5 °C; its OS output (open drain) over TOS (80 °C) and under THYST (75 °C). Not a port of the HDL.",
  // (a character LCD, #5330)
  'lcd-1602': "Two lines of 16 characters, its HD44780 controller simulated: a write on E's falling edge, RS 0 a command, 1 a character; 8-bit or 4-bit (D7..D4) mode; off until its program turns it on. Not a port of the HDL.",
  // (a graphic OLED, #5336)
  'oled-ssd1306': "128 × 64 pixels, its SSD1306 controller simulated on I²C at 0x3C: a control byte, then commands or its display's bytes (8 pages of 128, bit 0 a page's top row); lit while on and its charge pump on. SCL and SDA need a pull-up each. Not a port of the HDL.",
  // (the boards, #5215)
  'arduino-uno': "Its headers' pins, the board's (D0…D13, A0…A5; SDA and SCL are A4 and A5): its 5V, 3V3 and GND power the breadboard; its other pins are its program's, in a System (alone, they drive nothing).",
  'arduino-nano': "A DIP-30 that straddles a breadboard's channel, its pins the board's (D0…D13, A0…A7; A6 and A7 inputs only): its 5V, 3V3 and GND power the breadboard; its other pins are its program's, in a System (alone, they drive nothing).",
  'fpga-basys2': "Its Pmod connectors' pins (JA1…, each its FPGA's package pin): its 3V3 and GND power the breadboard; its other pins are its design's, in a System (alone, they drive nothing).",
  'fpga-nexys2': "Its Pmod connectors' pins (JA1…, each its FPGA's package pin): its 3V3 and GND power the breadboard; its other pins are its design's, in a System (alone, they drive nothing).",
};
/** A pin's role by its direction. */
export const PIN_ROLES = { in: 'input', out: 'output', oc: 'open-collector output', vcc: 'supply +5 V', gnd: 'supply GND', nc: 'not connected',
  pass: 'contact', weak: 'weak output', probe: 'tip', none: 'not simulated', board: "the board's pin", vcc33: 'supply 3.3 V' };
const FAMILY = { ttl: '74LS (TTL)', cmos: '4000 (CMOS)' };
const FN = { and: 'AND', or: 'OR', nand: 'NAND', nor: 'NOR', xor: 'XOR', xnor: 'XNOR', not: 'NOT', buf: 'BUF' };

/**
 * The details of the part `type`, or null: { type, title, about? (a part that is not an IC), chip?, family?, package?,
 * power? ('VCC 14, GND 7'), logic? (a gate IC's: '1Y = NAND(1A, 1B)', …), delay? (ns), openCollector?, openInput? (how an
 * input left open reads: '1', 'X'), pins: [{ n, name, role }] }.
 */
export function partInfo(type) {
  const d = partDef(type);
  if (!d) return null;
  const name = (n) => d.pins.find((p) => p.n === n)?.name ?? String(n);
  const info = { type: d.type, title: d.title };
  if (ABOUT[d.type]) info.about = ABOUT[d.type];
  if (d.kind === 'ic') {
    const supply = (dir) => d.pins.filter((p) => p.dir === dir).map((p) => `${p.name} ${p.n}`);
    Object.assign(info, { chip: d.chip, family: FAMILY[d.family] ?? d.family, package: `DIP-${d.dip}`, power: [...supply('vcc'), ...supply('gnd')].join(', ') });
    // (an AND-OR-INVERT, #4397: the NOR of its terms' ANDs)
    const aoi = (g) => { let k = 0; return `NOR(${g.terms.map((n) => `AND(${g.ins.slice(k, (k += n)).map(name).join(', ')})`).join(', ')})`; };
    // (a three-state buffer's: while its enables are at their active levels)
    const en = (g) => (g.en ? ` while ${g.en.map(([n, a]) => `${name(n)} = ${a}`).join(', ')}` : '');
    if (d.gates) info.logic = d.gates.map((g) => `${name(g.out)} = ${g.fn === 'aoi' ? aoi(g) : `${FN[g.fn] ?? g.fn.toUpperCase()}(${g.ins.map(name).join(', ')})`}${en(g)}`);
    if (d.tpd) info.delay = d.tpd;
    if (d.oc || d.pins.some((p) => p.dir === 'oc')) info.openCollector = true;   // (a 7447's outputs, its flag not set)
    info.openInput = readInput(d.family, 'Z');
  }
  // (a project's KiCad part, #4280: its file, its symbol and its source; the library part it behaves as, or none)
  if (d.kicad) {
    info.kicad = d.kicad;
    info.about = d.behaves ? `Behaves as the ${PARTS[d.behaves]?.kind === 'ic' ? d.behaves : PARTS[d.behaves]?.title ?? d.behaves} of the library (by its ${d.how}).` : d.kind === 'model' ? `Simulated by the project's module ${d.module}, in Try it and in the HDL.`
      : 'Drawn only: not simulated, its pins drive nothing.';
  }
  // (a board's pins, #5215: a 3V3 its supply's; an FPGA board's its package pin)
  const role = (p) => (p.supply && p.volts === 3.3 ? PIN_ROLES.vcc33 : PIN_ROLES[p.dir] ?? p.dir);
  info.pins = d.pins.map((p) => ({ n: p.kicadN ?? p.n, name: p.name, role: role(p), ...(p.loc ? { loc: p.loc } : {}), ...(p.port ? { port: p.port } : {}), ...(p.kicadType ? { kicadType: p.kicadType } : {}) }));
  return info;
}
