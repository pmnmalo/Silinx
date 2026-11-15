// The truth table's Quine-McCluskey result (#3939; the algorithm: core/qm.js): its tick box (the output's HDL logic,
// forms qsop / qpos), SOP or POS (whichever is clicked), its expression, cost and circuit, and its steps while its
// Show Steps button is pressed (#4057): the columns of the implicants combined (by their number of 1s, ✓ the ones combined), the prime implicant
// chart (× where a prime covers a minterm, the essential primes marked ✱), the essential primes and the cover. A
// table too large to show its steps shows its counts only; a result not proven minimal is the console's (truthtable.js).
import { h } from './ui.js';
import { cubeCells, cubeText } from '/core/qm.js';

// a cube's expression: an SOP's product term, a POS's sum (its literals complemented)
function cubeAst(c, inputs, pos) {
  const lit = l => (l.neg !== pos ? { t: 'not', a: { t: 'var', name: inputs[l.v] } } : { t: 'var', name: inputs[l.v] });
  const ls = c.literals;
  if (!ls.length) return { t: 'const', v: pos ? 0 : 1 };
  return ls.length === 1 ? lit(ls[0]) : { t: pos ? 'or' : 'and', args: ls.map(lit) };
}

/** SOP | POS: the two buttons choosing which form a result shows (`kind`), `set(k)` on a click. */
export function kindSwitch(kind, set) {
  const b = (k, label, title) => h('button', { type: 'button', class: `tt-kind tt-kind-${k}${kind === k ? ' active' : ''}`, 'aria-pressed': String(kind === k), title, onclick: () => { if (kind !== k) set(k); } }, label);
  return h('span', { class: 'tt-kinds' },
    b('sop', 'SOP', 'The simplified function as a sum of products (its 1s)'),
    b('pos', 'POS', 'The simplified function as a product of sums (its 0s)'));
}

function stepsOf(r, inputs, show, expr) {
  const n = inputs.length, pos = r.form === 'pos', m = pos ? 'M' : 'm';
  const box = h('div', { class: 'tt-qm-steps' });
  const cap = text => h('div', { class: 'tt-qm-cap' }, text);
  const term = c => h('code', { 'data-no-i18n': '' }, show(cubeAst(c, inputs, pos)));
  if (r.steps?.columns) {
    box.append(cap(pos ? 'Prime implicants of the 0s, column by column' : 'Prime implicants, column by column'));
    const cols = h('div', { class: 'tt-qm-cols' });
    r.steps.columns.forEach((col, i) => {
      const t = h('table', { class: 'tt-qm-col', 'data-no-i18n': '' }, h('tr', {}, h('th', { colspan: 3 }, `${i + 1}`)));
      let ones = -1;
      for (const c of col) {
        const k = [...cubeText(c, n)].filter(x => x === '1').length;
        t.append(h('tr', { class: k !== ones && ones >= 0 ? 'tt-qm-group' : null },
          h('td', { class: 'tt-qm-cube' }, cubeText(c, n)), h('td', {}, `${m}(${cubeCells(c).join(', ')})`), h('td', { class: 'tt-qm-used' }, c.combined ? '✓' : '')));
        ones = k;
      }
      cols.append(t);
    });
    box.append(cols);
  } else box.append(cap(`(${r.primes.length} prime implicant(s))`));
  if (r.chart) {
    box.append(cap('Prime implicant chart'));
    const t = h('table', { class: 'tt-qm-chart', 'data-no-i18n': '' }, h('tr', {}, h('th', {}, ''), ...r.chart.minterms.map(x => h('th', {}, String(x)))));
    r.primes.forEach((p, i) => {
      const on = new Set(r.chart.primes[i]);
      t.append(h('tr', { class: p.essential ? 'tt-qm-ess' : null },
        h('th', {}, `${p.essential ? '✱ ' : ''}${cubeText(p, n)} `, term(p)), ...r.chart.minterms.map(x => h('td', {}, on.has(x) ? '×' : ''))));
    });
    box.append(t);
  }
  box.append(cap('Essential prime implicants'),
    r.essential.length ? h('div', { class: 'tt-qm-list' }, ...r.essential.flatMap((c, i) => [i ? ', ' : null, term(c)])) : h('div', { class: 'tt-qm-list' }, 'None'));
  box.append(cap(r.method === 'heuristic' ? 'Cover: each minterm left grown into a prime implicant, the redundant ones dropped'
    : 'Cover: the essential prime implicants, then the fewest others that cover the rest (Petrick\'s method)'),
  h('div', { class: 'tt-qm-list' }, expr(r.ast)));   // (its terms: the result's expression)
  return box;
}

/** A result's Show / Hide button (#4057: not a check box, which in the results is the output's HDL logic): what it
 *  shows under the result while it is pressed; [show, hide] its two labels; set(on). */
export const showButton = ([show, hide], on, set, cls, title) => h('button', { type: 'button', class: `tt-show ${cls}${on ? ' active' : ''}`,
  'aria-pressed': String(on), title, onclick: () => set(!on) }, on ? hide : show);

/**
 * The Quine-McCluskey result: ctx { A (the analysis, A.qm), out, inputs, kind ('sop' | 'pos'), setKind(k), ticked,
 * pick() (ticks it), steps (shown), setSteps(on), show(ast) (an expression in the notation), expr(ast) (the output's, its
 * code), cost(r), circuit(ast), tick }.
 */
export function qmResult(ctx) {
  const r = ctx.A.qm[ctx.kind];
  const stepsBox = showButton(['Show Steps', 'Hide Steps'], ctx.steps, ctx.setSteps, 'tt-qm-steps-on', 'The steps of the algorithm');
  return h('div', { class: 'tt-res tt-qm', title: 'The function simplified by the Quine-McCluskey algorithm' },
    h('div', {}, ctx.tick, h('b', {}, 'Quine-McCluskey'), ': ', kindSwitch(ctx.kind, ctx.setKind), ' ',
      ctx.expr(r.ast)),
    ctx.cost(r), ctx.circuit(r.ast), stepsBox,
    ctx.steps ? stepsOf(r, ctx.inputs, ctx.show, ctx.expr) : null);
}
