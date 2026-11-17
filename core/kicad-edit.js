// A KiCad symbol library's properties written in its text (#4280): Silinx keeps a project's KiCad parts as KiCad
// wrote them, and what KiCad has no field for (Silinx.Model, Silinx.Family, Silinx.Footprint, Silinx.Source,
// Silinx.Author, Silinx.Licence: core/circuit-kicad.js) goes in properties of the symbols themselves, which KiCad keeps.
// Only those properties' text changes: the rest of the file stays as it was, byte for byte. A property is written as
// the file's version writes it (KiCad 6's an id and a bare hide, KiCad 8's (hide yes)). Isomorphic module.
import { parseSexpr, num, one, head } from './sexpr.js';

// the lists of a text with their spans: { start, end (after its ")"), kids: [lists and atoms { start, end, value }] }
function spans(text) {
  const root = { kids: [] }, stack = [root];
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === '(') { const l = { start: i, kids: [] }; stack[stack.length - 1].kids.push(l); stack.push(l); i++; }
    else if (c === ')') { stack.pop().end = i + 1; i++; }
    else if (c === '"') {
      let j = i + 1, v = '';
      while (j < text.length && text[j] !== '"') { if (text[j] === '\\') { v += text[j + 1]; j += 2; } else v += text[j++]; }
      stack[stack.length - 1].kids.push({ start: i, end: j + 1, value: v });
      i = j + 1;
    } else if (/\s/.test(c)) i++;
    else { let j = i; while (j < text.length && !/[\s()"]/.test(text[j])) j++; stack[stack.length - 1].kids.push({ start: i, end: j, value: text.slice(i, j) }); i = j; }
  }
  return root.kids;
}
const key = (l) => l.kids?.[0]?.value;
/** A string as KiCad quotes it. */
export const quote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

/**
 * The library's text with properties of its symbols set: `edits` { symbol: { key: value | null (removed) } }. Throws on a
 * text that is not a symbol library (core/sexpr.js's checks and limits first) or a symbol it has not.
 */
export function setSymbolProperties(text, edits) {
  const [lib] = parseSexpr(text);
  if (head(lib) !== 'kicad_symbol_lib') throw new Error('not a KiCad symbol library: it does not start with (kicad_symbol_lib');
  const version = num(one(lib, 'version')?.[1]), old = version < 20220000, hideNew = version >= 20231120;
  const top = spans(text).find((l) => key(l) === 'kicad_symbol_lib');
  const changes = [];   // [{ start, end, text }], applied from the end
  for (const [name, props] of Object.entries(edits)) {
    const sym = top.kids.find((l) => key(l) === 'symbol' && l.kids[1]?.value === name);
    if (!sym) throw new Error(`no symbol '${name}' in the library`);
    const own = sym.kids.filter((l) => key(l) === 'property');
    let ids = Math.max(-1, ...own.map((l) => num(l.kids.find((k) => key(k) === 'id')?.kids[1]?.value, -1)));
    const last = own[own.length - 1];
    // (a new property goes after the symbol's last one, on a line of its own with its indent; else after its name)
    const after = last ?? sym.kids.find((k, i) => i > 1 && (key(k) === 'extends' || key(k) === 'pin_names' || key(k) === 'in_bom' || key(k) === 'on_board')) ?? sym.kids[1];
    const lineStart = text.lastIndexOf('\n', (last ?? sym).start) + 1;
    // (its line's leading white space: a symbol written on one line, its properties after its name, has no other, #4281)
    const lead = /^[ \t]*/.exec(text.slice(lineStart))[0], indent = last && lineStart + lead.length === last.start ? lead : `${lead}\t`;
    let added = '';
    for (const [k, v] of Object.entries(props)) {
      const at = own.find((l) => l.kids[1]?.value === k);
      if (v == null) { if (at) changes.push({ start: text.lastIndexOf('\n', at.start), end: at.end, text: '' }); continue; }
      if (at) { changes.push({ start: at.kids[2].start, end: at.kids[2].end, text: quote(v) }); continue; }
      const prop = `(property ${quote(k)} ${quote(v)}${old ? ` (id ${++ids})` : ''} (at 0 0 0)${hideNew ? ' (effects (font (size 1.27 1.27)) (hide yes))' : ' (effects (font (size 1.27 1.27)) hide)'})`;
      added += `\n${indent}${prop}`;
    }
    if (added) changes.push({ start: after.end, end: after.end, text: added });
  }
  let out = text;
  for (const c of changes.sort((a, b) => b.start - a.start || b.end - a.end)) out = out.slice(0, c.start) + c.text + out.slice(c.end);
  return out;
}

/**
 * A library's symbols' texts as KiCad wrote them: { version, symbols: Map(name → its `(symbol …)` text) } (#4305: one
 * symbol taken out of a library into a file of its own, as KiCad 10's .kicad_symdir folders hold them).
 */
export function symbolTexts(text) {
  const [lib] = parseSexpr(text);
  if (head(lib) !== 'kicad_symbol_lib') throw new Error('not a KiCad symbol library: it does not start with (kicad_symbol_lib');
  const top = spans(text).find((l) => key(l) === 'kicad_symbol_lib');
  return { version: num(one(lib, 'version')?.[1]), symbols: new Map(top.kids.filter((l) => key(l) === 'symbol').map((l) => [l.kids[1]?.value, text.slice(l.start, l.end)])) };
}

// (KiCad's EscapeString with CTX_FILENAME, common/string_utils.cpp: what a file name cannot hold)
const FILE_ESCAPES = { '/': '{slash}', '\\': '{backslash}', '"': '{dblquote}', '<': '{lt}', '>': '{gt}', '|': '{bar}', ':': '{colon}', '\t': '{tab}', '\n': '{return}', '\r': '{return}' };
/** A symbol's file name in a .kicad_symdir folder, as KiCad 10 names it (#4318): its name, what a file name cannot hold
 *  escaped as KiCad does ('10k_Axial_1/6W' → '10k_Axial_1{slash}6W.kicad_sym'). */
export const symbolFileName = (name) => `${String(name).replace(/[/\\"<>|:\t\n\r]/g, (c) => FILE_ESCAPES[c])}.kicad_sym`;

/** A .kicad_sym file of one symbol's text (symbolTexts's), at the library's version. */
export const oneSymbolFile = (version, symbol) => `(kicad_symbol_lib\n\t(version ${version})\n\t(generator "silinx")\n\t${symbol}\n)\n`;
