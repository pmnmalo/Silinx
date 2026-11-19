// Which circuit parts the tests check against a reference of their own (#4602): each group's test writes its parts'
// datasheets (their function tables, their pinouts) in a table, `const SHEETS = { 7442: …, … }`, and runs every part of
// it against its model (through the engine and through the HDL); this reads those tables' keys from the tests' sources
// (importing a test would run its tests), for test/circuit-coverage.test.js. A table's keys: its own (a number, a name,
// a string) and those added after it (`SHEETS[74145] = …`); a spread or a computed key is an error, never skipped.
import fs from 'node:fs';

/** The groups' tests and their tables: a part is checked where it is in every table its file names. */
export const REFERENCE_TESTS = {
  'circuit-parts.test.js': ['PINOUT', 'FN'],             // the gate ICs and three-state buffers: their truth tables
  'circuit-msi.test.js': ['PINOUT', 'REF'],              // the MSI ICs: their functions
  'circuit-seq.test.js': ['PINOUT'],                     // the sequential ICs: their scenarios and their random walk
  'circuit-transceivers.test.js': ['SHEET'],             // the transceivers: their directions
  'circuit-model-ics.test.js': ['SHEETS'],               // #4397's ICs written once in VHDL, each group's sheets
  'circuit-model-counters.test.js': ['SHEETS'],
  'circuit-model-decoders.test.js': ['SHEETS'],
  'circuit-model-mux.test.js': ['SHEETS'],
  'circuit-model-memory.test.js': ['SHEETS'],
  'circuit-model-shift.test.js': ['SHEETS'],
};

// the source with its strings, template literals and comments blanked (their length kept), so that only code is read
function codeOf(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], two = src.slice(i, i + 2);
    let end = -1;
    if (two === '//') end = src.indexOf('\n', i), end = end < 0 ? src.length : end;
    else if (two === '/*') end = src.indexOf('*/', i + 2) + 2;
    else if (c === '\'' || c === '"' || c === '`') {
      end = i + 1;
      while (end < src.length && src[end] !== c) end += src[end] === '\\' ? 2 : 1;
      end++;
      out += c + ' '.repeat(end - i - 2) + c;
      i = end;
      continue;
    }
    if (end > i) { out += src.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
    out += c;
    i++;
  }
  return out;
}

/** The keys of the table `name` in a test's source: its literal's own (depth 1, after `{` or `,`) and those set after it. */
export function tableKeys(src, name) {
  const code = codeOf(src), start = code.search(new RegExp(`^const ${name} = \\{`, 'm'));
  if (start < 0) throw new Error(`no table ${name}`);
  const keys = [];
  let depth = 0, i = code.indexOf('{', start), expectKey = false;
  for (; i < code.length; i++) {
    const c = code[i];
    if (c === '[' && depth === 1 && expectKey) throw new Error(`${name}: a key that is not a literal: ${src.slice(i, i + 30)}`);
    if ('{[('.includes(c)) { depth++; if (depth === 1) expectKey = true; continue; }
    if ('}])'.includes(c)) { if (--depth === 0) break; continue; }
    if (depth !== 1) continue;
    if (c === ',') { expectKey = true; continue; }
    if (!expectKey || /\s/.test(c)) continue;
    expectKey = false;
    // (a string's key read from the source: the code has it blanked)
    const m = /^(\d+|[A-Za-z_$][\w$]*|'[^'\n]*'|"[^"\n]*")\s*:/.exec(code.slice(i));
    if (!m) throw new Error(`${name}: a key that is not a literal: ${src.slice(i, i + 30)}`);
    keys.push(/^['"]/.test(m[1]) ? src.slice(i + 1, i + m[1].length - 1) : m[1]);
  }
  for (const m of code.matchAll(new RegExp(`^${name}\\[(\\d+|'[^']*')\\] =`, 'gm'))) {
    keys.push(m[1].startsWith('\'') ? src.slice(m.index + name.length + 2, m.index + name.length + m[1].length) : m[1]);
  }
  return keys;
}

/** Each part a group's test checks against its reference: Map type → the test's file. */
export function referencedParts(dir = new URL('./', import.meta.url)) {
  const out = new Map();
  for (const [file, tables] of Object.entries(REFERENCE_TESTS)) {
    const src = fs.readFileSync(new URL(file, dir), 'utf8');
    const sets = tables.map((t) => new Set(tableKeys(src, t)));
    for (const k of sets[0]) if (sets.every((s) => s.has(k))) out.set(k, out.has(k) ? `${out.get(k)}, ${file}` : file);
  }
  return out;
}
