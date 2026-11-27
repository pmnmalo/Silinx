// Silinx - an AVR assembler (#5933, part of #5892): an Arduino node's assembly program (its .asm) made the flash's words
// and its .hex, in the browser and on the local server, with no avra, avrasm2 or avr-as. Its syntax is avrasm2's (avra's):
// one statement a line, ';' comments, 'label:' labels, the ATmega328P's names built in (core/avr-m328p.js, as
// `.include "m328Pdef.inc"` gives them: PORTB, UDRE0, INT0addr, RAMEND, XL..ZH), the AVRe+ instruction set of the
// ATmega328P (every mnemonic of the AVR Instruction Set Manual it has, their aliases too: lsl, tst, clr, ser, sbr, cbr,
// breq…), the directives .include .device .equ .set .def .undef .org .cseg .dseg .eseg .db .dw .byte .list .nolist
// .exit, and expressions as avrasm2's: decimal, $ff, 0xff, 0b101, 'c', a name, PC, ( ) and the C operators, low() high()
// byte2() byte3() lwrd() hwrd(); avr-as's lo8() hi8() too. Its errors and warnings are by line, every line assembled though
// an earlier one failed; a label defined twice is refused, naming both lines (#5893's lesson).
import { REGISTERS, BITS, VECTORS, MEMORY } from './avr-m328p.js';

/** The flash's size in words (the ATmega328P's 32 KB). */
const FLASH_WORDS = 0x4000;

function fail(msg) { throw new Error(msg); }

// ---- expressions: a tokenizer and a precedence climber over C's operators
const OPS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '<=', '>', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
const FUNCS = {
  low: (v) => v & 0xff, lo8: (v) => v & 0xff, high: (v) => (v >> 8) & 0xff, hi8: (v) => (v >> 8) & 0xff,
  byte2: (v) => (v >> 8) & 0xff, byte3: (v) => (v >> 16) & 0xff, byte4: (v) => (v >>> 24) & 0xff, hh8: (v) => (v >> 16) & 0xff,
  lwrd: (v) => v & 0xffff, hwrd: (v) => (v >>> 16) & 0xffff, exp2: (v) => 2 ** v, log2: (v) => Math.floor(Math.log2(v)),
  abs: (v) => Math.abs(v),
};
function tokens(text) {
  const out = [], re = /\s*(0x[0-9a-f]+|\$[0-9a-f]+|0b[01]+|\d+|'(?:\\.|[^'])'|[A-Za-z_][\w]*|<<|>>|<=|>=|==|!=|&&|\|\||[-+*/%&|^~!()<>,])/iy;
  let m;
  re.lastIndex = 0;
  while (re.lastIndex < text.length && (m = re.exec(text))) out.push(m[1]);
  if (re.lastIndex < text.length && text.slice(re.lastIndex).trim()) fail(`cannot read '${text.slice(re.lastIndex).trim()}'`);
  return out;
}
const CHAR_ESC = { n: 10, r: 13, t: 9, 0: 0, '\\': 92, "'": 39, '"': 34 };
function evaluate(text, env) {
  const t = tokens(text);
  let i = 0;
  const peek = () => t[i];
  const primary = () => {
    const x = t[i++];
    if (x == null) fail(`an expression ends too soon: ${text}`);
    if (x === '(') { const v = binary(0); if (t[i++] !== ')') fail(`a ')' is missing: ${text}`); return v; }
    if (x === '-') return -primary();
    if (x === '+') return primary();
    if (x === '~') return ~primary();
    if (x === '!') return primary() ? 0 : 1;
    if (/^0x/i.test(x)) return parseInt(x.slice(2), 16);
    if (x[0] === '$') return parseInt(x.slice(1), 16);
    if (/^0b/i.test(x)) return parseInt(x.slice(2), 2);
    if (/^\d/.test(x)) return parseInt(x, 10);
    if (x[0] === "'") return x[1] === '\\' ? (CHAR_ESC[x[2]] ?? fail(`no escape \\${x[2]}`)) : x.charCodeAt(1);
    const low = x.toLowerCase();
    if (low in FUNCS && peek() === '(') { i++; const v = binary(0); if (t[i++] !== ')') fail(`a ')' is missing: ${text}`); return FUNCS[low](v); }
    if (low === 'pc') return env.pc;
    return env.lookup(x);
  };
  const binary = (level) => {
    if (level === OPS.length) return primary();
    let v = binary(level + 1);
    while (OPS[level].includes(peek())) {
      const op = t[i++], w = binary(level + 1);
      v = op === '||' ? +(v || w) : op === '&&' ? +(v && w) : op === '|' ? v | w : op === '^' ? v ^ w : op === '&' ? v & w
        : op === '==' ? +(v === w) : op === '!=' ? +(v !== w) : op === '<' ? +(v < w) : op === '<=' ? +(v <= w) : op === '>' ? +(v > w)
          : op === '>=' ? +(v >= w) : op === '<<' ? v << w : op === '>>' ? v >> w : op === '+' ? v + w : op === '-' ? v - w : op === '*' ? v * w
            : op === '/' ? (w ? Math.trunc(v / w) : fail('a division by 0')) : (w ? v % w : fail('a division by 0'));
    }
    return v;
  };
  const v = binary(0);
  if (i < t.length) fail(`cannot read '${t.slice(i).join(' ')}' in ${text}`);
  return v;
}

