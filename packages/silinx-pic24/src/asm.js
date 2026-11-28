// silinx-pic24 - a PIC24F assembler (#5930, moved from the emulator's tests' helper of #5480), with no XC16.
// It reads the syntax of Microchip's 16-bit MCU and DSC Programmer's Reference Manual (DS70000157):
// one instruction a line, ';' comments, 'label:' labels, '.word expr' (a raw program word), '.org address' (the
// erased flash up to it), its mnemonics with their
// .B/.W/.D/.C/.Z/.S/.U/.SD/.UD/.UU/.US/.SU/.SS suffixes, '$' its own address, the operands Wn, WREG, [Wn], [Wn++], [Wn--], [++Wn], [--Wn],
// [Wn+Wb], [Wn+lit], #lit, f (a number, a label or a symbol), a branch's target. Its encodings are checked against the
// manual's in test/pic24-asm.test.js.
//
//   const { words, labels } = pic24Assemble(['mov #0x1234, w0', 'loop: bra loop']);

import { evaluate } from './asm-expr.js';
import { REGISTERS, BITS, VECTORS, CONFIG_SETTINGS, CONFIG_ADDRESSES, LINK } from './gb610-names.js';
import { writeHex } from './hex.js';

const MODES = { direct: 0, ind: 1, postdec: 2, postinc: 3, predec: 4, preinc: 5, offset: 6 };
// the SFRs a test names (the CPU's)
export const SYMBOLS = {
  WREG0: 0x0000, SPLIM: 0x0020, PCL: 0x002e, PCH: 0x0030, DSRPAG: 0x0032, DSWPAG: 0x0034, RCOUNT: 0x0036, SR: 0x0042,
  CORCON: 0x0044, DISICNT: 0x0052, TBLPAG: 0x0054, INTCON1: 0x0080, INTCON2: 0x0082, INTCON4: 0x0086,
  IFS0: 0x0088, IFS1: 0x008a, IEC0: 0x0098, IEC1: 0x009a, IPC0: 0x00a8, IPC1: 0x00aa, INTTREG: 0x00e4,
};
const BRA_COND = { OV: 0, C: 1, GEU: 1, Z: 2, N: 3, LE: 4, LT: 5, LEU: 6, NOV: 8, NC: 9, LTU: 9, NZ: 10, NN: 11, GT: 12, GE: 13, GTU: 14 };

function fail(msg) { throw new Error(msg); }

