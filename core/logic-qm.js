// Silinx logic - a truth table's Quine-McCluskey results (#3939; the algorithm: core/qm.js): each output's SOP and POS
// with their expressions, gates and steps (the editor's and the MCP's results), its HDL logic when it is ticked
// (forms 'qsop', 'qpos'), and the minimisation of a table past the Karnaugh maps' inputs (core/logic.js's minimize).
// The last results are kept: a table's results, its HDL and its schematic ask for the same column several times.
import { gateCount, minimalAst, normColumn } from './logic.js';
import { quineMcCluskey } from './qm.js';

const cache = new Map(), CACHE_MAX = 16;

/** Quine-McCluskey's result of a normalized column in 'sop' or 'pos', with its steps (kept: the last 16; a copy of
 *  its top level and alternatives returned, which its callers may add to). */
export function qmMinimize(col, n, form = 'sop') {
  const key = `${form}:${n}:${col}`;
  let r = cache.get(key);
  if (r) cache.delete(key);
  else r = quineMcCluskey(col, n, { form, steps: true });
  cache.set(key, r);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return { ...r, alternatives: r.alternatives.map(a => ({ ...a })) };
}

/** An output's Quine-McCluskey results: { sop, pos }, each the result with its expression (ast) and gates. */
export function qmResults(col, inputs) {
  const one = form => { const r = qmMinimize(col, inputs.length, form); return { ...r, ast: minimalAst(r, inputs), gates: gateCount(r) }; };
  return { sop: one('sop'), pos: one('pos') };
}

/** Output `o`'s expression in Quine-McCluskey's SOP ('qsop') or POS ('qpos'): { ast, what, form }. */
export function qmForm(doc, o, form) {
  const kind = form === 'qpos' ? 'pos' : 'sop', n = doc.inputs.length;
  const r = qmMinimize(normColumn(doc.table[o], n), n, kind);
  return { ast: minimalAst(r, doc.inputs), what: `Quine-McCluskey ${kind.toUpperCase()}${r.exact ? '' : ' (not proven minimal)'}, ${r.literals} literal(s)`, form };
}
