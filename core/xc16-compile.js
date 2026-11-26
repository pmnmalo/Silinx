// Silinx - a PIC24 node's program compiled by XC16 (#5482, roadmap #5479's phase 1, docs/SYSTEMS.md): what the local
// server's Compile Firmware needs besides XC16 itself (server/xc16-compile.js): the node's sources (its folder's C and
// assembly), its device's options, the commands that make its .hex (xc16-gcc compiles and links to an ELF, xc16-bin2hex
// writes its Intel HEX), and the compiler's messages as the console says them, by the project's file and line.
// Isomorphic ES module, no DOM.
//
// The options are the MPLAB XC16 C Compiler User's Guide's (DS50002071): -mcpu=<device> selects the target, -omf=elf the
// ELF object format (its default, said all the same), -T the device's linker script, which the command line always needs
// (`<install>/support/<family>/gld/p<device>.gld`), and a heap (-Wl,--heap=<size>), which the standard C library's input
// and output (printf) need. The free licence optimises at -O0, -O1 and -O2 (-O3, -Os and -mpa are PRO's): -O1.
import { mcuBoard } from './system-doc.js';
import { relInNode } from './system-layout.js';
import { compilerMessages } from './avr-compile.js';

/** Each PIC24 board's device for XC16: its -mcpu, its family (the folder of its linker script) and its script. */
export const XC16_DEVICES = { 'explorer-1632': { mcpu: '24FJ1024GB610', family: 'PIC24F', gld: 'p24FJ1024GB610.gld' } };
/** The optimisation level (XC16's free licence: -O0, -O1, -O2; -O3, -Os and -mpa need a PRO licence). */
export const XC16_OPT = '-O1';
/** The heap's size in bytes (the C library's input and output need one: XC16's guide's 512). */
export const XC16_HEAP = 512;
/** The Docker image of XC16 on the ISE machine, built from Microchip's Linux installer (never shipped): its tag XC16's version. */
export const XC16_IMAGE = 'silinx/xc16:2.10';
// (reported by the monthly Pins workflow, scripts/check-pins.mjs, #5649: Microchip's installer is not public to a workflow)
export const PINNED = [{ kind: 'reported', name: 'XC16 (the PIC24 nodes\' compiler, its Docker image)', current: XC16_IMAGE,
  note: 'Microchip\'s newest XC16 at microchip.com/xc16; the image built again from its installer' }];
// a node's sources: its C, its headers, its assembly (.s, and .S preprocessed)
const SOURCE = /\.(c|h|s|S)$/;
const UNIT = /\.(c|s|S)$/;

