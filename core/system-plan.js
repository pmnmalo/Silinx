// Silinx - a System's build and programming plan (#5489, roadmap #5479's phase 2, docs/SYSTEMS.md): each node's steps,
// the FPGA nodes first, then the microcontrollers (which leave reset once the FPGAs are configured): its build (the
// Silinx toolchain to its bitstream, arduino-cli to its sketch's .hex, XC16 to a PIC24's C's, #5482), its image, its programmer, and its state: up to
// date, out of date (a source changed, added or removed, or its description), not built, given (a .hex with no sketch:
// nothing to build), or not buildable, said why. A node's build records what it was built from (`buildRecord`: its
// description and its sources' hashes), written next to its output (server/system-plan.js) whichever process built it.
//
//   const plan = systemBuildPlan(sys, { files, hashes, records, exists });
//   plan.nodes.map(planLine);   // the console's lines, one a node
//
// Isomorphic ES module, no DOM.
import { mcuBoard } from './system-doc.js';
import { relInNode } from './system-layout.js';
import { firmwareRefusal, firmwareSources, nodeAssembly, nodeSketch } from './avr-compile.js';
import { nodeProgram } from './xc16-compile.js';
import { nodeRefusal } from './system-node.js';
import { REACTIVE_KINDS, drawingKind } from './reactive-from.js';

/** The kinds of node the plan builds or programs; the others (a terminal, a circuit, a peripheral) are the simulation's. */
export const PLAN_KINDS = ['fpga', 'mcu'];
/** Each programmer's name, as the console says it. */
const PROGRAMMERS = { jtag: 'over JTAG', avrdude: 'by avrdude (arduino-cli upload)', pickit: 'by a PICkit (MPLAB IPE)', repl: 'over its raw REPL (mpremote)', circuitpy: 'onto its CIRCUITPY drive' };

// what of a node's description its build depends on (its place on the canvas, its interfaces' names do not)
const DESCRIBED = ['kind', 'board', 'variant', 'module', 'constraints', 'firmware', 'runtime', 'lang'];   // (its pins: its constraints file's, a source of its folder, #5581)
const sorted = v => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v);

/** The node's description as its build reads it: its kind, board, variant, module, constraints file, firmware and language. */
export function describedNode(node) {
  const out = {};
  for (const k of DESCRIBED) if (node?.[k] !== undefined && node[k] !== null && node[k] !== '') out[k] = sorted(node[k]);
  return out;
}

/** The files an FPGA node is built from: its folder's (`files` the project's), but its test benches' (sim/), a build/ and
 *  a Zynq board's PS's program (ps/, #4686). */
export const fpgaSources = (files, id) => files.filter(f => {
  const rel = relInNode(f, id);
  return rel != null && !/^(build|sim|ps)\//i.test(rel);
}).sort();

