// Silinx logic - the XOR / XNOR forms of a truth table's column (#435), moved from core/logic.js (#4765).
import { exprColumn, minimalAst, minimize, normColumn, popcount } from './logic.js';

// Many functions are much simpler with XOR / XNOR (parity, adders, comparators, Gray code). The
// XOR form of a column is the cheapest expression of these two shapes, when it is strictly cheaper
// than both the minimal SOP and the minimal POS:
//   * a sum of XOR products: an OR of terms, each a product (AND) of literals and XOR / XNOR
//     factors of two or more variables, every variable at most once in a term:
//     a ⊕ b ⊕ c,  a·b + c·(a ⊕ b),  /(a1 ⊕ b1)·/(a0 ⊕ b0); a plain SOP is one of them;
//   * a variable XOR such a sum: a ⊕ b·c.
// Cost: the literals (variable occurrences) first, then the two-input operators (an n-input gate is
// n − 1 of them; NOT is free, as in the literal count of the SOP / POS, and XNOR is an XOR).
// The terms of n ≤ MAX_XOR_INPUTS variables are all enumerated (7107 for 6 inputs); for a column the
// terms within its 1s and don't cares are kept (the dominated ones dropped) and the cheapest cover of
// its 1s is found by branch and bound, bounded by a node budget (and 250 ms, a safety net on slow
// machines): when cut short, the result is the best found, `exact` false. The result is checked
// against the whole table. 2–6 inputs: a few ms, at most about 40 ms (random 6-input functions);
// more inputs: no XOR form. (No general XOR of products (ESOP) is searched: only x ⊕ (…).)
export const MAX_XOR_INPUTS = 6;
const XOR_LIT = 1024;     // cost of a term or an expression as one number: literals · 1024 + operators
const xorTermsCache = new Map();
const setHas = (s, r) => (s[r >> 5] >>> (r & 31)) & 1;
const setOf = (n, pred) => { const s = new Uint32Array(Math.max(1, (1 << n) >> 5)); for (let r = 0; r < 1 << n; r++) if (pred(r)) s[r >> 5] |= 1 << (r & 31); return s; };
const setAnd = (a, b) => a.map((x, i) => x & b[i]);
const setEmpty = a => a.every(x => x === 0);
const setSub = (a, b) => a.every((x, i) => (x & ~b[i]) === 0);
const setCount = a => a.reduce((k, x) => k + popcount(x), 0);

// every term of n variables: { lits: [{ v, neg }], groups: [{ vars, odd }], nlits, ops, cost, set }
function xorTerms(n) {
  if (xorTermsCache.has(n)) return xorTermsCache.get(n);
  const out = [];
  const role = new Array(n);     // -1 absent, -2 positive literal, -3 negated literal, k ≥ 0: in group k
  const bit = (r, j) => (r >> (n - 1 - j)) & 1;
  const emit = groups => {
    if (groups.some(g => g.length < 2)) return;
    for (let par = 0; par < 1 << groups.length; par++) {
      const lits = [];
      for (let j = 0; j < n; j++) if (role[j] === -2 || role[j] === -3) lits.push({ v: j, neg: role[j] === -3 });
      const gs = groups.map((vars, k) => ({ vars: [...vars], odd: !!((par >> k) & 1) }));
      const nl = lits.length + gs.reduce((s, g) => s + g.vars.length, 0);
      if (!nl) continue;
      const ops = gs.reduce((s, g) => s + g.vars.length - 1, 0) + lits.length + gs.length - 1;
      const set = setOf(n, r => lits.every(l => bit(r, l.v) === (l.neg ? 0 : 1)) && gs.every(g => g.vars.reduce((x, v) => x ^ bit(r, v), 0) === (g.odd ? 1 : 0)));
      // order of equally cheap terms: by variable, a literal before an XOR factor before nothing (ab before bc)
      const key = Array.from({ length: n }, (_, j) => (role[j] === -2 ? 'a' : role[j] === -3 ? 'b' : role[j] === -1 ? 'z' : `c${role[j]}`)).join('');
      out.push({ lits, groups: gs, nlits: nl, ops, cost: nl * XOR_LIT + ops + 1, set, key });
    }
  };
  const walk = (j, groups) => {
    if (j === n) { emit(groups); return; }
    // (the first variables in XOR factors first: of equal covers, a·b + c·(a ⊕ b) is found)
    for (let k = 0; k <= groups.length; k++) {
      role[j] = k;
      const g = groups.map(x => [...x]);
      if (k === groups.length) g.push([]);
      g[k].push(j);
      walk(j + 1, g);
    }
    for (const r of [-2, -3, -1]) { role[j] = r; walk(j + 1, groups); }
  };
  walk(0, []);
  xorTermsCache.set(n, out);
  return out;
}

