// Silinx - a drawing's generated code by its node's base language (#5486, roadmap #5479): in a System's microcontroller
// node whose base language is C or C++ (core/system-layout.js baseLang, #5488), a drawing's file is an Arduino sketch
// made through the synchronous reactive model (core/reactive-from.js, core/reactive-c.js), next to it as
// `<module>.ino`; elsewhere its HDL (core/view-hdl.js), as before. A schematic, a circuit and a register map are hardware:
// refused in a CPU node. The pins of the drawing's ports are its node's GPIO interfaces named as the ports (their pins,
// bit 0 first); the others the board's next free ones. Its ports are the node contract's typed ports (core/system-ports.js,
// #5485): pins at the board's 5 V.
// One module for the server's drawings kept in sync (core/drawing-sync.js), the MCP server and the interface.
// Isomorphic ES module: no DOM and no Node APIs.
import { viewHdl } from './view-hdl.js';
import { SCHEMATIC_ON_CPU, drawingKind, reactiveFromFile } from './reactive-from.js';
import { generateArduino } from './reactive-c.js';
import { baseLang, nodeOfPath } from './system-layout.js';
import { projectSystem } from './project-system.js';
import { port } from './system-ports.js';

/** A CPU node's base languages (core/system-layout.js NODE_LANGS' mcu). */
export const CPU_LANGS = ['c', 'cpp', 'micropython'];
export const isCpuLang = (lang) => CPU_LANGS.includes(lang);
/** The file a drawing's C is written to: next to it, named after its module. */
export const drawnCodePath = (path, module) => `${String(path).includes('/') ? String(path).replace(/\/[^/]*$/, '') : 'src'}/${module}.ino`;
/** Whether a drawing's generated file is its C (an Arduino sketch). */
export const isCodeFile = (path) => /\.ino$/i.test(String(path ?? ''));

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
  if (implicit || !model) return () => false;
  const ids = model.nodes.filter((n) => isCpuLang(baseLang(n, pj?.preferredLanguage))).map((n) => n.id);
  return ids.length ? (path) => nodeOfPath(path, ids) != null : () => false;
}
/** Why a C source cannot be compiled by Silinx HLS (it is a CPU node's), or null. */
export const hlsRefusal = (path, inCpu) => (inCpu(path) ? `${path} is a microcontroller node's C: it is built for its board, not by Silinx HLS` : null);

/** The pins a node gives its drawings' ports: { port: [pins] }, from its GPIO interfaces named as the ports. */
export function nodePins(node) {
  const out = {};
  for (const i of node?.interfaces ?? []) if (i.kind === 'gpio' && Array.isArray(i.pins) && i.pins.length) out[i.name] = i.pins;
  return out;
}

const UNO_VOLTS = 5;   // the Arduino Uno's and Nano's I/O level

/** A model's ports as typed ports (core/system-ports.js): its inputs, then its outputs, pins at the board's level. */
const reactivePorts = (model) => [...model.inputs.map((i) => port({ name: i.name, dir: 'in', volts: UNO_VOLTS, width: i.width })),
  ...model.outputs.map((o) => port({ name: o.name, dir: 'out', volts: UNO_VOLTS, width: o.width }))];

/**
 * A drawing's C on a CPU node: { path, lang, text, module, target (its .ino), errors, warnings, pins, ports (typed,
 * reactivePorts') } (errors and warnings each `<path>: <message>`). lang: the node's base language; pins: { port: [pins] }.
 */
export function drawingC(path, text, { lang = 'c', pins = {}, tickMs } = {}) {
  const fail = (module, messages) => ({ path, lang, text: '', module, target: null, errors: messages.map((m) => `${path}: ${m}`), warnings: [], pins: {}, ports: [] });
  if (lang === 'micropython') return fail(null, ['a drawing\'s MicroPython is not made yet (#5487): its node\'s base language is MicroPython']);
  const r = reactiveFromFile(path, text);
  if (r.errors) return fail(null, r.errors.map((d) => d.message));
  // (a port its node names but not the drawing: not the drawing's)
  const own = Object.fromEntries(Object.entries(pins).filter(([p]) => [...r.model.inputs, ...r.model.outputs].some((x) => x.name === p)));
  const g = generateArduino(r.model, { pins: own, ...(tickMs ? { tickMs } : {}) });
  if (g.errors) return fail(r.model.name, g.errors);
  return { path, lang, text: g.code, module: r.model.name, target: drawnCodePath(path, r.model.name), errors: [], warnings: g.warnings.map((w) => `${path}: ${w}`), pins: g.pins, ports: reactivePorts(r.model) };
}

/** A drawing's generated code by its node's base language: drawingC's on a CPU node, else viewHdl's (its options). */
export function drawingCode(path, text, { nodeLang = null, node = null, ...opts } = {}) {
  if (isCpuLang(nodeLang)) return drawingC(path, text, { lang: nodeLang, pins: nodePins(node), tickMs: opts.tickMs });
  return viewHdl(path, text, opts);
}
