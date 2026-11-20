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

// #4809: a multiplexer's and a decoder's levels take their inputs the same way (the selects shared by their names)
test('#4809 an M8_1\'s upper M4_1 takes D4 … D7 and the selects below the top one; a D3_8E\'s upper D2_4E its enable from A2', () => {
  const mux = composition('mux8', { width: 1 }), D = derivedValues(mux), r = rng(4);
  for (let k = 0; k < 8; k++) {
    const d = r(8), s = r(3), top = { ...Object.fromEntries([...Array(8).keys()].map(i => [`D${i}`, bits(d, i, i)])), S0: bits(s, 0, 0), S1: bits(s, 1, 1), S2: bits(s, 2, 2) };
    assert.deepEqual(D.levelValues([{ module: 'M8_1' }, { module: 'M4_1', instance: 'U1' }], top).values,
      { D0: bits(d, 4, 4), D1: bits(d, 5, 5), D2: bits(d, 6, 6), D3: bits(d, 7, 7), S0: bits(s, 0, 0), S1: bits(s, 1, 1) });
    // the M2_1 choosing between the two halves: their outputs and S2
    assert.deepEqual(D.levelValues([{ module: 'M8_1' }, { module: 'M2_1', instance: 'U2' }], top).values, { D0: bits(d, Number(s & 3n), Number(s & 3n)), D1: bits(d, 4 + Number(s & 3n), 4 + Number(s & 3n)), S0: bits(s, 2, 2) });
  }
  const dec = composition('decoder', { n: 3, en: true }), DD = derivedValues(dec);
  for (const [a, e] of [[5n, 1n], [2n, 1n], [6n, 0n]]) {
    const top = { A0: a & 1n, A1: (a >> 1n) & 1n, A2: a >> 2n, E: e };
    assert.deepEqual(DD.levelValues([{ module: 'D3_8E' }, { module: 'D2_4E', instance: 'U2' }], top).values, { A0: a & 1n, A1: (a >> 1n) & 1n, E: e & (a >> 2n) }, `A = ${a}, E = ${e}`);
  }
});

// #4811: a counter's level below takes its inputs from the symbol's count (its output, forced: the composition's own
// simulation starts at 0), not from a register of its own
test('#4811 a CB8CE\'s INC8 takes the count Q of the symbol, and its carry in 1; forced outputs released on the next call', () => {
  const c = composition('counter', { width: 8, en: true, reset: 'async', dir: 'up' }), D = derivedValues(c);
  const path = [{ module: 'CB8CE' }, { module: 'INC8', instance: 'U0' }];
  assert.deepEqual(D.levelValues(path, { CE: 1n, C: 0n, CLR: 0n }, { Q: 0x5An }).values, { A: 0x5An, CI: 1n });
  assert.deepEqual(D.levelValues(path, { CE: 1n, C: 0n, CLR: 0n }, { Q: 0xFFn }).values, { A: 0xFFn, CI: 1n });
  assert.deepEqual(D.levelValues([...path, { module: 'INC4', instance: 'U1' }], { CE: 1n, C: 0n, CLR: 0n }, { Q: 0x5An }).values, { A: 5n, CI: 0n }, 'the upper nibble: no carry from A');
  assert.deepEqual(D.levelValues(path, { CE: 1n, C: 0n, CLR: 0n }).values, { A: 0n, CI: 1n }, 'no count given: the register\'s own, 0');
});
