// A System project's System document (`<name>.sys.json`, roadmap #4695, #4697, docs/SYSTEMS.md): the project's one
// System, its top, a canvas of nodes and the typed links between their interfaces. Its format read and written here; its
// check is core/system-check.js. Isomorphic module (browser + Node).
//
//   { format: 'silinx-system', version: 1, name,
//     nodes: [ { id, kind: 'fpga', module, board, variant?, constraints?: <its constraints file, in its folder>, lang, interfaces, x, y }
//              { id, kind: 'mcu', board: 'arduino-uno' | 'arduino-nano' | 'explorer-1632' | 'pico', firmware: <a .hex / .elf of the project; a Pico's .py>, lang, usb, interfaces, x, y }
//              { id, kind: 'terminal', interfaces, x, y }
//              { id, kind: 'circuit', circuit: <a .circ.json of the project>, interfaces: [], x, y } ],
//     links: [ { id, kind: 'uart' | 'gpio' | 'spi' | 'i2c', a: '<node>.<interface>', b: '<node>.<interface>' } ] }
//
// Each node's files live in its folder, `<id>/` (#5488, core/system-layout.js): its firmware, its circuit, an FPGA node's
// module's sources; the edits refuse a file outside it. A node's `lang` is its base language (#5488, core/system-layout.js: VHDL or Verilog for an FPGA or a design node; C,
// C++ or MicroPython for a microcontroller), written for the kinds that have one, its kind's default when not given.
// An interface is declared once, on its node: a UART { name, kind: 'uart', tx, rx, baud, frame } (an FPGA node's tx and
// rx its module's ports; a microcontroller's its board's UART, named as the board's, its pins the board's), GPIO wires
// { name, kind: 'gpio', pins: [...], dir: 'in' | 'out' } (an FPGA node's pins its module's ports, `led<0>` a bus's bit;
// a microcontroller's its board's pins), an SPI bus { name, kind: 'spi', sck, mosi, miso, ss, hz, mode } (#5214: an FPGA
// node's four its module's ports, the peripheral; a microcontroller's its board's SPI, named as the board's, its pins
// the board's, the master; hz its SCK's rate, mode 0 to 3), an I²C bus { name, kind: 'i2c', scl, sda, hz } (#5214: an
// FPGA node's two its module's ports, the peripheral, its SDA an inout port, driven low or released; a microcontroller's
// its board's Wire, the master; hz its SCL's rate). A UART link joins a's TX to b's RX and b's TX to a's RX; a
// GPIO link its ends' pins in order; an SPI link the master's SCK, MOSI and SS to the peripheral's, its MISO back; an I²C link the master's SCL
// to the peripheral's, and their SDA, each end pulling it low or releasing it (pulled up). An FPGA node is a module of the System project itself (HDL or a drawing), on a board of its own: a
// System project has no `board`. A circuit node (#5215) is what lies between the boards, a circuit of the project:
// its boards (an Arduino, an FPGA board, core/circuit-boards.js) are the System's nodes their labels name, its wires to
// their pins the links (core/system-circuit.js); it has no interfaces.

import { isName } from './ident.js';
import { nodeLangs, baseLang, langError } from './system-layout.js';
import { normalUsb } from './usb-id.js';

export const SYSTEM_FORMAT = 'silinx-system';
// (version 2, #5488: a node a folder of the project, its files in `<id>/`; version 1's projects, their files in src/ and
// firmware/, are not read: no backward compatibility, roadmap #5479)
export const SYSTEM_VERSION = 2;
/** Why a System document of version 1 is not read (#5488), the interface's and the MCP's words. */
export const OLD_SYSTEM = 'a System document of version 1, made before each node was a folder of its project (#5488): this Silinx does not read it; make the System again in a new System project, each node\'s files in its folder';
// (a design node: a design and simulation project's drawings, no board: the Digital Logic profile's, #5440)
export const NODE_KINDS = ['fpga', 'mcu', 'terminal', 'circuit', 'design', 'broker'];
export const LINK_KINDS = ['uart', 'gpio', 'spi', 'i2c', 'mqtt'];
export const INTERFACE_KINDS = ['uart', 'gpio', 'spi', 'i2c', 'mqtt'];
/** An SPI bus's default SCK rate (Hz): the Arduino's SPI_CLOCK_DIV128, 125 kHz. */
export const SPI_HZ = 125000;
/** An I²C bus's default SCL rate (Hz): the Arduino's Wire, 100 kHz. */
export const I2C_HZ = 100000;
/** A UART's frame: data bits, parity (None, Even, Odd), stop bits. */
export const FRAME_RE = /^[5-8][NEO][12]$/;

const digital = n => Array.from({ length: n }, (_, i) => `D${i}`);
const analog = n => Array.from({ length: n }, (_, i) => `A${i}`);
// the PIC24FJ1024GB610's port pins (100 pins: PORTA to PORTG, those its package has)
const PIC24_PINS = { A: [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 14, 15], B: [...Array(16).keys()], C: [1, 2, 3, 4, 12, 13, 14, 15],
  D: [...Array(16).keys()], E: [...Array(10).keys()], F: [0, 1, 2, 3, 4, 5, 7, 8, 12, 13], G: [0, 1, 2, 3, 6, 7, 8, 9, 12, 13, 14, 15] };
