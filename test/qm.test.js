// Quine-McCluskey (#3939, core/qm.js and core/logic-qm.js): the minimal SOP and POS against an independent reference
// (every function of 3 inputs with don't cares, random ones of 4, by a dynamic programme over the covers), the cover
// equal to the table on random functions of up to 16 inputs, the heuristic past the bound (each term prime, the console's
// "not proven minimal"), the steps of a textbook example, the edge cases, and the truth table's forms qsop / qpos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quineMcCluskey, cubeCells, cubeText } from '../core/qm.js';
import { qmForm, qmResults } from '../core/logic-qm.js';
import * as L from '../core/logic.js';

let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const randomCol = (n, p1 = 0.5, px = 0.1) => Array.from({ length: 2 ** n }, () => (rnd() < px ? 'X' : rnd() < p1 ? '1' : '0')).join('');
const popcount = x => { let k = 0; while (x) { x &= x - 1; k++; } return k; };

// the reference: the cheapest cover (fewest terms, then literals) of the target rows by cubes within the target rows and
// don't cares, every cube of 3^n tried, by a dynamic programme over the sets of target rows covered
function reference(col, n, form) {
  const t = form === 'pos' ? '0' : '1', on = [];
  for (let r = 0; r < 2 ** n; r++) if (col[r] === t) on.push(r);
  const cubes = [];
  for (let mask = 0; mask < 2 ** n; mask++) for (let value = 0; value < 2 ** n; value++) {
    if (value & mask) continue;
    const cells = cubeCells({ value, mask });
    if (cells.every(m => col[m] === t || col[m] === 'X')) cubes.push({ bits: cells.reduce((s, m) => (on.includes(m) ? s | (1 << on.indexOf(m)) : s), 0), lits: n - popcount(mask) });
  }
  const full = 2 ** on.length - 1, best = new Array(full + 1).fill(null);
  best[0] = [0, 0];
  const less = (a, b) => !b || a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  for (let s = 0; s <= full; s++) {
    if (!best[s]) continue;
    for (const c of cubes) { const s2 = s | c.bits; if (s2 === s) continue; const v = [best[s][0] + 1, best[s][1] + c.lits]; if (less(v, best[s2])) best[s2] = v; }
  }
  return best[full];
}

// the cover's value on row r: SOP, a term covers it; POS, every clause is 1 (its cube does not cover it)
const valueOf = (res, r) => (res.form === 'pos' ? !res.terms.some(c => (r & ~c.mask) === c.value) : res.terms.some(c => (r & ~c.mask) === c.value));
function assertCovers(res, col, n) {
  for (let r = 0; r < 2 ** n; r++) if (col[r] !== 'X') assert.equal(valueOf(res, r), col[r] === '1', `row ${r} of ${col}`);
}
const isPrime = (c, col, n, t) => {
  for (let j = 0; j < n; j++) {
    const b = 1 << j;
    if (c.mask & b) continue;
    if (cubeCells({ value: c.value & ~b, mask: c.mask | b }).every(m => col[m] === t || col[m] === 'X')) return false;
  }
  return true;
};

test('every function of 3 inputs (0, 1, X): the minimal SOP and POS as the reference, the cover equal to the table', () => {
  for (let k = 0; k < 3 ** 8; k++) {
    let col = '';
    for (let r = 0, x = k; r < 8; r++, x = Math.floor(x / 3)) col += '01X'[x % 3];
    for (const form of ['sop', 'pos']) {
      const r = quineMcCluskey(col, 3, { form });
      assert.equal(r.exact, true);
      assert.deepEqual([r.terms.length, r.literals], reference(col, 3, form), `${form} of ${col}`);
      assertCovers(r, col, 3);
    }
  }
});

test('random functions of 4 inputs: minimal as the reference; up to 6, as costly as the K-map\'s minimisation', () => {
  for (let i = 0; i < 40; i++) {
    const col = randomCol(4, 0.4);
    for (const form of ['sop', 'pos']) assert.deepEqual([quineMcCluskey(col, 4, { form }).terms.length, quineMcCluskey(col, 4, { form }).literals], reference(col, 4, form), col);
  }
  for (const n of [5, 6]) for (let i = 0; i < 60; i++) {
    const col = randomCol(n, [0.2, 0.5, 0.8][i % 3]);
    for (const form of ['sop', 'pos']) {
      const q = quineMcCluskey(col, n, { form }), m = L.minimize(col, n, { form });
      assert.equal(q.exact, true, `${n} inputs: ${col}`);
      assert.deepEqual([q.terms.length, q.literals], [m.terms.length, m.literals], `${form} of ${col}`);
      assertCovers(q, col, n);
    }
  }
});