// ---- operands
function range(v, lo, hi, what) { if (!Number.isInteger(v) || v < lo || v > hi) fail(`${what} ${v} not in ${lo}..${hi}`); return v; }
function register(text, env, lo = 0, hi = 31) {
  const s = text.trim(), low = s.toLowerCase();
  const n = /^r(\d+)$/.test(low) ? +low.slice(1) : env.defs[low] ?? null;
  if (n == null || n > 31) fail(`not a register: ${s}`);
  if (n < lo || n > hi) fail(`r${n}: a register r${lo}..r${hi} expected`);
  return n;
}

// the encoders: (c) -> [words]; c = { ops (operand texts), env, pc (word address), warn }
const two = (op, dlo = 0, rlo = 0, dhi = 31, rhi = 31) => (c) => {
  if (c.ops.length !== 2) fail('2 operands: Rd, Rr');
  const d = register(c.ops[0], c.env, dlo, dhi), r = register(c.ops[1], c.env, rlo, rhi);
  return [op | ((r & 0x10) << 5) | (d << 4) | (r & 0x0f)];
};
const same = (op) => (c) => { if (c.ops.length !== 1) fail('1 operand: Rd'); const d = register(c.ops[0], c.env); return [op | ((d & 0x10) << 5) | (d << 4) | (d & 0x0f)]; };
const one = (op) => (c) => { if (c.ops.length !== 1) fail('1 operand: Rd'); return [op | (register(c.ops[0], c.env) << 4)]; };
const imm = (op, invert = false) => (c) => {
  if (c.ops.length !== 2) fail('2 operands: Rd, K');
  const d = register(c.ops[0], c.env, 16, 31);
  let k = range(c.value(c.ops[1]), -128, 255, 'K');
  if (invert) k = ~k;
  k &= 0xff;
  return [op | ((k & 0xf0) << 4) | ((d - 16) << 4) | (k & 0x0f)];
};
const word = (op) => (c) => {
  if (c.ops.length !== 2) fail('2 operands: Rd, K');
  const d = register(c.ops[0], c.env);
  if (![24, 26, 28, 30].includes(d)) fail(`r${d}: r24, r26, r28 or r30 expected`);
  const k = range(c.value(c.ops[1]), 0, 63, 'K');
  return [op | ((k & 0x30) << 2) | (((d - 24) >> 1) << 4) | (k & 0x0f)];
};
const mulx = (op) => (c) => {
  if (c.ops.length !== 2) fail('2 operands: Rd, Rr');
  return [op | ((register(c.ops[0], c.env, 16, 23) - 16) << 4) | (register(c.ops[1], c.env, 16, 23) - 16)];
};
const fixed = (w) => (c) => { if (c.ops.length) fail('no operand'); return [w]; };
const rel = (c, target, bits) => {
  const k = c.value(target) - (c.pc + 1), half = 1 << (bits - 1);
  if (c.env.pass === 2) range(k, -half, half - 1, 'a relative jump of');
  return k & ((1 << bits) - 1);
};
const branch = (s, set) => (c) => { if (c.ops.length !== 1) fail('1 operand: k'); return [(set ? 0xf000 : 0xf400) | (rel(c, c.ops[0], 7) << 3) | s]; };
const brb = (set) => (c) => { if (c.ops.length !== 2) fail('2 operands: s, k'); return [(set ? 0xf000 : 0xf400) | (rel(c, c.ops[1], 7) << 3) | range(c.value(c.ops[0]), 0, 7, 's')]; };
const flag = (op, s) => fixed(op | (s << 4));
const regBit = (op) => (c) => { if (c.ops.length !== 2) fail('2 operands: Rr, b'); return [op | (register(c.ops[0], c.env) << 4) | range(c.value(c.ops[1]), 0, 7, 'b')]; };
const ioBit = (op) => (c) => { if (c.ops.length !== 2) fail('2 operands: A, b'); return [op | (range(c.value(c.ops[0]), 0, 31, 'A') << 3) | range(c.value(c.ops[1]), 0, 7, 'b')]; };
const far = (op) => (c) => {
  if (c.ops.length !== 1) fail('1 operand: k');
  const k = c.env.pass === 2 ? range(c.value(c.ops[0]), 0, FLASH_WORDS - 1, 'k') : 0;
  return [op | (((k >> 17) & 0x1f) << 4) | ((k >> 16) & 1), k & 0xffff];
};

