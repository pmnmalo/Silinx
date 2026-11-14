// The parts of a digital circuit (#3897, docs/CIRCUITS.md): each part's pins (their number, name, direction and place
// on the 0.1 inch grid, relative to its pin 1 unturned), its logic and its typical delay; one description for the
// editor, the simulation (core/circuit-sim.js), the checks (core/circuit-check.js), the HDL (core/circuit-hdl.js) and
// the MCP server. Digital only: a pin carries a logic level; the supply is VCC = 1 and GND = 0. Isomorphic module.

// ------------------------------------------------------------------ the breadboard
const BB_COLS = 30;
/** The rows of a breadboard's two halves (a–e above the channel, f–j below), their y from hole a1. */
const BB_ROWS = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 7, g: 8, h: 9, i: 10, j: 11 };
/** Its power rails, their y (one strip each, along the whole board): top +, top −, bottom −, bottom +. */
const BB_RAILS = { tp: -4, tn: -3, bn: 14, bp: 15 };

/** A breadboard's holes: [{ name: 'a1' | 'tp1', strip, dx, dy }] (strip: one name per strip of holes joined). */
export function breadboardHoles(cols = BB_COLS) {
  const out = [];
  for (let c = 1; c <= cols; c++) {
    for (const [r, dy] of Object.entries(BB_ROWS)) out.push({ name: `${r}${c}`, strip: `${c}${dy < 5 ? 'a' : 'f'}`, dx: c - 1, dy });
    for (const [r, dy] of Object.entries(BB_RAILS)) out.push({ name: `${r}${c}`, strip: r, dx: c - 1, dy });
  }
  return out;
}

// ------------------------------------------------------------------ the 74xx gates (14-pin DIPs)
// a 14-pin DIP: pin 1 at its lower left, its notch on the left; 1–7 left to right along the lower row, 8–14 right to
// left along the upper row, 3 steps above (0.3 inch: it straddles a breadboard's channel, rows f and e)
const dip = (n) => (k) => (k <= n / 2 ? { dx: k - 1, dy: 0 } : { dx: n - k, dy: -3 });
const DIP14 = dip(14);
// the 7400's pinout, shared by the 7408, 7432 and 7486: four 2-input gates
const QUAD = [[1, 2, 3], [4, 5, 6], [9, 10, 8], [12, 13, 11]];
// the 7404's: six inverters
const HEX = [[1, 2], [3, 4], [5, 6], [9, 8], [11, 10], [13, 12]];

function gateIc(type, title, fn, groups, tpd) {
  const pins = [];
  const gates = groups.map((g, i) => {
    const ins = g.slice(0, -1), out = g[g.length - 1];
    const L = 'AB'.slice(0, ins.length);
    ins.forEach((p, j) => pins.push({ n: p, name: `${i + 1}${L[j]}`, dir: 'in' }));
    pins.push({ n: out, name: `${i + 1}Y`, dir: 'out' });
    return { fn, ins, out };
  });
  pins.push({ n: 7, name: 'GND', dir: 'gnd' }, { n: 14, name: 'VCC', dir: 'vcc' });
  pins.sort((a, b) => a.n - b.n);
  return { type, title, kind: 'ic', family: 'ttl', chip: `SN74LS${type.slice(2)}`, pins: pins.map((p) => ({ ...p, ...DIP14(p.n) })), gates, tpd, dip: 14 };
}

// ------------------------------------------------------------------ the library
// tpd: the 74LS datasheets' typical propagation delay (ns), one value for both edges
export const PARTS = {
  'breadboard-half': { type: 'breadboard-half', title: 'Half breadboard', kind: 'breadboard', cols: BB_COLS, pins: [] },
  supply: {
    type: 'supply', title: 'Power supply (+5 V, GND)', kind: 'supply',
    pins: [{ n: 1, name: '+', dir: 'vcc', dx: 0, dy: 0 }, { n: 2, name: '-', dir: 'gnd', dx: 0, dy: 1 }],
  },
  'logic-switch': { type: 'logic-switch', title: 'Logic switch', kind: 'input', pins: [{ n: 1, name: 'out', dir: 'out', dx: 0, dy: 0 }] },
  button: {
    type: 'button', title: 'Push button (momentary, normally open)', kind: 'input',
    pins: [{ n: 1, name: '1', dir: 'pass', dx: 0, dy: 0 }, { n: 2, name: '2', dir: 'pass', dx: 3, dy: 0 }],
  },
  led: {
    type: 'led', title: 'LED', kind: 'output',
    pins: [{ n: 1, name: 'A', dir: 'in', dx: 0, dy: 0 }, { n: 2, name: 'K', dir: 'in', dx: 1, dy: 0 }],
  },
  7400: gateIc('7400', 'Quad 2-input NAND', 'nand', QUAD, 10),
  7404: gateIc('7404', 'Hex inverter', 'not', HEX, 10),
  7408: gateIc('7408', 'Quad 2-input AND', 'and', QUAD, 10),
  7432: gateIc('7432', 'Quad 2-input OR', 'or', QUAD, 14),
  7486: gateIc('7486', 'Quad 2-input XOR', 'xor', QUAD, 12),
};
export const LED_COLORS = ['red', 'green', 'yellow', 'blue', 'white'];
export const WIRE_COLORS = ['red', 'black', 'blue', 'green', 'yellow', 'orange', 'white', 'purple'];

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
  return breadboardHoles(d.cols).map((h) => ({ name: h.name, strip: h.strip, x: part.x + h.dx, y: part.y + h.dy }));
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
const KIND_ORDER = ['breadboard', 'supply', 'input', 'output', 'ic'];
export function partsList() {
  // (by kind, then as written: the ICs' numeric keys come first in an object's order)
  return Object.values(PARTS).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)).map((d) => ({
    type: d.type, title: d.title, kind: d.kind, ...(d.chip ? { chip: d.chip, tpd: d.tpd } : {}),
    pins: d.pins.map((p) => ({ n: p.n, name: p.name, dir: p.dir, dx: p.dx, dy: p.dy })),
    ...(d.gates ? { gates: d.gates.map((g) => `${g.fn} (${g.ins.join(', ')}) → ${g.out}`) } : {}),
  }));
}
