// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The notation of the Boolean expressions Silinx shows (#3915, core/expr-notation.js): a truth table's expressions and a
// condition in each of the five notations, exactly; read back by the parsers (core/logic.js, core/asm-expr.js) as the
// same function, on random expressions against an evaluation written here; the overbar (core/overline.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTATIONS, NOTATION_IDS, DEFAULT_NOTATION, notationOf, showExpr, showCond, showCondText } from '../core/expr-notation.js';
import { OVERLINE, overline, overlineToSlash } from '../core/overline.js';
import { parseExpr, formatExpr } from '../core/logic.js';
import { parseCondition } from '../core/asm-expr.js';
import { evalCond } from '../core/fsm.js';

const B = OVERLINE;

test('#3915 the notations: five, Electronics / Engineering the default', () => {
  assert.deepEqual(NOTATIONS.map(([id, name, ex]) => `${id}: ${name}: ${ex}`), [
    `engineering: Electronics / Engineering: a${B}.b + c`, 'slash: Text only: /a.b + c', 'logic: Logic / Set theory: ¬a ∧ b ∨ c',
    'vhdl: VHDL: (not a and b) or c', 'verilog: Verilog: (~a & b) | c']);
  assert.equal(DEFAULT_NOTATION, 'engineering');
  assert.equal(notationOf('logic'), 'logic');
  for (const v of [undefined, null, '', 'latex', 'textbook', 42]) assert.equal(notationOf(v), 'engineering', String(v));
});

test('#3915 the overbar: one per character, its blanks too; read back as /( … ), nested bars inside', () => {
  assert.equal(overline('a'), `a${B}`);
  assert.equal(overline('a + b'), `a${B} ${B}+${B} ${B}b${B}`);
  assert.equal(overline(overline('a')), `a${B}${B}`);
  assert.equal(overlineToSlash('a.b + c'), 'a.b + c');
  assert.equal(overlineToSlash(`a${B}·b + c`), '/(a)·b + c');
  assert.equal(overlineToSlash(`a${B}·${B}b${B}`), '/(a·b)');
  assert.equal(overlineToSlash(`a${B}·b${B}`), '/(a)·/(b)');
  assert.equal(overlineToSlash(`a${B}${B}·${B}b${B}`), '/(/(a)·b)');
  // (AND written a point, #4094: the middle dot of the texts written before still read, the same function)
  assert.equal(overlineToSlash(`a${B}.${B}b${B}`), '/(a.b)');
  const inputs = ['a', 'b', 'c'];
  assert.equal(formatExpr(parseExpr(`a${B}·b + c${B}·a`, { inputs }), 'slash'), formatExpr(parseExpr(`a${B}.b + c${B}.a`, { inputs }), 'slash'));
  assert.equal(overlineToSlash(`go${B}`), 'g/(o)');   // (a bar over part of a name: the parsers' error)
  assert.equal(overlineToSlash(`${B}a`), 'a');        // (a bar over nothing: none)
  // a deep one: no recursion, its bars capped (the parsers' nesting error beyond)
  const deep = overlineToSlash(`a${B.repeat(100000)}`);
  assert.equal(deep, `${'/('.repeat(200)}a${')'.repeat(200)}`);
});

// ---- the truth table's expressions
const VARS = ['a', 'b', 'c'];
const L = (s) => parseExpr(s, { vars: VARS });

test('#3915 a truth table\'s expressions in each notation', () => {
  const cases = {
    '/a.b + c': [`a${B}.b + c`, '/a.b + c', '¬a ∧ b ∨ c', '(not a and b) or c', '(~a & b) | c'],
    '/(a + b).c': [`a${B} ${B}+${B} ${B}b${B}.c`, '/(a + b).c', '¬(a ∨ b) ∧ c', 'not (a or b) and c', '~(a | b) & c'],
    'a ^ /b ^ c': [`a ⊕ b${B} ⊕ c`, 'a ⊕ /b ⊕ c', 'a ⊕ ¬b ∨ c'.replace(' ∨ ', ' ⊕ '), 'a xor not b xor c', 'a ^ ~b ^ c'],
    '//a': [`a${B}${B}`, '//a', '¬¬a', 'not (not a)', '~(~a)'],
    '(a + b).(b + c)': ['(a + b).(b + c)', '(a + b).(b + c)', '(a ∨ b) ∧ (b ∨ c)', '(a or b) and (b or c)', '(a | b) & (b | c)'],
  };
  for (const [src, want] of Object.entries(cases)) {
    assert.deepEqual(NOTATION_IDS.map((n) => showExpr(L(src), n)), want, src);
  }
  // the NAND and NOR gates: a bar over the group
  assert.equal(showExpr({ t: 'nand', args: [{ t: 'var', name: 'a' }, { t: 'var', name: 'b' }] }, 'engineering'), `a${B}.${B}b${B}`);
  assert.equal(showExpr({ t: 'nor', args: [{ t: 'var', name: 'a' }] }, 'logic'), '¬(a ∨ a)');
  // the older notations: formatExpr's
  assert.equal(showExpr(L('/a.b + c'), 'textbook'), formatExpr(L('/a.b + c'), 'textbook'));
});