// an operand's parse: { kind: 'w', n } | { kind: 'mem', mode, n, wb?, off? } | { kind: 'lit', expr } | { kind: 'expr', expr }
function operand(text) {
  const t = text.trim();
  let m;
  if (/^WREG$/i.test(t)) return { kind: 'w', n: 0, wreg: true };
  if ((m = /^W(\d+)$/i.exec(t)) && +m[1] < 16) return { kind: 'w', n: +m[1] };
  if (t.startsWith('#')) return { kind: 'lit', expr: t.slice(1).trim() };
  if ((m = /^\[\s*(.*?)\s*\]$/.exec(t))) {
    const s = m[1].replace(/\s+/g, '');
    const reg = (x) => { const r = /^W(\d+)$/i.exec(x); if (!r || +r[1] > 15) fail(`not a register: ${x}`); return +r[1]; };
    if ((m = /^(W\d+)\+\+$/i.exec(s))) return { kind: 'mem', mode: MODES.postinc, n: reg(m[1]) };
    if ((m = /^(W\d+)--$/i.exec(s))) return { kind: 'mem', mode: MODES.postdec, n: reg(m[1]) };
    if ((m = /^\+\+(W\d+)$/i.exec(s))) return { kind: 'mem', mode: MODES.preinc, n: reg(m[1]) };
    if ((m = /^--(W\d+)$/i.exec(s))) return { kind: 'mem', mode: MODES.predec, n: reg(m[1]) };
    if ((m = /^(W\d+)\+(W\d+)$/i.exec(s))) return { kind: 'mem', mode: MODES.offset, n: reg(m[1]), wb: reg(m[2]) };
    if ((m = /^(W\d+)([+-])#?(.+)$/i.exec(s))) return { kind: 'mem', mode: 'lit', n: reg(m[1]), off: (m[2] === '-' ? '-' : '') + m[3] };
    return { kind: 'mem', mode: MODES.ind, n: reg(s) };
  }
  return { kind: 'expr', expr: t };
}

// a number: decimal, 0x hex, 0b binary, a label, a symbol, '-' before; a sum of them with + and -
// an expression's value (asm-expr.js): its names a label, an .equ's, the device's (gb610-names.js), else in the first pass 0
function value(expr, env) {
  return evaluate(expr, {
    pc: env.pc,
    lookup(t) {
      if (t in env.labels) return env.labels[t];
      const up = t.toUpperCase();
      if (up in env.symbols) return env.symbols[up];
      if (env.pass === 1) return 0;
      return fail(`unknown symbol: ${t}`);
    },
  });
}

function range(v, lo, hi, what) { if (v < lo || v > hi) fail(`${what} ${v} not in ${lo}..${hi}`); return v; }

// ---- the encoders: (ctx) -> [words]; ctx = { m (mnemonic), sfx (suffixes), ops (operands), env, pc }
const B = (c) => (c.sfx.includes('B') ? 1 : 0);
const isW = (o) => o?.kind === 'w';
const isMem = (o) => o?.kind === 'mem' && typeof o.mode === 'number';
const reg = (o, what = 'a register') => (isW(o) ? o.n : fail(`${what} expected`));
const ws = (o, offsetOk = false) => {
  if (isW(o)) return { mode: 0, n: o.n };
  if (isMem(o) && (o.mode !== MODES.offset || offsetOk)) return { mode: o.mode, n: o.n, wb: o.wb };
  return fail('a register or an indirect operand expected');
};
const lit = (c, o, lo, hi, what = 'literal') => {
  if (o?.kind !== 'lit') fail(`#${what} expected`);
  return range(value(o.expr, c.env), lo, hi, what);
};
const fOf = (c, o, max = 0x1fff) => {
  if (o?.kind !== 'expr') fail('a file register expected');
  return range(value(o.expr, c.env), 0, max, 'f');
};
const pq = (x) => (x.mode << 4) | x.n;   // ppp ssss (or qqq dddd's shape at the source's place)
const qd = (x) => (x.mode << 11) | (x.n << 7);

// ADD, ADDC, SUB, SUBB, AND, XOR, IOR (lit10 too), SUBR, SUBBR (no lit10)
const ALU3 = { ADD: 8, ADDC: 9, SUB: 10, SUBB: 11, AND: 12, XOR: 13, IOR: 14, SUBR: 2, SUBBR: 3 };
const ALU_LIT = { ADD: 0xb00000, ADDC: 0xb08000, SUB: 0xb10000, SUBB: 0xb18000, AND: 0xb20000, XOR: 0xb28000, IOR: 0xb30000 };
const ALU_F = { ADD: 0xb40000, ADDC: 0xb48000, SUB: 0xb50000, SUBB: 0xb58000, AND: 0xb60000, XOR: 0xb68000, IOR: 0xb70000, SUBR: 0xbd0000, SUBBR: 0xbd8000 };
function alu(c) {
  const { ops } = c, b = B(c);
  if (ops.length <= 2 && ops[0].kind === 'expr') return [fileOp(c, ALU_F[c.m])];
  if (ops.length === 2 && ops[0].kind === 'lit') {
    if (!(c.m in ALU_LIT)) fail(`${c.m}: no #lit10 form`);
    const k = lit(c, ops[0], 0, b ? 255 : 1023, 'lit10');
    return [ALU_LIT[c.m] | (b << 14) | (k << 4) | reg(ops[1])];
  }
  if (ops.length !== 3) fail(`${c.m}: 1 to 3 operands`);
  const wb = reg(ops[0], 'Wb'), d = ws(ops[2]), base = (ALU3[c.m] << 19) | (wb << 15) | (b << 14) | qd(d);
  if (ops[1].kind === 'lit') return [base | 0x60 | lit(c, ops[1], 0, 31, 'lit5')];
  return [base | pq(ws(ops[1]))];
}
// f {,WREG}: the destination f (D = 1) or WREG
function fileOp(c, base) {
  const { ops } = c;
  if (ops.length === 2 && !ops[1].wreg) fail(`${c.m} f, WREG: the second operand is WREG`);
  return base | (B(c) << 14) | (ops.length === 2 ? 0 : 0x2000) | fOf(c, ops[0]);
}

// INC, INC2, DEC, DEC2, NEG, COM (f {,WREG}, or Ws, Wd), CLR, SETM (f, WREG, or Wd)
const UN = { INC: 0, INC2: 1, DEC: 2, DEC2: 3, NEG: 4, COM: 5, CLR: 6, SETM: 7 };
function unary(c) {
  const { ops } = c, k = UN[c.m], b = B(c), sel = ((k >> 1) << 16) | ((k & 1) << 15);
  if (ops[0].kind === 'expr') return [fileOp(c, 0xec0000 | sel)];
  if (k >= 6) { if (ops.length !== 1) fail(`${c.m} Wd`); return [0xe80000 | sel | (b << 14) | qd(ws(ops[0]))]; }
  if (ops.length !== 2) fail(`${c.m} Ws, Wd`);
  return [0xe80000 | sel | (b << 14) | qd(ws(ops[1])) | pq(ws(ops[0]))];
}

// SL, LSR, ASR, RLC, RLNC, RRC, RRNC (f {,WREG}, or Ws, Wd), SL / LSR / ASR Wb, Wns | #lit4, Wnd
const SH = { SL: 0x000000, LSR: 0x010000, ASR: 0x018000, RLNC: 0x020000, RLC: 0x028000, RRNC: 0x030000, RRC: 0x038000 };
const SHN = { SL: 0xdd0000, LSR: 0xde0000, ASR: 0xde8000 };
function shift(c) {
  const { ops } = c, b = B(c);
  if (ops[0].kind === 'expr') return [fileOp(c, 0xd40000 | SH[c.m])];
  if (ops.length === 3) {
    if (!(c.m in SHN)) fail(`${c.m}: no multi-bit form`);
    const base = SHN[c.m] | (reg(ops[0], 'Wb') << 11) | (reg(ops[2], 'Wnd') << 7);
    return [ops[1].kind === 'lit' ? base | 0x40 | lit(c, ops[1], 0, 15, 'lit4') : base | reg(ops[1], 'Wns')];
  }
  return [0xd00000 | SH[c.m] | (b << 14) | qd(ws(ops[1])) | pq(ws(ops[0]))];
}

// CP, CPB (f; Wb, #lit5; Wb, Ws), CP0 (f; Ws): their B is bit 10 in the W forms
function compare(c) {
  const { ops } = c, b = B(c);
  if (ops[0].kind === 'expr') {
    if (ops.length !== 1) fail(`${c.m} f`);
    const base = { CP: 0xe30000, CPB: 0xe38000, CP0: 0xe20000 }[c.m];
    return [base | (b << 14) | fOf(c, ops[0])];
  }
  if (c.m === 'CP0') return [0xe00000 | (b << 10) | pq(ws(ops[0]))];
  const base = (c.m === 'CP' ? 0xe10000 : 0xe18000) | (reg(ops[0], 'Wb') << 11) | (b << 10);
  return [ops[1].kind === 'lit' ? base | 0x60 | lit(c, ops[1], 0, 31, 'lit5') : base | pq(ws(ops[1]))];
}
function cps(c) {
  const base = { CPSGT: 0xe60000, CPSLT: 0xe68000, CPSNE: 0xe70000, CPSEQ: 0xe78000 }[c.m];
  return [base | (reg(c.ops[0], 'Wb') << 11) | (B(c) << 10) | reg(c.ops[1], 'Wn')];
}

// the bits: BSET, BCLR, BTG (f, #bit4 | Ws, #bit4), BTST, BTSTS (.C / .Z), BTST Ws, Wb, BSW, BTSC, BTSS
const BIT_F = { BSET: 0xa8, BCLR: 0xa9, BTG: 0xaa, BTST: 0xab, BTSTS: 0xac, BTSS: 0xae, BTSC: 0xaf };
const BIT_W = { BSET: 0xa0, BCLR: 0xa1, BTG: 0xa2, BTST: 0xa3, BTSTS: 0xa4, BTSS: 0xa6, BTSC: 0xa7 };
function bits(c) {
  const { ops } = c, b = B(c), z = c.sfx.includes('C') ? 0 : 1;
  if (c.m === 'BSW') return [0xad0000 | (z << 15) | (reg(ops[1], 'Wb') << 11) | pq(ws(ops[0]))];
  if (ops[0].kind === 'expr') {
    let f = fOf(c, ops[0]), bit = lit(c, ops[1], 0, b ? 7 : 15, 'bit');
    if (b && f & 1) { f -= 1; bit += 8; }   // (a byte's bit as its word's)
    if (f & 1) fail(`${c.m} f: f is a word's (even) address`);
    return [(BIT_F[c.m] << 16) | ((bit & 7) << 13) | f | (bit >> 3)];   // (bit4<3> at op<0>: XC16's, #6017)
  }
  const s = ws(ops[0]);
  if (ops[1].kind === 'w') {
    if (c.m !== 'BTST') fail(`${c.m} Ws, Wb: BTST only`);
    return [0xa50000 | (z << 15) | (ops[1].n << 11) | pq(s)];
  }
  const bit = lit(c, ops[1], 0, b ? 7 : 15, 'bit4');
  if (c.m === 'BTST' || c.m === 'BTSTS') return [(BIT_W[c.m] << 16) | (bit << 12) | (z << 11) | pq(s)];
  if (c.m === 'BTSS' || c.m === 'BTSC') return [(BIT_W[c.m] << 16) | (bit << 12) | pq(s)];
  return [(BIT_W[c.m] << 16) | (bit << 12) | (b << 10) | pq(s)];
}

// MOV in its forms
function mov(c) {
  const { ops } = c, b = B(c);
  if (c.sfx.includes('D')) {
    // Ws to Wnd (a register pair's too), else Wns to Wd
    if (isW(ops[1])) return [0xbe0000 | ((ops[1].n >> 1) << 8) | pq(ws(ops[0]))];
    return movDto(ops);
  }
  if (ops.length === 1) return [0xbf8000 | (b << 14) | 0x2000 | fOf(c, ops[0])];
  const [a, d] = ops;
  if (a.kind === 'lit') {
    if (b) return [0xb3c000 | (lit(c, a, 0, 255, 'lit8') << 4) | reg(d)];
    return [0x200000 | ((lit(c, a, -32768, 65535, 'lit16') & 0xffff) << 4) | reg(d)];
  }
  if (a.kind === 'expr' && d.wreg) return [0xbf8000 | (b << 14) | fOf(c, a)];
  if (a.kind === 'expr') { if (b) fail('MOV.B f, Wn: WREG only'); const f = fOf(c, a, 0xfffe); if (f & 1) fail('MOV f, Wnd: an even f'); return [0x800000 | ((f >> 1) << 4) | reg(d)]; }
  if (a.wreg && d.kind === 'expr') return [0xb7a000 | (b << 14) | fOf(c, d)];
  if (isW(a) && d.kind === 'expr') { if (b) fail('MOV.B Wn, f: WREG only'); const f = fOf(c, d, 0xfffe); if (f & 1) fail('MOV Wns, f: an even f'); return [0x880000 | ((f >> 1) << 4) | a.n]; }
  if (a.kind === 'mem' && a.mode === 'lit') return [0x900000 | offsetBits(c, a.off, b) | (b << 14) | (reg(d) << 7) | a.n];
  if (d.kind === 'mem' && d.mode === 'lit') return [0x980000 | offsetBits(c, d.off, b) | (b << 14) | (d.n << 7) | reg(a)];
  const s = ws(a, true), t = ws(d, true);
  if (s.mode === 6 && t.mode === 6 && s.wb !== t.wb) fail('MOV [Ws+Wb], [Wd+Wb]: the same Wb');
  const wb = s.mode === 6 ? s.wb : t.mode === 6 ? t.wb : 0;
  return [0x780000 | (wb << 15) | (b << 14) | qd(t) | pq(s)];
}
function movDto(ops) {
  const s = reg(ops[0], 'Wns'), d = ws(ops[1]);
  return [0xbe8000 | qd(d) | ((s >> 1) << 1)];
}
// Slit10's bits (op<18:15>, op<13:11>, op<6:4>): a word's offset halved
function offsetBits(c, off, b) {
  let k = value(off, c.env);
  if (!b) { if (k & 1) fail('a word\'s offset is even'); k /= 2; }
  range(k, -512, 511, 'Slit10');
  k &= 0x3ff;
  return ((k >> 6) << 15) | (((k >> 3) & 7) << 11) | ((k & 7) << 4);
}

function pushPop(c) {
  const { ops } = c, push = c.m === 'PUSH';
  if (c.sfx.includes('S')) return [push ? 0xfea000 : 0xfe8000];
  if (c.sfx.includes('D')) {
    const n = reg(ops[0]);
    return [push ? 0xbe9f80 | ((n >> 1) << 1) : 0xbe0000 | ((n >> 1) << 8) | (MODES.predec << 4) | 15];
  }
  if (ops[0].kind === 'expr') { const f = fOf(c, ops[0], 0xfffe); return [(push ? 0xf80000 : 0xf90000) | f]; }
  const x = ws(ops[0]);
  if (push) return [0x780000 | (MODES.postinc << 11) | (15 << 7) | pq(x)];
  return [0x780000 | qd(x) | (MODES.predec << 4) | 15];
}

// the program flow
function branch(c, target) { const n = (value(target, c.env) - (c.pc + 2)) / 2; if (c.env.pass === 2) range(n, -32768, 32767, 'branch'); return n & 0xffff; }
function flow(c) {
  const { ops } = c;
  switch (c.m) {
    case 'BRA':
      if (ops.length === 2) { const k = BRA_COND[ops[0].expr?.toUpperCase()]; if (k == null) fail(`BRA ${ops[0].expr}: no such condition`); return [0x300000 | (k << 16) | branch(c, ops[1].expr)]; }
      if (isW(ops[0])) return [0x016000 | ops[0].n];
      return [0x370000 | branch(c, ops[0].expr)];
    case 'RCALL': return isW(ops[0]) ? [0x012000 | ops[0].n] : [0x070000 | branch(c, ops[0].expr)];
    case 'CALL': case 'GOTO': {
      if (isW(ops[0])) return [(c.m === 'CALL' ? 0x010000 : 0x014000) | ops[0].n];
      const a = value(ops[0].expr, c.env);
      return [(c.m === 'CALL' ? 0x020000 : 0x040000) | (a & 0xfffe), (a >> 16) & 0x7f];
    }
    case 'RETURN': return [0x060000];
    case 'RETFIE': return [0x064000];
    case 'RETLW': return [0x050000 | (B(c) << 14) | (lit(c, ops[0], 0, B(c) ? 255 : 1023, 'lit10') << 4) | reg(ops[1])];
    case 'REPEAT': return isW(ops[0]) ? [0x098000 | ops[0].n] : [0x090000 | lit(c, ops[0], 0, 0x3fff, 'lit14')];
    case 'DISI': return [0xfc0000 | lit(c, ops[0], 0, 0x3fff, 'lit14')];
    case 'LNK': return [0xfa0000 | lit(c, ops[0], 0, 0x3ffe, 'lit14')];
    case 'ULNK': return [0xfa8000];
    case 'NOP': return [0x000000];
    case 'NOPR': return [0xff0000];
    case 'RESET': return [0xfe0000];
    case 'CLRWDT': return [0xfe6000];
    case 'BOOTSWP': return [0xfe2000];
    case 'PWRSAV': return [0xfe4000 | lit(c, ops[0], 0, 1, 'lit1')];
    default: return fail(`no instruction ${c.m}`);
  }
}

function misc(c) {
  const { ops } = c, b = B(c);
  switch (c.m) {
    case 'SE': case 'ZE': return [(c.m === 'SE' ? 0xfb0000 : 0xfb8000) | (reg(ops[1]) << 7) | pq(ws(ops[0]))];
    case 'FBCL': return [0xdf0000 | (reg(ops[1]) << 7) | pq(ws(ops[0]))];
    case 'FF1L': case 'FF1R': return [(c.m === 'FF1L' ? 0xcf8000 : 0xcf0000) | (reg(ops[1]) << 7) | pq(ws(ops[0]))];
    case 'SWAP': return [0xfd8000 | (b << 14) | reg(ops[0])];
    case 'EXCH': return [0xfd0000 | (reg(ops[1]) << 7) | reg(ops[0])];
    case 'DAW': return [0xfd4000 | reg(ops[0])];
    case 'TBLRDL': case 'TBLRDH': case 'TBLWTL': case 'TBLWTH': {
      const base = { TBLRDL: 0xba0000, TBLRDH: 0xba8000, TBLWTL: 0xbb0000, TBLWTH: 0xbb8000 }[c.m];
      return [base | (b << 14) | qd(ws(ops[1])) | pq(ws(ops[0]))];
    }
    case 'MUL': {
      if (ops[0].kind === 'expr') return [0xbc0000 | (b << 14) | fOf(c, ops[0])];
      const kind = c.sfx.find((x) => /^(UU|US|SU|SS)$/.test(x)) ?? fail('MUL.UU, .US, .SU or .SS');
      const base = { UU: 0xb80000, US: 0xb88000, SU: 0xb90000, SS: 0xb98000 }[kind] | (reg(ops[0], 'Wb') << 11) | (reg(ops[2], 'Wnd') << 7);
      if (ops[1].kind === 'lit') { if (kind !== 'UU' && kind !== 'SU') fail(`MUL.${kind}: no #lit5 form`); return [base | 0x60 | lit(c, ops[1], 0, 31, 'lit5')]; }
      return [base | pq(ws(ops[1]))];
    }
    case 'DIV': {
      const kind = c.sfx.find((x) => /^(S|U|SW|UW|SD|UD)$/.test(x)) ?? fail('DIV.S, .U, .SD or .UD');
      const m = reg(ops[0], 'Wm'), n = reg(ops[1], 'Wn'), double = kind.endsWith('D');
      return [(kind[0] === 'U' ? 0xd88000 : 0xd80000) | ((double ? m + 1 : 0) << 11) | (m << 7) | ((double ? 1 : 0) << 6) | n];
    }
    default: return fail(`no instruction ${c.m}`);
  }
}

const TABLE = {
  ...Object.fromEntries(Object.keys(ALU3).map((m) => [m, alu])),
  ...Object.fromEntries(Object.keys(UN).map((m) => [m, unary])),
  ...Object.fromEntries(Object.keys(SH).map((m) => [m, shift])),
  CP: compare, CPB: compare, CP0: compare, CPSGT: cps, CPSLT: cps, CPSNE: cps, CPSEQ: cps,
  ...Object.fromEntries([...Object.keys(BIT_F), 'BSW'].map((m) => [m, bits])),
  MOV: mov, PUSH: pushPop, POP: pushPop,
  ...Object.fromEntries(['BRA', 'RCALL', 'CALL', 'GOTO', 'RETURN', 'RETFIE', 'RETLW', 'REPEAT', 'DISI', 'LNK', 'ULNK',
    'NOP', 'NOPR', 'RESET', 'CLRWDT', 'BOOTSWP', 'PWRSAV'].map((m) => [m, flow])),
  ...Object.fromEntries(['SE', 'ZE', 'FBCL', 'FF1L', 'FF1R', 'SWAP', 'EXCH', 'DAW', 'TBLRDL', 'TBLRDH', 'TBLWTL', 'TBLWTH', 'MUL', 'DIV'].map((m) => [m, misc])),
};

function split(rest) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of rest) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ',' && !depth) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map(operand);
}

