// The truth table's results (#405: out of mountTtEditor in web/js/truthtable.js, #3218): for the selected output, the
// forms of the fewest gates and of the least delay (#1427), the Karnaugh map's and Quine-McCluskey's simplified function
// (SOP or POS, #3939: web/js/tt-qm.js), the canonical forms, the XOR form when it is cheaper (#435), the NAND-only and
// NOR-only forms (#694), each with its tick box (its HDL logic, #2951), in the notation of the Settings (#3915).
import { h } from './ui.js';
import { circuitCost, formCost, outputForm, formOf, setOutputLogic, MAX_KMAP_INPUTS } from '/core/logic.js';
import { DEFAULT_NOTATION, NOTATIONS, showExpr as formatExpr } from '/core/expr-notation.js';
import { menuChoice } from './toolbar-menu.js';
import { getNotation } from './notation.js';
import { designKind } from './project-kind-flag.js';
import { kindSwitch, qmResult, showButton } from './tt-qm.js';
import { drawBarsIn } from './overbar.js';

// (a design and simulation project's, #3780: no HDL)
const HDL_NOTATIONS = ['vhdl', 'verilog'];
/** The notation the expressions are shown in: the Settings' (#3915; not an HDL's in a design and simulation project, #3780). */
const shownNotation = () => { const n = getNotation(); return designKind() && HDL_NOTATIONS.includes(n) ? DEFAULT_NOTATION : n; };
/** The notation a table's expressions are shown in: its own (#3939: its toolbar menu's), else the Settings'. */
export const tableNotation = M => (M?.notation && !(designKind() && HDL_NOTATIONS.includes(M.notation)) ? M.notation : shownNotation());
/** The toolbar menu's Notation (#3939): the Settings' (the default) or one of the table's own; onChange(id or ''). */
export function notationChoice(M, onChange) {
  const ns = NOTATIONS.filter(([v]) => !designKind() || !HDL_NOTATIONS.includes(v));
  return menuChoice('Notation', [{ value: '', label: 'As in the Settings', title: 'The notation of Settings ▸ Boolean Notation' },
    ...ns.map(([v, name, ex]) => ({ value: v, label: `${name}: ${ex}` }))], { value: M.notation || '', onChange, title: 'The notation of this table\'s expressions' });
}