test('random functions of 7 to 16 inputs: the cover equals the table, every term a prime implicant, bounded', () => {
  for (const n of [7, 8, 10, 12, 14, 16]) for (const p of [0.1, 0.5, 0.9]) {
    const col = randomCol(n, p);
    for (const form of ['sop', 'pos']) {
      const t0 = Date.now(), r = quineMcCluskey(col, n, { form });
      assert.ok(Date.now() - t0 < 5000, `${n} inputs: ${Date.now() - t0} ms`);
      assertCovers(r, col, n);
      for (const c of r.terms) assert.ok(isPrime(c, col, n, form === 'pos' ? '0' : '1'));
      assert.ok(['exact', 'heuristic'].includes(r.method));
      if (r.method === 'heuristic') assert.equal(r.exact, false);
    }
  }
});

test('structured functions of 16 inputs: parity exact (2^15 terms), an 8-bit adder\'s carry and a comparator equal to the table', () => {
  const fn = (n, f) => Array.from({ length: 2 ** n }, (_, r) => (f(r) ? '1' : '0')).join('');
  const parity = quineMcCluskey(fn(16, r => popcount(r) & 1), 16);
  assert.equal(parity.exact, true);
  assert.equal(parity.terms.length, 2 ** 15);
  for (const f of [r => (r >> 8) + (r & 255) > 255, r => r >> 8 > (r & 255)]) {
    const col = fn(16, f), r = quineMcCluskey(col, 16);
    assertCovers(r, col, 16);
    assert.equal(r.terms.length, 255);   // (g7 + p7·g6 + …: 255 products, as the textbook's)
  }
});

test('past the bound: the heuristic, the same result every time, not proven minimal; the search cut short likewise', () => {
  const col = randomCol(8, 0.5);
  const a = quineMcCluskey(col, 8, { maxImplicants: 50 }), b = quineMcCluskey(col, 8, { maxImplicants: 50 });
  assert.equal(a.method, 'heuristic');
  assert.equal(a.exact, false);
  assert.deepEqual(a.terms, b.terms);
  assertCovers(a, col, 8);
  for (const c of a.terms) assert.ok(isPrime(c, col, 8, '1'));
  const cut = quineMcCluskey(col, 8, { maxWork: 3 });
  assert.equal(cut.method, 'exact');
  assert.equal(cut.exact, false);
  assertCovers(cut, col, 8);
  assert.match(qmForm(L.normalizeTable({ name: 't', inputs: 'abcdefgh'.split(''), outputs: ['f'], table: { f: col } }), 'f', 'qsop').what, /^Quine-McCluskey SOP( \(not proven minimal\))?, \d+ literal\(s\)$/);
});

test('the steps of Σm(0, 1, 2, 5, 6, 7): the columns of the implicants, the chart, no essential prime (a cyclic chart), three terms', () => {
  const col = '11100111';
  const r = quineMcCluskey(col, 3, { steps: true });
  const text = c => cubeText(c, 3);
  assert.deepEqual(r.steps.columns.map(cs => cs.map(c => `${text(c)}${c.combined ? '✓' : ''}`)),
    [['000✓', '001✓', '010✓', '101✓', '110✓', '111✓'], ['00-', '0-0', '-01', '-10', '1-1', '11-']]);
  assert.equal(r.primes.length, 6);
  assert.deepEqual(r.essential, []);
  assert.deepEqual(r.chart.minterms, [0, 1, 2, 5, 6, 7]);
  assert.equal(r.chart.primes.length, 6);
  assert.equal(r.terms.length, 3);
  assert.equal(r.literals, 6);
  assert.equal(r.exact, true);
});

