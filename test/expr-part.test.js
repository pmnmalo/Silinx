// core/expr-part.js (#3939, moved from web/js/tt-results.js, #4150): an expression shown in part, its first MAX_NODES
// operators and literals then '…'; its size as written (a one-input NAND / NOR's input twice) and its literals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_NODES, litsOf, part, sizeOf } from '../core/expr-part.js';
import { formatExpr, parseExpr } from '../core/logic.js';

const v = (name) => ({ t: 'var', name });

test('sizeOf and litsOf: every node, a tied NAND\'s input twice; its literals once', () => {
  const e = parseExpr('/a.b + c', { inputs: ['a', 'b', 'c'] });
  assert.deepEqual([sizeOf(e), litsOf(e)], [6, 3]);
  const tied = { t: 'nand', args: [{ t: 'and', args: [v('a'), v('b')] }] };
  assert.deepEqual([sizeOf(tied), litsOf(tied)], [7, 2], '/(a.b . a.b): its input written twice');
  assert.equal(MAX_NODES, 10000);
});

test('part: the first n operators and literals as written, \'…\' for the rest; whole when small', () => {
  const e = { t: 'or', args: Array.from({ length: 6 }, (_, i) => ({ t: 'and', args: [v(`a${i}`), v(`b${i}`)] })) };
  assert.equal(formatExpr(part(e, { n: 7 }), 'slash'), 'a0.b0 + a1.b1 + …');
  assert.equal(formatExpr(part(e, { n: 100 }), 'slash'), formatExpr(e, 'slash'));
  const nand = { t: 'nand', args: [{ t: 'nand', args: [v('a'), v('b')] }] };
  assert.equal(formatExpr(part(nand, { n: 100 }), 'slash'), formatExpr(nand, 'slash'));
});

test('part (#4150): nested tied NANDs / NORs within the budget as written, not twice per level after the fact', () => {
  // a chain of 20 tied NANDs over a wide AND: written in full 2^20 times its input
  let e = { t: 'and', args: Array.from({ length: 50 }, (_, i) => v(`x${i}`)) };
  for (let i = 0; i < 20; i++) e = { t: 'nand', args: [e] };
  assert.ok(sizeOf(e) > 1e7, 'in full: tens of millions of nodes written');
  for (const n of [100, 1000, 10000]) {
    const p = part(e, { n });
    assert.ok(sizeOf(p) <= n * 1.1 + 40, `${n}: ${sizeOf(p)} written`);   // (each level one node more, and its "…")
    assert.ok(formatExpr(p, 'slash').length < n * 6, `${n}: its text bounded`);
  }
});
