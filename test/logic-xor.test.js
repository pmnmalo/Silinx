// Unit tests (#4765): core/logic-xor.js, the XOR / XNOR forms of a column (#435) moved out of core/logic.js, loaded on its
// own: the names core/logic.js exported before still exported by it (the same functions), and the forms checked against
// an independent reference, the column the expression computes, on every 2- to 4-input function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_XOR_INPUTS, exprCost, minimizeXor } from '../core/logic-xor.js';
import * as logic from '../core/logic.js';

const V = n => ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n);
// the value of an expression on a row (x0 the most significant bit), written here apart from core/logic.js's exprColumn
const evalAt = (e, inputs, r) => {
  const n = inputs.length;
  switch (e.t) {
    case 'var': return (r >> (n - 1 - inputs.indexOf(e.name))) & 1;
    case 'not': return 1 - evalAt(e.a, inputs, r);
    case 'and': return e.args.every(x => evalAt(x, inputs, r)) ? 1 : 0;
    case 'or': return e.args.some(x => evalAt(x, inputs, r)) ? 1 : 0;
    case 'xor': return e.args.reduce((k, x) => k ^ evalAt(x, inputs, r), 0);
    default: throw new Error(e.t);
  }
};

test('core/logic.js still exports the moved names, the same functions (#4765)', () => {
  assert.equal(logic.minimizeXor, minimizeXor);
  assert.equal(logic.exprCost, exprCost);
  assert.equal(logic.MAX_XOR_INPUTS, MAX_XOR_INPUTS);
  assert.equal(MAX_XOR_INPUTS, 6);
});

test('minimizeXor: parity is one XOR of every input; none for constants, 1 input or more than MAX_XOR_INPUTS', () => {
  for (let n = 2; n <= 5; n++) {
    const col = Array.from({ length: 1 << n }, (_, r) => { let k = 0; for (let x = r; x; x &= x - 1) k ^= 1; return String(k); }).join('');
    const x = minimizeXor(col, V(n));
    assert.deepEqual({ literals: x.literals, ops: x.ops, xor: x.xor, exact: x.exact }, { literals: n, ops: n - 1, xor: n - 1, exact: true });
  }
  assert.equal(minimizeXor('0000', V(2)), null);
  assert.equal(minimizeXor('1111', V(2)), null);
  assert.equal(minimizeXor('01', ['a']), null);
  assert.equal(minimizeXor('01'.repeat(64), V(7).concat('g').slice(0, 7)), null);
  assert.equal(minimizeXor('0001', V(2)), null);   // a AND b: no XOR form cheaper than the SOP
});

test('minimizeXor: on every 2-, 3- and 4-input function (the 4-input ones sampled) the form equals the column and is cheaper', () => {
  let found = 0;
  for (const n of [2, 3, 4]) {
    const rows = 1 << n, count = n === 4 ? 400 : 1 << rows;
    for (let i = 0; i < count; i++) {
      const f = n === 4 ? (i * 2654435761) >>> 16 : i;
      const col = Array.from({ length: rows }, (_, r) => String((f >> r) & 1)).join('');
      const x = minimizeXor(col, V(n), { timeMs: Infinity });
      if (!x) continue;
      found++;
      for (let r = 0; r < rows; r++) assert.equal(String(evalAt(x.ast, V(n), r)), col[r], `${col} row ${r}`);
      const sop = logic.minimalAst(logic.minimize(col, n, { form: 'sop' }), V(n));
      const c = exprCost(sop);
      assert.ok(x.literals * 1024 + x.ops < c.literals * 1024 + c.ops, `${col} cheaper than its SOP`);
    }
  }
  assert.ok(found > 50, `${found} XOR forms`);
});

test('exprCost: literals and two-input operators, NOT free', () => {
  const e = { t: 'or', args: [{ t: 'and', args: [{ t: 'var', name: 'a' }, { t: 'not', a: { t: 'var', name: 'b' } }] },
    { t: 'xor', args: [{ t: 'var', name: 'a' }, { t: 'var', name: 'b' }, { t: 'var', name: 'c' }] }] };
  assert.deepEqual(exprCost(e), { literals: 5, xor: 2, and: 1, or: 1, ops: 4 });
});
