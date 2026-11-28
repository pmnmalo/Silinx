// Test helper (not a test file): the PIC24 emulator's tests' harness (#5480, test/pic24-*.test.js): a program
// assembled (test/pic24-asm.mjs) into a CPU at its address, its registers and memory set, run, and read back.

import { CPU } from '../packages/silinx-pic24/src/index.js';
import { pic24Assemble } from './pic24-asm.mjs';

export const REGS = {
  SPLIM: 0x20, DSRPAG: 0x32, DSWPAG: 0x34, RCOUNT: 0x36, SR: 0x42, CORCON: 0x44, DISICNT: 0x52, TBLPAG: 0x54,
  INTCON1: 0x80, INTCON2: 0x82, INTTREG: 0xe4,
};

/** A CPU with the program assembled at `org` (its PC there); W0-W14 written (no uninitialized-W reset) unless
 *  `uninit`; DSRPAG and DSWPAG 1 (the EDS window on the RAM, as at the reset, #6023) unless `eds0`. */
export function cpuWith(lines, { org = 0x0200, symbols = {}, uninit = false, eds0 = false, program = null } = {}) {
  const { words, labels } = pic24Assemble(lines, { org, symbols });
  const prog = program ? [...program] : [];
  words.forEach((w, i) => { prog[(org >> 1) + i] = w; });
  const cpu = new CPU(Array.from({ length: Math.max(prog.length, (org >> 1) + words.length) }, (_, i) => prog[i] ?? 0xffffff));
  if (!uninit) cpu.winit = 0xffff;
  if (!eds0) { cpu.mem[REGS.DSRPAG >> 1] = 1; cpu.mem[REGS.DSWPAG >> 1] = 1; }
  // the EDS past the RAM (the manual's examples' addresses up to 0xFFFF): an external memory's words
  cpu.ext = new Map();
  cpu.edsRead = (a, B) => { const w = cpu.ext.get(a & ~1) ?? 0; return B ? (a & 1 ? w >> 8 : w & 0xff) : w; };
  cpu.edsWrite = (a, v, B) => {
    const w = cpu.ext.get(a & ~1) ?? 0;
    cpu.ext.set(a & ~1, B ? (a & 1 ? (w & 0xff) | (v << 8) : (w & 0xff00) | v) : v);
  };
  cpu.pc = org;
  return { cpu, labels, end: org + 2 * words.length };
}

const RAM_WORDS = 0x8800 >> 1;
const dataAddr = (k) => (typeof k === 'number' ? k : k.startsWith('Data ') ? parseInt(k.slice(5), 16) : -1);

/** A register's or a memory word's value: 'W3', 'WREG', 'SR', 'RCOUNT'…, 'Data 1200' (a word's address), a number. */
export function get(cpu, k) {
  const a = dataAddr(k);
  if (a >= 0) return a >> 1 < RAM_WORDS ? cpu.mem[a >> 1] : cpu.ext?.get(a) ?? 0;
  if (/^W\d+$/.test(k)) return cpu.mem[+k.slice(1)];
  if (k === 'WREG') return cpu.mem[0];
  if (k === 'PC') return cpu.pc;
  if (k in REGS) return cpu.mem[REGS[k] >> 1];
  throw new Error(`no register ${k}`);
}
export function set(cpu, k, v) {
  const a = dataAddr(k);
  if (a >= 0) { if (a >> 1 < RAM_WORDS) cpu.mem[a >> 1] = v; else cpu.ext.set(a, v); cpu.intDirty = true; return; }
  if (/^W\d+$/.test(k)) cpu.mem[+k.slice(1)] = v;
  else if (k === 'WREG') cpu.mem[0] = v;
  else if (k in REGS) cpu.mem[REGS[k] >> 1] = v;
  else throw new Error(`no register ${k}`);
  cpu.intDirty = true;
}

/** Steps until the PC leaves [from, to) (or `max` steps): the cycles they took. */
export function runThrough(cpu, from, to, max = 100000) {
  const c0 = cpu.cycles;
  for (let n = 0; cpu.pc >= from && cpu.pc < to && n < max; n++) cpu.step();
  return cpu.cycles - c0;
}

/** One instruction run with registers set: { cpu, cycles }. */
export function exec(line, regs = {}, opts = {}) {
  const { cpu } = cpuWith(Array.isArray(line) ? line : [line], opts);
  for (const [k, v] of Object.entries(regs)) set(cpu, k, v);
  const cycles = cpu.step();
  return { cpu, cycles };
}

export const hex4 = (v) => v.toString(16).toUpperCase().padStart(4, '0');

const CONFIG_AT = { FSEC: 0x0abf00, FBSLIM: 0x0abf10, FSIGN: 0x0abf14, FOSCSEL: 0x0abf18, FOSC: 0x0abf1c, FWDT: 0x0abf20, FPOR: 0x0abf24, FICD: 0x0abf28, FDEVOPT1: 0x0abf2c };

/** The device (gb610.js) with a program from reset: GOTO 0x200, the code there, its vectors ({ irq: label }), its
 *  configuration words ({ FOSCSEL: 0xfffc09, … }; the others erased). { dev, mcu, cpu, labels }. */
export async function deviceWith(lines, { config = {}, vectors = {}, fcy, primaryHz } = {}) {
  const { createGb610 } = await import('../packages/silinx-pic24/src/gb610.js');
  const vec = Object.entries(vectors).flatMap(([n, l]) => [`.org ${0x14 + 2 * +n}`, `.word ${l}`]);
  const { words, labels } = pic24Assemble(['goto 0x200', ...vec, '.org 0x200', ...lines]);
  const program = [...words];
  for (const [k, v] of Object.entries(config)) program[CONFIG_AT[k] >> 1] = v;
  const dev = createGb610({ program: Array.from(program, (w) => w ?? 0xffffff), fcy, primaryHz });
  return { dev, mcu: dev.mcu, cpu: dev.cpu, labels };
}

/** Steps until the PC is at `label`'s address (or `max` steps). */
export function runUntil(cpu, pc, max = 1e6) {
  for (let n = 0; cpu.pc !== pc && n < max; n++) cpu.step();
  return cpu.pc === pc;
}