// xc16-as's directives (#5931): name -> (rest, env, put); the sections .text (the program's) and .bss (the data memory's,
// .space reserving it), .equ / .set, .global, .include of the device's names, .word / .pword, .align, .org, .end, config
const INCLUDES = /^"?(p24FJ1024GB610\.inc|xc\.inc)"?$/i;
const DIRECTIVES = {
  '.word': (r, env, put) => { for (const e of split(r).map((o) => o.expr ?? r)) put(range(value(e, env), -32768, 0xffff, '.word') & 0xffff); },
  '.pword': (r, env, put) => { for (const e of split(r).map((o) => o.expr ?? r)) put(value(e, env)); },
  '.org': (r, env, put) => {
    const a = value(r, env);
    if (env.section !== 'text') fail('.org: in the program\'s section (.text) only');
    if (a < env.pc || a & 1) fail(`.org ${r}: not an even address after 0x${env.pc.toString(16)}`);
    while (env.pc < a) put(0xffffff);   // (the erased flash between)
  },
  '.align': (r, env, put) => { const n = value(r, env); if (env.section === 'text') { while (env.pc % n) put(0xffffff); } else env.dpc = Math.ceil(env.dpc / n) * n; },
  '.text': (r, env) => { env.section = 'text'; },
  '.bss': (r, env) => { env.section = 'bss'; },
  '.data': () => fail('.data: initialised data needs XC16\'s startup code: reserve it in .bss and write it in the program'),
  '.section': (r, env) => {
    const name = r.split(',')[0].trim();
    if (/^\.text\b/.test(name)) env.section = 'text';
    else if (/^\.(bss|nbss)\b/.test(name) || /\bbss\b/.test(r.split(',').slice(1).join(','))) env.section = 'bss';
    else fail(`.section ${name}: the program's (.text) or the data memory's (.bss) only`);
  },
  '.space': (r, env, put) => { const n = value(r, env); if (env.section === 'text') fail('.space: in .bss (the program\'s words are .word / .pword)'); env.dpc += n; },
  '.skip': (r, env, put) => DIRECTIVES['.space'](r, env, put),
  '.equ': (r, env) => { const [n, ...e] = r.split(','); if (!e.length) fail('.equ name, value'); env.symbols[n.trim().toUpperCase()] = value(e.join(','), env); },
  '.set': (r, env) => DIRECTIVES['.equ'](r, env),
  '.global': (r, env) => { for (const n of r.split(',')) env.globals.add(n.trim()); },
  '.globl': (r, env) => DIRECTIVES['.global'](r, env),
  '.include': (r) => { if (!INCLUDES.test(r.trim())) fail(`.include ${r.trim()}: only the PIC24FJ1024GB610's names, "p24FJ1024GB610.inc", are built in`); },
  '.end': (r, env) => { env.ended = true; },
  config: (r, env) => {
    const [word, ...settings] = r.split(',');
    const w = word.trim().toUpperCase(), table = CONFIG_SETTINGS[w.replace(/^__/, '')], addr = CONFIG_ADDRESSES[w];
    if (addr == null) fail(`config ${word.trim()}: no such configuration word (${Object.keys(CONFIG_ADDRESSES).join(', ')})`);
    let v = env.config.get(addr) ?? 0xffffff;
    for (const set of settings.join(',').split('&').map((x) => x.trim()).filter(Boolean)) {
      const k = set.toUpperCase();
      if (!table || !(k in table)) fail(`config ${word.trim()}: no setting ${set}${table ? ` (${Object.keys(table).join(', ')})` : ''}`);
      v &= 0xff0000 | table[k];
    }
    if (env.pass === 2 && env.configLine.has(addr) && env.configLine.get(addr) !== env.line) env.warn(`config ${word.trim()} set again (first at line ${env.configLine.get(addr)})`);
    env.configLine.set(addr, env.configLine.get(addr) ?? env.line);
    env.config.set(addr, v);
  },
};

