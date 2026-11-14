// Silinx logic - the Quine-McCluskey minimisation of a truth table's column (#3939; a table has up to 16 inputs): its prime
// implicants (the columns of the combined implicants), its chart (the primes that cover each minterm), its essential
// primes and the cover of the rest (Petrick's method's minimum, found by branch and bound). Bounded by work, never by
// time (the same table always gives the same result): past `maxImplicants` implicants, a cover heuristic (each minterm
// left grown into a prime, then the redundant terms dropped); past `maxWork` steps of the search (a node costs one per
// minterm), the best cover found. Either: `exact` false, not proven minimal. Cost: the fewest terms, then the fewest
// literals (as core/logic.js's minimize).
// 'pos' minimises the 0s: each cube is the clause of its complemented literals.
//
//   quineMcCluskey(col, n, { form: 'sop' | 'pos', steps, maxImplicants, maxWork })
//   -> { form, n, terms, primes, essential, literals, exact, method ('exact' | 'heuristic'), solutions: 1, several: false,
//        alternatives: [{ terms, literals }], steps: { columns } | null, chart: { minterms, primes } | null }
// A cube is { value, mask } (mask: the bits it leaves out, value: the others' values; bit n-1-j is input j).

const popcount = x => { let k = 0; while (x) { x &= x - 1; k++; } return k; };

/** The steps are kept (to be shown) up to this many implicants in all, the chart up to these primes and minterms. */
const STEPS_MAX = 400, CHART_MAX_PRIMES = 40, CHART_MAX_MINTERMS = 64;

/** The minterms of a cube, ascending (2^(its free bits) of them). */
export function cubeCells(c) {
  const free = [];
  for (let b = 1; b <= c.mask; b <<= 1) if (c.mask & b) free.push(b);
  const out = [];
  for (let k = 0; k < 1 << free.length; k++) {
    let m = c.value;
    for (let i = 0; i < free.length; i++) if (k >> i & 1) m |= free[i];
    out.push(m);
  }
  return out.sort((a, b) => a - b);
}

/** Literals of a cube: [{ v: input index, neg }] (as an SOP term's; a POS clause complements them). */
function cubeLits(c, n) {
  const out = [];
  for (let j = 0; j < n; j++) {
    const b = 1 << (n - 1 - j);
    if (!(c.mask & b)) out.push({ v: j, neg: !(c.value & b) });
  }
  return out;
}

/** A cube as QM writes it: one character per input, 0, 1 or - (left out). */
export const cubeText = (c, n) => Array.from({ length: n }, (_, j) => { const b = 1 << (n - 1 - j); return c.mask & b ? '-' : c.value & b ? '1' : '0'; }).join('');

// the prime implicants of on ∪ dc, by combining the implicants column by column (its columns kept when asked and small);
// null when more than `max` implicants are made
function primesOf(cells, n, max, keep) {
  let level = new Map([[0, new Set(cells)]]);
  const primes = [], columns = keep ? [] : null;
  let made = 0;
  while (level.size) {
    const next = new Map(), col = [];
    for (const [mask, vals] of [...level].sort((a, b) => a[0] - b[0])) {
      const used = new Set();
      for (const v of vals) {
        for (let j = 0; j < n; j++) {
          const b = 1 << j;
          if (mask & b || v & b || !vals.has(v | b)) continue;
          used.add(v); used.add(v | b);
          let s = next.get(mask | b);
          if (!s) next.set(mask | b, s = new Set());
          if (!s.has(v)) { s.add(v); if (++made > max) return null; }
        }
      }
      for (const v of vals) {
        if (!used.has(v)) primes.push({ value: v, mask });
        if (columns) col.push({ value: v, mask, combined: used.has(v) });
      }
    }
    if (columns) columns.push(col.sort((a, b) => popcount(a.value) - popcount(b.value) || a.value - b.value || a.mask - b.mask));
    level = next;
  }
  return { primes, columns: columns && cells.length + made <= STEPS_MAX ? columns : null };
}

