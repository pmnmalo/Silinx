// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A Zynq board's PS program compiled (#4687, part 1; the PS: core/zynq-ps.js, #4686): what the local server's Compile PS
// Program needs besides the compiler (server/zynq-ps-compile.js): the program's sources (the node's ps/: its C, its
// headers, its assembly; a Board project's ps/ at its root), Silinx's startup code and linker script (the program bare
// metal on CPU 0 in the on-chip memory, no DDR), the command that makes its ELF (arm-none-eabi-gcc compiles and links),
// the ELF checked (in the OCM's low 192 KB, where it is loaded over JTAG), and the compiler's messages as the console
// says them, by the project's file and line.
//
// The memory as UG585 has it after a reset: the OCM's first three 64 KB blocks at 0x00000000–0x0002FFFF, its last one at
// 0xFFFF0000 (where the boot ROM keeps CPU 1 waiting: not the program's). The program starts at _start, 0x00000000 (its
// vectors), in the Supervisor mode, its stack at the top of the 192 KB; its .data is loaded where it runs (no copy), its
// .bss zeroed by the startup. A ps/ startup.S (or crt0.S) of the user's replaces Silinx's, a ps/ .ld its linker script.
// Isomorphic ES module, no DOM.
import { psOfBoard, isPsPath } from './zynq-ps.js';
import { relInNode } from './system-layout.js';
import { readElf32 } from './elf32.js';
import { xc16Messages } from './xc16-compile.js';

/** The OCM's low part, where the program is linked and loaded: [start, end). */
export const OCM = { start: 0x00000000, end: 0x00030000 };
/** The stack's size in bytes (at the top of the OCM's low part). */
export const STACK = 0x4000;
/** The compiler's options: the Cortex-A9 in the ARM state, no floating-point unit used (the startup does not turn the
 *  VFP on), freestanding C (no operating system: newlib's nosys stubs), -O2. */
const PS_CFLAGS = ['-mcpu=cortex-a9', '-marm', '-mfloat-abi=soft', '-O2', '-g', '-Wall', '-ffreestanding'];
const PS_LDFLAGS = ['-nostartfiles', '--specs=nosys.specs'];
// a program's sources: C, headers, assembly (.s, and .S preprocessed), a linker script
const SOURCE = /\.(c|h|s|S|ld)$/;
const UNIT = /\.(c|s|S)$/;
const STARTUP = /^(startup|crt0)\.S$/i;

/** Silinx's startup code (GNU assembler, ARM state): the vectors at 0, the Supervisor mode with interrupts off, the
 *  stack, the .bss zeroed, main called; its return a wait for ever. */
export const PS_STARTUP = [
  '/* Silinx\'s startup code of a Zynq\'s PS program (#4687): CPU 0, bare metal, in the on-chip memory. */',
  '  .syntax unified',
  '  .arm',
  '  .section .vectors, "ax"',
  '  .global _start',
  '_start:',
  '  b _reset            /* reset */',
  '  b .                 /* undefined instruction */',
  '  b .                 /* supervisor call */',
  '  b .                 /* prefetch abort */',
  '  b .                 /* data abort */',
  '  b .                 /* (reserved) */',
  '  b .                 /* IRQ */',
  '  b .                 /* FIQ */',
  '',
  '  .text',
  '_reset:',
  '  cpsid if, #0x13     /* the Supervisor mode, IRQ and FIQ off */',
  '  ldr sp, =__stack_top',
  '  ldr r0, =__bss_start',
  '  ldr r1, =__bss_end',
  '  mov r2, #0',
  '1:',
  '  cmp r0, r1',
  '  strlo r2, [r0], #4',
  '  blo 1b',
  '  bl main',
  '2:',
  '  wfe',
  '  b 2b',
  '',
].join('\n');

const hex = (n) => `0x${n.toString(16).toUpperCase().padStart(8, '0')}`;

/** Silinx's linker script: the program in the OCM's low 192 KB, its vectors first, its stack at the top. */
export const PS_LINKER_SCRIPT = [
  '/* Silinx\'s linker script of a Zynq\'s PS program (#4687): the on-chip memory\'s low 192 KB, no DDR. */',
  'ENTRY(_start)',
  'MEMORY',
  '{',
  `  OCM (rwx) : ORIGIN = ${hex(OCM.start)}, LENGTH = ${hex(OCM.end - OCM.start)}`,
  '}',
  'SECTIONS',
  '{',
  '  .text : { KEEP(*(.vectors)) *(.text .text.*) } > OCM',
  '  .ARM.exidx : { *(.ARM.exidx*) } > OCM',
  '  .rodata : { *(.rodata .rodata.*) } > OCM',
  '  .data : { *(.data .data.*) } > OCM',
  '  .bss (NOLOAD) : { . = ALIGN(4); __bss_start = .; *(.bss .bss.*) *(COMMON) . = ALIGN(4); __bss_end = .; } > OCM',
  `  .stack (NOLOAD) : { . = ALIGN(8); . = . + ${hex(STACK)}; __stack_top = .; } > OCM`,
  '}',
  '',
].join('\n');