// expressions over a, b, c at random, evaluated here (not by core/logic.js)
function rng(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
function randomExpr(r, d = 0) {
  const k = d > 4 ? 0 : Math.floor(r() * 6);
  if (k <= 1) return { t: 'var', name: VARS[Math.floor(r() * 3)] };
  if (k === 2) return { t: 'not', a: randomExpr(r, d + 1) };
  const t = ['and', 'or', 'xor'][k - 3];
  return { t, args: [randomExpr(r, d + 1), randomExpr(r, d + 1), ...(r() < 0.3 ? [randomExpr(r, d + 1)] : [])] };
}
const ev = (e, v) => (e.t === 'var' ? v[e.name] : e.t === 'const' ? e.v : e.t === 'not' ? 1 - ev(e.a, v)
  : e.t === 'and' ? e.args.reduce((x, a) => x & ev(a, v), 1) : e.t === 'or' ? e.args.reduce((x, a) => x | ev(a, v), 0) : e.args.reduce((x, a) => x ^ ev(a, v), 0));
const column = (e) => Array.from({ length: 8 }, (_, k) => ev(e, { a: (k >> 2) & 1, b: (k >> 1) & 1, c: k & 1 })).join('');

test('#3915 a truth table\'s expression shown in each notation reads back as the same function (300 at random)', () => {
  const r = rng(3915);
  for (let i = 0; i < 300; i++) {
    const e = randomExpr(r);
    for (const n of NOTATION_IDS) {
      const s = showExpr(e, n);
      assert.equal(column(L(s)), column(e), `${n}: ${s}`);
    }
  }
});

// ---- a condition's
const C = (s) => { const p = parseCondition(s); assert.equal(p.error, undefined, `${s}: ${p.error}`); return p.ast; };

test('#3915 a condition in each notation: the comparisons, the arithmetic and the literals kept', () => {
  const cases = {
    "a.b' + /c": [`a.b${B} + c${B}`, 'a./b + /c', 'a ∧ ¬b ∨ ¬c', '(a and not b) or not c', '(a & ~b) | ~c'],
    '!(a || b) && !c': [`a${B} ${B}+${B} ${B}b${B}.c${B}`, '/(a + b)./c', '¬(a ∨ b) ∧ ¬c', 'not (a or b) and not c', '~(a | b) & ~c'],
    'n + 1 >= 8 && a': ['((n + 1) >= 8).a', '((n + 1) >= 8).a', '((n + 1) >= 8) ∧ a', '((n + 1) >= 8) and a', '((n + 1) >= 8) & a'],
    '(a || b) == c': ['(a OR b) == c', '(a OR b) == c', '(a ∨ b) == c', '(a or b) = c', '(a | b) == c'],
    "x != 4'b1010 && v[2]": ["(x != 4'b1010).v[2]", "(x != 4'b1010).v[2]", "(x != 4'b1010) ∧ v[2]", "(x /= 4'b1010) and v[2]", "(x != 4'b1010) & v[2]"],
    'a ^ !(b & c)': [`a ⊕ b${B}.${B}c${B}`, 'a ⊕ /(b.c)', 'a ⊕ ¬(b ∧ c)', 'a xor not (b and c)', 'a ^ ~(b & c)'],
  };
  for (const [src, want] of Object.entries(cases)) assert.deepEqual(NOTATION_IDS.map((n) => showCond(C(src), n)), want, src);
  // a transition's text: the otherwise words and a condition not valid as typed
  assert.equal(showCondText('else', 'logic'), 'else');
  assert.equal(showCondText('', 'logic'), '');
  assert.equal(showCondText('a b', 'logic'), 'a b');
  assert.equal(showCondText('a && !b', 'engineering'), `a.b${B}`);
});

function randomCond(r, d = 0) {
  const k = d > 4 ? 0 : Math.floor(r() * 8);
  if (k <= 1) return { k: 'id', name: VARS[Math.floor(r() * 3)] };
  if (k === 2) return { k: 'un', op: r() < 0.5 ? '!' : '~', a: randomCond(r, d + 1) };
  if (k === 3) return { k: 'bin', op: ['==', '!=', '<', '>='][Math.floor(r() * 4)], a: { k: 'bin', op: '+', a: { k: 'id', name: 'n' }, b: { k: 'lit', v: BigInt(Math.floor(r() * 4)), w: null, base: 'd' } }, b: { k: 'lit', v: BigInt(Math.floor(r() * 8)), w: null, base: 'd' } };
  return { k: 'bin', op: ['&&', '||', '&', '|', '^'][k - 4], a: randomCond(r, d + 1), b: randomCond(r, d + 1) };
}

test('#3915 a condition shown in each notation reads back with the same truth table (300 at random, a 3-bit n)', () => {
  const r = rng(77);
  const W = (x) => (x === 'n' ? 3 : 1);
  const envs = [];
  for (let k = 0; k < 64; k++) envs.push({ a: BigInt((k >> 5) & 1), b: BigInt((k >> 4) & 1), c: BigInt((k >> 3) & 1), n: BigInt(k & 7) });
  const truth = (ast) => envs.map((e) => (evalCond(ast, e, W) ? 1 : 0)).join('');
  for (let i = 0; i < 300; i++) {
    const ast = randomCond(r);
    const want = truth(ast);
    for (const n of NOTATION_IDS) {
      const s = showCond(ast, n);
      assert.equal(truth(C(s)), want, `${n}: ${s}`);
    }
  }
});