// a line's statement assembled into put(): a directive or an instruction (its errors thrown, its line's text before)
function statement(s, raw, env, put) {
  const [head, rest = ''] = s.split(/\s+(.*)/);
  const d = DIRECTIVES[head.toLowerCase()];
  if (d) { d(rest, env, put); return; }
  if (head[0] === '.') fail(`no directive ${head}`);
  if (env.section !== 'text') fail(`an instruction outside the program's section (.text): ${raw.trim()}`);
  const [mn, ...sfx] = head.toUpperCase().split('.');
  const enc = TABLE[mn] ?? fail(`no instruction ${mn}: ${raw}`);
  let out;
  try { out = enc({ m: mn, sfx: sfx.filter((x) => x !== 'W'), ops: rest ? split(rest) : [], env, pc: env.pc }); } catch (e) { throw new Error(`${raw.trim()}: ${e.message}`); }
  for (const w of out) put(w);
}

/**
 * A source assembled (its lines, or its text): { words (the program's, from program address `org`), labels (their
 * addresses: a .bss label's its data address), globals, config (program address -> its configuration word), errors,
 * warnings } (each { file, line, message }, the line counted from 1). Every line is assembled though an earlier one
 * failed; a label defined twice is an error at its second line, naming the first (#5893). Its names: the device's
 * (gb610-names.js) and `symbols`.
 */