const termOrder = (a, b) => a.cost - b.cost || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
const solKey = cs => cs.map(c => c.t).sort(termOrder).map(t => t.key).join('|');

// cheapest OR of XOR products covering `on`, within `allowed` (1s and don't cares), of cost < bound
function xorCover(n, on, allowed, bound, budget) {
  const cand = xorTerms(n).filter(t => setSub(t.set, allowed) && !setEmpty(setAnd(t.set, on)))
    .map((t, i) => ({ t, i, cov: setAnd(t.set, on) }));
  cand.forEach(c => { c.k = setCount(c.cov); });
  // drop a term when another as cheap covers all its 1s (of equal ones, the larger, then the first, kept)
  cand.sort((a, b) => b.k - a.k || a.t.cost - b.t.cost || a.i - b.i);
  const keep = [];
  for (const c of cand) if (!keep.some(d => d.t.cost <= c.t.cost && setSub(c.cov, d.cov))) keep.push(c);
  keep.sort((a, b) => a.t.cost - b.t.cost || b.k - a.k || a.i - b.i);
  // the 1s numbered 0..R-1; each term: the 1s it covers
  const rows = []; for (let r = 0; r < 1 << n; r++) if (setHas(on, r)) rows.push(r);
  keep.forEach((c, i) => { c.id = i; c.rows = []; rows.forEach((r, k) => { if (setHas(c.cov, r)) c.rows.push(k); }); });
  const coverers = rows.map((_, k) => keep.filter(c => c.rows.includes(k)));
  const covered = new Int32Array(rows.length);
  const blocked = new Int32Array(keep.length);
  let best = bound, bestSol = null, bestKey = '', nodes = 0, exact = true, stamp = 0;
  const chosen = [];
  const lowerBound = () => {
    // uncovered 1s no term covers two of: each needs a term of its own
    stamp++;
    let lb = 0;
    for (let k = 0; k < rows.length; k++) {
      if (covered[k]) continue;
      const cs = coverers[k];
      if (cs.some(c => blocked[c.id] === stamp)) continue;
      lb += cs[0].t.cost; for (const c of cs) blocked[c.id] = stamp;
    }
    return lb;
  };
  const search = cost => {
    if (++nodes > budget.nodes || ((nodes & 255) === 0 && Date.now() > budget.until)) { exact = false; return; }
    let pick = -1;
    for (let k = 0; k < rows.length; k++) if (!covered[k] && (pick < 0 || coverers[k].length < coverers[pick].length)) pick = k;
    if (pick < 0) {
      // of the cheapest covers, the first in the order of their terms
      const key = solKey(chosen);
      if (cost - 1 < best || (bestSol && cost - 1 === best && key < bestKey)) { best = cost - 1; bestSol = [...chosen]; bestKey = key; }
      return;
    }
    const over = x => (bestSol ? x > best : x >= best);
    if (over(cost - 1 + lowerBound())) return;
    for (const c of coverers[pick]) {
      if (over(cost + c.t.cost - 1)) continue;
      chosen.push(c);
      for (const k of c.rows) covered[k]++;
      search(cost + c.t.cost);
      for (const k of c.rows) covered[k]--;
      chosen.pop();
      if (!exact) return;
    }
  };
  search(0);
  budget.nodes -= Math.min(nodes, budget.nodes);
  if (!exact) budget.cut = true;
  if (!bestSol) return null;
  return { terms: bestSol.map(c => c.t), cost: best, exact };
}