// the HDL logic of the fewest gates, or of the least delay, among the other forms (#1427)
const GATES_TIP = 'The form with the fewest gates, each symbol one gate whatever its number of inputs';
const DELAY_TIP = 'The form with the fewest gates on its longest path, every gate the same delay';
// the tick box of a result (#2951): ticked, the output's HDL logic (its module and schematic in that form); `pick()` ticks it
const HDL_TIP = 'The HDL logic of this output: its module and its schematic in this form';
const LOGIC_TIP = 'The logic of this output: its module and its schematic in this form';   // (a design project's: no HDL, #3891)
const hdlTick = (on, pick) => h('input', { type: 'checkbox', class: 'tt-hdl', checked: on, title: designKind() ? LOGIC_TIP : HDL_TIP, onchange: e => { if (e.target.checked) pick(); else e.target.checked = true; } });
// an output's expression (#3939): a large table's (its text would be megabytes, a NAND form's tree the most) shown in
// part, its first MAX_NODES operators and literals as written, '…' for the rest, and how many literals it has in all.
// (A one-input NAND or NOR is written with its input twice, /(x.x): its input counted twice.)
const MAX_NODES = 10000;   // (an 8-input canonical SOP in full: 255 terms, about 3300)
const tied = a => (a.t === 'nand' || a.t === 'nor') && a.args.length === 1;
const sizeOf = a => 1 + (a.a ? sizeOf(a.a) : 0) + (a.args ? a.args.reduce((k, x) => k + sizeOf(x), 0) * (tied(a) ? 2 : 1) : 0);
const litsOf = a => (a.t === 'var' ? 1 : (a.a ? litsOf(a.a) : 0) + (a.args ? a.args.reduce((k, x) => k + litsOf(x), 0) : 0));
function part(a, left) {
  const rest = { t: 'var', name: '…' };
  if (left.n-- <= 0) return rest;
  if (a.a) return { ...a, a: part(a.a, left) };
  if (!a.args) return a;
  const args = [], was = left.n;
  for (const x of a.args) { if (left.n <= 0) { args.push(rest); break; } args.push(part(x, left)); }
  if (tied(a)) left.n -= was - left.n;
  return { ...a, args };
}
function exprCode(out, ast, notation) {
  const cut = sizeOf(ast) > MAX_NODES;
  return h('span', { class: 'tt-expr-box' }, h('code', { class: 'tt-expr', 'data-no-i18n': '' }, `${out} = ${formatExpr(cut ? part(ast, { n: MAX_NODES }) : ast, notation)}`),
    cut ? h('span', { class: 'tt-more' }, ` (shown in part: ${litsOf(ast)} literal(s) in all)`) : null);
}
// a form as a circuit: its gates (each symbol one) and its delay (its longest path, every gate the same delay, #1427)
function circuit(ast) {
  const c = circuitCost(ast);
  return h('div', { class: 'tt-circuit' }, `As a circuit: ${c.gates} gate(s), delay ${c.delay}`);
}
// a form's terms, literals and gates by type (#4091: AND2B1, OR3…, an inverted input no NOT)
const costLine = (ast, form) => h('div', { class: 'tt-cost' }, formCost(ast, form).text);
// the form of the fewest gates or of the least delay of an output (#1427): its expression beside its name (#4091: not
// the name of the form it is in), its terms, literals and gates, its gates and delay as a circuit
function bestForm(doc, out, goal, label, tip, notation, tick) {
  const r = outputForm(doc, out, goal);
  return h('div', { class: `tt-res tt-${goal}`, title: tip },
    h('div', {}, tick(goal), h('b', {}, label), ': ', exprCode(out, r.ast, notation)), costLine(r.ast, r.form), circuit(r.ast));
}

// the canonical forms in full, the sum of the minterms and the product of the maxterms (#2927), each the list of its
// terms first (#2952), its full expression under it (#3069), its terms, literals, gates and circuit as the minimal
// forms' (#3072), each with its tick box (#2951)
function canonForms(A, out, notation, tick) {
  const expr = (f, label, title, ast, list) => h('div', { class: `tt-canon-${f.slice(1)}`, title }, tick(f), h('b', {}, label), ': ',
    h('code', { class: 'tt-canon-list', 'data-no-i18n': '' }, `${out} = ${list}`), h('br'), exprCode(out, ast, notation),
    costLine(ast, f), circuit(ast));
  return h('div', { class: 'tt-res tt-canon' },
    expr('csop', 'Canonical SOP', 'The sum of the minterms: every input in every term, the don\'t cares left out', A.canon.sop, A.sigma),
    expr('cpos', 'Canonical POS', 'The product of the maxterms: every input in every term, the don\'t cares left out', A.canon.pos, A.pi));
}

/** The results of the selected output, in `results` (#3065, #3939): the forms of least gates and of least delay first, then
 *  the Karnaugh map's (up to 6 inputs) and Quine-McCluskey's simplified function, each SOP or POS as clicked, then the
 *  canonical, XOR, NAND and NOR forms. ctx: the editor's M(), out(), A() (its analysis), notation(), groups() and
 *  setGroups(k) (the map's, its SOP or POS), kmapBox (the map, its options and legend), mapShown() and setMapShown(on)
 *  (#4057), qmKind() and setQmKind(k), qmSteps() and setQmSteps(on), setM(m),
 *  changed(), renderResults(), renderKmap(). */
