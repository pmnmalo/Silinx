// Silinx - a drawing's generated code by its node's base language (#5486, roadmap #5479): in a System's microcontroller
// node whose base language is C or C++ (core/system-layout.js baseLang, #5488), a drawing's file is a unit of its node's
// Arduino program made through the synchronous reactive model (core/reactive-from.js, core/reactive-c.js generateUnit; a
// PIC24's on its registers, core/reactive-c-pic24.js, #5552),
// next to it as `<module>.c` (`.cpp` in C++), its <module>_init() and <module>_tick() called by the node's one sketch
// (core/reactive-c-main.js); in one of MicroPython a MicroPython program (core/reactive-py.js, #5487), `<module>.py`; elsewhere its
// HDL (core/view-hdl.js), as before. A schematic, a circuit and a register map are hardware: refused in a CPU node. The
// pins of the drawing's ports are its node's GPIO interfaces named as the ports (their pins, bit 0 first); the others the
// board's next free ones. Its ports are the node contract's typed ports (core/system-ports.js, #5485): pins at the
// board's level (the Arduino's 5 V, the ESP32's and the Pico's 3.3 V). A MicroPython node on a board that does not run
// it (an Arduino: the ESP32's and the Pico's nodes are #5495 and #5494) gets the ESP32 DevKit's program, said.
// One module for the server's drawings kept in sync (core/drawing-sync.js), the MCP server and the interface.
// Isomorphic ES module: no DOM and no Node APIs.
import { viewHdl } from './view-hdl.js';
import { SCHEMATIC_ON_CPU, drawingKind, reactiveFromFile } from './reactive-from.js';
import { generateUnit } from './reactive-c.js';
import { generatePic24Unit } from './reactive-c-pic24.js';
import { generateMicroPython } from './reactive-py.js';
import { PY_BOARDS } from './reactive-py-pins.js';
import { mcuBoard } from './system-doc.js';
import { baseLang, nodeOfPath, relInNode } from './system-layout.js';
import { psOfBoard, isPsPath } from './zynq-ps.js';
import { projectSystem } from './project-system.js';
import { port } from './system-ports.js';

/** A CPU node's base languages (core/system-layout.js NODE_LANGS' mcu). */
export const CPU_LANGS = ['c', 'cpp', 'micropython'];
export const isCpuLang = (lang) => CPU_LANGS.includes(lang);
/** The extension of a drawing's code in a node of base language `lang`: py for MicroPython, cpp for C++, else c. */
export const codeExt = (lang) => (lang === 'micropython' ? 'py' : lang === 'cpp' ? 'cpp' : 'c');
/** The name of a drawing's code in a node of base language `lang` in the messages: MicroPython, else C. */
export const codeName = (lang) => (lang === 'micropython' ? 'MicroPython' : 'C');
/** The file a drawing's code is written to: next to it, named after its module (its extension `ext`, codeExt's). */
export const drawnCodePath = (path, module, ext = 'c') => `${String(path).includes('/') ? String(path).replace(/\/[^/]*$/, '') : 'src'}/${module}.${ext}`;
/** Whether a drawing's generated file is its code (an Arduino sketch, a MicroPython program). */
export const isCodeFile = (path) => /\.(c|cpp|ino|py)$/i.test(String(path ?? ''));

const HARDWARE = { sch: SCHEMATIC_ON_CPU, circ: 'A circuit is hardware: it cannot run on a CPU.', regs: 'A register map is hardware: it cannot run on a CPU.' };

/** Why the drawing `path` cannot be in a node of base language `lang` (a schematic, a circuit or a register map on a
 *  CPU), or null. */
export function cpuDrawingRefusal(path, lang) {
  if (!isCpuLang(lang)) return null;
  const why = HARDWARE[drawingKind(path)];
  return why ? `${path}: ${why}` : null;
}

/** The drawing's node in its project's System: { node, lang (its base language) }, or null (none: an FPGA or a design
 *  project's drawing, or one at the project's root). `files` the project's paths, `texts` its System document's. */
export function drawingNode(pj, path, { files = [], texts = {} } = {}) {
  const { model, implicit } = projectSystem(pj, { files, texts });
  if (implicit || !model) return null;
  const id = nodeOfPath(path, model.nodes.map((n) => n.id));
  const node = id == null ? null : model.nodes.find((n) => n.id === id);
  return node ? { node, lang: baseLang(node, pj?.preferredLanguage) } : null;
}

/**
 * Whether a path of the project is in one of its System's CPU nodes' folders: a predicate (none in an FPGA or a design
 * project). Such a node's C sources and drawings are its board's program, never the FPGA's: neither Silinx HLS's nor a
 * module of the FPGA's design (the flows' sources leave them out).
 */
