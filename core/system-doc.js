// A co-design project's System document (`<name>.sys.json`, roadmap #4695, #4697, docs/CODESIGN.md): the project's one
// System, its top, a canvas of nodes and the typed links between their interfaces. Its format read and written here; its
// check is core/system-check.js. Isomorphic module (browser + Node).
//
//   { format: 'silinx-system', version: 1, name,
//     nodes: [ { id, kind: 'fpga', module, board, variant?, pins: { <port>: <pin of the board> }, interfaces, x, y }
//              { id, kind: 'mcu', board: 'arduino-uno' | 'arduino-nano', firmware: <a .hex / .elf of the project>, interfaces, x, y }
//              { id, kind: 'terminal', interfaces, x, y } ],
//     links: [ { id, kind: 'uart' | 'gpio', a: '<node>.<interface>', b: '<node>.<interface>' } ] }
//
// An interface is declared once, on its node: a UART { name, kind: 'uart', tx, rx, baud, frame } (an FPGA node's tx and
// rx its module's ports; a microcontroller's its board's UART, named as the board's, its pins the board's), GPIO wires
// { name, kind: 'gpio', pins: [...], dir: 'in' | 'out' } (an FPGA node's pins its module's ports, `led<0>` a bus's bit;
// a microcontroller's its board's pins). A UART link joins a's TX to b's RX and b's TX to a's RX; a GPIO link its ends'
// pins in order. An FPGA node is a module of the co-design project itself (HDL or a drawing), on a board of its own: a
// co-design project has no `board`.

export const SYSTEM_FORMAT = 'silinx-system';
export const SYSTEM_VERSION = 1;
export const NODE_KINDS = ['fpga', 'mcu', 'terminal'];
export const LINK_KINDS = ['uart', 'gpio'];
export const INTERFACE_KINDS = ['uart', 'gpio'];
/** A UART's frame: data bits, parity (None, Even, Odd), stop bits. */
export const FRAME_RE = /^[5-8][NEO][12]$/;

const digital = n => Array.from({ length: n }, (_, i) => `D${i}`);
const analog = n => Array.from({ length: n }, (_, i) => `A${i}`);
/** The microcontrollers' boards: their pins, their I/O voltage, their UARTs ({ name: { tx, rx } }). */
export const MCU_BOARDS = [
  { id: 'arduino-uno', name: 'Arduino Uno', mcu: 'ATmega328P', clockHz: 16e6, vio: 5, pins: [...digital(14), ...analog(6)], uarts: { Serial: { tx: 'D1', rx: 'D0' } } },
  { id: 'arduino-nano', name: 'Arduino Nano', mcu: 'ATmega328P', clockHz: 16e6, vio: 5, pins: [...digital(14), ...analog(8)], inputOnly: ['A6', 'A7'], uarts: { Serial: { tx: 'D1', rx: 'D0' } } },
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
  } else Object.assign(out, f, out);
  return out;
}

// a node as written: its kind's fields, its interfaces, its place
function normalNode(n) {
  const out = { id: String(n?.id ?? ''), kind: String(n?.kind ?? '') };
  if (out.kind === 'fpga') {
    out.module = n.module ?? null; out.board = n.board ?? null;
    if (n.variant != null) out.variant = String(n.variant);
    out.pins = n.pins && typeof n.pins === 'object' ? { ...n.pins } : {};
  } else if (out.kind === 'mcu') {
    out.board = n.board ?? null; out.firmware = n.firmware ?? null;
  }
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

/** A System document's text read: { system } or { error } (not JSON, not a System, a newer version). */
export function readSystem(text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { return { error: `not a System document: ${e.message}` }; }
  if (!m || typeof m !== 'object' || Array.isArray(m) || m.format !== SYSTEM_FORMAT) return { error: `not a System document (its format is not '${SYSTEM_FORMAT}')` };
  if (!Number.isInteger(m.version) || m.version < 1) return { error: 'not a System document (no version)' };
  if (m.version > SYSTEM_VERSION) return { error: `a System document of version ${m.version}: this Silinx reads version ${SYSTEM_VERSION}` };
  return { system: normalizeSystem(m) };
}

/** A System's text, as saved: its normalized model, two spaces, a last newline. */
export const writeSystem = m => `${JSON.stringify(normalizeSystem(m), null, 2)}\n`;

/** A link's end ('node.interface') split: { node, iface }, or null (no dot). */
export function linkEnd(end) {
  const s = String(end || ''), i = s.indexOf('.');
  return i > 0 && i < s.length - 1 ? { node: s.slice(0, i), iface: s.slice(i + 1) } : null;
}