const picoPins = () => [...[...Array(23).keys()], 25, 26, 27, 28].map(n => `GP${n}`);
const pic24Pins = () => Object.entries(PIC24_PINS).flatMap(([p, bits]) => bits.map(b => `R${p}${b}`));
/** The microcontrollers' boards: their engine (`arch`: avr, avr8js's; pic24, silinx-pic24's; rp2040, rp2040js's), their pins, their I/O
 *  voltage, their network (`network`: an MQTT interface it may have), their firmware's kinds (`firmwares`: its files' extensions; a MicroPython board's its program's), the languages it
 *  takes (`langs`: all when none), their UARTs ({ name: { tx, rx } }), their SPI buses ({ name: { sck, mosi, miso, ss } }), their I²C buses
 *  ({ name: { scl, sda } }). The Explorer 16/32's UART is its USB-UART's pins (the MCP2221A's: the device's TX RF5, its
 *  RX RF4), any UART module its program maps there through PPS; its clock the 8 MHz crystal (Fcy its configuration
 *  words'). */
export const MCU_BOARDS = [
  { id: 'arduino-uno', name: 'Arduino Uno', arch: 'avr', mcu: 'ATmega328P', clockHz: 16e6, vio: 5, pins: [...digital(14), ...analog(6)], firmwares: ['hex', 'elf'], uarts: { Serial: { tx: 'D1', rx: 'D0' } }, spis: { SPI: { sck: 'D13', mosi: 'D11', miso: 'D12', ss: 'D10' } }, i2cs: { Wire: { scl: 'A5', sda: 'A4' } } },
  { id: 'arduino-nano', name: 'Arduino Nano', arch: 'avr', mcu: 'ATmega328P', clockHz: 16e6, vio: 5, pins: [...digital(14), ...analog(8)], firmwares: ['hex', 'elf'], inputOnly: ['A6', 'A7'], uarts: { Serial: { tx: 'D1', rx: 'D0' } }, spis: { SPI: { sck: 'D13', mosi: 'D11', miso: 'D12', ss: 'D10' } }, i2cs: { Wire: { scl: 'A5', sda: 'A4' } } },
  { id: 'explorer-1632', name: 'Explorer 16/32', arch: 'pic24', mcu: 'PIC24FJ1024GB610', clockHz: 8e6, vio: 3.3, pins: pic24Pins(), firmwares: ['hex'], uarts: { UART: { tx: 'RF5', rx: 'RF4' } }, spis: {}, i2cs: {} },
  // (a Raspberry Pi Pico, #5494: its RP2040 under MicroPython's own firmware, its program a .py; its pins GP0..GP22, the LED's
  // GP25, GP26..GP28; MicroPython's UART(0) and UART(1) on their default pins)
  { id: 'pico', name: 'Raspberry Pi Pico', arch: 'rp2040', mcu: 'RP2040', clockHz: 125e6, vio: 3.3, pins: picoPins(), firmwares: ['py'], langs: ['micropython'], uarts: { UART0: { tx: 'GP0', rx: 'GP1' }, UART1: { tx: 'GP4', rx: 'GP5' } }, spis: {}, i2cs: {} },
  // (a Pico W, #5500: the same, and a network, Silinx's behavioural `network` and `umqtt.simple` over its USB)
  { id: 'pico-w', name: 'Raspberry Pi Pico W', arch: 'rp2040', mcu: 'RP2040', clockHz: 125e6, vio: 3.3, pins: picoPins(), firmwares: ['py'], langs: ['micropython'], network: true, uarts: { UART0: { tx: 'GP0', rx: 'GP1' }, UART1: { tx: 'GP4', rx: 'GP5' } }, spis: {}, i2cs: {} },
];
/** A microcontroller's board by its id, or null. */
export const mcuBoard = id => MCU_BOARDS.find(b => b.id === id) || null;

/** Whether `path` is a System document. */
export const isSystemFile = path => /\.sys\.json$/i.test(String(path || ''));

/** A new, empty System named `name`. */
export const newSystem = name => ({ format: SYSTEM_FORMAT, version: SYSTEM_VERSION, name: String(name || 'system'), nodes: [], links: [] });

// an interface as written: its kind's fields only, in their order
function normalInterface(f) {
  const out = { name: String(f?.name ?? ''), kind: String(f?.kind ?? '') };
  if (out.kind === 'uart') {
    for (const k of ['tx', 'rx']) if (f[k] != null) out[k] = String(f[k]);
    out.baud = f.baud; out.frame = f.frame;
  } else if (out.kind === 'gpio') {
    out.pins = Array.isArray(f.pins) ? f.pins.map(String) : [];
    out.dir = f.dir;
  } else if (out.kind === 'spi') {
    for (const k of ['sck', 'mosi', 'miso', 'ss']) if (f[k] != null) out[k] = String(f[k]);
    out.hz = f.hz ?? SPI_HZ; out.mode = f.mode ?? 0;
  } else if (out.kind === 'i2c') {
    for (const k of ['scl', 'sda']) if (f[k] != null) out[k] = String(f[k]);
    out.hz = f.hz ?? I2C_HZ;
  } else if (out.kind !== 'mqtt') Object.assign(out, f, out);   // (an MQTT interface, #5500: its name and kind only)
  return out;
}

