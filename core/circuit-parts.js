// The parts of a digital circuit (#3897, docs/CIRCUITS.md): each part's pins (their number, name, direction and place
// on the 0.1 inch grid, relative to its pin 1 unturned), its logic and its typical delay; one description for the
// editor, the simulation (core/circuit-sim.js), the checks (core/circuit-check.js), the HDL (core/circuit-hdl.js) and
// the MCP server. Digital only: a pin carries a logic level; the supply is VCC = 1 and GND = 0. The ICs' tables:
// core/circuit-ics.js. Isomorphic module.
import { ICS, dip } from './circuit-ics.js';
import { MSI } from './circuit-msi.js';
import { SEQ } from './circuit-seq.js';

// ------------------------------------------------------------------ the breadboards
export const BB_COLS = 30;
/** The rows of a breadboard's two halves (a–e above the channel, f–j below), their y from hole a1. */
export const BB_ROWS = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 7, g: 8, h: 9, i: 10, j: 11 };
/** Its power rails, their y (one strip each along the board; a full one's split in the middle): top +, top −, bottom −, bottom +. */
export const BB_RAILS = { tp: -4, tn: -3, bn: 14, bp: 15 };

/** A breadboard's holes: [{ name: 'a1' | 'tp1', strip, dx, dy }] (strip: one name per strip of holes joined; `split`:
 *  its rails cut after the column `split`, each half a strip of its own). */
export function breadboardHoles(cols = BB_COLS, split = 0) {
  const out = [];
  for (let c = 1; c <= cols; c++) {
    for (const [r, dy] of Object.entries(BB_ROWS)) out.push({ name: `${r}${c}`, strip: `${c}${dy < 5 ? 'a' : 'f'}`, dx: c - 1, dy });
    for (const [r, dy] of Object.entries(BB_RAILS)) out.push({ name: `${r}${c}`, strip: split && c > split ? `${r}2` : r, dx: c - 1, dy });
  }
  return out;
}

// ------------------------------------------------------------------ the parts but the ICs
// inputs: the student's (a level, a momentary button, a clock), each a port of the HDL (k: its suffix); sources: a pin
// driven strong by an input; contacts: two pins joined while an input is `when`; pulls: a pin driven weak; lamps: what
// lights (an anode a, a cathode k; name: its port's suffix); bridges: pins joined inside the part
const pin = (n, name, dir, dx, dy) => ({ n, name, dir, dx, dy });
function dipSwitch(n) {
  const at = dip(2 * n);
  return { type: `dip-${n}`, title: `DIP switch (${n})`, kind: 'input', dip: 2 * n,
    pins: Array.from({ length: 2 * n }, (_, i) => pin(i + 1, String(i + 1), 'pass', at(i + 1).dx, at(i + 1).dy)),
    inputs: Array.from({ length: n }, (_, i) => ({ k: String(i + 1), kind: 'level' })),
    contacts: Array.from({ length: n }, (_, i) => ({ a: i + 1, b: 2 * n - i, input: i, when: true })) };
}
// a 7-segment display, 0.56 inch: pins 1–5 below (e, d, COM, c, DP), 6–10 above (b, a, COM, f, g), its rows 0.6 inch apart
const SEG_PINS = ['e', 'd', 'COM', 'c', 'DP', 'b', 'a', 'COM', 'f', 'g'];
function sevenSeg(type, title, anode) {
  const at = dip(10, 6), seg = (s) => SEG_PINS.indexOf(s) + 1;
  return { type, title, kind: 'output', dip: 10,
    pins: SEG_PINS.map((name, i) => pin(i + 1, name, 'in', at(i + 1).dx, at(i + 1).dy)),
    lamps: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'DP'].map((s) => ({ name: s.toLowerCase(), a: anode ? 3 : seg(s), k: anode ? seg(s) : 3 })),
    bridges: [[3, 8]] };
}
function ledBar(n) {
  const at = dip(2 * n);
  return { type: `led-bar-${n}`, title: `LED bar (${n})`, kind: 'output', dip: 2 * n,
    pins: Array.from({ length: 2 * n }, (_, i) => pin(i + 1, i < n ? `A${i + 1}` : `K${2 * n - i}`, 'in', at(i + 1).dx, at(i + 1).dy)),
    lamps: Array.from({ length: n }, (_, i) => ({ name: String(i + 1), a: i + 1, k: 2 * n - i })) };
}

