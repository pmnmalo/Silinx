// A circuit part's details (#4126, docs/CIRCUITS.md), as the circuit editor's Properties show them (Part info) and the
// MCP server's circuit_parts gives them for one part: what it does, an IC's chip, family, package, supply pins, logic,
// typical delay, its outputs (open collector) and how an input left open reads; each pin's role. From the parts'
// descriptions (core/circuit-parts.js) and their simulation's rules (readInput). Isomorphic module.
import { partDef, readInput } from './circuit-parts.js';

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
  clock: 'Drives its output to 1 and 0 in turn, at its frequency. An input of the HDL.',
  'pull-up': 'A weak 1 (a resistor to +5 V): its net reads 1 unless something drives it to 0.',
  'pull-down': 'A weak 0 (a resistor to GND): its net reads 0 unless something drives it to 1.',
  led: 'Lights while its anode A is at 1 and its cathode K at 0. An output of the HDL.',
  'seg7-cc': 'Seven segments a–g and a point DP, each an LED; common cathode: a segment lights while its pin is at 1 and COM at 0. Outputs of the HDL.',
  'seg7-ca': 'Seven segments a–g and a point DP, each an LED; common anode: a segment lights while its pin is at 0 and COM at 1. Outputs of the HDL.',
  'led-bar-10': 'Ten LEDs side by side, each lighting while its anode is at 1 and its cathode at 0. Outputs of the HDL.',
  probe: 'Shows the level of the net its tip touches: H (1), L (0), – (open) or X (unknown). Not a port of the HDL.',
};
/** A pin's role by its direction. */
export const PIN_ROLES = { in: 'input', out: 'output', oc: 'open-collector output', vcc: 'supply +5 V', gnd: 'supply GND', nc: 'not connected',
  pass: 'contact', weak: 'weak output', probe: 'tip', none: 'not simulated' };
const FAMILY = { ttl: '74LS (TTL)', cmos: '4000 (CMOS)' };
const FN = { and: 'AND', or: 'OR', nand: 'NAND', nor: 'NOR', xor: 'XOR', not: 'NOT', buf: 'BUF' };

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
    if (d.gates) info.logic = d.gates.map((g) => `${name(g.out)} = ${FN[g.fn] ?? g.fn.toUpperCase()}(${g.ins.map(name).join(', ')})`);
    if (d.tpd) info.delay = d.tpd;
    if (d.oc || d.pins.some((p) => p.dir === 'oc')) info.openCollector = true;   // (a 7447's outputs, its flag not set)
    info.openInput = readInput(d.family, 'Z');
  }
  // (a project's KiCad part, #4280: its file, its symbol and its source; the library part it behaves as, or none)
  if (d.kicad) {
    info.kicad = d.kicad;
    info.about = d.behaves ? `Behaves as the ${d.behaves} of the library (by its ${d.how}).` : 'Drawn only: not simulated, its pins drive nothing.';
  }
  info.pins = d.pins.map((p) => ({ n: p.n, name: p.name, role: PIN_ROLES[p.dir] ?? p.dir, ...(p.kicadType ? { kicadType: p.kicadType } : {}) }));
  return info;
}