export function inCpuNode(pj, { files = [], texts = {} } = {}) {
  const { model, implicit } = projectSystem(pj, { files, texts });
  if (!model) return () => false;
  // (a Zynq board's PS's program, its node's ps/, a Board project's at its root: 'ps', #4686)
  const zynq = model.nodes.filter((n) => n.kind === 'fpga' && psOfBoard(n.board, n.variant));
  // (a node's project, core/system-node.js nodeProject: its PS's folder, psDir, <id>/ps, #4687)
  const inPs = (path) => zynq.some((n) => (n.implicit ? isPsPath(path) || (pj?.psDir != null && relInNode(path, pj.psDir) != null) : isPsPath(relInNode(path, n.id))));
  const ids = implicit ? [] : model.nodes.filter((n) => isCpuLang(baseLang(n, pj?.preferredLanguage))).map((n) => n.id);
  if (!ids.length && !zynq.length) return () => false;
  return (path) => (inPs(path) ? 'ps' : ids.length > 0 && nodeOfPath(path, ids) != null);
}
/** Why a C source cannot be compiled by Silinx HLS (it is a CPU node's, a Zynq's PS's), or null. */
export const hlsRefusal = (path, inCpu) => {
  const cpu = inCpu(path);
  return cpu === 'ps' ? `${path} is a Zynq's PS's C: it is built for its Cortex-A9, not by Silinx HLS`
    : cpu ? `${path} is a microcontroller node's C: it is built for its board, not by Silinx HLS` : null;
};

/** The pins a node gives its drawings' ports: { port: [pins] }, from its GPIO interfaces named as the ports. */
export function nodePins(node) {
  const out = {};
  for (const i of node?.interfaces ?? []) if (i.kind === 'gpio' && Array.isArray(i.pins) && i.pins.length) out[i.name] = i.pins;
  return out;
}
/** drawingC's options of a node: its pins (nodePins') and its board. */
export const nodeCodeOpts = (node) => ({ pins: nodePins(node), board: node?.board ?? null });

const UNO_VOLTS = 5;   // the Arduino Uno's and Nano's I/O level

/** A model's ports as typed ports (core/system-ports.js): its inputs, then its outputs, pins at the board's level. */
const reactivePorts = (model, volts = UNO_VOLTS) => [...model.inputs.map((i) => port({ name: i.name, dir: 'in', volts, width: i.width })),
  ...model.outputs.map((o) => port({ name: o.name, dir: 'out', volts, width: o.width }))];

/** A node's board as a MicroPython board of core/reactive-py-pins.js (esp32, pico), or null (none, or another). */
const pyBoardOf = (board) => (/^esp32/i.test(board ?? '') ? 'esp32' : /pico|rp2040/i.test(board ?? '') ? 'pico' : null);

/**
 * A drawing's code on a CPU node, its C or its MicroPython: { path, lang, text, module, target (its .c, .cpp or .py), errors,
 * warnings, pins, ports (typed, reactivePorts') } (errors and warnings each `<path>: <message>`). lang: the node's base
 * language; pins: { port: [pins] }; board: the node's (core/system-doc.js MCU_BOARDS', or an ESP32's or a Pico's).
 */
export function drawingC(path, text, { lang = 'c', pins = {}, board = null, tickMs } = {}) {
  // (notMade: no generator yet for the node's board, said when the drawing is adopted, not an error of the drawing)
  const fail = (module, messages, notMade = false) => ({ path, lang, text: '', module, target: null, errors: messages.map((m) => `${path}: ${m}`), warnings: [], pins: {}, ports: [], ...(notMade ? { notMade } : {}) });
  // (the generated C is the Arduino's, or a PIC24's on its registers, #5552; XC16 compiles C, not C++)
  const b = board && lang !== 'micropython' ? mcuBoard(board) : null;
  const pic = b?.arch === 'pic24';
  if (b && b.arch !== 'avr' && !pic) return fail(null, [`a drawing's C for the ${b.name}'s ${b.mcu} is not made yet: only an Arduino's and a PIC24's are`], true);
  if (pic && lang === 'cpp') return fail(null, [`the ${b.name}'s ${b.mcu} runs C (XC16's): its node's language is C, not C++`], true);
  const r = reactiveFromFile(path, text);
  if (r.errors) return fail(null, r.errors.map((d) => d.message));
  const py = lang === 'micropython';
  const pyBoard = py ? pyBoardOf(board) : null;
  // (a MicroPython node on an Arduino: the ESP32's program, on its free pins, said)
  const notPy = py && board && !pyBoard ? `the node's board, the ${mcuBoard(board)?.name ?? board}, does not run MicroPython: its program is the ${PY_BOARDS.esp32.name}'s, on its free pins` : null;
  // (a port its node names but not the drawing: not the drawing's)
  const own = notPy ? {} : Object.fromEntries(Object.entries(pins).filter(([p]) => [...r.model.inputs, ...r.model.outputs].some((x) => x.name === p)));
  const opts = { pins: own, ...(tickMs ? { tickMs } : {}) };
  const g = py ? generateMicroPython(r.model, { ...opts, board: pyBoard || 'esp32' }) : pic ? generatePic24Unit(r.model, { pins: own }) : generateUnit(r.model, { pins: own, lang });
  if (g.errors) return fail(r.model.name, g.errors);
  const warnings = [...(notPy ? [notPy] : []), ...g.warnings].map((w) => `${path}: ${w}`);
  return { path, lang, text: g.code, module: r.model.name, target: drawnCodePath(path, r.model.name, codeExt(lang)), errors: [], warnings, pins: g.pins, ports: reactivePorts(r.model, py ? PY_BOARDS[g.board].vio : pic ? b.vio : UNO_VOLTS) };
}

/** A drawing's generated code by its node's base language: drawingC's on a CPU node, else viewHdl's (its options). */
export function drawingCode(path, text, { nodeLang = null, node = null, ...opts } = {}) {
  if (isCpuLang(nodeLang)) return drawingC(path, text, { lang: nodeLang, ...nodeCodeOpts(node), tickMs: opts.tickMs });
  return viewHdl(path, text, opts);
}