// a node as written: its kind's fields, its interfaces, its place
function normalNode(n) {
  const out = { id: String(n?.id ?? ''), kind: String(n?.kind ?? '') };
  if (out.kind === 'fpga') {
    out.module = n.module ?? null; out.board = n.board ?? null;
    if (n.variant != null) out.variant = String(n.variant);
    // (its pins in its constraints file, #5581: `constraints` its path, else <id>/<module><ext>; a document's `pins`, one
    // of before or an edit's, kept until it is saved: core/system-constraints.js pinsToConstraints)
    if (n.constraints) out.constraints = String(n.constraints);
    if (n.pins && typeof n.pins === 'object' && Object.keys(n.pins).length) out.pins = { ...n.pins };
  } else if (out.kind === 'mcu') {
    out.board = n.board ?? null; out.firmware = n.firmware ?? null;
  } else if (out.kind === 'circuit') out.circuit = n.circuit ?? null;
  else if (out.kind === 'design') out.module = n.module ?? null;
  if (nodeLangs(out.kind).length) out.lang = baseLang(n);
  // (its board told apart by its USB id, #5489: an FPGA's or a microcontroller's)
  const usb = (out.kind === 'fpga' || out.kind === 'mcu') && normalUsb(n.usb);
  if (usb) out.usb = usb;
  out.interfaces = Array.isArray(n?.interfaces) ? n.interfaces.map(normalInterface) : [];
  out.x = Number.isFinite(n?.x) ? n.x : 0; out.y = Number.isFinite(n?.y) ? n.y : 0;
  return out;
}

const normalLink = l => ({ id: String(l?.id ?? ''), kind: String(l?.kind ?? ''), a: String(l?.a ?? ''), b: String(l?.b ?? '') });

/** A System's model with every field in its place and order (the fields a kind has not dropped). */
export function normalizeSystem(m) {
  return { format: SYSTEM_FORMAT, version: SYSTEM_VERSION, name: String(m?.name ?? 'system'),
    nodes: Array.isArray(m?.nodes) ? m.nodes.map(normalNode) : [], links: Array.isArray(m?.links) ? m.links.map(normalLink) : [] };
}

/** Why `id` is no node's id (#5446: a letter, then letters, digits and _), the System editor's and the MCP's words. */
export const nodeIdError = id => `'${id}' is not a node's id: a letter, then letters, digits and _`;

/** A System document's text read: { system } or { error } (not JSON, not a System, a newer version, a node's id that is
 *  no identifier). */
export function readSystem(text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { return { error: `not a System document: ${e.message}` }; }
  if (!m || typeof m !== 'object' || Array.isArray(m) || m.format !== SYSTEM_FORMAT) return { error: `not a System document (its format is not '${SYSTEM_FORMAT}')` };
  if (!Number.isInteger(m.version) || m.version < 1) return { error: 'not a System document (no version)' };
  if (m.version < SYSTEM_VERSION) return { error: OLD_SYSTEM };
  if (m.version > SYSTEM_VERSION) return { error: `a System document of version ${m.version}: this Silinx reads version ${SYSTEM_VERSION}` };
  const system = normalizeSystem(m);
  // (a node's id an identifier, #5446: it names its build folder, build/nodes/<id>/; the editor and the MCP make no other)
  const bad = system.nodes.find(n => !isName(n.id));
  if (bad) return { error: nodeIdError(bad.id) };
  // (a node's base language one of its kind's, #5488: never replaced by the default unsaid)
  const wrong = (Array.isArray(m.nodes) ? m.nodes : []).find(n => n?.lang != null && nodeLangs(n.kind).length && langError(n.kind, n.lang));
  if (wrong) return { error: `node ${wrong.id}: ${langError(wrong.kind, wrong.lang)}` };
  return { system };
}

/** A System's text, as saved: its normalized model, two spaces, a last newline. */
export const writeSystem = m => `${JSON.stringify(normalizeSystem(m), null, 2)}\n`;

/** A link's end ('node.interface') split: { node, iface }, or null (no dot). */
export function linkEnd(end) {
  const s = String(end || ''), i = s.indexOf('.');
  return i > 0 && i < s.length - 1 ? { node: s.slice(0, i), iface: s.slice(i + 1) } : null;
}

/** A new System project's System document (#4702): its path, `<project>.sys.json` at the project's root, and its text
 *  (no node yet), as New Project writes it in both stores and the MCP's new_project. */
export const newSystemFile = name => ({ path: `${name}.sys.json`, text: writeSystem(newSystem(name)) });
