// Silinx - a System's FPGA node's constraints file (#5581's part 2, docs/SYSTEMS.md): each FPGA node's pins are in a
// constraints file of its folder, in its board's family's format (`fpga/uart.ucf`; a 7-series' .xdc, an iCE40's .pcf…),
// as an FPGA project's are, named by the node's `constraints` (else `<id>/<module><ext>`). I/O Pin Planning and Edit
// Constraints (Text) edit it; the System's check, its runs (Simulate, Emulate) and its builds (Implement) read the
// node's pins from it (withNodePins: each node's `pins` filled, the engines as before). A System document's `pins` (a
// document written before, an edit_system's `pins`) are moved into the file when it is saved (pinsToConstraints).
// Isomorphic module (browser + Node).
import { readPins, writePins } from './constraints-format.js';
import { constraintsExtOf } from '../packages/silinx-fpga/src/parts.js';
import { nodeBoard, nodeConstraints } from './system-node.js';

const isFpga = n => n?.kind === 'fpga';

/** The path of the FPGA node `n`'s constraints file: its `constraints`, else `<id>/<module><its board's format's ext>`. */
export function nodeConstraintsPath(n) {
  if (n.constraints) return n.constraints;
  const d = nodeBoard(n)?.device;
  return `${n.id}/${n.module || n.id}${d ? constraintsExtOf(d) : '.ucf'}`;
}

/** The pins ({ port: package pin }) of the constraints text `text` of the FPGA node `n` (its board's format), or
 *  { error } when it cannot be read. */
export function nodePinsOf(n, text) {
  const d = nodeBoard(n)?.device;
  if (!d) return { pins: {} };
  try {
    const a = readPins(d, text).assignments || {};
    return { pins: Object.fromEntries(Object.entries(a).filter(([, v]) => v?.loc).map(([k, v]) => [k, String(v.loc).toUpperCase()])) };
  } catch (e) { return { error: e.message }; }
}

/**
 * The System `sys` with each FPGA node's `pins` read from its constraints file (`texts`: { path: text }, the project's;
 * a node with pins of its own and no constraints file, a document of before, keeps them): { system, problems: [{ node,
 * severity, message }] } (its file missing: no pin, a warning; not read: an error).
 */
export function withNodePins(sys, texts = {}) {
  const problems = [];
  if (!sys) return { system: sys, problems };
  const nodes = sys.nodes.map(n => {
    // (a document of before: its own pins, a removed one's '' left out)
    if (!isFpga(n) || (!n.constraints && Object.keys(n.pins || {}).length)) return isFpga(n) ? { ...n, pins: Object.fromEntries(Object.entries(n.pins || {}).filter(([, v]) => v)) } : n;
    const path = nodeConstraintsPath(n), text = texts[path];
    if (text == null) {
      problems.push({ node: n.id, severity: 'warning', message: `${n.id}: no constraints file ${path} yet: its module's ports are on no pin of its board (its I/O Pin Planning)` });
      return { ...n, pins: {} };
    }
    const r = nodePinsOf(n, text);
    if (r.error) problems.push({ node: n.id, severity: 'error', message: `${n.id}: its constraints file ${path} cannot be read: ${r.error}` });
    return { ...n, pins: r.pins || {} };
  });
  return { system: { ...sys, nodes }, problems };
}

/** The paths of the FPGA nodes' constraints files of `sys` (the texts withNodePins reads). */
export const constraintsPaths = sys => (sys?.nodes || []).filter(isFpga).map(nodeConstraintsPath);

/**
 * The constraints text of the FPGA node `n` (`text` its file's, null: none yet) with its pins `pins` ({ port: package pin,
 * '' or null: none }) set, the others kept. A new file is written as Implement wrote a node's (its board's attributes,
 * its clock's period: core/system-node.js nodeConstraints, `ports` its module's).
 */
export function pinsText(n, text, pins, ports = []) {
  const board = nodeBoard(n);
  if (!board) throw new Error(`${n.id}: no FPGA board '${n.board}'`);
  if (text == null || text === '') {
    const set = Object.fromEntries(Object.entries(pins).filter(([, v]) => v != null && v !== ''));
    return nodeConstraints({ ...n, pins: set }, ports).text;
  }
  const m = readPins(board.device, text);
  const assignments = { ...(m.assignments || {}) };
  for (const [port, pin] of Object.entries(pins)) {
    if (pin == null || pin === '') delete assignments[port];
    else assignments[port] = { ...(assignments[port] || {}), loc: String(pin).trim().toUpperCase() };
  }
  return writePins(board.device, { assignments, clocks: m.clocks || [], other: m.other || [] });
}

/**
 * A System's pins moved into its FPGA nodes' constraints files (a document of before, an edit's `pins`): { system (its
 * nodes with `constraints`, no `pins`), writes: [{ path, text }], lines (what moved, the console's) }. `texts` the
 * project's constraints files' texts, `portsOf(module)` a module's ports (core/board-constraints.js ucfPort's; null: not
 * known, no clock period).
 */
export function pinsToConstraints(sys, { texts = {}, portsOf = () => null } = {}) {
  const writes = [], lines = [];
  const nodes = sys.nodes.map(n => {
    if (!isFpga(n) || !n.pins || !Object.keys(n.pins).length) return n;
    const path = nodeConstraintsPath(n), { pins, ...rest } = n;
    if (!nodeBoard(n)) return n;   // (no board: its pins kept, its check says why)
    writes.push({ path, text: pinsText(rest, texts[path] ?? null, pins, portsOf(n.module) || []) });
    lines.push(`${n.id}: its pins ${texts[path] == null ? 'written to' : 'set in'} its constraints file ${path}`);
    return { ...rest, constraints: path };
  });
  return { system: { ...sys, nodes }, writes, lines };
}