export function renderTtResults(ctx) {
  const { results } = ctx, M = ctx.M(), out = ctx.out(), A = ctx.A(), notation = ctx.notation(), n = M.inputs.length;
  results.innerHTML = '';
  // its tick box (#2951): the form ticked, the output's HDL logic (an XOR form not simpler: its minimal SOP's; past the
  // K-map's inputs, the minimal SOP and POS are Quine-McCluskey's)
  const cur0 = formOf(M, out) === 'xor' && !A.xor ? 'sop' : formOf(M, out);
  const cur = n > MAX_KMAP_INPUTS && (cur0 === 'sop' || cur0 === 'pos') ? `q${cur0}` : cur0;
  const pick = f => { ctx.setM(setOutputLogic(M, out, { form: f })); ctx.changed(); };
  const tick = f => hdlTick(cur === f, () => pick(f));
  const cost = r => costLine(r.ast, r.form);
  // the Karnaugh map's simplified function (#3939): the minimal SOP or POS of its groups, the solution chosen on the map (#2950)
  const kmap = () => {
    const k = ctx.groups(), r = A[k];
    return h('div', { class: 'tt-res tt-kmap-res', title: 'The function simplified on the Karnaugh map: its groups of 1s (SOP) or of 0s (POS)' },
      h('div', {}, tick(k), h('b', {}, 'Karnaugh map'), ': ', kindSwitch(k, ctx.setGroups), ' ',
        exprCode(out, r.ast, notation)),
      cost(r), circuit(r.ast),
      showButton(['Show K-map', 'Hide K-map'], ctx.mapShown(), ctx.setMapShown, 'tt-kmap-on', 'The Karnaugh map of this output, its groups those of this SOP or POS'),
      ctx.mapShown() ? ctx.kmapBox : null);   // (under its result, #4057)
  };
  const qk = ctx.qmKind();
  const qm = qmResult({ A, out, inputs: M.inputs, kind: qk, setKind: ctx.setQmKind, tick: tick(`q${qk}`), steps: ctx.qmSteps(), setSteps: ctx.setQmSteps,
    show: ast => formatExpr(ast, notation), expr: ast => exprCode(out, ast, notation), cost, circuit });
  // the XOR form, when cheaper than both (#435)
  const x = A.xor;
  const xorForm = x && h('div', { class: 'tt-res tt-xor', title: 'Shown when it has fewer literals than the minimal SOP and POS, or as many and fewer operators' },
    h('div', {}, tick('xor'), h('b', {}, 'XOR form'), ': ', exprCode(out, x.ast, notation)),
    costLine(x.ast, 'xor'), circuit(x.ast),
    x.exact ? null : h('span', { class: 'tt-note' }, 'The search was cut short: a simpler XOR form may exist.'));
  // NAND and NOR only (#694): the minimal SOP and POS by double negation
  const gateForm = (label, g, cls, from) => h('div', { class: `tt-res ${cls}`, title: from },
    h('div', {}, tick(cls.slice(3)), h('b', {}, label), ': ', exprCode(out, g.ast, notation)),
    costLine(g.ast, cls.slice(3)), circuit(g.ast));
  const best = (goal, label, tip) => bestForm(M, out, goal, label, tip, notation, tick);
  results.append(
    // (the circuit's two choices first, then the K-map's and Quine-McCluskey's, the canonical ones after them, #3065, #3939)
    best('gates', 'Least number of gates', GATES_TIP), best('delay', 'Least delay', DELAY_TIP),
    ...(n <= MAX_KMAP_INPUTS ? [kmap()] : []), qm,
    canonForms(A, out, notation, tick),
    ...(xorForm ? [xorForm] : []),
    gateForm('NAND form', A.nand, 'tt-nand', 'The minimal SOP with NAND gates only (double negation); an inverter is a NAND with its inputs tied, /(a·a)'),
    gateForm('NOR form', A.nor, 'tt-nor', 'The minimal POS with NOR gates only (double negation); an inverter is a NOR with its inputs tied, /(a + a)'));
  drawBarsIn(results, '.tt-expr, .tt-qm-steps code');   // (the bars drawn, #4058)
}
