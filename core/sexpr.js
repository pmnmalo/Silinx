// S-expressions as KiCad's files write them (#4279, https://dev-docs.kicad.org/en/file-formats/sexpr-intro/): lists in
// parentheses, bare tokens (keywords, numbers) and double-quoted UTF-8 strings with backslash escapes. A list is an
// Array, an atom a string (a quoted one unquoted: KiCad's readers do not tell them apart either); the readers of
// core/kicad-sym.js and core/kicad-mod.js take their numbers with num(). The files come from anywhere (a library
// downloaded, a file the user picks), so the parser runs no code and stops at its limits: the text's size, the lists'
// depth and the number of tokens. Isomorphic module.

/** The parser's limits: a library of KiCad's largest (Device, the MCUs) stays well under them. */
export const SEXPR_LIMITS = { maxBytes: 32 * 1024 * 1024, maxDepth: 64, maxTokens: 8_000_000 };

const ESCAPES = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"' };

/**
 * The S-expressions of `text`: an array of its top-level lists (a KiCad file has one). Throws on a malformed text
 * (with its line) or one over the limits (`limits`: SEXPR_LIMITS's, any of them overridden).
 */
export function parseSexpr(text, limits = {}) {
  const { maxBytes, maxDepth, maxTokens } = { ...SEXPR_LIMITS, ...limits };
  const s = String(text ?? '');
  if (s.length > maxBytes) throw new Error(`the file is too large: ${s.length} characters (at most ${maxBytes})`);
  const top = [], stack = [];
  let cur = top, line = 1, tokens = 0;
  const count = () => { if (++tokens > maxTokens) throw new Error(`the file has too many tokens (at most ${maxTokens})`); };
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f') { i++; continue; }
    if (c === '(') {
      count();
      if (stack.length >= maxDepth) throw new Error(`line ${line}: the lists are nested too deep (at most ${maxDepth})`);
      const list = [];
      cur.push(list);
      stack.push({ list: cur, line });
      cur = list;
      i++;
    } else if (c === ')') {
      if (!stack.length) throw new Error(`line ${line}: a ")" with no "(" before it`);
      cur = stack.pop().list;
      i++;
    } else if (c === '"') {
      count();
      let out = '', j = i + 1;
      const from = line;
      for (;;) {
        if (j >= s.length) throw new Error(`line ${from}: a string not closed`);
        const d = s[j];
        if (d === '"') break;
        if (d === '\\' && j + 1 < s.length) { out += ESCAPES[s[j + 1]] ?? s[j + 1]; j += 2; continue; }
        if (d === '\n') line++;
        out += d;
        j++;
      }
      cur.push(out);
      i = j + 1;
    } else {
      count();
      let j = i;
      while (j < s.length && !' \t\r\n\f()"'.includes(s[j])) j++;
      cur.push(s.slice(i, j));
      i = j;
    }
  }
  if (stack.length) throw new Error(`line ${stack[stack.length - 1].line}: a "(" not closed`);
  if (!top.every(Array.isArray)) throw new Error(`a token outside any list: ${top.find((x) => !Array.isArray(x))}`);
  return top;
}

// ------------------------------------------------------------------ reading the lists
/** A list's keyword (its first atom), or null. */
export const head = (l) => (Array.isArray(l) && typeof l[0] === 'string' ? l[0] : null);
/** The lists inside `l` whose keyword is `key`. */
export const all = (l, key) => (Array.isArray(l) ? l.filter((x) => head(x) === key) : []);
/** The first list inside `l` whose keyword is `key`, or null. */
export const one = (l, key) => (Array.isArray(l) ? l.find((x) => head(x) === key) ?? null : null);
/** A number atom, or `fallback` (a missing or malformed one). */
export const num = (a, fallback = 0) => { const v = typeof a === 'string' && a.trim() !== '' ? Number(a) : NaN; return Number.isFinite(v) ? v : fallback; };
/** Whether `l` holds the bare atom `flag` (KiCad 6's `hide`) or the list `(flag yes)` (KiCad 8's `(hide yes)`). */
export function flag(l, key) {
  if (!Array.isArray(l)) return false;
  if (l.slice(1).includes(key)) return true;
  const f = one(l, key);
  return !!f && (f.length === 1 || f[1] === 'yes');
}