// the cheapest cover of the minterms `on` by the primes (essentials first, then branch and bound over the rest, at
// most `maxWork` steps, a node one per minterm): { chosen (prime indices), essential (a Set), exact }
function coverOf(primes, on, size, maxWork) {
  const at = new Int32Array(size).fill(-1);
  on.forEach((m, i) => { at[m] = i; });
  const coverers = on.map(() => []), rows = primes.map(() => []);
  primes.forEach((p, pi) => { for (const m of cubeCells(p)) if (at[m] >= 0) { coverers[at[m]].push(pi); rows[pi].push(at[m]); } });
  const essential = new Set();
  for (const cs of coverers) if (cs.length === 1) essential.add(cs[0]);
  const count = new Int32Array(on.length);
  const add = (pi, d) => { for (const i of rows[pi]) count[i] += d; };
  for (const pi of essential) add(pi, 1);
  const chosen = [...essential];
  let lits = chosen.reduce((s, pi) => s + primes[pi].lits, 0), best = null, work = 0, exact = true;
  const lowerBound = () => {   // uncovered minterms no prime covers two of: each needs its own term
    const blocked = new Set();
    let k = 0;
    for (let i = 0; i < on.length; i++) {
      if (count[i] || coverers[i].some(pi => blocked.has(pi))) continue;
      k++; coverers[i].forEach(pi => blocked.add(pi));
    }
    return k;
  };
  const search = () => {
    if ((work += on.length) > maxWork) { exact = false; return; }
    let pick = -1;
    for (let i = 0; i < on.length; i++) if (!count[i] && (pick < 0 || coverers[i].length < coverers[pick].length)) pick = i;
    if (pick < 0) {
      if (!best || chosen.length < best.terms || (chosen.length === best.terms && lits < best.lits)) best = { terms: chosen.length, lits, set: [...chosen] };
      return;
    }
    const lb = chosen.length + lowerBound();
    if (best && (lb > best.terms || (lb === best.terms && lits >= best.lits))) return;
    for (const pi of coverers[pick]) {
      chosen.push(pi); lits += primes[pi].lits; add(pi, 1);
      search();
      add(pi, -1); lits -= primes[pi].lits; chosen.pop();
      if (!exact) return;
    }
  };
  search();
  if (exact) return { chosen: best.set, essential, exact };
  // cut short: the best found, else a greedy cover after the essentials (the prime covering the most minterms left)
  if (best) return { chosen: best.set, essential, exact: false };
  const set = [...essential], left = new Int32Array(on.length);
  for (const pi of set) for (const i of rows[pi]) left[i] = 1;
  let todo = on.length - left.reduce((s, x) => s + x, 0);
  while (todo > 0) {
    let bi = -1, bc = 0;
    primes.forEach((p, pi) => { const c = rows[pi].reduce((s, i) => s + (left[i] ? 0 : 1), 0); if (c > bc || (c === bc && c && p.lits < primes[bi].lits)) { bc = c; bi = pi; } });
    set.push(bi);
    for (const i of rows[bi]) if (!left[i]) { left[i] = 1; todo--; }
  }
  return { chosen: set, essential, exact: false };
}

