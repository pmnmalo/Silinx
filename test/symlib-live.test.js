// A composition's values from its symbol's pins (#4808, core/symlib-live.js): each level's inputs, the levels above
// it simulated with the symbol's, against the arithmetic they must be (an ADD8's blocks take their operands' bits and
// the carries of the blocks below; a SUB8's adder takes B inverted); unknown values left out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { composition } from '../core/symlib.js';
import { derivedValues, knownValue, savedInputs } from '../core/symlib-live.js';
import { buildLiveSim } from '../core/schlive.js';

const bits = (v, hi, lo) => (v >> BigInt(lo)) & ((1n << BigInt(hi - lo + 1)) - 1n);
const rng = (seed = 5) => (n) => { let v = 0n; for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) % 2147483648; v = (v << 1n) | BigInt((seed >> 16) & 1); } return v; };

test('#4808 an ADD8\'s levels: each ADD4 its operands\' nibbles and the carry of the one below, each FA1 its bits', () => {
  const c = composition('add', { width: 8, cin: true, cout: true }), D = derivedValues(c), r = rng();
  for (let k = 0; k < 12; k++) {
    const A = r(8), B = r(8), CI = r(1), top = { A, B, CI };
    assert.deepEqual(D.levelValues([{ module: 'ADD8', instance: null }], top), { values: top, error: null }, 'the top: the symbol\'s');
    const c4 = (A & 15n) + (B & 15n) + CI >> 4n;
    assert.deepEqual(D.levelValues([{ module: 'ADD8' }, { module: 'ADD4', instance: 'U0' }], top).values, { A: A & 15n, B: B & 15n, CI });
    assert.deepEqual(D.levelValues([{ module: 'ADD8' }, { module: 'ADD4', instance: 'U1' }], top).values, { A: A >> 4n, B: B >> 4n, CI: c4 });
    // bit 6: the FA1 U2 of U1, its carry in that of bits 5:0
    const c6 = (bits(A, 5, 0) + bits(B, 5, 0) + CI) >> 6n;
    assert.deepEqual(D.levelValues([{ module: 'ADD8' }, { module: 'ADD4', instance: 'U1' }, { module: 'FA1', instance: 'U2' }], top).values, { A: bits(A, 6, 6), B: bits(B, 6, 6), CI: c6 });
  }
});

test('#4808 a SUB8: its adder takes A, B inverted and the borrow in inverted; the level simulated gives A − B − BI', () => {
  const c = composition('sub', { width: 8, bin: true, bout: true }), D = derivedValues(c), r = rng(9);
  for (let k = 0; k < 8; k++) {
    const A = r(8), B = r(8), BI = r(1);
    const v = D.levelValues([{ module: 'SUB8' }, { module: 'ADD8', instance: 'U0' }], { A, B, BI }).values;
    assert.deepEqual(v, { A, B: ~B & 255n, CI: 1n - BI });
    // the level itself, simulated as Try it does with these inputs: its sum
    const add = c.modules.find(m => m.name === 'ADD8'), L = buildLiveSim(add.doc, { modules: D.modules, sources: D.sources, lang: 'vhdl' }).live;
    L.restoreInputs(savedInputs(add, v));
    assert.equal(L.portValue(add.doc.ports.find(p => p.name === 'S').id).v, BigInt.asUintN(8, A - B - BI));
  }
});

test('#4808 unknown values (X, Z) left out; a wrong instance said', () => {
  assert.equal(knownValue({ w: 4, v: 5n, x: 0n }), 5n);
  assert.equal(knownValue({ w: 4, v: 0n, x: 1n }), null);
  assert.equal(knownValue(null), null);
  const c = composition('add', { width: 4, cin: true, cout: true });
  assert.deepEqual(Object.values(savedInputs(c.modules[0], { A: 3n, B: null, CI: 1n })).map(x => `${x.width}:${x.value}`), ['4:3', '1:1']);
  assert.deepEqual(derivedValues(c).levelValues([{ module: 'ADD4' }, { module: 'FA1', instance: 'U9' }], { A: 1n, B: 1n, CI: 0n }), { values: {}, error: 'no instance U9 in ADD4' });
});