// LD, ST, LDD, STD, LPM: the pointer forms
const PTR = { x: [0x900c, 0x920c], 'x+': [0x900d, 0x920d], '-x': [0x900e, 0x920e], y: [0x8008, 0x8208], 'y+': [0x9009, 0x9209], '-y': [0x900a, 0x920a], z: [0x8000, 0x8200], 'z+': [0x9001, 0x9201], '-z': [0x9002, 0x9202] };
const PTR_REGS = { x: [26, 27], y: [28, 29], z: [30, 31] };
function pointer(c, text, store, reg) {
  const p = text.replace(/\s+/g, '').toLowerCase();
  if (!(p in PTR)) fail(`not a pointer: ${text} (X, X+, -X, Y, Y+, -Y, Z, Z+, -Z)`);
  // (the manual's undefined combinations: the pointer's own register loaded or stored with it changed)
  if (p !== 'x' && p !== 'y' && p !== 'z' && PTR_REGS[p.replace(/[-+]/g, '')].includes(reg)) c.warn(`${store ? 'st' : 'ld'} with r${reg}, a byte of the pointer ${text.trim()} it changes: the result is undefined`);
  return PTR[p][store ? 1 : 0] | (reg << 4);
}
function displaced(c, text, store, reg) {
  const m = /^\s*([yz])\s*\+\s*(.+)$/i.exec(text) ?? fail(`not a displacement: ${text} (Y+q, Z+q)`);
  const q = range(c.value(m[2]), 0, 63, 'q');
  return (m[1].toLowerCase() === 'y' ? 0x8008 : 0x8000) | (store ? 0x0200 : 0) | ((q & 0x20) << 8) | ((q & 0x18) << 7) | (q & 7) | (reg << 4);
}
const TABLE = {
  add: two(0x0c00), adc: two(0x1c00), sub: two(0x1800), sbc: two(0x0800), and: two(0x2000), or: two(0x2800), eor: two(0x2400),
  cp: two(0x1400), cpc: two(0x0400), cpse: two(0x1000), mov: two(0x2c00), mul: two(0x9c00),
  lsl: same(0x0c00), rol: same(0x1c00), tst: same(0x2000), clr: same(0x2400),
  com: one(0x9400), neg: one(0x9401), swap: one(0x9402), inc: one(0x9403), asr: one(0x9405), lsr: one(0x9406), ror: one(0x9407),
  dec: one(0x940a), push: one(0x920f), pop: one(0x900f),
  subi: imm(0x5000), sbci: imm(0x4000), andi: imm(0x7000), ori: imm(0x6000), sbr: imm(0x6000), cbr: imm(0x7000, true), cpi: imm(0x3000), ldi: imm(0xe000),
  ser: (c) => { if (c.ops.length !== 1) fail('1 operand: Rd'); return [0xef0f | ((register(c.ops[0], c.env, 16, 31) - 16) << 4)]; },
  adiw: word(0x9600), sbiw: word(0x9700),
  muls: (c) => { if (c.ops.length !== 2) fail('2 operands: Rd, Rr'); return [0x0200 | ((register(c.ops[0], c.env, 16, 31) - 16) << 4) | (register(c.ops[1], c.env, 16, 31) - 16)]; },
  mulsu: mulx(0x0300), fmul: mulx(0x0308), fmuls: mulx(0x0380), fmulsu: mulx(0x0388),
  movw: (c) => {
    if (c.ops.length !== 2) fail('2 operands: Rd, Rr');
    const d = register(c.ops[0], c.env), r = register(c.ops[1], c.env);
    if (d & 1 || r & 1) fail('movw: even registers (a pair\'s low one)');
    return [0x0100 | ((d >> 1) << 4) | (r >> 1)];
  },
  rjmp: (c) => { if (c.ops.length !== 1) fail('1 operand: k'); return [0xc000 | rel(c, c.ops[0], 12)]; },
  rcall: (c) => { if (c.ops.length !== 1) fail('1 operand: k'); return [0xd000 | rel(c, c.ops[0], 12)]; },
  jmp: far(0x940c), call: far(0x940e),
  ijmp: fixed(0x9409), icall: fixed(0x9509), ret: fixed(0x9508), reti: fixed(0x9518),
  nop: fixed(0x0000), sleep: fixed(0x9588), break: fixed(0x9598), wdr: fixed(0x95a8), spm: fixed(0x95e8),
  brbs: brb(true), brbc: brb(false),
  brcs: branch(0, true), brlo: branch(0, true), brcc: branch(0, false), brsh: branch(0, false), breq: branch(1, true), brne: branch(1, false),
  brmi: branch(2, true), brpl: branch(2, false), brvs: branch(3, true), brvc: branch(3, false), brlt: branch(4, true), brge: branch(4, false),
  brhs: branch(5, true), brhc: branch(5, false), brts: branch(6, true), brtc: branch(6, false), brie: branch(7, true), brid: branch(7, false),
  bset: (c) => { if (c.ops.length !== 1) fail('1 operand: s'); return [0x9408 | (range(c.value(c.ops[0]), 0, 7, 's') << 4)]; },
  bclr: (c) => { if (c.ops.length !== 1) fail('1 operand: s'); return [0x9488 | (range(c.value(c.ops[0]), 0, 7, 's') << 4)]; },
  sec: flag(0x9408, 0), clc: flag(0x9488, 0), sez: flag(0x9408, 1), clz: flag(0x9488, 1), sen: flag(0x9408, 2), cln: flag(0x9488, 2),
  sev: flag(0x9408, 3), clv: flag(0x9488, 3), ses: flag(0x9408, 4), cls: flag(0x9488, 4), seh: flag(0x9408, 5), clh: flag(0x9488, 5),
  set: flag(0x9408, 6), clt: flag(0x9488, 6), sei: flag(0x9408, 7), cli: flag(0x9488, 7),
  sbrc: regBit(0xfc00), sbrs: regBit(0xfe00), bst: regBit(0xfa00), bld: regBit(0xf800),
  sbic: ioBit(0x9900), sbis: ioBit(0x9b00), sbi: ioBit(0x9a00), cbi: ioBit(0x9800),
  in: (c) => {
    if (c.ops.length !== 2) fail('2 operands: Rd, A');
    const d = register(c.ops[0], c.env), a = range(c.value(c.ops[1]), 0, 63, 'A');
    return [0xb000 | ((a & 0x30) << 5) | (d << 4) | (a & 0x0f)];
  },
  out: (c) => {
    if (c.ops.length !== 2) fail('2 operands: A, Rr');
    const a = range(c.value(c.ops[0]), 0, 63, 'A'), r = register(c.ops[1], c.env);
    return [0xb800 | ((a & 0x30) << 5) | (r << 4) | (a & 0x0f)];
  },
  lds: (c) => { if (c.ops.length !== 2) fail('2 operands: Rd, k'); return [0x9000 | (register(c.ops[0], c.env) << 4), range(c.value(c.ops[1]), 0, 0xffff, 'k')]; },
  sts: (c) => { if (c.ops.length !== 2) fail('2 operands: k, Rr'); const k = range(c.value(c.ops[0]), 0, 0xffff, 'k'); return [0x9200 | (register(c.ops[1], c.env) << 4), k]; },
  ld: (c) => { if (c.ops.length !== 2) fail('2 operands: Rd, X|Y|Z'); const d = register(c.ops[0], c.env); return [pointer(c, c.ops[1], false, d)]; },
  st: (c) => { if (c.ops.length !== 2) fail('2 operands: X|Y|Z, Rr'); const r = register(c.ops[1], c.env); return [pointer(c, c.ops[0], true, r)]; },
  ldd: (c) => { if (c.ops.length !== 2) fail('2 operands: Rd, Y+q|Z+q'); return [displaced(c, c.ops[1], false, register(c.ops[0], c.env))]; },
  std: (c) => { if (c.ops.length !== 2) fail('2 operands: Y+q|Z+q, Rr'); return [displaced(c, c.ops[0], true, register(c.ops[1], c.env))]; },
  lpm: (c) => {
    if (!c.ops.length) return [0x95c8];
    if (c.ops.length !== 2) fail('lpm, or lpm Rd, Z / Z+');
    const d = register(c.ops[0], c.env), p = c.ops[1].replace(/\s+/g, '').toLowerCase();
    if (p !== 'z' && p !== 'z+') fail(`lpm: Z or Z+, not ${c.ops[1].trim()}`);
    if (p === 'z+' && (d === 30 || d === 31)) c.warn(`lpm with r${d}, a byte of the pointer Z+ it changes: the result is undefined`);
    return [(p === 'z' ? 0x9004 : 0x9005) | (d << 4)];
  },
};
/** The instructions the assembler knows (the ATmega328P's, their aliases too). */
export const MNEMONICS = Object.keys(TABLE).sort();

