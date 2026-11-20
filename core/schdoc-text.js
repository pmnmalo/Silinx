// Silinx schematic documents - the HDL text helpers (names, constants, a token stream, statements) and the IR expression
// printers of core/schdoc.js's HDL generation and import, moved from core/schdoc.js (#4765).
import { VHDL93_WORDS, VERILOG_WORDS, reservedError } from './reserved.js';

// ===================================================================== HDL text helpers
// (the shared lists, core/reserved.js, #679: a name the HDL of its language refuses is an error; one that is
// a reserved word in another letter case, of the other language or of SystemVerilog, a warning)
const VHDL_RESERVED = VHDL93_WORDS;
const VLOG_RESERVED = new Set([...VERILOG_WORDS, 'logic']);
// an existing name: a word of VHDL or Verilog (SystemVerilog's own words are refused only for a new name)
export const rsvd = n => reservedError(n, { sv: false });
export function validIdent(name, lang) {
  if (lang === 'vhdl') return /^[A-Za-z](?:_?[A-Za-z0-9])*$/.test(name) && !VHDL_RESERVED.has(name.toLowerCase());
  return /^[A-Za-z_][A-Za-z0-9_$]*$/.test(name) && !VLOG_RESERVED.has(name);
}

// value text ("5", "0x1F", "0b01xz", "'1'", "8'hFF", "x\"0F\"") -> bit string of the given width (MSB first)
export function constBits(value, width) {
  let s = String(value ?? '0').trim().replace(/_/g, '');
  let bits = null;
  let m;
  if ((m = /^'([01xzXZuU-])'$/.exec(s))) bits = m[1];
  else if ((m = /^(?:0b|b)"?([01xzXZ]+)"?$/i.exec(s)) || (m = /^"([01xzXZuU-]+)"$/.exec(s))) bits = m[1];
  else if ((m = /^(?:0x|x)"?([0-9a-f]+)"?$/i.exec(s))) bits = BigInt('0x' + m[1]).toString(2);
  else if ((m = /^(\d+)?'([bhdo])([0-9a-fxz]+)$/i.exec(s))) {
    const base = m[2].toLowerCase();
    if (base === 'b') bits = m[3];
    else if (base === 'h' && !/[xz]/i.test(m[3])) bits = BigInt('0x' + m[3]).toString(2);
    else if (base === 'o') bits = BigInt('0o' + m[3]).toString(2);
    else if (base === 'd') bits = BigInt(m[3]).toString(2);
  } else if ((m = /^-?\d+$/.exec(s))) {
    let v = BigInt(s);
    if (v < 0n) v = (1n << BigInt(width)) + v;
    bits = v.toString(2);
  }
  if (bits == null) return null;
  bits = bits.toLowerCase().replace(/[u-]/g, 'x');
  if (bits.length > width) bits = bits.slice(bits.length - width);
  if (bits.length < width) bits = (bits[0] === 'x' || bits[0] === 'z' ? bits[0] : '0').repeat(width - bits.length) + bits;
  return bits;
}
export const vhdlBits = (bits, scalar) => (scalar ? `'${bits.toUpperCase()}'` : `"${bits.toUpperCase()}"`);
export const vlogBits = bits => `${bits.length}'b${bits}`;

// Tokenizer shared by the source span helpers. Tokens: { v (lower-cased for VHDL ids), s, e, k }
export function tokenize(text, lang) {
  const toks = [];
  const n = text.length;
  let i = 0;
  const vh = lang === 'vhdl';
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f') { i++; continue; }
    if (vh && c === '-' && text[i + 1] === '-') { while (i < n && text[i] !== '\n') i++; continue; }
    if (!vh && c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (!vh && c === '(' && text[i + 1] === '*' && text[i + 2] !== ')') { const e = text.indexOf('*)', i + 2); i = e < 0 ? n : e + 2; continue; }
    const s = i;
    if (c === '"') {
      i++;
      while (i < n) { if (text[i] === '\\' && !vh) { i += 2; continue; } if (text[i] === '"') { if (vh && text[i + 1] === '"') { i += 2; continue; } i++; break; } if (text[i] === '\n') break; i++; }
      toks.push({ v: text.slice(s, i), s, e: i, k: 'str' }); continue;
    }
    if (vh && c === "'") {
      const prev = toks[toks.length - 1];
      const isTick = prev && (prev.k === 'id' || prev.v === ')') && !(prev.k === 'id' && /^(when|else|then|return|and|or|xor|not|nand|nor|xnor|is|of|in|out|select|report|severity)$/.test(prev.v));
      if (!isTick && text[i + 2] === "'") { toks.push({ v: text.slice(i, i + 3), s, e: i + 3, k: 'chr' }); i += 3; continue; }
      toks.push({ v: "'", s, e: i + 1, k: 'op' }); i++; continue;
    }
    if (/[A-Za-z_]/.test(c) || (!vh && (c === '$' || c === '`'))) {
      i++;
      while (i < n && /[\w$]/.test(text[i])) i++;
      const raw = text.slice(s, i);
      toks.push({ v: vh ? raw.toLowerCase() : raw, raw, s, e: i, k: 'id' }); continue;
    }
    if (!vh && c === '\\') { while (i < n && !/\s/.test(text[i])) i++; toks.push({ v: text.slice(s, i), s, e: i, k: 'id' }); continue; }
    // (a VHDL extended identifier, \t[0]\, a doubled backslash in it, #1809)
    if (vh && c === '\\' && /^\\(?:[^\\\n]|\\\\)+\\/.test(text.slice(i, text.indexOf('\n', i) < 0 ? n : text.indexOf('\n', i)))) {
      i++;
      while (i < n && !(text[i] === '\\' && text[i + 1] !== '\\')) i += text[i] === '\\' ? 2 : 1;
      i++;
      const raw = text.slice(s, i);
      toks.push({ v: raw.toLowerCase(), raw, s, e: i, k: 'id' }); continue;
    }
    if (/[0-9]/.test(c) || (!vh && c === "'" && /[sSbBhHdDoO]/.test(text[i + 1] || ''))) {
      if (!vh) {
        while (i < n && /[0-9_]/.test(text[i])) i++;
        let j = i; while (text[j] === ' ') j++;
        if (text[j] === "'" && /[sSbBhHdDoO]/.test(text[j + 1] || '')) {
          i = j + 1; if (/[sS]/.test(text[i])) i++; i++;
          while (text[i] === ' ') i++;
          while (i < n && /[0-9a-fA-FxXzZ_?]/.test(text[i])) i++;
        } else if (text[i] === '.') { i++; while (i < n && /[0-9]/.test(text[i])) i++; }
      } else {
        while (i < n && /[0-9_.#a-fA-F]/.test(text[i])) { if (text[i] === '#') { i++; while (i < n && /[0-9a-fA-F_.]/.test(text[i])) i++; if (text[i] === '#') i++; break; } i++; }
      }
      toks.push({ v: text.slice(s, i), s, e: i, k: 'num' }); continue;
    }
    const two = text.slice(i, i + 2), three = text.slice(i, i + 3);
    const ops3 = ['<<<', '>>>', '===', '!=='];
    const ops2 = vh ? ['<=', '=>', ':=', '/=', '>=', '**', '<>'] : ['<=', '>=', '==', '!=', '&&', '||', '<<', '>>', '~&', '~|', '~^', '^~', '+:', '-:', '**', '->'];
    let op = c;
    if (!vh && ops3.includes(three)) op = three; else if (ops2.includes(two)) op = two;
    toks.push({ v: op, s, e: i + op.length, k: 'op' });
    i += op.length;
  }
  return toks;
}

export function offsetOf(ls, loc) { if (!loc) return -1; return (ls[loc.line - 1] ?? 0) + (loc.col || 1) - 1; }
export function tokAt(toks, off) { let lo = 0, hi = toks.length; while (lo < hi) { const m = (lo + hi) >> 1; if (toks[m].e <= off) lo = m + 1; else hi = m; } return lo; }
export function skipParen(toks, i) {
  // toks[i] should be '(' ; returns index after the matching ')'
  if (toks[i]?.v !== '(') return i;
  let d = 0;
  for (; i < toks.length; i++) { if (toks[i].v === '(') d++; else if (toks[i].v === ')') { d--; if (d === 0) return i + 1; } }
  return i;
}
export function toSemi(toks, i) {
  let d = 0;
  for (; i < toks.length; i++) {
    const v = toks[i].v;
    if (v === '(' || v === '[' || v === '{') d++;
    else if (v === ')' || v === ']' || v === '}') d--;
    else if (v === ';' && d <= 0) return i + 1;
  }
  return i;
}
export function stripComments(s, lang) {
  return lang === 'vhdl' ? s.replace(/--[^\n]*/g, '') : s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
export const squash = s => s.replace(/\s+/g, ' ').trim();

// re-indent a verbatim slice whose first line started at column `col` (1-based)
export function dedent(text, col = 1) {
  const lines = text.replace(/\r/g, '').split('\n');
  const first = lines[0];
  let min = Infinity;
  for (const l of lines.slice(1)) if (l.trim()) min = Math.min(min, l.length - l.trimStart().length);
  const firstIndent = col - 1;
  min = Math.min(min, firstIndent);
  if (!Number.isFinite(min)) min = 0;
  const out = [first.trimStart(), ...lines.slice(1).map(l => (l.trim() ? l.slice(Math.min(min, l.length - l.trimStart().length)) : ''))];
  // for the first line, relative indent is firstIndent - min (keep it flush left)
  return out.join('\n').replace(/\s+$/, '');
}
// remove the common indentation of all lines (and surrounding blank lines)
export function dedentBlock(text) {
  const lines = String(text ?? '').replace(/\r/g, '').replace(/\t/g, '  ').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  let min = Infinity;
  for (const l of lines) if (l.trim()) min = Math.min(min, l.length - l.trimStart().length);
  if (!Number.isFinite(min)) min = 0;
  return lines.map(l => l.slice(Math.min(min, l.length - l.trimStart().length)).replace(/\s+$/, '')).join('\n');
}
export const indent = (text, pad) => String(text).split('\n').map(l => (l.trim() ? pad + l : '')).join('\n');

// The text of a statement [s0, e0) with its comments (#225: an HDL block keeps them): the comment
// lines just above it and the comment ending its last line; not the comments the generated HDL
// writes itself (a block's title line, the file's header, a block entity's mark), so that a module
// made again from its generated HDL does not take them. Verilog: also an attribute (* … *) before it.
// Returns [s, e].
export function withComments(text, s0, e0, lang) {
  const c = lang === 'vhdl' ? '--' : '//';
  const own = new RegExp(`^\\s*${c} *(\\S+: HDL block\\b|Generated by Silinx\\b|${BLOCK_MARK}\\b)`);
  const isC = new RegExp(`^\\s*${c}`);
  let s = s0, e = e0;
  if (lang !== 'vhdl') { const m = /\(\*[^\n]*?\*\)\s*$/.exec(text.slice(Math.max(0, s - 200), s)); if (m) s -= m[0].length; }
  let ls = text.lastIndexOf('\n', s - 1) + 1;
  if (!text.slice(ls, s).trim()) {
    while (ls > 0) {
      const p = text.lastIndexOf('\n', ls - 2) + 1;
      const line = text.slice(p, ls - 1);
      if (!isC.test(line) || own.test(line)) break;
      s = p + line.length - line.trimStart().length;
      ls = p;
    }
  }
  const nl = text.indexOf('\n', e);
  const rest = text.slice(e, nl < 0 ? text.length : nl);
  if (isC.test(rest) && !own.test(rest)) e += rest.replace(/\s+$/, '').length;
  return [s, e];
}
// Verilog statement extent (token index -> index after the statement)
export function vStmt(toks, i) {
  const t = toks[i];
  if (!t) return i;
  const v = t.v;
  const match = (open, close) => {
    let d = 0;
    for (; i < toks.length; i++) {
      if (open.includes(toks[i].v)) d++;
      else if (close.includes(toks[i].v)) { d--; if (d === 0) { i++; if (toks[i]?.v === ':' && close.includes('end')) i += 2; return i; } }
    }
    return i;
  };
  if (v === 'begin') return match(['begin'], ['end']);
  if (v === 'fork') return match(['fork'], ['join', 'join_any', 'join_none']);
  if (v === 'case' || v === 'casez' || v === 'casex') return match(['case', 'casez', 'casex'], ['endcase']);
  if (v === 'if') { i = vStmt(toks, skipParen(toks, i + 1)); if (toks[i]?.v === 'else') i = vStmt(toks, i + 1); return i; }
  if (v === 'for' || v === 'while' || v === 'repeat' || v === 'foreach') return vStmt(toks, skipParen(toks, i + 1));
  if (v === 'forever') return vStmt(toks, i + 1);
  if (v === 'wait') { i = skipParen(toks, i + 1); return toks[i]?.v === ';' ? i + 1 : vStmt(toks, i); }
  if (v === '@') {
    i++;
    if (toks[i]?.v === '(') i = skipParen(toks, i); else i++;
    return toks[i]?.v === ';' ? i + 1 : vStmt(toks, i);
  }
  if (v === '#') {
    i++;
    if (toks[i]?.v === '(') i = skipParen(toks, i); else i++;
    return toks[i]?.v === ';' ? i + 1 : vStmt(toks, i);
  }
  if (v === ';') return i + 1;
  return toSemi(toks, i);
}
const V_BOUNDARY = new Set([';', 'end', 'endcase', 'endfunction', 'endtask', 'endgenerate', 'generate', 'begin', 'endmodule', 'join']);
export function vStmtStart(toks, i) {
  let j = i;
  while (j > 0 && !V_BOUNDARY.has(toks[j - 1].v)) j--;
  // skip a label after begin / end ( "begin : name" ) - not expected at module level
  return j;
}

// ===================================================================== IR expression printers
export function prVlog(e) {
  if (!e) return '';
  switch (e.op) {
    case 'lit': return e.scalar || !e.sized ? (e.scalar ? `1'b${e.bits}` : `'b${e.bits}`) : `${e.bits.length}'b${e.bits}`;
    case 'int': return e.value;
    case 'real': return String(e.value);
    case 'str': return JSON.stringify(e.value);
    case 'ref': return e.name;
    case 'index': return `${prVlog(e.base)}[${prVlog(e.index)}]`;
    case 'slice': return `${prVlog(e.base)}[${prVlog(e.left)}:${prVlog(e.right)}]`;
    case 'pslice': return `${prVlog(e.base)}[${prVlog(e.start)} ${e.dir}: ${prVlog(e.width)}]`;
    case 'apply': case 'call': return `${e.name}(${e.args.map(a => prVlog(a.named !== undefined ? a.value : a)).join(', ')})`;
    case 'concat': return `{${e.parts.map(prVlog).join(', ')}}`;
    case 'repl': return `{${prVlog(e.count)}{${prVlog(e.value)}}}`;
    case 'unary': return `${e.o}(${prVlog(e.a)})`;
    case 'binary': {
      if (e.o === 'nand') return `~(${prVlog(e.a)} & ${prVlog(e.b)})`;
      if (e.o === 'nor') return `~(${prVlog(e.a)} | ${prVlog(e.b)})`;
      const o = { mod: '%', rem: '%' }[e.o] || e.o;
      return `(${prVlog(e.a)} ${o} ${prVlog(e.b)})`;
    }
    case 'cond': return `(${prVlog(e.cond)} ? ${prVlog(e.then)} : ${prVlog(e.else)})`;
  }
  return '0';
}
export function prVhdl(e) {
  if (!e) return '';
  switch (e.op) {
    case 'lit': return e.scalar ? `'${e.bits.toUpperCase()}'` : `"${e.bits.toUpperCase()}"`;
    case 'int': return e.value;
    case 'real': return String(e.value).includes('.') ? String(e.value) : `${e.value}.0`;
    case 'phys': return `${e.value} ${e.unit}`;
    case 'str': return `"${String(e.value).replace(/"/g, '""')}"`;
    case 'ref': return e.name;
    case 'index': return `${prVhdl(e.base)}(${prVhdl(e.index)})`;
    case 'slice': return `${prVhdl(e.base)}(${prVhdl(e.left)} downto ${prVhdl(e.right)})`;
    case 'apply': return `${e.name}(${e.args.map(a => (a.named !== undefined ? `${a.named} => ${prVhdl(a.value)}` : prVhdl(a))).join(', ')})`;
    case 'call': return `${e.name}(${e.args.map(prVhdl).join(', ')})`;
    case 'concat': return e.parts.map(prVhdl).join(' & ');
    case 'unary': return e.o === '~' ? `not ${prVhdl(e.a)}` : e.o === 'abs' ? `abs ${prVhdl(e.a)}` : `${e.o}${prVhdl(e.a)}`;
    case 'binary': {
      const o = { '&': 'and', '|': 'or', '^': 'xor', '~^': 'xnor', '==': '=', '!=': '/=', '<<': 'sll', '>>': 'srl', '<<<': 'sla', '>>>': 'sra', '%': 'rem' }[e.o] || e.o;
      return `(${prVhdl(e.a)} ${o} ${prVhdl(e.b)})`;
    }
    case 'attr': return `${prVhdl(e.prefix)}'${e.attr}${e.args?.length ? `(${e.args.map(prVhdl).join(', ')})` : ''}`;
    case 'aggregate': return `(${e.items.map(i => (i.choices ? i.choices.map(c => (c === 'others' ? 'others' : c.range ? `${prVhdl(c.range.left)} ${c.range.dir || 'to'} ${prVhdl(c.range.right)}` : prVhdl(c))).join(' | ') + ' => ' : '') + prVhdl(i.value)).join(', ')})`;
    case 'qualified': return `${e.type}'(${prVhdl(e.expr)})`;
  }
  return '0';
}
export const unparen = s => (/^\(.*\)$/.test(s) && balanced(s.slice(1, -1)) ? s.slice(1, -1) : s);
function balanced(s) { let d = 0; for (const c of s) { if (c === '(') d++; else if (c === ')') { d--; if (d < 0) return false; } } return d === 0; }

export function typeTextVhdl(t) {
  if (!t) return 'std_logic';
  if (t.kind === 'logic') {
    if (!t.range) return 'std_logic';
    return `${t.signed ? 'signed' : 'std_logic_vector'}(${unparen(prVhdl(t.range.left))} ${t.range.dir || 'downto'} ${unparen(prVhdl(t.range.right))})`;
  }
  if (t.kind === 'integer') return t.range ? `integer range ${unparen(prVhdl(t.range.left))} ${t.range.dir || 'to'} ${unparen(prVhdl(t.range.right))}` : 'integer';
  if (t.kind === 'boolean') return 'boolean';
  if (t.kind === 'named') return t.name;
  return 'std_logic';
}
export function rangeTextVlog(t) {
  if (!t || !t.range) return '';
  return `[${unparen(prVlog(t.range.left))}:${unparen(prVlog(t.range.right))}]`;
}
