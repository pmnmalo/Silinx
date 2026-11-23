// The boards as a circuit's parts (#5215, co-design's phase 2, docs/CODESIGN.md): the Arduino Uno and Nano and the FPGA
// boards with their real pins, drawn where their headers are on the 0.1 inch grid, so that a circuit can show what lies
// between the boards of a System (a level shifter, LEDs, buttons). Their pins are the System's: a microcontroller's its
// board's (core/system-doc.js MCU_BOARDS: D0…D13, A0…), an FPGA board's its Pmod connectors' (core/boards.js: JA1…,
// each with its package pin). A board powers the breadboard: its 5V (3V3) and GND pins drive a 1 and a 0, as the supply's
// terminals; its other pins drive nothing in the circuit alone (a System's node drives them: its program, its design).
// Isomorphic module.
import { mcuBoard } from './system-doc.js';
import { BOARDS } from './boards.js';

const pin = (n, name, dir, dx, dy, more = {}) => ({ n, name, dir, dx, dy, ...more });
// the power pins: a supply's terminals (supply: true), the pins of one name (every GND, every 3V3) joined inside the board
const power = (pins) => {
  const of = (name) => pins.filter((p) => p.supply && p.name === name).map((p) => p.n);
  return [...new Set(pins.filter((p) => p.supply).map((p) => p.name))].map(of).flatMap((ns) => ns.slice(1).map((n) => [ns[0], n]));
};

// ------------------------------------------------------------------ the Arduinos
// an Uno, seen from above, its USB socket on the left: its digital header along its top edge (SCL, SDA, AREF, GND, D13…D8,
// then D7…D0 after the header's gap), its power and analog headers along its bottom edge, 1.9 inch below
function uno() {
  const b = mcuBoard('arduino-uno'), V = { volts: b.vio };
  const top = ['SCL', 'SDA', 'AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8', null, 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'];
  const bottom = [null, null, 'IOREF', 'RESET', '3V3', '5V', 'GND', 'GND', 'VIN', null, 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
  const pins = [];
  const add = (name, dx, dy) => pins.push(pin(pins.length + 1, name, ...mcuPin(b, name), dx, dy, mcuMore(b, name, V)));
  top.forEach((s, x) => s && add(s, x, 0));
  bottom.forEach((s, x) => s && add(s, x, 19));
  const n = (s) => pins.find((p) => p.name === s).n;
  return { type: 'arduino-uno', title: 'Arduino Uno', kind: 'board', board: b.id, vio: b.vio, prefix: 'A', size: { x0: -2, y0: -2, x1: 25, y1: 21 },
    pins, bridges: [...power(pins), [n('SCL'), n('A5')], [n('SDA'), n('A4')]] };
}
// a Nano, a DIP-30 0.6 inch wide (it straddles a breadboard's channel in rows c and g), seen from above, its USB socket on
// the left: pins 1–15 (D1, D0, RST, GND, D2…D12) along its bottom row, 16–30 (D13, 3V3, AREF, A0…A7, 5V, RST, GND, VIN)
// back along its top row
function nano() {
  const b = mcuBoard('arduino-nano'), V = { volts: b.vio };
  const names = ['D1', 'D0', 'RST', 'GND', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12',
    'D13', '3V3', 'AREF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RST', 'GND', 'VIN'];
  const pins = names.map((s, i) => pin(i + 1, s, ...mcuPin(b, s), i < 15 ? i : 29 - i, i < 15 ? 0 : -6, mcuMore(b, s, V)));
  return { type: 'arduino-nano', title: 'Arduino Nano', kind: 'board', board: b.id, vio: b.vio, prefix: 'A', dip: 30, size: { x0: -2, y0: -7, x1: 15, y1: 1 },
    pins, bridges: power(pins) };
}
// a microcontroller's pin: its direction (a board's pin; a supply's terminal; one not simulated) and what it is
function mcuPin(b, name) {
  if (name === '5V' || name === '3V3') return ['vcc'];
  if (name === 'GND') return ['gnd'];
  return [b.pins.includes(name) || name === 'SCL' || name === 'SDA' ? 'board' : 'nc'];
}
function mcuMore(b, name, V) {
  if (name === '5V' || name === '3V3' || name === 'GND') return { supply: true, ...(name === 'GND' ? {} : { volts: name === '5V' ? 5 : 3.3 }) };
  if (name === 'SCL' || name === 'SDA') return { ...V, as: b.i2cs.Wire[name.toLowerCase()] };
  if (!b.pins.includes(name)) return {};
  return { ...V, ...(b.inputOnly?.includes(name) ? { inputOnly: true } : {}) };
}

// ------------------------------------------------------------------ the FPGA boards
// a board's Pmod connectors along its top edge, seen from above, each its pins 1–4, GND, VCC (a 12-pin one's second row,
// 7–10, GND, VCC, below the first), one connector after another; each signal pin with its package pin (loc), from the
// board's description (core/boards.js), its I/O at 3.3 V
const FPGA_BOARDS = [
  // (the Basys2's JA2 and JA3 are its UART's pins in its description: a PmodUSBUART's, #2537)
  { id: 'basys2', title: 'Digilent Basys2', pmods: ['ja', 'jb', 'jc', 'jd'], rows: 1, own: { ja: ['B2', 'A3', 'J3', 'B5'] } },
  { id: 'nexys2', title: 'Digilent Nexys2', pmods: ['ja', 'jb', 'jc'], rows: 2 },   // (its JD's pins are its LEDs' and others': not in its description)
];
const PMOD_W = 8;   // (a connector's six pins and a gap)
function fpgaBoard(f) {
  const b = BOARDS.find((x) => x.id === f.id), pins = [];
  for (const [k, id] of f.pmods.entries()) {
    const res = b.resources.find((r) => r.name === id);
    const locs = f.own?.[id] ?? res?.pins ?? [];
    const J = id.toUpperCase();
    for (let row = 0; row < f.rows; row++) {
      const x0 = k * PMOD_W, first = row * 6 + 1;
      for (let i = 0; i < 4; i++) pins.push(pin(pins.length + 1, `${J}${first + i}`, 'board', x0 + i, row, { loc: locs[row * 4 + i], volts: 3.3 }));
      pins.push(pin(pins.length + 1, 'GND', 'gnd', x0 + 4, row, { supply: true }), pin(pins.length + 2, '3V3', 'vcc', x0 + 5, row, { supply: true, volts: 3.3 }));
    }
  }
  const w = f.pmods.length * PMOD_W - 2;
  return { type: `fpga-${f.id}`, title: f.title, kind: 'board', board: f.id, vio: 3.3, prefix: 'F', size: { x0: -2, y0: -2, x1: w + 1, y1: f.rows + 12 },
    pins, bridges: power(pins) };
}

/** The boards as parts: the Arduinos, then the FPGA boards. */
export const BOARD_PARTS = [uno(), nano(), ...FPGA_BOARDS.map(fpgaBoard)];
