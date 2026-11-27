// @silinx/avr-gcc - a sketch's .ino files made one C++ file (#5934), as the Arduino builder makes them: the main .ino
// first, the others after it in name order, `#include <Arduino.h>` before them, and a prototype of each function they define
// and do not declare, put before the first function (so that a function may be called above its definition); `#line`
// lines keep the compiler's messages at their own file and line.

// the source's comments and strings blanked (the same length, its newlines kept): what the scan reads
function blank(text) {
  let out = '', i = 0;
  while (i < text.length) {
    const c = text[i], d = text[i + 1];
    if (c === '/' && d === '/') { const j = text.indexOf('\n', i); const e = j < 0 ? text.length : j; out += ' '.repeat(e - i); i = e; continue; }
    if (c === '/' && d === '*') { const j = text.indexOf('*/', i + 2); const e = j < 0 ? text.length : j + 2; out += text.slice(i, e).replace(/[^\n]/g, ' '); i = e; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      out += c + ' '.repeat(Math.max(0, Math.min(j, text.length) - i - 1)) + (j < text.length ? c : ''); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'return', 'sizeof', 'else', 'do', 'case', 'catch', 'new', 'delete']);

/**
 * The functions an .ino defines at its top level: [{ proto (its declaration, "void blink(int n);"), name, line (its
 * definition's, from 1), offset }], and the names it declares there (prototypes already written).
 */
export function inoFunctions(text) {
  const b = blank(text), defs = [], declared = new Set();
  let depth = 0, stmt = 0, line = 1;
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === '\n') { line++; if (depth === 0 && /^\s*#/.test(b.slice(stmt, i))) stmt = i + 1; continue; }
    if (depth === 0 && c === '#' && /^\s*$/.test(b.slice(b.lastIndexOf('\n', i - 1) + 1, i))) { const j = b.indexOf('\n', i); i = (j < 0 ? b.length : j) - 1; continue; }
    if (c === '{') {
      if (depth === 0) {
        const head = b.slice(stmt, i).replace(/\s+/g, ' ').trim();
        const m = /^((?:[A-Za-z_][\w:<>,*&\s]*?[\s*&]+)?)([A-Za-z_]\w*)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(const)?$/.exec(head);
        if (m && m[1].trim() && !KEYWORDS.has(m[2]) && !/\b(class|struct|union|enum|namespace|typedef)\b/.test(m[1]) && !/=/.test(m[1])) {
          const before = text.slice(0, stmt).split('\n').length - 1 + (text.slice(stmt, i).match(/^\s*/)[0].split('\n').length - 1);
          defs.push({ proto: `${m[1].trim()} ${m[2]}(${m[3].trim()})${m[4] ? ' const' : ''};`, name: m[2], line: before + 1, offset: stmt + (text.slice(stmt, i).match(/^\s*/)[0].length) });
        }
      }
      depth++;
    } else if (c === '}') { depth--; if (depth === 0) stmt = i + 1; }
    else if (c === ';' && depth === 0) {
      const m = /([A-Za-z_]\w*)\s*\([^()]*\)\s*;?$/.exec(b.slice(stmt, i + 1).replace(/\s+/g, ' ').trim());
      if (m && !/=/.test(b.slice(stmt, i))) declared.add(m[1]);
      stmt = i + 1;
    }
  }
  return { defs, declared };
}

/**
 * The sketch's .ino files ([{ name, text }], the main one first) as one C++ file: { cpp, name (main + '.cpp') }. A
 * prototype for each function defined and not declared (but one with a default argument), before the first function of
 * the first file that has one.
 */
export function sketchCpp(inos) {
  const parts = ['#include <Arduino.h>'];
  const all = inos.map((f) => ({ ...f, ...inoFunctions(f.text) }));
  const declared = new Set(all.flatMap((f) => [...f.declared]));
  // (a function with a default argument has none: the default may be given once only, in its definition here)
  const protos = all.flatMap((f) => f.defs.filter((d) => !declared.has(d.name) && !/=/.test(d.proto)).map((d) => ({ ...d, file: f.name })));
  let placed = false;
  for (const f of all) {
    const first = f.defs[0];
    if (!placed && first && protos.length) {
      const head = f.text.slice(0, first.offset), firstLine = head.split('\n').length;
      parts.push(`#line 1 "${f.name}"`, head.replace(/\n$/, ''));
      for (const p of protos) parts.push(`#line ${p.line} "${p.file}"`, p.proto);
      parts.push(`#line ${firstLine} "${f.name}"`, f.text.slice(first.offset));
      placed = true;
    } else parts.push(`#line 1 "${f.name}"`, f.text);
  }
  return { cpp: parts.join('\n') + '\n', name: `${inos[0].name}.cpp` };
}