// a line's operands, split at the commas outside quotes and parentheses
function split(text) {
  const out = [];
  let cur = '', depth = 0, q = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { cur += ch; if (ch === '\\') cur += text[++i] ?? ''; else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") q = ch;
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out;
}
// a line's comment cut (';' or '//' outside quotes)
function uncomment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === ';' || (ch === '/' && line[i + 1] === '/')) return line.slice(0, i);
  }
  return line;
}
// a .db's bytes: numbers, characters and strings
function dbBytes(text, c) {
  const out = [];
  for (const item of split(text)) {
    if (!item) fail('.db: an empty item');
    if (item[0] === '"') {
      const m = /^"((?:\\.|[^"\\])*)"$/.exec(item) ?? fail(`.db: a string not closed: ${item}`);
      for (let i = 0; i < m[1].length; i++) out.push(m[1][i] === '\\' ? (CHAR_ESC[m[1][++i]] ?? fail(`no escape \\${m[1][i]}`)) : m[1].charCodeAt(i) & 0xff);
    } else out.push(range(c.value(item), -128, 255, '.db byte') & 0xff);
  }
  return out;
}

const BUILTIN = Object.fromEntries(Object.entries({ ...REGISTERS, ...BITS, ...VECTORS, ...MEMORY }).map(([k, v]) => [k.toUpperCase(), v]));
const DEFS = { xl: 26, xh: 27, yl: 28, yh: 29, zl: 30, zh: 31 };
const INCLUDES = /^"?(m328p?def\.inc|atmega328p?\.inc)"?$/i;