const OTHERS = [
  { type: 'breadboard-half', title: 'Half breadboard', kind: 'breadboard', cols: BB_COLS, pins: [] },
  { type: 'breadboard-full', title: 'Full breadboard (its rails split in the middle)', kind: 'breadboard', cols: 63, split: 31, pins: [] },
  { type: 'supply', title: 'Power supply (+5 V, GND)', kind: 'supply', pins: [pin(1, '+', 'vcc', 0, 0), pin(2, '-', 'gnd', 0, 1)] },
  { type: 'logic-switch', title: 'Logic switch', kind: 'input', pins: [pin(1, 'out', 'out', 0, 0)], inputs: [{ k: null, kind: 'level' }], sources: [{ pin: 1, input: 0 }] },
  { type: 'button', title: 'Push button (momentary, normally open)', kind: 'input', pins: [pin(1, '1', 'pass', 0, 0), pin(2, '2', 'pass', 3, 0)],
    inputs: [{ k: null, kind: 'momentary' }], contacts: [{ a: 1, b: 2, input: 0, when: true }] },
  { type: 'spdt', title: 'Slide switch (SPDT)', kind: 'input', pins: [pin(1, 'A', 'pass', 0, 0), pin(2, 'C', 'pass', 1, 0), pin(3, 'B', 'pass', 2, 0)],
    inputs: [{ k: null, kind: 'level' }], contacts: [{ a: 2, b: 1, input: 0, when: false }, { a: 2, b: 3, input: 0, when: true }] },
  dipSwitch(4), dipSwitch(8),
  { type: 'clock', title: 'Clock source', kind: 'input', pins: [pin(1, 'out', 'out', 0, 0)], inputs: [{ k: null, kind: 'clock' }], sources: [{ pin: 1, input: 0 }] },
  { type: 'pull-up', title: 'Pull-up (a weak 1)', kind: 'pull', pins: [pin(1, 'out', 'weak', 0, 0)], pulls: [{ pin: 1, value: '1' }] },
  { type: 'pull-down', title: 'Pull-down (a weak 0)', kind: 'pull', pins: [pin(1, 'out', 'weak', 0, 0)], pulls: [{ pin: 1, value: '0' }] },
  { type: 'led', title: 'LED', kind: 'output', pins: [pin(1, 'A', 'in', 0, 0), pin(2, 'K', 'in', 1, 0)], lamps: [{ name: null, a: 1, k: 2 }] },
  sevenSeg('seg7-cc', '7-segment display, common cathode', false), sevenSeg('seg7-ca', '7-segment display, common anode', true),
  ledBar(10),
];

// ------------------------------------------------------------------ the library
export const PARTS = Object.fromEntries([...OTHERS, ...ICS, ...MSI, ...SEQ].map((d) => [d.type, d]));
/** The order of the library (the side panel's, circuit_parts'): the parts as written, then the ICs. */
export const PART_ORDER = [...OTHERS, ...ICS, ...MSI, ...SEQ].map((d) => d.type);
export const LED_COLORS = ['red', 'green', 'yellow', 'blue', 'white'];
export const WIRE_COLORS = ['red', 'black', 'blue', 'green', 'yellow', 'orange', 'white', 'purple'];
/** A clock's frequency (Hz): the live simulation's, in real time. */
export const CLOCK_HZ = { min: 0.1, max: 50, default: 1 };

/** A part's description by its type, or null. */
export const partDef = (type) => (Object.hasOwn(PARTS, String(type)) ? PARTS[type] : null);

/** A pin's place unturned (dx, dy) turned by `rot` quarter turns clockwise. */
function turn(dx, dy, rot = 0) {
  let x = dx, y = dy;
  for (let k = ((rot % 4) + 4) % 4; k > 0; k--) [x, y] = [-y, x];
  return [x, y];
}

/** A part's pins on the grid: [{ n, name, dir, x, y }] (a breadboard's: none; its holes: partHoles). */
export function partPins(part) {
  const d = partDef(part.type);
  if (!d) return [];
  return d.pins.map((p) => { const [dx, dy] = turn(p.dx, p.dy, part.rot || 0); return { n: p.n, name: p.name, dir: p.dir, x: part.x + dx, y: part.y + dy }; });
}

/** A breadboard part's holes on the grid: [{ name, strip, x, y }] (none for any other part). */
export function partHoles(part) {
  const d = partDef(part.type);
  if (d?.kind !== 'breadboard') return [];
  return breadboardHoles(d.cols, d.split).map((h) => ({ name: h.name, strip: h.strip, x: part.x + h.dx, y: part.y + h.dy }));
}

// ------------------------------------------------------------------ the gates' logic (0, 1, X)
/** A gate's output from its inputs' levels ('0', '1', 'X'), as std_logic_1164's operators. */
export function gateValue(fn, ins) {
  const any = (v) => ins.includes(v);
  switch (fn) {
    case 'not': return ins[0] === '0' ? '1' : ins[0] === '1' ? '0' : 'X';
    case 'and': return any('0') ? '0' : any('X') ? 'X' : '1';
    case 'nand': return any('0') ? '1' : any('X') ? 'X' : '0';
    case 'or': return any('1') ? '1' : any('X') ? 'X' : '0';
    case 'nor': return any('1') ? '0' : any('X') ? 'X' : '1';
    case 'xor': return any('X') ? 'X' : (ins.filter((v) => v === '1').length % 2 ? '1' : '0');
    default: throw new Error(`no gate function '${fn}'`);
  }
}

/** How a family's input reads a net's level: a floating (Z) 74LS input reads high, a 4000's reads X. */
export const readInput = (family, level) => (level === 'Z' ? (family === 'ttl' ? '1' : 'X') : level === '0' || level === '1' ? level : 'X');

/** The library as the MCP server's circuit_parts lists it: each part's type, title, pins and delay. */
export function partsList() {
  return PART_ORDER.map((t) => PARTS[t]).map((d) => ({
    type: d.type, title: d.title, kind: d.kind, ...(d.chip ? { chip: d.chip, family: d.family, tpd: d.tpd, ...(d.oc ? { openCollector: true } : {}) } : {}),
    pins: d.pins.map((p) => ({ n: p.n, name: p.name, dir: p.dir, dx: p.dx, dy: p.dy })),
    ...(d.gates ? { gates: d.gates.map((g) => `${g.fn} (${g.ins.join(', ')}) → ${g.out}`) } : {}),
    ...(d.model || d.seq ? { function: d.title } : {}),
  }));
}
