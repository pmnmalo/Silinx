// Silinx - an Arduino node's program compiled (#5503, roadmap #4695's phase 5, docs/SYSTEMS.md): what the local server's
// Compile Firmware needs besides arduino-cli itself (server/avr-compile.js): the node's sketch (its folder's C and C++,
// a hand-written sketch or the one a drawing generates, core/drawing-code.js), its board's FQBN, the .hex it makes, and
// the compiler's messages as the console says them, by the project's file and line. Isomorphic ES module, no DOM.
import { mcuBoard } from './system-doc.js';
import { relInNode } from './system-layout.js';
import { avrAssemble, avrMessage } from './avr-asm.js';

/** The boards arduino-cli compiles for (a sketch), and Silinx's AVR assembler assembles for (an .asm, #5933): their Fully Qualified Board Name (the Arduino AVR core's, arduino:avr). */
export const AVR_FQBN = { 'arduino-uno': 'arduino:avr:uno', 'arduino-nano': 'arduino:avr:nano:cpu=atmega328' };
/** The Arduino core arduino-cli needs (`arduino-cli core install arduino:avr`). */
export const AVR_CORE = 'arduino:avr';
// a sketch's files, as the Arduino IDE builds them (its .ino joined into one, the others compiled and linked with it)
const SOURCE = /\.(ino|c|cc|cpp|cxx|h|hh|hpp|S)$/;

/** Why the node `node` (a System's) has no firmware compiled by Silinx (an Arduino's by arduino-cli, a PIC24's by XC16), or null. */
export function firmwareRefusal(node) {
  if (node?.kind !== 'mcu') return `${node?.id}: a firmware is compiled for a microcontroller node (this one is ${node?.kind})`;
  const b = mcuBoard(node.board);
  if (b?.arch === 'pic24') return null;   // (its C and assembly by XC16, #5482: core/xc16-compile.js)
  if (!AVR_FQBN[node.board]) return `${node.id}: no compiler for its board ${node.board}`;
  if (node.lang === 'micropython') return `${node.id}: a MicroPython node's program is not compiled (it runs as it is, #5487)`;
  return null;
}

/** The node's sources (the project's paths in its folder, `files` the project's), sorted; its build folder's left out. */
export const firmwareSources = (files, id) => files.filter(f => SOURCE.test(f) && relInNode(f, id) != null && !/^build\//.test(relInNode(f, id))).sort();

/**
 * The node's sketch: { name (its main .ino's, the sketch folder's name), sources, hex (the .hex it makes: its node's
 * firmware when that is a .hex, else `<id>/<name>.hex`) } or { error }. Its main .ino: the one named as its
 * firmware, else the first; none, an error (arduino-cli compiles a sketch).
 */
export function nodeSketch(node, files) {
  const sources = firmwareSources(files, node.id);
  const inos = sources.filter(f => /\.ino$/.test(f));
  if (!inos.length) return { error: `${node.id}: no sketch in its folder ${node.id}/ (an .ino: write one, or draw its program)` };
  const base = f => f.split('/').pop().replace(/\.\w+$/, '');
  const fw = /\.hex$/i.test(node.firmware || '') ? node.firmware : null;
  const main = inos.find(f => fw && base(f) === base(fw)) || inos[0];
  const name = base(main);
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name)) return { error: `${main}: a sketch's name is letters, digits, _ . and - (arduino-cli's)` };
  return { name, main, sources, hex: fw || `${node.id}/${name}.hex` };
}

// gcc's `file:line:col: error: text` (a column or not); a note, its context ("In function …") and the source quoted are not
// the console's
const DIAG = /^(.+?):(\d+)(?::(\d+))?:\s*(fatal error|error|warning):\s*(.*)$/;

/**
 * The compiler's output (its stdout and stderr, `text`) as the console's lines: `ERROR: <file>:<line>:<col>: <text>`
 * and `WARNING: …`, its files the project's (`fileOf` maps a path the compiler wrote to the project's, or null: as it
 * is), once each; the linker's errors (no file) as ERROR lines. { errors, warnings }.
 */