test('the essential primes of Σm(4, 8, 10, 11, 12, 15) + d(9, 14): -100 and 1-1-, then one of 10-- / 1--0', () => {
  const col = Array.from({ length: 16 }, (_, m) => ([4, 8, 10, 11, 12, 15].includes(m) ? '1' : [9, 14].includes(m) ? 'X' : '0')).join('');
  const r = quineMcCluskey(col, 4, { steps: true });
  assert.deepEqual(r.primes.map(p => cubeText(p, 4)).sort(), ['-100', '1--0', '1-1-', '10--'].sort());
  assert.deepEqual(r.essential.map(p => cubeText(p, 4)).sort(), ['-100', '1-1-']);
  assert.equal(r.terms.length, 3);
  assert.equal(r.chart.minterms.length, 6);   // (the don't cares are not the chart's)
});

test('edge cases: constant 0 and 1, one variable, every row a don\'t care', () => {
  const sop = (col, n) => L.formatExpr(L.minimalAst(quineMcCluskey(col, n), ['a', 'b']), 'slash');
  const pos = (col, n) => L.formatExpr(L.minimalAst(quineMcCluskey(col, n, { form: 'pos' }), ['a', 'b']), 'slash');
  assert.deepEqual([sop('0000', 2), pos('0000', 2)], ['0', '0']);
  assert.deepEqual([sop('1111', 2), pos('1111', 2)], ['1', '1']);
  assert.deepEqual([sop('XXXX', 2), pos('XXXX', 2)], ['0', '1']);
  assert.deepEqual([sop('01', 1), pos('01', 1)], ['a', 'a']);
  assert.deepEqual([sop('10', 1), pos('10', 1)], ['/a', '/a']);
  assert.deepEqual([sop('0011', 2), pos('0101', 2)], ['a', 'b']);
  const one = quineMcCluskey('1111', 2, { steps: true });
  assert.deepEqual([one.terms.length, one.literals, one.exact], [1, 0, true]);
});

test('the truth table: Quine-McCluskey\'s forms qsop and qpos (outputForm, its HDL, set_output_logic), 16 inputs, the K-map\'s up to 6', () => {
  assert.ok(L.FORMS.includes('qsop') && L.FORMS.includes('qpos'));
  const doc = L.normalizeTable({ name: 'mux', inputs: ['s', 'a', 'b'], outputs: ['y'], table: { y: '00110101' } });
  assert.equal(L.outputForm(doc, 'y', 'qsop').what, 'Quine-McCluskey SOP, 4 literal(s), 3 gate(s), delay 2');
  assert.equal(L.outputForm(doc, 'y', 'qpos').what, 'Quine-McCluskey POS, 4 literal(s), 3 gate(s), delay 2');
  assert.equal(L.formatExpr(L.outputForm(doc, 'y', 'qsop').ast, 'slash'), '/s.a + s.b');
  const v = L.generateTableHdl(L.setOutputLogic(doc, 'y', { form: 'qpos' }), 'vhdl').code;
  assert.match(v, /-- y = \(s \+ a\)·\(s' \+ b\)   \(Quine-McCluskey POS, 4 literal\(s\), 3 gate\(s\), delay 2\)/);
  assert.match(v, /y <= \(s or a\) and \(not s or b\);/);
  const A = L.analyzeOutput(doc, 'y');
  assert.equal(L.formatExpr(A.qm.sop.ast, 'slash'), '/s.a + s.b');
  assert.deepEqual(A.qm.pos.gates, A.pos.gates);
  // 16 inputs: a table, its analysis (no K-map, Quine-McCluskey's), 17 refused
  const ins = Array.from({ length: 16 }, (_, i) => `x${i}`);
  const big = L.normalizeTable({ name: 'big', inputs: ins, outputs: ['f'], table: { f: randomCol(16, 0.5, 0) } });
  assert.deepEqual(L.validateTable(big), []);
  assert.equal(L.minimize(big.table.f, 16).method, big.table.f && L.analyzeOutput(big, 'f').sop.method);
  assert.throws(() => L.kmapLayout(7), /Karnaugh maps need 1 to 6 variables/);
  assert.deepEqual(L.validateTable({ ...big, inputs: [...ins, 'x16'] }).map(e => e.message), ['a truth table has 1 to 16 inputs']);
  assert.deepEqual(qmResults(big.table.f, ins).sop.ast, L.analyzeOutput(big, 'f').sop.ast);
});