export function assemble(lines, { org = 0, symbols = {}, file = '' } = {}) {
  const src = (Array.isArray(lines) ? lines : String(lines).split('\n'));
  const base = { ...REGISTERS, ...BITS, ...SYMBOLS, ...Object.fromEntries(Object.entries(symbols).map(([k, v]) => [k.toUpperCase(), v])) };
  const env = { labels: {}, pass: 1 };
  const where = {}, errors = [], warnings = [];
  const error = (line, message) => errors.push({ file, line, message });
  let words;
  for (env.pass = 1; env.pass <= 2; env.pass++) {
    words = [];
    Object.assign(env, { pc: org, dpc: LINK.DATA_BASE, section: 'text', symbols: { ...base }, globals: new Set(), config: new Map(), configLine: new Map(), ended: false });
    env.warn = (message) => { if (env.pass === 2) warnings.push({ file, line: env.line, message }); };
    const put = (w) => { words.push(w & 0xffffff); env.pc += 2; };
    src.forEach((raw, i) => {
      if (env.ended) return;
      env.line = i + 1;
      let s = raw.replace(/;.*/, '').trim();
      let m;
      while ((m = /^([A-Za-z_.$][\w.$]*):\s*/.exec(s))) {
        if (env.pass === 1) {
          if (m[1] in where) error(i + 1, `the label '${m[1]}' is defined twice: at line ${where[m[1]]} and at line ${i + 1}`);
          else { where[m[1]] = i + 1; env.labels[m[1]] = env.section === 'text' ? env.pc : env.dpc; }
        }
        s = s.slice(m[0].length);
      }
      if (!s) return;
      try { statement(s, raw, env, put); } catch (e) { if (env.pass === 2) error(i + 1, e.message); }
    });
    if (env.pass === 2 && env.dpc > LINK.DATA_END + 1) error(src.length, `the data memory overflowed: .bss reaches 0x${env.dpc.toString(16)}, past 0x${LINK.DATA_END.toString(16)}`);
  }
  return { words: Uint32Array.from(words), labels: env.labels, globals: [...env.globals], config: Object.fromEntries(env.config), errors, warnings, where };
}