/** The files an Arduino node is built from: its sketch's (`files` the project's) and the drawings that make it (#5486). */
/** An assembly node's sources (#5933): its folder's .asm files (its build folder's left out). */
export const asmSources = (files, id) => files.filter(f => /\.asm$/i.test(f) && relInNode(f, id) != null && !/^build\//.test(relInNode(f, id))).sort();

export const sketchSources = (files, id) => [...new Set([...firmwareSources(files, id),
  ...files.filter(f => relInNode(f, id) != null && REACTIVE_KINDS.includes(drawingKind(f)))])].sort();

/** The record of a node's build (`hashes`: each source's hash): { node (describedNode's), sources: { path: hash } }. */
export function buildRecord(node, sources, hashes = {}) {
  return { node: describedNode(node), sources: Object.fromEntries(sources.map(f => [f, hashes[f] ?? null])) };
}

// why a node built from `record` is out of date with `sources` (their hashes `hashes`), or null: up to date
function staleness(node, record, sources, hashes) {
  if (!record || typeof record !== 'object' || !record.sources) return 'its last build left no record of its sources';
  const was = record.sources;
  for (const f of sources) {
    if (!(f in was)) return `${f} is new since its last build`;
    if (was[f] !== (hashes[f] ?? null)) return `${f} changed since its last build`;
  }
  const gone = Object.keys(was).find(f => !sources.includes(f));
  if (gone) return `${gone} was removed since its last build`;
  const now = describedNode(node), then = record.node || {};
  const changed = DESCRIBED.find(k => JSON.stringify(now[k] ?? null) !== JSON.stringify(then[k] ?? null));
  if (changed) return `its ${changed} changed since its last build`;
  return null;
}

// an FPGA node's entry
function fpgaEntry(n, { files, hashes, records, exists }) {
  const why = nodeRefusal(n);
  const image = n.module ? `build/nodes/${n.id}/build/${n.module}.bit` : null;
  const e = { id: n.id, kind: 'fpga', board: n.board || null, build: 'silinx', image, programmer: 'jtag', sources: why ? [] : fpgaSources(files, n.id) };
  if (why) return { ...e, build: null, image: null, state: 'not buildable', reason: why.replace(new RegExp(`^${n.id}: `), '') };
  return withState(e, n, { hashes, records, exists });
}

// a built entry's state from its image and its record
function withState(e, n, { hashes, records, exists }) {
  if (!exists.has(e.image)) return { ...e, state: 'not built', reason: `no ${e.image} yet` };
  const stale = staleness(n, records[n.id], e.sources, hashes);
  return stale ? { ...e, state: 'out of date', reason: stale } : { ...e, state: 'up to date', reason: null };
}

// a microcontroller node's entry
function mcuEntry(n, { files, hashes, records, exists }) {
  const b = mcuBoard(n.board);
  const e = { id: n.id, kind: 'mcu', board: n.board || null, build: null, image: null, programmer: null, sources: [] };
  if (!b) return { ...e, state: 'not buildable', reason: `no microcontroller board '${n.board ?? ''}'` };
  if (n.lang === 'micropython' || b.arch === 'rp2040' || b.arch === 'esp32') {
    const py = files.filter(f => /\.py$/i.test(f) && relInNode(f, n.id) != null).sort();
    // (CircuitPython's, #5697: its program copied as code.py, with its other files, to its CIRCUITPY drive)
    if (n.runtime === 'circuitpython') return { ...e, programmer: 'circuitpy', image: n.firmware || null, sources: py, state: 'nothing to build', reason: py.length ? 'a CircuitPython program runs as it is' : `no .py in its folder ${n.id}/ yet` };
    return { ...e, programmer: 'repl', sources: py, state: 'nothing to build', reason: py.length ? 'a MicroPython program runs as it is' : `no .py in its folder ${n.id}/ yet` };
  }
  if (b.arch === 'pic24') {
    // (its C and assembly compiled by XC16, #5482; else a .hex given, made outside Silinx)
    const prog = nodeProgram(n, files);
    if (!prog.error) return withState({ ...e, build: 'xc16', image: prog.hex, programmer: 'pickit', sources: prog.sources }, n, { hashes, records, exists });
    const fw = /\.hex$/i.test(n.firmware || '') ? n.firmware : null;
    if (fw && exists.has(fw)) return { ...e, image: fw, programmer: 'pickit', state: 'given', reason: `its .hex ${fw}, made outside Silinx` };
    return { ...e, programmer: 'pickit', state: 'not buildable',
      reason: `no C or assembly in its folder ${n.id}/ and no .hex for its firmware${fw ? ` (${fw} is missing)` : ''}: write its C, or give it the .hex XC16 made` };
  }
  const refused = firmwareRefusal(n);
  // (an assembly program, its folder's .asm with no sketch: Silinx's AVR assembler, #5933)
  const asm = refused ? null : nodeAssembly(n, files);
  if (asm) return withState({ ...e, build: 'avr-asm', image: asm.hex, programmer: 'avrdude', sources: asmSources(files, n.id) }, n, { hashes, records, exists });
  const sketch = refused ? null : nodeSketch(n, files);
  if (sketch && !sketch.error) {
    return withState({ ...e, build: 'arduino-cli', image: sketch.hex, programmer: 'avrdude', sources: sketchSources(files, n.id) }, n, { hashes, records, exists });
  }
  const fw = n.firmware || null;
  if (fw && exists.has(fw)) return { ...e, image: fw, programmer: 'avrdude', state: 'given', reason: `its firmware ${fw}, no sketch to compile` };
  return { ...e, programmer: 'avrdude', state: 'not buildable', reason: fw ? `its firmware ${fw} is missing and there is no sketch to compile` : (refused || sketch.error).replace(new RegExp(`^${n.id}: `), '') };
}

/**
 * The System `sys`'s plan: { nodes: [entry] } in the order they are built and programmed, the FPGA nodes first (in the
 * document's order), then the microcontrollers. An entry: { id, kind, board, build ('silinx' | 'arduino-cli' | 'avr-asm' | 'xc16' | null),
 * image (the bitstream or the firmware it programs, or null), programmer ('jtag' | 'avrdude' | 'pickit' | 'repl', or null), sources (the
 * files it is built from), state ('up to date' | 'out of date' | 'not built' | 'given' | 'nothing to build' | 'not
 * buildable'), reason (text, or null) }. `files`: the project's; `hashes`: their hashes; `records`: each node's
 * buildRecord of its last build (or none); `exists`: the files that are there (the images among them).
 */
export function systemBuildPlan(sys, { files = [], hashes = {}, records = {}, exists = null } = {}) {
  const ctx = { files, hashes, records, exists: exists instanceof Set ? exists : new Set(exists || files) };
  const nodes = sys?.nodes || [];
  return { nodes: [
    ...nodes.filter(n => n.kind === 'fpga').map(n => fpgaEntry(n, ctx)),
    ...nodes.filter(n => n.kind === 'mcu').map(n => mcuEntry(n, ctx)),
  ] };
}

/** Whether Build builds the entry: it has a build and is not up to date (`force`: up to date too, a node's own Build). */
export const needsBuild = (e, force = false) => !!e.build && (force || e.state !== 'up to date');

const BUILDS = { silinx: 'built by the Silinx toolchain', 'arduino-cli': 'compiled by arduino-cli', 'avr-asm': 'assembled by Silinx\'s AVR assembler', xc16: 'compiled by XC16' };

/** The console's line of a plan's entry: `<id>: <state> (<reason>): <built…> to <image>, programmed <how>`. */
export function planLine(e) {
  const how = [e.build && `${BUILDS[e.build]}${e.image ? ` to ${e.image}` : ''}`, !e.build && e.image && `its image ${e.image}`,
    e.programmer && `programmed ${PROGRAMMERS[e.programmer]}`].filter(Boolean).join(', ');
  return `${e.id}: ${e.state}${e.reason ? ` (${e.reason})` : ''}${how ? `; ${how}` : ''}`;
}

/** The plan's lines, the console's (Build Plan's, Build All's first, check_system's last): none when it has no node. */
export const planLines = plan => (plan.nodes.length ? ['Build plan (the FPGA nodes first, then the microcontrollers):', ...plan.nodes.map(e => `  ${planLine(e)}`)] : []);