/** The node's sources (the project's paths in its folder, `files` the project's), sorted; its build folder's left out. */
export const pic24Sources = (files, id) => files.filter(f => SOURCE.test(f) && relInNode(f, id) != null && !/^build\//.test(relInNode(f, id))).sort();

/**
 * The node's program: { device (XC16_DEVICES'), sources (its C, headers and assembly), units (those compiled: its C and
 * assembly), hex (the .hex it makes: its firmware when that is a .hex, else `<id>/<id>.hex`) } or { error }.
 */
export function nodeProgram(node, files) {
  const device = XC16_DEVICES[node?.board];
  if (!device) return { error: `${node?.id}: XC16 has no device for its board ${node?.board}` };
  const sources = pic24Sources(files, node.id);
  const units = sources.filter(f => UNIT.test(f));
  if (!units.length) return { error: `${node.id}: no C or assembly in its folder ${node.id}/ (a .c or a .s: write one)` };
  const fw = /\.hex$/i.test(node.firmware || '') ? node.firmware : null;
  return { device, sources, units, hex: fw || `${node.id}/${node.id}.hex` };
}

/** Whether the node (a System's) is a PIC24's: its firmware XC16's. */
export const isPic24 = node => mcuBoard(node?.board)?.arch === 'pic24';

/**
 * The commands that make the node's .hex in its build folder, from its sources copied into src/ (`units`: their paths
 * there, src/…), as [cmd, args] run in that folder: xc16-gcc to out/<id>.elf, then xc16-bin2hex to out/<id>.hex. `bin`:
 * XC16's bin folder, `root`: its install folder (its linker scripts'), both as the shell or the system reads them.
 */
export function xc16Commands({ id, device, units, bin, root }) {
  const elf = `out/${id}.elf`;
  return [
    [`${bin}/xc16-gcc`, [`-mcpu=${device.mcpu}`, '-omf=elf', XC16_OPT, '-Wall', '-o', elf, ...units,
      '-T', `${root}/support/${device.family}/gld/${device.gld}`, `-Wl,--heap=${XC16_HEAP},-Map=out/${id}.map`]],
    [`${bin}/xc16-bin2hex`, [elf, '-a', '-omf=elf']],
  ];
}

const sh = s => (/^[\w./=,:+-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);

/**
 * The shell script that makes the node's .hex in XC16's Docker image (its build folder at /work): XC16 found there
 * ($XC16_BIN, else xc16-gcc on its PATH, else the newest /opt/microchip/xc16/<version>/bin), then xc16Commands'.
 */
export function xc16Script({ id, device, units }) {
  const cmds = xc16Commands({ id, device, units, bin: '$XC16_BIN', root: '$XC16_ROOT' })
    .map(([c, a]) => [`"${c}"`, ...a.map(x => (x.includes('$XC16_ROOT') ? `"${x}"` : sh(x)))].join(' '));
  return ['#!/bin/bash', '# Silinx: a PIC24 node\'s firmware made by XC16 (#5482)',
    'if [ -z "$XC16_BIN" ]; then',
    '  gcc=$(command -v xc16-gcc || ls -d /opt/microchip/xc16/*/bin/xc16-gcc 2>/dev/null | sort -V | tail -n 1)',
    '  [ -n "$gcc" ] || { echo "ERROR: no xc16-gcc in this image" >&2; exit 127; }',
    '  XC16_BIN=$(dirname "$gcc")',
    'fi',
    'XC16_ROOT=$(dirname "$XC16_BIN")',
    'mkdir -p out',
    `${cmds[0]} || exit $?`,
    cmds[1], ''].join('\n');
}

// the assembler's `file:line: Error: text` and the linker's `Link Error: text` (xc16-as's and xc16-ld's), besides gcc's
const ASM = /^(.+?):(\d+):\s*(Error|Warning):\s*(.*)$/;
const LINK = /\bLink (Error|Warning):\s*(.*)$/;

/**
 * XC16's output (its stdout and stderr, `text`) as the console's lines: gcc's, the assembler's and the linker's errors
 * and warnings, `ERROR: <file>:<line>[:<col>]: <text>` and `WARNING: …`, by the project's file (`fileOf`, as
 * compilerMessages'), once each. { errors, warnings }.
 */
export function xc16Messages(text, fileOf = () => null) {
  const rest = [], errors = [], warnings = [], seen = new Set();
  const add = (err, out) => { if (seen.has(out)) return; seen.add(out); (err ? errors : warnings).push(out); };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trimEnd();
    const a = ASM.exec(line), l = LINK.exec(line);
    if (a) add(a[3] === 'Error', `${a[3] === 'Error' ? 'ERROR' : 'WARNING'}: ${fileOf(a[1]) || a[1].split(/[\\/]/).pop()}:${a[2]}: ${a[4]}`);
    else if (l) add(l[1] === 'Error', `${l[1] === 'Error' ? 'ERROR' : 'WARNING'}: ${l[2]}`);
    else rest.push(line);
  }
  const g = compilerMessages(rest.join('\n'), fileOf);
  for (const e of g.errors) add(true, e);
  for (const w of g.warnings) add(false, w);
  return { errors, warnings };
}

/** The compiler's path of a source (`p`: src/…, relative to its build folder, or under /work/ or `dir`, its build
 *  folder) as the project's: `<id>/<its path in the node's folder>`; else null. */
export function pic24FileOf(p, dir, id) {
  let f = String(p).replace(/\\/g, '/');
  const d = String(dir || '').replace(/\\/g, '/').replace(/\/$/, '');
  if (d && f.startsWith(`${d}/`)) f = f.slice(d.length + 1);
  f = f.replace(/^\/work\//, '').replace(/^\.\//, '');
  return f.startsWith('src/') ? `${id}/${f.slice(4)}` : null;
}