// expression of an OR of XOR products: literals first, then the XOR / XNOR factors
function xorTermsAst(terms, inputs) {
  const v = j => ({ t: 'var', name: inputs[j] });
  const prods = [...terms].sort(termOrder).map(t => {
    const fs = [...t.lits.map(l => (l.neg ? { t: 'not', a: v(l.v) } : v(l.v))),
      ...t.groups.map(g => { const x = { t: 'xor', args: g.vars.map(v) }; return g.odd ? x : { t: 'not', a: x }; })];
    return fs.length === 1 ? fs[0] : { t: 'and', args: fs };
  });
  return prods.length === 1 ? prods[0] : { t: 'or', args: prods };
}

/** Literals and two-input operators of an expression: { literals, xor, and, or, ops } (NOT free). */
export function exprCost(e) {
  const c = { literals: 0, xor: 0, and: 0, or: 0 };
  const walk = x => {
    if (x.t === 'var') c.literals++;
    else if (x.t === 'not') walk(x.a);
    else if (x.args) { c[x.t] = (c[x.t] || 0) + x.args.length - 1; x.args.forEach(walk); }
  };
  walk(e);
  c.ops = c.xor + c.and + c.or;
  return c;
}

/**
 * XOR form of a column (see above), or null when there is none strictly cheaper than `than` (the
 * minimal SOP and POS asts, computed when not given), the column is constant, or it has more than
 * MAX_XOR_INPUTS inputs. Returns { ast, literals, ops, xor, and, or, exact }.
 */
export function minimizeXor(colIn, inputs, { than, maxNodes = 30000, timeMs = 250 } = {}) {
  const n = inputs.length;
  if (n < 2 || n > MAX_XOR_INPUTS) return null;
  const col = normColumn(colIn, n);
  if (!col.includes('1') || !col.includes('0')) return null;
  if (!than) than = ['sop', 'pos'].map(form => minimalAst(minimize(col, n, { form }), inputs));
  const costOf = e => { const c = exprCost(e); return c.literals * XOR_LIT + c.ops; };
  const bound0 = Math.min(...than.map(costOf));
  const budget = { nodes: maxNodes, until: Date.now() + timeMs, cut: false };
  const bit = (r, j) => (r >> (n - 1 - j)) & 1;
  let best = null;
  // a sum of XOR products
  const s0 = xorCover(n, setOf(n, r => col[r] === '1'), setOf(n, r => col[r] !== '0'), bound0, budget);
  if (s0) best = { ast: xorTermsAst(s0.terms, inputs), cost: s0.cost };
  // x ⊕ (a sum of XOR products of f ⊕ x)
  for (let j = 0; j < n && !budget.cut; j++) {
    const g = r => (col[r] === 'X' ? 'X' : String(+col[r] ^ bit(r, j)));
    const gc = Array.from({ length: 1 << n }, (_, r) => g(r)).join('');
    if (!gc.includes('1') || !gc.includes('0')) continue;
    const s = xorCover(n, setOf(n, r => gc[r] === '1'), setOf(n, r => gc[r] !== '0'), (best ? best.cost : bound0) - XOR_LIT - 1, budget);
    if (s) {
      const rest = xorTermsAst(s.terms, inputs);
      best = { ast: { t: 'xor', args: [{ t: 'var', name: inputs[j] }, ...(rest.t === 'xor' ? rest.args : [rest])] }, cost: s.cost + XOR_LIT + 1 };
    }
  }
  if (!best) return null;
  // equivalent to the table on every row that is not a don't care
  const got = exprColumn(best.ast, inputs);
  for (let r = 0; r < col.length; r++) if (col[r] !== 'X' && col[r] !== got[r]) throw new Error(`XOR form of ${col} wrong at row ${r}`);
  return { ast: best.ast, ...exprCost(best.ast), exact: !budget.cut };
}