/**
 * The PS program of the node `node` (a System's FPGA node, or a Board project's implicit node, `node.implicit`), `files`
 * the project's: { dir (its ps/ folder's path in the project), sources (its C, headers, assembly and linker script), units
 * (those compiled), startup (the user's startup, or null: Silinx's), script (the user's linker script, or null: Silinx's),
 * elf (its ELF's path in the build folder) } or { error }.
 */
export function psProgram(node, files = []) {
  const id = node?.implicit ? null : node?.id;
  if (!psOfBoard(node?.board, node?.variant)) return { error: `${id || 'the project'}: its board ${node?.board || '(none)'} has no processing system (a Zynq board's: the Zybo Z7, the Arty Z7)` };
  const rel = (f) => (id ? relInNode(f, id) : f);
  const dir = `${id ? `${id}/` : ''}ps`;
  const sources = files.filter((f) => SOURCE.test(f) && isPsPath(rel(f))).sort();
  const units = sources.filter((f) => UNIT.test(f));
  if (!units.some((f) => /\.c$/.test(f))) return { error: `${id || 'the project'}: no C in its ${dir}/ (its PS program: a .c, New Source's PS Program)` };
  const scripts = sources.filter((f) => /\.ld$/.test(f));
  if (scripts.length > 1) return { error: `${id || 'the project'}: two linker scripts in its ${dir}/ (${scripts.join(', ')}): one, or none for Silinx's` };
  const startup = units.find((f) => STARTUP.test(f.split('/').pop())) || null;
  return { dir, sources, units, startup, script: scripts[0] || null, elf: `out/${id || 'ps'}.elf` };
}

/** The build folder of a node's PS program (the project's path): build/nodes/<id>/ps/, a Board project's build/ps/. */
export const psBuildDir = (node) => (node?.implicit ? 'build/ps' : `build/nodes/${node.id}/ps`);

/**
 * The command that makes the program's ELF in its build folder, from its sources copied into src/ (`units`, their paths
 * there, src/…; Silinx's startup.S and ps.ld written beside them when the user has none): [cmd, args] run in that folder.
 * `gcc`: arm-none-eabi-gcc's path.
 */
export function psCommand({ gcc, prog, units }) {
  const script = prog.script ? `src/${prog.script.slice(prog.dir.length + 1)}` : 'silinx/ps.ld';
  return [gcc, [...PS_CFLAGS, ...PS_LDFLAGS, '-T', script, ...(prog.startup ? [] : ['silinx/startup.S']), ...units,
    '-o', prog.elf, `-Wl,-Map=${prog.elf.replace(/\.elf$/, '.map')}`]];
}

/** The compiler's path of a source (`p`: src/…, relative to its build folder, or under `dir`, the build folder) as the
 *  project's: `<its ps/ folder>/<its path there>`; Silinx's own as silinx/…; else null. */
export function psFileOf(p, dir, prog) {
  let f = String(p).replace(/\\/g, '/');
  const d = String(dir || '').replace(/\\/g, '/').replace(/\/$/, '');
  if (d && f.startsWith(`${d}/`)) f = f.slice(d.length + 1);
  f = f.replace(/^\.\//, '');
  return f.startsWith('src/') ? `${prog.dir}/${f.slice(4)}` : f.startsWith('silinx/') ? `Silinx's ${f.slice(7)}` : null;
}

// the linker's `region 'OCM' overflowed by N bytes` and `will not fit in region` lines
const OVERFLOW = /region [`']OCM' overflowed by (\d+) bytes/;

/** The compiler's output (`text`) as the console's lines: gcc's, the assembler's and the linker's errors and warnings,
 *  by the project's file (`fileOf`); the OCM overflowed said as such. { errors, warnings }. */
export function psMessages(text, fileOf = () => null) {
  const m = xc16Messages(text, fileOf);
  const o = OVERFLOW.exec(String(text));
  if (o) m.errors.push(`ERROR: the program does not fit in the on-chip memory's ${(OCM.end - OCM.start) / 1024} KB (its stack's ${STACK / 1024} KB included): ${o[1]} bytes too many`);
  return m;
}

/**
 * The program's ELF (`bytes`) checked: { entry, segments, size, memsz } (core/elf32.js's) or { error }: an ARM
 * executable, its segments in the OCM's low part, its entry there.
 */
export function psElf(bytes) {
  const e = readElf32(bytes);
  if (e.error) return { error: `its ELF: ${e.error}` };
  if (!e.segments.length) return { error: 'its ELF: nothing to load' };
  const out = e.segments.find((s) => s.addr < OCM.start || s.addr + s.memsz > OCM.end);
  if (out) return { error: `its ELF: a segment at ${hex(out.addr)}–${hex(out.addr + out.memsz - 1)}, outside the on-chip memory's ${hex(OCM.start)}–${hex(OCM.end - 1)} (its linker script)` };
  if (e.entry < OCM.start || e.entry >= OCM.end) return { error: `its ELF: its entry point ${hex(e.entry)} is outside the on-chip memory` };
  return e;
}
