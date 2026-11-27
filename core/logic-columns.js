// A truth table's columns edited one at a time (#5869: its editor's column header's right-click menu, web/js/tt-col-menu.js;
// the MCP's set_output_logic): renamed, an output duplicated, a column inserted before or after another, deleted. Each is
// core/logic.js shapeTable's (the Inputs and Outputs boxes' checks and rules: an input renamed keeps its rows, an output
// its column, #5165; a new input leaves the outputs independent of it, a new output is 0s; an input removed keeps the rows
// where it is 0), a new normalized document; a LogicError on what is refused. Moved: logic.js moveColumn (#5863).
import { normalizeTable, shapeTable, LogicError } from './logic.js';

const KINDS = ['inputs', 'outputs'];
const one = kind => (kind === 'inputs' ? 'input' : 'output');

/** The table normalized, its column `i` of `kind` checked. */
function column(docIn, kind, i) {
  if (!KINDS.includes(kind)) throw new LogicError(`${kind}: inputs or outputs`);
  const doc = normalizeTable(docIn);
  if (!Number.isInteger(i) || i < 0 || i >= doc[kind].length) throw new LogicError(`No ${one(kind)} column ${i} (it has ${doc[kind].length})`);
  return doc;
}
const reshaped = (doc, kind, names) => shapeTable(doc, kind === 'inputs' ? names : doc.inputs, kind === 'outputs' ? names : doc.outputs);
const taken = (doc, v) => [doc.name, ...doc.inputs, ...doc.outputs].some(x => x.toLowerCase() === v.toLowerCase());

/** A name new to the table: `base` followed by 2, 3… (f → f2), or, with no base, the first letter free from `from`
 *  (a new input from a, a new output from f), then x1, x2… */
export function freshName(docIn, { base, from = 'a' } = {}) {
  const doc = normalizeTable(docIn);
  if (base) { for (let k = 2; ; k++) if (!taken(doc, `${base}${k}`)) return `${base}${k}`; }
  for (let c = from.charCodeAt(0); c <= 122; c++) if (!taken(doc, String.fromCharCode(c))) return String.fromCharCode(c);
  for (let k = 1; ; k++) if (!taken(doc, `x${k}`)) return `x${k}`;
}

/** Column `i` of `kind` renamed `name` (its rows or its column kept). */
export function renameColumn(docIn, kind, i, name) {
  const doc = column(docIn, kind, i), v = String(name ?? '').trim();
  if (v === doc[kind][i]) return doc;
  if (taken({ ...doc, [kind]: doc[kind].filter((_, j) => j !== i) }, v)) throw new LogicError(`The name '${v}' is used already`);
  return reshaped(doc, kind, doc[kind].map((x, j) => (j === i ? v : x)));
}

/** Column `i` of `kind` deleted: the last input or output refused (shapeTable's). */
export function deleteColumn(docIn, kind, i) {
  const doc = column(docIn, kind, i);
  return reshaped(doc, kind, doc[kind].filter((_, j) => j !== i));
}

/** A new column of `kind` at place `at` (0 to its count; `name` or a fresh one): an input's outputs independent of it,
 *  an output's 0s. */
export function insertColumn(docIn, kind, at, name) {
  if (!KINDS.includes(kind)) throw new LogicError(`${kind}: inputs or outputs`);
  const doc = normalizeTable(docIn);
  if (!Number.isInteger(at) || at < 0 || at > doc[kind].length) throw new LogicError(`No place ${at} among the ${kind} (0 to ${doc[kind].length})`);
  const v = name == null ? freshName(doc, { from: kind === 'inputs' ? 'a' : 'f' }) : String(name).trim();
  if (taken(doc, v)) throw new LogicError(`The name '${v}' is used already`);
  const names = [...doc[kind]];
  names.splice(at, 0, v);
  return reshaped(doc, kind, names);
}

/** Output `i` copied after it (`name` or its name and 2, 3…): its column, its expression, its form and solutions. */
export function duplicateOutput(docIn, i, name) {
  const doc = column(docIn, 'outputs', i), o = doc.outputs[i];
  const next = insertColumn(doc, 'outputs', i + 1, name ?? freshName(doc, { base: o }));
  const c = next.outputs[i + 1];
  next.table[c] = doc.table[o];
  if (doc.exprs[o]) next.exprs[c] = doc.exprs[o];
  next.forms = { ...next.forms, ...(doc.forms?.[o] ? { [c]: doc.forms[o] } : {}) };
  if (!doc.forms?.[o]) delete next.forms[c];   // (the table's form, as its own)
  if (doc.solutions?.[o]) next.solutions = { ...next.solutions, [c]: { ...doc.solutions[o] } };
  return normalizeTable(next);
}
