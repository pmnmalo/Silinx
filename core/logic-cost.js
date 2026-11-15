// Silinx logic - the cost of a form of a table's output as a circuit (#1427): its gates, each symbol one whatever its
// number of inputs, and its delay, the gates on its longest path, every gate the same delay. As the table's schematic
// draws it (core/logic-sch.js circuitGates, #4091): a complemented input of an AND, OR, NAND or NOR one of its inverted
// inputs (AND2B1…), no gate and no level; an inverter only where one is drawn, shared by its uses; the NOT of a gate its
// complement gate (NAND, NOR, XNOR), one gate; a gate wider than the library's the gates it is split into.
import { circuitGates, gatesText } from './logic-sch.js';

/** { gates, delay } of an expression (core/logic.js parseExpr's nodes). */
export function circuitCost(ast) {
  const { gates, delay } = circuitGates(ast);
  return { gates, delay };
}

// the operation joining a form's terms: a sum of products (SOP, its canonical one, Quine-McCluskey's, the XOR form's sum),
// a product of sums (POS…), a NAND (NOR) of NANDs (NORs)
const OUTER = { sop: 'or', csop: 'or', qsop: 'or', xor: 'or', pos: 'and', cpos: 'and', qpos: 'and', nand: 'nand', nor: 'nor' };
const literalsOf = e => (e.t === 'var' ? 1 : e.a ? literalsOf(e.a) : e.args ? e.args.reduce((k, x) => k + literalsOf(x), 0) : 0);

/** A form's expression as the results say it (#4091): { terms (its sum's or product's, a constant none), literals (its
 *  inputs as written, a tied NAND's once), gates (circuitGates's: types, gates, inputs, delay), text ("3 term(s),
 *  6 literal(s); gates: 3 AND2, 1 OR3") }. */
export function formCost(ast, form) {
  const outer = OUTER[form] || 'or';
  const terms = ast.t === 'const' ? 0 : ast.t === outer ? ast.args.length : 1;
  const literals = literalsOf(ast), gates = circuitGates(ast);
  return { terms, literals, gates, text: `${terms} term(s), ${literals} literal(s); gates: ${gatesText(gates)}` };
}

/** The order of two costs for a goal ('gates': the fewest gates, then the least delay; 'delay': the other way). */
export function costOrder(goal) {
  const key = c => (goal === 'delay' ? [c.delay, c.gates] : [c.gates, c.delay]);
  return (a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1]; };
}