/**
 * A source assembled (its lines, or its text): { words (a Uint16Array of the flash's words from 0, the erased 0xffff
 * between), size (the words used, the highest address + 1), hex (its Intel HEX), eeprom (a Uint8Array, or null), labels
 * (their word addresses), errors, warnings } (each { file, line, message }, the line counted from 1).
 */
export function avrAssemble(lines, { file = '' } = {}) {
  const src = Array.isArray(lines) ? lines : String(lines).split(/\r?\n/);
  const errors = [], warnings = [], where = {}, labels = {};
  const at = (list, line, message) => list.push({ file, line, message });
  let flash, eeprom, used;
  for (let pass = 1; pass <= 2; pass++) {
    const symbols = {}, defs = { ...DEFS };
    flash = new Map(); eeprom = new Map(); used = new Map();
    const seg = { cseg: 0, dseg: MEMORY.RAMSTART ?? 0x100, eseg: 0 };
    let cur = 'cseg', exited = false;
    const env = {
      pass, defs, pc: 0,
      lookup(name) {
        const low = name.toLowerCase();
        if (low in symbols) return symbols[low];
        if (name in labels) return labels[name];
        const up = name.toUpperCase();
        if (up in BUILTIN) return BUILTIN[up];
        if (low in defs) fail(`${name} is a register (.def), not a value`);
        if (pass === 1) return 0;
        return fail(`unknown name: ${name}`);
      },
    };
    src.forEach((raw, i) => {
      if (exited) return;
      const line = i + 1;
      let s = uncomment(raw).trim();
      try {
        let m;
        while ((m = /^([A-Za-z_][\w]*)\s*:(?!:)\s*/.exec(s))) {
          if (pass === 1) {
            if (/^pc$/i.test(m[1])) at(errors, line, `'${m[1]}' is the program counter's name (PC), not a label's`);
            else if (m[1] in where) at(errors, line, `the label '${m[1]}' is defined twice: at line ${where[m[1]]} and at line ${line}`);
            else { where[m[1]] = line; labels[m[1]] = seg[cur]; }
          }
          s = s.slice(m[0].length);
        }
        if (!s) return;
        const [head, rest = ''] = s.split(/\s+(.*)/s);
        const lowHead = head.toLowerCase();
        env.pc = seg[cur];
        const c = { ops: split(rest), env, pc: seg[cur], value: (t) => evaluate(t, env), warn: (msg) => { if (pass === 2) at(warnings, line, msg); } };
        const put = (w) => {
          const a = seg[cur];
          if (cur !== 'cseg') fail('an instruction or .dw outside the code segment (.cseg)');
          if (a >= FLASH_WORDS) fail(`the flash is full: word address 0x${a.toString(16)} past 0x${(FLASH_WORDS - 1).toString(16)}`);
          if (pass === 2 && flash.has(a)) at(errors, line, `word address 0x${a.toString(16)} written twice: at line ${used.get(a)} and at line ${line}`);
          flash.set(a, w & 0xffff); used.set(a, line); seg.cseg++;
        };
        if (lowHead[0] === '.') {
          const d = lowHead.slice(1);
          if (d === 'include') { if (!INCLUDES.test(rest.trim())) fail(`.include ${rest.trim()}: only the ATmega328P's names, "m328Pdef.inc", are built in`); return; }
          if (d === 'device') { if (!/^atmega328p?$/i.test(rest.trim())) fail(`.device ${rest.trim()}: the assembler is the ATmega328P's`); return; }
          if (d === 'list' || d === 'nolist' || d === 'listmac') return;
          if (d === 'exit') { exited = true; return; }
          if (d === 'cseg' || d === 'dseg' || d === 'eseg') { cur = d; return; }
          if (d === 'equ' || d === 'set') {
            const em = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(rest) ?? fail(`.${d} name = expression`);
            const low = em[1].toLowerCase();
            if (d === 'equ' && low in symbols) fail(`.equ ${em[1]}: defined again (.set changes a name)`);
            symbols[low] = evaluate(em[2], env);
            return;
          }
          if (d === 'def') {
            const dm = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(rest) ?? fail('.def name = register');
            defs[dm[1].toLowerCase()] = register(dm[2], env);
            return;
          }
          if (d === 'undef') { delete defs[rest.trim().toLowerCase()]; return; }
          if (d === 'org') { seg[cur] = range(evaluate(rest, env), 0, 0xffff, '.org'); return; }
          if (d === 'byte') { if (cur === 'cseg') fail('.byte reserves data memory or EEPROM (.dseg, .eseg)'); seg[cur] += range(evaluate(rest, env), 1, 0xffff, '.byte'); return; }
          if (d === 'db' || d === 'dw') {
            if (cur === 'dseg') fail(`.${d} in the data segment: .byte reserves it (its values are the program's to write)`);
            const bytes = d === 'db' ? dbBytes(rest, c) : c.ops.flatMap((t) => { const v = range(evaluate(t, env), -32768, 65535, '.dw word') & 0xffff; return [v & 0xff, v >> 8]; });
            if (cur === 'eseg') { for (const b of bytes) eeprom.set(seg.eseg++, b); return; }
            if (bytes.length & 1) { c.warn(`.db with an odd number of bytes (${bytes.length}): a 0 byte is added to fill its last word`); bytes.push(0); }
            for (let k = 0; k < bytes.length; k += 2) put(bytes[k] | (bytes[k + 1] << 8));
            return;
          }
          if (d === 'macro' || d === 'endm' || d === 'endmacro' || d === 'if' || d === 'ifdef' || d === 'ifndef' || d === 'else' || d === 'elif' || d === 'endif') fail(`.${d}: macros and conditional assembly are not supported yet`);
          fail(`no directive .${d}`);
        }
        const enc = TABLE[lowHead] ?? fail(`no instruction ${head}`);
        for (const w of enc(c)) put(w);
      } catch (e) { if (pass === 2) at(errors, line, e.message); }
    });
  }
  const size = flash.size ? Math.max(...flash.keys()) + 1 : 0;
  const words = new Uint16Array(size).fill(0xffff);
  for (const [a, w] of flash) words[a] = w;
  const eSize = eeprom.size ? Math.max(...eeprom.keys()) + 1 : 0;
  const ee = eSize ? new Uint8Array(eSize).fill(0xff) : null;
  for (const [a, b] of eeprom) ee[a] = b;
  return { words, size, eeprom: ee, labels, errors, warnings, hex: avrHex(flashRuns(flash)) };
}