// the cover heuristic (too many implicants to list): each minterm not yet covered, in order, grown into a prime (an input
// left out while the cube stays within the 1s and don't cares, the most significant first), then each term whose
// minterms the others cover dropped (the largest first)
function heuristicCover(on, ok, n) {
  const covered = new Uint8Array(ok.length), cubes = [];
  for (const m of on) {
    if (covered[m]) continue;
    const c = { value: m, mask: 0 };
    for (let j = n - 1; j >= 0; j--) {
      const b = 1 << j, half = { value: c.value ^ b, mask: c.mask };
      if (cubeCells(half).every(x => ok[x])) { c.mask |= b; c.value &= ~b; }
    }
    cubes.push(c);
    for (const x of cubeCells(c)) covered[x] = 1;
  }
  const count = new Int32Array(ok.length), isOn = new Uint8Array(ok.length);
  for (const m of on) isOn[m] = 1;
  for (const c of cubes) for (const x of cubeCells(c)) count[x]++;
  const order = cubes.map((c, i) => i).sort((a, b) => popcount(cubes[a].mask) - popcount(cubes[b].mask) || a - b);
  const drop = new Set();
  for (const i of order) {
    const cells = cubeCells(cubes[i]);
    if (cells.every(x => !isOn[x] || count[x] > 1)) { drop.add(i); for (const x of cells) count[x]--; }
  }
  return cubes.filter((c, i) => !drop.has(i));
}

/**
 * The Quine-McCluskey minimisation of a column (a string of 2^n characters 0, 1, X; row r's inputs are r's bits,
 * input 0 the most significant) in 'sop' (its 1s) or 'pos' (its 0s), its don't cares used. `steps`: keep the columns of
 * the implicants (up to STEPS_MAX of them) and the chart (up to CHART_MAX_PRIMES × CHART_MAX_MINTERMS) to show them.
 */
export function quineMcCluskey(colIn, n, { form = 'sop', steps = false, maxImplicants = 20000, maxWork = 2e7 } = {}) {
  const size = 2 ** n, s = String(colIn ?? '').toUpperCase();
  const target = form === 'pos' ? '0' : '1';
  const on = [], cells = [], ok = new Uint8Array(size);
  for (let r = 0; r < size; r++) {
    const c = s[r] === '-' ? 'X' : s[r];
    if (c === target) { on.push(r); cells.push(r); ok[r] = 1; } else if (c === 'X') { cells.push(r); ok[r] = 1; }
  }
  const lits = c => n - popcount(c.mask);
  const term = (c, ess) => ({ value: c.value, mask: c.mask, literals: cubeLits(c, n), minterms: cubeCells(c), essential: ess });
  const done = (terms, primes, essential, exact, method, extra) => {
    const literals = terms.reduce((a, t) => a + t.literals.length, 0);
    return { form, n, terms, primes, essential, literals, exact, method, solutions: 1, several: false, alternatives: [{ terms, literals }], steps: null, chart: null, ...extra };
  };
  if (!on.length) return done([], [], [], true, 'exact');
  const P = primesOf(cells, n, maxImplicants, steps);
  if (!P) {
    const cubes = heuristicCover(on, ok, n).sort((a, b) => lits(a) - lits(b) || a.value - b.value);
    const terms = cubes.map(c => term(c, false));
    return done(terms, cubes.map(c => ({ value: c.value, mask: c.mask, literals: cubeLits(c, n), essential: false })), [], false, 'heuristic');
  }
  const primes = P.primes.map(p => ({ ...p, lits: lits(p), lo: cubeCells(p)[0] })).sort((a, b) => a.lits - b.lits || a.lo - b.lo || a.mask - b.mask);
  const cov = coverOf(primes, on, size, maxWork);
  const terms = [...cov.chosen].sort((a, b) => a - b).map(pi => term(primes[pi], cov.essential.has(pi)));
  const essential = [...cov.essential].sort((a, b) => a - b).map(pi => term(primes[pi], true));
  const extra = {};
  if (steps) {
    extra.steps = P.columns && { columns: P.columns };
    if (primes.length <= CHART_MAX_PRIMES && on.length <= CHART_MAX_MINTERMS) extra.chart = { minterms: on, primes: primes.map(p => cubeCells(p).filter(m => ok[m] && s[m] !== 'X' && s[m] !== '-')) };
  }
  return done(terms, primes.map((p, pi) => ({ value: p.value, mask: p.mask, literals: cubeLits(p, n), essential: cov.essential.has(pi) })), essential, cov.exact, 'exact', extra);
}