/**
 * A program assembled and linked as XC16's linker places it (#5931): an xc16-as source (its .global __reset) from the
 * code's start (0x200, after the vector table), the reset vector a GOTO __reset, each vector the address of its handler
 * (a .global __T1Interrupt…) or of __DefaultInterrupt (a RESET of the linker's, after the program, when the source
 * has none); an older source (no __reset: its own GOTO and vectors) from 0. Its configuration words (config). {
 * words (the flash's, from 0), hex (XC16's Intel HEX), labels, config, linked, errors, warnings }.
 */
export function assembleProgram(lines, { file = '', symbols = {} } = {}) {
  const src = Array.isArray(lines) ? lines : String(lines).split('\n');
  const probe = /^\s*(\.global|\.globl)\s+[^;]*\b__reset\b|^\s*__reset\s*:/m.test(src.join('\n'));
  const r = assemble(src, { file, symbols, org: probe ? LINK.CODE_BASE : 0 });
  const warnings = [...r.warnings], errors = [...r.errors];
  let words = [...r.words];
  if (probe) {
    const at = (name) => r.where[name] ?? 1;
    if (!('__reset' in r.labels)) errors.push({ file, line: 1, message: '__reset is .global but not defined: the program\'s entry' });
    else if (!r.globals.includes('__reset')) warnings.push({ file, line: at('__reset'), message: '__reset is not .global: XC16\'s linker would not see the entry' });
    const handlers = Object.keys(VECTORS).filter((v) => v in r.labels);
    for (const h of handlers) if (!r.globals.includes(h)) warnings.push({ file, line: at(h), message: `${h} is not .global: XC16's linker would leave its vector to __DefaultInterrupt` });
    let fallback = r.labels.__DefaultInterrupt;
    if (fallback == null) { fallback = LINK.CODE_BASE + 2 * words.length; words.push(0xfe0000); }   // (RESET)
    const image = new Array(LINK.CODE_BASE / 2).fill(0xffffff);
    image[0] = 0x040000 | ((r.labels.__reset ?? 0) & 0xfffe); image[1] = ((r.labels.__reset ?? 0) >> 16) & 0x7f;
    for (const [name, addr] of Object.entries(VECTORS)) image[addr / 2] = (r.globals.includes(name) && name in r.labels ? r.labels[name] : fallback) & 0xffffff;
    for (let a = 0x04; a < LINK.CODE_BASE; a += 2) if (image[a / 2] === 0xffffff) image[a / 2] = fallback;
    words = [...image, ...words];
  }
  const flash = Uint32Array.from(words);
  let hex = writeHex(flash).replace(/:00000001FF\n$/, '');
  for (const [addr, v] of Object.entries(r.config).sort((a, b) => a[0] - b[0])) hex += writeHex([v], Number(addr) >> 1).replace(/:00000001FF\n$/, '');
  hex += ':00000001FF\n';
  return { words: flash, hex: errors.length ? null : hex, labels: r.labels, config: r.config, linked: probe, errors, warnings };
}

/** An error or a warning as a line of text: 'file:line: message' ('line N: message' with no file). */
export const asmMessage = ({ file, line, message }) => `${file ? `${file}:${line}` : `line ${line}`}: ${message}`;

/** The program's words (from program address `org`) and its labels' addresses; its first error thrown. */
export function pic24Assemble(lines, options) {
  const r = assemble(lines, options);
  if (r.errors.length) throw new Error(asmMessage(r.errors[0]));
  return { words: r.words, labels: r.labels };
}