/** An error or a warning as the console's line text: 'file:line: message' ('line N: message' with no file). */
export const avrMessage = ({ file, line, message }) => `${file ? `${file}:${line}` : `line ${line}`}: ${message}`;

/**
 * The program as an Intel HEX: its runs of words written (as `runs` gives them: [word address, words]), 16 bytes a record
 * from each run's start (avr-objcopy's and avrasm2's layout), an extended address record past 64 KB, its end record.
 */
export function avrHex(runs) {
  const out = [];
  const record = (addr, type, data) => {
    const bytes = [data.length, (addr >> 8) & 0xff, addr & 0xff, type, ...data];
    out.push(':' + [...bytes, (-bytes.reduce((a, b) => a + b, 0)) & 0xff].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(''));
  };
  let ext = 0;
  for (const [start, words] of runs) {
    const bytes = words.flatMap((w) => [w & 0xff, w >> 8]);
    for (let i = 0; i < bytes.length; i += 16) {
      const a = start * 2 + i;
      if (a >> 16 !== ext) { ext = a >> 16; record(0, 4, [ext >> 8, ext & 0xff]); }
      record(a & 0xffff, 0, bytes.slice(i, i + 16));
    }
  }
  record(0, 1, []);
  return out.join('\n') + '\n';
}

/** The runs of words a program wrote (avrAssemble's `flash`, address -> word): [word address, words] in order. */
function flashRuns(flash) {
  const runs = [];
  for (const a of [...flash.keys()].sort((x, y) => x - y)) {
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1].length === a) last[1].push(flash.get(a));
    else runs.push([a, [flash.get(a)]]);
  }
  return runs;
}