export function compilerMessages(text, fileOf = () => null) {
  const errors = [], warnings = [], seen = new Set();
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trimEnd();
    const m = DIAG.exec(line);
    let out = null, err = false;
    if (m) {
      const file = fileOf(m[1]) || m[1].split(/[\\/]/).pop();
      err = m[4] !== 'warning';
      out = `${err ? 'ERROR' : 'WARNING'}: ${file}:${m[2]}${m[3] ? `:${m[3]}` : ''}: ${m[5]}`;
    } else if (/undefined reference to|multiple definition of/.test(line)) {
      err = true;
      out = `ERROR: ${line.replace(/^.*?:\s*(?=(undefined reference|multiple definition))/, '')}`;
    } else if (/^Sketch too big|^Not enough memory|^collect2: error:/.test(line)) { err = true; out = `ERROR: ${line}`; }
    if (!out || seen.has(out)) continue;
    seen.add(out);
    (err ? errors : warnings).push(out);
  }
  return { errors, warnings };
}

/** The compiler's path of a sketch file (`p`, in its sketch folder `dir`, a copy of the node's folder) as the
 *  project's: `<id>/<its path in the folder>`; arduino-cli's .ino.cpp its .ino; else null. */
export function sketchFileOf(p, dir, id) {
  const f = String(p).replace(/\\/g, '/'), d = String(dir).replace(/\\/g, '/').replace(/\/$/, '') + '/';
  const i = f.indexOf(d);
  if (i < 0) return null;
  return `${id}/${f.slice(i + d.length).replace(/\.ino\.cpp$/, '.ino')}`;
}

/**
 * The node's assembly program (#5933): { main (its .asm: the one named as its firmware, else the first), hex (the .hex it
 * makes: its node's firmware when that is a .hex, else `<id>/<name>.hex`) } when its folder has an .asm and no sketch
 * (an .ino, which arduino-cli compiles), else null.
 */
export function nodeAssembly(node, files) {
  const mine = files.filter(f => relInNode(f, node.id) != null && !/^build\//.test(relInNode(f, node.id)));
  if (mine.some(f => /\.ino$/.test(f))) return null;
  const asms = mine.filter(f => /\.asm$/i.test(f)).sort();
  if (!asms.length) return null;
  const base = f => f.split('/').pop().replace(/\.\w+$/, '');
  const fw = /\.hex$/i.test(node.firmware || '') ? node.firmware : null;
  const main = asms.find(f => fw && base(f) === base(fw)) || asms[0];
  return { main, hex: fw || `${node.id}/${base(main)}.hex` };
}

/**
 * The node's .asm (`asm`: nodeAssembly's, its text `text`) assembled by Silinx's AVR assembler, in the browser and on the
 * server alike: { ok, hex (its Intel HEX text, or null), size (the flash's bytes), lines (the console's: what it does, its
 * ERROR and WARNING lines by file and line, the firmware made), errors, warnings (their counts) }.
 */
export function assembleNode(node, asm, text) {
  const r = avrAssemble(text, { file: asm.main });
  const lines = [`System node ${node.id}: its program ${asm.main} for ${node.board}, by Silinx's AVR assembler.`,
    ...r.errors.map(e => `ERROR: ${avrMessage(e)}`), ...r.warnings.map(w => `WARNING: ${avrMessage(w)}`)];
  const counts = `${r.errors.length} error(s), ${r.warnings.length} warning(s)`;
  if (r.errors.length) return { ok: false, hex: null, size: 0, lines, errors: r.errors.length, warnings: r.warnings.length, error: `${node.id}: its program did not assemble (${counts})` };
  if (!r.size) return { ok: false, hex: null, size: 0, lines, errors: 1, warnings: r.warnings.length, error: `${node.id}: ${asm.main} has no instruction` };
  lines.push(`System node ${node.id}: its firmware ${asm.hex}, ${r.size * 2} bytes of the flash.`);
  return { ok: true, hex: r.hex, size: r.size * 2, lines, errors: 0, warnings: r.warnings.length };
}
